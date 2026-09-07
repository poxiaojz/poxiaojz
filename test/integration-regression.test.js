"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const core = require("../scripts/memory-core");
const cli = path.resolve(__dirname, "../scripts/error-memory.js");
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-cli-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const project = path.join(root,"project"), global = path.join(root,"global");
  fs.mkdirSync(project);
  const run = (...args) => spawnSync(process.execPath,[cli,"--cwd",project,...args],{
    encoding:"utf8",env:{...process.env,CLAUDE_ERROR_MEMORY_DIR:global}
  });
  return {root,project,global,run};
}
const input = {title:"repair",summary:"test repair",fix:"Run a successful smoke check"};
test("CLI reads environment global directory; explicit flag takes precedence", t=>{
  const f=setup(t);
  core.recordEntry({...input,scope:"global",summary:"environment-only-marker"}, f.project,f.global);
  const env=f.run("search","environment-only-marker");
  assert.equal(env.status,0,env.stderr);
  assert.match(env.stdout,/1 result/);
  const explicit=f.run("search","environment-only-marker","--global-dir",path.join(f.root,"override"));
  assert.equal(explicit.status,0);
  assert.match(explicit.stdout,/0 result/);
});
test("resolve refuses unverified records without changing bytes; explicit confirmation persists", t=>{
  const f=setup(t), r=core.recordEntry(input,f.project,f.global);
  const before=fs.readFileSync(r.filePath);
  assert.equal(f.run("resolve",r.id).status,1);
  assert.deepEqual(fs.readFileSync(r.filePath),before);
  const ok=f.run("resolve",r.id,"--verified","--fix","Checked the corrected command");
  assert.equal(ok.status,0,ok.stderr);
  const entry=core.collectEntries(f.project,f.global).entries[0];
  assert.equal(entry.status,"resolved");
  assert.equal(entry.verified,true);
  assert.equal(entry.fix,"Checked the corrected command");
  assert.equal(f.run("validate").status,0);
  assert.equal(f.run("resolve",r.id).status,0);
});
test("resolve requires a real fix and validator catches hand-edited invalid resolved entries", t=>{
  const f=setup(t), r=core.recordEntry({...input,fix:undefined},f.project,f.global);
  assert.equal(f.run("resolve",r.id,"--verified").status,1);
  fs.writeFileSync(r.filePath,fs.readFileSync(r.filePath,"utf8").replace("**Status**: pending","**Status**: resolved"));
  assert.equal(f.run("validate").status,1);
});
test("secret_key variants are redacted in stored fields and CLI search", t=>{
  const f=setup(t);
  for(const key of ["secret_key","SECRET_KEY","secret-key","secretKey"]) {
    const value="synthetic"+key.replace(/[^a-z]/gi,"");
    const result=f.run("record","--title",key,"--summary",key+"="+value,"--tags",key+"="+value,"--files","https://example.test/?"+key+"="+value);
    assert.equal(result.status,0,result.stderr);
    const stored=fs.readFileSync(path.join(f.project,".learnings","ERRORS.md"),"utf8");
    assert.ok(!stored.includes(value));
    assert.ok(!f.run("search",key).stdout.includes(value));
  }
});
test("search returns partial results but exits 1 on read failure; zero matches exits 0", t=>{
  const f=setup(t);
  core.recordEntry(input,f.project,f.global);
  fs.mkdirSync(f.global,{recursive:true});
  fs.mkdirSync(path.join(f.global,"ERRORS.md"));
  const result=f.run("search");
  assert.equal(result.status,1);
  assert.match(result.stdout,/test repair/);
  assert.match(result.stdout,/Warnings/);
  const clean=f.run("search","absent","--global-dir",path.join(f.root,"empty"));
  assert.equal(clean.status,0);
});
test("status edits preserve neighbouring records including CRLF and literal replacement tokens", t=>{
  const f=setup(t), a=core.recordEntry(input,f.project,f.global);
  const b=core.recordEntry({...input,title:"second"},f.project,f.global);
  fs.writeFileSync(a.filePath,"\uFEFF"+fs.readFileSync(a.filePath,"utf8").replace(/\n/g,"\r\n"));
  const before=fs.readFileSync(a.filePath,"utf8");
  const nextBefore=before.slice(before.indexOf("## ["+b.id+"]"));
  core.updateStatus(a.id,"resolved",f.project,f.global,{verified:true,fix:"Confirmed literal $& text"});
  const after=fs.readFileSync(a.filePath,"utf8");
  assert.equal(after.slice(after.indexOf("## ["+b.id+"]")),nextBefore);
  assert.ok(after.startsWith("\uFEFF"));
  assert.equal(core.collectEntries(f.project,f.global).entries[0].fix,"Confirmed literal $& text");
});
test("original lifecycle tests are independent of a populated default home", t=>{
  const f=setup(t), fakeHome=path.join(f.root,"fake-home");
  const memory=path.join(fakeHome,".learnings");
  fs.mkdirSync(memory,{recursive:true});
  const file=path.join(memory,"ERRORS.md");
  fs.writeFileSync(file,core.renderRecord(input,"ERR-20260907-HOME"));
  const before=fs.readFileSync(file);
  const preload=path.join(f.root,"home.cjs");
  // Child-only dependency substitution, no actual HOME/USERPROFILE modification.
  fs.writeFileSync(preload,"require('node:os').homedir = () => "+JSON.stringify(fakeHome)+";");
  const child=spawnSync(process.execPath,["--require",preload,"--test",path.join(__dirname,"memory.test.js")],{
    encoding:"utf8",env:{...process.env,CLAUDE_ERROR_MEMORY_DIR:memory}
  });
  assert.equal(child.status,0,child.stdout+child.stderr);
  assert.deepEqual(fs.readFileSync(file),before);
});

