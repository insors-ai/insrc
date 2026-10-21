/** Shared by the approve-time push tests: an in-memory tracker that records what is posted, and a repository with a Define, HLD, LLD and a two-Task plan. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _setAutoPushDepsForTests } from '../tracker-auto.js';
import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId, planArtifactId } from '../storage.js';
import { _setTrackerExecForTests } from '../tracker/github.js';
import { titleMatchesToken, type CreatedIssue, type IssueRef, type IssueSpec, type PortResult, type TrackerComment, type TrackerPort } from '../tracker/port.js';
import type { PolicyReader, TeamPolicy } from '../team/types.js';

export const HASH = 'a3f4b8c9d1e2f3a4';
export const SLUG = 'tag-filtering';
export const CREATED = '2026-07-17T07:42:28.275Z';
export const OK: PortResult<void> = { ok: true, value: undefined };

export const TEAM = { teamMode: true } as unknown as TeamPolicy;
export const teamPolicy: PolicyReader = () => ({ ok: true, value: TEAM });
export const offPolicy: PolicyReader = () => ({ ok: true, value: { teamMode: false } as unknown as TeamPolicy });
export const nonePolicy: PolicyReader = () => ({ ok: true, value: 'none' });
export const brokenPolicy: PolicyReader = () => ({ ok: false, reason: 'the default branch cannot be read' });

// ---------------------------------------------------------------------------
// An in-memory tracker that records what is posted
// ---------------------------------------------------------------------------

export function fakeTracker(over: { failFind?: boolean; failComment?: string } = {}) {
	const issues: Array<{ ref: IssueRef; spec: IssueSpec }> = [];
	const bodies = new Map<string, string>();
	const log = { creates: 0, comments: [] as Array<[string, string]>, writeBodies: 0 };
	const port = {
		kind: 'github', capabilities: new Set(['issue-create']),
		findIssues: (labels: string[]): PortResult<IssueRef[]> => ({ ok: true, value: issues.filter(i => labels.every(l => i.spec.labels.includes(l))).map(i => i.ref) }),
		findIssuesByTitleToken: (token: string): PortResult<IssueRef[]> => ({ ok: true, value: issues.filter(i => titleMatchesToken(i.spec.title, token)).map(i => i.ref) }),
		findIssue: (labels: string[]): PortResult<IssueRef | null> => {
			if (over.failFind === true) return { ok: false, reason: 'gh timed out', kind: 'unreachable' };
			return { ok: true, value: issues.find(i => labels.every(l => i.spec.labels.includes(l)))?.ref ?? null };
		},
		// the issue's comments as the tracker would answer them: whatever was posted
		listComments: (ref: IssueRef): PortResult<TrackerComment[]> => ({ ok: true, value: log.comments.filter(([r]) => r === ref).map(([, body], i) => ({ externalId: String(700 + i), author: 'insrc', text: body, at: '2026-10-21T00:00:00.000Z' })) }),
		issueOps: {
			ensureLabel: () => true,
			create: (spec: IssueSpec): PortResult<CreatedIssue> => {
				log.creates += 1;
				const ref = `acme/demo#${issues.length + 1}`;
				issues.push({ ref, spec }); bodies.set(ref, spec.body);
				return { ok: true, value: { ref, id: 1000 + issues.length, typed: true } };
			},
			linkSubIssue: () => OK,
			comment: (ref: IssueRef, body: string): PortResult<void> => {
				if (over.failComment !== undefined && body.includes(over.failComment)) return { ok: false, reason: 'comment rejected', kind: 'rejected' };
				log.comments.push([ref, body]); return OK;
			},
			readBody: (ref: IssueRef): PortResult<string> => ({ ok: true, value: bodies.get(ref) ?? '' }),
			writeBody: (ref: IssueRef, body: string): PortResult<void> => { log.writeBodies += 1; bodies.set(ref, body); return OK; },
			ensureMilestone: () => undefined,
			attachMilestone: () => OK,
		},
	} as unknown as TrackerPort;
	return { port, issues, log };
}

// ---------------------------------------------------------------------------
// A repo with a Define, HLD, LLD and a two-Task plan
// ---------------------------------------------------------------------------

export interface Fx { repo: string; hld: string; lld: string; plan: string; cleanup: () => void }

export function seed(opts: { pushTasks?: boolean } = {}): Fx {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-approve-fallback-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const cfg = join(repo, 'github.json');
	writeFileSync(cfg, JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo', pushTasks: opts.pushTasks ?? false } } }));
	const prior = process.env['INSRC_GITHUB_CONFIG'];
	process.env['INSRC_GITHUB_CONFIG'] = cfg;
	const put = (id: string, doc: unknown): string => { const p = artifactJsonPath(repo, id); writeFileSync(p, JSON.stringify(doc, null, 2) + '\n'); return p; };
	const base = { repoPath: repo, epicHash: HASH, epicSlug: SLUG, createdAt: CREATED };
	put(defineArtifactId(HASH), {
		meta: { workflow: 'define', runId: 'd1', ...base, schemaVersion: 1 },
		body: {
			flavor: 'enhancement', problem: 'Users cannot filter todos by tag today. Only status filtering exists.', nonGoals: [], assumptions: [],
			constraints: [{ id: 'k1', text: 'Reuse the sidebar', type: 'convention', source: 'c1' }],
			stories: [{ id: 's1', title: 'Filter by tag', userValue: 'find todos faster', acceptanceCriteria: [] }], openQuestions: [],
		},
		citations: [],
	});
	const review = { artifact: 'LLD', stage: 'design.story', verdict: 'pass', findings: [], counts: { high: 0, med: 0, low: 0 }, reviewedAt: '2026-07-21T00:00:00.000Z', model: 'm' };
	const hld = put(hldArtifactId(HASH), {
		meta: { workflow: 'design.epic', runId: 'h1', ...base, schemaVersion: 1 },
		body: { frameworkSummary: 'A tag filter.', chosenAlternative: 'a1', sharedContracts: [], rolloutOverview: { phases: [] }, openQuestions: [] }, citations: [],
	});
	const lld = put(lldArtifactId(HASH, 's1'), {
		meta: { workflow: 'design.story', runId: 'l1', ...base, storyId: 's1', hldBaseRunId: 'h1', hldEffectiveHash: 'deadbeefcafe0000', hldAmendmentsApplied: [], schemaVersion: 1, review },
		body: { chosenAlternative: 'a1', contractDetails: { surfaceLevel: 'internal', api: [] }, testStrategy: { testFramework: 'node:test', testLevels: [] } }, citations: [],
	});
	const plan = put(planArtifactId(HASH, 's1'), {
		meta: { workflow: 'plan', runId: 'p1', ...base, storyId: 's1', schemaVersion: 1, review },
		body: { tasks: [
			{ id: 't1', title: 'Add the input', summary: 's', size: 'S', order: 1, dependsOn: [], acceptanceChecks: ['renders'], derivedFrom: [], tests: [] },
			{ id: 't2', title: 'Filter the list', summary: 's', size: 'S', order: 2, dependsOn: ['t1'], acceptanceChecks: ['filters'], derivedFrom: [], tests: [] },
		], testStrategyCoverage: [] }, citations: [],
	});
	return {
		repo, hld, lld, plan,
		cleanup: () => { if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior; _setTrackerExecForTests(); _setAutoPushDepsForTests(); rmSync(repo, { recursive: true, force: true }); },
	};
}

export const trackerOf = (path: string): Record<string, any> => JSON.parse(readFileSync(path, 'utf8')).meta.tracker ?? {};
/** Runs one push with the tracker and policy injected (the exported push functions take only the path). */
export const via = (t: ReturnType<typeof fakeTracker>, policy: PolicyReader = teamPolicy) =>
	<T>(run: () => T): T => { _setAutoPushDepsForTests({ policy, port: t.port }); try { return run(); } finally { _setAutoPushDepsForTests(); } };

