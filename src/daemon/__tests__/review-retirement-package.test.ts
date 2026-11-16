import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { tmpdir } from 'node:os';

const removed = ['workflow/review/review.js','workflow/code-review/runner.js','daemon/threads/review-workers.js','daemon/threads/review-worker-runtime.js','daemon/review-service.js','shared/review-native-guard.js','agent/providers/review-activity-stream.js'];
test('clean build and package remove retired runtime and planted stale output', {timeout:180000},()=>{
 for(const path of removed){const target=resolve('out',path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,'throw new Error("planted stale review output");\n');}
 const output=execFileSync('npm',['run','build'],{encoding:'utf8',timeout:150000,maxBuffer:8*1024*1024});
 writeFileSync('/tmp/insrc-review-retirement-package-build.log',output);
 for(const path of removed)assert.equal(existsSync(resolve('out',path)),false,path);
 const scratch=mkdtempSync(join(tmpdir(),'insrc-retirement-package-'));
 try {
  const archive=join(scratch,'daemon-output.tar');
  execFileSync('tar',['-cf',archive,'-C','out','.'],{timeout:30000});
  const names=new Set(execFileSync('tar',['-tf',archive],{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024}).split('\n').map(p=>p.replace(/^\.\//,'')));
  for(const path of removed)assert.equal(names.has(path),false,path);
  assert.ok(names.has('daemon/index.js'));
  assert.ok(names.has('mcp/review-input-schemas.js'));
  assert.ok(names.has('workflow/review-history/review/report-log.js'));
 } finally { rmSync(scratch,{recursive:true,force:true}); }
 assert.match(readFileSync('out/workflow/review-unavailable.js','utf8'),/review functionality is being rewritten/);
});
