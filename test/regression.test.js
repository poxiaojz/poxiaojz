"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const core = require("../scripts/memory-core");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-regression-"));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const project = path.join(root, "project"), global = path.join(root, "global");
  fs.mkdirSync(path.join(project, ".learnings"), {recursive:true});
  return { project, global, file:path.join(project, ".learnings", "ERRORS.md") };
}
const input = {title:"Example", summary:"Actual summary", details:"unique-error-text", context:"context text", fix:"fix text"};
test("multiline sections and CRLF/BOM preserve real content for search", () => {
  const text = core.renderRecord({...input, summary:"First line\nSecond line"}, "ERR-20260907-ABC");
  const entry = core.parseEntries("ERRORS.md", "\uFEFF"+text.replace(/\n/g,"\r\n"), "project").entries[0];
  assert.equal(entry.summary, "First line\nSecond line");
  assert.equal(entry.details, input.details);
  assert.equal(entry.context, input.context);
  assert.equal(entry.fix, input.fix);
  assert.equal(core.searchEntries([entry], "unique-error-text").length, 1);
});
test("oversized file is preserved byte for byte", (t) => {
  const f=fixture(t), before=Buffer.alloc(1024*1024+1, "x");
  fs.writeFileSync(f.file,before);
  assert.throws(()=>core.recordEntry(input,f.project,f.global), /Refusing/);
  assert.deepEqual(fs.readFileSync(f.file),before);
});
test("read failure is preserved and never converted to empty history", (t) => {
  const f=fixture(t); fs.mkdirSync(f.file);
  assert.throws(()=>core.recordEntry(input,f.project,f.global), /Refusing/);
  assert.equal(fs.statSync(f.file).isDirectory(),true);
});
test("append preserves existing CRLF and BOM bytes", (t) => {
  const f=fixture(t), before=Buffer.from("\uFEFF# Existing\r\n");
  fs.writeFileSync(f.file,before);
  core.recordEntry(input,f.project,f.global);
  assert.deepEqual(fs.readFileSync(f.file).subarray(0,before.length),before);
});
test("invalid fields and unverified resolved records never write", (t) => {
  const f=fixture(t);
  for(const extra of [{status:"anything"},{priority:"urgent"},{scope:"other"},{type:"other"},{status:"resolved"},{title:"a\nb"}]) {
    assert.throws(()=>core.recordEntry({...input,...extra},f.project,f.global));
    assert.equal(fs.existsSync(f.file),false);
  }
  core.recordEntry({...input,status:"resolved",verified:true},f.project,f.global);
});
test("validator rejects unknown status and missing summary/priority", () => {
  const parsed=core.parseEntries("ERRORS.md","## [ERR-20260907-ABC] Title\n**Status**: nonsense\n","project");
  const issues=core.validateEntries(parsed.entries);
  assert.equal(issues.length,3);
});
test("metadata is redacted on output", () => {
  const e=core.parseEntries("ERRORS.md",core.renderRecord(input,"ERR-20260907-ABC"),"project").entries[0];
  e.tags=["token=synthetic-sensitive"];
  e.files=["https://example.test/?secret=synthetic-sensitive"];
  assert.ok(!core.formatEntry(e).includes("synthetic-sensitive"));
});
test("global recording works when project and global scopes coincide", (t) => {
  const f=fixture(t);
  core.recordEntry({...input,scope:"global"},f.project,path.dirname(f.file));
  assert.equal(fs.existsSync(f.file),true);
});

