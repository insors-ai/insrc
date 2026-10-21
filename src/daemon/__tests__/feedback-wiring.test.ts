import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { H, alice, artifact } from '../../workflow/artifact-core/__tests__/store-kit.js';
import type { Feedback, Reference } from '../../workflow/artifact-core/types.js';
import type { FeedbackThread } from '../../workflow/feedback/threads.js';
import { IdentityService } from '../../workflow/identity/identity-service.js';
import { handleFeedbackAdd, handleFeedbackList, handleIdentityDeclare, handleIdentityShow } from '../feedback-handlers.js';
import { lifecycleFor, resetLifecycleRegistry } from '../lifecycle-registry.js';
import type { RepoLifecycle } from '../lifecycle-registry.js';

const PLAN = `PLAN-${H}-s5`;
const STORY = `STORY-${H}-s5`;
const TASK = `TASK-${H}-s5-t1`;

describe('feedback-wiring', () => {
	it("the daemon's artifact.feedback.add, artifact.feedback.list, identity.show and identity.declare handlers use the repository's FeedbackService and the identity service", async () => {
		resetLifecycleRegistry();
		const repo = mkdtempSync(join(tmpdir(), 'feedback-wiring-'));
		const home = mkdtempSync(join(tmpdir(), 'feedback-wiring-home-'));
		try {
			const real = lifecycleFor(repo);
			const identity = new IdentityService({
				path: join(home, 'identity.json'), hostId: 'h', osUser: () => 'dana', hostname: () => 'box',
				loadTracker: () => ({ ok: false, kind: 'rejected', reason: 'none' }), run: async () => ({ stdout: '', stderr: '', code: 1, spawnError: false, timedOut: false, stdoutTruncated: false }),
			});
			const deps = { lifecycleFor: (r: string): RepoLifecycle => ({ ...lifecycleFor(r), identity }) };
			assert.strictEqual(deps.lifecycleFor(repo).feedback, real.feedback, 'the repository entry carries the one FeedbackService');

			const parent: Reference = { entityId: STORY, type: 'STORY', relation: 'derived-from' };
			await real.store.write(artifact(`DEF-${H}`), alice);
			await real.store.write(artifact(PLAN), alice);
			await real.store.write(artifact(STORY), alice);
			await real.store.write(artifact(TASK, { parent }), alice);

			// the request's actor is recorded; with none given, the current actor is
			const named = await handleFeedbackAdd({ repo, artifactId: PLAN, text: 'by name', actor: 'github:erin' }, undefined, deps) as Feedback;
			assert.equal(named.actor.id, 'github:erin');
			const current = await handleFeedbackAdd({ repo, artifactId: PLAN, text: 'by default', kind: 'revision-request' }, undefined, deps) as Feedback;
			assert.equal(current.actor.id, 'os:dana@box');
			assert.equal(current.kind, 'revision-request');
			const reply = await handleFeedbackAdd({ repo, artifactId: PLAN, text: 'reply', inReplyTo: named.id }, undefined, deps) as Feedback;
			assert.equal(reply.inReplyTo, named.id);
			const onTask = await handleFeedbackAdd({ repo, artifactId: TASK, text: 'on a task' }, repo, deps) as Feedback;
			assert.equal(onTask.id.length, 32);

			// a bad actor, a missing artifact, a bad kind, a missing repo: refused, nothing recorded
			const before = (await real.feedback.threads(PLAN)).length;
			for (const bad of [
				{ repo, artifactId: PLAN, text: 'x', actor: 'Erin' },
				{ repo, artifactId: PLAN, text: 'x', actor: { id: 'GitHub:Erin' } },
				{ repo, artifactId: `PLAN-${H}-s9`, text: 'x' },
				{ repo, artifactId: PLAN, text: 'x', kind: 'shout' },
				{ repo, artifactId: PLAN, text: '  ' },
				{ repo, text: 'x' },
			]) assert.ok('error' in (await handleFeedbackAdd(bad, undefined, deps)), JSON.stringify(bad));
			assert.ok('error' in (await handleFeedbackAdd({ artifactId: PLAN, text: 'x' }, undefined, deps)), 'no repo');
			assert.equal((await real.feedback.threads(PLAN)).length, before);

			// list: threads for any artifact, a Task included
			const all = await handleFeedbackList({ repo, artifactId: PLAN }, undefined, deps) as { threads: FeedbackThread[] };
			assert.deepEqual(all.threads.map(t => t.root.id), [named.id, current.id].sort((a, b) => (a === named.id ? named : current).timestamp.localeCompare((b === named.id ? named : current).timestamp) || a.localeCompare(b)));
			assert.deepEqual(all.threads.find(t => t.root.id === named.id)?.replies.map(r => r.id), [reply.id]);
			const tasks = await handleFeedbackList({ repo, artifactId: TASK }, undefined, deps) as { threads: FeedbackThread[] };
			assert.deepEqual(tasks.threads.map(t => t.root.id), [onTask.id]);
			assert.ok('error' in (await handleFeedbackList({ repo }, undefined, deps)));
			// open: a revision addresses the threads, so none is open after it
			await real.service.updateContent(PLAN, alice, { body: { text: 'revised' }, citations: [] });
			assert.deepEqual(((await handleFeedbackList({ repo, artifactId: PLAN, open: true }, undefined, deps)) as { threads: FeedbackThread[] }).threads, []);
			assert.equal(((await handleFeedbackList({ repo, artifactId: PLAN }, undefined, deps)) as { threads: FeedbackThread[] }).threads.length, 2);

			// identity: none, declare, show, invalid declaration refused
			assert.deepEqual(await handleIdentityShow({ identity }), { identity: null });
			assert.deepEqual(await handleIdentityDeclare({ primary: 'github:dana', aliases: ['os:dana@box'] }, { identity }), { identity: { primary: 'github:dana', aliases: ['os:dana@box'] } });
			assert.deepEqual(await handleIdentityShow({ identity }), { identity: { primary: 'github:dana', aliases: ['os:dana@box'] } });
			assert.ok('error' in (await handleIdentityDeclare({ primary: 'Dana', aliases: [] }, { identity })));
			const aliased = await handleFeedbackAdd({ repo, artifactId: TASK, text: 'again' }, undefined, deps) as Feedback;
			assert.deepEqual(aliased.actor.properties, { aliases: ['github:dana'] }, 'the declared ids ride on the current actor');

			// a repository whose entry cannot be created is refused
			resetLifecycleRegistry();
			const missing = join(repo, 'nope');
			const refused = await handleFeedbackAdd({ repo: missing, artifactId: PLAN, text: 'x' }, undefined) as { error: string };
			assert.match(refused.error, /artifact\.feedback\.add: no lifecycle store/);
			assert.match(((await handleFeedbackList({ repo: missing, artifactId: PLAN }, undefined)) as { error: string }).error, /no lifecycle store/);
		} finally { resetLifecycleRegistry(); rmSync(repo, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); }
	});
});
