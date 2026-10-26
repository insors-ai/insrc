import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sessionServices } from './fixtures/session-services.js';

test('CM-S3-ISOLATION: two real workbenches/roots SQL+KV positive rows, replay and full route canary snapshots', { timeout: 180000 }, async () => {
	const directory = await realpath(await mkdtemp(join(tmpdir(), 'cm-sqlkv-')));
	let services: Awaited<ReturnType<typeof sessionServices>> | undefined;
	try {
		services = await sessionServices(directory);
		for (const mode of ['source', 'compiled']) {
			const run = join(directory, mode); await mkdir(run);
			const baseline = Object.fromEntries(['DEBUG', 'NODE_DEBUG', 'OLLAMA_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL', 'NODE_ORACLEDB_DEBUG_PACKETS', 'ORA_DEBUG_JDWP'].map(key => [key, '']));
			const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/session-service-child.ts', import.meta.url)), run, mode], { env: { ...process.env, ...baseline, INSRC_MODE: 'daemon', INSRC_LOG_LEVEL: 'trace', NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
			let output = ''; child.stdout!.on('data', b => { output += b; }); child.stderr!.on('data', b => { output += b; });
			const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
			try {
				child.send!(services.endpoints);
				const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
				assert.equal(code, 0, output); assert.match(output, /service-isolation-ok/); assert.equal(output.includes('CM_ROUTE_PRIVATE_'), false, 'private data reached process output');
			} finally { clearTimeout(timer); child.kill('SIGKILL'); }
			await services.assertDrained();
		}
		assert.equal(services.diagnostics().includes('CM_ROUTE_PRIVATE_'), false, 'private data reached service logs');
	} finally { await services?.close(); await rm(directory, { recursive: true, force: true }); }
});
