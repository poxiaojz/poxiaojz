#!/usr/bin/env node

"use strict";

const path = require("node:path");
const {
  DEFAULT_MAX_ITEMS,
  collectEntries,
  formatEntry,
  recordEntry,
  redact,
  searchEntries,
  updateStatus,
  validateEntries,
} = require("./memory-core");

function usage() {
  return `Error Memory CLI

Commands:
  search [query]                 Search project and global memory
  validate                      Validate all memory entries
  record --title T --summary S  Add a verified or pending entry
  resolve ID --verified --fix F Mark verified repair as resolved

Common options:
  --cwd PATH                    Project root (defaults to current directory)
  --global-dir PATH             Global memory directory
  --limit N                     Maximum search results (default: ${DEFAULT_MAX_ITEMS})

Record options:
  --type error|learning         Target ERRORS.md or LEARNINGS.md
  --status STATUS               Default: pending
  --priority LEVEL              Default: medium
  --area AREA                   Default: docs
  --tags a,b,c                  Searchable tags
  --files a,b,c                 Related files
  --tools a,b,c                 Related tools
  --environment a,b,c           Related environments
  --details TEXT                Error details or learning details
  --context TEXT                Reproduction or applicability context
  --fix TEXT                    Suggested fix or recommended approach
  --verified                    Confirm the fix was actually tested (record/resolve)
  --scope project|global        Default: project
`;
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      result._.push(arg);
      continue;
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (key === "verified") {
      result[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

function context(args) {
  return {
    cwd: path.resolve(args.cwd || process.cwd()),
    globalDirectory: args.globalDir,
  };
}

function fail(message) {
  process.stderr.write(`Error Memory: ${redact(message)}\n`);
  process.exitCode = 1;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0];
  if (!command || command === "help" || command === "--help") {
    process.stdout.write(usage());
    return;
  }

  const { cwd, globalDirectory } = context(args);
  if (command === "search") {
    const query = args._.slice(1).join(" ");
    const collected = collectEntries(cwd, globalDirectory);
    const entries = searchEntries(collected.entries, query, args.limit || DEFAULT_MAX_ITEMS);
    process.stdout.write(`Error Memory: ${entries.length} result(s)${query ? ` for "${redact(query)}"` : ""}\n`);
    for (const entry of entries) process.stdout.write(`${formatEntry(entry)}\n`);
    if (collected.errors.length) {
      process.exitCode = 1;
      process.stdout.write("Warnings:\n");
      for (const error of collected.errors) process.stdout.write(`- ${redact(error)}\n`);
    }
    return;
  }

  if (command === "validate") {
    const collected = collectEntries(cwd, globalDirectory);
    const issues = [...collected.errors, ...validateEntries(collected.entries)];
    if (issues.length) {
      process.stdout.write(`Validation failed with ${issues.length} issue(s):\n`);
      for (const issue of issues) process.stdout.write(`- ${redact(issue)}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`Validation passed: ${collected.entries.length} entr${collected.entries.length === 1 ? "y" : "ies"}.\n`);
    return;
  }

  if (command === "record") {
    const result = recordEntry({
      type: args.type,
      title: args.title,
      summary: args.summary,
      status: args.status,
      priority: args.priority,
      area: args.area,
      tags: args.tags,
      files: args.files,
      tools: args.tools,
      environment: args.environment,
      details: args.details,
      context: args.context,
      fix: args.fix,
      verified: args.verified,
      scope: args.scope,
    }, cwd, globalDirectory);
    process.stdout.write(`Recorded ${result.id} in ${result.filePath}\n`);
    return;
  }

  if (command === "resolve") {
    const id = args._[1];
    if (!id) throw new Error("resolve requires an entry ID");
    const filePath = updateStatus(id, "resolved", cwd, globalDirectory, { verified: args.verified, fix: args.fix });
    process.stdout.write(`Resolved ${id} in ${filePath}\n`);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

try {
  main();
} catch (error) {
  fail(error.message);
}
