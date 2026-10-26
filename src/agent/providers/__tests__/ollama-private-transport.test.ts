import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
let matrix: Promise<void> | undefined;
function runMatrix(): Promise<void> {
	return matrix ??= new Promise((resolve, reject) => {
		const baseline = Object.fromEntries(['DEBUG', 'NODE_DEBUG', 'OLLAMA_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL', 'NODE_ORACLEDB_DEBUG_PACKETS', 'ORA_DEBUG_JDWP'].map(key => [key, '']));
		const child = spawn(process.execPath, ['--import', 'tsx', '--test', fileURLToPath(new URL('../../../daemon/steps/__tests__/fixtures/provider-transport.ts', import.meta.url))], { env: { ...process.env, ...baseline, INSRC_MODE: 'probe-worker', NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe'] });
		let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; }); const timer = setTimeout(() => child.kill('SIGKILL'), 25000);
		child.once('error', error => { clearTimeout(timer); reject(error); }); child.once('close', code => { clearTimeout(timer); try { assert.equal(code, 0, output); assert.match(output, /# pass 6\b/); for (const key of ['fail', 'cancelled', 'skipped', 'todo']) assert.match(output, new RegExp('# ' + key + ' 0\\b')); resolve(); } catch (error) { reject(error); } });
	});
}
test('memory-only Ollama transport rejects malformed frames before SDK console diagnostics', async () => { await runMatrix(); });
test('memory-only Ollama transport retains completion until actual HTTP EOF after terminal frame', async () => { await runMatrix(); });
test('memory-only Ollama transport rejects non-JSON HTTP failures before SDK error diagnostics', async () => { await runMatrix(); });

test('admitted Session expiry during real structured validation prevents the next SDK retry', async () => { await runMatrix(); });

test('memory-only adapter refuses internal helper substitution before native construction', async () => { await runMatrix(); });

test('issued proof from an actual changed artifact generation refuses with zero filesystem or spawn calls', async () => { await runMatrix(); });
