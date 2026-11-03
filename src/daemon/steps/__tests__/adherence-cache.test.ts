import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
test('CM-S3-ADHERENCE-CACHE: warm topic record denied before read/write/enumeration; in-memory constraints positive path', async () => {
	const root = await mkdtemp(join(tmpdir(), 'cm-adherence-cache-'));
	const baseline = Object.fromEntries(['DEBUG', 'NODE_DEBUG', 'OLLAMA_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL', 'NODE_ORACLEDB_DEBUG_PACKETS', 'ORA_DEBUG_JDWP'].map(key => [key, '']));
	const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/adherence-cache.ts', import.meta.url)), root], { env: { ...process.env, ...baseline, INSRC_MODE: 'probe-worker', NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe'] });
	let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; }); const timer = setTimeout(() => child.kill('SIGKILL'), 25000);
	try { const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); assert.equal(code, 0, output); assert.match(output, /"completed":true/); assert.equal(output.includes('CM_PRIVATE_'), false); }
	finally { clearTimeout(timer); child.kill('SIGKILL'); await rm(root, { recursive: true, force: true }); }
});
