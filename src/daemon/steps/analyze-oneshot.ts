/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The one-shot analyze tool's body (`insrc_analyze`), moved out of the MCP
 * server into the daemon's step tree (Epic c2ba6fa6, Story s11). A caller may
 * wrap the run in its own provider context; with no wrap given, the run is
 * wrapped in the step context's client, converted to 'cli-claude' |
 * 'cli-codex' for runWithClientProviderContext.
 */

import { buildRun } from '../analyze-rpc.js';
import { resolveRepoPath } from './resolve-repo.js';
import { getLogger } from '../../shared/logger.js';
import { clientProviderKind, stepClient } from '../../shared/step-context.js';
import { runWithClientProviderContext } from '../../analyze/context/shaper-provider.js';
import type { AnalyzeShaperProviderKind } from '../../config/analyze.js';
import { renderAnalyzeFailure, renderBundleAsMarkdown } from './bundle-md.js';

const log = getLogger('daemon:step-analyze-oneshot');

/** The kinds of source and the size hints the tool accepts: one list each, the types derive from them. */
const TARGETS = ['code', 'docs', 'data', 'infra', 'generic'] as const;
const SIZES   = ['XS', 'S', 'M', 'L', 'XL'] as const;
type OneShotTarget = typeof TARGETS[number];
type OneShotSize   = typeof SIZES[number];

/**
 * The run-level request the one-shot tool sends for a call.
 *
 * The intent carries no size: the context builder measures the request. A
 * size the caller stated is passed on as `sizeHint`, never as the size, and
 * with none stated no size is sent at all.
 */
export function oneShotRunParams(
	args:     { readonly focus: string; readonly target?: OneShotTarget | undefined; readonly scope?: OneShotSize | undefined },
	repoPath: string,
	runId:    string,
) {
	const intent = {
		target:    args.target ?? 'code',
		focused:   true,
		focus:     args.focus,
		scopeRef:  { kind: 'workspace', value: repoPath },
		reasoning: `MCP invocation: ${args.focus}`,
	};
	return { runId, intent, ...(args.scope !== undefined ? { sizeHint: args.scope } : {}) };
}

export interface AnalyzeOneShotArgs {
	readonly repo?:   string | undefined;
	readonly focus:   string;
	readonly target?: OneShotTarget | undefined;
	readonly scope?:  OneShotSize | undefined;
}

export interface AnalyzeOneShotDeps {
	/** For the log line only. */
	readonly clientName?: string | undefined;
	readonly clientDefault?: AnalyzeShaperProviderKind | undefined;
	/** Runs the build under the caller's provider context. Defaults to the
	 *  client provider context of `clientDefault`, or of the step context's client. */
	readonly wrap?: (<T>(fn: () => Promise<T>) => Promise<T>) | undefined;
	/** Test seam: the run request. Defaults to the daemon's buildRun. */
	readonly buildRun?: typeof buildRun | undefined;
}


/** The tool's arguments, checked: a message naming the first bad field, or the args.
 *  The MCP registration validates them too, but step.call takes them raw. */
export function checkOneShotArgs(raw: unknown): AnalyzeOneShotArgs | string {
	if (typeof raw !== 'object' || raw === null) return 'insrc_analyze: the arguments must be an object';
	const a = raw as Record<string, unknown>;
	if (typeof a['focus'] !== 'string' || a['focus'].trim().length === 0) return 'insrc_analyze: `focus` (a non-empty string) is required';
	if (a['repo'] !== undefined && typeof a['repo'] !== 'string') return 'insrc_analyze: `repo` must be a string';
	if (a['target'] !== undefined && !(TARGETS as readonly unknown[]).includes(a['target'])) return `insrc_analyze: \`target\` must be one of ${TARGETS.join(', ')}`;
	if (a['scope'] !== undefined && !(SIZES as readonly unknown[]).includes(a['scope'])) return `insrc_analyze: \`scope\` must be one of ${SIZES.join(', ')}`;
	return a as unknown as AnalyzeOneShotArgs;
}

export async function runAnalyzeOneShot(
	rawArgs: unknown,
	deps: AnalyzeOneShotDeps = {},
): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean | undefined }> {
	const args = checkOneShotArgs(rawArgs);
	if (typeof args === 'string') return errorResult(args);
	// Resolve the repo path: explicit param > CWD-contained registered repo >
	// INSRC_REPO env > fail (session-aware; see resolve-repo.ts).
	const repoPath = await resolveRepoPath(args.repo);
	if (repoPath === undefined) {
		return errorResult(
			'no repo -- pass the `repo` param or set INSRC_REPO in the ' +
			'MCP server\'s environment. The insrc daemon must have this repo ' +
			'registered (see `insrc repo add`).',
		);
	}

	// Assemble the intent. This mirrors the shape the daemon's
	// `analyze.context.buildRun` RPC accepts (see daemon/analyze-rpc.ts).
	const clientDefault = deps.clientDefault ?? clientProviderKind(stepClient());
	const runId  = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const rpcParams = oneShotRunParams(args, repoPath, runId);
	const intent = rpcParams.intent;

	log.info(
		{
			runId,
			repoPath,
			target: intent.target,
			sizeHint: args.scope ?? '(none)',
			focus:  intent.focus.slice(0, 80),
			client: deps.clientName ?? '(unknown)',
			clientDefault: clientDefault ?? '(none)',
		},
		'insrc_analyze: dispatching',
	);

	const wrap = deps.wrap ?? (<T>(fn: () => Promise<T>): Promise<T> => clientDefault !== undefined
		? runWithClientProviderContext(clientDefault, fn)
		: fn());
	const run = deps.buildRun ?? buildRun;
	const result = await wrap(() => run(rpcParams));
	if (!result.ok) {
		// A failure after the lookups ran carries their report: the completeness
		// line and the failed step's reason are printed with the code and message.
		return errorResult(renderAnalyzeFailure(result.error));
	}

	const markdown = renderBundleAsMarkdown(result.bundle);
	return {
		content: [{ type: 'text', text: markdown }],
	};
}

function errorResult(message: string): { content: { type: 'text'; text: string }[]; isError: true } {
	return { content: [{ type: 'text', text: message }], isError: true };
}
