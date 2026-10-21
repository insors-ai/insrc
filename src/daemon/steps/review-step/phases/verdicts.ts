/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_review_step` phase='verdicts' handler — the final, deterministic pass.
 *
 * The controller has judged every premise. The server re-keys each verdict to
 * its claim (via `normalizeFinding`), assembles a `ReviewReport` using the
 * engine's own verdict policy (default blockOn HIGH+MED), then persists EXACTLY
 * like `reviewArtifactFile`: apply the `auto` fixes to the md + body, stamp
 * `meta.review` into the json, append the rendered report to the md.
 *
 * The stamped `meta.review.model` is `'client'` — the CONTROLLER (the MCP
 * client model) authored this review, off the provider that wrote the
 * artifact. That independence is the whole point of this tool.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { getLogger } from '../../../../shared/logger.js';
import type { LifecycleService } from '../../../../workflow/artifact-core/lifecycle-service.js';
import { LifecycleConflictError } from '../../../../workflow/artifact-core/types.js';
import type { Actor } from '../../../../workflow/artifact-core/types.js';
import { headConflict } from '../../../../workflow/gates.js';
import { writeArtifact, writeAtomic } from '../../../../workflow/storage.js';
import {
	applyAutoFixes, computeReviewVerdict, DEFAULT_BLOCK_ON_SEVERITIES, normalizeFinding,
	pendingUserFindings, renderReviewReport, REVIEW_SECTION, stripReviewSection, tallyFindings,
} from '../../../../workflow/review/index.js';
import type { Claim, Finding, RawFinding, ReviewReport } from '../../../../workflow/review/index.js';
import { authorPartyOf, SamePartyReviewError } from '../../../../workflow/review/party.js';
import { reviewFixModeFor } from '../../../../workflow/team/approval-gate.js';
import { loadState, releaseState } from '../state-store.js';
import type { ReviewStepDone, ReviewStepInputVerdicts } from '../types.js';

const log = getLogger('mcp:review-step:verdicts');

const REVIEW_MODEL = 'client';

/** Who the store records for the controller's review: the review itself, as the daemon's review does. */
const REVIEWER: Actor = { id: 'insrc:review', kind: 'system', properties: {} };
const CONTROLLER: Actor = { id: 'insrc:controller', kind: 'agent', properties: {} };

/**
 * `lifecycleFor` gives the service of the run's repository. With one, the head is checked against its change log before
 * anything is stamped, an applied fix goes through the store (staged, logged, revisioned), and the review is recorded on the
 * lifecycle; without one the review is persisted as before.
 */
export async function handleVerdicts(
	input: ReviewStepInputVerdicts,
	lifecycleFor?: ((repoPath: string) => LifecycleService | undefined) | undefined,
): Promise<ReviewStepDone> {
	if (typeof input.state !== 'string' || input.state.length === 0) {
		throw new Error(`insrc_review_step[verdicts]: missing \`state\` token from the prior claims response.`);
	}
	const state = loadState(input.state);
	if (state.claims === undefined) {
		throw new Error(`insrc_review_step[verdicts]: no claims in run state — call phase='claims' before phase='verdicts'.`);
	}

	const claimById = new Map<string, Claim>(state.claims.map(c => [c.id, c] as const));
	const rawVerdicts = input.verdicts?.verdicts ?? [];

	const findings: Finding[] = [];
	for (const v of rawVerdicts) {
		if (v === undefined || typeof v.claimId !== 'string') continue;
		const claim = claimById.get(v.claimId);
		if (claim === undefined) {
			log.warn({ claimId: v.claimId }, 'insrc_review_step[verdicts]: verdict references unknown claimId; dropping');
			continue;
		}
		const raw = {
			severity:    v.severity,
			evidence:    v.evidence,
			action:      v.action,
			fixability:  v.fixability,
			proposedFix: v.proposedFix,
		} as unknown as RawFinding;
		findings.push(normalizeFinding(claim, raw));
	}

	const report: ReviewReport = {
		artifact:   state.stage,
		stage:      state.stage,
		verdict:    computeReviewVerdict(findings, DEFAULT_BLOCK_ON_SEVERITIES),
		findings,
		counts:     tallyFindings(findings),
		reviewedAt: new Date().toISOString(),
		model:      REVIEW_MODEL,
		// These phases are the controller's review.
		reviewedBy: 'controller',
	};

	// Persist EXACTLY like reviewArtifactFile: apply the auto-fixes, stamp
	// meta.review, append the rendered report to the md.
	if (!existsSync(state.jsonPath)) throw new Error(`insrc_review_step[verdicts]: no artifact json at ${state.jsonPath}`);
	if (!existsSync(state.mdPath))   throw new Error(`insrc_review_step[verdicts]: no artifact md at ${state.mdPath}`);

	// The head is checked (and any write a crash left staged is finished) BEFORE it is read: everything below works on the head as it is afterwards.
	// The head is checked BEFORE it is read, and any write a crash left staged is finished first (inspect does that), so a state the
	// journal repairs is not refused: everything below works on the head as it is afterwards.
	const artifactId = basename(state.jsonPath).replace(/\.json$/, '');
	const lifecycle = lifecycleFor?.(state.repo);
	if (lifecycle !== undefined) {
		const seen = await lifecycle.inspect(artifactId);
		if (seen !== undefined && !seen.integrity.ok) throw new LifecycleConflictError(artifactId, seen.integrity.reason);
	}
	// A head whose stored hash no longer matches its content, or that is out of step with its change log, is not stamped until a person resolves it.
	const conflict = headConflict(state.jsonPath);
	if (conflict !== undefined) throw new LifecycleConflictError(conflict.artifactId, conflict.reason);
	const artifact = JSON.parse(readFileSync(state.jsonPath, 'utf8')) as { meta: Record<string, unknown>; body: unknown };
	// This phase stamps the CONTROLLER's review, so it does not stamp one on work
	// the controller authored. `start` already sends such work to the daemon; this
	// holds the rule at the point of the stamp, whatever led here.
	if (authorPartyOf(artifact.meta) === 'controller') {
		releaseState(input.state);
		throw new SamePartyReviewError('controller', `this ${state.stage} artifact`);
	}
	const md = stripReviewSection(readFileSync(state.mdPath, 'utf8'));
	// A reviewer who does not hold the stage reports findings but writes no fix (the review is never refused).
	const fixed = reviewFixModeFor(state.jsonPath) === 'apply-auto-fixes'
		? applyAutoFixes(md, artifact.body, report)
		: ({ body: artifact.body, markdown: md, applied: [], skipped: [] } as ReturnType<typeof applyAutoFixes>);

	const nextJson = { ...artifact, meta: { ...artifact.meta, review: report }, body: fixed.body };
	// auto-fixes change the body (content); a report-only review changes only meta.
	if (lifecycle !== undefined && fixed.applied.length > 0) {
		// With a service the content goes through the store; the review stamp then follows as a meta-only write.
		const stored = JSON.parse(readFileSync(state.jsonPath, 'utf8')) as { citations?: unknown };
		const citations = Array.isArray(stored.citations) ? stored.citations : [];
		// an automated fix is not an answer to a person's feedback: it addresses none
		await lifecycle.updateContent(artifactId, REVIEWER, { body: fixed.body as Record<string, unknown>, citations }, { addresses: [] });
		const current = JSON.parse(readFileSync(state.jsonPath, 'utf8')) as { meta: Record<string, unknown> };
		writeArtifact(state.jsonPath, { ...current, meta: { ...current.meta, review: report } }, 'meta-only');
	} else {
		writeArtifact(state.jsonPath, nextJson, fixed.applied.length > 0 ? 'content' : 'meta-only');
	}
	// With a service the review is also recorded on the lifecycle (lifecycle.review and a log entry), when the status allows one.
	if (lifecycle !== undefined) {
		const seen = await lifecycle.inspect(artifactId);
		if (seen !== undefined && (seen.status === 'draft' || seen.status === 'pending-review')) {
			await lifecycle.apply(artifactId, 'review', REVIEWER, {
				review: { reviewer: CONTROLLER, party: 'controller', verdict: report.verdict, counts: { high: report.counts.high, med: report.counts.med, low: report.counts.low } },
			});
		}
	}
	const nextMd = `${fixed.markdown.replace(/\s+$/, '')}\n\n${REVIEW_SECTION}\n\n## Review\n\n${renderReviewReport(report)}\n`;
	// raw-write: markdown render of the review.
	writeAtomic(state.mdPath, nextMd);

	const pending = pendingUserFindings(report).length;
	releaseState(input.state);

	log.info(
		{ runId: state.runId, stage: state.stage, verdict: report.verdict, applied: fixed.applied.length, pending },
		'insrc_review_step[verdicts]: assembled + persisted review (model=client)',
	);

	return {
		next:     'done',
		verdict:  report.verdict,
		counts:   report.counts,
		report:   renderReviewReport(report),
		applied:  fixed.applied.length,
		pending,
		path:     state.mdPath,
		jsonPath: state.jsonPath,
	};
}
