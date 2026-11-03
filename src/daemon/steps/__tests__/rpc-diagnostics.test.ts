import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
let matrix: Promise<void> | undefined;
function runMatrix(): Promise<void> {
	return matrix ??= (async () => {
		const root = await mkdtemp(join(tmpdir(), 'cm-rpc-diagnostics-'));
		try {
			for (const mode of ['source', 'compiled']) {
				const directory = join(root, mode); await mkdir(directory);
				const baseline = Object.fromEntries(['DEBUG', 'NODE_DEBUG', 'OLLAMA_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL', 'NODE_ORACLEDB_DEBUG_PACKETS', 'ORA_DEBUG_JDWP'].map(key => [key, '']));
				const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/rpc-diagnostics.ts', import.meta.url)), directory, mode], { env: { ...process.env, ...baseline, INSRC_MODE: 'daemon', INSRC_LOG_LEVEL: 'trace', NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe'] });
				let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; }); const timer = setTimeout(() => child.kill('SIGKILL'), 25000);
				try { const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); assert.equal(code, 0, output); assert.match(output, /"completed":true/); assert.match(output, /"actualDaemonSink":true/); assert.equal(output.includes('CM_PRIVATE_'), false, 'private provider canary reached stdout/stderr'); } finally { clearTimeout(timer); child.kill('SIGKILL'); }
			}
		} finally { await rm(root, { recursive: true, force: true }); }
	})();
}
test('CM-S3-CONSUMER-LOGS: tool/RPC/progress/error/throwing-delivery envelopes and normal sink, saved concurrent marker', async () => { await runMatrix(); });
