/**
 * Story s9, task t17: a call of a moved site that is denied (declined, timed out, no client, cancelled) fails the site's stage with that
 * denial, and no later call of the stage is made. The git and gh tools the sites use are reads that never ask, so the test puts the tools
 * of the site in an approval class that does (the edge case of the LLD: a tool of the site in the common class under manual mode, or in
 * the destructive class with no client), and the gate answers with each reason.
 * Run: npx tsx --test-force-exit src/workflow/__tests__/registry-denial-s9.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createRepoIgnoreFilter } from '../../analyze/context/repo-ignore-filter.js';
import { ghAuthTool } from '../../daemon/tools/builtins/gh/account.js';
import { ghTrackerTool } from '../../daemon/tools/builtins/gh/tracker.js';
import { gitCatFileTool } from '../../daemon/tools/builtins/git/cat-file.js';
import { gitConfigTool } from '../../daemon/tools/builtins/git/config.js';
import { gitDiffTool } from '../../daemon/tools/builtins/git/diff.js';
import { gitForEachRefTool } from '../../daemon/tools/builtins/git/for-each-ref.js';
import { gitLogTool } from '../../daemon/tools/builtins/git/log.js';
import { gitLsFilesTool } from '../../daemon/tools/builtins/git/ls-files.js';
import { gitLsRemoteTool } from '../../daemon/tools/builtins/git/ls-remote.js';
import { gitLsTreeTool } from '../../daemon/tools/builtins/git/ls-tree.js';
import { gitPathHistoryTool } from '../../daemon/tools/builtins/git/path-history.js';
import { gitRemoteTool } from '../../daemon/tools/builtins/git/remote.js';
import { gitRevListTool } from '../../daemon/tools/builtins/git/rev-list.js';
import { gitRevParseTool } from '../../daemon/tools/builtins/git/rev-parse.js';
import { gitShowTool } from '../../daemon/tools/builtins/git/show.js';
import { gitStatusTool } from '../../daemon/tools/builtins/git/status.js';
import { gitSymbolicRefTool } from '../../daemon/tools/builtins/git/symbolic-ref.js';
import { _setApprovalGateForTests } from '../../daemon/tools/executor.js';
import { _resetToolHooksForTests, registerToolHook } from '../../daemon/tools/hooks.js';
import { _resetRegistryForTests } from '../../daemon/tools/registry.js';
import type { ApprovalClass, ApprovalGate } from '../../daemon/tools/types.js';
import { readPinnedSources } from '../../design/corpus/sources/git-reader.js';
import { gitFixture } from '../../design/corpus/sources/__tests__/git-fixtures.js';
import { githubIdentities } from '../../understanding/identity.js';
import { resolveReviewer } from '../artifacts/companion/header.js';
import { assertCleanTree } from '../convert/plan.js';
import { headFullSha } from '../gates.js';
import { readBuildStart, resolveStoryRangeBase, stampBuildStart } from '../runners/build/range-base.js';
import { headShortSha } from '../runners/build/standalone-record.js';
import { mergeInProgress, storyChangeSet } from '../runners/build/story-commits.js';
import { _setWorkflowToolDepsForTests } from '../tracker/registry-table.js';
import { ToolDenied } from '../tracker/tool-denied.js';
import { currentBranchOf } from '../team/signoff.js';
import { inferStageWorkflow, unitDraftFiles } from '../team/handoff.js';
import { findAnchor } from '../team/anchor-finder.js';
import { readPolicy } from '../team/policy-reader.js';
import { refreshPolicy } from '../team/policy-refresh.js';
import { trackedFiles, trivialCheckPlan } from '../../daemon/steps/build-step/validation-checks.js';
import { VALID_POLICY, cloneOf, commitFile, git, makeFixture, makeOrigin } from '../team/__tests__/git-fixture.js';
import { POLICY_PATH } from '../team/types.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const GIT_TOOLS = [gitCatFileTool, gitConfigTool, gitDiffTool, gitForEachRefTool, gitLogTool, gitLsFilesTool, gitLsRemoteTool, gitLsTreeTool, gitPathHistoryTool,
	gitRemoteTool, gitRevListTool, gitRevParseTool, gitShowTool, gitStatusTool, gitSymbolicRefTool, ghAuthTool, ghTrackerTool];

const dirs: string[] = [];
const successes: string[] = [];
const saved = new Map<string, unknown>();
const savedEnv = { ...process.env };
let asked: number;

function setup(): void {
	_resetRegistryForTests(); _resetToolHooksForTests(); successes.length = 0; asked = 0;
	for (const t of GIT_TOOLS) registerToolHook({ id: `spy-${t.id}`, toolId: t.id, async run(ctx) { successes.push(ctx.toolId); } });
	process.env['GIT_CONFIG_GLOBAL'] = '/dev/null'; process.env['GIT_CONFIG_NOSYSTEM'] = '1';
}
function teardown(): void {
	_setApprovalGateForTests(undefined); _setWorkflowToolDepsForTests(); _resetToolHooksForTests();
	for (const t of GIT_TOOLS) { if (saved.has(t.id)) (t as { approval?: unknown }).approval = saved.get(t.id); }
	saved.clear(); process.env = { ...savedEnv };
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
}

/** Put every tool of the sites in `cls`, so a call of one asks. */
function askAlways(cls: ApprovalClass): void {
	for (const t of GIT_TOOLS) { saved.set(t.id, (t as { approval?: unknown }).approval); (t as { approval?: unknown }).approval = cls; }
}

const gates: Array<[string, ApprovalGate]> = [
	['declined', { async ask(r) { asked++; return { requestId: r.requestId, decision: 'decline' }; } }],
	['timed-out', { async ask() { asked++; return 'timed-out'; } }],
	['no-client', { async ask() { asked++; return 'no-client'; } }],
	['cancelled', { async ask() { asked++; return 'cancelled'; } }],
];

