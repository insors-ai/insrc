/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The review-report docgen call (HLD sc4, owned by this Story). renderReviewReport
 * composes a round's own findings (plus, for round>1, s3's reconciliation verdicts
 * against the prior round) into a persisted Markdown artifact under the review's
 * own .insrc/tmp/<reviewId>/ directory, and returns the written path -- the
 * explicit, agent-invoked call k6 requires, never auto-triggered internally.
 *
 * Deliberately NOT wired into src/docgen/'s diagram registry: that framework's
 * own contract (DocumentIR -> RenderedDocumentShell) renders a self-contained
 * offline HTML/SVG file, never Markdown, and its own handler never persists to
 * disk -- a mismatch with ac1's literal "persisted MD artifact" requirement.
 */

import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import { resolveRepoPath } from '../../daemon/steps/resolve-repo.js';
import type { Finding } from './finding.js';
import type { ReconciliationResult } from './reconciliation.js';

/** The explicit call shape (sc4's HLD interfaceSketch) identifying which round of
 *  which review this call renders. */
export interface ReviewReportDocgenCall {
	readonly reviewId: string;
	readonly round:    number;
}

/** Injectable for tests (matching reconciliation.ts's own _setReconciliationDepsForTests
 *  convention). `resolveRepoRoot` is resolved once per call; `writeReport` is the
 *  actual persistence step, both overridable so unit tests never touch a real
 *  daemon client or the real filesystem outside a throwaway fixture. */
export interface ReviewReportDeps {
	readonly resolveRepoRoot?: (() => Promise<string>) | undefined;
	readonly writeReport?:     ((repoRoot: string, path: string, content: string) => void) | undefined;
}

let testDeps: ReviewReportDeps = {};

/** Test seam: inject the repo-resolution and the persistence step; no argument resets. */
export function _setReviewReportDepsForTests(deps: ReviewReportDeps = {}): void { testDeps = deps; }

/** A literal review identifier only -- matching reconciliation.ts's own
 *  requireValidReviewId, since this call joins reviewId into a filesystem path too. */
const REVIEW_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

function requireValidReviewId(reviewId: string): void {
	if (!REVIEW_ID_PATTERN.test(reviewId)) {
		throw new Error(`renderReviewReport: invalid reviewId ${JSON.stringify(reviewId)} -- expected a literal identifier, got a value that cannot be a path segment`);
	}
}

/** Mirrors runReviewRound's own round validation (src/workflow/review-round/driver.ts). */
function requireValidRound(round: number): void {
	if (!Number.isInteger(round) || round < 1) {
		throw new RangeError(`renderReviewReport: round must be a positive integer, got ${round}`);
	}
}

/** The repository the review belongs to, resolved through the one canonical
 *  precedence chain (resolveRepoPath) -- never the daemon process's own cwd.
 *  Matches the fix reconciliation.ts needed across three external review rounds. */
async function defaultResolveRepoRoot(): Promise<string> {
	const repo = await resolveRepoPath(undefined);
	if (repo === undefined) {
		throw new Error('renderReviewReport: could not resolve the reviewed repository (no registered repo for the request\'s cwd, and no INSRC_REPO fallback)');
	}
	return repo;
}

function reportPath(repoRoot: string, reviewId: string, round: number): string {
	return join(repoRoot, '.insrc/tmp', reviewId, `review-report-round-${round}.md`);
}

/**
 * Rejects if ANY existing path segment between repoRoot and the target is itself
 * a symlink -- reviewId already passed requireValidReviewId's LEXICAL check, but
 * mkdirSync/writeFileSync still FOLLOW an existing symlink regardless of the
 * lexical path given to them: a symlinked review directory, a symlinked report
 * file, or a symlinked ancestor (even .insrc/tmp itself) could otherwise redirect
 * the write outside the repository, into a sibling review's own genuine directory,
 * or onto an unrelated file, truncating it. lstat (unlike stat) reports the link
 * itself, so a symlinked segment reports isSymbolicLink() true regardless of what
 * it points at -- walking every segment, rather than just the leaf, is what also
 * catches a symlinked ancestor.
 */
function requireNoSymlinkInPath(repoRoot: string, target: string): void {
	const rel = relative(repoRoot, target);
	let current = repoRoot;
	for (const segment of rel.split(sep)) {
		current = join(current, segment);
		if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
			throw new Error(`renderReviewReport: ${current} is a symlink -- refusing to write through it`);
		}
	}
}

function defaultWriteReport(repoRoot: string, path: string, content: string): void {
	requireNoSymlinkInPath(repoRoot, path);
	mkdirSync(dirname(path), { recursive: true });
	// Re-checked after mkdirSync: closes the narrow window where a segment could be
	// swapped for a symlink between validation and the write that follows it.
	requireNoSymlinkInPath(repoRoot, path);
	writeFileSync(path, content, 'utf8');
}

function renderFinding(finding: Finding): string {
	return `- **${finding.id}** — ${finding.category} / ${finding.severity}`;
}

/**
 * Renders the reconciliation section: one line per ReconciliationResult, naming
 * the prior finding it refers to (looked up in priorFindings by id) plus its
 * verdict. A priorFindingRef with no matching priorFindings entry still renders,
 * with its verdict alone and the bare ref named -- s3's own contract guarantees
 * the id itself is correct, and a rendering gap here is never a reason to fail
 * the whole round's report.
 */
function renderReconciliation(reconciliation: readonly ReconciliationResult[], priorFindings: readonly Finding[] | undefined): string {
	const lines = reconciliation.map(result => {
		const prior = priorFindings?.find(f => f.id === result.priorFindingRef);
		const label = prior === undefined
			? result.priorFindingRef
			: `${prior.id} — ${prior.category} / ${prior.severity}`;
		return `- **${label}**: _${result.verdict}_`;
	});
	return ['## Reconciliation', '', ...lines].join('\n');
}

/**
 * Composes this round's outcome into a persisted Markdown artifact and returns
 * its path. findings is this round's own finalized, self-contained finding set
 * (k4) -- never re-derived here. reconciliation/priorFindings are s3's own
 * reconcileRound output for the (round-1, round) adjacent pair only (k5); when
 * round is 1, both are undefined and no reconciliation section is rendered at
 * all (lc3) -- not an empty one.
 */
export async function renderReviewReport(
	call: ReviewReportDocgenCall,
	findings: readonly Finding[],
	reconciliation: readonly ReconciliationResult[] | undefined,
	priorFindings: readonly Finding[] | undefined,
): Promise<string> {
	requireValidReviewId(call.reviewId);
	requireValidRound(call.round);
	const resolveRepoRoot = testDeps.resolveRepoRoot ?? defaultResolveRepoRoot;
	const writeReport = testDeps.writeReport ?? defaultWriteReport;

	const repoRoot = await resolveRepoRoot();
	const path = reportPath(repoRoot, call.reviewId, call.round);

	const sections = [
		`# Review report — round ${call.round}`,
		'',
		`Review: \`${call.reviewId}\``,
		'',
		'## This round\'s findings',
		'',
		findings.length === 0 ? 'No findings were produced this round.' : findings.map(renderFinding).join('\n'),
	];
	if (reconciliation !== undefined) {
		sections.push('', renderReconciliation(reconciliation, priorFindings));
	}
	const content = `${sections.join('\n')}\n`;

	writeReport(repoRoot, path, content);
	return path;
}
