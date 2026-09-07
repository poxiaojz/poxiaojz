"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MEMORY_FILES = ["ERRORS.md", "LEARNINGS.md"];
const DEFAULT_MAX_ITEMS = 12;
const MAX_FILE_BYTES = 1024 * 1024;
const RESOLVED_STATUSES = new Set(["resolved", "promoted", "wont_fix"]);
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
  const globalDir = expandPath(globalDirectory);
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
    .replace(/([?&](?:api[_-]?key|token|password|secret)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(api[_-]?key|token|password|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
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
  const pattern = new RegExp(`^### ${heading}\\s*$([\\s\\S]*?)(?=^### |^---\\s*$|$)`, "mi");
  return ((block.match(pattern) || ["", ""])[1] || "").trim();
}

function listField(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEntries(filePath, content, scopeName) {
  const source = String(content || "");
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
      priority: field(block, "Priority", "low").toLowerCase(),
      area: field(block, "Area"),
      logged: field(block, "Logged"),
      tags: listField(field(block, "Tags")),
      files: listField(field(block, "Files") || field(block, "Related Files")),
      tools: listField(field(block, "Tools")),
      environment: listField(field(block, "Environment")),
      summary,
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

function validateEntries(entries) {
  const issues = [];
  const ids = new Map();
  for (const entry of entries) {
    if (!entry.status || entry.status === "unknown") issues.push(`${entry.file}:${entry.line} ${entry.id}: missing or unknown Status`);
    if (!Object.hasOwn(PRIORITY_WEIGHT, entry.priority)) issues.push(`${entry.file}:${entry.line} ${entry.id}: invalid Priority "${entry.priority}"`);
    if (!entry.summary) issues.push(`${entry.file}:${entry.line} ${entry.id}: missing Summary`);
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
  return `- [${entry.scopeName}] [${entry.id}] ${entry.status}/${entry.priority}: ${redact(entry.summary)}${match ? ` (${match})` : ""}`;
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
  const collected = collectEntries(projectRoot, globalDirectory);
  const scopes = collected.scopes;
  const scopeName = input.scope === "global" ? "global" : "project";
  const scope = scopes.find((item) => item.name === scopeName);
  const file = input.type === "learning" ? "LEARNINGS.md" : "ERRORS.md";
  const filePath = path.join(scope.directory, file);
  fs.mkdirSync(scope.directory, { recursive: true });
  const id = makeId(input.type, collected.entries);
  const content = readText(filePath).content;
  const block = renderRecord(input, id);
  const separator = content && !content.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(filePath, `${content}${separator}${block}`, "utf8");
  return { id, filePath, block };
}

function updateStatus(id, status, projectRoot, globalDirectory) {
  const collected = collectEntries(projectRoot, globalDirectory);
  for (const entry of collected.entries) {
    if (entry.id !== id) continue;
    const source = fs.readFileSync(entry.filePath, "utf8").replace(/^\uFEFF/, "");
    const next = source.replace(new RegExp(`(## \\[${id}\\][\\s\\S]*?^\\*\\*Status\\*\\*:\\s*)[^\\n]+`, "m"), `$1${status}`);
    if (next === source) throw new Error(`${id} has no editable Status field`);
    fs.writeFileSync(entry.filePath, next, "utf8");
    return entry.filePath;
  }
  throw new Error(`Memory entry not found: ${id}`);
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
