/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The review-report docgen call (HLD sc4, owned by this Story). renderReviewReport
 * composes a round's own findings (plus, for round>1, s3's reconciliation verdicts
 * against the prior round) into a persisted Markdown artifact under the review's
 * own .insrc/tmp/<reviewId>/ directory, and returns both the written path AND the
 * rendered markdown -- the explicit, agent-invoked call k6 requires, never
 * auto-triggered internally.
 *
 * Deliberately NOT wired into src/docgen/'s diagram registry: that framework's
 * own contract (DocumentIR -> RenderedDocumentShell) renders a self-contained
 * offline HTML/SVG file, never Markdown, and its own handler never persists to
 * disk -- a mismatch with ac1's literal "persisted MD artifact" requirement.
 *
 * ac3 ("presented to the user via insrc_present every round") does NOT mean the
 * caller hands this call's return value to the insrc_present MCP tool: that
 * tool's own matching (src/mcp/server.ts's handleInsrcPresent) is scoped
 * entirely to the daemon's pending-workflow-artifact list (workflow.pending) --
 * a DEF/HLD/LLD/PLAN/BUILD/ISSUE/EXT record awaiting approval. A review-report
 * is never pending approval (k3: reconciliation/findings never feed the
 * approval gate; ac3 itself: "no response required from the user"), so it can
 * never appear in that list, and a caller that passes this call's path to
 * insrc_present will always see it reported notPending -- confirmed directly
 * against the real handler, not assumed. The correct, and only necessary, way
 * to satisfy ac3 is for the caller to surface the returned `markdown` directly
 * in its own response (the same convention this codebase's own agents already
 * use for review packets and self-reviews) -- which needs no tool call at all,
 * since the caller already has everything it needs to present the report.
 */

