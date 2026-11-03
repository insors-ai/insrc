import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('CM-S3-EMBED-DENY: docs/vector/hybrid/lineage/graph routes zero Ollama/ONNX/injected/SDK query calls and no fallback success', async () => {
	const child = spawn(process.execPath, ['--import', 'tsx', '--test', fileURLToPath(new URL('./fixtures/embedding-denial.ts', import.meta.url))], { env: { ...process.env, DEBUG: '', NODE_DEBUG: '', OLLAMA_DEBUG: '', INSRC_MODE: 'probe-worker', NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe'] });
	let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; }); const timer = setTimeout(() => child.kill('SIGKILL'), 25000);
	try { const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); assert.equal(code, 0, output); assert.match(output, /# pass 1\b/); for (const key of ['fail', 'cancelled', 'skipped', 'todo']) assert.match(output, new RegExp('# ' + key + ' 0\\b')); }
	finally { clearTimeout(timer); child.kill('SIGKILL'); }
});
