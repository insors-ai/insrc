/**
 * A validate turn records its round in the Task's own log (s7): a pass and a later fail are both there, the Task's revision does not
 * move, and a Task with no artifact keeps writing the BUILD record only.
 *
 * Run: npx tsx --test src/daemon/steps/build-step/__tests__/validate-task-round.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleBuildStep } from '../handler.js';
import { applyBuildDefaults } from '../../../repo-settings.js';
import { _setBuildValidateCheckRunnerForTests, _setBuildValidateProviderForTests } from '../phases/validate.js';
import { TEST_RUNNER_ARGV, TYPECHECK_ARGV, type ValidationCheckPlan, type ValidationCheckResults } from '../validation-checks.js';
import { createCompletionEvidence } from '../../../../workflow/artifact-core/completion-evidence.js';
import { approvedMeta, markApprovedSync } from '../../../../workflow/__tests__/lifecycle-fixtures.js';
import { approveJson } from '../../../../workflow/__tests__/helpers/approve.js';
import { approvalStateOf } from '../../../../workflow/artifact-core/approval-view.js';
import { ARTIFACTS_DIR, lldArtifactId, planArtifactId } from '../../../../workflow/storage.js';
import { lifecycleFor } from '../../../lifecycle-registry.js';
import '../../../../workflow/__tests__/helpers/converted-repos.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const AT = '2026-07-18T00:00:00.000Z';
const TASK = `TASK-${HASH}-s1-t1`;

const PASSING: ValidationCheckResults = {
	typecheck: { ok: true, command: 'npx tsc --noEmit', exitCode: 0, timedOut: false, durationMs: 1, outputTail: '' },
	tests:     { ok: true, command: 'npx tsx --test x.test.ts', exitCode: 0, timedOut: false, durationMs: 1, outputTail: '' },
};
_setBuildValidateCheckRunnerForTests(async () => PASSING);

const judge = (passed: boolean, reason: string) => ({ taskId: 't1', passed, checks: [], scopeRespected: true, reason });

/** An epic with an approved plan of one Task (t1); with `head`, the Task also has its own artifact. */
function repoWith(head: boolean): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-validate-task-round-'));
	const dir = join(repo, ARTIFACTS_DIR);
	mkdirSync(dir, { recursive: true });
	const meta = { epicHash: HASH, epicSlug: 'tag-filtering', createdAt: AT, epicCreatedAt: AT };
	writeFileSync(join(dir, `DEF-${HASH}.json`), JSON.stringify({ meta: { workflow: 'define', ...meta, ...approvedMeta({ at: AT }) }, body: { problem: 'p', stories: [{ id: 's1', title: 'Story one' }] }, citations: [] }));
	writeFileSync(join(dir, `${lldArtifactId(HASH, 's1')}.json`), JSON.stringify({ meta: { workflow: 'design.story', runId: 'l', schemaVersion: 1, ...meta, storyId: 's1', hldBaseRunId: 'h', hldEffectiveHash: 'x', hldAmendmentsApplied: [], ...approvedMeta({ at: AT }), tracker: { storyRef: 'acme/widgets#10' } }, body: { openQuestions: [] }, citations: [] }));
	const plan = join(dir, `${planArtifactId(HASH, 's1')}.json`);
	writeFileSync(plan, JSON.stringify({
		meta: { workflow: 'plan', runId: 'p', schemaVersion: 1, ...meta, storyId: 's1', lldRunId: 'l', lldEffectiveHash: 'x'},
		body: { tasks: [{ id: 't1', title: 'Wire the filter', summary: 'Add the filter.', size: 'M', order: 1, dependsOn: [], acceptanceChecks: ['narrows'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'unit: narrows' }] }] },
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD' }],
	}));
	markApprovedSync(plan);
	if (head) {
		writeFileSync(join(dir, `${TASK}.json`), JSON.stringify({
			meta: { workflow: 'plan', runId: 't', schemaVersion: 1, ...meta, storyId: 's1', repoPath: repo, revision: 1 },
			body: { title: 'Wire the filter', summary: 'Add the filter.', size: 'M', order: 1, acceptanceChecks: ['narrows'], tests: [{ level: 'unit', name: 'unit: narrows' }], planTaskId: 't1' }, citations: [],
		}));
	}
	return repo;
}

async function validate(repo: string, passed: boolean, reason: string): Promise<Record<string, unknown>> {
	_setBuildValidateProviderForTests({ async runReadOnlySession<T>() { return judge(passed, reason) as T; } });
	try {
		const env = await handleBuildStep({ phase: 'validate', target: 's1/t1', repo });
		return JSON.parse(env.content[0]!.text) as Record<string, unknown>;
	} finally { _setBuildValidateProviderForTests(undefined); }
}

