/**
 * Story s9, tasks t7 to t10: the team module's git reads run through the tool registry. Each test runs the module against
 * real temporary repositories and records, with a hook on every git tool, which tools were called and by whom.
 * Run: npx tsx --test-force-exit src/workflow/team/__tests__/team-policy-registry.test.ts
 */

import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _resetToolHooksForTests, registerToolHook } from '../../../daemon/tools/hooks.js';
import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';
import { runPolicyScenarios } from './helpers/policy-scenarios.js';
import { newApi } from './helpers/new-policy-api.js';
import { newHandoffApi } from './helpers/new-handoff-api.js';
import { newSignoffApi } from './helpers/new-signoff-api.js';
import { runHandoffScenarios } from './helpers/handoff-scenarios.js';
import { runSignoffScenarios } from './helpers/signoff-scenarios.js';

const SIGNOFF_TOOLS = ['git_rev_parse', 'git_rev_list', 'git_ls_remote'];
const HANDOFF_TOOLS = ['git_status', 'git_cat_file', 'git_rev_list'];
const GIT_TOOLS = ['git_rev_parse', 'git_remote', 'git_symbolic_ref', 'git_cat_file', 'git_ls_tree', 'git_for_each_ref', 'git_path_history'];
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

const calls: Array<{ tool: string; caller: string | undefined }> = [];
beforeEach(() => {
	_resetRegistryForTests(); _resetToolHooksForTests(); calls.length = 0;
	for (const tool of new Set([...GIT_TOOLS, ...SIGNOFF_TOOLS, ...HANDOFF_TOOLS, 'git_stage', 'git_commit', 'git_push', 'git_status', 'git_diff', 'git_log'])) registerToolHook({ id: `spy-${tool}`, toolId: tool, async run(ctx) { calls.push({ tool: ctx.toolId, caller: ctx.caller }); } });
});
afterEach(() => { _resetToolHooksForTests(); });

test('team-policy-registry.test.ts: policyReader and findAnchor run through the registry on not a repo, no remote, detached HEAD, shallow, valid policy and invalid policy', async () => {
	const out = await runPolicyScenarios(newApi) as Record<string, any>;

	// every git read went through callTool as the workflow, and each tool of the module was reached
	assert.ok(calls.length > 0);
	assert.ok(calls.every(c => c.caller === 'workflow'), "the caller of every call is 'workflow'");
	assert.deepEqual([...new Set(calls.map(c => c.tool))].sort(), [...GIT_TOOLS].sort());

	// the cases the reader and the anchor finder answer
	assert.deepEqual(out['not a repository'].read, { ok: true, value: 'none' });
	assert.deepEqual(out['not a repository'].probe, { ok: true, value: false });
	assert.deepEqual(out['no remote'].read, { ok: true, value: 'none' });
	assert.equal(out['no remote'].remote.value, undefined);
	assert.match(out['a detached HEAD with the default branch unknown'].read.reason, /default branch of remote 'origin' is not known/);
	assert.equal(out['a policy on the default branch'].read.value.teamMode, true);
	assert.equal(out['a policy on the default branch'].anchor.known, true, 'a full clone has a known anchor');
	assert.equal(out['a shallow clone'].anchor.known, false, 'a shallow clone is never trusted for the anchor');
	assert.match(out['an invalid policy on the default branch'].read.reason, /policy file on refs\/remotes\/origin\/main is invalid/);
	assert.equal(out['a damaged sighting'].read.ok, true);
	assert.equal(out['a tracking ref that is gone after a sighting'].read.ok, true, 'the recorded commit still holds the policy');
});

test('team-policy-registry.test.ts: no runGit call remains in policy-reader.ts, anchor-finder.ts and sighting-store.ts', () => {
	for (const file of ['policy-reader.ts', 'anchor-finder.ts', 'sighting-store.ts']) {
		const text = readFileSync(join(SRC, file), 'utf8');
		assert.ok(!/\brunGit(Async)?\(/.test(text), `${file} calls no runGit`);
		assert.ok(!/execFileSync|execFile\(/.test(text), `${file} spawns nothing itself`);
	}
});

test('team-policy-registry.test.ts: the signoff branch checks run through the registry and equal the old results', async () => {
	const out = await runSignoffScenarios(newSignoffApi) as Record<string, any>;
	const used = new Set(calls.map(c => c.tool));
	for (const tool of SIGNOFF_TOOLS) assert.ok(used.has(tool), `${tool} was called`);
	assert.ok(calls.every(c => c.caller === 'workflow'), "the caller of every call is 'workflow'");
	assert.deepEqual(out['the branch of a checkout'], { onMain: 'main', onFeature: 'feature/x' }, 'a detached HEAD has no branch');
	assert.deepEqual(out['publish from a feature branch with an upstream'], { ok: true, value: 'feature/sign' });
	assert.match(out['publish from the default branch'].reason, /needs a branch other than the default branch \('main'\)/);
	assert.equal(out['default branch resolution'].named.branch, 'main');
	assert.equal(out['default branch resolution'].unreachable.ok, false);
});

test('team-policy-registry.test.ts: no runGit call remains in signoff.ts and branch-resolution.ts', () => {
	for (const file of ['signoff.ts', 'branch-resolution.ts']) {
		const text = readFileSync(join(SRC, file), 'utf8');
		assert.ok(!/\brunGit(Async)?\(/.test(text), `${file} calls no runGit`);
		assert.ok(!/execFileSync|execFile\(/.test(text), `${file} spawns nothing itself`);
	}
});

test('team-policy-registry.test.ts: the handoff drafts, park plan and resume checks run through the registry and equal the old results', async () => {
	const out = await runHandoffScenarios(newHandoffApi) as Record<string, any>;
	const used = new Set(calls.map(c => c.tool));
	for (const tool of HANDOFF_TOOLS) assert.ok(used.has(tool), `${tool} was called`);
	assert.ok(calls.every(c => c.caller === 'workflow'), "the caller of every call is 'workflow'");
	assert.deepEqual(out['the stage inferred from the committed artifacts'], { story0: 'design.story', epic0: 'design.epic', story1: 'plan', story2: 'complete', epic1: 'complete', uncommitted: 'design.story' });
	assert.equal(out['draft files of a unit'].clean.length, 0);
	assert.equal(out['draft files of a unit'].untracked.length, 2, "only the unit's own files, not another unit's or a note");
	assert.equal(out['the receiving repository'].same.ok, true);
	assert.equal(out['the receiving repository'].differs.ok, false);
});

test('team-policy-registry.test.ts: no runGit or runGitAsync call remains in handoff.ts', () => {
	const text = readFileSync(join(SRC, 'handoff.ts'), 'utf8');
	assert.ok(!/\brunGit(Async)?\(/.test(text), 'handoff.ts calls no runGit');
	assert.ok(!/execFileSync|execFile\(|git-async/.test(text), 'handoff.ts spawns nothing itself and imports no async runner');
});
