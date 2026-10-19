/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The team-mode unit issue module (sc3): one issue per Epic, Story and Task,
 * found by record, older ref or per-unit label before anything is created.
 * Driven against an in-memory tracker, with no gh.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/unit-issue.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId, planArtifactId } from '../../storage.js';
import type { ResolvedGithubConfig } from '../../config/github.js';
import type { CreatedIssue, IssueRef, IssueSpec, PortResult, TrackerPort } from '../port.js';
import type { UnitRef } from '../refs.js';
import { ensureUnitIssue, ensureUnitIssueDetailed, isUnitSettled, resolveUnitIssueLocal, unitKey, unitLabel } from '../unit-issue.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CREATED = '2026-07-17T07:42:28.275Z';
const SLUG = 'tag-filtering';
const MEMBERSHIP = `epic:${SLUG}`;

const CFG: ResolvedGithubConfig = {
	type: 'github', owner: 'acme', repo: 'demo', epicLabel: 'epic', storyLabel: 'story', taskLabel: 'task',
	useMilestones: false, pushTasks: false, commitArtifacts: false, taskIssueType: 'Task', epicIssueType: 'Epic', storyIssueType: 'Story', source: 'per-repo-config',
};
const deps = { readConfig: () => CFG, now: () => '2026-10-18T00:00:00.000Z' };

// ---------------------------------------------------------------------------
// An in-memory tracker
// ---------------------------------------------------------------------------

interface Issue { number: number; ref: IssueRef; spec: IssueSpec; state: 'open' | 'closed' }

function fakeTracker(over: {
	failFind?: boolean; failLabel?: string; failCreate?: boolean; commitThenFail?: boolean;
	/** The additive sc1 listing (findIssues); off by default, as on today's real port. */
	withListing?: boolean; failList?: boolean; failClose?: boolean; failLink?: number;
	/** Answer this many findIssue calls with "not found" whatever exists (a stale read of two daemons). */
	staleFinds?: number;
	/** Runs after a findIssue lookup with what it found (a file changing between the lookup and the record). */
	afterFind?: (hit: IssueRef | null) => void;
	/** Fail this many resolveIssueId calls (with `failResolveKind`), and leave resolveIssueId off the tracker altogether. */
	failResolve?: number; failResolveKind?: 'missing-tool' | 'missing-signin' | 'unreachable' | 'rejected'; withoutResolve?: boolean;
	/** Another daemon's issue, created just before this call's own, so it has the lower number. */
	racer?: boolean;
	/** Runs right after this fake's create commits an issue and before it returns (another daemon acting in between). */
	afterCreate?: () => void;
	/** Share the numbering and issues of another fake (two daemons, one tracker). */
	shared?: { issues: Issue[]; next: { n: number } };
} = {}) {
	const issues: Issue[] = over.shared?.issues ?? [];
	const calls = { find: 0, create: 0, list: 0, resolve: [] as string[], label: [] as string[], link: [] as Array<[string, number]>, comments: [] as Array<[string, string]>, closed: [] as string[] };
	const counter = over.shared?.next ?? { n: 1 };
	let stale = over.staleFinds ?? 0;
	const find = (labels: string[]): PortResult<IssueRef | null> => {
		calls.find += 1;
		if (over.failFind === true) return { ok: false, reason: 'gh timed out', kind: 'unreachable' };
		if (stale > 0) { stale -= 1; return { ok: true, value: null }; }
		const hit = issues.find(i => labels.every(l => i.spec.labels.includes(l)));
		over.afterFind?.(hit?.ref ?? null);
		return { ok: true, value: hit?.ref ?? null };
	};
	const port = {
		kind: 'github', capabilities: new Set(['issue-create']),
		whoAmI: () => ({ ok: true, value: 'me' }),
		findIssue: find,
		issueOps: {
			ensureLabel: (name: string) => { calls.label.push(name); return name !== over.failLabel; },
			create: (spec: IssueSpec): PortResult<CreatedIssue> => {
				calls.create += 1;
				if (over.failCreate === true && over.commitThenFail !== true) return { ok: false, reason: 'gh rejected the create', kind: 'rejected' };
				if (over.racer === true) {
					over.racer = false;
					const rn = counter.n++;
					issues.push({ number: rn, ref: `acme/demo#${rn}`, spec: { ...spec, labels: [...spec.labels] }, state: 'open' });
				}
				const number = counter.n++;
				const ref = `acme/demo#${number}`;
				issues.push({ number, ref, spec, state: 'open' });
				if (over.commitThenFail === true) { over.commitThenFail = false; over.failCreate = false; return { ok: false, reason: 'timed out after the issue was committed', kind: 'unreachable' }; }
				over.afterCreate?.();
				return { ok: true, value: { ref, id: 1000 + number, typed: true } };
			},
			linkSubIssue: (parent: IssueRef, childId: number): PortResult<void> => {
				calls.link.push([parent, childId]);
				if (over.failLink !== undefined && over.failLink > 0) { over.failLink -= 1; return { ok: false, reason: 'link rejected', kind: 'rejected' }; }
				return { ok: true, value: undefined };
			},
			...(over.withoutResolve === true ? {} : {
				resolveIssueId: (ref: IssueRef): PortResult<number> => {
					calls.resolve.push(ref);
					if (over.failResolve !== undefined && over.failResolve > 0) { over.failResolve -= 1; return { ok: false, reason: 'lookup failed', kind: over.failResolveKind ?? 'unreachable' }; }
					const hit = issues.find(i => i.ref === ref);
					return hit === undefined ? { ok: false, reason: 'no such issue', kind: 'rejected' } : { ok: true, value: 1000 + hit.number };
				},
			}),
			comment: (ref: IssueRef, body: string): PortResult<void> => { calls.comments.push([ref, body]); return { ok: true, value: undefined }; },
			close: (ref: IssueRef): PortResult<void> => {
				if (over.failClose === true) return { ok: false, reason: 'close rejected', kind: 'rejected' };
				calls.closed.push(ref);
				const hit = issues.find(i => i.ref === ref); if (hit !== undefined) hit.state = 'closed';
				return { ok: true, value: undefined };
			},
		},
		...(over.withListing !== false ? {
			findIssues: (labels: string[]): PortResult<IssueRef[]> => {
				calls.list += 1;
				if (over.failList === true) return { ok: false, reason: 'listing timed out', kind: 'unreachable' };
				return { ok: true, value: issues.filter(i => labels.every(l => i.spec.labels.includes(l))).sort((a, b) => a.number - b.number).map(i => i.ref) };
			},
		} : {}),
	} as unknown as TrackerPort;
	return { port, issues, calls, shared: { issues, next: counter } };
}

