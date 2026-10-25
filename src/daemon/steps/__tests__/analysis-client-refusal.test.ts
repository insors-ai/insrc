import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { runAnalyzeOneShot } from '../analyze-oneshot.js';
import { forwardStep } from '../../../mcp/forward-step.js';
import '../../db/drivers/index.js';
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
 const database = new DatabaseSync(join(root, 'private.sqlite')); database.exec("CREATE TABLE data(marker TEXT); INSERT INTO data VALUES ('DATA_SECRET_CANARY')"); database.close();
 const overlays = new Map<string, import('../../db/session-entries.js').TemporaryConnectionOverlay>();
 const runtime = new ConnectionSessionRpc({ enabled: async () => true, isRegistered: async r => r === root, createOverlay: (r, h, c) => { const overlay = createTemporaryOverlay(r, h, c); overlays.set(h, overlay); return overlay; }, dropOverlay: o => o.close() });
 const table = stepToolTable(); let runners = 0, attaches = 0, uiRuns = 0, savedRuns = 0;
 for (const name of ['insrc_analyze', 'insrc_analyze_step']) { const original = table[name]!; table[name] = (...args) => { runners++; return original(...args); }; }
 // Exercise the real one-shot admission/intent/render path, using its existing run port for deterministic data work.
 table['insrc_analyze'] = (args, _signal, _progress, execution) => { runners++; return runAnalyzeOneShot(args, { wrap: fn => fn(), buildRun: async () => {
  if (execution?.mode === 'session-memory') {
   uiRuns++; const overlay = overlays.get(execution.connectionAccess.sessionHandle!)!;
   const resolver = overlay.resolver(execution.connectionAccess, { assertActive: execution.assertActive, signal: execution.lifetime.signal, registerDrain: execution.lifetime.registerDrain });
   const result = await resolver.withConnection(execution.connectionAccess, 'data', async driver => { assert.equal(driver.family, 'rdbms'); return driver.sample('data', { limit: 1 }); });
   return { ok: true, bundle: { system: '', focus: '', summary: JSON.stringify(result), structure: '', surface: '', artefacts: '', upstream: '' } };
  }
  savedRuns++; return { ok: true, bundle: { system: '', focus: '', summary: 'SAVED_POSITIVE_REPORT', structure: '', surface: '', artefacts: '', upstream: '' } };
 } }, execution); };
 const audience = new Map<string, string>(), rawFrames: unknown[] = [];
 const forward = runtime.forward(directDispatch(connectionManagementHandlers({ sessionRuntime: runtime }), { 'step.call': createStepCallHandler(table) }));
 const server = new IpcServer((request, deliver) => {
  const identity = request.trustedContext!.connectionIdentity;
  if (request.method === 'db.connections.v2.session.attach') attaches++;
  return forward(request, envelope => {
   if (request.method === 'db.connections.v2.session.attach' && envelope.kind === 'reply') { const result = envelope.result as { audience?: string }; if (result?.audience) audience.set(identity, result.audience); }
   if (request.method === 'step.call' && audience.get(identity) === 'mcp-unverified') rawFrames.push(envelope);
   deliver(envelope);
  });
 }, Date.now, join(directory, 'rpc.sock')); server.onConnectionClose(c => runtime.disconnect(c)); await server.listen(); const ui = await sessionRpcClient(join(directory, 'rpc.sock'));
 try {
  const opened = await ui.call<{sessionHandle:string}>('db.connections.v2.session.open', { repoRoot: root }), overlay = overlays.get(opened.sessionHandle)!;
  overlay.commit(await overlay.prepare({ key: { repoRoot: root, scope: 'temporary', id: 'data' }, mode: 'create', publicPatch: { kind: 'sqlite', path: 'private.sqlite' } }));
  const config = overlay.commit(await overlay.prepare({ key: { repoRoot: root, scope: 'temporary', id: 'private-config' }, mode: 'create', publicPatch: { kind: 'postgres', endpoint: 'postgres://127.0.0.1:1/private' }, credentials: { 'url.password': { action: 'replace', value: 'CONFIG_SECRET_CANARY' } } }));
  await overlay.withGeneration('private-config', config.revision, value => { assert.ok(JSON.stringify(value).includes('CONFIG_SECRET_CANARY')); });
  const token = { ...await ui.call<Record<string, string>>('db.connections.v2.session.delegate', { repoRoot: root, audience: 'mcp-unverified' }), repoRoot: root };
  assert.match(await run(new URL('../../../mcp/__tests__/session-pipe-child.ts', import.meta.url), [join(directory, 'rpc.sock'), 'all-phases'], {}, token), /all-phases-refused/); assert.equal(attaches, 6); assert.equal(runners, 0); assert.equal(uiRuns, 0); assert.equal(savedRuns, 0);
  assert.equal(rawFrames.length, 6);
  for (const envelope of rawFrames) { const frame = envelope as {kind:string;frame:{stream:string;data:{code:string}}}; assert.equal(frame.kind, 'frame'); assert.equal(frame.frame.stream, 'error'); assert.equal(frame.frame.data.code, 'unsupported-temporary'); for (const canary of ['DATA_SECRET_CANARY', 'CONFIG_SECRET_CANARY']) assert.equal(JSON.stringify(frame).includes(canary), false); }
  // A saved-only MCP forwarder completes real one-shot dispatch and rendering.
  const saved = await forwardStep('insrc_analyze', { repo: root, focus: 'saved control' }, {}, { connect: () => createConnection(join(directory, 'rpc.sock')) }); assert.equal(saved.isError, undefined); assert.ok(JSON.stringify(saved).includes('SAVED_POSITIVE_REPORT')); assert.equal(savedRuns, 1);
  const uiToken = { ...await ui.call<Record<string,string>>('db.connections.v2.session.delegate', { repoRoot: root, audience: 'workbench-ui' }), repoRoot: root };
  const socket = createConnection(join(directory, 'rpc.sock')); await once(socket, 'connect'); let buffer = '';
  try {
   const result = new Promise<unknown>((resolve, reject) => { socket.on('error', reject); socket.on('data', chunk => { buffer += chunk; for (;;) { const end = buffer.indexOf('\n'); if (end < 0) return; const value = JSON.parse(buffer.slice(0,end)); buffer=buffer.slice(end+1); if (value.id===1 && value.result?.attached) socket.write(JSON.stringify({id:2,method:'step.call',stream:true,params:{tool:'insrc_analyze',args:{repo:root,focus:'UI data control'},context:{cwd:root}}})+'\n'); if(value.stream==='done')resolve(value.data); if(value.stream==='error')reject(new Error('UI analysis refused')); } }); });
   socket.write(JSON.stringify({id:1,method:'db.connections.v2.session.attach',params:uiToken})+'\n'); assert.ok(JSON.stringify(await result).includes('DATA_SECRET_CANARY')); assert.equal(uiRuns,1);
  } finally { socket.destroy(); }
 } finally { await ui.close(); await server.close(); await runtime.close(); await rm(directory, { recursive: true, force: true }); }
});