test("a validate turn records its round in the Task's own log, and a Task with no head writes the BUILD record only and has no round", async () => {
	const repo = repoWith(true);
	try {
		const evidence = createCompletionEvidence(repo);
		const { store } = lifecycleFor(repo);
		assert.equal(await evidence.taskBuildPassed(TASK), false);

		const first = await validate(repo, true, 'all checks hold');
		assert.equal(first['next'], 'done');
		assert.equal(first['passed'], true);
		const after = await store.readWithHistory(TASK);
		const round = after.changeLog.at(-1);
		assert.equal(round?.operation, 'update');
		assert.equal(round?.revision, undefined, 'a round moves no revision');
		assert.deepEqual([round?.outcome?.result, round?.outcome?.summary], ['pass', 'all checks hold']);
		assert.equal(round?.actor.id, 'insrc:build');
		assert.equal(after.lifecycle.revision.number, 1);
		assert.equal(await evidence.taskBuildPassed(TASK), true);

		// a later failing round is in the log and un-passes the Task
		const second = await validate(repo, false, 'acceptance check 1 is not met');
		assert.equal(second['passed'], false);
		const rounds = (await store.readWithHistory(TASK)).changeLog.filter(e => e.outcome?.result === 'pass' || e.outcome?.result === 'fail');
		assert.deepEqual(rounds.map(e => e.outcome?.result), ['pass', 'fail']);
		assert.equal(await evidence.taskBuildPassed(TASK), false);
		// the BUILD record is still written
		assert.ok(existsSync(join(repo, ARTIFACTS_DIR, `BUILD-${HASH}-s1.json`)));
	} finally { rmSync(repo, { recursive: true, force: true }); }

	// a Task with no artifact: the verdict and the BUILD record are written, no Task head appears and the Task has no round
	const old = repoWith(false);
	try {
		const out = await validate(old, true, 'ok');
		assert.equal(out['next'], 'done');
		assert.ok(existsSync(join(old, ARTIFACTS_DIR, `BUILD-${HASH}-s1.json`)));
		assert.equal(readdirSync(join(old, ARTIFACTS_DIR)).some(n => n.startsWith('TASK-')), false);
		assert.equal((out['verdict'] as { evidence: Record<string, unknown> }).evidence['taskRoundNote'], undefined);
		assert.equal(await createCompletionEvidence(old).taskBuildPassed(TASK), false, 'the BUILD record does not answer for a Task with no head');
	} finally { rmSync(old, { recursive: true, force: true }); }
});

