/** Shared by the unit-issue tests: an in-memory tracker, a repository with a Define, HLD, LLD and plan, and the three unit builders. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId, planArtifactId } from '../../storage.js';
import type { ResolvedGithubConfig } from '../../config/github.js';
import { titleMatchesToken, type CreatedIssue, type IssueRef, type IssueSpec, type PortResult, type TrackerPort } from '../port.js';
import type { UnitRef } from '../refs.js';
import { draftMeta } from '../../__tests__/lifecycle-fixtures.js';

export const HASH = 'a3f4b8c9d1e2f3a4';
export const CREATED = '2026-07-17T07:42:28.275Z';
export const SLUG = 'tag-filtering';
export const MEMBERSHIP = `epic:${SLUG}`;

export const CFG: ResolvedGithubConfig = {
	type: 'github', owner: 'acme', repo: 'demo', epicLabel: 'epic', storyLabel: 'story', taskLabel: 'task',
	useMilestones: false, pushTasks: false, commitArtifacts: false, taskIssueType: 'Task', epicIssueType: 'Epic', storyIssueType: 'Story', source: 'per-repo-config',
};
export const deps = { readConfig: () => CFG, now: () => '2026-10-18T00:00:00.000Z' };

// ---------------------------------------------------------------------------
// An in-memory tracker
// ---------------------------------------------------------------------------

export interface Issue { number: number; ref: IssueRef; spec: IssueSpec; state: 'open' | 'closed' }

export function fakeTracker(over: {
	failFind?: boolean; failLabel?: string; failCreate?: boolean; commitThenFail?: boolean;
	/** The additive sc1 listing (findIssues); off by default, as on today's real port. */
	withListing?: boolean; failList?: boolean; failClose?: boolean; failLink?: number;
	/** Answer this many findIssue calls with "not found" whatever exists (a stale read of two daemons). */
	staleFinds?: number;
	/** Answer every title lookup with "none" whatever exists (a lagging title index). */
	staleTitle?: boolean;
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
		findIssuesByTitleToken: (token: string): PortResult<IssueRef[]> => ({ ok: true, value: over.staleTitle === true ? [] : issues.filter(i => titleMatchesToken(i.spec.title, token)).sort((a, b) => a.number - b.number).map(i => i.ref) }),
		...(over.withListing !== false ? {
			findIssues: (labels: string[]): PortResult<IssueRef[]> => {
				calls.list += 1;
				// the guard's lookup before a create is stale for a stale tracker; only the tie-break listing after a create fails
				if (over.staleTitle === true && calls.create === 0) return { ok: true, value: [] };
				if (over.failList === true && calls.create > 0) return { ok: false, reason: 'listing timed out', kind: 'unreachable' };
				return { ok: true, value: issues.filter(i => labels.every(l => i.spec.labels.includes(l))).sort((a, b) => a.number - b.number).map(i => i.ref) };
			},
		} : {}),
	} as unknown as TrackerPort;
	return { port, issues, calls, shared: { issues, next: counter } };
}

/** The issue an Epic's Define or a Story's LLD is bound to (s6): meta.envelope.binding. */
export const bound = (fx: ReturnType<typeof seed>, id: string): string | undefined => fx.read(id).meta.envelope?.binding?.reference?.entityId;
export const ref = (entityId: string) => ({ entityId, type: 'github:issue', relation: 'tracked-by' });

// ---------------------------------------------------------------------------
// A repo with a Define, HLD, LLD and plan
// ---------------------------------------------------------------------------

export function seed(opts: { readonly taskHead?: boolean } = {}): { repo: string; json: (id: string) => string; read: (id: string) => any; cleanup: () => void } {
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
	// the Task artifact the plan's approval made for row t1: a Task's issue is recorded on it
	if (opts.taskHead !== false) {
		put(`TASK-${HASH}-s1-t1`, {
			meta: { workflow: 'plan', epicHash: HASH, epicSlug: SLUG, storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED, ...draftMeta() },
			body: { planTaskId: 't1', title: 'Add the filter' }, citations: [],
		});
	}
	return {
		repo, json: id => artifactJsonPath(repo, id), read: id => JSON.parse(readFileSync(artifactJsonPath(repo, id), 'utf8')),
		cleanup: () => rmSync(repo, { recursive: true, force: true }),
	};
}

export const epic = (repo: string): UnitRef => ({ unit: 'epic', repoPath: repo, epicHash: HASH });
export const story = (repo: string): UnitRef => ({ unit: 'story', repoPath: repo, epicHash: HASH, storyId: 's1' });
export const task = (repo: string): UnitRef => ({ unit: 'task', repoPath: repo, epicHash: HASH, storyId: 's1', taskId: 't1' });
