#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAX_ITEMS = 12;
const MEMORY_FILES = ["ERRORS.md", "LEARNINGS.md"];

function readHookInput() {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function expandPath(value) {
  const home = os.homedir();
  if (!value) return path.join(home, ".learnings");

  let expanded = value.trim();
  if (expanded === "~") expanded = home;
  if (expanded.startsWith("~/") || expanded.startsWith("~\\")) {
    expanded = path.join(home, expanded.slice(2));
  }
  expanded = expanded.replace(/^%USERPROFILE%/i, process.env.USERPROFILE || home);
  return path.resolve(expanded);
}

function readEntries(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8").replace(/\r/g, "");
  } catch {
    return [];
  }

  const headers = Array.from(
    content.matchAll(/^## \[([A-Z]+-\d{8}-[A-Z0-9]+)\]\s*(.+)$/gm),
  );

  return headers.map((header, index) => {
    const start = header.index;
    const end = index + 1 < headers.length ? headers[index + 1].index : content.length;
    const block = content.slice(start, end);
    const status = (block.match(/^\*\*Status\*\*:\s*(.+)$/m) || ["", "unknown"])[1].trim();
    const priority = (block.match(/^\*\*Priority\*\*:\s*(.+)$/m) || ["", "low"])[1].trim();
    const summary = (block.match(/^### Summary\s*\n([^\n]+)/m) || ["", header[2]])[1].trim();
    const date = header[1].match(/^[A-Z]+-(\d{8})-/)?.[1] || "00000000";

    return {
      id: header[1],
      title: header[2].trim(),
      status,
      priority,
      summary: redact(summary),
      date,
      file: path.basename(filePath),
    };
  });
}

function redact(value) {
  return value
    .replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]");
}

function collectScope(scopeName, directory) {
  return MEMORY_FILES.flatMap((file) =>
    readEntries(path.join(directory, file)).map((entry) => ({ ...entry, scopeName, directory })),
  );
}

function main() {
  const input = readHookInput();
  const projectRoot = path.resolve(input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const projectDir = path.join(projectRoot, ".learnings");
  const globalDir = expandPath(process.env.CLAUDE_ERROR_MEMORY_DIR);
  const scopes = [{ name: "project", directory: projectDir }];
  if (path.normalize(projectDir) !== path.normalize(globalDir)) {
    scopes.push({ name: "global", directory: globalDir });
  }

  const entries = scopes.flatMap((scope) => collectScope(scope.name, scope.directory));
  const unresolved = entries.filter((entry) => !["resolved", "promoted", "wont_fix"].includes(entry.status));
  const resolved = entries
    .filter((entry) => ["resolved", "promoted"].includes(entry.status))
    .sort((a, b) => b.date.localeCompare(a.date));
  const selected = [...unresolved, ...resolved].slice(0, MAX_ITEMS);

  const lines = [
    "Error Memory: session-start review",
    `Project memory: ${projectDir}`,
    `Global memory: ${globalDir}`,
    "Review related entries before repeating a failed approach.",
  ];

  if (selected.length === 0) {
    lines.push("No recorded entries found. Record only verified, reusable errors and fixes.");
  } else {
    lines.push("Relevant recorded entries:");
    for (const entry of selected) {
      lines.push(`- [${entry.scopeName}] [${entry.id}] ${entry.status}/${entry.priority}: ${entry.summary}`);
    }
  }

  process.stdout.write(lines.join("\n") + "\n");
}

try {
  main();
} catch {
  process.stdout.write("Error Memory: session-start review unavailable; continue without changing project files.\n");
}