import { closeSync, constants as fsConstants, lstatSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { randomBytes } from 'node:crypto';

import { resolveRepoPath } from '../../daemon/steps/resolve-repo.js';
import type { Finding } from './finding.js';
import type { ReconciliationResult } from './reconciliation.js';

/** The explicit call shape (sc4's HLD interfaceSketch) identifying which round of
 *  which review this call renders. */
export interface ReviewReportDocgenCall {
	readonly reviewId: string;
	readonly round:    number;
}

/** renderReviewReport's own result: the persisted file's path, AND the exact
 *  markdown written to it. `markdown` is what actually satisfies ac3 -- the
 *  caller presents this content directly in its own response; insrc_present
 *  never applies to a review-report (see the module doc above). */
export interface ReviewReportResult {
	readonly path:     string;
	readonly markdown: string;
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
 * Rejects if ANY path segment between repoRoot and the target is itself a
 * symlink -- reviewId already passed requireValidReviewId's LEXICAL check, but
 * mkdirSync/writeFileSync still FOLLOW an existing symlink regardless of the
 * lexical path given to them: a symlinked review directory, a symlinked report
 * file, or a symlinked ancestor (even .insrc/tmp itself) could otherwise redirect
 * the write outside the repository, into a sibling review's own genuine directory,
 * or onto an unrelated file, truncating it. lstatSync (unlike existsSync, which
 * itself follows symlinks and reports a DANGLING one as nonexistent) reports the
 * link itself without following it, so a symlinked segment is caught via
 * isSymbolicLink() whether or not its target exists -- the gap a prior existsSync
 * guard around lstatSync left open: a dangling symlink would still have let
 * writeFileSync create the file at the link's own resolved location. Walking
 * every segment, rather than just the leaf, is what also catches a symlinked
 * ancestor.
 */
function requireNoSymlinkInPath(repoRoot: string, target: string): void {
	const rel = relative(repoRoot, target);
	let current = repoRoot;
	for (const segment of rel.split(sep)) {
		current = join(current, segment);
		let stat;
		try {
			stat = lstatSync(current);
		} catch {
			continue; // does not exist at all -- nothing to follow, safe to create
		}
		if (stat.isSymbolicLink()) {
			throw new Error(`renderReviewReport: ${current} is a symlink -- refusing to write through it`);
		}
	}
}

function defaultWriteReport(repoRoot: string, path: string, content: string): void {
	requireNoSymlinkInPath(repoRoot, path);
	mkdirSync(dirname(path), { recursive: true });
	// Re-checked after mkdirSync: narrows the window where a segment could be
	// swapped for a symlink between validation and the publish that follows it.
	// publishGuarded below closes the remainder: it never checks-then-writes
	// `path` itself at all, so nothing that happens to `path` after this point
	// -- however it happens, and regardless of timing -- can matter.
	requireNoSymlinkInPath(repoRoot, path);
	publishGuarded(path, content);
}

/**
 * Publishes `content` at `path` without ever reading through, following, or
 * truncating-in-place whatever currently occupies that name -- externally
 * reported as a second P2 against `3d7937145` (reproduced, against this
 * exact function, two ways): (1) a plain `writeFileSync(path, ...)` follows
 * an existing symlink at `path`, including one substituted there in the
 * instant after requireNoSymlinkInPath's own last check above -- the check
 * and a separate write are still two syscalls, so the gap between them,
 * however narrow, is a real window a concurrent writer can win; (2) even
 * with no symlink involved at all, `writeFileSync(path, ...)` truncates
 * whatever INODE `path` currently names, and a hard link lstat reports as an
 * ordinary regular file -- indistinguishable from a genuine report -- shares
 * that inode with an unrelated file elsewhere, so the "safe" case the
 * symlink check was never meant to flag turns out to corrupt a file outside
 * the review directory just the same.
 *
 * Writing the content to a freshly created, uniquely and unpredictably
 * named sibling file first (`O_CREAT|O_EXCL|O_NOFOLLOW`: the open can
 * neither target nor follow any existing name, since the name has never
 * existed until this call creates it) and then renaming that sibling over
 * `path` sidesteps both failure modes at once, independent of timing:
 * `rename(2)` replaces `path`'s own directory entry atomically, pointing it
 * at the new inode, without ever dereferencing whatever name or inode was
 * there before -- a symlink is replaced as a link, never followed into its
 * target, and a hard-linked file is merely unlinked from this one name,
 * leaving its other link, and that inode's content, completely untouched.
 * Because the rename is the only operation this function ever applies to
 * `path` itself, there is no check-on-`path`-then-separately-write-to-`path`
 * pairing left to race at all -- the remaining ancestor-directory check
 * above (requireNoSymlinkInPath on `path`'s own containing directories) is
 * the one piece a bare rename cannot cover, since rename still resolves
 * -- and can still be misdirected by -- a symlinked ancestor in `path`'s own
 * dirname.
 */
function publishGuarded(path: string, content: string): void {
	const tempPath = join(dirname(path), `.review-report-${randomBytes(8).toString('hex')}.tmp`);
	// openSync (not writeFileSync's string-only `flag`) so O_NOFOLLOW's numeric
	// constant can be combined in: the name has never existed until this call
	// creates it, so O_CREAT|O_EXCL alone already cannot target or follow any
	// existing name, but O_NOFOLLOW documents that guarantee explicitly rather
	// than relying on O_EXCL's side effect alone.
	const fd = openSync(tempPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW);
	try {
		writeFileSync(fd, content, 'utf8');
	} finally {
		closeSync(fd);
	}
	try {
		renameSync(tempPath, path);
	} catch (err) {
		try { unlinkSync(tempPath); } catch { /* best effort cleanup; the rename's own error is what matters */ }
		throw err;
	}
}

/**
 * Test-only direct access to publishGuarded's own guarantee. renderReviewReport's
 * upfront requireNoSymlinkInPath refuses a pre-existing symlink at `path` before
 * ever reaching publishGuarded, so that path alone cannot exercise publishGuarded's
 * independent safety -- which holds regardless of WHY or WHEN something already
 * occupies `path` (a hard link lstat cannot tell apart from a plain file, or a
 * symlink substituted after the last check). Exported solely so the regression
 * tests for both externally reported repro cases can exercise this guarantee
 * directly and deterministically, without needing a real concurrent race.
 */
export function _publishGuardedForTests(path: string, content: string): void {
	publishGuarded(path, content);
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
 * both its path and the exact markdown written -- the latter is what the caller
 * presents directly to satisfy ac3 (see the module doc). findings is this
 * round's own finalized, self-contained finding set (k4) -- never re-derived
 * here. reconciliation/priorFindings are s3's own reconcileRound output for the
 * (round-1, round) adjacent pair only (k5); when round is 1, both are undefined
 * and no reconciliation section is rendered at all (lc3) -- not an empty one.
 */
export async function renderReviewReport(
	call: ReviewReportDocgenCall,
	findings: readonly Finding[],
	reconciliation: readonly ReconciliationResult[] | undefined,
	priorFindings: readonly Finding[] | undefined,
): Promise<ReviewReportResult> {
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
	return { path, markdown: content };
}
