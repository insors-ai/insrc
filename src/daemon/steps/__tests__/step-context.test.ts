/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The per-call step context (Epic c2ba6fa6, Story s11, task t6): inside a step
 * call the readers use the caller's cwd, INSRC_REPO and client; outside one
 * they keep the process defaults. No daemon, no store, no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { resolveScope } from '../../../analyze/context/scope.js';
import type { ScopeDeps } from '../../../analyze/context/scope.js';
import { currentClientProviderKind } from '../../../analyze/context/shaper-provider.js';
import {
	currentStepContext,
	runInStepContext,
	stepClient,
	stepCwd,
} from '../../../shared/step-context.js';
import { familyForClient } from '../../model-registry.js';
import type { StepCallContext } from '../../../shared/step-context.js';
import { runAnalyzeOneShot } from '../analyze-oneshot.js';
import { DEFAULT_DEPS, handleCodeReviewStep, withStepClient } from '../code-review-step/handler.js';
import type { CodeReviewStepDeps } from '../code-review-step/handler.js';
import { resolveRepoPath } from '../resolve-repo.js';

const CALLER_CWD  = '/caller/workspace';
const CALLER_REPO = '/caller/pinned-repo';
const PROCESS_REPO = '/process/pinned-repo';

/** Run `fn` with the process's INSRC_REPO set to `value`, restoring it after. */
async function withProcessEnvRepo<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
	const before = process.env['INSRC_REPO'];
	if (value === undefined) delete process.env['INSRC_REPO']; else process.env['INSRC_REPO'] = value;
	try { return await fn(); } finally {
		if (before === undefined) delete process.env['INSRC_REPO']; else process.env['INSRC_REPO'] = before;
	}
}

const tick = (): Promise<void> => new Promise(r => setTimeout(r, 5));

test("resolveRepoPath inside a step call uses the context's cwd and envRepo, not the process's; outside one it keeps process defaults", async () => {
	await withProcessEnvRepo(PROCESS_REPO, async () => {
		const asked: string[] = [];
		const noMatch = async (cwd: string): Promise<string | null> => { asked.push(cwd); return null; };
		const byCwd   = async (cwd: string): Promise<string | null> => (cwd === CALLER_CWD ? '/caller/registered' : null);

		// Inside: the cwd lookup is asked for the caller's cwd, and the fallback is the caller's INSRC_REPO.
		const inside = await runInStepContext({ cwd: CALLER_CWD, envRepo: CALLER_REPO }, () => resolveRepoPath(undefined, { resolveForCwd: noMatch }));
		assert.equal(inside, CALLER_REPO);
		assert.deepEqual(asked, [CALLER_CWD]);
		assert.equal(await runInStepContext({ cwd: CALLER_CWD }, () => resolveRepoPath(undefined, { resolveForCwd: byCwd })), '/caller/registered');
		// A caller with no INSRC_REPO gets none: the process's is never used inside a call.
		assert.equal(await runInStepContext({ cwd: CALLER_CWD }, () => resolveRepoPath(undefined, { resolveForCwd: noMatch })), undefined);
		// An explicit repo still wins.
		assert.equal(await runInStepContext({ cwd: CALLER_CWD, envRepo: CALLER_REPO }, () => resolveRepoPath('/explicit', { resolveForCwd: noMatch })), '/explicit');

		// Outside: process.cwd() and the process's INSRC_REPO, as before.
		asked.length = 0;
		assert.equal(await resolveRepoPath(undefined, { resolveForCwd: noMatch }), PROCESS_REPO);
		assert.deepEqual(asked, [process.cwd()]);
	});
});

test("the code-review handler's repo fallback reads the context's INSRC_REPO inside a step call and the process's outside one", async () => {
	await withProcessEnvRepo(PROCESS_REPO, async () => {
		const subjectsFor: string[] = [];
		const deps: CodeReviewStepDeps = {
			...DEFAULT_DEPS,
			resolveSubject: async (repo) => { subjectsFor.push(repo); return { ok: false, reason: 'stop here' }; },
		};
		const start = { phase: 'start', epicHash: 'e1', storyId: 's1' };

		await runInStepContext({ cwd: CALLER_CWD, envRepo: CALLER_REPO }, () => handleCodeReviewStep(start, deps));
		assert.deepEqual(subjectsFor, [CALLER_REPO]);

		// A caller with no INSRC_REPO: no-repo, even though this process has one.
		const none = await runInStepContext({ cwd: CALLER_CWD }, () => handleCodeReviewStep(start, deps));
		const parsed = JSON.parse(none.content[0]!.text) as { next: string; error?: { code: string } };
		assert.equal(parsed.next, 'error');
		assert.equal(parsed.error?.code, 'no-repo');
		assert.deepEqual(subjectsFor, [CALLER_REPO]);

		await handleCodeReviewStep(start, deps);
		assert.deepEqual(subjectsFor, [CALLER_REPO, PROCESS_REPO]);
	});
});

