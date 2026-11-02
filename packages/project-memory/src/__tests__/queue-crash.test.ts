import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, rm, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { OperationReceipt } from '../types.js';
import { acquireOwnership } from '../ownership.js';
import { FileQueue } from '../queue/file-queue.js';
import { QueueAdmission } from '../queue/admission.js';
import { options } from './fixtures/options.js';
import { nativeTest } from './fixtures/node22.js';
import { crashCommand, crashLimits, crashPolicy, crashVerifier } from './fixtures/queue-crash-ports.js';
import type { CrashScenario } from './fixtures/queue-crash-ports.js';
const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const peer = fileURLToPath(new URL('./fixtures/queue-crash-peer.ts', import.meta.url));
function scenarios(): CrashScenario[] {
  const result: CrashScenario[] = [];
  const add = (mode: CrashScenario['mode'], op: string, path: string, occurrence = 1, short = false) => {
    for (const phase of ['before', 'after'] as const) result.push({ name: `${mode}:${phase}:${op}:${path}:${occurrence}${short ? ':short' : ''}`, mode, phase, operation: op, path, occurrence, short });
  };
  add('bootstrap', 'write-chunk', 'format.json', 1, true);
  add('bootstrap', 'file-sync', 'format.json');
  add('bootstrap', 'write-chunk', 'segments/00000000000000000001.jsonl', 1, true);
  add('bootstrap', 'rename', 'checkpoint.next->checkpoint.json');
  const successor = 'segments/00000000000000000002.jsonl';
  for (const [op, path, occurrence] of [
    ['write-chunk', successor, 1], ['file-sync', successor, 1], ['directory-sync', 'segments', 1],
    ['file-sync', 'checkpoint.prev.next', 1], ['rename', 'checkpoint.prev.next->checkpoint.prev', 1],
    ['directory-sync', 'queue', 1], ['file-sync', 'checkpoint.next', 1], ['rename', 'checkpoint.next->checkpoint.json', 1],
    ['write-chunk', successor, 2], ['file-sync', successor, 2], ['rename', 'checkpoint.next->checkpoint.json', 2], ['directory-sync', 'queue', 4],
  ] as const) add('append', op, path, occurrence);
  for (const [op, path, occurrence] of [
    ['rename', 'checkpoint.next->receipt-barrier.json', 1], ['rename', 'checkpoint.next->checkpoint.json', 1],
    ['unlink', 'segments/00000000000000000001.jsonl', 1], ['directory-sync', 'segments', 1],
    ['write-chunk', successor, 1], ['rename', 'checkpoint.next->checkpoint.json', 2],
  ] as const) add('retire', op, path, occurrence);
  add('retire', 'write-chunk', successor, 1, true);
  add('repair', 'write-chunk', 'checkpoint.next', 1, true);
  add('repair', 'rename', 'checkpoint.next->recovery.json');
  add('repair', 'truncate', 'segments/00000000000000000001.jsonl');
  add('repair', 'rename', 'checkpoint.next->recovery.json', 2);
  result.push({ name: 'after-observed-accepted-reply', mode: 'reply', phase: 'after', operation: '', path: '', occurrence: 1 });
  return result;
}
async function killAtBoundary(root: string, scenario: CrashScenario): Promise<OperationReceipt[]> {
  const env = { ...process.env }; delete env['NODE_TEST_CONTEXT'];
  const child = fork(peer, [root, JSON.stringify(scenario)], { cwd: packageRoot, execPath: process.execPath, execArgv: ['--import', 'tsx'], env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  return new Promise((resolve, reject) => {
    const accepted: OperationReceipt[] = []; let barrier = false, stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(Error('Crash barrier timed out: ' + scenario.name + ': ' + stderr)); }, 20_000);
    child.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4096); });
    child.on('message', value => {
      const message = value as { type?: string; receipt?: OperationReceipt };
      if (message.type === 'accepted' && message.receipt) accepted.push(message.receipt);
      if (message.type === 'barrier') { barrier = true; child.kill('SIGKILL'); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (_code, signal) => { clearTimeout(timer); if (barrier && signal === 'SIGKILL') resolve(accepted); else reject(Error('Child did not reach crash boundary: ' + scenario.name + ': ' + stderr)); });
  });
}

nativeTest(import.meta.url, 'accepted-set-survives-process-kill-at-every-boundary', async context => {
  const checked: string[] = [];
  for (const scenario of scenarios()) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-sigkill-')));
    try {
      const accepted = await killAtBoundary(root, scenario);
      if (scenario.mode !== 'bootstrap') assert.ok(accepted.length >= 1, scenario.name + ': parent must actually observe accepted');
      if (scenario.mode === 'reply') assert.equal(accepted.length, 2);
      const owner = await acquireOwnership(options(root));
      const queue = new FileQueue(owner, root, crashLimits, {}, scenario.mode === 'retire' ? crashVerifier(root) : undefined);
      try {
        try { await queue.start(); } catch (error) { assert.fail(scenario.name + ': ' + String(error)); }
        const admission = new QueueAdmission(queue, crashPolicy);
        for (const receipt of accepted) {
          const status = await admission.operation({ scope: crashCommand(receipt.eventId).scope, operationId: receipt.operationId });
          assert.equal(status.operationId, receipt.operationId, scenario.name);
          const before = queue.stats().pendingBytes;
          assert.equal((await admission.append(crashCommand(receipt.eventId))).operationId, receipt.operationId);
          assert.equal(queue.stats().pendingBytes, before, scenario.name + ': retry must not append');
        }
        const sequence: bigint[] = [], ids: string[] = [];
        for await (const frame of admission.replay()) { sequence.push(BigInt(frame.sequence)); ids.push(frame.operationId); }
        assert.equal(new Set(ids).size, ids.length, scenario.name);
        for (let i = 1; i < sequence.length; i++) assert.ok(sequence[i]! > sequence[i - 1]!, scenario.name);
      } finally { await queue.close(); await owner.close(); }
      checked.push(scenario.name);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
  assert.equal(checked.length, 55);
  context.diagnostic(`Verified ${checked.length} actual SIGKILL boundaries with an observed-accepted-set oracle; fake receipt tests do not qualify Lance or power-loss durability.`);
  const output = process.env['INSRC_MEMORY_CRASH_EVIDENCE'];
  if (output) await writeFile(output, JSON.stringify({ node: process.versions.node, platform: process.platform, arch: process.arch, scenarios: checked }, null, 2) + '\n');
});

nativeTest(import.meta.url, 'macos-apfs-linux-ext4-node22-queue-qualification', async context => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-platform-')));
  try {
    const fs = await statfs(root);
    assert.match(process.versions.node, /^22\./);
    if (process.platform === 'darwin') assert.equal(fs.type, 26);
    else { assert.equal(process.platform, 'linux'); assert.equal(fs.type, 0xef53); assert.equal(execFileSync('findmnt', ['-no', 'FSTYPE', '-T', root], { encoding: 'utf8' }).trim(), 'ext4'); }
    context.diagnostic(JSON.stringify({ node: process.versions.node, abi: process.versions.modules, platform: process.platform, release: release(), arch: process.arch, filesystemType: fs.type }));
  } finally { await rm(root, { recursive: true, force: true }); }
});
