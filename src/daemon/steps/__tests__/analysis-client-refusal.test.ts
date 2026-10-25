import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import type { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { ConnectionSessionRpc } from '../../connection-session-rpc.js';
import { connectionManagementHandlers } from '../../connection-management-rpc.js';
import { createTemporaryOverlay } from '../../db/session-entries.js';
import { sessionRpcClient } from '../../db/__tests__/fixtures/session-rpc-client.js';
import { IpcServer, directDispatch } from '../../server.js';
import { createStepCallHandler, stepToolTable } from '../host.js';
async function run(entry: URL, args: string[], env: NodeJS.ProcessEnv, token?: unknown) {
 const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(entry), ...args], { env: { ...process.env, ...env, INSRC_MODE: 'probe-worker' }, stdio: token ? ['ignore', 'pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'] });
 let output = ''; child.stdout!.on('data', b => { output += b; }); child.stderr!.on('data', b => { output += b; }); const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
 try { if (token) (child.stdio[3] as Writable).write(JSON.stringify(token) + '\n'); const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); assert.equal(code, 0, output); assert.equal(output.includes('DATA_SECRET_CANARY'), false); return output; }
 finally { clearTimeout(timer); child.kill('SIGKILL'); }
}
test('CM-S3-CLIENT-EGRESS: direct one-shot all phases answer-turn and host refuse before input state prompt provider trace or error-evidence reads', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'cm-analysis-refusal-'));
 try { assert.match(await run(new URL('./fixtures/analysis-refusal-child.ts', import.meta.url), [], { INSRC_ANALYZE_STEP_TRACE: join(directory, 'trace.jsonl') }), /analysis-refusal-before-read-ok/); }
 finally { await rm(directory, { recursive: true, force: true }); }
});
test('CM-S3-CLIENT-EGRESS: actual private forwardStep and host deny every unverified analysis phase and one-shot without runner or data-bearing channels', async () => {
 const directory = await realpath(await mkdtemp(join(tmpdir(), 'cm-egress-socket-'))), root = join(directory, 'root'); await mkdir(root);
 const runtime = new ConnectionSessionRpc({ enabled: async () => true, isRegistered: async r => r === root, createOverlay: createTemporaryOverlay, dropOverlay: o => o.close() });
 const table = stepToolTable(); let runners = 0, attaches = 0;
 for (const name of ['insrc_analyze', 'insrc_analyze_step']) { const original = table[name]!; table[name] = (...args) => { runners++; return original(...args); }; }
 const forward = runtime.forward(directDispatch(connectionManagementHandlers({ sessionRuntime: runtime }), { 'step.call': createStepCallHandler(table) }));
 const server = new IpcServer((request, deliver) => { if (request.method === 'db.connections.v2.session.attach') attaches++; return forward(request, deliver); }, Date.now, join(directory, 'rpc.sock')); server.onConnectionClose(c => runtime.disconnect(c)); await server.listen(); const ui = await sessionRpcClient(join(directory, 'rpc.sock'));
 try {
  await ui.call('db.connections.v2.session.open', { repoRoot: root }); const token = { ...await ui.call<Record<string, string>>('db.connections.v2.session.delegate', { repoRoot: root, audience: 'mcp-unverified' }), repoRoot: root };
  assert.match(await run(new URL('../../../mcp/__tests__/session-pipe-child.ts', import.meta.url), [join(directory, 'rpc.sock'), 'all-phases'], {}, token), /all-phases-refused/); assert.equal(attaches, 6); assert.equal(runners, 0);
 } finally { await ui.close(); await server.close(); await runtime.close(); await rm(directory, { recursive: true, force: true }); }
});
