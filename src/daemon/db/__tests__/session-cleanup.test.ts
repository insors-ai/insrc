import assert from 'node:assert/strict';
import test from 'node:test';
import { runProbeMatrix } from './fixtures/session-probe-matrix.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TemporaryDriverResources } from '../session-resources.js';
import { contextualDriverFactory, temporaryDriverOwner } from '../driver-log-policy.js';
import type { Driver } from '../../../shared/db-driver.js';
let matrix: Promise<void> | undefined;
function runMatrix() {
	return matrix ??= (async () => {
		for (const mode of ['source', 'compiled']) {
			const baseline = Object.fromEntries(['DEBUG', 'NODE_DEBUG', 'OLLAMA_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL', 'NODE_ORACLEDB_DEBUG_PACKETS', 'ORA_DEBUG_JDWP'].map(key => [key, '']));
			const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/session-cleanup-child.ts', import.meta.url)), mode], { env: { ...process.env, ...baseline, INSRC_MODE: 'probe-worker', NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe'] });
			let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; }); const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
			try { const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); assert.equal(code, 0, output); assert.match(output, /# pass 24\b/); for (const key of ['fail', 'skipped', 'cancelled', 'todo']) assert.match(output, new RegExp('# ' + key + ' 0\\b')); } finally { clearTimeout(timer); child.kill('SIGKILL'); }
		}
	})();
}
test('CM-S3-EXPIRY: actual end/exact deadline/restart during use/construction/probe/conversion/close failure; zero leaked handles', async () => { await runMatrix(); await runProbeMatrix(['end', 'deadline', 'restart']); });
test('CM-S3-RECONNECT: before-deadline resume preserves entries and cancels revoked-generation work', async () => { await runMatrix(); });

test('CM-S4-TEMP: shutdown drains retained resources at capacity and retries failed close without new admission',async()=>{
 const root='/s4-cleanup-root';let slots=0,calls=0,fail=true;
 const resources=new TemporaryDriverResources(root,'owner',()=>{},temporaryDriverOwner('owner',root,()=>{}),
  {factory:()=>contextualDriverFactory(async config=>({id:config.id,kind:config.kind,family:'rdbms',close:async()=>{calls++;if(config.id==='row0'&&fail)throw new Error('private-canary');}} as Driver))},
  ()=>{slots++;let released=false;return()=>{if(!released){released=true;slots--;}};});
 try {
  for(let i=0;i<64;i++){
   await resources.acquire({id:`row${i}`,kind:'postgres',url:'postgres://host/db'},`revision${i}`);
   resources.commitRemoval(resources.prepareRemoval(`revision${i}`,`operation${i}`));
  }
  assert.equal(slots,64);
  await assert.rejects(resources.close(),{code:'recovery-required'});assert.equal(slots,1);assert.equal(calls,64);
  assert.throws(()=>resources.prepareRemoval('revision0','new-operation'),{code:'session-expired'});
  fail=false;await resources.close();assert.equal(slots,0);assert.equal(calls,65);
 } finally {fail=false;await resources.close();}
});

test('CM-S4-TEMP: cancellation and owner expiry preserve exact late-construction cleanup',async()=>{
 const root='/s4-late-root';let finish!:()=>void,entered!:()=>void,closed=0,slots=0;
 const started=new Promise<void>(resolve=>{entered=resolve;}),late=new Promise<void>(resolve=>{finish=resolve;});
 const resources=new TemporaryDriverResources(root,'owner',()=>{},temporaryDriverOwner('owner',root,()=>{}),
  {factory:()=>contextualDriverFactory(async config=>{entered();await late;return{id:config.id,kind:config.kind,family:'rdbms',close:async()=>{closed++;}} as Driver;})},
  ()=>{slots++;return()=>{slots--;};});
 try {
  const acquiring=resources.acquire({id:'late',kind:'postgres',url:'postgres://host/db'},'late-revision');void acquiring.catch(()=>{});await started;
  const canceled=resources.prepareRemoval('late-revision','cancel-op');assert.throws(()=>resources.prepareRemoval('late-revision','duplicate-op'),{code:'busy'});resources.cancelRemoval(canceled);resources.cancelRemoval(canceled);assert.equal(slots,0);
  assert.throws(()=>resources.commitRemoval(canceled),{code:'operation-mismatch'});
  resources.commitRemoval(resources.prepareRemoval('late-revision','late-op'));assert.equal(slots,1);
  const closing=resources.close();finish();await assert.rejects(acquiring,{code:'session-expired'});await closing;
  assert.equal(closed,1);assert.equal(slots,0);
 } finally {finish();await resources.close();}
});
