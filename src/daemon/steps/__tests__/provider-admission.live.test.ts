import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('CM-S3-PROVIDER: actual admitted local Ollama no-persistence smoke; unavailable evidence is pending and admission stays refused', { skip: process.env.INSRC_PROVIDER_LIVE !== '1' }, async () => {
	const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/provider-live.ts', import.meta.url)), process.env.INSRC_PROVIDER_MODE ?? 'source'], { detached: true, env: { ...process.env, INSRC_MODE: 'daemon', INSRC_LOG_LEVEL: 'trace', DEBUG: '', NODE_DEBUG: '', NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe'] });
	let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
	let timedOut = false; const timer = setTimeout(() => { timedOut = true; if (child.pid) process.kill(-child.pid, 'SIGTERM'); }, 600000);
	try { const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); assert.equal(timedOut, false, 'isolated local privacy smoke timed out'); assert.equal(code, 0, output); assert.match(output, /"completed":true/); assert.match(output, /"actualService":true/); }
	finally { clearTimeout(timer); if (child.pid) try { process.kill(-child.pid, 'SIGKILL'); } catch { } }
});
