import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { H, alice, artifact } from '../../artifact-core/__tests__/store-kit.js';
import { durableKit } from '../../artifact-core/__tests__/durable-kit.js';
import { attachDocuments } from '../attach.js';
import { bindArtifact, readAttachments } from '../binding.js';
import type { PortResult, TrackerComment, TrackerPort } from '../port.js';
import type { UnitRef } from '../refs.js';

const LLD = `LLD-${H}-s6`;
const MD = 'docs/epics/demo/S006/LLD.md';
const DIAGRAM = 'docs/epics/demo/S006/sequence.html';
const git = (repo: string, ...args: string[]): string => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

interface Fake { readonly port: TrackerPort; readonly calls: string[]; comments: TrackerComment[]; failList: boolean; failAttach: boolean }
function fakePort(): Fake {
	const fake: Fake = { calls: [], comments: [], failList: false, failAttach: false, port: undefined as never };
	let id = 100;
	(fake as { port: TrackerPort }).port = {
		listComments: (): PortResult<TrackerComment[]> => { fake.calls.push('list'); return fake.failList ? { ok: false, kind: 'unreachable', reason: 'offline' } : { ok: true, value: fake.comments }; },
		postComment: (): PortResult<{ externalId: string }> => ({ ok: true, value: { externalId: String(++id) } }),
		attach: (_issue: string, ref: { entityId: string }, link: string): PortResult<{ externalId?: string }> => {
			fake.calls.push(`attach:${link}`);
			return fake.failAttach ? { ok: false, kind: 'rejected', reason: 'nope' } : { ok: true, value: { externalId: String(++id) } };
		},
	} as unknown as TrackerPort;
	return fake;
}

async function seeded() {
	const k = durableKit();
	git(k.repo, 'init', '-q', '-b', 'main');
	git(k.repo, 'config', 'user.email', 't@example.com');
	git(k.repo, 'config', 'user.name', 'T');
	git(k.repo, 'remote', 'add', 'origin', 'https://github.com/acme/demo.git');
	await k.store.write(artifact(`DEF-${H}`), alice);
	await k.store.write(artifact(LLD), alice);
	mkdirSync(join(k.repo, 'docs/epics/demo/S006'), { recursive: true });
	writeFileSync(join(k.repo, MD), '# LLD v1\n');
	git(k.repo, 'add', '-A'); git(k.repo, 'commit', '-q', '-m', 'v1');
	const unit: UnitRef = { unit: 'story', repoPath: k.repo, epicHash: H, storyId: 's6' };
	return { k, unit };
}
const bump = async (k: Awaited<ReturnType<typeof seeded>>['k'], text: string) => k.store.write({ ...(await k.store.read(LLD)), payload: { body: { text }, citations: [] } }, alice);
const target = { artifactId: LLD, relPath: MD };