const tmp = (prefix: string): string => { const d = mkdtempSync(join(tmpdir(), `${prefix}-`)); dirs.push(d); return d; };
const put = (dir: string, path: string, text = 'x\n'): void => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };

/** A clone with the team policy on its default branch, an origin, and a committed file. */
function teamClone(): { teamDir: string; clone: string } {
	const f = makeFixture(); dirs.push(f.root);
	const { bare, work } = makeOrigin(f);
	commitFile(work, POLICY_PATH, VALID_POLICY, 'adopt policy', '2026-02-01T00:00:00+00:00');
	git(work, 'push', '-q', 'origin', 'main');
	return { teamDir: f.teamDir, clone: cloneOf(f, bare, 'clone') };
}

function plainRepo(): string {
	const dir = tmp('denial-repo');
	git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 't@t'); git(dir, 'config', 'user.name', 't'); git(dir, 'config', 'commit.gpgsign', 'false');
	put(dir, 'README.md'); put(dir, '.insrc/artifacts/x.json', '{}\n');
	git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'init');
	return dir;
}

/** The sites, one entry per group; each runs the site's first git call (and the calls after it, if it were not stopped). */
const SITES: Array<[string, () => Promise<unknown>]> = [
	['team policy: readPolicy', async () => { const t = teamClone(); return readPolicy(t.clone, { teamDir: t.teamDir }); }],
	['team policy: findAnchor', async () => { const t = teamClone(); return findAnchor(t.clone, 'refs/remotes/origin/main'); }],
	['refresh: refreshPolicy', async () => { const t = teamClone(); return refreshPolicy(t.clone, { teamDir: t.teamDir }); }],
	['signoff: currentBranchOf', async () => currentBranchOf(plainRepo())],
	['handoff: unitDraftFiles', async () => unitDraftFiles(plainRepo(), { epicHash: HASH, storyId: 's1' })],
	['handoff: inferStageWorkflow', async () => { const r = plainRepo(); return inferStageWorkflow(r, { epicHash: HASH, storyId: 's1', repoPath: r }); }],
	['build runners: stampBuildStart', async () => stampBuildStart(plainRepo(), HASH, 's1')],
	['build runners: readBuildStart', async () => { const r = plainRepo(); put(r, `.insrc/build-start/${HASH}-s1.json`, JSON.stringify({ epicHash: HASH, storyId: 's1', rangeBase: 'a'.repeat(40), stampedAt: '2026-01-01T00:00:00.000Z' })); return readBuildStart(r, HASH, 's1'); }],
	['build runners: resolveStoryRangeBase', async () => { const r = plainRepo(); put(r, `.insrc/artifacts/PLAN-${HASH}-s1.json`, '{}\n'); git(r, 'add', '-A'); git(r, 'commit', '-q', '-m', 'plan'); return resolveStoryRangeBase(r, HASH, 's1'); }],
	['build runners: storyChangeSet', async () => { const r = plainRepo(); const base = git(r, 'rev-parse', 'HEAD').trim(); put(r, 'a.ts'); git(r, 'add', '-A'); git(r, 'commit', '-q', '-m', 'a'); return storyChangeSet(r, base); }],
	['build runners: mergeInProgress', async () => mergeInProgress(plainRepo())],
	['build runners: headShortSha', async () => headShortSha(plainRepo())],
	['build runners: the gate\'s headFullSha', async () => headFullSha(plainRepo())],
	['validation checks: trackedFiles', async () => trackedFiles(plainRepo())],
	['validation checks: trivialCheckPlan', async () => trivialCheckPlan(plainRepo())],
	['ignore filter: createRepoIgnoreFilter', async () => createRepoIgnoreFilter(plainRepo())],
	['companion header: resolveReviewer', async () => resolveReviewer(plainRepo())],
	['convert plan: assertCleanTree', async () => assertCleanTree(plainRepo())],
	['corpus reader: readPinnedSources', async () => { const f = gitFixture(); dirs.push(f.dir); return readPinnedSources(f.dir, f.request); }],
	['identity: githubIdentities', async () => {
		const bin = tmp('denial-gh'); writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho \'{"hosts":{}}\'\n'); chmodSync(join(bin, 'gh'), 0o755);
		process.env['PATH'] = `${bin}:${savedEnv['PATH'] ?? ''}`; return githubIdentities();
	}],
];

test('registry-denial-s9.test.ts: for each group of sites and each denial reason (declined, timed-out, no-client, cancelled) the stage fails with the denial and no later git call is made', async () => {
	for (const [reason, gate] of gates) {
		for (const [name, site] of SITES) {
			setup();
			try {
				_setApprovalGateForTests(() => gate);
				_setWorkflowToolDepsForTests({ approvalMode: 'manual' });
				askAlways('common');
				await assert.rejects(site(), (e: unknown) => e instanceof ToolDenied && e.reason === reason, `${name} is stopped by the ${reason} denial`);
				assert.equal(asked, 1, `${name}: only the first call asked; none came after it`);
				assert.deepEqual(successes, [], `${name}: no call of the stage ran`);
			} finally { teardown(); }
		}
	}
});

test('registry-denial-s9.test.ts: a destructive-class call with no client is denied on a moved site', async () => {
	for (const [name, site] of SITES) {
		setup();
		try {
			askAlways('destructive');           // no approval gate is registered: there is no client to ask
			await assert.rejects(site(), (e: unknown) => e instanceof ToolDenied && e.reason === 'no-client', `${name} is denied with no client`);
			assert.deepEqual(successes, [], `${name}: no call of the stage ran`);
		} finally { teardown(); }
	}
});
