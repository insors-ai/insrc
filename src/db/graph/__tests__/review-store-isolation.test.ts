/** Current replacements for the retired-review portion of the default-store audit. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runShell } from '../../../daemon/tools/shell-helper.js';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
// Every removed inventory entry maps to surviving behavior, not simply a missing path.
const replacements = [
	{ old: ['src/workflow/review/__tests__/probe-source-roots.test.ts'], current: ['src/workflow/__tests__/review-unavailable.test.ts'] },
	{ old: ['src/daemon/__tests__/code-review-rpc.test.ts', 'src/daemon/__tests__/workflow-review-rpc.test.ts'], current: ['src/daemon/__tests__/review-retirement-endpoints.test.ts', 'src/daemon/__tests__/lifecycle-wiring.test.ts'] },
	{ old: ['src/daemon/steps/review-step/__tests__/review-step-routing.test.ts', 'src/daemon/steps/review-step/__tests__/review-step.test.ts'], current: ['src/mcp/__tests__/review-unavailable-clients.test.ts', 'src/daemon/steps/__tests__/in-daemon-client.test.ts'] },
	{ old: ['src/workflow/__tests__/spec-review-approve.test.ts', 'src/workflow/review/__tests__/review.test.ts', 'src/workflow/review/__tests__/same-party-refusal.test.ts', 'src/workflow/review/__tests__/template-review.test.ts'], current: ['src/workflow/__tests__/review-retirement-workflow.test.ts', 'src/workflow/review-history/__tests__/readers.test.ts'] },
];
async function runInHome(file: string): Promise<{ graph: string[]; lance: boolean }> {
	assert.ok(existsSync(resolve(repo, file)), `replacement exists: ${file}`);
	const home = mkdtempSync(join(tmpdir(), 'insrc-review-isolation-'));
	try {
		const result = await runShell([process.execPath, '--import', 'tsx', '--test', '--test-reporter=tap', file], {
			cwd: repo, env: { ...process.env, HOME: home, NODE_TEST_CONTEXT: undefined }, timeoutMs: 120000, maxBytes: 256 * 1024,
		});
		const output = result.stdout + result.stderr;
		assert.equal(result.timedOut, false, `${file}: ${output.slice(-2500)}`);
		assert.equal(result.code, 0, `${file}: ${output.slice(-2500)}`);
		assert.equal(result.stdoutTruncated, false);
		const count = (key: string) => Number(new RegExp(`^# ${key} (\\d+)$`, 'm').exec(output)?.[1] ?? -1);
		assert.ok(count('pass') > 0, `${file}: real assertions ran`);
		for (const key of ['fail', 'cancelled', 'skipped', 'todo']) assert.equal(count(key), 0, `${file}: ${key}`);
		const directory = join(home, '.insrc');
		return { graph: existsSync(directory) ? readdirSync(directory).filter(n => n.startsWith('graph.lmdb')).sort() : [], lance: existsSync(join(directory, 'lance')) };
	} finally { rmSync(home, { recursive: true, force: true }); }
}

test('Current isolation inventories execute real tests and detect deliberate default-store opening', { timeout: 120000 }, async () => {
	const files = [...new Set(replacements.flatMap(entry => entry.current))];
	assert.equal(replacements.reduce((n, entry) => n + entry.old.length, 0), 9);
	for (const file of files) assert.deepEqual(await runInHome(file), { graph: [], lance: false }, file);
	// Falsify both store-absence checks using actual native opens, with a safe temporary HOME.
	assert.deepEqual((await runInHome('src/db/graph/__tests__/helpers/opens-default-store.fixture.ts')).graph, ['graph.lmdb', 'graph.lmdb-lock']);
	assert.equal((await runInHome('src/db/lance/__tests__/helpers-opens-default-lance.fixture.ts')).lance, true);
});
