/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The draft hook (sc3, ac15 to ac18): a Define, LLD or plan draft in a team repo
 * gets one tracker issue per unit; a second write creates none and runs no
 * command; a failure keeps the draft, stops, and says what is known.
 *
 * Run: npx tsx --test src/workflow/__tests__/draft-issues.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ensureDraftIssues, readinessFields, type DraftHookDeps } from '../draft-issues.js';
import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId, planArtifactId, writeArtifact } from '../storage.js';
import { _setTrackerExecForTests } from '../tracker/github.js';
import type { ResolvedGithubConfig } from '../config/github.js';
import type { CreatedIssue, IssueRef, IssueSpec, PortFailureKind, PortResult, TrackerPort } from '../tracker/port.js';
import type { PolicyReader, TeamPolicy } from '../team/types.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const SLUG = 'tag-filtering';
const CREATED = '2026-07-17T07:42:28.275Z';
const CFG: ResolvedGithubConfig = {
	type: 'github', owner: 'acme', repo: 'demo', epicLabel: 'epic', storyLabel: 'story', taskLabel: 'task',
	useMilestones: false, pushTasks: false, commitArtifacts: false, taskIssueType: 'Task', epicIssueType: 'Epic', storyIssueType: 'Story', source: 'per-repo-config',
};

const team: PolicyReader = () => ({ ok: true, value: { teamMode: true } as unknown as TeamPolicy });
const none: PolicyReader = () => ({ ok: true, value: 'none' });
const teamOff: PolicyReader = () => ({ ok: true, value: { teamMode: false } as unknown as TeamPolicy });

// ---------------------------------------------------------------------------
// An in-memory tracker and a loader that counts how often it is used
// ---------------------------------------------------------------------------

interface Over { failFind?: boolean; failCreateAt?: number; loadFails?: { kind: PortFailureKind; reason: string } }

function harness(over: Over = {}) {
	const issues: Array<{ ref: IssueRef; spec: IssueSpec }> = [];
	const seen = { loads: 0, creates: 0, finds: 0 };
	const port = {
		kind: 'github', capabilities: new Set(['issue-create']),
		findIssue: (labels: string[]): PortResult<IssueRef | null> => {
			seen.finds += 1;
			if (over.failFind === true) return { ok: false, reason: 'gh timed out', kind: 'unreachable' };
			return { ok: true, value: issues.find(i => labels.every(l => i.spec.labels.includes(l)))?.ref ?? null };
		},
		issueOps: {
			ensureLabel: () => true,
			create: (spec: IssueSpec): PortResult<CreatedIssue> => {
				seen.creates += 1;
				if (over.failCreateAt === seen.creates) return { ok: false, reason: 'gh create timed out', kind: 'unreachable' };
				const ref = `acme/demo#${issues.length + 1}`;
				issues.push({ ref, spec });
				return { ok: true, value: { ref, id: 1000 + issues.length, typed: true } };
			},
			linkSubIssue: () => ({ ok: true, value: undefined }),
		},
	} as unknown as TrackerPort;
	const deps = (policy: PolicyReader = team): DraftHookDeps => ({
		readPolicy: policy,
		loadTracker: () => { seen.loads += 1; return over.loadFails !== undefined ? { ok: false, ...over.loadFails } : { ok: true, value: port }; },
		ensure: { readConfig: () => CFG, now: () => '2026-10-18T00:00:00.000Z' },
	});
	return { deps, seen, issues };
}

// ---------------------------------------------------------------------------
// A repo with draft artifacts (the draft files exist before the hook runs)
// ---------------------------------------------------------------------------

