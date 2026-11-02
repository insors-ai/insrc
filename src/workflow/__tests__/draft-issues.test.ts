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
import { installExecStandIn } from './helpers/exec-stand-in.js';
import type { ResolvedGithubConfig } from '../config/github.js';
import { titleMatchesToken, type CreatedIssue, type IssueRef, type IssueSpec, type PortFailureKind, type PortResult, type TrackerPort } from '../tracker/port.js';
import type { PolicyReader, TeamPolicy } from '../team/types.js';
import { seedBoundUnits } from './helpers/task-heads.js';
import { ToolDenied } from '../tracker/tool-denied.js';
import { _setAutoPushDepsForTests, autoPushStoryOnLld } from '../tracker-auto.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const SLUG = 'tag-filtering';
const CREATED = '2026-07-17T07:42:28.275Z';
const CFG: ResolvedGithubConfig = {
	type: 'github', owner: 'acme', repo: 'demo', epicLabel: 'epic', storyLabel: 'story', taskLabel: 'task',
	useMilestones: false, pushTasks: false, commitArtifacts: false, taskIssueType: 'Task', epicIssueType: 'Epic', storyIssueType: 'Story', source: 'per-repo-config',
};

const team: PolicyReader = async () => ({ ok: true, value: { teamMode: true } as unknown as TeamPolicy });
const none: PolicyReader = async () => ({ ok: true, value: 'none' });
const teamOff: PolicyReader = async () => ({ ok: true, value: { teamMode: false } as unknown as TeamPolicy });

// ---------------------------------------------------------------------------
// An in-memory tracker and a loader that counts how often it is used
// ---------------------------------------------------------------------------

interface Over { soloConfig?: ResolvedGithubConfig; failFind?: boolean; failCreateAt?: number; loadFails?: { kind: PortFailureKind; reason: string } }

function harness(over: Over = {}) {
	const issues: Array<{ ref: IssueRef; spec: IssueSpec }> = [];
	const seen = { loads: 0, creates: 0, finds: 0, solo: 0 };
	const port = {
		kind: 'github', capabilities: new Set(['issue-create']),
		findIssues: (labels: string[]): PortResult<IssueRef[]> => ({ ok: true, value: issues.filter(i => labels.every(l => i.spec.labels.includes(l))).map(i => i.ref) }),
		findIssuesByTitleToken: (token: string): PortResult<IssueRef[]> => ({ ok: true, value: issues.filter(i => titleMatchesToken(i.spec.title, token)).map(i => i.ref) }),
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
		// a repo with no team policy: the tracker setting is off unless a test turns it on
		resolveConfig: async () => over.soloConfig ?? { type: 'none', source: 'default-config' },
		createTracker: () => { seen.solo += 1; return port; },
	});
	return { deps, seen, issues, port };
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

test('ensureDraftIssues returns not-applicable without a team policy and maps policy and sc1 failures to messages', async () => {
	const fx = seed();
	try {
		// no policy, teamMode false, and a workflow with no claim unit: nothing happens, no tracker is loaded
		for (const policy of [none, teamOff]) {
			const h = harness();
			assert.deepEqual(await ensureDraftIssues(fx.define, h.deps(policy)), { status: 'not-applicable', reason: 'no-team-policy' });
			assert.equal(h.seen.loads, 0);
			assert.deepEqual(readinessFields({ status: 'not-applicable', reason: 'no-team-policy' }), {}, 'a repo without a policy sees no new field');
		}
		const spec = join(fx.repo, 'spec.json');
		writeFileSync(spec, JSON.stringify({ meta: { workflow: 'spec', repoPath: fx.repo, epicHash: HASH }, body: {} }));
		assert.deepEqual(await ensureDraftIssues(spec, harness().deps()), { status: 'not-applicable', reason: 'no-claim-unit' });

		// an unreadable policy creates nothing and says why
		const h = harness();
		const broken = await ensureDraftIssues(fx.define, h.deps(() => ({ ok: false, reason: 'default branch unknown' })));
		assert.equal(broken.status, 'not-ready');
		assert.deepEqual(broken.status === 'not-ready' ? [broken.kind, broken.outcomeKnown, broken.reason] : null, ['policy-unreadable', true, 'the team policy cannot be read: default branch unknown']);
		assert.equal(h.seen.loads, 0);

		// each sc1 failure kind from the loader becomes a not-ready message that names the reason
		for (const kind of ['missing-tool', 'missing-signin', 'unreachable', 'rejected'] as const) {
			const f = harness({ loadFails: { kind, reason: `reason for ${kind}` } });
			const r = await ensureDraftIssues(fx.lld, f.deps());
			assert.equal(r.status, 'not-ready');
			if (r.status !== 'not-ready') continue;
			assert.equal(r.kind, kind);
			assert.equal(r.outcomeKnown, true);
			assert.match(r.message, new RegExp(`^cannot be claimed yet: no issue was created for epic because reason for ${kind}$`));
			assert.equal(readinessFields(r).notice, r.message);
		}
	} finally { fx.cleanup(); }
});

