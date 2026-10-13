/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The per-call context of a step tool run in the daemon (Epic c2ba6fa6,
 * Story s11). The step handlers used to read the MCP process's working
 * directory, its INSRC_REPO and the calling client; in the daemon those are
 * the caller's, carried here in an AsyncLocalStorage around each handler run.
 *
 * Inside a context its values are used and the process's are not. Outside one
 * (a daemon-internal caller, or the MCP server calling a handler in-process)
 * the readers keep the process defaults.
 *
 * In src/shared because src/analyze/context/scope.ts reads it too.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** The calling client in its one form. The one-shot analyze converts it to
 *  'cli-claude' | 'cli-codex' for runWithClientProviderContext. */
export type StepClient = 'claude' | 'codex';

export interface StepCallContext {
	readonly cwd:      string;
	readonly envRepo?: string | undefined;
	readonly client?:  StepClient | undefined;
}

const storage = new AsyncLocalStorage<StepCallContext>();

/** Run `fn` with `ctx` as the step context of everything it awaits. */
export function runInStepContext<T>(ctx: StepCallContext, fn: () => Promise<T>): Promise<T> {
	return storage.run(ctx, fn);
}

/** The step context of the current call, or undefined outside a step call. */
export function currentStepContext(): StepCallContext | undefined {
	return storage.getStore();
}

/** The caller's working directory inside a step call, process.cwd() outside one. */
export function stepCwd(): string {
	return storage.getStore()?.cwd ?? process.cwd();
}

/** The caller's INSRC_REPO inside a step call (undefined when the caller had
 *  none: the daemon's own is never used for it), the process's outside one. */
export function stepEnvRepo(): string | undefined {
	const ctx = storage.getStore();
	const env = ctx !== undefined ? ctx.envRepo : process.env['INSRC_REPO'];
	return env !== undefined && env.length > 0 ? env : undefined;
}

/** The calling client inside a step call; undefined outside one. */
export function stepClient(): StepClient | undefined {
	return storage.getStore()?.client;
}

/** The shaper provider kind a client implies, for runWithClientProviderContext. */
export function clientProviderKind(client: StepClient | undefined): 'cli-claude' | 'cli-codex' | undefined {
	return client === 'claude' ? 'cli-claude' : client === 'codex' ? 'cli-codex' : undefined;
}

/** The client a shaper provider kind names: the inverse of clientProviderKind. */
export function stepClientOf(kind: string | undefined): StepClient | undefined {
	return kind === 'cli-claude' ? 'claude' : kind === 'cli-codex' ? 'codex' : undefined;
}

/** The tools the daemon's `step.call` request runs (the MCP server forwards them). */
export const STEP_TOOL_NAMES = [
	'insrc_analyze',
	'insrc_analyze_step',
	'insrc_workflow_step',
	'insrc_build_step',
	'insrc_review_step',
	'insrc_code_review_step',
	'insrc_triage',
] as const;
export type StepToolName = typeof STEP_TOOL_NAMES[number];
