/**
 * Story s9, tasks t11 and t12: the build runners' git reads run through the tool registry. Each test runs the runners against real
 * temporary repositories and records, with a hook on every git tool, which tools were called and by whom.
 * Run: npx tsx --test-force-exit src/workflow/runners/build/__tests__/build-runners-registry.test.ts
 */

import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _resetToolHooksForTests, registerToolHook } from '../../../../daemon/tools/hooks.js';
import { _resetRegistryForTests } from '../../../../daemon/tools/registry.js';
import { buildStartRelPath } from '../range-base.js';
import { runBuildScenarios } from './helpers/build-scenarios.js';
import { newBuildApi } from './helpers/new-build-api.js';

const RUNNER_TOOLS = ['git_rev_parse', 'git_cat_file', 'git_path_history'];
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const calls: Array<{ tool: string; caller: string | undefined }> = [];
beforeEach(() => {
	_resetRegistryForTests(); _resetToolHooksForTests(); calls.length = 0;
	for (const tool of RUNNER_TOOLS) registerToolHook({ id: `spy-${tool}`, toolId: tool, async run(ctx) { calls.push({ tool: ctx.toolId, caller: ctx.caller }); } });
});
afterEach(() => { _resetToolHooksForTests(); });

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
