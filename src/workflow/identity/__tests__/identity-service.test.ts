import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ShellResult } from '../../../daemon/tools/shell-helper.js';
import { localIdentityDeps, resolveLearner } from '../../../understanding/identity.js';
import type { LoadTracker, PortResult, TrackerPort } from '../../tracker/port.js';
import { IdentityError, IdentityService } from '../identity-service.js';

const shell = (stdout: string, code = 0): ShellResult => ({ stdout, stderr: '', code, spawnError: false, timedOut: false, stdoutTruncated: false });
const git = (email: string | undefined) => async () => email === undefined ? shell('', 1) : shell(`${email}\n`);
/** A tracker whose whoAmI answers `login`, or fails when `login` is undefined. */
const tracker = (login: string | undefined): LoadTracker => () => ({
	ok: true,
	value: { whoAmI: (): PortResult<string> => login === undefined ? { ok: false, kind: 'unavailable', reason: 'offline' } : { ok: true, value: login } } as unknown as TrackerPort,
});
const noTracker: LoadTracker = () => ({ ok: false, kind: 'rejected', reason: 'no tracker' });

function setup() {
	const dir = mkdtempSync(join(tmpdir(), 'identity-'));
	const path = join(dir, 'identity.json');
	const make = (over: Partial<ConstructorParameters<typeof IdentityService>[0]> = {}) =>
		new IdentityService({ path, hostId: 'host-1', loadTracker: tracker('Alice'), run: git('Alice@Example.com'), osUser: () => 'Bob', hostname: () => 'Box', ...over });
	return { dir, path, make, done: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('identity-service', () => {
	it("IdentityService.currentActor builds github:<login> from the tracker's whoAmI, falls back to git then os when the tracker does not answer, and copies the declared aliases only onto the declared primary or an alias", async () => {
		const s = setup();
		try {
			const actor = await s.make().currentActor(s.dir);
			assert.deepEqual(actor, { id: 'github:alice', kind: 'person', properties: {} });

			// the tracker does not answer: git, then os; always lower-case and namespaced
			assert.equal((await s.make({ loadTracker: tracker(undefined) }).currentActor(s.dir)).id, 'git:alice@example.com');
			assert.equal((await s.make({ loadTracker: noTracker }).currentActor(s.dir)).id, 'git:alice@example.com');
			assert.equal((await s.make({ loadTracker: noTracker, run: git(undefined) }).currentActor(s.dir)).id, 'os:bob@box');
			const throwing: LoadTracker = () => { throw new Error('boom'); };
			assert.equal((await s.make({ loadTracker: throwing, run: git(undefined) }).currentActor(s.dir)).id, 'os:bob@box', 'never throws');

			// the same choice as the shared learner resolution makes from the same inputs
			const learner = (await resolveLearner(s.dir, { ...localIdentityDeps('host-1', git('Alice@Example.com')), providers: [] })).learner;
			assert.equal(learner.source, 'git');
			assert.equal(`git:${learner.subject}`.toLowerCase(), (await s.make({ loadTracker: noTracker }).currentActor(s.dir)).id);

			// aliases ride only on the declared primary or an alias
			await s.make().declare({ primary: 'github:alice', aliases: ['git:alice@example.com', 'github:alice-work'] });
			assert.deepEqual((await s.make().currentActor(s.dir)).properties, { aliases: ['git:alice@example.com', 'github:alice-work'] });
			assert.deepEqual((await s.make({ loadTracker: noTracker }).currentActor(s.dir)).properties, { aliases: ['github:alice', 'github:alice-work'] }, 'an alias is a declared id too');
			assert.deepEqual((await s.make({ loadTracker: tracker('carol') }).currentActor(s.dir)).properties, {}, 'another person gets none');

			// an invalid file does not block attribution
			writeFileSync(s.path, '{ nope');
			assert.deepEqual(await s.make().currentActor(s.dir), { id: 'github:alice', kind: 'person', properties: {} });
		} finally { s.done(); }
	});

	it('IdentityService.declare validates namespaced lower-case ids, rejects duplicates and more than twenty aliases, and replaces the file atomically; show reports an invalid file instead of treating it as empty', async () => {
		const s = setup();
		try {
			const svc = s.make();
			assert.equal(await svc.show(), undefined, 'none declared');

			const written = await svc.declare({ primary: 'github:alice', aliases: ['git:a@x.io'] });
			assert.deepEqual(written, { primary: 'github:alice', aliases: ['git:a@x.io'] });
			assert.deepEqual(await svc.show(), written);
			assert.deepEqual(readdirSync(s.dir), ['identity.json'], 'no temporary file is left');

			const before = readFileSync(s.path, 'utf8');
			const twenty = Array.from({ length: 20 }, (_, i) => `github:a${i}`);
			const twentyOne = [...twenty, 'github:a20'];
			for (const bad of [
				{ primary: 'alice', aliases: [] },
				{ primary: 'GitHub:Alice', aliases: [] },
				{ primary: 'github:alice', aliases: ['Git:A@x.io'] },
				{ primary: 'github:alice', aliases: ['github:alice'] },
				{ primary: 'github:alice', aliases: ['git:a', 'git:a'] },
				{ primary: 'github:alice', aliases: twentyOne },
			]) await assert.rejects(svc.declare(bad), IdentityError, JSON.stringify(bad).slice(0, 60));
			assert.equal(readFileSync(s.path, 'utf8'), before, 'a refused declaration leaves the file as it was');
			assert.equal((await svc.declare({ primary: 'github:alice', aliases: twenty })).aliases.length, 20);

			// show reports an invalid file
			for (const text of ['{ nope', '[]', JSON.stringify({ primary: 'Alice', aliases: [] }), JSON.stringify({ primary: 'github:a', aliases: 'x' })]) {
				writeFileSync(s.path, text);
				await assert.rejects(svc.show(), IdentityError, text);
			}
			rmSync(s.path);
			assert.equal(existsSync(s.path), false);
			assert.equal(await svc.show(), undefined);
		} finally { s.done(); }
	});
});
