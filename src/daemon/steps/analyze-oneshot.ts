import { assertNoSessionPersistence } from '../../shared/connection-persistence.js';
import { assertAnalysisAudience, analysisAdmissionEnvelope } from './analysis-admission.js';
import type { ConnectionExecutionContext } from '../../shared/step-context.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The one-shot analyze tool's body (`insrc_analyze`), moved out of the MCP
 * server into the daemon's step tree (Epic c2ba6fa6, Story s11). A caller may
 * wrap the run in its own provider context; with no wrap given, the run is
 * wrapped in the family the step context's client implies (familyForClient)
 * for runWithClientProviderContext.
 */

import { buildRun } from '../analyze-rpc.js';
import { resolveRepoPath } from './resolve-repo.js';
import { getLogger } from '../../shared/logger.js';
import { buildIntentFromRequest } from '../../analyze/context/request.js';
import type { AnalyzeRequest } from '../../shared/analyze-types.js';
import { stepClient } from '../../shared/step-context.js';
import { familyForClient } from '../model-registry.js';
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
	args:     { readonly request?: AnalyzeRequest | undefined; readonly focus?: string | undefined; readonly target?: OneShotTarget | undefined; readonly scope?: OneShotSize | undefined },
	repoPath: string,
	runId:    string,
) {
	// One builder for both tools; it also returns the call's repository for the run's scope check.
	const { intent, sizeHint } = buildIntentFromRequest(args, repoPath);
	return { runId, intent, expectedRepo: repoPath, ...(sizeHint !== undefined ? { sizeHint } : {}) };
}

export interface AnalyzeOneShotArgs {
	readonly repo?:   string | undefined;
	/** The structured request; sent instead of `focus`. */
	readonly request?: AnalyzeRequest | undefined;
	/** The prompt, for a prompt-only call. One of `request` and `focus` is required. */
	readonly focus?:  string | undefined;
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
	if (a['focus'] !== undefined && typeof a['focus'] !== 'string') return 'insrc_analyze: `focus` must be a string';
	if (a['request'] !== undefined && (typeof a['request'] !== 'object' || a['request'] === null || Array.isArray(a['request']))) return 'insrc_analyze: `request` must be an object';
	// The shared builder checks the request's fields and the pairing of request and focus.
	try { buildIntentFromRequest({ request: a['request'] as AnalyzeRequest | undefined, focus: a['focus'] as string | undefined }, '/'); } catch (err) { return `insrc_analyze: ${(err as Error).message}`; }
	if (a['repo'] !== undefined && typeof a['repo'] !== 'string') return 'insrc_analyze: `repo` must be a string';
	if (a['target'] !== undefined && !(TARGETS as readonly unknown[]).includes(a['target'])) return `insrc_analyze: \`target\` must be one of ${TARGETS.join(', ')}`;
	if (a['scope'] !== undefined && !(SIZES as readonly unknown[]).includes(a['scope'])) return `insrc_analyze: \`scope\` must be one of ${SIZES.join(', ')}`;
	return a as unknown as AnalyzeOneShotArgs;
}

export async function runAnalyzeOneShot(
	rawArgs: unknown,
	deps: AnalyzeOneShotDeps = {},
	execution?: ConnectionExecutionContext,
): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean | undefined }> {
	try { assertAnalysisAudience(execution); assertNoSessionPersistence(execution); } catch (error) { return analysisAdmissionEnvelope(error); }
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
	const clientDefault = deps.clientDefault ?? familyForClient(stepClient());
	const runId  = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const rpcParams = oneShotRunParams(args, repoPath, runId);
	const intent = rpcParams.intent;

	log.info(
		{
			runId,
			repoPath,
			target: intent.target,
			sizeHint: rpcParams.sizeHint ?? '(none)',
			focus:  (intent.focus ?? '').slice(0, 80),
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
