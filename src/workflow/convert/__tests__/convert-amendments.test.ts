import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { amendmentOfHead } from '../../amendments/store.js';
import { durableKit } from '../../artifact-core/__tests__/durable-kit.js';
import { decodeArtifactHead } from '../../artifact-core/decode.js';
import { History } from '../../artifact-core/history.js';
import { RepoSchemaGate, writeRepoSchema } from '../../artifact-core/repo-schema.js';
import type { Actor, Lifecycle } from '../../artifact-core/types.js';
import { amendmentRule, applyAmendments, flatToHead } from '../amendments.js';
import { backfillHead } from '../backfill.js';
import { planConversion } from '../plan.js';
import { repairFlatAmendments } from '../repair-amendments.js';
import type { ConversionDeps } from '../types.js';

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
	/** A repository that was converted (schema marker at version 2) with the work item head of epic E and the given flat amendments added afterwards. */
	function convertedRepo(flats: Record<string, unknown>): { repo: string; deps: ConversionDeps; read: (id: string) => Record<string, any>; done(): void } {
		const kit = durableKit();
		const dir = join(kit.repo, '.insrc', 'artifacts');
		mkdirSync(dir, { recursive: true });
		const put = (id: string, v: unknown): void => writeFileSync(join(dir, `${id}.json`), JSON.stringify(v, null, 2) + '\n');
		put(`DEF-${E}`, { meta: { epicHash: E, workflow: 'define', createdAt: '2026-10-19T09:22:37.764Z', epicCreatedAt: '2026-10-19T09:22:37.764Z', lifecycle: { status: 'draft', revision: { number: 1, contentHash: 'h', at: '2026-10-19T09:22:37.764Z', by: MIGRATION }, signoffs: [] } }, body: {}, citations: [] });
		for (const [id, v] of Object.entries(flats)) put(id, v);
		writeRepoSchema(kit.repo, { version: 2, convertedAt: '2026-10-22T00:00:00.000Z' });
		assert.equal(RepoSchemaGate.read(kit.repo).version, 2, 'the fixture is a converted repository');
		const deps = { store: kit.store, history: new History(kit.sidecar), now: () => new Date('2026-11-04T00:00:00.000Z'), actor: MIGRATION } as unknown as ConversionDeps;
		return { repo: kit.repo, deps, read: id => JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')), done: () => kit.done() };
	}

	it('convert-amendments.test.ts: repairFlatAmendments makes a flat approved amendment a head the amendment store reads as approved by the original approver', async () => {
		const r = convertedRepo({ [`AMD-${E}-1`]: flat(1, { status: 'approved', approvedAt: '2026-10-28T05:23:44.099Z', approvedBy: 'Subho Ghosh (in-chat approval)' }) });
		try {
			const out = await repairFlatAmendments(r.repo, r.deps);
			assert.deepEqual([out.converted, out.problems], [[`AMD-${E}-1`], []]);
			const head = r.read(`AMD-${E}-1`);
			assert.equal(head.meta.lifecycle.status, 'approved');
			assert.equal(head.meta.lifecycle.approval.at, '2026-10-28T05:23:44.099Z', 'the original approval time');
			assert.equal(head.meta.approvedAt, undefined, 'the legacy stamp is gone');
			const record = amendmentOfHead(r.repo, head);
			assert.equal(record?.status, 'approved');
			assert.equal(record?.approvedBy, 'Subho Ghosh (in-chat approval)', 'not legacy:unknown');
			assert.doesNotThrow(() => decodeArtifactHead(`AMD-${E}-1`, JSON.stringify(head)));
		} finally { r.done(); }
	});

	it('convert-amendments.test.ts: repairFlatAmendments makes a flat not-yet-approved amendment a draft head', async () => {
		const r = convertedRepo({ [`AMD-${E}-1`]: flat(1) });
		try {
			const out = await repairFlatAmendments(r.repo, r.deps);
			assert.deepEqual(out.converted, [`AMD-${E}-1`]);
			const head = r.read(`AMD-${E}-1`);
			assert.equal(head.meta.lifecycle.status, 'draft');
			assert.equal(head.meta.lifecycle.approval, undefined, 'no approval is invented');
			assert.equal(amendmentOfHead(r.repo, head)?.status, 'pending');
		} finally { r.done(); }
	});

	it('convert-amendments.test.ts: repairFlatAmendments lists a flat amendment it cannot convert and leaves it flat', async () => {
		const bad = { ...flat(2), amendment: 'x' };
		const r = convertedRepo({ [`AMD-${E}-1`]: flat(1), [`AMD-${E}-2`]: bad });
		try {
			const before = readFileSync(join(r.repo, '.insrc', 'artifacts', `AMD-${E}-2.json`), 'utf8');
			const out = await repairFlatAmendments(r.repo, r.deps);
			assert.deepEqual(out.converted, [`AMD-${E}-1`], 'the convertible one is repaired');
			assert.equal(out.problems.length, 1);
			assert.match(out.problems[0]!.reason, /no amendment/);
			assert.match(out.problems[0]!.file, new RegExp(`AMD-${E}-2\\.json$`));
			assert.equal(readFileSync(join(r.repo, '.insrc', 'artifacts', `AMD-${E}-2.json`), 'utf8'), before, 'the unconvertible record is untouched');
		} finally { r.done(); }
	});

	it('convert-amendments.test.ts: repairFlatAmendments finishes a head that was converted but not migrated', async () => {
		// the state a run leaves when it stops after writing the converted heads and before the lifecycle migration
		const r = convertedRepo({ [`AMD-${E}-1`]: flat(1, { status: 'approved', approvedAt: '2026-10-28T05:23:44.099Z', approvedBy: 'subho' }) });
		try {
			applyAmendments(r.repo);
			assert.equal(r.read(`AMD-${E}-1`).meta.lifecycle, undefined, 'converted, not migrated');
			const out = await repairFlatAmendments(r.repo, r.deps);
			assert.deepEqual(out.converted, [], 'nothing is flat any more');
			assert.equal(r.read(`AMD-${E}-1`).meta.lifecycle.status, 'approved', 'the migration is finished anyway');
			assert.equal(amendmentOfHead(r.repo, r.read(`AMD-${E}-1`))?.approvedBy, 'subho');
		} finally { r.done(); }
	});

	it('convert-amendments.test.ts: repairFlatAmendments on a repo at schema version 2 does nothing the second time', async () => {
		const r = convertedRepo({ [`AMD-${E}-1`]: flat(1, { status: 'approved', approvedAt: '2026-10-28T05:23:44.099Z', approvedBy: 'subho' }) });
		try {
			await repairFlatAmendments(r.repo, r.deps);
			const bytes = readFileSync(join(r.repo, '.insrc', 'artifacts', `AMD-${E}-1.json`), 'utf8');
			const def = readFileSync(join(r.repo, '.insrc', 'artifacts', `DEF-${E}.json`), 'utf8');
			const second = await repairFlatAmendments(r.repo, r.deps);
			assert.deepEqual([second.converted, second.problems], [[], []]);
			assert.equal(readFileSync(join(r.repo, '.insrc', 'artifacts', `AMD-${E}-1.json`), 'utf8'), bytes, 'the repaired head is not rewritten');
			assert.equal(readFileSync(join(r.repo, '.insrc', 'artifacts', `DEF-${E}.json`), 'utf8'), def, 'a head of another kind is not touched');
		} finally { r.done(); }
	});
});
