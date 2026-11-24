/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * buildSecurityRoundHooks / runSecurityCodePass (s3/t2), Epic add-dedicated-security-reviews.
 *
 * The RoundDriverHooks<SecurityFinding> adapter the Story's orchestrator
 * (runSecurityReview) passes into the shared runReviewRound -- chosen
 * alternative a1: hooks.security is the real CliProvider adapter, hooks.ground
 * is a documented no-op (this review kind has no general code-quality pass).
 */

import { familyProvider } from '../../analyze/context/shaper-provider.js';
import type { CliProvider } from '../../agent/providers/cli-provider.js';
import { READ_ONLY_SESSION_READ_TOOLS, READ_ONLY_SESSION_ANALYZE_TOOLS } from '../../agent/providers/cli-provider.js';
import { getModelRegistry } from '../../daemon/model-registry.js';
import { securityFindingSchemaFor, parseSecurityFindingReply } from '../review-round/security-schema.js';
import type { SecurityFinding } from '../review-round/security-finding.js';
import type { RoundDriverHooks } from '../review-round/types.js';
import type { ReviewTargets } from '../artifact-core/types.js';
import { currentStepContext } from '../../shared/step-context.js';
import type { SecurityModelSelection } from '../../config/analyze.js';
import type { StructuredSchema } from '../../shared/types.js';

interface SecurityCodePassReply {
	readonly findings: readonly unknown[];
}

function replySchemaFor(kind: Parameters<typeof securityFindingSchemaFor>[0]): StructuredSchema {
	return {
		type: 'object', additionalProperties: false, required: ['findings'],
		properties: { findings: { type: 'array', items: securityFindingSchemaFor(kind) } },
	};
}

function codePassPrompt(targets: ReviewTargets): string {
	const paths = targets.entries.map(e => `- ${e.path}`).join('\n');
	return [
		'Review the following files for security vulnerabilities (injection, authentication/authorization gaps,',
		'cryptographic misuse, insecure deserialization, path traversal, SSRF, secrets in code, and similar).',
		'Only read files under this scope; do not assume anything about files outside it.',
		'',
		'Files in scope:',
		paths,
		'',
		`Use ${[...READ_ONLY_SESSION_READ_TOOLS, ...READ_ONLY_SESSION_ANALYZE_TOOLS].join(', ')} to investigate before reporting.`,
		'Return every confirmed finding as a SecurityFinding: checkId names the specific issue; evidence is an array',
		"(possibly empty) of { providerCategory: 'sast', locator?: { kind: 'file', value: '<path>:<line>' } } citing where",
		'the issue was read; enforcementMode reflects how confidently this should block; confidence and fixability are',
		'free text. Report zero findings, never a fabricated one, when nothing confirmed turns up.',
	].join('\n');
}

/**
 * Dispatches round `round`'s code-vulnerability pass through
 * CliProvider.runReadOnlySession, using s1's pinned model. The CLI's own
 * tool restriction (READ_ONLY_SESSION_READ_TOOLS + READ_ONLY_SESSION_ANALYZE_TOOLS)
 * applies to every runReadOnlySession call unconditionally -- never configured here.
 */
export async function runSecurityCodePass(repoPath: string, targets: ReviewTargets, modelSelection: SecurityModelSelection & { readonly status: 'configured' }, round: number): Promise<readonly SecurityFinding[]> {
	const registry = getModelRegistry();
	const kind = registry.cliKind(modelSelection.provider);
	if (kind === undefined) { throw new Error(`runSecurityCodePass: '${modelSelection.provider}' is not a CLI-backed family`); }
	const model = registry.find(modelSelection.provider, modelSelection.modelId);
	const connectionExecution = currentStepContext()?.connectionExecution;
	const provider = familyProvider(registry, modelSelection.provider, model, { effort: modelSelection.effort }, connectionExecution) as CliProvider;

	const reply = await provider.runReadOnlySession<SecurityCodePassReply>(
		codePassPrompt(targets),
		replySchemaFor(kind),
		{ cwd: repoPath, deadlineMs: 10 * 60_000, ...(connectionExecution !== undefined ? { connectionExecution } : {}) },
	);
	void round;
	return reply.findings.map(raw => parseSecurityFindingReply(kind, raw));
}

/** The code-pass dispatch buildSecurityRoundHooks' security hook calls through,
 *  overridable for unit tests (so delegation can be verified without a real
 *  CLI session). No argument resets to the real runSecurityCodePass. */
let dispatchCodePass: typeof runSecurityCodePass = runSecurityCodePass;
export function _setRunSecurityCodePassForTests(fn?: typeof runSecurityCodePass): void {
	dispatchCodePass = fn ?? runSecurityCodePass;
}

/**
 * The hooks object runSecurityReview passes into runReviewRound -- ground is
 * a true no-op (a security-only review has no general code-quality pass);
 * security delegates to runSecurityCodePass with the factory's own closed-over
 * args, ignoring the targets/round runReviewRound itself would otherwise pass
 * (it always matches what this review was started with).
 */
export function buildSecurityRoundHooks(repoPath: string, targets: ReviewTargets, modelSelection: SecurityModelSelection & { readonly status: 'configured' }, reviewId: string): RoundDriverHooks<SecurityFinding> {
	void reviewId;
	return {
		reviewKind: 'code',
		checkpointGranularity: 'round',
		ground: async () => [],
		security: (_targets, round) => dispatchCodePass(repoPath, targets, modelSelection, round),
	};
}
