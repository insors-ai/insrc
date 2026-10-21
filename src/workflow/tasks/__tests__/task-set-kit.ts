import { durableKit } from '../../artifact-core/__tests__/durable-kit.js';
import type { DurableKit } from '../../artifact-core/__tests__/durable-kit.js';
import { alice, H, artifact } from '../../artifact-core/__tests__/store-kit.js';
import { LifecycleService } from '../../artifact-core/lifecycle-service.js';
import { createCompletionEvidence } from '../../artifact-core/completion-evidence.js';
import { History } from '../../artifact-core/history.js';
import { planArtifactId } from '../../storage.js';
import type { PlanTask } from '../../artifacts/plan.js';
import { TaskSets } from '../task-set.js';
import { citations, row } from './task-kit.js';

export { alice, H };
export const bob = { id: 'github:bob', kind: 'person' as const, properties: {} };
export const PLAN = planArtifactId(H, 's1');
export const STORY = `STORY-${H}-s1`;
export const TASKS = `TASKS-${H}-s1`;
export const taskId = (n: number): string => `TASK-${H}-s1-t${n}`;

export interface SetKit {
	readonly k:       DurableKit;
	readonly service: LifecycleService;
	readonly sets:    TaskSets;
	/** Write the plan (and the Define that anchors the work item) and approve it. */
	plan(rows: readonly PlanTask[]): Promise<void>;
	done(): void;
}

export function setKit(): SetKit {
	const k = durableKit();
	const service = new LifecycleService({ store: k.store, evidence: ctx => createCompletionEvidence(k.repo, { overrideReview: ctx.overrideReview }) });
	const sets = new TaskSets({ repoPath: k.repo, store: k.store, service, history: new History(k.sidecar) });
	const plan = async (rows: readonly PlanTask[]): Promise<void> => {
		const existing = await k.store.read(`DEF-${H}`).catch(() => undefined);
		if (existing === undefined) await k.store.write(artifact(`DEF-${H}`), alice);
		const head = await k.store.read(PLAN).catch(() => undefined);
		const next = artifact(PLAN, { payload: { body: { tasks: rows } as unknown as Record<string, unknown>, citations: rows.length > 0 ? citations : [] } });
		await k.store.write(head === undefined ? next : { ...head, payload: next.payload }, alice);
		await service.apply(PLAN, 'approve', alice);
	};
	return { k, service, sets, plan, done: () => k.done() };
}

export const threeRows = (): PlanTask[] => [row('t1', 1), row('t2', 2), row('t3', 3, { dependsOn: ['t1', 't2'] })];
