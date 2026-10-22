import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { planConversion } from '../plan.js';
import { anchorOf, applyStamps, stampRule } from '../stamps.js';
import type { RawHead } from '../types.js';

const E = 'aaaaaaaaaaaaaaaa';   // an epic with a Define
const I = 'bbbbbbbbbbbbbbbb';   // an issue
const S = 'cccccccccccccccc';   // a standalone design with no Define
const N = 'dddddddddddddddd';   // a work item with no head and not standalone

const git = (repo: string, ...args: string[]): void => { execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' }); };
const heads: Record<string, unknown> = {
	[`DEF-${E}`]:    { meta: { epicHash: E, createdAt: '2026-07-01T00:00:00.000Z' }, body: {} },
	[`HLD-${E}`]:    { meta: { epicHash: E, createdAt: '2026-07-02T00:00:00.000Z', revision: 2 }, body: {} },
	[`LLD-${E}-s1`]: { meta: { epicHash: E, createdAt: '2026-07-03T00:00:00.000Z', epicCreatedAt: '2026-07-01T00:00:00.000Z' }, body: {} },
	[`TESTS-${E}-s1`]: { meta: { epicHash: E, createdAt: '2026-07-04T00:00:00.000Z' }, body: {} },
	[`ISSUE-${I}`]:  { meta: { issueHash: I, createdAt: '2026-08-01T00:00:00.000Z', epicCreatedAt: '2026-08-01T00:00:00.000Z' }, body: {} },
	[`BUILD-${I}`]:  { meta: { issueHash: I, createdAt: '2026-08-02T00:00:00.000Z' }, body: {} },
	[`HLD-${S}`]:    { meta: { epicHash: S, createdAt: '2026-09-05T00:00:00.000Z', standalone: true }, body: {} },
	[`LLD-${S}-s1`]: { meta: { epicHash: S, createdAt: '2026-09-03T00:00:00.000Z', standalone: true }, body: {} },
	[`LLD-${N}-s1`]: { meta: { epicHash: N, createdAt: '2026-09-09T00:00:00.000Z' }, body: {} },
	[`PLAN-${E}-s1`]: { meta: { createdAt: '2026-09-09T00:00:00.000Z' }, body: {} },
};

describe('convert-stamps', () => {
	it('convert-stamps.test.ts: epicCreatedAt is taken from the head of the work item', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'convert-stamps-'));
		try {
			git(repo, 'init', '-q', '-b', 'main'); git(repo, 'config', 'user.email', 't@e.com'); git(repo, 'config', 'user.name', 'T');
			mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
			for (const [id, json] of Object.entries(heads)) writeFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), JSON.stringify(json, null, 2) + '\n');
			git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'x');
			const read = (id: string) => JSON.parse(readFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), 'utf8')).meta as Record<string, unknown>;

			// the plan: what is stamped, and the two records that cannot be
			const plan = await planConversion(repo, { rules: [stampRule] });
			const stamped = Object.fromEntries(plan.changes.filter(c => c.rule === 'stamp-epic-created-at').map(c => [c.artifactId, c.detail]));
			assert.deepEqual(stamped, {
				[`BUILD-${I}`]:   'epicCreatedAt 2026-08-01T00:00:00.000Z',
				[`DEF-${E}`]:     'epicCreatedAt 2026-07-01T00:00:00.000Z',
				[`HLD-${E}`]:     'epicCreatedAt 2026-07-01T00:00:00.000Z',
				[`HLD-${S}`]:     'epicCreatedAt 2026-09-03T00:00:00.000Z',
				[`LLD-${S}-s1`]:  'epicCreatedAt 2026-09-03T00:00:00.000Z',
				[`TESTS-${E}-s1`]: 'epicCreatedAt 2026-07-01T00:00:00.000Z',
			});
			assert.deepEqual(plan.problems.map(p => p.file.replace('.insrc/artifacts/', '')).sort(), [`LLD-${N}-s1.json`, `PLAN-${E}-s1.json`]);
			assert.match(plan.problems.find(p => p.file.endsWith(`LLD-${N}-s1.json`))!.reason, /no head or createdAt/);
			assert.match(plan.problems.find(p => p.file.endsWith(`PLAN-${E}-s1.json`))!.reason, /no work item hash/);

			// apply: only meta.epicCreatedAt is written, the revision and every other field stay, and a repeat writes nothing
			assert.equal(applyStamps(repo), 6);
			assert.equal(read(`HLD-${E}`)['epicCreatedAt'], '2026-07-01T00:00:00.000Z');
			assert.equal(read(`HLD-${E}`)['revision'], 2);
			assert.equal(read(`DEF-${E}`)['epicCreatedAt'], '2026-07-01T00:00:00.000Z', 'the head of the work item is stamped with its own time');
			assert.equal(read(`LLD-${E}-s1`)['epicCreatedAt'], '2026-07-01T00:00:00.000Z', 'a stamp already there is kept');
			assert.equal(read(`BUILD-${I}`)['epicCreatedAt'], '2026-08-01T00:00:00.000Z', 'an issue is the head of its work item');
			assert.equal(read(`LLD-${N}-s1`)['epicCreatedAt'], undefined, 'no source, no stamp');
			assert.equal(applyStamps(repo), 0);
		} finally { rmSync(repo, { recursive: true, force: true }); }
	});

	it('convert-stamps.test.ts: anchorOf prefers the head of the work item over the records', () => {
		const h = (artifactId: string, meta: Record<string, unknown>): RawHead => ({ artifactId, json: { meta, body: {} } });
		const set = [h(`HLD-${E}`, { epicHash: E, createdAt: '2026-01-01T00:00:00.000Z', standalone: true }), h(`DEF-${E}`, { epicHash: E, createdAt: '2026-02-01T00:00:00.000Z', epicCreatedAt: '2026-03-01T00:00:00.000Z' })];
		assert.equal(anchorOf(set, E), '2026-03-01T00:00:00.000Z', 'the Define\'s own epicCreatedAt wins, then its createdAt, then the earliest record of a standalone design');
		assert.equal(anchorOf(set.slice(0, 1), E), '2026-01-01T00:00:00.000Z');
		assert.equal(anchorOf([h(`HLD-${E}`, { epicHash: E, createdAt: '2026-01-01T00:00:00.000Z' })], E), undefined);
	});
});