function seed(): { repo: string; define: string; hld: string; lld: string; plan: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-draft-issues-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const put = (id: string, doc: unknown): string => { const p = artifactJsonPath(repo, id); writeFileSync(p, JSON.stringify(doc, null, 2) + '\n'); return p; };
	const base = { repoPath: repo, epicHash: HASH, epicSlug: SLUG, createdAt: CREATED };
	const define = put(defineArtifactId(HASH), {
		meta: { workflow: 'define', runId: 'd1', ...base, schemaVersion: 1 },
		body: {
			flavor: 'enhancement', problem: 'Users cannot filter todos by tag today. Only status filtering exists.', nonGoals: [], assumptions: [],
			constraints: [{ id: 'k1', text: 'Reuse the sidebar', type: 'convention', source: 'c1' }],
			stories: [{ id: 's1', title: 'Filter by tag', userValue: 'find todos faster', acceptanceCriteria: [] }], openQuestions: [],
		},
		citations: [],
	});
	const hld = put(hldArtifactId(HASH), { meta: { workflow: 'design.epic', runId: 'h1', ...base, schemaVersion: 1 }, body: {}, citations: [] });
	const lld = put(lldArtifactId(HASH, 's1'), { meta: { workflow: 'design.story', runId: 'l1', ...base, storyId: 's1', schemaVersion: 1 }, body: {}, citations: [] });
	const plan = put(planArtifactId(HASH, 's1'), {
		meta: { workflow: 'plan', runId: 'p1', ...base, storyId: 's1', schemaVersion: 1 },
		body: { tasks: [
			{ id: 't1', title: 'Add the input', summary: 's', size: 'S', order: 1, dependsOn: [], acceptanceChecks: ['renders'], derivedFrom: [], tests: [] },
			{ id: 't2', title: 'Filter the list', summary: 's', size: 'S', order: 2, dependsOn: ['t1'], acceptanceChecks: ['filters'], derivedFrom: [], tests: [] },
		] }, citations: [],
	});
	return { repo, define, hld, lld, plan, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------

test('ensureDraftIssues returns not-applicable without a team policy and maps policy and sc1 failures to messages', () => {
	const fx = seed();
	try {
		// no policy, teamMode false, and a workflow with no claim unit: nothing happens, no tracker is loaded
		for (const policy of [none, teamOff]) {
			const h = harness();
			assert.deepEqual(ensureDraftIssues(fx.define, h.deps(policy)), { status: 'not-applicable', reason: 'no-team-policy' });
			assert.equal(h.seen.loads, 0);
			assert.deepEqual(readinessFields({ status: 'not-applicable', reason: 'no-team-policy' }), {}, 'a repo without a policy sees no new field');
		}
		const spec = join(fx.repo, 'spec.json');
		writeFileSync(spec, JSON.stringify({ meta: { workflow: 'spec', repoPath: fx.repo, epicHash: HASH }, body: {} }));
		assert.deepEqual(ensureDraftIssues(spec, harness().deps()), { status: 'not-applicable', reason: 'no-claim-unit' });

		// an unreadable policy creates nothing and says why
		const h = harness();
		const broken = ensureDraftIssues(fx.define, h.deps(() => ({ ok: false, reason: 'default branch unknown' })));
		assert.equal(broken.status, 'not-ready');
		assert.deepEqual(broken.status === 'not-ready' ? [broken.kind, broken.outcomeKnown, broken.reason] : null, ['policy-unreadable', true, 'the team policy cannot be read: default branch unknown']);
		assert.equal(h.seen.loads, 0);

		// each sc1 failure kind from the loader becomes a not-ready message that names the reason
		for (const kind of ['missing-tool', 'missing-signin', 'unreachable', 'rejected'] as const) {
			const f = harness({ loadFails: { kind, reason: `reason for ${kind}` } });
			const r = ensureDraftIssues(fx.lld, f.deps());
			assert.equal(r.status, 'not-ready');
			if (r.status !== 'not-ready') continue;
			assert.equal(r.kind, kind);
			assert.equal(r.outcomeKnown, true);
			assert.match(r.message, new RegExp(`^cannot be claimed yet: no issue was created for epic because reason for ${kind}$`));
			assert.equal(readinessFields(r).notice, r.message);
		}
	} finally { fx.cleanup(); }
});

test('Define, LLD and plan drafts create one issue per unit, a second write creates none, and failures stop and report', () => {
	const fx = seed();
	try {
		const h = harness();
		// the Define draft: one Epic issue; the HLD adopts it
		const d1 = ensureDraftIssues(fx.define, h.deps());
		assert.deepEqual(d1, { status: 'ready', units: [{ unit: 'epic', issue: 'acme/demo#1', created: true }] });
		assert.deepEqual(ensureDraftIssues(fx.define, h.deps()), { status: 'ready', units: [{ unit: 'epic', issue: 'acme/demo#1', created: false }] });
		assert.equal(ensureDraftIssues(fx.hld, h.deps()).status, 'ready');
		assert.equal(h.seen.creates, 1);

		// the LLD draft: the Epic is adopted, the Story is created under it; a second write creates none
		const l1 = ensureDraftIssues(fx.lld, h.deps());
		assert.deepEqual(l1, { status: 'ready', units: [{ unit: 'epic', issue: 'acme/demo#1', created: false }, { unit: 'story:s1', issue: 'acme/demo#2', created: true }] });
		assert.equal(h.seen.creates, 2);

		// the plan draft with pushTasks off: both Tasks, in plan order
		const p1 = ensureDraftIssues(fx.plan, h.deps());
		assert.deepEqual(p1.status === 'ready' ? p1.units.filter(u => u.created).map(u => u.unit) : null, ['task:s1/t1', 'task:s1/t2']);
		assert.equal(h.seen.creates, 4);

		// every unit is recorded now: a second write of each draft creates nothing and loads no tracker (sign-in may be lost)
		const loadsBefore = h.seen.loads;
		const findsBefore = h.seen.finds;
		const lost = { ...h.deps(), loadTracker: () => { throw new Error('gh is signed out'); } };
		const ghCalls: string[][] = [];
		_setTrackerExecForTests((cmd, args) => { ghCalls.push([cmd, ...args]); throw new Error('gh is signed out'); });
		for (const path of [fx.define, fx.hld, fx.lld, fx.plan]) {
			// a real re-draft: the file is replaced by a fresh draft that carries no tracker block of its own
			const fresh = JSON.parse(readFileSync(path, 'utf8')) as { meta: Record<string, unknown> };
			delete fresh.meta['tracker'];
			writeArtifact(path, fresh, 'content');
			const r = ensureDraftIssues(path, lost);
			assert.equal(r.status, 'ready');
			assert.equal(r.status === 'ready' ? r.units.every(u => !u.created) : false, true);
		}
		assert.equal(h.seen.creates, 4);
		assert.equal(h.seen.loads, loadsBefore);
		assert.equal(h.seen.finds, findsBefore, 'no tracker call at all');
		assert.deepEqual(ghCalls, [], 'no gh command ran for the second writes (sign-in lost)');
		_setTrackerExecForTests();
	} finally { _setTrackerExecForTests(); fx.cleanup(); }

	// a failure on the second Task keeps the first, stops, and reports the second as unconfirmed
	const fy = seed();
	try {
		const withThree = JSON.parse(readFileSync(fy.plan, 'utf8'));
		withThree.body.tasks.push({ id: 't3', title: 'Persist the filter', summary: 's', size: 'S', order: 3, dependsOn: ['t2'], acceptanceChecks: ['persists'], derivedFrom: [], tests: [] });
		writeFileSync(fy.plan, JSON.stringify(withThree));
		const h = harness({ failCreateAt: 4 });   // the Epic, the Story, Task t1, then t2 fails; t3 must not be attempted
		const r = ensureDraftIssues(fy.plan, h.deps());
		assert.equal(r.status, 'not-ready');
		if (r.status !== 'not-ready') return;
		assert.equal(r.unit, 'task:s1/t2');
		assert.equal(r.outcomeKnown, false);
		assert.deepEqual(r.readyUnits.map(u => u.unit), ['epic', 'story:s1', 'task:s1/t1']);
		assert.equal(JSON.parse(readFileSync(fy.plan, 'utf8')).meta.tracker.taskRefs.t1, 'acme/demo#3', 'the first Task is recorded');
		assert.equal(h.seen.creates, 4, 'no later Task is attempted');
		assert.equal(JSON.parse(readFileSync(fy.plan, 'utf8')).meta.tracker.taskRefs.t3, undefined, 'Task t3 has no issue');
	} finally { fy.cleanup(); }
});

test('outcomeKnown wording for a failed lookup and for a create that times out', () => {
	const fx = seed();
	try {
		const lookup = ensureDraftIssues(fx.define, harness({ failFind: true }).deps());
		assert.equal(lookup.status, 'not-ready');
		if (lookup.status !== 'not-ready') return;
		assert.equal(lookup.outcomeKnown, true);
		assert.match(lookup.message, /^cannot be claimed yet: no issue was created for epic because /);

		const timeout = ensureDraftIssues(fx.define, harness({ failCreateAt: 1 }).deps());
		assert.equal(timeout.status, 'not-ready');
		if (timeout.status !== 'not-ready') return;
		assert.equal(timeout.outcomeKnown, false);
		assert.match(timeout.message, /^readiness could not be confirmed for epic: the issue may or may not exist; /);
		assert.doesNotMatch(timeout.message, /no issue (was created|exists)/, 'never says that no issue exists');
		assert.equal(readinessFields(timeout).notice, timeout.message);
	} finally { fx.cleanup(); }
});

test('a plan whose Story is recorded needs no Epic, and an issue that cannot be recorded is not reported ready', () => {
	const fx = seed();
	try {
		// the Story (and its record) exist, the Epic ref is nowhere: the plan still resolves with no tracker load
		const lld = JSON.parse(readFileSync(fx.lld, 'utf8'));
		lld.meta.tracker = { adapter: 'github', storyRef: 'acme/demo#2', units: { 'story:s1': { unit: 'story', unitId: 's1', issue: 'acme/demo#2', createdAtRevision: 1 } } };
		writeFileSync(fx.lld, JSON.stringify(lld));
		const plan = JSON.parse(readFileSync(fx.plan, 'utf8'));
		plan.meta.tracker = { adapter: 'github', taskRefs: { t1: 'acme/demo#3', t2: 'acme/demo#4' } };
		writeFileSync(fx.plan, JSON.stringify(plan));
		const h = harness();
		const r = ensureDraftIssues(fx.plan, h.deps());
		assert.equal(r.status, 'ready');
		assert.equal(h.seen.loads, 0);
		assert.equal(h.seen.creates, 0);
	} finally { fx.cleanup(); }

	// the record cannot be written (read-only artifacts folder): the issue is created, and the result says it was not recorded
	const fy = seed();
	try {
		const h = harness();
		chmodSync(join(fy.repo, '.insrc', 'artifacts'), 0o555);
		const r = ensureDraftIssues(fy.define, h.deps());
		chmodSync(join(fy.repo, '.insrc', 'artifacts'), 0o755);
		if (process.getuid?.() === 0) return;   // root ignores the mode
		assert.equal(r.status, 'not-ready');
		assert.match(r.status === 'not-ready' ? r.message : '', /exists for epic but could not be recorded/);
		assert.doesNotMatch(r.status === 'not-ready' ? r.message : '', /no issue was created/);
	} finally { chmodSync(join(fy.repo, '.insrc', 'artifacts'), 0o755); fy.cleanup(); }
});
