/**
 * Story s9, tasks t11 and t12: the build runners' git reads run through the tool registry. Each test runs the runners against real
 * temporary repositories and records, with a hook on every git tool, which tools were called and by whom.
 * Run: npx tsx --test-force-exit src/workflow/runners/build/__tests__/build-runners-registry.test.ts
 */

import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _resetToolHooksForTests, registerToolHook } from '../../../../daemon/tools/hooks.js';
import { _resetRegistryForTests } from '../../../../daemon/tools/registry.js';
import { buildStartRelPath } from '../range-base.js';
import { runBuildScenarios } from './helpers/build-scenarios.js';
import { newBuildApi } from './helpers/new-build-api.js';
import { newStoryApi } from './helpers/new-story-api.js';
import { runStoryScenarios } from './helpers/story-scenarios.js';
import { _setApprovalGateForTests } from '../../../../daemon/tools/executor.js';
import { changedFiles } from '../changed-files.js';
import { ToolDenied } from '../../../tracker/tool-denied.js';
import { _setWorkflowToolDepsForTests } from '../../../tracker/registry-table.js';

const RUNNER_TOOLS = ['git_rev_parse', 'git_cat_file', 'git_path_history'];
const STORY_TOOLS = ['git_rev_list', 'git_log', 'git_diff', 'git_diff_tree', 'git_merge_tree', 'git_hash_object'];
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const calls: Array<{ tool: string; caller: string | undefined }> = [];
beforeEach(() => {
	_resetRegistryForTests(); _resetToolHooksForTests(); calls.length = 0;
	for (const tool of [...RUNNER_TOOLS, ...STORY_TOOLS]) registerToolHook({ id: `spy-${tool}`, toolId: tool, async run(ctx) { calls.push({ tool: ctx.toolId, caller: ctx.caller }); } });
});
afterEach(() => { _resetToolHooksForTests(); _setApprovalGateForTests(undefined); _setWorkflowToolDepsForTests(); });

test('build-runners-registry.test.ts: resolveStoryRangeBase, stampBuildStart, readBuildStart, resolveStoryRangeEnd, headFullSha, headShortSha and priorCommit run through the registry on real repositories', async () => {
	const out = await runBuildScenarios(newBuildApi, buildStartRelPath) as Record<string, any>;

	assert.ok(calls.length > 0);
	assert.ok(calls.every(c => c.caller === 'workflow'), "the caller of every call is 'workflow'");
	assert.deepEqual([...new Set(calls.map(c => c.tool))].sort(), [...RUNNER_TOOLS].sort(), 'each tool of the runners was reached');

	assert.equal(out['the build-start stamp'].first, 'stamped');
	assert.equal(out['the build-start stamp'].stampIsHead, true, 'the stamp names HEAD');
	assert.equal(out['the build-start stamp'].again, 'kept');
	assert.equal(out['the build-start stamp'].invalid.kind, 'invalid', 'a stamp that names a commit the repository lacks is ignored');
	assert.equal(out['the range base from an upstream artifact'].byCommitIsIntroducing, true, 'the commit that introduced the upstream artifact');
	assert.equal(out['HEAD as the gate and the record read it'].fullIsHead, true);
	assert.equal(out['a BUILD record keeps its recorded commit'].kept, true, 'the prior commit is kept through a rewrite');
	assert.equal(out['no repository and no commit'].plain.stamp, 'not-written');
});

test('build-runners-registry.test.ts: no execFileSync call remains in range-base.ts, standalone-record.ts and gates.ts', () => {
	for (const file of ['runners/build/range-base.ts', 'runners/build/standalone-record.ts', 'gates.ts']) {
		const text = readFileSync(join(SRC, file), 'utf8');
		assert.ok(!/execFileSync|execFile\(|spawnSync/.test(text), `${file} spawns nothing itself`);
	}
});

test('build-runners-registry.test.ts: storyChangeSet, newestStoryCommit, mergeInProgress and collectDiff run through the registry including a merge commit, a squash and an empty Story', async () => {
	const out = await runStoryScenarios(newStoryApi) as Record<string, any>;
	const used = new Set(calls.map(c => c.tool));
	for (const tool of STORY_TOOLS) assert.ok(used.has(tool), `${tool} was called`);
	assert.ok(calls.every(c => c.caller === 'workflow'), "the caller of every call is 'workflow'");

	assert.deepEqual(out['commits of the range'].set.paths, ['src/a.ts', 'src/b.ts']);
	assert.equal(out['trailers pick the Story out of mixed commits'].story.attribution, 'story-trailer');
	assert.deepEqual(out['trailers pick the Story out of mixed commits'].story.paths, ['src/mine.ts']);
	assert.deepEqual(out['an empty Story and an unresolvable base'].empty.paths, [], 'an empty Story has no paths');
	assert.deepEqual(out['an empty Story and an unresolvable base'].badBase, { threw: 'NoBuildChangesError' });
	assert.ok(out['a clean merge, a conflicting merge and an octopus merge'].conflicted.paths.includes('clash.txt'), 'a conflicted merge edit is the Story\'s');
	assert.deepEqual(out['a merge in progress and a squash in progress'], { none: false, merging: true, squashing: true, notARepo: false });
});

test('build-runners-registry.test.ts: collectDiff runs through the executor and a denied call fails the derivation', async () => {
	const r = await (async () => {
		const { mkdtempSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { execFileSync } = await import('node:child_process');
		const dir = mkdtempSync(join(tmpdir(), 'collect-diff-'));
		const sh = (...a: string[]): string => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
		sh('init', '-q', '-b', 'main'); sh('config', 'user.email', 't@t'); sh('config', 'user.name', 't'); sh('config', 'commit.gpgsign', 'false');
		writeFileSync(join(dir, 'a.txt'), '1\n'); sh('add', '-A'); sh('commit', '-qm', 'base'); const base = sh('rev-parse', 'HEAD');
		writeFileSync(join(dir, 'a.txt'), '2\n'); sh('add', '-A'); sh('commit', '-qm', 'two');
		return { dir, base };
	})();
	assert.deepEqual(await changedFiles(r.dir, { base: r.base }), ['a.txt']);
	assert.ok(calls.some(c => c.tool === 'git_diff' && c.caller === 'workflow'), 'git_diff ran through the executor as the workflow');
	// a declined approval fails the stage: every git_diff call is denied
	_setApprovalGateForTests(() => ({ async ask(req) { return { requestId: req.requestId, decision: 'decline' }; } }));
	_setWorkflowToolDepsForTests({ approvalMode: 'manual' });
	const { gitDiffTool } = await import('../../../../daemon/tools/builtins/git/diff.js');
	const original = gitDiffTool.approval;
	(gitDiffTool as { approval?: unknown }).approval = 'common';
	try { await assert.rejects(changedFiles(r.dir, { base: r.base }), (e: unknown) => e instanceof ToolDenied && e.reason === 'declined'); }
	finally { (gitDiffTool as { approval?: unknown }).approval = original; }
});