test("scope directoryOf: a bare file name inside a step call resolves against the context's cwd, and outside one against process.cwd()", async () => {
	const deps: ScopeDeps = {
		listRepos:           async () => [],
		findEntitiesByFile:  async () => [],
		listEntitiesForRepo: async () => [],
		loadConnections:     async () => { throw new Error('not used'); },
	};
	const inside = await runInStepContext({ cwd: CALLER_CWD }, () => resolveScope({ kind: 'file', value: 'notes.md' }, deps));
	assert.equal(inside.lookupPath, CALLER_CWD);
	const outside = await resolveScope({ kind: 'file', value: 'notes.md' }, deps);
	assert.equal(outside.lookupPath, process.cwd());
	// A path with a directory is unaffected by the context.
	const nested = await runInStepContext({ cwd: CALLER_CWD }, () => resolveScope({ kind: 'file', value: join('docs', 'notes.md') }, deps));
	assert.equal(nested.lookupPath, 'docs');
});

test("client identity: the context holds 'claude' / 'codex'; the code-review deps receive it as is and the one-shot analyze runs in the family it implies ('cli-claude' / 'cli-codex')", async () => {
	assert.equal(familyForClient(undefined), undefined);
	for (const [client, kind] of [['claude', 'cli-claude'], ['codex', 'cli-codex']] as const) {
		assert.equal(familyForClient(client), kind);
		const ctx: StepCallContext = { cwd: CALLER_CWD, client };

		// Code review: as it is.
		const deps = await runInStepContext(ctx, async () => withStepClient(DEFAULT_DEPS));
		assert.equal(deps.client, client);

		// One-shot analyze: the run is inside runWithClientProviderContext of the converted kind.
		let seen: string | undefined = 'not called';
		const fakeBuildRun = (async () => { seen = currentClientProviderKind(); throw new Error('stop after the run starts'); }) as unknown as NonNullable<Parameters<typeof runAnalyzeOneShot>[1]>['buildRun'];
		await assert.rejects(runInStepContext(ctx, () => runAnalyzeOneShot({ repo: '/explicit', focus: 'q' }, { buildRun: fakeBuildRun })), /stop after the run starts/);
		assert.equal(seen, kind);
	}

	// Outside a step call: no client, deps unchanged, and no client provider context around the run.
	assert.equal(stepClient(), undefined);
	assert.equal(withStepClient(DEFAULT_DEPS), DEFAULT_DEPS);
	let seen: string | undefined = 'not called';
	const fakeBuildRun = (async () => { seen = currentClientProviderKind(); throw new Error('stop'); }) as unknown as NonNullable<Parameters<typeof runAnalyzeOneShot>[1]>['buildRun'];
	await assert.rejects(runAnalyzeOneShot({ repo: '/explicit', focus: 'q' }, { buildRun: fakeBuildRun }), /stop/);
	assert.equal(seen, undefined);
});

test('step context isolation: two concurrent contexts each see their own cwd and client', async () => {
	const observe = async (ctx: StepCallContext): Promise<string[]> => runInStepContext(ctx, async () => {
		const seen: string[] = [];
		for (let i = 0; i < 4; i++) {
			await tick();
			seen.push(`${stepCwd()}|${stepClient() ?? '-'}|${currentStepContext()?.envRepo ?? '-'}`);
		}
		return seen;
	});
	const a = observe({ cwd: '/a', client: 'claude', envRepo: '/repo-a' });
	const b = observe({ cwd: '/b', client: 'codex' });
	const [seenA, seenB] = [await a, await b];
	assert.deepEqual(seenA, Array(4).fill('/a|claude|/repo-a'));
	assert.deepEqual(seenB, Array(4).fill('/b|codex|-'));
	assert.equal(currentStepContext(), undefined, 'no context leaks out of either call');
});
