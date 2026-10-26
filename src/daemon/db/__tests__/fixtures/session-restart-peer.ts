/** A separate Node process represents the replacement daemon epoch while the
 * previous owner's native work/cleanup is still outstanding. Capabilities use
 * private IPC only; the peer returns counts and a fixed refusal, never tokens. */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export async function restartPeer(mode: string, root: string, resume: { sessionHandle: string; capability: string; daemonEpoch: string }): Promise<void> {
	const baseline = Object.fromEntries(['DEBUG', 'NODE_DEBUG', 'OLLAMA_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL', 'NODE_ORACLEDB_DEBUG_PACKETS', 'ORA_DEBUG_JDWP'].map(key => [key, '']));
	const child = fork(fileURLToPath(new URL('./session-restart-process.ts', import.meta.url)), [mode], { execArgv: ['--import', 'tsx'], env: { ...process.env, ...baseline, INSRC_MODE: 'probe-worker', NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
	let answer: any, output = ''; child.on('message', value => { answer = value; }); child.stdout?.on('data', b => { output += b; }); child.stderr?.on('data', b => { output += b; }); const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
	child.send({ root, resume: { sessionHandle: resume.sessionHandle, capability: resume.capability, daemonEpoch: resume.daemonEpoch } });
	try { const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); assert.equal(code, 0, output); assert.equal(answer?.ok, true); assert.equal(answer.pid, child.pid); assert.notEqual(answer.pid, process.pid); assert.equal(answer.oldCode, 'session-expired'); assert.equal(answer.entries, 0); assert.equal(answer.factoryCalls, 0); } finally { clearTimeout(timer); child.kill('SIGKILL'); }
}