describe('attach', () => {
	it('attachDocuments builds a link to the file at the last commit that touched it, refuses a dirty or untracked file, skips a recorded (target, revision), adds a new link for a new commit and keeps the old attachment, and records a link found already posted without posting it again', async () => {
		const { k, unit } = await seeded();
		try {
			const fake = fakePort();
			// an unbound unit: everything is refused and nothing is posted
			const unbound = attachDocuments(unit, fake.port, [target]);
			assert.deepEqual(unbound.failed.map(f => f.reason), ['the unit is not bound to an issue yet']);
			assert.deepEqual(fake.calls, []);
			assert.ok(bindArtifact(k.repo, LLD, 'acme/demo#7').ok);

			// the link names the last commit that touched the file
			const sha1 = git(k.repo, 'log', '-1', '--format=%H', '--', MD);
			const first = attachDocuments(unit, fake.port, [target], { now: () => '2026-10-21T10:00:00.000Z' });
			assert.deepEqual(first.attached, [`https://github.com/acme/demo/blob/${sha1}/${MD}`]);
			assert.deepEqual(fake.calls, ['list', `attach:https://github.com/acme/demo/blob/${sha1}/${MD}`]);
			const recorded = readAttachments(k.repo, LLD);
			assert.equal(recorded.length, 1);
			assert.deepEqual(recorded[0], { target: { entityId: LLD, type: 'LLD', relation: 'documents', fragment: MD }, revision: 1, at: '2026-10-21T10:00:00.000Z', externalId: '101' });

			// a commit that does not touch the file does not change its link; a recorded (target, revision) is skipped with no tracker call
			writeFileSync(join(k.repo, 'other.txt'), 'x'); git(k.repo, 'add', '-A'); git(k.repo, 'commit', '-q', '-m', 'other');
			fake.calls.length = 0;
			const again = attachDocuments(unit, fake.port, [target]);
			assert.deepEqual(again.skipped, [MD]);
			assert.deepEqual(fake.calls, []);

			// a new revision is refused while its file is untracked or has uncommitted changes
			await bump(k, 'two');
			writeFileSync(join(k.repo, DIAGRAM), '<html></html>');
			writeFileSync(join(k.repo, MD), '# LLD v2\n');
			const dirty = attachDocuments(unit, fake.port, [target, { artifactId: LLD, relPath: DIAGRAM }]);
			assert.match(dirty.failed.find(f => f.target === MD)?.reason ?? '', /has uncommitted changes: commit the file first/);
			assert.match(dirty.failed.find(f => f.target === DIAGRAM)?.reason ?? '', /is not tracked by git: commit the file first/);
			assert.equal(fake.calls.some(c => c.startsWith('attach:')), false, 'nothing is posted for a file that is not clean');
			assert.equal(readAttachments(k.repo, LLD).length, 1, 'nothing is recorded for it');

			// committed, the revision gets a new link and the old attachment stays
			git(k.repo, 'add', '-A'); git(k.repo, 'commit', '-q', '-m', 'v2');
			const sha2 = git(k.repo, 'log', '-1', '--format=%H', '--', MD);
			assert.notEqual(sha2, sha1);
			const second = attachDocuments(unit, fake.port, [target, { artifactId: LLD, relPath: DIAGRAM }]);
			assert.equal(second.attached.length, 2);
			assert.ok(second.attached.includes(`https://github.com/acme/demo/blob/${sha2}/${MD}`));
			const all = readAttachments(k.repo, LLD);
			assert.equal(all.length, 3);
			assert.deepEqual(all.map(a => [a.target.fragment, a.revision]), [[MD, 1], [MD, 2], [DIAGRAM, 2]], 'the old attachment stays, the diagram is its own target');

			// a link already posted but not recorded is recorded and not posted again
			await bump(k, 'three');
			writeFileSync(join(k.repo, MD), '# LLD v3\n'); git(k.repo, 'add', '-A'); git(k.repo, 'commit', '-q', '-m', 'v3');
			const sha3 = git(k.repo, 'log', '-1', '--format=%H', '--', MD);
			const link3 = `https://github.com/acme/demo/blob/${sha3}/${MD}`;
			fake.comments = [{ externalId: '555', author: 'insrc', text: `Attached LLD \`${LLD}\`: ${link3}`, at: '2026-10-21T11:00:00Z' }];
			fake.calls.length = 0;
			const found = attachDocuments(unit, fake.port, [target]);
			assert.deepEqual(found.reconciled, [link3]);
			assert.equal(fake.calls.some(c => c.startsWith('attach:')), false, 'not posted again');
			assert.equal(readAttachments(k.repo, LLD).at(-1)?.externalId, '555');

			// a failing tracker is reported and nothing is recorded: a comment list that cannot be read posts nothing, an attach that fails records nothing
			await bump(k, 'four');
			writeFileSync(join(k.repo, MD), '# LLD v4\n'); git(k.repo, 'add', '-A'); git(k.repo, 'commit', '-q', '-m', 'v4');
			const count = readAttachments(k.repo, LLD).length;
			fake.comments = []; fake.calls.length = 0;
			fake.failList = true;
			assert.match(attachDocuments(unit, fake.port, [target]).failed[0]?.reason ?? '', /could not be read \(unreachable\)/);
			assert.equal(fake.calls.some(c => c.startsWith('attach:')), false);
			fake.failList = false; fake.failAttach = true;
			assert.match(attachDocuments(unit, fake.port, [target]).failed[0]?.reason ?? '', /could not attach .*\(rejected\)/);
			assert.equal(readAttachments(k.repo, LLD).length, count);
			// no GitHub origin: nothing to link to
			assert.match(attachDocuments(unit, fake.port, [target], { repoSlug: () => null }).failed[0]?.reason ?? '', /no GitHub origin/);
			// a Task unit has no artifact to hold attachments yet
			assert.match(attachDocuments({ ...unit, unit: 'task', taskId: 't1' }, fake.port, [target]).failed[0]?.reason ?? '', /no artifact of its own/);
		} finally { k.done(); }
	});
});
