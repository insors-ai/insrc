import type { TestContext } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ProductionReviews, installProductionReviews } from '../../../review-service.js';
import { ThreadServices } from '../../main-services.js';
import { IpcServer, directDispatch } from '../../../server.js';
import { startTaskReview, readTaskReviewProgress, exchangeControllerTaskReview, publishStoredTaskReview, cancelTaskReview } from '../../../task-review-rpc.js';
import { designReviewOperation } from '../../../design-review-rpc.js';
import { LocalPeer } from './review-clearance-fixture.js';

/** Unmodified production worker selection. Tests act as controller reviewers;
 * no provider, preparation, publication or resource implementation is replaced. */
export async function productionRoutes(t: TestContext, repos: readonly string[]) {
 const root = await mkdtemp('/tmp/review-routes-'), workers: import('node:worker_threads').Worker[] = [];
 const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: 'fixture' }));
 const host = new ProductionReviews({ services, registeredRepos: async () => new Set(repos), track: w => { workers.push(w); } });
 installProductionReviews(host);
 const server = new IpcServer(directDispatch({
  'taskReview.start': startTaskReview, 'taskReview.progress': readTaskReviewProgress, 'taskReview.publish': publishStoredTaskReview, 'taskReview.cancel': cancelTaskReview,
  ...Object.fromEntries((['assignment', 'scope', 'result', 'activity'] as const).map(phase => [`taskReview.${phase}`, (p: unknown, c: import('../../../request-context.js').TrustedRpcContext | undefined) => exchangeControllerTaskReview(p, c, phase)])),
  ...Object.fromEntries((['start', 'recover', 'progress', 'assignment', 'plan', 'impact', 'result', 'activity', 'failure', 'cancel'] as const).map(phase => [`designReview.${phase}`, (p: unknown, c: import('../../../request-context.js').TrustedRpcContext | undefined) => designReviewOperation(phase, p, c)])),
 }), Date.now, join(root, 'daemon.sock'));
 await server.listen(); const peers: LocalPeer[] = [];
 t.after(async () => { for (const p of peers) p.close(); await server.close(); await host.shutdown(); await rm(root, { recursive: true, force: true }); });
 return { host, workers, async peer() { const p = await LocalPeer.connect(join(root, 'daemon.sock')); peers.push(p); return p; } };
}