test('Define, LLD and plan drafts create one issue per unit, a second write creates none, and failures stop and report', async () => {
	const fx = seed();
	try {
		const h = harness();
		// the Define draft: one Epic issue; the HLD adopts it
		const d1 = await ensureDraftIssues(fx.define, h.deps());
		assert.deepEqual(d1, { status: 'ready', units: [{ unit: 'epic', issue: 'acme/demo#1', created: true }] });
		assert.deepEqual(await ensureDraftIssues(fx.define, h.deps()), { status: 'ready', units: [{ unit: 'epic', issue: 'acme/demo#1', created: false }] });
		assert.equal((await ensureDraftIssues(fx.hld, h.deps())).status, 'ready');
		assert.equal(h.seen.creates, 1);

		// the LLD draft: the Epic is adopted, the Story is created under it; a second write creates none
		const l1 = await ensureDraftIssues(fx.lld, h.deps());
		assert.deepEqual(l1, { status: 'ready', units: [{ unit: 'epic', issue: 'acme/demo#1', created: false }, { unit: 'story:s1', issue: 'acme/demo#2', created: true }] });
		assert.equal(h.seen.creates, 2);

		// the plan draft claims the Story only here (the Epic is checked only when the Story has no issue yet): its Tasks get their issues when the plan is approved (s7)
		const p1 = await ensureDraftIssues(fx.plan, h.deps());
		assert.deepEqual(p1.status === 'ready' ? p1.units.map(u => [u.unit, u.created]) : null, [['story:s1', false]]);
		assert.equal(h.seen.creates, 2);

		// every unit is recorded now: a second write of each draft creates nothing and loads no tracker (sign-in may be lost)
		const loadsBefore = h.seen.loads;
		const findsBefore = h.seen.finds;
		const lost = { ...h.deps(), loadTracker: () => { throw new Error('gh is signed out'); } };
		const ghCalls: string[][] = [];
		installExecStandIn((cmd, args) => { ghCalls.push([cmd, ...args]); throw new Error('gh is signed out'); });
		for (const path of [fx.define, fx.hld, fx.lld, fx.plan]) {
			// a real re-draft: the file is replaced by a fresh draft that carries no tracker block of its own
			const fresh = JSON.parse(readFileSync(path, 'utf8')) as { meta: Record<string, unknown> };
			delete fresh.meta['tracker'];
			writeArtifact(path, fresh, 'content');
			const r = await ensureDraftIssues(path, lost);
			assert.equal(r.status, 'ready');
			assert.equal(r.status === 'ready' ? r.units.every(u => !u.created) : false, true);
		}
		assert.equal(h.seen.creates, 2);
		assert.equal(h.seen.loads, loadsBefore);
		assert.equal(h.seen.finds, findsBefore, 'no tracker call at all');
		assert.deepEqual(ghCalls, [], 'no gh command ran for the second writes (sign-in lost)');
		installExecStandIn();
	} finally { installExecStandIn(); fx.cleanup(); }

	// a failure on the Story's create keeps the Epic, stops, and reports the Story as unconfirmed; no Task is attempted
	const fy = seed();
	try {
		const h = harness({ failCreateAt: 2 });   // the Epic, then the Story fails
		const r = await ensureDraftIssues(fy.plan, h.deps());
		assert.equal(r.status, 'not-ready');
		if (r.status !== 'not-ready') return;
		assert.equal(r.unit, 'story:s1');
		assert.equal(r.outcomeKnown, false);
		assert.deepEqual(r.readyUnits.map(u => u.unit), ['epic']);
		assert.equal(h.seen.creates, 2, 'no Task is attempted');
		assert.equal(JSON.parse(readFileSync(fy.plan, 'utf8')).meta.tracker?.taskRefs, undefined, 'no Task has an issue');
	} finally { fy.cleanup(); }
});

