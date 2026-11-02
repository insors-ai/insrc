import { acquireOwnership } from '../../ownership.js';
import { FileQueue } from '../../queue/file-queue.js';
import { QueueAdmission } from '../../queue/admission.js';
import { recoverQueue } from '../../queue/recovery.js';
import { options } from './options.js';
import { crashCommand, crashLimits, crashPolicy, crashVerifier, writeCrashReceipt } from './queue-crash-ports.js';
import type { CrashScenario } from './queue-crash-ports.js';
const root = process.argv[2]!, scenario = JSON.parse(process.argv[3]!) as CrashScenario;
const send = (message: unknown) => new Promise<void>((resolve, reject) => { process.send!(message, error => error ? reject(error) : resolve()); });
async function barrier(): Promise<void> { await send({ type: 'barrier' }); await new Promise<void>(() => {}); }
let enabled = scenario.mode === 'bootstrap', seen = 0;
async function point(phase: string, op: string, path: string) {
  if (enabled && phase === scenario.phase && op === scenario.operation && path === scenario.path && ++seen === scenario.occurrence) await barrier();
}
async function run(): Promise<void> {
  const owner = await acquireOwnership(options(root));
  const queue = new FileQueue(owner, root, crashLimits, {
    before: (op, path) => point('before', op, path), after: (op, path) => point('after', op, path),
    ...(scenario.short ? { async write(file, bytes, offset, length, position) { return (await file.write(bytes, offset, Math.min(length, 7), position)).bytesWritten; } } : {}),
  }, scenario.mode === 'retire' ? crashVerifier(root) : undefined);
  await queue.start(); const admission = new QueueAdmission(queue, crashPolicy);
  const baseline = await admission.append(crashCommand('baseline')); await send({ type: 'accepted', receipt: baseline });
  if (scenario.mode === 'retire') { await writeCrashReceipt(root); await queue.markResolved(baseline.operationId, 'g1'); }
  if (scenario.mode === 'repair') {
    const active = queue.writer.current.segments.at(-1)!;
    await queue.io.write('segments/' + active.id + '.jsonl', Buffer.from('{"incomplete'), 'append', active.acceptedOffset);
  }
  enabled = true;
  if (scenario.mode === 'retire') await queue.recycleResolvedSegments();
  else if (scenario.mode === 'repair') await recoverQueue(queue.io, queue.writer, await queue.io.bootstrap(), crashLimits);
  else { const second = await admission.append(crashCommand('attempt')); await send({ type: 'accepted', receipt: second }); if (scenario.mode === 'reply') await barrier(); }
  throw Error('Requested crash boundary was not reached.');
}
void run().catch(error => { process.stderr.write(String(error)); process.exit(1); });
