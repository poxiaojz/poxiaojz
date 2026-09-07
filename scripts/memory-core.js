"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MEMORY_FILES = ["ERRORS.md", "LEARNINGS.md"];
const DEFAULT_MAX_ITEMS = 12;
const MAX_FILE_BYTES = 1024 * 1024;
const RESOLVED_STATUSES = new Set(["resolved", "promoted", "wont_fix"]);
const VALID_STATUSES = new Set(["pending", "in_progress", "resolved", "promoted", "wont_fix"]);
const PRIORITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };

function expandPath(value) {
  const home = os.homedir();
  if (!value) return path.join(home, ".learnings");

  let expanded = String(value).trim();
  if (expanded === "~") expanded = home;
  if (expanded.startsWith("~/") || expanded.startsWith("~\\")) {
    expanded = path.join(home, expanded.slice(2));
  }
  expanded = expanded.replace(/^%USERPROFILE%/i, process.env.USERPROFILE || home);
  return path.resolve(expanded);
}

function resolveScopes(projectRoot, globalDirectory) {
  const projectDir = path.join(path.resolve(projectRoot || process.cwd()), ".learnings");
  const globalDir = expandPath(globalDirectory || process.env.CLAUDE_ERROR_MEMORY_DIR);
  const scopes = [{ name: "project", directory: projectDir }];
  if (path.normalize(projectDir) !== path.normalize(globalDir)) {
    scopes.push({ name: "global", directory: globalDir });
  }
  return scopes;
}