test('outcomeKnown wording for a failed lookup and for a create that times out', async () => {
	const fx = seed();
	try {
		const lookup = await ensureDraftIssues(fx.define, harness({ failFind: true }).deps());
		assert.equal(lookup.status, 'not-ready');
		if (lookup.status !== 'not-ready') return;
		assert.equal(lookup.outcomeKnown, true);
		assert.match(lookup.message, /^cannot be claimed yet: no issue was created for epic because /);

		const timeout = await ensureDraftIssues(fx.define, harness({ failCreateAt: 1 }).deps());
		assert.equal(timeout.status, 'not-ready');
		if (timeout.status !== 'not-ready') return;
		assert.equal(timeout.outcomeKnown, false);
		assert.match(timeout.message, /^readiness could not be confirmed for epic: the issue may or may not exist; /);
		assert.doesNotMatch(timeout.message, /no issue (was created|exists)/, 'never says that no issue exists');
		assert.equal(readinessFields(timeout).notice, timeout.message);
	} finally { fx.cleanup(); }
});

test('a plan whose Story is recorded needs no Epic, and an issue that cannot be recorded is not reported ready', async () => {
	const fx = seed();
	try {
		// the Story (and its record) exist, the Epic ref is nowhere: the plan still resolves with no tracker load
		seedBoundUnits(fx.repo, HASH, undefined, { s1: 'acme/demo#2' });
		const h = harness();
		const r = await ensureDraftIssues(fx.plan, h.deps());
		assert.equal(r.status, 'ready');
		assert.equal(h.seen.loads, 0);
		assert.equal(h.seen.creates, 0);
	} finally { fx.cleanup(); }

	// the unit's head cannot be written (read-only artifacts folder): nothing is created, because the issue could not be recorded
	const fy = seed();
	try {
		const h = harness();
		chmodSync(join(fy.repo, '.insrc', 'artifacts'), 0o555);
		const r = await ensureDraftIssues(fy.define, h.deps());
		chmodSync(join(fy.repo, '.insrc', 'artifacts'), 0o755);
		if (process.getuid?.() === 0) return;   // root ignores the mode
		assert.equal(r.status, 'not-ready');
		assert.match(r.status === 'not-ready' ? r.message : '', /no issue was created for epic because the head of EPIC-[0-9a-f]+ could not be made/);
		assert.equal(h.seen.creates, 0);
	} finally { chmodSync(join(fy.repo, '.insrc', 'artifacts'), 0o755); fy.cleanup(); }
});

// ---------------------------------------------------------------------------
// Story s9: a repo with no team policy gets its issues when the tracker is on
// ---------------------------------------------------------------------------

test("a team repo creates the stage's issue as before", async () => {
	const fx = seed();
	try {
		const h = harness({ soloConfig: CFG });
		const r = await ensureDraftIssues(fx.define, h.deps(team));
		assert.deepEqual(r, { status: 'ready', units: [{ unit: 'epic', issue: 'acme/demo#1', created: true }] });
		assert.equal(h.seen.loads, 1, 'the strict loader is used');
		assert.equal(h.seen.solo, 0, 'and the lenient port is not');
	} finally { fx.cleanup(); }
});

test('a repo with no team policy and a tracker that is on creates the Epic and Story issues', async () => {
	const fx = seed();
	try {
		for (const policy of [none, teamOff]) {
			const h = harness({ soloConfig: CFG });
			const r = await ensureDraftIssues(fx.lld, h.deps(policy));
			assert.equal(r.status, 'ready');
			assert.deepEqual(r.status === 'ready' ? r.units.map(u => [u.unit, u.created]) : null, [['epic', true], ['story:s1', true]]);
			assert.equal(h.seen.solo, 1);
			assert.equal(h.seen.loads, 0, 'the strict loader is not used');
			assert.equal(h.issues.length, 2);
			// a second write creates none
			const again = await ensureDraftIssues(fx.lld, h.deps(policy));
			assert.equal(again.status, 'ready');
			assert.equal(h.issues.length, 2);
			break;
		}
	} finally { fx.cleanup(); }
});

