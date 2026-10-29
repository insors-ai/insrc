import {runFileRemoval} from './fixtures/file-removal-run.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('CM-S3-FILES: isolated production file matrix verifies owner identity budget no-write refusal and cancellation without skipped cases', async () => {
 const baseline = Object.fromEntries(['DEBUG', 'NODE_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL', 'NODE_ORACLEDB_DEBUG_PACKETS', 'ORA_DEBUG_JDWP'].map(key => [key, '']));
 // Filesystem/resource proof is isolated from the daemon launcher environment. Normal daemon SDK diagnostics are tested separately.
 const child = spawn(process.execPath, ['--import', 'tsx', '--test-reporter=tap', '--test', fileURLToPath(new URL('./fixtures/session-file-resources-child.ts', import.meta.url))], { env: { ...process.env, ...baseline, NODE_TEST_CONTEXT: undefined, INSRC_MODE: 'probe-worker' }, stdio: ['ignore', 'pipe', 'pipe'] });
 let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; }); let timeout = false;
 const timer = setTimeout(() => { timeout = true; child.kill('SIGKILL'); }, 30000);
 try {
  const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); assert.equal(timeout, false, 'file matrix timed out'); assert.equal(code, 0, output);
		assert.match(output, /# tests 6\b/); assert.match(output, /# pass 6\b/); for (const key of ['fail', 'cancelled', 'skipped', 'todo']) assert.match(output, new RegExp('# ' + key + ' 0\\b'));
 } finally { clearTimeout(timer); child.kill('SIGKILL'); }
});

test('CM-S4-FILES/NO-PERSIST: poisoned source mutation ports hashes and native counters prove removal cleanup',{timeout:75000},async t=>{
 t.diagnostic(JSON.stringify(await runFileRemoval('source')));
});