test("a Node project's round is unchanged", async () => {
	const repo = repoWith(true);
	writeFileSync(join(repo, 'package.json'), '{}\n');
	const plans: ValidationCheckPlan[] = [];
	_setBuildValidateCheckRunnerForTests(async (_repo, plan) => { plans.push(plan); return PASSING; });
	try {
		const out = await validate(repo, true, 'all checks hold');
		assert.equal(out['next'], 'done');
		assert.equal(out['passed'], true);
		// The gate was handed today's plan: the Node commands, read as TAP.
		assert.equal(plans.length, 1);
		assert.deepEqual([plans[0]!.typecheck, plans[0]!.testCommand, plans[0]!.resultFormat, plans[0]!.commandsSource], [TYPECHECK_ARGV, TEST_RUNNER_ARGV, 'tap', 'node-default']);
	} finally {
		_setBuildValidateCheckRunnerForTests(async () => PASSING);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('a project with no commands is not passed and its record says the gate ran nothing', async () => {
	const repo = repoWith(true);   // no marker file: no command is known, so the real runner runs nothing
	_setBuildValidateCheckRunnerForTests(undefined);
	try {
		// The judge says yes, and the daemon's own result still fails the Task.
		const out = await validate(repo, true, 'the change reads right');
		assert.equal(out['next'], 'done');
		assert.equal(out['passed'], false);
		const verdict = out['verdict'] as { testsPassed: boolean; typecheckClean: boolean; evidence: { typecheck: { note?: string }; tests: { note?: string } } };
		assert.deepEqual([verdict.testsPassed, verdict.typecheckClean], [false, false]);
		assert.match(verdict.evidence.typecheck.note ?? '', /the gate ran nothing/);
		assert.match(verdict.evidence.tests.note ?? '', /the gate ran nothing/);
		assert.equal(await createCompletionEvidence(repo).taskBuildPassed(TASK), false);
	} finally {
		_setBuildValidateCheckRunnerForTests(async () => PASSING);
		rmSync(repo, { recursive: true, force: true });
	}
});

test("a settings edit while the checks run changes neither the plan, the judge prompt nor the settings refusal: the profile is resolved once, at the phase's entry", async () => {
	const repo = repoWith(true);
	writeFileSync(join(repo, 'go.mod'), 'module x\n');
	const dir = mkdtempSync(join(tmpdir(), 'insrc-github-config-'));
	const config = join(dir, 'repo-config.json');
	const entry = { typecheckCommand: 'go vet ./...', testCommand: 'go test', resultFormat: 'exit-code' };
	const prompts: string[] = [];
	const plans: ValidationCheckPlan[] = [];
	const edits: Array<Record<string, unknown>> = [{}, { typecheckCommand: 'go vet ./...' }];   // clear both commands; leave one command set
	const saved = process.env['INSRC_REPO_CONFIG'];
	process.env['INSRC_REPO_CONFIG'] = config;
	try {
		for (const edit of edits) {
			writeFileSync(config, JSON.stringify({ repos: { [repo]: entry } }));
			prompts.length = 0; plans.length = 0;
			_setBuildValidateCheckRunnerForTests(async (_repo, plan) => {
				plans.push(plan);
				writeFileSync(config, JSON.stringify({ repos: { [repo]: edit } }));   // the edit lands while the checks run
				return PASSING;
			});
			_setBuildValidateProviderForTests({ async runReadOnlySession<T>(prompt: string) { prompts.push(prompt); return judge(true, 'ok') as T; } });
			const env = await handleBuildStep({ phase: 'validate', target: 's1/t1', repo });
			const out = JSON.parse(env.content[0]!.text) as Record<string, unknown>;
			const label = JSON.stringify(edit);
			// The verdict session ran, on the profile the phase started with (not a refusal after the checks).
			assert.equal(out['next'], 'done', label);
			assert.equal(plans.length, 1, label);
			assert.deepEqual([plans[0]!.commandsSource, plans[0]!.testCommand], ['repo-setting', ['go', 'test']], label);
			assert.equal(prompts.length, 1, label);
			assert.match(prompts[0]!, /the daemon\s+has already run them/, `${label}: the checks ran, and the judge is told so`);
			assert.doesNotMatch(prompts[0]!, /The daemon ran no typecheck or tests/, label);
		}
	} finally {
		if (saved === undefined) delete process.env['INSRC_REPO_CONFIG']; else process.env['INSRC_REPO_CONFIG'] = saved;
		_setBuildValidateCheckRunnerForTests(async () => PASSING);
		_setBuildValidateProviderForTests(undefined);
		rmSync(dir, { recursive: true, force: true });
		rmSync(repo, { recursive: true, force: true });
	}
});

test('src/daemon/steps/build-step/__tests__/validate-task-round.test.ts: a repo whose commands came from the add defaults is gated by those commands as an ordinary repo setting', async () => {
	const repo = repoWith(true);
	writeFileSync(join(repo, 'pyproject.toml'), '');
	const dir = mkdtempSync(join(tmpdir(), 'insrc-github-config-'));
	const config = join(dir, 'repo-config.json');
	const plans: ValidationCheckPlan[] = [];
	const saved = process.env['INSRC_REPO_CONFIG'];
	process.env['INSRC_REPO_CONFIG'] = config;
	try {
		// the commands are stored the way repo.add stores them, then the gate reads them like any setting
		assert.deepEqual(await applyBuildDefaults(repo, { configPath: config }), { applied: true, projectType: 'python' });
		_setBuildValidateCheckRunnerForTests(async (_repo, plan) => { plans.push(plan); return PASSING; });
		const out = await validate(repo, true, 'all checks hold');
		assert.equal(out['next'], 'done');
		assert.equal(out['passed'], true);
		assert.equal(plans.length, 1);
		assert.deepEqual(
			[plans[0]!.commandsSource, plans[0]!.typecheck, plans[0]!.testCommand, plans[0]!.resultFormat],
			['repo-setting', ['mypy', '.'], ['pytest'], 'exit-code'],
		);
	} finally {
		if (saved === undefined) delete process.env['INSRC_REPO_CONFIG']; else process.env['INSRC_REPO_CONFIG'] = saved;
		_setBuildValidateCheckRunnerForTests(async () => PASSING);
		rmSync(dir, { recursive: true, force: true });
		rmSync(repo, { recursive: true, force: true });
	}
});
