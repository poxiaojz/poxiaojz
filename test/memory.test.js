"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  collectEntries,
  parseEntries,
  recordEntry,
  redact,
  searchEntries,
  updateStatus,
  validateEntries,
} = require("../scripts/memory-core");

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "error-memory-"));
}

test("parses legacy entries and validates required fields", () => {
  const content = `## [ERR-20260907-AAA] Windows path issue\n**Logged**: 2026-09-07\n**Priority**: high\n**Status**: resolved\n**Area**: infra\n**Tags**: node, windows\n\n### Summary\nUse path.resolve for Windows paths.\n\n### Error\nA path was not found.\n\n---\n`;
  const parsed = parseEntries("ERRORS.md", content, "project");
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].tags[1], "windows");
  assert.deepEqual(validateEntries(parsed.entries), []);
});

test("ranks query matches above unrelated entries", () => {
  const entries = [
    { id: "ERR-20260907-AAA", title: "Git issue", status: "resolved", priority: "low", scopeName: "global", date: "20260907", summary: "Git authentication", details: "", context: "", fix: "", tags: [], files: [], tools: [], environment: [] },
    { id: "ERR-20260906-BBB", title: "Windows path issue", status: "pending", priority: "medium", scopeName: "project", date: "20260906", summary: "Windows path handling in Node", details: "", context: "", fix: "", tags: ["windows"], files: ["scripts/session-start-check.js"], tools: ["node"], environment: [] },
  ];
  assert.equal(searchEntries(entries, "Windows path", 1)[0].id, "ERR-20260906-BBB");
});

test("redacts credentials before they are displayed or written", () => {
  const output = redact("token=secret-value Bearer abc.def.ghi https://x.test/?api_key=abc");
  assert.equal(output.includes("secret-value"), false);
  assert.equal(output.includes("abc.def.ghi"), false);
  assert.equal(output.includes("?api_key=abc"), false);
});

test("records, validates, searches, and resolves an entry", () => {
  const project = tempProject();
  const result = recordEntry({
    type: "error",
    title: "Node path fix",
    summary: "Use path.resolve before reading project files.",
    priority: "high",
    status: "pending",
    area: "infra",
    tags: ["node", "paths"],
    files: ["scripts/memory-core.js"],
    details: "Relative paths failed.",
    context: "Windows and nested projects.",
    fix: "Resolve paths from the project root.",
  }, project);
  const collected = collectEntries(project);
  assert.equal(collected.entries.length, 1);
  assert.deepEqual(validateEntries(collected.entries), []);
  assert.equal(searchEntries(collected.entries, "Windows nested paths", 1)[0].id, result.id);
  updateStatus(result.id, "resolved", project);
  assert.equal(collectEntries(project).entries[0].status, "resolved");
});
