import { finalCommand, forgetPlan, framePlan, integrationFixture } from './store-integration.js';
import type { ForgetSelector } from '../../store/types.js';
import type { Json } from '../../types.js';
import { scope } from './store-rows.js';

const send = (value: unknown) => new Promise<void>((resolve, reject) => process.send!(value, error => error ? reject(error) : resolve()));
async function hold(stage: string, detail: Record<string, unknown> = {}): Promise<never> { await send({ type: 'boundary', stage, ...detail }); return new Promise(() => {}); }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve }; }
async function run() {
  process.channel?.ref();
  const directory = process.argv[2]!, mode = process.argv[3]!, readReached = deferred();
  const f = await integrationFixture({ async point(point) {
    if (point === 'before-write' && mode === 'before-write') await hold('before-write');
    if (point === 'before-write' && mode === 'race') await send({ type: 'boundary', stage: 'race' });
    if (point === 'after-write' && mode === 'before-reply') await hold('before-reply');
    if (point === 'read-before-final' && mode === 'reader-delete') { readReached.resolve(); await new Promise(() => {}); }
  } }, directory);
  await send({ type: 'baseline', generation: (await f.store.readRoot()).generation, storeId: f.store.storeId });
  const command = finalCommand('accepted-operation'), accepted = await f.appendWithReceipt(command), a = accepted.frame;
  await send({ type: 'accepted', frame: a, receipt: accepted.receipt });
  const planned = framePlan(a, '0', 100, 'operation');
  if (mode === 'accepted') await hold('accepted');
  if (mode.startsWith('forget-')) {
    const selector: ForgetSelector = mode === 'forget-project' ? { kind: 'project' } : mode === 'forget-session' ? { kind: 'session', sessionId: a.command.source.sessionId } : { kind: 'conversation', producerId: a.command.source.producerId, sessionId: a.command.source.sessionId };
    const b = await f.append(finalCommand('forget-before-old-plan', { kind: 'forget', scope: { projectId: scope.projectId }, input: { target: selector as unknown as Json } }));
    await send({ type: 'accepted-forget', frame: b });
    f.clock(200); const receipt = await f.store.commit(forgetPlan(b, '0', 200, selector));
    await hold('forget-committed', { receipt });
  }
  const receipt = await f.store.commit(planned);
  if (mode === 'race') await hold('race-completed', { receipt });
  if (mode === 'before-ack') await hold('before-ack', { receipt });
  await f.queue.markResolved(a.operationId, receipt.generation!);
  if (mode === 'after-ack') await hold('after-ack', { receipt });
  if (mode === 'reader-delete') {
    void f.store.current(scope, await f.store.snapshot(scope)).catch(() => {});
    await readReached.promise;
    const selector = { kind: 'session' as const, sessionId: a.command.source.sessionId };
    const b = await f.append(finalCommand('forget-during-pinned-read', { kind: 'forget', scope: { projectId: scope.projectId }, input: { target: selector } }));
    await send({ type: 'accepted-forget', frame: b });
    f.clock(200); const forgotten = await f.store.commit(forgetPlan(b, '1', 200, selector));
    await hold('reader-forget-committed', { receipt: forgotten });
  }
  await f.queue.recycleResolvedSegments();
  await hold('after-recycle', { receipt });
}
void run().catch(error => { process.stderr.write(String(error)); process.exit(1); });
