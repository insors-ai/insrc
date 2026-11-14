import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFile, writeFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir, cpus, loadavg } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { ReviewNativeHost } from '../review-native-host.js';
import { ReviewWorkerNativeTransport } from '../review-worker-native.js';
import { ReviewProcessLeases } from '../review-processes.js';
import { updateReviewWorkerResource } from '../review-worker-resources.js';
import { reviewWorkerCheckpoint } from '../review-worker-contract.js';
import { withReviewNativeTransport } from '../../../shared/review-process-bridge.js';
import { RegistryReviewSources } from '../../../workflow/code-review/task-review/sources.js';
import { registerGitTools } from '../../tools/builtins/git/index.js';
import { decodeStoredCheckpoint } from '../../../workflow/code-review/task-review/admission-checkpoint.js';

const root = new URL('./fixtures/review-preparation/', import.meta.url);
async function retained() {
 const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
 const bytes = gunzipSync(await readFile(new URL('history.json.gz', root)));
 assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.checkpointSha256);
 assert.equal(bytes.length, manifest.checkpointBytes);
 return { manifest, bytes, history: decodeStoredCheckpoint(JSON.parse(bytes.toString())) };
}

test('retained four-attempt workload preserves exact selected scope and historical feedback', async () => {
 const { manifest, history } = await retained();
 assert.equal(history.attempts.length, 4);
 const packet = history.attempts.at(-1)!.submitted;
 const files = [...new Set(packet.reviewSet.flatMap(p => p.files.map(f => f.path)))].sort();
 const commits = [...new Set(packet.reviewSet.map(p => p.commit))].sort();
 assert.equal(files.length, 171); assert.equal(commits.length, 40);
 assert.deepEqual(files, manifest.files); assert.deepEqual(commits, manifest.commits);
 assert.equal(packet.reviewRevision, manifest.sourceRevision);
 assert.ok(history.attempts.slice(0, 3).every(a => 'review-response' in a));
 const p = manifest.historicalBaseline.profile;
 assert.equal(p.packets.reduce((sum: number, a: { calls: number }) => sum + a.calls, 0), 13031);
 assert.equal(p.distinctQueries, 5052);
 assert.match(manifest.historicalBaseline.mode, /outside managed/);
});

test('retained workload managed Git baseline records durable native writes without invoking a provider', async t => {
 const { history, manifest } = await retained();
 // Copy objects across filesystems; never mutate the source refs/working tree.
 // No alternates: isolated Git deliberately refuses alternate object stores.
 const source = fileURLToPath(new URL('../../../../', import.meta.url));
 const directory = await mkdtemp(join(tmpdir(), 'review-preparation-baseline-'));
 t.after(() => rm(directory, { recursive: true, force: true }));
 const repo = join(directory, 'project');
 execFileSync('git', ['clone', '--local', '--no-hardlinks', '--no-checkout', '--quiet', source, repo], {
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
 });
 const registered = new Set([repo]); // isolated host registry, never the user's DB
 const identity = { key: { project: repo, family: 'code' as const, reviewId: 'retained-baseline' }, incarnation: 'baseline-owner' };
 const path = reviewWorkerCheckpoint(identity.key);
 const snapshot = JSON.parse(JSON.stringify(history));
 snapshot.project = repo; snapshot.reviewId = identity.key.reviewId;
 // This copied evidence has no authority over the original native owner.
 for (const a of snapshot.attempts) delete a.resourceGuard;
 await mkdir(join(repo, '.insrc/tmp/code-review'), { recursive: true });
 await writeFile(path, JSON.stringify(snapshot));
 const { port1, port2 } = new MessageChannel();
 let host!: ReviewNativeHost;
 let writes = 0, writtenBytes = 0, commands = 0;
 const leases = new ReviewProcessLeases({
  authorize: (r, command) => {
   assert.ok(registered.has(r.key.project)); assert.equal(command.cwd, repo);
   assert.equal(command.command, 'git'); commands++;
  },
  verifyIntent: async (r, receipt) => {
   host.verifyIntent(r, receipt);
   const saved = decodeStoredCheckpoint(JSON.parse(await readFile(path, 'utf8')));
   assert.ok(saved.attempts.at(-1)!.resourceGuard?.openLeases.some(l => l.operationId === r.operationId));
  },
 });
 const owner = leases.register(identity.key, identity.incarnation);
 host = new ReviewNativeHost({ leases, owner, port: port1,
  persist: async (op, r, closure) => {
   const receipt = await updateReviewWorkerResource(identity, op, r, closure);
   writes++; writtenBytes += (await stat(path)).size; return receipt;
  }, resolveBinary: async c => c, assertActive: () => {}, onLost: () => {},
 });
 t.after(async () => { await host.flushClosures(); host.dispose(); port2.close(); });
 const transport = new ReviewWorkerNativeTransport(port2, identity);
 registerGitTools();
 const sources = new RegistryReviewSources({ repoPath: repo, sessionId: 'retained-baseline', requestId: 0, send: () => {} });
 const packet = history.attempts.at(-1)!.submitted;
 const item = packet.reviewSet[0]!;
 const began = performance.now();
 // Small managed sample establishes durability amplification without repeating
 // the known pathological full 13K-query run on every test invocation. The
 // retained full history is the later cold/warm qualification workload.
 await withReviewNativeTransport(transport, async () => {
  await sources.commit(packet.reviewRevision!);
  assert.ok(await sources.file(item.commit, item.files[0]!.path));
  await sources.commit(packet.reviewRevision!);
 });
 const report = { mode: 'managed-native-sample-not-full-qualification',
  fixtureDigest: manifest.checkpointSha256, elapsedMs: performance.now() - began,
  node: process.version, platform: process.platform, cpu: cpus()[0]?.model, load: loadavg(),
  commands, fullHistoryWrites: writes, serializedBytes: writtenBytes, logicalQueries: 3, distinctQueries: 2,
  providerCalls: 0 };
 assert.equal(commands, 3); assert.equal(writes, 6);
 assert.ok(writtenBytes > manifest.checkpointBytes * 5);
 assert.equal((await readFile(path, 'utf8')).includes('retained-baseline'), true);
 t.diagnostic(JSON.stringify(report));
});
