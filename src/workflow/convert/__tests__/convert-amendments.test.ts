import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { decodeArtifactHead } from '../../artifact-core/decode.js';
import type { Actor, Lifecycle } from '../../artifact-core/types.js';
import { amendmentRule, applyAmendments, flatToHead } from '../amendments.js';
import { backfillHead } from '../backfill.js';
import { planConversion } from '../plan.js';

const E = '2f27754d4ad00b8e';
const MIGRATION: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };
const git = (repo: string, ...args: string[]): void => { execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' }); };
const flat = (n: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
	id: `AMD-${E}-${n}`, epicHash: E, epicSlug: 'one-common-model-every-artifact', hldBaseRunId: 'wf-1',
	amendment: { type: 'sharedContract.fieldAdd', contractId: 'sc1', field: { name: 'x', type: 'string', optional: false, purpose: 'p' }, breaking: false },
	rationale: 'because', citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }], proposedBy: { workflow: 'design.story', storyId: 's1' },
	proposedAt: '2026-10-20T08:14:35.240Z', status: 'pending', ...extra,
});

describe('convert-amendments', () => {
	it('convert-amendments.test.ts: a flat amendment becomes a head with a lifecycle from its stamps', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'convert-amd-'));
		try {
			git(repo, 'init', '-q', '-b', 'main'); git(repo, 'config', 'user.email', 't@e.com'); git(repo, 'config', 'user.name', 'T');
			mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
			const put = (id: string, v: unknown): void => writeFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), JSON.stringify(v, null, 2) + '\n');
			put(`DEF-${E}`, { meta: { epicHash: E, createdAt: '2026-10-19T09:22:37.764Z', epicCreatedAt: '2026-10-19T09:22:37.764Z' }, body: {} });
			put(`AMD-${E}-1`, flat(1));
			put(`AMD-${E}-2`, flat(2, { status: 'approved', approvedAt: '2026-10-20T09:00:00.000Z', approvedBy: 'subho', sideEffects: ['x'] }));
			put(`AMD-${E}-3`, flat(3, { status: 'rejected', rejectedAt: '2026-10-20T10:00:00.000Z', rejectedReason: 'duplicate' }));
			put(`AMD-${E}-4`, { ...flat(4), proposedAt: undefined });
			put(`AMD-${E}-5`, { ...flat(5), status: 'maybe' });
			put(`AMD-${E}-6`, { ...flat(6), amendment: 'x' });
			put(`AMD-bbbbbbbbbbbbbbbb-1`, { ...flat(1), epicHash: 'bbbbbbbbbbbbbbbb' });
			git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'x');

			// the plan: three convert, four are problems that name the cause
			const plan = await planConversion(repo, { rules: [amendmentRule] });
			assert.deepEqual(plan.changes.filter(c => c.rule === 'convert-amendment').map(c => c.artifactId), [`AMD-${E}-1`, `AMD-${E}-2`, `AMD-${E}-3`]);
			const reasons = Object.fromEntries(plan.problems.map(p => [p.file.replace('.insrc/artifacts/', ''), p.reason]));
			assert.match(reasons[`AMD-${E}-4.json`]!, /no proposedAt/);
			assert.match(reasons[`AMD-${E}-5.json`]!, /unknown status 'maybe'/);
			assert.match(reasons[`AMD-${E}-6.json`]!, /no amendment/);
			assert.match(reasons['AMD-bbbbbbbbbbbbbbbb-1.json']!, /no work item head/);

			// apply writes heads for the three; the model decodes them and the head migration gives each its lifecycle
			assert.equal(applyAmendments(repo), 3);
			for (const [n, status, entries] of [[1, 'draft', 1], [2, 'approved', 2], [3, 'rejected', 2]] as const) {
				const id = `AMD-${E}-${n}`;
				const bytes = readFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), 'utf8');
				assert.doesNotThrow(() => decodeArtifactHead(id, bytes), `${id} decodes as a legacy-stamped head`);
				const head = JSON.parse(bytes) as { meta: Record<string, unknown>; body: Record<string, unknown>; citations: unknown[] };
				assert.deepEqual([head.meta['workflow'], head.meta['createdAt'], head.meta['epicCreatedAt']], ['design.epic', '2026-10-20T08:14:35.240Z', '2026-10-19T09:22:37.764Z']);
				assert.deepEqual(head.citations, [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }]);
				assert.equal(head.body['rationale'], 'because');
				assert.equal((head.body['amendment'] as { type: string }).type, 'sharedContract.fieldAdd');
				assert.equal(head.meta['status'], undefined, 'the flat status is gone; the stamps carry it');
				const migrated = backfillHead({ head: { artifactId: id, json: head }, hasLog: false, now: '2026-10-23T00:00:00.000Z', actor: MIGRATION });
				const converted = JSON.parse(migrated.converted.bytes) as { meta: { lifecycle: Lifecycle } };
				assert.equal(converted.meta.lifecycle.status, status);
				assert.equal(migrated.converted.entries.length, entries);
				assert.doesNotThrow(() => decodeArtifactHead(id, migrated.converted.bytes), `${id} decodes once converted`);
			}
			const approved = JSON.parse(readFileSync(join(repo, '.insrc', 'artifacts', `AMD-${E}-2.json`), 'utf8')) as { meta: Record<string, unknown>; body: Record<string, unknown> };
			assert.equal(approved.meta['approvedAt'], '2026-10-20T09:00:00.000Z');
			assert.deepEqual([approved.body['approvedBy'], approved.body['sideEffects']], ['subho', ['x']], 'what has no field of its own is kept in the body');
			const rejected = JSON.parse(readFileSync(join(repo, '.insrc', 'artifacts', `AMD-${E}-3.json`), 'utf8')) as { meta: Record<string, unknown> };
			assert.deepEqual([rejected.meta['rejectedAt'], rejected.meta['rejectReason']], ['2026-10-20T10:00:00.000Z', 'duplicate']);
			assert.equal(applyAmendments(repo), 0, 'a repeat finds no flat record to convert');
		} finally { rmSync(repo, { recursive: true, force: true }); }
	});

	it('convert-amendments.test.ts: flatToHead refuses a record it cannot date or place', () => {
		assert.deepEqual(flatToHead({ ...flat(1), epicHash: undefined }, 'x'), { problem: 'has no epicHash' });
		assert.deepEqual(flatToHead(flat(1), undefined), { problem: `has no work item head to take epicCreatedAt from (epic ${E})` });
		assert.ok('head' in flatToHead(flat(1), '2026-10-19T00:00:00.000Z'));
	});
});