test('tracker type none makes no tracker call, a malformed github.json is not-ready, an entry with no type agrees with the lenient port, and a declined call is rethrown', async () => {
	const prior = process.env['INSRC_GITHUB_CONFIG'];
	const fx = seed();
	const cfg = join(fx.repo, 'github.json');
	process.env['INSRC_GITHUB_CONFIG'] = cfg;
	try {
		// type none: nothing is called and the draft sees no new field
		writeFileSync(cfg, JSON.stringify({ repos: { [fx.repo]: { type: 'none' } } }));
		const off = harness();
		const offDeps = { ...off.deps(none) }; delete (offDeps as { resolveConfig?: unknown }).resolveConfig;   // the real resolver reads the file
		assert.deepEqual(await ensureDraftIssues(fx.define, offDeps), { status: 'not-applicable', reason: 'no-team-policy' });
		assert.deepEqual([off.seen.solo, off.seen.loads, off.seen.finds, off.seen.creates], [0, 0, 0, 0]);

		// a malformed entry (type github with no target and no origin remote to take one from): not-ready with the reason, nothing created.
		// An unparseable file is read by the lenient loader as no setting, as the terminal approve reads it: tracker off.
		writeFileSync(cfg, JSON.stringify({ repos: { [fx.repo]: { type: 'github' } } }));
		const bad = harness();
		const badDeps = { ...bad.deps(none) }; delete (badDeps as { resolveConfig?: unknown }).resolveConfig;
		const r = await ensureDraftIssues(fx.define, badDeps);
		assert.equal(r.status, 'not-ready');
		if (r.status === 'not-ready') { assert.equal(r.outcomeKnown, true); assert.match(r.reason, /no owner\/repo is set/); assert.equal(readinessFields(r).notice, r.message); }
		assert.equal(bad.seen.solo, 0);

		// an entry that names owner and repo but no type: the lenient check turns it on and the lenient port gets that target
		writeFileSync(cfg, JSON.stringify({ repos: { [fx.repo]: { owner: 'acme', repo: 'demo' } } }));
		const typeless = harness();
		const targets: string[] = [];
		const typelessDeps = { ...typeless.deps(none), createTracker: (owner: string, repo: string) => { targets.push(`${owner}/${repo}`); return typeless.port; } };
		delete (typelessDeps as { resolveConfig?: unknown }).resolveConfig;
		assert.equal((await ensureDraftIssues(fx.define, typelessDeps)).status, 'ready');
		assert.deepEqual(targets, ['acme/demo']);
		assert.equal(typeless.issues.length, 1);

		// a declined registry call is rethrown, not made not-ready
		const denied = new ToolDenied('gh_tracker', 'declined', {});
		const refusing = new Proxy({ kind: 'github', capabilities: new Set(['issue-create']) }, { get: (t, k) => (k in t ? (t as never)[k] : () => { throw denied; }) }) as unknown as TrackerPort;
		const fx2 = seed();
		try {
			writeFileSync(join(fx2.repo, 'github.json'), JSON.stringify({ repos: { [fx2.repo]: { owner: 'acme', repo: 'demo' } } }));
			process.env['INSRC_GITHUB_CONFIG'] = join(fx2.repo, 'github.json');
			await assert.rejects(() => ensureDraftIssues(fx2.define, { readPolicy: none, createTracker: () => refusing, ensure: { now: () => '2026-10-18T00:00:00.000Z' } }), (e: unknown) => e === denied);
		} finally { fx2.cleanup(); }
	} finally {
		if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior;
		fx.cleanup();
	}
});

test('the terminal approve over issues the daemon already created creates nothing and no duplicate', async () => {
	const prior = process.env['INSRC_GITHUB_CONFIG'];
	const fx = seed();
	const cfg = join(fx.repo, 'github.json');
	try {
		writeFileSync(cfg, JSON.stringify({ repos: { [fx.repo]: { type: 'github', owner: 'acme', repo: 'demo', pushTasks: false } } }));
		process.env['INSRC_GITHUB_CONFIG'] = cfg;
		const h = harness({ soloConfig: CFG });
		assert.equal((await ensureDraftIssues(fx.lld, h.deps(none))).status, 'ready');
		assert.equal(h.issues.length, 2, 'the draft hook made the Epic and Story issues');

		_setAutoPushDepsForTests({ policy: none, port: h.port });
		const approved = await autoPushStoryOnLld(fx.lld);
		assert.equal(approved.status, 'already-exists');
		assert.equal(h.issues.length, 2, 'the approve created no issue and no duplicate');
		assert.equal(h.seen.creates, 2);
	} finally {
		_setAutoPushDepsForTests();
		if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior;
		fx.cleanup();
	}
});
