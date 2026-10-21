import type { Kit } from './store-kit.js';
import { H, alice, artifact, clock } from './store-kit.js';
import { LifecycleService } from '../lifecycle-service.js';
import type { CodeReviewEvidence, CompletionEvidence } from '../lifecycle.js';
import type { Reference } from '../types.js';

export const EPIC = `EPIC-${H}`;
export const STORY = `STORY-${H}-s1`;
export const T1 = `TASK-${H}-s1-t1`;
export const T2 = `TASK-${H}-s1-t2`;
export const RECORDS = ['LLD', 'PLAN', 'BUILD', 'CR', 'TESTS', 'EXT'].map(kind => `${kind}-${H}-s1`);
export const TASKS = `TASKS-${H}-s1`;
export const DIAGS = [`DIAG-${H}-s1-1`, `DIAG-${H}-s1-2`];

const parent = (entityId: string, type: string): Reference => ({ entityId, type, relation: 'derived-from' });

/** An evidence stub: the listed Tasks passed their build, and the Story's code review is whatever is set. */
export function stubEvidence(passed: string[], review: CodeReviewEvidence = { kind: 'clean' }): CompletionEvidence & { review: CodeReviewEvidence } {
	const evidence = {
		review,
		taskBuildPassed: async (id: string) => passed.includes(id),
		storyCodeReview: async () => evidence.review,
	};
	return evidence;
}

export function service(k: Kit, evidence: CompletionEvidence): LifecycleService {
	return new LifecycleService({ store: k.store, evidence, now: clock() });
}

/** An Epic with one Story: the Define, Epic, Story, two Tasks, Tasks head, two Diagrams and the Story's records, all drafts. */
export async function seedEpic(k: Kit): Promise<void> {
	await k.store.write(artifact(`DEF-${H}`), alice);
	await k.store.write(artifact(`HLD-${H}`), alice);
	await k.store.write(artifact(EPIC), alice);
	await k.store.write(artifact(STORY, { parent: parent(EPIC, 'EPIC') }), alice);
	for (const t of [T1, T2]) await k.store.write(artifact(t, { parent: parent(STORY, 'STORY') }), alice);
	await k.store.write(artifact(TASKS, { parent: parent(STORY, 'STORY') }), alice);
	for (const d of DIAGS) await k.store.write(artifact(d, { parent: parent(STORY, 'STORY') }), alice);
	for (const r of RECORDS) await k.store.write(artifact(r), alice);
}
