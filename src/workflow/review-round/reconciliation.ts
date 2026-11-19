/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The reconciliation pass (HLD sc3, owned by this Story). reconcileRound
 * compares a prior round's HIGH/MED findings against round N's own
 * independent findings and classifies each -- purely informational, never
 * consulted by the approval gate. How the classification call is prompted,
 * and how the review's temp-folder audit trail is read when needed, stay
 * internal to this module (HLD boundary).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createRoleRouter } from '../../analyze/context/role-router.js';
import { loadAnalyzeConfig } from '../../config/analyze.js';
import type { RoleId } from '../../config/role-taxonomy.js';
import type { LLMMessage, StructuredSchema } from '../../shared/types.js';
import type { Finding } from './finding.js';

export type ReconciliationVerdict = 'confirmed' | 'still-open' | 'contradicted' | 'no-longer-surfaced';

/** One prior finding's classification against round N's own findings.
 *  priorFindingRef is that prior finding's own id (sc2) -- this Story never
 *  invents or requires a caller-assigned key. */
export interface ReconciliationResult {
	readonly priorFindingRef: string;
	readonly verdict:         ReconciliationVerdict;
}

const CLASSIFY_ROLE: RoleId = 'review.reconciliation.classify';

const VERDICTS: readonly ReconciliationVerdict[] = ['confirmed', 'still-open', 'contradicted', 'no-longer-surfaced'];

const CLASSIFY_SCHEMA: StructuredSchema = {
	type: 'object',
	properties: {
		verdicts: {
			type:  'array',
			items: { type: 'string', enum: VERDICTS },
		},
	},
	required:             ['verdicts'],
	additionalProperties: false,
};

/** The classification call's own dependencies, injectable for tests (matching
 *  src/workflow/team/signoff.ts's _setSignoffDepsForTests convention). `classify`
 *  returns exactly one verdict per entry in priorFindings, in the same order --
 *  reconcileRound itself pairs each verdict with its finding's own id, so
 *  priorFindingRef is never derived from (and never trusts) the model's own echo. */
export interface ReconciliationDeps {
	readonly classify?:       ((reviewId: string, priorFindings: readonly Finding[], currentFindings: readonly Finding[], auditTrail: string | undefined) => Promise<readonly ReconciliationVerdict[]>) | undefined;
	readonly readAuditTrail?: ((reviewId: string) => string | undefined) | undefined;
}

let testDeps: ReconciliationDeps = {};

/** Test seam: inject the classification call and the audit-trail reader; no argument resets. */
export function _setReconciliationDepsForTests(deps: ReconciliationDeps = {}): void { testDeps = deps; }

/** The review's temp-folder audit trail, if one has been written; undefined
 *  when the file is absent -- a missing or unneeded audit trail is not an error. */
function defaultReadAuditTrail(reviewId: string): string | undefined {
	const path = join(process.cwd(), '.insrc/tmp', reviewId, 'audit-trail.json');
	if (!existsSync(path)) return undefined;
	return readFileSync(path, 'utf8');
}

async function defaultClassify(
	reviewId: string,
	priorFindings: readonly Finding[],
	currentFindings: readonly Finding[],
	auditTrail: string | undefined,
): Promise<readonly ReconciliationVerdict[]> {
	const cfg = loadAnalyzeConfig();
	const { provider } = createRoleRouter().resolveProviderForRole(CLASSIFY_ROLE, cfg, process.cwd());
	const messages: LLMMessage[] = [
		{
			role:    'system',
			content: 'You classify each prior finding\'s disposition against the current round\'s findings. '
				+ `For each entry in priorFindings (in order), answer exactly one of: ${VERDICTS.join(', ')}. `
				+ 'confirmed: an equivalent finding still appears in currentFindings. still-open: the issue is unresolved '
				+ 'but not independently re-raised. contradicted: currentFindings or the audit trail shows the prior finding '
				+ 'was mistaken. no-longer-surfaced: the issue no longer appears and nothing indicates why. '
				+ 'This classification is informational only; it never blocks approval.',
		},
		{
			role:    'user',
			content: JSON.stringify({ reviewId, priorFindings, currentFindings, auditTrail }),
		},
	];
	const raw = await provider.completeStructured<{ verdicts: readonly ReconciliationVerdict[] }>(messages, CLASSIFY_SCHEMA);
	return raw.verdicts;
}

/**
 * Runs the dedicated reconciliation pass for one round. Never performs its own
 * re-grounding pass, and never folds into the same pass that produced
 * currentFindings -- a single dedicated call per round.
 */
export async function reconcileRound(
	reviewId: string,
	priorFindings: readonly Finding[],
	currentFindings: readonly Finding[],
): Promise<readonly ReconciliationResult[]> {
	if (priorFindings.length === 0) return [];
	const readAuditTrail = testDeps.readAuditTrail ?? defaultReadAuditTrail;
	const classify = testDeps.classify ?? defaultClassify;

	const auditTrail = readAuditTrail(reviewId);
	const verdicts = await classify(reviewId, priorFindings, currentFindings, auditTrail);
	if (verdicts.length !== priorFindings.length) {
		throw new Error(`reconcileRound: classification returned ${verdicts.length} verdicts for ${priorFindings.length} prior findings`);
	}
	return priorFindings.map((finding, i) => ({ priorFindingRef: finding.id, verdict: verdicts[i] as ReconciliationVerdict }));
}
