import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { History } from '../../artifact-core/history.js';
import { createFileSidecarStore } from '../../artifact-core/sidecar-store.js';
import type { Actor } from '../../artifact-core/types.js';
import { ArtifactStore } from '../../artifact-core/store.js';
import { createFileJournal } from '../../artifact-core/journal.js';
import { FeedbackService } from '../feedback-service.js';

const H = '2f27754d4ad00b8e';
const ID = `LLD-${H}-s5`;
const hasGit = spawnSync('git', ['--version']).status === 0;
const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const person = (n: string): Actor => ({ id: `github:${n}`, kind: 'person', properties: {} });

/** A service over one clone, with its own clock so the two clones' entries interleave. */
function serviceOf(dir: string, start: string) {
	const sidecar = createFileSidecarStore(dir);
	const history = new History(sidecar);
	let t = Date.parse(start);
	const now = () => new Date((t += 1000));
	const store = new ArtifactStore({ repoPath: dir, history, journal: createFileJournal(dir), now });
	return { history, svc: new FeedbackService({ history, store, now }), sidecar };
}

describe('feedback-merge', { skip: hasGit ? false : 'git is not available' }, () => {
	it('two clones that add feedback and replies to one artifact merge with no conflict and the threads read back once each in order', async () => {
		const root = mkdtempSync(join(tmpdir(), 'feedback-merge-'));
		try {
			const a = join(root, 'a');
			mkdirSync(a);
			git(a, 'init', '-q', '-b', 'main');
			git(a, 'config', 'user.email', 'a@example.com');
			git(a, 'config', 'user.name', 'A');
			const seedSidecar = createFileSidecarStore(a);
			mkdirSync(join(a, '.insrc/artifacts'), { recursive: true });
			writeFileSync(join(a, seedSidecar.filesOf(ID).head), JSON.stringify({ meta: {}, body: { text: 'one' } }, null, 2) + '\n');
			const seed = serviceOf(a, '2026-10-21T10:00:00Z');
			const rootEntry = { id: 'seed-root', text: 'seed', actor: person('alice'), timestamp: '2026-10-21T10:00:00.000Z', feedback: [], kind: 'comment' as const };
			await seed.history.appendFeedback(ID, rootEntry);
			git(a, 'add', '-A');
			git(a, 'commit', '-q', '-m', 'seed');
			const b = join(root, 'b');
			git(root, 'clone', '-q', a, b);
			git(b, 'config', 'user.email', 'b@example.com');
			git(b, 'config', 'user.name', 'B');

			// both clones add through the service (the head is a plain file here, so use History's append for the entry the
			// store cannot read, and the service's add where the head decodes); replies and roots are separate lines
			const A = serviceOf(a, '2026-10-21T11:00:00Z');
			const B = serviceOf(b, '2026-10-21T11:00:30Z');
			const put = (h: History, id: string, ts: string, inReplyTo?: string) => h.appendFeedback(ID, {
				id, text: id, actor: person('x'), timestamp: ts, feedback: [], kind: 'comment', ...(inReplyTo !== undefined ? { inReplyTo } : {}),
			});
			await put(A.history, 'a-root', '2026-10-21T11:00:00.000Z');
			await put(A.history, 'a-reply', '2026-10-21T11:02:00.000Z', 'seed-root');
			await put(B.history, 'b-root', '2026-10-21T11:01:00.000Z');
			await put(B.history, 'b-reply', '2026-10-21T11:03:00.000Z', 'a-root');
			git(a, 'add', '-A'); git(a, 'commit', '-q', '-m', 'a');
			git(b, 'add', '-A'); git(b, 'commit', '-q', '-m', 'b');

			git(a, 'fetch', '-q', b, 'main');
			git(a, 'merge', '--no-ff', '-m', 'merge b', 'FETCH_HEAD');
			assert.equal(git(a, 'diff', '--name-only', '--diff-filter=U').trim(), '', 'no unmerged file');

			const merged = serviceOf(a, '2026-10-21T12:00:00Z');
			const threads = await merged.svc.threads(ID);
			assert.deepEqual(threads.map(t => t.root.id), ['seed-root', 'a-root', 'b-root'], 'each root once, in order');
			assert.deepEqual(threads.map(t => t.replies.map(r => r.id)), [['a-reply'], ['b-reply'], []]);
			assert.equal((await merged.history.feedback(ID)).length, 5, 'every line once');
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});
