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
import { getLogger } from '../../shared/logger.js';
import { securityFindingSchemaFor, parseSecurityFindingReply } from '../review-round/security-schema.js';
import type { SecurityFinding } from '../review-round/security-finding.js';
import type { RoundDriverHooks } from '../review-round/types.js';
import type { ReviewTargets } from '../artifact-core/types.js';
import { currentStepContext } from '../../shared/step-context.js';
import type { SecurityModelSelection } from '../../config/analyze.js';
import type { StructuredSchema } from '../../shared/types.js';

const log = getLogger('workflow:security-round-hooks');

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
 * CliProvider.runReadOnlySession, using s1's pinned model, requesting
 * capabilityPolicy:'strict-read-analyze'. A security code pass starts only
 * when the selected provider can enforce that policy (claudeReadOnlySessionArgs'
 * real --tools/--allowedTools allowlist, or Ollama's equivalent tool-loop
 * allowlist) -- an unqualified provider (e.g. codex, which sets no native-tool
 * restriction) is rejected before inference with UnqualifiedCapabilityPolicyError,
 * propagated unchanged, never silently downgraded or swapped to another provider.
 */
export async function runSecurityCodePass(repoPath: string, targets: ReviewTargets, modelSelection: SecurityModelSelection & { readonly status: 'configured' }, round: number, reviewId?: string): Promise<readonly SecurityFinding[]> {
	const registry = getModelRegistry();
	const kind = registry.cliKind(modelSelection.provider);
	if (kind === undefined) { throw new Error(`runSecurityCodePass: '${modelSelection.provider}' is not a CLI-backed family`); }
	const model = registry.find(modelSelection.provider, modelSelection.modelId);
	// s1 already resolved and probed this exact model; silently falling through to
	// familyProvider's own CLI-default-model behavior here would dispatch a DIFFERENT
	// model than the one s1 pinned and the caller was told is in use -- refuse instead.
	if (model === undefined) { throw new Error(`runSecurityCodePass: '${modelSelection.modelId}' is no longer a listed model of ${modelSelection.provider}`); }
	const connectionExecution = currentStepContext()?.connectionExecution;
	const provider = familyProvider(registry, modelSelection.provider, model, { effort: modelSelection.effort }, connectionExecution) as CliProvider;

	log.info({ repoPath, round, reviewId, modelId: modelSelection.modelId, provider: modelSelection.provider }, 'runSecurityCodePass: dispatching the code-vulnerability pass');
	const reply = await provider.runReadOnlySession<SecurityCodePassReply>(
		codePassPrompt(targets),
		replySchemaFor(kind),
		{ cwd: repoPath, deadlineMs: 10 * 60_000, capabilityPolicy: 'strict-read-analyze', ...(connectionExecution !== undefined ? { connectionExecution } : {}) },
	);
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
 * security delegates to runSecurityCodePass bound to the factory's own
 * closed-over repoPath/targets/modelSelection/reviewId, ignoring the
 * targets/round runReviewRound itself would otherwise pass for targets (it
 * always matches what this review was started with) while still forwarding
 * its own round.
 */
export function buildSecurityRoundHooks(repoPath: string, targets: ReviewTargets, modelSelection: SecurityModelSelection & { readonly status: 'configured' }, reviewId: string): RoundDriverHooks<SecurityFinding> {
	return {
		reviewKind: 'code',
		checkpointGranularity: 'round',
		ground: async () => [],
		security: (_targets, round) => {
			log.info({ reviewId, round }, 'buildSecurityRoundHooks: security hook invoked');
			return dispatchCodePass(repoPath, targets, modelSelection, round, reviewId);
		},
	};
}
