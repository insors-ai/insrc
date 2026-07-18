/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `TaskImplementerAdapter` over ONE serial CliProvider subprocess (sc5, t4).
 *
 * THE k8/k9 UNPROVEN FINDING (resolved). The design carried an explicit open
 * question: can CliProvider's one-shot `complete()`/`completeStructured()`
 * (`--print` text/JSON turns) supervise a long free-form file-editing
 * session? Direct read of `src/agent/providers/cli-provider.ts` answered NO:
 * those paths spawn the CLI WITHOUT file-edit permission and only return a
 * text/JSON payload — they cannot edit files. Provider-level work was
 * therefore required and IS done in this Story: a new
 * `CliProvider.runEditSession()` capability spawns the local `claude`/`codex`
 * binary with the repo as cwd + edit permissions (`--permission-mode
 * acceptEdits` / `--full-auto`). It stays strictly within CLAUDE.md's
 * sanctioned cloud path — the CLI binary is spawned exactly like every other
 * call (`runSubprocess`), OAuth/quota stay with the CLI session, and NO
 * direct REST client is introduced.
 *
 * `implement()` runs EXACTLY ONE such subprocess per call, serial by
 * construction. Its returned `TaskImplementerReport` is ADVISORY ONLY — the
 * sequencer never advances on it; the daemon's own test run + tree diff (the
 * verifier) is the sole authority. A subprocess spawn / mid-session error or
 * a structured-output failure surfaces as a rejected Promise so the
 * sequencer can record an implementer failure (which still lands the Task at
 * `'failed'` via a non-passing daemon verdict, never `'completed'`).
 */

import { getLogger } from '../../../shared/logger.js';
import type { LLMResponse } from '../../../shared/types.js';
import type {
	TaskImplementerAdapter,
	TaskImplementerReport,
	TaskImplementerRequest,
} from './schemas.js';

const log = getLogger('workflow:build');

/** The minimal provider port the adapter needs: one agentic editing turn
 *  inside `cwd`. `CliProvider` implements it via `runEditSession`. Kept
 *  structural (not a hard `CliProvider` dependency) so tests can inject a
 *  fake that counts in-flight calls without spawning anything. */
export interface EditSessionRunner {
	runEditSession(prompt: string, opts: { readonly cwd: string; readonly timeoutMs?: number | undefined }): Promise<LLMResponse>;
}

export interface CliTaskImplementerAdapterOpts {
	/** Per-Task editing-session wall-clock cap; falls through to the provider default. */
	readonly timeoutMs?: number | undefined;
}

/** The concrete sc5 adapter over one serial CLI editing subprocess. */
export class CliTaskImplementerAdapter implements TaskImplementerAdapter {
	constructor(
		private readonly provider: EditSessionRunner,
		private readonly opts?: CliTaskImplementerAdapterOpts,
	) {}

	async implement(req: TaskImplementerRequest): Promise<TaskImplementerReport> {
		const prompt = buildEditPrompt(req);
		log.info({ taskId: req.task.id, repoRoot: req.repoRoot }, 'implementer: starting one CLI editing subprocess');
		// EXACTLY ONE subprocess. A rejection propagates to the sequencer,
		// which treats it as an implementer failure (never a Task pass).
		const res = await this.provider.runEditSession(prompt, {
			cwd: req.repoRoot,
			...(this.opts?.timeoutMs !== undefined ? { timeoutMs: this.opts.timeoutMs } : {}),
		});
		return parseReport(res);
	}
}

/** Reshape the free-form session text into the two-field advisory report.
 *  Deliberately lenient: this value is NEVER trusted to advance a Task, so
 *  it only needs to be a faithful record of what the session said. */
function parseReport(res: LLMResponse): TaskImplementerReport {
	const narrative = (res.text ?? '').trim();
	// The session ran to completion iff it produced a non-empty summary.
	// `claimedComplete` is advisory: the daemon verdict decides the truth.
	return { claimedComplete: narrative.length > 0, narrative };
}

/** Build the editing-session prompt. Per CLAUDE.md rule 7 (structural
 *  reference trailing), the Task/plan/design REFERENCE material goes at the
 *  tail; the instruction leads. */
function buildEditPrompt(req: TaskImplementerRequest): string {
	const { task } = req;
	const depLines = req.completedDependencies.map(d => `  - ${d.taskId} (${d.status})`).join('\n');
	return [
		'You are the implementer for ONE Task of an approved Story build plan.',
		'Edit the files under the working directory to implement EXACTLY this Task —',
		'no more, no less. The daemon will run the Task\'s stated tests itself and',
		'inspect the working-tree diff; your own claims are advisory and are NOT',
		'trusted to advance the Task, so make the tests actually pass.',
		'',
		`You have up to ${req.maxAttempts} attempt(s); this is one of them. If a prior`,
		'attempt left partial edits in the tree, continue from there.',
		'',
		'When done, print a short plain-text summary of what you changed and whether',
		'you believe the Task is complete.',
		'',
		'--- Task ---',
		`id: ${task.id}`,
		`title: ${task.title}`,
		'',
		'summary:',
		task.summary,
		'',
		'acceptance checks:',
		...task.acceptanceChecks.map(a => `  - ${a}`),
		'',
		'stated tests (the daemon runs these — do not fake them):',
		...task.tests.map(t => `  - [${t.level}] ${t.name}`),
		'',
		depLines.length > 0 ? `completed dependencies (context only):\n${depLines}` : 'completed dependencies: (none)',
		'',
		'--- Story design (LLD) ---',
		req.storyDesignMarkdown,
		'',
		'--- Story plan ---',
		req.planMarkdown,
	].join('\n');
}
