// Runtime evidence collector. IPC only; never opens daemon databases or restarts work.
import { appendFileSync, closeSync, existsSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const repo = process.cwd();
const { codeReviewControl } = await import(pathToFileURL(join(repo, 'src/mcp/daemon-stream.ts')).href);
const { rpc } = await import(pathToFileURL(join(repo, 'src/cli/client.ts')).href);
const target = { repo, epicHash: '484fcef7efaf229e', storyId: 's3' };
const latestPath = join(dir, 'latest.json');
const now = () => new Date().toISOString();
const save = (name, value) => {
  const path = join(dir, name), temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { flush: true });
  renameSync(temp, path);
};
const record = value => {
  const fd = openSync(join(dir, 'history.jsonl'), 'a');
  try { appendFileSync(fd, JSON.stringify(value) + '\n', { flush: true }); }
  finally { closeSync(fd); }
  save('latest.json', value);
};
let handle, epoch;
let prior;
if (existsSync(latestPath)) {
  prior = JSON.parse(readFileSync(latestPath, 'utf8'));
  if (prior.result?.status !== 'pending') throw new Error('Existing terminal or interrupted attempt; never relaunch automatically');
  handle = prior.result.reviewHandle;
  epoch = prior.result.daemonEpoch;
}
save('monitor-process.json', { pid: process.pid, startedAt: now(), node: process.version, target });
try {
  if (handle === undefined) {
    const daemon = await rpc('daemon.status');
    save('admission.json', { requestedAt: now(), target, groundingMode: 'degraded',
      head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: repo }).trim(),
      daemon: { installedCommit: daemon.installedCommit, uptime: daemon.uptime },
      independentReviewComplete: false, task23Complete: false });
  }
  for (;;) {
    const operation = handle === undefined ? 'start' : 'status';
    let result;
    try {
      result = await codeReviewControl(operation === 'start'
        ? { ...target, operation, groundingMode: 'degraded' }
        : { ...target, operation, reviewHandle: handle }, { timeoutMs: 200000 });
    } catch (err) {
      const failure = { recordedAt: now(), operation, reviewHandle: handle, daemonEpoch: epoch,
        error: err.message, reason: err.reason, failure: err.failure, completedReview: false };
      record(failure);
      console.error(JSON.stringify(failure));
      // A lost initial response cannot be restarted safely. With a known handle,
      // retry only a disconnected waiter; the operation's clock is never reset.
      if (handle !== undefined && ['timeout', 'closed', 'unreachable'].includes(err.failure)) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        continue;
      }
      process.exitCode = 1;
      break;
    }
    if (epoch !== undefined && epoch !== result.daemonEpoch) throw new Error('Daemon epoch changed; refusing to rebind review');
    handle = result.reviewHandle;
    epoch = result.daemonEpoch;
    const value = { receivedAt: now(), target, groundingMode: 'degraded', result };
    record(value);
    console.log(JSON.stringify({ receivedAt: value.receivedAt, status: result.status,
      lastProgress: result.progress?.at(-1), chunkCount: result.timing?.chunkCount,
      error: result.error, reason: result.reason }));
    if (result.status !== 'pending') {
      save('terminal.json', value);
      break;
    }
  }
} catch (err) {
  const failure = { recordedAt: now(), reviewHandle: handle, daemonEpoch: epoch,
    error: err.message, reason: err.reason, completedReview: false };
  record(failure);
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
}