// ---------------------------------------------------------------------------
// A repo with a Define, HLD, LLD and plan
// ---------------------------------------------------------------------------

function seed(): { repo: string; json: (id: string) => string; read: (id: string) => any; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-unit-issue-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const put = (id: string, doc: unknown): void => writeFileSync(artifactJsonPath(repo, id), JSON.stringify(doc, null, 2) + '\n');
	put(defineArtifactId(HASH), {
		meta: { workflow: 'define', runId: 'r', repoPath: repo, createdAt: CREATED, epicHash: HASH, epicSlug: SLUG, schemaVersion: 1 },
		body: {
			flavor: 'enhancement', problem: 'Users cannot filter todos by tag today. Only status filtering exists.', nonGoals: [], assumptions: [],
			constraints: [{ id: 'k1', text: 'Reuse the sidebar', type: 'convention', source: 'c1' }],
			stories: [{ id: 's1', title: 'Filter by tag', userValue: 'find todos faster', acceptanceCriteria: [{ id: 'ac1', given: 'g', when: 'w', then: 't', operationalizes: ['k1'] }] }],
			openQuestions: [],
		},
		citations: [],
	});
	put(hldArtifactId(HASH), { meta: { workflow: 'design.epic', epicHash: HASH, epicSlug: SLUG, createdAt: CREATED }, body: {}, citations: [] });
	put(lldArtifactId(HASH, 's1'), { meta: { workflow: 'design.story', epicHash: HASH, epicSlug: SLUG, storyId: 's1', createdAt: CREATED, revision: 2 }, body: {}, citations: [] });
	put(planArtifactId(HASH, 's1'), {
		meta: { workflow: 'plan', epicHash: HASH, epicSlug: SLUG, storyId: 's1', createdAt: CREATED },
		body: { tasks: [{ id: 't1', title: 'Add the filter', summary: 'Add it', size: 'S', order: 1, dependsOn: [], acceptanceChecks: ['it filters'], derivedFrom: ['c1'], tests: [] }] },
		citations: [],
	});
	return {
		repo, json: id => artifactJsonPath(repo, id), read: id => JSON.parse(readFileSync(artifactJsonPath(repo, id), 'utf8')),
		cleanup: () => rmSync(repo, { recursive: true, force: true }),
	};
}

const epic = (repo: string): UnitRef => ({ unit: 'epic', repoPath: repo, epicHash: HASH });
const story = (repo: string): UnitRef => ({ unit: 'story', repoPath: repo, epicHash: HASH, storyId: 's1' });
const task = (repo: string): UnitRef => ({ unit: 'task', repoPath: repo, epicHash: HASH, storyId: 's1', taskId: 't1' });

// ---------------------------------------------------------------------------

