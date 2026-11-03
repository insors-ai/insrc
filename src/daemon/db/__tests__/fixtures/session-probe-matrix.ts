import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export async function runProbeMatrix(lifecycles: readonly string[]) {
	for (const mode of ['source', 'compiled']) for (const lifecycle of lifecycles) {
		const baseline = Object.fromEntries(['DEBUG', 'NODE_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL', 'NODE_ORACLEDB_DEBUG_PACKETS', 'ORA_DEBUG_JDWP'].map(key => [key, '']));
		const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./session-probe-child.ts', import.meta.url)), mode, lifecycle], { env: { ...process.env, ...baseline, INSRC_MODE: 'probe-worker', NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe'] });
		let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; }); const timer = setTimeout(() => child.kill('SIGKILL'), 25000);
		try { const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); assert.equal(code, 0, output); assert.match(output, /probe-owner-source-compiled-ok/); }
		finally { clearTimeout(timer); child.kill('SIGKILL'); }
	}
}
