#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const {
  DEFAULT_MAX_ITEMS,
  collectEntries,
  formatEntry,
  redact,
  searchEntries,
} = require("./memory-core");

function readHookInput() {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function main() {
  const input = readHookInput();
  const projectRoot = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const query = input.query || input.prompt || process.env.ERROR_MEMORY_QUERY || "";
  const configuredLimit = input.max_items || process.env.ERROR_MEMORY_MAX_ITEMS;
  const limit = configuredLimit ? Number(configuredLimit) : DEFAULT_MAX_ITEMS;
  const collected = collectEntries(projectRoot, process.env.CLAUDE_ERROR_MEMORY_DIR);
  const selected = searchEntries(collected.entries, query, limit);

  const lines = [
    "Error Memory: session-start review",
    `Project memory: ${collected.scopes[0].directory}`,
    `Global memory: ${collected.scopes.at(-1).directory}`,
    query ? `Relevant entries for: ${redact(query)}` : "Review related entries before repeating an approach.",
  ];

  if (selected.length === 0) {
    lines.push("No matching entries found. Record only verified, reusable errors and fixes.");
  } else {
    lines.push("Relevant recorded entries:");
    for (const entry of selected) lines.push(formatEntry(entry));
  }

  if (collected.errors.length) {
    lines.push("Warnings:");
    for (const error of collected.errors) lines.push(`- ${redact(error)}`);
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

try {
  main();
} catch {
  process.stdout.write("Error Memory: session-start review unavailable; continue without changing project files.\n");
}
