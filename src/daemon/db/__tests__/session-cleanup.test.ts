import assert from 'node:assert/strict';
import test from 'node:test';
import { runProbeMatrix } from './fixtures/session-probe-matrix.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
