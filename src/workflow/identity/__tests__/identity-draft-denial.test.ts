/**
 * A denied tracker call stops the identity lookup and the draft hook (Story s10): it never becomes a fallback identity, an
 * 'unavailable' status or a "not ready" draft. A non-denial failure keeps the old fallback.
 * Run: npx tsx --test-force-exit src/workflow/identity/__tests__/identity-draft-denial.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { localIdentityDeps, resolveLearner } from '../../../understanding/identity.js';
import type { IdentityDeps } from '../../../understanding/identity.js';
import { ensureDraftIssues } from '../../draft-issues.js';
import type { ResolvedGithubConfig } from '../../config/github.js';
import { artifactJsonPath, defineArtifactId } from '../../storage.js';
import type { PortResult, TrackerPort } from '../../tracker/port.js';
import { ToolDenied } from '../../tracker/tool-denied.js';
import type { PolicyReader, TeamPolicy } from '../../team/types.js';
import { IdentityService } from '../identity-service.js';

const isDenied = (e: unknown): boolean => e instanceof ToolDenied && e.reason === 'declined';
const denied = (): ToolDenied => new ToolDenied('gh_tracker', 'declined');

describe('identity-draft-denial.test.ts: a denial inside idOf, resolveLearner and ensureDraftIssues stops the stage; a non-denial failure keeps the old fallback', () => {
	const service = (loadTracker: IdentityServiceLoad) => new IdentityService({ path: '/nonexistent/identity.json', loadTracker, run: async () => ({ code: 1, stdout: '', stderr: '', timedOut: false }) as never, osUser: () => 'sam', hostname: () => 'box' });
	type IdentityServiceLoad = NonNullable<ConstructorParameters<typeof IdentityService>[0]>['loadTracker'];
	const okTracker = (login: string): TrackerPort => ({ whoAmI: (): PortResult<string> => ({ ok: true, value: login }) }) as unknown as TrackerPort;

	for (const asyncMode of [false, true]) {
		const label = asyncMode ? 'async' : 'sync';
		const later = <T>(f: () => T): T | Promise<T> => (asyncMode ? new Promise<T>((res, rej) => setImmediate(() => { try { res(f()); } catch (e) { rej(e); } })) : f());

		it(`${label}: currentActor throws the denial from the tracker loader and from whoAmI, and is never the OS user`, async () => {
			await assert.rejects(service(() => later(() => { throw denied(); })).currentActor('/repo'), isDenied);
			await assert.rejects(service(() => later(() => ({ ok: true as const, value: { whoAmI: () => { throw denied(); } } as unknown as TrackerPort }))).currentActor('/repo'), isDenied);
		});

		it(`${label}: a non-denial failure of the tracker keeps the fallback to git, then the OS user, and a working tracker still names the login`, async () => {
			const fallback = await service(() => later(() => { throw new Error('boom'); })).currentActor('/repo');
			assert.match(fallback.id, /^(os:sam@box|git:.+)$/);
			const unusable = await service(() => later(() => ({ ok: false as const, kind: 'missing-signin' as const, reason: 'gh not signed in' }))).currentActor('/repo');
			assert.match(unusable.id, /^(os:sam@box|git:.+)$/);
			const named = await service(() => later(() => ({ ok: true as const, value: okTracker('Alice') }))).currentActor('/repo');
			assert.equal(named.id, 'github:alice');
		});
	}

	it('resolveLearner throws a provider lookup that was denied and does not fall back to git or the OS user; an ordinary lookup error is still an unavailable provider', async () => {
		const base = localIdentityDeps('insrc', (async () => ({ code: 1, stdout: '', stderr: '', timedOut: false })) as never);
		const withLookup = (lookup: () => Promise<never>): IdentityDeps => ({ ...base, providers: [{ source: 'github', lookup }] });
		await assert.rejects(resolveLearner('/repo', withLookup(async () => { throw denied(); })), isDenied);
		const fell = await resolveLearner('/repo', withLookup(async () => { throw new Error('boom'); }));
		assert.equal(fell.diagnostics.find(d => d.source === 'github')?.status, 'unavailable');
		assert.ok(fell.learner.source === 'git' || fell.learner.source === 'os');
	});

	describe('ensureDraftIssues', () => {
		const HASH = 'a3f4b8c9d1e2f3a4';
		const CFG: ResolvedGithubConfig = {
			type: 'github', owner: 'acme', repo: 'demo', epicLabel: 'epic', storyLabel: 'story', taskLabel: 'task',
			useMilestones: false, pushTasks: false, commitArtifacts: false, taskIssueType: 'Task', epicIssueType: 'Epic', storyIssueType: 'Story', source: 'per-repo-config',
		};
		const team: PolicyReader = () => ({ ok: true, value: { teamMode: true } as unknown as TeamPolicy });
		function seed(): { repo: string; define: string; cleanup: () => void } {
			const repo = mkdtempSync(join(tmpdir(), 'insrc-draft-den-'));
			mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
			const define = artifactJsonPath(repo, defineArtifactId(HASH));
			writeFileSync(define, JSON.stringify({
				meta: { workflow: 'define', runId: 'd1', repoPath: repo, epicHash: HASH, epicSlug: 'tag-filtering', createdAt: '2026-07-17T07:42:28.275Z', schemaVersion: 1 },
				body: { flavor: 'enhancement', problem: 'Users cannot filter todos by tag today. Only status filtering exists.', nonGoals: [], assumptions: [], constraints: [], stories: [{ id: 's1', title: 'Filter by tag', userValue: 'x', acceptanceCriteria: [] }], openQuestions: [] },
				citations: [],
			}, null, 2));
			return { repo, define, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
		}

		it('a denial from the tracker loader or from a lookup while the Epic issue is ensured is thrown, not a "not ready" draft; any other failure is still not ready', async () => {
			const fx = seed();
			try {
				const ensure = { readConfig: () => CFG, now: () => '2026-10-18T00:00:00.000Z' };
				await assert.rejects(ensureDraftIssues(fx.define, { readPolicy: team, ensure, loadTracker: () => { throw denied(); } }), isDenied);
				await assert.rejects(ensureDraftIssues(fx.define, { readPolicy: team, ensure, loadTracker: async () => { throw denied(); } }), isDenied);
				const port = { kind: 'github', capabilities: new Set(['issue-create']), findIssue: () => { throw denied(); }, findIssues: () => { throw denied(); }, issueOps: { ensureLabel: () => true } } as unknown as TrackerPort;
				await assert.rejects(ensureDraftIssues(fx.define, { readPolicy: team, ensure, loadTracker: () => ({ ok: true, value: port }) }), isDenied);
				// any other failure keeps the old result
				const ordinary = await ensureDraftIssues(fx.define, { readPolicy: team, ensure, loadTracker: () => { throw new Error('boom'); } });
				assert.equal(ordinary.status, 'not-ready');
				const unusable = await ensureDraftIssues(fx.define, { readPolicy: team, ensure, loadTracker: () => ({ ok: false, kind: 'missing-signin', reason: 'gh not signed in' }) });
				assert.equal(unusable.status, 'not-ready');
			} finally { fx.cleanup(); }
		});
	});
});
