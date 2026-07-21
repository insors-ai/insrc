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

import { getLogger } from '../../../shared/logger.js';
import { writeAtomic } from '../../../workflow/storage.js';
import {
	applyAutoFixes, computeReviewVerdict, DEFAULT_BLOCK_ON_SEVERITIES, normalizeFinding,
	pendingUserFindings, renderReviewReport, tallyFindings,
} from '../../../workflow/review/index.js';
import type { Claim, Finding, RawFinding, ReviewReport } from '../../../workflow/review/index.js';
import { loadState, releaseState } from '../state-store.js';
import type { ReviewStepDone, ReviewStepInputVerdicts } from '../types.js';

const log = getLogger('mcp:review-step:verdicts');

const REVIEW_MODEL = 'client';
const REVIEW_SECTION = '<!-- insrc:review -->';

export function handleVerdicts(input: ReviewStepInputVerdicts): ReviewStepDone {
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
	};

	// Persist EXACTLY like reviewArtifactFile: apply the auto-fixes, stamp
	// meta.review, append the rendered report to the md.
	if (!existsSync(state.jsonPath)) throw new Error(`insrc_review_step[verdicts]: no artifact json at ${state.jsonPath}`);
	if (!existsSync(state.mdPath))   throw new Error(`insrc_review_step[verdicts]: no artifact md at ${state.mdPath}`);

	const artifact = JSON.parse(readFileSync(state.jsonPath, 'utf8')) as { meta: Record<string, unknown>; body: unknown };
	const md = stripReviewSection(readFileSync(state.mdPath, 'utf8'));
	const fixed = applyAutoFixes(md, artifact.body, report);

	const nextJson = { ...artifact, meta: { ...artifact.meta, review: report }, body: fixed.body };
	writeAtomic(state.jsonPath, JSON.stringify(nextJson, null, 2) + '\n');
	const nextMd = `${fixed.markdown.replace(/\s+$/, '')}\n\n${REVIEW_SECTION}\n\n## Review\n\n${renderReviewReport(report)}\n`;
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

/** Strip a previously-appended review section so re-runs don't stack.
 *  Mirrors `run-artifact.ts`. */
function stripReviewSection(md: string): string {
	const i = md.indexOf('\n' + REVIEW_SECTION);
	return i === -1 ? md : md.slice(0, i).replace(/\s+$/, '') + '\n';
}
