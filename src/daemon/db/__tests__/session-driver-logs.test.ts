import {runRemovalPrivacy} from './fixtures/removal-privacy-run.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ambientFlags = ['DEBUG', 'NODE_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL', 'NODE_ORACLEDB_DEBUG_PACKETS', 'ORA_DEBUG_JDWP'];
const baselineDiagnostics = Object.fromEntries(ambientFlags.map(key => [key, '']));

test('CM-S3-DRIVER-LOGS: normal daemon source and compiled SDK resources stay quiet through idle reconnect expiry and disposal while saved markers remain', async () => {
 const directory = await realpath(await mkdtemp(join(tmpdir(), 'cm-session-sdk-logs-')));
 try {
  for (const compiled of [false, true]) {
   const run = join(directory, compiled ? 'compiled' : 'source'); await mkdir(run);
   const fixture = new URL('./fixtures/session-driver-logs-child.ts', import.meta.url);
   // Baseline SDK ambient diagnostics are explicit; the separate refusal test enables them.
   // The fixture stays a TS harness; all production modules and PATHS come from the selected source/out tree.
   const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(fixture), run, compiled ? 'compiled' : 'source'], { env: { ...process.env, INSRC_MODE: 'daemon', INSRC_LOG_LEVEL: 'trace', ...baselineDiagnostics, MONGODB_LOG_ALL: 'trace', MONGODB_LOG_COMMAND: 'trace', MONGODB_LOG_PATH: 'stderr' }, stdio: ['ignore', 'pipe', 'pipe'] });
   let stdout = '', stderr = ''; child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
   let timedOut = false; const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 25000);
   try {
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); assert.equal(timedOut, false, 'normal daemon fixture timed out'); assert.equal(code, 0, stderr);
    assert.match(stdout, /"completed":true/);
    let logs = ''; for (const name of await readdir(join(run, 'logs'), { recursive: true })) try { logs += await readFile(join(run, 'logs', name), 'utf8'); } catch { /* directories */ }
    for (const marker of ['CM_SAVED_DRIVER_POSITIVE_MARKER', 'CM_SAVED_EVENT_POSITIVE_MARKER', 'CM_SAVED_AFTER_EXPIRY_MARKER', 'CM_SAVED_LOG_POSITIVE_MARKER']) assert.ok(logs.includes(marker), 'saved marker missing from actual daemon rotating log');
    for (const canary of ['CM_TEMP_PRIVATE_ERROR_CANARY', 'CM_TEMP_PRIVATE_ENDPOINT_CANARY', 'CM_TEMP_PRIVATE_FORMAT_CANARY', 'CM_TEMP_PRIVATE_ROW_CANARY', 'CM_TEMP_PRIVATE_TABLE_CANARY', 'CM_TEMP_PRIVATE_PATH_CANARY', 'CM_TEMP_PRIVATE_DATABASE_CANARY']) assert.equal((stdout + stderr + logs).includes(canary), false, 'temporary canary escaped resource diagnostics');
   } finally { clearTimeout(timer); child.kill('SIGKILL'); }
  }
 } finally { await rm(directory, { recursive: true, force: true }); }
});

test('CM-S3-DRIVER-LOGS: ambient SDK debugging refuses temporary construction without disabling saved resources', async () => {
 const directory = await realpath(await mkdtemp(join(tmpdir(), 'cm-sdk-debug-refusal-')));
 try {
  for (const flag of ambientFlags) {
  const run = join(directory, flag); await mkdir(run);
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/session-driver-logs-child.ts', import.meta.url)), run, 'source', 'ambient-refusal'], { env: { ...process.env, ...baselineDiagnostics, INSRC_MODE: 'daemon', [flag]: flag === 'DEBUG' ? 'ioredis:*' : '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  try { const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); assert.equal(code, 0, output); assert.match(output, /ambient-refusal-ok/); assert.equal(output.includes('CM_TEMP_PRIVATE_ENDPOINT_CANARY'), false); }
  finally { clearTimeout(timer); child.kill('SIGKILL'); }
  }
 } finally { await rm(directory, { recursive: true, force: true }); }
});

test('CM-S3-DRIVER-LOGS: installed SDK diagnostic controls retain reviewed source and version evidence for all 14 modules', async () => {
 const { createHash } = await import('node:crypto');
 const audit = JSON.parse(await readFile(new URL('./fixtures/session-sdk-diagnostics.json', import.meta.url), 'utf8')) as { modules: { module: string; package: string; version: string; temporary: string; rationale: string }[]; sourceDigests: Record<string, string> };
 assert.equal(audit.modules.length, 14); assert.equal(new Set(audit.modules.map(row => row.module)).size, 14);
 for (const row of audit.modules) {
  assert.ok(row.rationale.length > 80);
  if (row.package !== 'node:sqlite') { const pkg = JSON.parse(await readFile(new URL('../../../../node_modules/' + row.package + '/package.json', import.meta.url), 'utf8')); assert.equal(pkg.version, row.version, 'SDK upgraded: review diagnostic controls before updating evidence'); }
 }
 assert.deepEqual(audit.modules.filter(row => row.temporary === 'unsupported').map(row => row.module).sort(), ['etcd', 'nats']);
 for (const [file, expected] of Object.entries(audit.sourceDigests)) assert.equal(createHash('sha256').update(await readFile(new URL('../../../../node_modules/' + file, import.meta.url))).digest('hex'), expected, 'SDK diagnostic source changed: inspect asynchronous sinks before updating evidence');
});

test('CM-S4-PRIVACY/NO-PERSIST: source and compiled removal replies and rotating logs hide SDK journal and capability canaries',{timeout:75000},async t=>{
 for(const mode of ['source','compiled'] as const)t.diagnostic(JSON.stringify(await runRemovalPrivacy(mode)));
});