function redact(value) {
  return String(value ?? "")
    .replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/gi, "[private-key redacted]")
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, "[github-token redacted]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[github-token redacted]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[aws-key redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\-/]+=*/gi, "Bearer [redacted]")
    .replace(/([?&](?:api[_-]?key|token|password|secret[_-]?key|secret)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(api[_-]?key|token|password|secret[_-]?key|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

function readText(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
      return { content: "", errors: [`File is missing, not a regular file, or exceeds ${MAX_FILE_BYTES} bytes: ${filePath}`] };
    }
    return { content: fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").replace(/\r/g, ""), errors: [] };
  } catch (error) {
    if (error.code === "ENOENT") return { content: "", errors: [] };
    return { content: "", errors: [`Unable to read ${filePath}: ${error.message}`] };
  }
}

function field(block, name, fallback = "") {
  const pattern = new RegExp(`^\\*\\*${name}\\*\\*:\\s*(.+)$`, "mi");
  return (block.match(pattern) || ["", fallback])[1].trim();
}

function section(block, heading) {
  const lines = block.split("\n");
  const start = lines.findIndex((line) => line.trim() === "### " + heading);
  if (start < 0) return "";
  const result = [];
  for (const line of lines.slice(start + 1)) {
    if (/^###\s/.test(line) || /^---\s*$/.test(line)) break;
    result.push(line);
  }
  return result.join("\n").trim();
}

function listField(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEntries(filePath, content, scopeName) {
  const source = String(content || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const headers = Array.from(source.matchAll(/^## \[([A-Z]+-\d{8}-[A-Z0-9]+)\]\s*(.+)$/gm));
  const errors = [];
  const entries = headers.map((header, index) => {
    const start = header.index;
    const end = index + 1 < headers.length ? headers[index + 1].index : source.length;
    const block = source.slice(start, end).trim();
    const line = source.slice(0, start).split("\n").length;
    const id = header[1];
    const type = id.startsWith("ERR-") ? "error" : "learning";
    const summary = section(block, "Summary") || header[2].trim();
    const entry = {
      id,
      title: header[2].trim(),
      type,
      status: field(block, "Status", "unknown").toLowerCase(),
      priority: field(block, "Priority").toLowerCase(),
      area: field(block, "Area"),
      logged: field(block, "Logged"),
      tags: listField(field(block, "Tags")),
      files: listField(field(block, "Files") || field(block, "Related Files")),
      tools: listField(field(block, "Tools")),
      environment: listField(field(block, "Environment")),
      summary,
      verified: /^-[ \t]+Verified:[ \t]+yes[ \t]*$/mi.test(section(block, "Metadata")),
      hasSummary: Boolean(section(block, "Summary")),
      details: section(block, "Error") || section(block, "Details"),
      context: section(block, "Context"),
      fix: section(block, "Suggested Fix") || section(block, "Recommended Approach"),
      block,
      filePath,
      file: path.basename(filePath),
      scopeName,
      line,
      date: id.match(/^[A-Z]+-(\d{8})-/)?.[1] || "00000000",
    };
    return entry;
  });

  if (headers.length === 0 && source.trim()) {
    errors.push(`${filePath}: no valid entries found; expected headings like ## [ERR-YYYYMMDD-XXX] title`);
  }
  return { entries, errors };
}

function readScope(scope) {
  const entries = [];
  const errors = [];
  for (const file of MEMORY_FILES) {
    const filePath = path.join(scope.directory, file);
    const result = readText(filePath);
    errors.push(...result.errors);
    const parsed = parseEntries(filePath, result.content, scope.name);
    entries.push(...parsed.entries);
    errors.push(...parsed.errors);
  }
  return { entries, errors };
}

function collectEntries(projectRoot, globalDirectory) {
  const scopes = resolveScopes(projectRoot, globalDirectory);
  const entries = [];
  const errors = [];
  for (const scope of scopes) {
    const result = readScope(scope);
    entries.push(...result.entries);
    errors.push(...result.errors);
  }
  return { entries, errors, scopes };
}

function validResolution(verified, fix) {
  return verified === true && typeof fix === "string" && Boolean(fix.trim()) && fix.trim() !== "Not provided.";
}

function validateEntries(entries) {
  const issues = [];
  const ids = new Map();
  for (const entry of entries) {
    if (!VALID_STATUSES.has(entry.status)) issues.push(`${entry.file}:${entry.line} ${entry.id}: missing or unknown Status`);
    if (!Object.hasOwn(PRIORITY_WEIGHT, entry.priority)) issues.push(`${entry.file}:${entry.line} ${entry.id}: invalid Priority "${entry.priority}"`);
    if (!entry.hasSummary) issues.push(`${entry.file}:${entry.line} ${entry.id}: missing Summary`);
    if (["resolved", "promoted"].includes(entry.status) && !validResolution(entry.verified, entry.fix)) {
      issues.push(`${entry.file}:${entry.line} ${entry.id}: resolved/promoted requires Verified: yes and a Suggested Fix`);
    }
    if (ids.has(entry.id)) issues.push(`${entry.file}:${entry.line} ${entry.id}: duplicate ID also found in ${ids.get(entry.id)}`);
    ids.set(entry.id, `${entry.file}:${entry.line}`);
  }
  return issues;
}

function tokenize(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}_./:-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function scoreEntry(entry, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const searchable = [entry.title, entry.summary, entry.details, entry.context, entry.fix].join(" ").toLowerCase();
  const metadata = [...entry.tags, ...entry.files, ...entry.tools, ...entry.environment].join(" ").toLowerCase();
  const tokens = tokenize(normalizedQuery);
  let score = entry.scopeName === "project" ? 2 : 0;
  score += (PRIORITY_WEIGHT[entry.priority] || 0) * 2;
  if (!RESOLVED_STATUSES.has(entry.status)) score += 5;
  if (!normalizedQuery) return score;
  if (searchable.includes(normalizedQuery)) score += 20;
  for (const token of tokens) {
    if (entry.title.toLowerCase().includes(token)) score += 10;
    if (metadata.includes(token)) score += 8;
    if (searchable.includes(token)) score += 3;
  }
  return score;
}

function searchEntries(entries, query, limit = DEFAULT_MAX_ITEMS) {
  const normalizedQuery = String(query || "").trim();
  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, normalizedQuery) }))
    .filter((item) => !normalizedQuery || item.score > entryBaseScore(item.entry))
    .sort((a, b) => b.score - a.score || b.entry.date.localeCompare(a.entry.date))
    .slice(0, Math.max(1, Number(limit) || DEFAULT_MAX_ITEMS))
    .map((item) => ({ ...item.entry, score: item.score }));
}

function entryBaseScore(entry) {
  let score = entry.scopeName === "project" ? 2 : 0;
  score += (PRIORITY_WEIGHT[entry.priority] || 0) * 2;
  if (!RESOLVED_STATUSES.has(entry.status)) score += 5;
  return score;
}

function formatEntry(entry) {
  const match = [entry.tags, entry.files, entry.tools, entry.environment].flat().filter(Boolean).join(", ");
  return redact(`- [${entry.scopeName}] [${entry.id}] ${entry.status}/${entry.priority}: ${redact(entry.summary)}${match ? ` (${match})` : ""}`);
}

function makeId(type, entries, now = new Date()) {
  const prefix = type === "learning" ? "LRN" : "ERR";
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
    const id = `${prefix}-${date}-${suffix}`;
    if (!entries.some((entry) => entry.id === id)) return id;
  }
  throw new Error("Unable to generate a unique memory ID");
}

function csv(value) {
  return Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value || "");
}

function renderRecord(input, id, now = new Date()) {
  const type = input.type === "learning" ? "learning" : "error";
  const detailHeading = type === "learning" ? "Details" : "Error";
  const lines = [
    `## [${id}] ${redact(input.title)}`,
    `**Logged**: ${now.toISOString()}`,
    `**Priority**: ${redact(input.priority || "medium")}`,
    `**Status**: ${redact(input.status || "pending")}`,
    `**Area**: ${redact(input.area || "docs")}`,
  ];
  for (const [label, value] of [["Tags", input.tags], ["Files", input.files], ["Tools", input.tools], ["Environment", input.environment]]) {
    if (csv(value)) lines.push(`**${label}**: ${redact(csv(value))}`);
  }
  lines.push(
    "",
    "### Summary",
    redact(input.summary),
    "",
    `### ${detailHeading}`,
    redact(input.details || "Not provided."),
    "",
    "### Context",
    redact(input.context || "Not provided."),
    "",
    "### Suggested Fix",
    redact(input.fix || "Not provided."),
    "",
    "### Metadata",
    `- Verified: ${input.verified ? "yes" : "no"}`,
    "",
    "---",
    "",
  );
  return lines.join("\n");
}

function recordEntry(input, projectRoot, globalDirectory) {
  if (!input.title || !input.summary) throw new Error("record requires --title and --summary");
  if (input.type && !["error", "learning"].includes(input.type)) throw new Error("Invalid type");
  if (input.scope && !["project", "global"].includes(input.scope)) throw new Error("Invalid scope");
  if (!VALID_STATUSES.has(input.status || "pending")) throw new Error("Invalid status");
  if (!Object.hasOwn(PRIORITY_WEIGHT, input.priority || "medium")) throw new Error("Invalid priority");
  if (["resolved", "promoted"].includes(input.status) && !validResolution(input.verified, input.fix)) {
    throw new Error("Resolved records require --verified and --fix");
  }
  for (const key of ["title", "status", "priority", "area", "tags", "files", "tools", "environment"]) {
    if (/[\r\n]/.test(csv(input[key]))) throw new Error(key + " must be a single line");
  }
  const collected = collectEntries(projectRoot, globalDirectory);
  const scopes = collected.scopes;
  const scopeName = input.scope === "global" ? "global" : "project";
  const scope = scopes.find((item) => item.name === scopeName) || scopes[0];
  const file = input.type === "learning" ? "LEARNINGS.md" : "ERRORS.md";
  const filePath = path.join(scope.directory, file);

  const id = makeId(input.type, collected.entries);
  const read = readText(filePath);
  if (read.errors.length) throw new Error("Refusing to write: " + read.errors.join("; "));
  const content = read.content;
  const block = renderRecord(input, id);
  const separator = content && !content.endsWith("\n") ? "\n" : "";
  fs.mkdirSync(scope.directory, { recursive: true });
  // Append instead of rewriting the existing history.
  fs.appendFileSync(filePath, `${separator}${block}`, "utf8");
  return { id, filePath, block };
}

function updateStatus(id, status, projectRoot, globalDirectory, options = {}) {
  if (!/^(ERR|LRN)-\d{8}-[A-Z0-9]+$/.test(id)) throw new Error("Invalid ID");
  if (!VALID_STATUSES.has(status)) throw new Error("Invalid status");
  const collected = collectEntries(projectRoot, globalDirectory);
  if (collected.errors.length) throw new Error("Refusing to update: " + collected.errors.join("; "));
  const matches = collected.entries.filter((entry) => entry.id === id);
  if (matches.length !== 1) throw new Error(matches.length ? "Ambiguous duplicate ID" : "Memory entry not found: " + id);
  const entry = matches[0];
  const verified = options.verified === true || entry.verified;
  const fix = options.fix === undefined ? entry.fix : redact(options.fix);
  if (["resolved", "promoted"].includes(status) && !validResolution(verified, fix)) {
    throw new Error("Resolved records require --verified and --fix (or existing Verified: yes and Suggested Fix)");
  }
  // Restrict edits to this entry, including when another entry lacks a Status.
  const source = fs.readFileSync(entry.filePath, "utf8");
  const header = new RegExp("^\\uFEFF?## \\[" + id + "\\][^\\r\\n]*", "m").exec(source);
  if (!header) throw new Error("Entry changed while updating");
  const start = header.index;
  const tail = source.slice(start + header[0].length);
  const following = /^## \[/m.exec(tail);
  const end = following ? start + header[0].length + following.index : source.length;
  let block = source.slice(start, end);
  if (!/^\*\*Status\*\*:[^\r\n]*/m.test(block)) throw new Error("Missing Status field");
  block = block.replace(/^\*\*Status\*\*:[^\r\n]*/m, () => "**Status**: " + status);
  const newline = block.includes("\r\n") ? "\r\n" : "\n";
  if (options.fix !== undefined) {
    const replacement = "### Suggested Fix" + newline + fix.trim() + newline + newline;
    const fixSection = /^### Suggested Fix[ \t]*\r?\n[\s\S]*?(?=^### |^---[ \t]*\r?$|(?![\s\S]))/m;
    if (fixSection.test(block)) block = block.replace(fixSection, () => replacement);
    else block = block.replace(/(\r?\n---[ \t]*(?:\r?\n)?[ \t\r\n]*)?$/, () => newline + replacement + "---" + newline);
  }
  if (options.verified === true) {
    const metadata = /^### Metadata[ \t]*\r?\n[\s\S]*?(?=^### |^---[ \t]*\r?$|(?![\s\S]))/m;
    if (metadata.test(block)) {
      block = block.replace(metadata, (part) => {
        const flag = /^-[ \t]+Verified:[^\r\n]*/mi;
        return flag.test(part) ? part.replace(flag, "- Verified: yes") : part.trimEnd() + newline + "- Verified: yes" + newline + newline;
      });
    } else {
      block = block.replace(/(\r?\n---[ \t]*(?:\r?\n)?[ \t\r\n]*)?$/, () => newline + "### Metadata" + newline + "- Verified: yes" + newline + newline + "---" + newline);
    }
  }
  const parsed = parseEntries(entry.filePath, block, entry.scopeName);
  const issues = [...parsed.errors, ...validateEntries(parsed.entries)];
  if (issues.length) throw new Error("Refusing invalid update: " + issues.join("; "));
  fs.writeFileSync(entry.filePath, source.slice(0, start) + block + source.slice(end), "utf8");
  return entry.filePath;
}

module.exports = {
  DEFAULT_MAX_ITEMS,
  MEMORY_FILES,
  RESOLVED_STATUSES,
  collectEntries,
  entryBaseScore,
  expandPath,
  formatEntry,
  parseEntries,
  recordEntry,
  redact,
  renderRecord,
  resolveScopes,
  searchEntries,
  updateStatus,
  validateEntries,
};
