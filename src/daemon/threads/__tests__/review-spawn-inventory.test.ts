import test from 'node:test';
import assert from 'node:assert/strict';
import { shellWorkerFixture } from './helpers/review-shell-host.js';
import { REVIEW_NATIVE_SPAWN_APIS, REVIEW_NATIVE_BOUNDARIES } from '../../../shared/review-native-guard.js';
import { spawnSync } from 'node:child_process';
import { readdir,readFile } from 'node:fs/promises';
import { join } from 'node:path';
test('all review-reachable native spawn and exec paths use the host bridge',async t=>{
 const h=await shellWorkerFixture(t,'inventory'),r=await h.result;await h.closed;
 for(const name of [...REVIEW_NATIVE_SPAWN_APIS,'esm spawn','esm execFileSync','cjs spawn','ChildProcess.spawn','runShell','runShellBytes','spawnManaged'])assert.ok(r.refusals.includes(name),name);
 assert.equal(h.events.length,0,'unbridged worker calls cannot reach host execution');
 assert.equal(spawnSync(process.execPath,['-e','process.stdout.write("host")'],{encoding:'utf8'}).stdout,'host','the guard changes only its review worker thread');
 // Source inventory is a change detector; the real worker above is the proof
 // that an unbridged native API (including future call sites) fails closed.
 const nativeFiles:string[]=[];
 async function inventory(path:string){for(const entry of await readdir(path,{withFileTypes:true})){
  if(entry.name==='__tests__')continue;const file=join(path,entry.name);
  if(entry.isDirectory())await inventory(file);
  else if(file.endsWith('.ts')&&!file.endsWith('.test.ts')&&/['"](?:node:)?child_process['"]/.test(await readFile(file,'utf8')))nativeFiles.push(file);
 }}
 for(const root of ['src/agent/providers','src/daemon/tools','src/workflow/code-review','src/workflow/review'])await inventory(root);
 nativeFiles.push('src/shared/process-group.ts');
 assert.deepEqual(nativeFiles.sort(),Object.keys(REVIEW_NATIVE_BOUNDARIES).sort(),'new native import boundaries require explicit bridge/inventory qualification');
});
