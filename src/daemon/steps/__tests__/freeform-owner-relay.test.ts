import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
let matrix: Promise<string> | undefined;
function runMatrix(): Promise<string> {
 return matrix ??= new Promise((resolve, reject) => {
  const baseline = Object.fromEntries(['DEBUG', 'NODE_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL', 'NODE_ORACLEDB_DEBUG_PACKETS', 'ORA_DEBUG_JDWP'].map(key => [key, '']));
  const child = spawn(process.execPath, ['--import', 'tsx', '--test', fileURLToPath(new URL('./fixtures/freeform-owner-relay.ts', import.meta.url))], { env: { ...process.env, ...baseline, NODE_TEST_CONTEXT: undefined, INSRC_MODE: 'probe-worker' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; }); const timer = setTimeout(() => child.kill('SIGKILL'), 25000);
  child.once('error', error => { clearTimeout(timer); reject(error); });
  child.once('close', code => { clearTimeout(timer); try { assert.equal(code, 0, output); assert.match(output, /# pass 2\b/); for (const key of ['fail','cancelled','skipped','todo']) assert.match(output, new RegExp('# ' + key + ' 0\\b')); resolve(output); } catch(error) { reject(error); } });
 });
}
test('CM-S3-FREEFORM: actual explicit forced and measured owner relays plus saved tool-loop compatibility',async()=>{await runMatrix();});