test('ensureUnitIssue takes a unit and a port and returns a PortResult without a phase', () => {
	const fx = seed();
	const cfgPath = join(fx.repo, 'github.json');
	writeFileSync(cfgPath, JSON.stringify({ repos: { [fx.repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
	const priorCfg = process.env['INSRC_GITHUB_CONFIG'];
	process.env['INSRC_GITHUB_CONFIG'] = cfgPath;
	try {
		const t = fakeTracker();
		const ok = ensureUnitIssue(epic(fx.repo), t.port);
		assert.deepEqual(ok, { ok: true, value: 'acme/demo#1' });
		const bad = ensureUnitIssue(story(fx.repo), fakeTracker({ failFind: true }).port);
		assert.equal(bad.ok, false);
		assert.deepEqual(Object.keys(bad).sort(), ['kind', 'ok', 'reason'], 'the failure carries the sc1 fields and no phase');
	} finally {
		if (priorCfg === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = priorCfg;
		fx.cleanup();
	}
});

test('resolveUnitIssueLocal resolves from records and legacy refs, reconciles locally and runs no command', () => {
	const fx = seed();
	try {
		// Epic: the Define's older epicRef; the record and the HLD ref are written locally
		const def = fx.read(defineArtifactId(HASH)); def.meta.tracker = { adapter: 'github', epicRef: 'acme/demo#7' };
		writeFileSync(fx.json(defineArtifactId(HASH)), JSON.stringify(def));
		assert.equal(resolveUnitIssueLocal(epic(fx.repo), deps.now), 'acme/demo#7');
		assert.equal(fx.read(defineArtifactId(HASH)).meta.tracker.units.epic.issue, 'acme/demo#7');
		assert.equal(fx.read(hldArtifactId(HASH)).meta.tracker.epicRef, 'acme/demo#7', 'the HLD ref is reconciled');

		// Story: the Define's storyRefs entry; the LLD gets its own storyRef and record
		const def2 = fx.read(defineArtifactId(HASH)); def2.meta.tracker.storyRefs = { s1: 'acme/demo#8' };
		writeFileSync(fx.json(defineArtifactId(HASH)), JSON.stringify(def2));
		assert.equal(resolveUnitIssueLocal(story(fx.repo), deps.now), 'acme/demo#8');
		const lld = fx.read(lldArtifactId(HASH, 's1')).meta;
		assert.equal(lld.tracker.storyRef, 'acme/demo#8');
		assert.equal(lld.tracker.units['story:s1'].createdAtRevision, 2, 'the record notes the artifact revision');

		// Task: the plan's taskRefs entry
		const plan = fx.read(planArtifactId(HASH, 's1')); plan.meta.tracker = { adapter: 'github', taskRefs: { t1: 'acme/demo#9' } };
		writeFileSync(fx.json(planArtifactId(HASH, 's1')), JSON.stringify(plan));
		assert.equal(resolveUnitIssueLocal(task(fx.repo), deps.now), 'acme/demo#9');
		assert.equal(fx.read(planArtifactId(HASH, 's1')).meta.tracker.units['task:s1/t1'].issue, 'acme/demo#9');

		// the units records alone (legacy refs removed) resolve all three units
		const d3 = fx.read(defineArtifactId(HASH)); delete d3.meta.tracker.epicRef; delete d3.meta.tracker.storyRefs;
		writeFileSync(fx.json(defineArtifactId(HASH)), JSON.stringify(d3));
		const l3 = fx.read(lldArtifactId(HASH, 's1')); delete l3.meta.tracker.storyRef;
		writeFileSync(fx.json(lldArtifactId(HASH, 's1')), JSON.stringify(l3));
		const p3 = fx.read(planArtifactId(HASH, 's1')); delete p3.meta.tracker.taskRefs;
		writeFileSync(fx.json(planArtifactId(HASH, 's1')), JSON.stringify(p3));
		assert.equal(resolveUnitIssueLocal(epic(fx.repo), deps.now), 'acme/demo#7');
		assert.equal(resolveUnitIssueLocal(story(fx.repo), deps.now), 'acme/demo#8');
		assert.equal(resolveUnitIssueLocal(task(fx.repo), deps.now), 'acme/demo#9');

		// a unit with nothing recorded, and an unreadable repo, resolve to null without throwing
		const bare = seed();
		try { assert.equal(resolveUnitIssueLocal(story(bare.repo), deps.now), null); } finally { bare.cleanup(); }
		assert.equal(resolveUnitIssueLocal(story('/no/such/repo'), deps.now), null);
	} finally { fx.cleanup(); }
});

test('a legacy LLD with only storyRef creates no second Story issue', () => {
	const fx = seed();
	try {
		const lld = fx.read(lldArtifactId(HASH, 's1')); lld.meta.tracker = { adapter: 'github', storyRef: 'acme/demo#5' };   // no units, no unit label
		writeFileSync(fx.json(lldArtifactId(HASH, 's1')), JSON.stringify(lld));
		const t = fakeTracker();
		const r = ensureUnitIssueDetailed(story(fx.repo), t.port, deps);
		assert.deepEqual(r, { ok: true, value: { issue: 'acme/demo#5', created: false, duplicateCheck: 'clean' } });
		assert.equal(t.calls.create, 0);
		assert.equal(t.calls.find, 0, 'no tracker lookup either');
		assert.equal(fx.read(defineArtifactId(HASH)).meta.tracker.storyRefs.s1, 'acme/demo#5', 'the Define aggregate is reconciled');
	} finally { fx.cleanup(); }
});

test('team mode creates only when everything misses and reports phase before-create or create on failure', () => {
	const fx = seed();
	try {
		// a failed lookup is a failure, never "not found": nothing is created
		const lookup = fakeTracker({ failFind: true });
		const l = ensureUnitIssueDetailed(epic(fx.repo), lookup.port, deps);
		assert.equal(l.ok, false);
		assert.deepEqual(l.ok ? null : [l.phase, l.kind], ['before-create', 'unreachable']);
		assert.equal(lookup.calls.create, 0);

		// a label that cannot be created: nothing is created
		const label = fakeTracker({ failLabel: unitLabel(epic(fx.repo)) });
		const lb = ensureUnitIssueDetailed(epic(fx.repo), label.port, deps);
		assert.equal(lb.ok, false);
		assert.deepEqual(lb.ok ? null : lb.phase, 'before-create');
		assert.match(lb.ok ? '' : lb.reason, /insrc:unit:a3f4b8c9d1e2f3a4' could not be created/);
		assert.equal(label.calls.create, 0);

		// a failed create call is unconfirmed
		const bad = fakeTracker({ failCreate: true });
		const c = ensureUnitIssueDetailed(epic(fx.repo), bad.port, deps);
		assert.deepEqual(c.ok ? null : [c.phase, c.kind], ['create', 'rejected']);

		// a Story or Task whose parent has no issue yet creates nothing (the parent is not created for it)
		const orphan = fakeTracker();
		const o = ensureUnitIssueDetailed(story(fx.repo), orphan.port, deps);
		assert.deepEqual(o.ok ? null : o.phase, 'before-create');
		assert.match(o.ok ? '' : o.reason, /epic issue does not exist yet/);
		assert.equal(orphan.calls.create, 0, 'no parent was created either');
		const orphanTask = ensureUnitIssueDetailed(task(fx.repo), orphan.port, deps);
		assert.match(orphanTask.ok ? '' : orphanTask.reason, /story issue does not exist yet/);
		assert.equal(orphan.calls.create, 0);

		// the happy path: Epic, then Story under it, then Task under the Story
		const t = fakeTracker();
		const e = ensureUnitIssueDetailed(epic(fx.repo), t.port, deps);
		assert.deepEqual(e, { ok: true, value: { issue: 'acme/demo#1', created: true, duplicateCheck: 'clean' } });
		assert.deepEqual(t.issues[0]!.spec.labels, ['epic', MEMBERSHIP, unitLabel(epic(fx.repo))], 'kind, membership and per-unit labels');
		assert.equal(t.issues[0]!.spec.issueType, 'Epic');
		assert.equal(fx.read(defineArtifactId(HASH)).meta.tracker.epicRef, 'acme/demo#1');
		assert.equal(fx.read(hldArtifactId(HASH)).meta.tracker.epicRef, 'acme/demo#1');

		const s = ensureUnitIssueDetailed(story(fx.repo), t.port, deps);
		assert.equal(s.ok && s.value.issue, 'acme/demo#2');
		assert.deepEqual(t.calls.link[0], ['acme/demo#1', 1002], 'the Story is linked under its Epic');
		assert.match(t.issues[1]!.spec.body, /#1/, 'the body names the Epic issue');
		assert.equal(fx.read(lldArtifactId(HASH, 's1')).meta.tracker.units['story:s1'].issue, 'acme/demo#2');

		const k = ensureUnitIssueDetailed(task(fx.repo), t.port, deps);
		assert.equal(k.ok && k.value.issue, 'acme/demo#3');
		assert.deepEqual(t.calls.link[1], ['acme/demo#2', 1003], 'the Task is linked under its Story');
		assert.equal(t.issues[2]!.spec.issueType, 'Task');

		// a second call anywhere finds the record and touches the tracker not at all
		const before = { find: t.calls.find, create: t.calls.create };
		assert.equal(ensureUnitIssueDetailed(task(fx.repo), t.port, deps).ok, true);
		assert.deepEqual({ find: t.calls.find, create: t.calls.create }, before);

		// a closed issue carrying the unit label is adopted, not duplicated
		const other = seed();
		try {
			const t2 = fakeTracker();
			t2.issues.push({ number: 40, ref: 'acme/demo#40', state: 'closed', spec: { title: 'old', body: '', labels: ['epic', MEMBERSHIP, unitLabel(epic(other.repo))] } });
			const a = ensureUnitIssueDetailed(epic(other.repo), t2.port, deps);
			assert.deepEqual(a.ok && [a.value.issue, a.value.created], ['acme/demo#40', false]);
			assert.equal(t2.calls.create, 0);
			assert.equal(other.read(defineArtifactId(HASH)).meta.tracker.units.epic.issue, 'acme/demo#40', 'and recorded');
		} finally { other.cleanup(); }

		// a unit that is not in its artifact is a failure before create
		const missing = ensureUnitIssueDetailed({ ...story(fx.repo), storyId: 's9' }, fakeTracker().port, deps);
		assert.deepEqual(missing.ok ? null : missing.phase, 'before-create');
	} finally { fx.cleanup(); }
});

test('a create that times out after the remote committed is adopted by its label on the next call', () => {
	const fx = seed();
	try {
		const t = fakeTracker({ failCreate: true, commitThenFail: true });
		const first = ensureUnitIssueDetailed(epic(fx.repo), t.port, deps);
		assert.deepEqual(first.ok ? null : first.phase, 'create', 'the outcome is unconfirmed');
		assert.equal(t.issues.length, 1, 'the remote did commit the issue');
		assert.equal(readFileSync(fx.json(defineArtifactId(HASH)), 'utf8').includes('"epicRef"'), false, 'but nothing was recorded');

		const second = ensureUnitIssueDetailed(epic(fx.repo), t.port, deps);
		assert.deepEqual(second.ok && [second.value.issue, second.value.created], ['acme/demo#1', false], 'found by its per-unit label');
		assert.equal(t.calls.create, 1, 'no second create');
		assert.equal(fx.read(defineArtifactId(HASH)).meta.tracker.units.epic.issue, 'acme/demo#1');
	} finally { fx.cleanup(); }
});

test('unitLabel gives the three forms, lower-cases ids, stays within 50 characters and rejects a malformed id', () => {
	const e: UnitRef = { unit: 'epic', repoPath: '/r', epicHash: 'A3F4B8C9D1E2F3A4' };
	assert.equal(unitLabel(e), 'insrc:unit:a3f4b8c9d1e2f3a4');
	assert.equal(unitLabel({ ...e, unit: 'story', storyId: 'S004' }), 'insrc:unit:a3f4b8c9d1e2f3a4:s004');
	assert.equal(unitLabel({ ...e, unit: 'task', storyId: 'S004', taskId: 'T12' }), 'insrc:unit:a3f4b8c9d1e2f3a4:s004:t12');
	assert.ok(unitLabel({ ...e, unit: 'task', storyId: 's1', taskId: 't1' }).length <= 50);
	assert.equal(unitKey({ ...e, unit: 'task', storyId: 'S004', taskId: 'T12' }), 'task:s004/t12');
	assert.equal(unitLabel({ ...e, unit: 'story', storyId: 'S004' }), unitLabel({ ...e, unit: 'story', storyId: 's004' }), 'upper and lower case give the same label');
	assert.throws(() => unitLabel({ ...e, unit: 'story', storyId: 's 1' }), /not a valid id/);
	assert.throws(() => unitLabel({ ...e, unit: 'story', storyId: 's1:x' }), /not a valid id/);
	assert.throws(() => unitLabel({ ...e, unit: 'story' }), /needs a storyId/);
	assert.throws(() => unitLabel({ ...e, unit: 'task', storyId: 's1', taskId: 'a-very-long-task-identifier-that-overflows' }), /over the 50-character limit/);
});

// ---------------------------------------------------------------------------
// The duplicate tie-break (step 5; needs the additive findIssues listing)
// ---------------------------------------------------------------------------

test('a lower-numbered issue is adopted and the call\'s own is commented on and closed, even when the close fails', () => {
	for (const failClose of [false, true]) {
		const fx = seed();
		try {
			const t = fakeTracker({ withListing: true, racer: true, failClose });
			const r = ensureUnitIssueDetailed(epic(fx.repo), t.port, deps);
			assert.deepEqual(r, { ok: true, value: { issue: 'acme/demo#1', created: false, duplicateCheck: 'adopted-other' } });
			assert.equal(t.calls.create, 1);
			assert.deepEqual(t.calls.comments.map(([ref]) => ref), ['acme/demo#2'], 'the call\'s own issue is commented on');
			assert.match(t.calls.comments[0]![1], /Duplicate of acme\/demo#1/);
			assert.deepEqual(t.calls.closed, failClose ? [] : ['acme/demo#2']);
			assert.equal(fx.read(defineArtifactId(HASH)).meta.tracker.units.epic.issue, 'acme/demo#1', 'the record names the lowest');
			assert.equal(fx.read(defineArtifactId(HASH)).meta.tracker.epicRef, 'acme/demo#1');

			// the listing's own issue first: kept, nothing commented
			const clean = fakeTracker({ withListing: true });
			const fy = seed();
			try {
				assert.deepEqual(ensureUnitIssueDetailed(epic(fy.repo), clean.port, deps), { ok: true, value: { issue: 'acme/demo#1', created: true, duplicateCheck: 'clean' } });
				assert.equal(clean.calls.comments.length, 0);
			} finally { fy.cleanup(); }
		} finally { fx.cleanup(); }
	}
});

test('two simulated daemons that both create converge on the lowest issue', () => {
	const a = seed();
	const b = seed();
	try {
		const shared = { issues: [] as Issue[], next: { n: 1 } };
		// Daemon B does its whole call (both its lookups stale, so it creates, lists, and breaks the tie) in the gap
		// after daemon A's create and before A's listing: both have created before either lists.
		const second = fakeTracker({ withListing: true, staleFinds: 2, shared });
		let rb: ReturnType<typeof ensureUnitIssueDetailed> | undefined;
		const first = fakeTracker({ withListing: true, shared, afterCreate: () => { rb = ensureUnitIssueDetailed(epic(b.repo), second.port, deps); } });
		const ra = ensureUnitIssueDetailed(epic(a.repo), first.port, deps);
		assert.equal(first.calls.create + second.calls.create, 2, 'both daemons created an issue');
		assert.equal(ra.ok && rb?.ok, true);
		assert.deepEqual(shared.issues.filter(i => i.state === 'open').map(i => i.ref), ['acme/demo#1'], 'one open issue: the lowest');
		assert.deepEqual(second.calls.closed, ['acme/demo#2']);
		assert.equal(a.read(defineArtifactId(HASH)).meta.tracker.units.epic.issue, 'acme/demo#1');
		assert.equal(b.read(defineArtifactId(HASH)).meta.tracker.units.epic.issue, 'acme/demo#1', 'both records name it');
	} finally { a.cleanup(); b.cleanup(); }
});

test('a failed findIssues listing keeps the recorded issue and a following call makes no tracker call', () => {
	const fx = seed();
	try {
		const t = fakeTracker({ withListing: true, failList: true });
		const r = ensureUnitIssueDetailed(epic(fx.repo), t.port, deps);
		assert.deepEqual(r, { ok: true, value: { issue: 'acme/demo#1', created: true, duplicateCheck: 'not-run' } });
		assert.equal(fx.read(defineArtifactId(HASH)).meta.tracker.units.epic.issue, 'acme/demo#1');
		const before = { ...t.calls };
		const again = ensureUnitIssueDetailed(epic(fx.repo), t.port, deps);
		assert.deepEqual(again, { ok: true, value: { issue: 'acme/demo#1', created: false, duplicateCheck: 'clean' } });
		assert.deepEqual([t.calls.find, t.calls.create, t.calls.list], [before.find, before.create, before.list], 'no tracker call');
	} finally { fx.cleanup(); }
});

test('a link under the parent that failed at creation is retried on the next ensure and then cleared', () => {
	const fx = seed();
	try {
		const t = fakeTracker({ failLink: 1 });
		assert.equal(ensureUnitIssueDetailed(epic(fx.repo), t.port, deps).ok, true);
		const first = ensureUnitIssueDetailed(story(fx.repo), t.port, deps);
		assert.equal(first.ok, true, 'the Story issue is still returned');
		const pending = fx.read(lldArtifactId(HASH, 's1')).meta.tracker.units['story:s1'].pendingLink;
		assert.deepEqual(pending, { parent: 'acme/demo#1', childId: 1002 }, 'the failed link is recorded');
		assert.equal(isUnitSettled(story(fx.repo)), false);

		// the next ensure retries the link (no new issue) and clears it
		const linksBefore = t.calls.link.length;
		const createsBefore = t.calls.create;
		assert.equal(ensureUnitIssueDetailed(story(fx.repo), t.port, deps).ok, true);
		assert.equal(t.calls.link.length, linksBefore + 1);
		assert.equal(t.calls.create, createsBefore);
		assert.equal(fx.read(lldArtifactId(HASH, 's1')).meta.tracker.units['story:s1'].pendingLink, undefined);
		assert.equal(isUnitSettled(story(fx.repo)), true);

		// settled: a further ensure makes no tracker call at all
		const settledLinks = t.calls.link.length;
		ensureUnitIssueDetailed(story(fx.repo), t.port, deps);
		assert.equal(t.calls.link.length, settledLinks);
	} finally { fx.cleanup(); }
});

test('a malformed plan is a before-create failure, not a throw', () => {
	const fx = seed();
	try {
		const plan = fx.read(planArtifactId(HASH, 's1')); plan.body.tasks = 'not a list';
		writeFileSync(fx.json(planArtifactId(HASH, 's1')), JSON.stringify(plan));
		const t = fakeTracker();
		ensureUnitIssueDetailed(epic(fx.repo), t.port, deps); ensureUnitIssueDetailed(story(fx.repo), t.port, deps);
		const creates = t.calls.create;
		const r = ensureUnitIssueDetailed(task(fx.repo), t.port, deps);
		assert.equal(r.ok, false);
		assert.equal(r.ok ? '' : r.phase, 'before-create');
		assert.equal(t.calls.create, creates);
	} finally { fx.cleanup(); }
});

// ---------------------------------------------------------------------------
// Linking an issue adopted by its label under its parent (S4-1)
// ---------------------------------------------------------------------------

type AdoptOver = Parameters<typeof fakeTracker>[0];

/** An epic and its issue, then a unit whose create times out after the tracker committed it. Returns the tracker, ready to adopt that unit. */
function timedOutUnit(fx: ReturnType<typeof seed>, unitOf: (repo: string) => UnitRef, over: NonNullable<AdoptOver> = {}) {
	const t = fakeTracker(over);
	assert.equal(ensureUnitIssueDetailed(epic(fx.repo), t.port, deps).ok, true);
	if (unitOf(fx.repo).unit === 'task') assert.equal(ensureUnitIssueDetailed(story(fx.repo), t.port, deps).ok, true);
	over.failCreate = true; over.commitThenFail = true;
	const first = ensureUnitIssueDetailed(unitOf(fx.repo), t.port, deps);
	assert.deepEqual(first.ok ? null : first.phase, 'create', 'the outcome is unconfirmed');
	return t;
}
const recordOf = (fx: ReturnType<typeof seed>, u: UnitRef) => (u.unit === 'story' ? fx.read(lldArtifactId(HASH, 's1')) : fx.read(planArtifactId(HASH, 's1'))).meta.tracker.units[u.unit === 'story' ? 'story:s1' : 'task:s1/t1'];

test('a Story or Task issue adopted by its label after a timed-out create is resolved and linked under its parent, a failed resolve records pendingLink with child and a failed link records childId, the next ensure completes either, an Epic adoption makes no call, and an old pendingLink with childId still links without a resolve', () => {
	// Story: adopted, resolved, linked, settled; the record keeps its revision mark
	let fx = seed();
	try {
		const t = timedOutUnit(fx, story);
		const linksBefore = t.calls.link.length;
		const adopted = ensureUnitIssueDetailed(story(fx.repo), t.port, deps);
		assert.deepEqual(adopted.ok && [adopted.value.issue, adopted.value.created], ['acme/demo#2', false]);
		assert.deepEqual(t.calls.resolve, ['acme/demo#2']);
		assert.deepEqual(t.calls.link.slice(linksBefore), [['acme/demo#1', 1002]]);
		assert.equal(recordOf(fx, story(fx.repo)).pendingLink, undefined);
		assert.equal(recordOf(fx, story(fx.repo)).createdAtRevision, 2);
		assert.equal(isUnitSettled(story(fx.repo)), true);
	} finally { fx.cleanup(); }

	// Task: adopted under its Story's issue
	fx = seed();
	try {
		const t = timedOutUnit(fx, task);
		const linksBefore = t.calls.link.length;
		assert.equal(ensureUnitIssueDetailed(task(fx.repo), t.port, deps).ok, true);
		assert.deepEqual(t.calls.link.slice(linksBefore), [['acme/demo#2', 1003]]);
		assert.equal(isUnitSettled(task(fx.repo)), true);
	} finally { fx.cleanup(); }

	// A failed resolve is kept as pendingLink { parent, child } AFTER the adoption record exists, survives it, and the next ensure completes it
	fx = seed();
	try {
		const t = timedOutUnit(fx, story, { failResolve: 1 });
		const adopted = ensureUnitIssueDetailed(story(fx.repo), t.port, deps);
		assert.equal(adopted.ok, true, 'a failed lookup never fails the ensure');
		const rec = recordOf(fx, story(fx.repo));
		assert.deepEqual(rec.pendingLink, { parent: 'acme/demo#1', child: 'acme/demo#2' });
		assert.equal(rec.issue, 'acme/demo#2');
		assert.equal(rec.createdAtRevision, 2, 'the record kept its revision mark');
		assert.equal(isUnitSettled(story(fx.repo)), false);
		const linksBefore = t.calls.link.length;
		assert.equal(ensureUnitIssueDetailed(story(fx.repo), t.port, deps).ok, true);
		assert.deepEqual(t.calls.link.slice(linksBefore), [['acme/demo#1', 1002]], 'the retry looked the id up, then linked');
		assert.equal(recordOf(fx, story(fx.repo)).pendingLink, undefined);
	} finally { fx.cleanup(); }

	// A failed link after a good lookup keeps the id; the retry does not look it up again
	fx = seed();
	try {
		const over: NonNullable<AdoptOver> = {};
		const t = timedOutUnit(fx, story, over);
		over.failLink = 1;
		assert.equal(ensureUnitIssueDetailed(story(fx.repo), t.port, deps).ok, true);
		assert.deepEqual(recordOf(fx, story(fx.repo)).pendingLink, { parent: 'acme/demo#1', childId: 1002 });
		const resolvesBefore = t.calls.resolve.length;
		assert.equal(ensureUnitIssueDetailed(story(fx.repo), t.port, deps).ok, true);
		assert.equal(t.calls.resolve.length, resolvesBefore, 'no second lookup');
		assert.equal(recordOf(fx, story(fx.repo)).pendingLink, undefined);
	} finally { fx.cleanup(); }

	// Every failure kind of the lookup is handled the same way; a still-failing retry leaves the record as it was
	for (const kind of ['missing-tool', 'missing-signin', 'unreachable', 'rejected'] as const) {
		fx = seed();
		try {
			const t = timedOutUnit(fx, story, { failResolve: 2, failResolveKind: kind });
			assert.equal(ensureUnitIssueDetailed(story(fx.repo), t.port, deps).ok, true, kind);
			const kept = { parent: 'acme/demo#1', child: 'acme/demo#2' };
			assert.deepEqual(recordOf(fx, story(fx.repo)).pendingLink, kept, kind);
			assert.equal(ensureUnitIssueDetailed(story(fx.repo), t.port, deps).ok, true, kind);
			assert.deepEqual(recordOf(fx, story(fx.repo)).pendingLink, kept, `${kind}: still failing leaves the record as it was`);
		} finally { fx.cleanup(); }
	}

	// A tracker without the lookup counts as a failed lookup, not a crash
	fx = seed();
	try {
		const t = timedOutUnit(fx, story, { withoutResolve: true });
		assert.equal(ensureUnitIssueDetailed(story(fx.repo), t.port, deps).ok, true);
		assert.deepEqual(recordOf(fx, story(fx.repo)).pendingLink, { parent: 'acme/demo#1', child: 'acme/demo#2' });
	} finally { fx.cleanup(); }

	// A sibling record that cannot be written (the Define's storyRefs) does not stop the link or its retry marker
	fx = seed();
	try {
		const over: NonNullable<AdoptOver> = {};
		const t = timedOutUnit(fx, story, over);
		over.afterFind = hit => {
			if (hit !== 'acme/demo#2') return;
			const def = fx.read(defineArtifactId(HASH)); def.meta = null;
			writeFileSync(fx.json(defineArtifactId(HASH)), JSON.stringify(def));
		};
		const linksBefore = t.calls.link.length;
		assert.equal(ensureUnitIssueDetailed(story(fx.repo), t.port, deps).ok, true);
		assert.deepEqual(t.calls.link.slice(linksBefore), [['acme/demo#1', 1002]], 'linked although the Define could not be patched');
		assert.equal(recordOf(fx, story(fx.repo)).pendingLink, undefined);
	} finally { fx.cleanup(); }

	// An Epic adoption has no parent: no lookup, no link
	fx = seed();
	try {
		const t = fakeTracker({ failCreate: true, commitThenFail: true });
		assert.equal(ensureUnitIssueDetailed(epic(fx.repo), t.port, deps).ok, false);
		assert.equal(ensureUnitIssueDetailed(epic(fx.repo), t.port, deps).ok, true);
		assert.deepEqual([t.calls.resolve.length, t.calls.link.length], [0, 0]);
	} finally { fx.cleanup(); }

	// A record from before this change ({ parent, childId }) links with its id and makes no lookup
	fx = seed();
	try {
		const t = fakeTracker();
		assert.equal(ensureUnitIssueDetailed(epic(fx.repo), t.port, deps).ok, true);
		assert.equal(ensureUnitIssueDetailed(story(fx.repo), t.port, deps).ok, true);
		const lld = fx.read(lldArtifactId(HASH, 's1'));
		lld.meta.tracker.units['story:s1'].pendingLink = { parent: 'acme/demo#1', childId: 77 };
		writeFileSync(fx.json(lldArtifactId(HASH, 's1')), JSON.stringify(lld));
		const resolvesBefore = t.calls.resolve.length;
		const linksBefore = t.calls.link.length;
		assert.equal(ensureUnitIssueDetailed(story(fx.repo), t.port, deps).ok, true);
		assert.deepEqual(t.calls.link.slice(linksBefore), [['acme/demo#1', 77]]);
		assert.equal(t.calls.resolve.length, resolvesBefore);
		assert.equal(recordOf(fx, story(fx.repo)).pendingLink, undefined);
	} finally { fx.cleanup(); }
});
