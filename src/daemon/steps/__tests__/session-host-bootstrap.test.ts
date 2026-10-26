import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import type { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { IpcServer, directDispatch } from '../../server.js';
import { ConnectionSessionRpc } from '../../connection-session-rpc.js';
import { connectionManagementHandlers } from '../../connection-management-rpc.js';
import { createTemporaryOverlay } from '../../db/session-entries.js';
import { createStepCallHandler } from '../host.js';
import { currentStepContext, requireConnectionExecution } from '../../../shared/step-context.js';
import type { ConnectionExecutionContext } from '../../../shared/step-context.js';
import { sessionRpcClient } from '../../db/__tests__/fixtures/session-rpc-client.js';
async function fixture() {
 const directory = await realpath(await mkdtemp(join(tmpdir(), 'cm-session-host-'))), root = join(directory, 'root'), other = join(directory, 'other'); await mkdir(root); await mkdir(other);
 const runtime = new ConnectionSessionRpc({ enabled: async () => true, isRegistered: async r => r === root || r === other, createOverlay: createTemporaryOverlay, dropOverlay: o => o.close() });
 const seen: { method: string; connection: string }[] = []; let calls = 0, execution: ConnectionExecutionContext | undefined;
 const handler = createStepCallHandler({ insrc_analyze_step: async (_args, _signal, _progress, fourth) => { calls++; execution = fourth; if (fourth) { assert.equal(requireConnectionExecution(fourth), fourth); assert.throws(() => requireConnectionExecution({ ...fourth })); } assert.equal(currentStepContext()?.connectionExecution, fourth); return { content: [{ type: 'text', text: 'safe-test-control' }] }; } });
 const forward = runtime.forward(directDispatch(connectionManagementHandlers({ sessionRuntime: runtime }), { 'step.call': handler }));
 const server = new IpcServer((request, deliver) => { seen.push({ method: request.method, connection: request.trustedContext!.connectionIdentity }); return forward(request, deliver); }, Date.now, join(directory, 'host.sock')); server.onConnectionClose(c => runtime.disconnect(c)); await server.listen();
 const ui = await sessionRpcClient(join(directory, 'host.sock'));
 return { directory, root, other, runtime, server, ui, seen, get calls() { return calls; }, get execution() { return execution; }, async close() { await ui.close(); await server.close(); await runtime.close(); await rm(directory, { recursive: true, force: true }); } };
}
async function stream(path: string, messages: unknown[]) {
 const socket = createConnection(path); await once(socket, 'connect'); let buffer = ''; const frames: unknown[] = [];
 const done = new Promise<void>((resolve, reject) => { socket.on('error', reject); socket.on('data', chunk => { buffer += chunk; for (;;) { const end = buffer.indexOf('\n'); if (end < 0) return; const value = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); frames.push(value); if (value.id === 1 && value.result?.attached === true && (messages[0] as {method?:string})?.method === 'db.connections.v2.session.attach') for (const message of messages.slice(1)) socket.write(JSON.stringify(message) + '\n'); if (value.stream === 'done' || value.stream === 'error') resolve(); } }); });
 for (const value of ((messages[0] as {method?:string})?.method === 'db.connections.v2.session.attach' ? messages.slice(0,1) : messages)) socket.write(JSON.stringify(value) + '\n');
 return { socket, frames, done };
}
test('CM-S3-MCP: trusted fourth host argument is frozen nonserializable owner authority and caller JSON cannot replace it', async () => {
 const f = await fixture();
 try {
  const opened = await f.ui.call<{ sessionHandle: string }>('db.connections.v2.session.open', { repoRoot: f.root });
  const token = { ...await f.ui.call<Record<string, string>>('db.connections.v2.session.delegate', { repoRoot: f.root, audience: 'workbench-ui' }), repoRoot: f.root };
  const client = await stream(join(f.directory, 'host.sock'), [{ id: 1, method: 'db.connections.v2.session.attach', params: token }, { id: 2, method: 'step.call', stream: true, params: { tool: 'insrc_analyze_step', args: { phase: 'start' }, context: { cwd: f.other, envRepo: f.other, connectionExecution: { mode: 'saved' } } } }]);
  try { await client.done; assert.equal(f.calls, 1, JSON.stringify(client.frames)); const execution = f.execution!; assert.equal(execution.mode, 'session-memory'); assert.equal(execution.connectionAccess.sessionHandle, opened.sessionHandle); assert.equal(execution.connectionAccess.lookupRoot, f.root); assert.equal(Object.isFrozen(execution), true); assert.throws(() => requireConnectionExecution(execution)); assert.throws(() => JSON.stringify(execution)); assert.throws(() => requireConnectionExecution({ ...execution })); }
  finally { client.socket.destroy(); }
  const unbound = await stream(join(f.directory, 'host.sock'), [{ id: 1, method: 'step.call', stream: true, params: { tool: 'insrc_analyze_step', args: {}, context: { cwd: f.root, connectionExecution: { mode: 'session-memory', connectionAccess: { sessionHandle: opened.sessionHandle } } } } }]);
  try { await unbound.done; assert.equal(f.calls, 2); assert.equal(f.execution, undefined); } finally { unbound.socket.destroy(); }
 } finally { await f.close(); }
});

