import { durableKit } from '../../artifact-core/__tests__/durable-kit.js';
import type { DurableKit } from '../../artifact-core/__tests__/durable-kit.js';
import { H, alice, artifact } from '../../artifact-core/__tests__/store-kit.js';
import { History } from '../../artifact-core/history.js';
import { FeedbackService } from '../../feedback/feedback-service.js';
import { bindArtifact } from '../binding.js';
import type { CommentSyncDeps } from '../comment-sync.js';
import type { PortResult, TrackerComment, TrackerPort } from '../port.js';
import type { UnitRef } from '../refs.js';

export { H, alice };
export const TASK = `TASK-${H}-s1-t1`;
export const LLD = `LLD-${H}-s1`;
/** The Story's head: its issue is bound on it and its comments are recorded on it. */
export const STORY = `STORY-${H}-s1`;
export const ISSUE = 'acme/demo#7';

export interface FakeTracker {
	readonly port:    TrackerPort;
	comments:         TrackerComment[];
	/** Every body posted through postComment, in order. */
	readonly posts:   string[];
	failList:         boolean;
	failPost:         boolean;
	/** Post succeeds on the tracker but its answer is lost (the post is listed, yet the call fails). */
	loseAnswer:       boolean;
}

export const comment = (id: number, text: string, author = 'carol', at = '2026-10-22T10:00:00.000Z'): TrackerComment =>
	({ externalId: String(id), author, text, at, url: `https://github.com/acme/demo/issues/7#issuecomment-${id}` });

export function fakeTracker(): FakeTracker {
	let next = 9000;
	const fake: FakeTracker = { comments: [], posts: [], failList: false, failPost: false, loseAnswer: false, port: undefined as never };
	(fake as { port: TrackerPort }).port = {
		listComments: (): PortResult<TrackerComment[]> => fake.failList ? { ok: false, kind: 'unreachable', reason: 'offline' } : { ok: true, value: [...fake.comments] },
		postComment: (_issue: string, body: string): PortResult<{ externalId: string }> => {
			if (fake.failPost) return { ok: false, kind: 'unreachable', reason: 'post failed' };
			const externalId = String(++next);
			fake.posts.push(body);
			fake.comments.push({ externalId, author: 'subho', text: body, at: '2026-10-22T11:00:00.000Z' });
			return fake.loseAnswer ? { ok: false, kind: 'unreachable', reason: 'the answer was lost' } : { ok: true, value: { externalId } };
		},
	} as unknown as TrackerPort;
	return fake;
}

export interface SyncKit {
	readonly k:        DurableKit;
	readonly deps:     CommentSyncDeps;
	readonly history:  History;
	readonly feedback: FeedbackService;
	readonly task:     UnitRef;
	readonly story:    UnitRef;
	done(): void;
}

/** A repository with a Define, a Story head bound to #2 and a Task (plan row t1) bound to #7, and the feedback service over the same history. */
export async function syncKit(): Promise<SyncKit> {
	const k = durableKit();
	await k.store.write(artifact(`DEF-${H}`), alice);
	await k.store.write(artifact(TASK), alice);
	await k.store.write(artifact(LLD), alice);
	await k.store.write(artifact(STORY), alice);
	if (!bindArtifact(k.repo, TASK, ISSUE).ok || !bindArtifact(k.repo, STORY, 'acme/demo#2').ok) throw new Error('the fixtures could not be bound');
	const history = new History(k.sidecar);
	// each entry a millisecond after the last, so entries sort in the order they were made
	let tick = 0;
	const feedback = new FeedbackService({ history, store: k.store, now: () => new Date(Date.parse('2026-10-22T12:00:00.000Z') + tick++) });
	return {
		k, history, feedback, deps: { feedback, history, store: k.store },
		task:  { unit: 'task', repoPath: k.repo, epicHash: H, storyId: 's1', taskId: 't1' },
		story: { unit: 'story', repoPath: k.repo, epicHash: H, storyId: 's1' },
		done: () => k.done(),
	};
}
