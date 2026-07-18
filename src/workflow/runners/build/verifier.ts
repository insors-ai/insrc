/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon VERIFIER (Story s3, t5) — the sole authority that advances a
 * Task. Given a `PlanTask` + `repoRoot` it:
 *
 *   1. extracts the stated test command VERBATIM from the PlanTask (the
 *      approved artifact is the authorization boundary for what runs),
 *   2. executes it as a child process (capturing exit code + output), and
 *   3. computes the working-tree diff (`git status --porcelain`) to see
 *      which files the Task touched,
 *
 * returning a `BuildTestVerdict` + `filesTouched` computed WITHOUT any
 * reference to the advisory `TaskImplementerReport`. This is the daemon-
 * side half of the k2 load-bearing invariant: `filesTouched`/`testVerdict`
 * are daemon-produced, never self-reported.
 *
 * The seam (`TaskVerifier`) is INJECTED into the sequencer so the sequencer
 * is testable without a live git/test run — t8/t9 supply a fake verifier
 * that returns canned verdicts.
 *
 * DIVERGENCE (noted): the workflow `PlanTask.tests` carries human-readable
 * `{ level, name }` test SUBJECTS, not runnable shell commands. The default
 * command resolver therefore treats the first stated test `name` as the
 * command verbatim — enough for a deterministic, testable seam — and the
 * resolver is INJECTABLE precisely so a production deployment can map the
 * stated subjects onto the repo's real `npx tsx --test '<glob>'` sweep
 * without this module hard-coding that policy. An empty/absent test set
 * resolves to an empty command, which yields a NON-passing verdict (never a
 * fabricated `passed`).
 */

import { spawnSync } from 'node:child_process';

import { getLogger } from '../../../shared/logger.js';
import type { PlanTask } from '../../artifacts/plan.js';
import type { BuildTestVerdict } from './schemas.js';

const log = getLogger('workflow:build');

/** What the daemon's own test run + diff produced for one Task. */
export interface DaemonVerification {
	readonly verdict:      BuildTestVerdict;
	readonly filesTouched: readonly string[];
}

/** The injectable daemon-verifier seam. `resolveTestCommand` is exposed
 *  separately so the sequencer can detect a no-command Task BEFORE invoking
 *  the implementer (nothing to authoritatively satisfy). */
export interface TaskVerifier {
	/** The test command this Task authorizes, extracted verbatim; `''` when
	 *  the PlanTask states none. */
	resolveTestCommand(task: PlanTask): string;
	/** Run the resolved command + compute the working-tree diff. */
	verify(task: PlanTask, repoRoot: string): Promise<DaemonVerification>;
}

/** Default command resolver — the first stated test `name` verbatim, or `''`
 *  when the Task states no test. See the DIVERGENCE note above. */
export function defaultResolveTestCommand(task: PlanTask): string {
	const first = task.tests[0];
	if (first === undefined) return '';
	return first.name.trim();
}

export interface GitTestVerifierOpts {
	/** Override the command-resolution policy (see the DIVERGENCE note). */
	readonly resolveTestCommand?: ((task: PlanTask) => string) | undefined;
	/** Per-Task test-run wall-clock cap. Default 10 min. */
	readonly timeoutMs?: number | undefined;
}

/** Construct the concrete daemon verifier: real child-process test run +
 *  real `git` working-tree diff, both rooted at `repoRoot`. */
export function createGitTestVerifier(opts?: GitTestVerifierOpts): TaskVerifier {
	const resolve = opts?.resolveTestCommand ?? defaultResolveTestCommand;
	const timeoutMs = opts?.timeoutMs ?? 600_000;
	return {
		resolveTestCommand: resolve,
		async verify(task: PlanTask, repoRoot: string): Promise<DaemonVerification> {
			const command = resolve(task).trim();
			const filesTouched = gitFilesTouched(repoRoot);
			if (command === '') {
				// No stated command → cannot authoritatively verify. NEVER fabricate a pass.
				return {
					verdict: {
						command:  '',
						passed:   false,
						exitCode: -1,
						summary:  `Task '${task.id}' states no runnable test command; cannot verify — refusing to advance.`,
					},
					filesTouched,
				};
			}
			const run = spawnSync('/bin/sh', ['-c', command], {
				cwd:      repoRoot,
				encoding: 'utf8',
				timeout:  timeoutMs,
				maxBuffer: 32 * 1024 * 1024,
			});
			const exitCode = run.status ?? (run.signal !== null ? -9 : -1);
			const passed = exitCode === 0;
			const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
			log.debug({ taskId: task.id, command, exitCode, passed }, 'verifier: test run complete');
			return {
				verdict: {
					command,
					passed,
					exitCode,
					summary: summarise(output, exitCode, passed),
				},
				filesTouched,
			};
		},
	};
}

/** Files the working tree carries relative to HEAD — staged, unstaged, and
 *  untracked. `git status --porcelain=v1` lists all three; parse the path
 *  from each entry (handling renames `old -> new`). Non-git repos / git
 *  failures yield `[]` (nothing observably touched). */
export function gitFilesTouched(repoRoot: string): readonly string[] {
	const res = spawnSync('git', ['-C', repoRoot, 'status', '--porcelain=v1', '--no-renames'], {
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	});
	if (res.status !== 0 || typeof res.stdout !== 'string') return [];
	const files: string[] = [];
	for (const line of res.stdout.split('\n')) {
		if (line.length < 4) continue;
		// Porcelain v1: XY<space>PATH. Strip the 2 status chars + the separator.
		const path = line.slice(3).trim();
		if (path.length > 0) files.push(path);
	}
	return files;
}

/** A compact, human-readable one-liner for the verdict summary. */
function summarise(output: string, exitCode: number, passed: boolean): string {
	const tail = output.trim().split('\n').slice(-4).join(' ').slice(0, 400);
	return passed
		? `tests passed (exit 0)${tail.length > 0 ? ` — ${tail}` : ''}`
		: `tests FAILED (exit ${exitCode})${tail.length > 0 ? ` — ${tail}` : ''}`;
}