test('CM-S3-MCP: real private inherited pipe attaches every fresh socket and refuses wrong epoch root audience control tokens and lost bootstrap', async () => {
 const f = await fixture();
 try {
  const opened = await f.ui.call<Record<string, string>>('db.connections.v2.session.open', { repoRoot: f.root });
  const token = { ...await f.ui.call<Record<string, string>>('db.connections.v2.session.delegate', { repoRoot: f.root, audience: 'mcp-unverified' }), repoRoot: f.root };
  const uiToken = { ...await f.ui.call<Record<string, string>>('db.connections.v2.session.delegate', { repoRoot: f.root, audience: 'workbench-ui' }), repoRoot: f.root };
  for (const [value, admitted] of [[token, true], [{ ...token, daemonEpoch: randomUUID() }, false], [{ ...token, repoRoot: f.other }, false], [uiToken, false], [{ ...opened, heartbeatMs: undefined, leaseMs: undefined, repoRoot: f.root }, false]] as const) {
   const before = f.seen.length;
   const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../../../mcp/__tests__/session-pipe-child.ts', import.meta.url)), join(f.directory, 'host.sock')], { env: { ...process.env, INSRC_MODE: 'probe-worker' }, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
   assert.ok(!child.spawnargs.join(' ').includes(String(value.capability))); let output = '', error = ''; child.stdout!.on('data', data => { output += data; if (output.includes('attached-twice') && !output.includes('lost-pipe-refused')) { (child.stdio[3] as Writable).end(); child.stdin!.write('continue\n'); } }); child.stderr!.on('data', data => { error += data; });
   const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
   try {
    (child.stdio[3] as Writable).write(JSON.stringify(value) + '\n');
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); assert.equal(code, 0, error); assert.match(output, /lost-pipe-refused/); assert.equal((output + error).includes(String(value.capability)), false);
    const observed = f.seen.slice(before); assert.equal(observed.filter(v => v.method === 'db.connections.v2.session.attach').length, 2); assert.equal(observed.filter(v => v.method === 'step.call').length, admitted ? 2 : 0, JSON.stringify(observed));
    for (const connection of new Set(observed.map(v => v.connection))) { const methods = observed.filter(v => v.connection === connection).map(v => v.method); assert.equal(methods[0], 'db.connections.v2.session.attach'); }
    assert.equal(f.calls, 0, 'unverified caller must not reach a runner');
   } finally { clearTimeout(timer); child.kill('SIGKILL'); }
  }
 } finally { await f.close(); }
});

test('CM-S3-MCP: current control refreshes only the data delegation on the same private pipe after resume', async () => {
 const f = await fixture();
 try {
  const opened = await f.ui.call<Record<string, string>>('db.connections.v2.session.open', { repoRoot: f.root }), token = { ...await f.ui.call<Record<string, string>>('db.connections.v2.session.delegate', { repoRoot: f.root, audience: 'mcp-unverified' }), repoRoot: f.root };
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../../../mcp/__tests__/session-pipe-child.ts', import.meta.url)), join(f.directory, 'host.sock'), 'refresh'], { env: { ...process.env, INSRC_MODE: 'probe-worker' }, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
  let output = '', error = ''; child.stdout!.on('data', data => { output += data; }); child.stderr!.on('data', data => { error += data; }); const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
  const until = async (marker: string) => { const start = Date.now(); while (!output.includes(marker)) { if (child.exitCode !== null || Date.now() - start > 10000) throw new Error('private pipe phase did not complete'); await new Promise(r => setTimeout(r, 5)); } };
  try {
   (child.stdio[3] as Writable).write(JSON.stringify(token) + '\n'); await until('attached-twice');
   await f.ui.call('db.connections.v2.session.resume', { sessionHandle: opened.sessionHandle, capability: opened.capability, daemonEpoch: opened.daemonEpoch });
   const refreshed = { ...await f.ui.call<Record<string, string>>('db.connections.v2.session.delegate', { repoRoot: f.root, audience: 'mcp-unverified' }), repoRoot: f.root };
   (child.stdio[3] as Writable).write(JSON.stringify(refreshed) + '\n'); child.stdin!.write('refresh\n'); await until('refreshed-once');
   (child.stdio[3] as Writable).end(); child.stdin!.write('lost\n');
   const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); assert.equal(code, 0, error); assert.match(output, /lost-pipe-refused/);
   assert.equal(f.seen.filter(v => v.method === 'step.call').length, 3); assert.equal(f.seen.filter(v => v.method === 'db.connections.v2.session.attach').length, 3); assert.equal(f.calls, 0); assert.equal((output + error).includes(opened.capability!), false); assert.equal((output + error).includes(token.capability!), false);
  } finally { clearTimeout(timer); child.kill('SIGKILL'); }
 } finally { await f.close(); }
});
