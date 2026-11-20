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

import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

import { createRoleRouter } from '../../analyze/context/role-router.js';
import { loadAnalyzeConfig } from '../../config/analyze.js';
import type { RoleId } from '../../config/role-taxonomy.js';
import { resolveRepoPath } from '../../daemon/steps/resolve-repo.js';
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

// A narrow classification probe over a bounded input, same shape as the
// analyze framework's own reuse-check/doc-extraction probes -- reuses that
// existing role rather than registering a new one in the shared, closed
// role-taxonomy registry for a single call site.
const CLASSIFY_ROLE: RoleId = 'analyze.narrow';

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
 *  priorFindingRef is never derived from (and never trusts) the model's own echo.
 *  `resolveRepoRoot` is resolved once per call and reused for both the audit-trail
 *  read and the classify call's own provider resolution -- never two independently
 *  resolved roots for the same round. */
export interface ReconciliationDeps {
	readonly resolveRepoRoot?:  (() => Promise<string>) | undefined;
	readonly classify?:          ((reviewId: string, priorFindings: readonly Finding[], currentFindings: readonly Finding[], auditTrail: string | undefined, repoRoot: string) => Promise<readonly ReconciliationVerdict[]>) | undefined;
	readonly auditTrailExists?:  ((reviewId: string, repoRoot: string) => boolean) | undefined;
	readonly readAuditTrail?:    ((reviewId: string, repoRoot: string) => string) | undefined;
}

let testDeps: ReconciliationDeps = {};

/** Test seam: inject the classification call and the audit-trail existence check/reader; no argument resets. */
export function _setReconciliationDepsForTests(deps: ReconciliationDeps = {}): void { testDeps = deps; }

/** A literal review identifier only -- no path separator or `..` segment, matching
 *  the established convention (src/workflow/review-history/review/design-review/checkpoint.ts's
 *  designCheckpointPath). reviewId is joined directly into a filesystem path below, so an
 *  unvalidated value (e.g. `../../../private`) could escape the review's own temp directory. */
const REVIEW_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

function requireValidReviewId(reviewId: string): void {
	if (!REVIEW_ID_PATTERN.test(reviewId)) {
		throw new Error(`reconcileRound: invalid reviewId ${JSON.stringify(reviewId)} -- expected a literal identifier, got a value that cannot be a path segment`);
	}
}

/** The repository the ACTIVE REQUEST's review belongs to, resolved through the ONE
 *  established precedence chain (src/shared/resolve-repo-core.ts, via
 *  src/daemon/steps/resolve-repo.ts): the registered repo containing the request's
 *  own cwd takes precedence over its own INSRC_REPO, which in turn is only a
 *  headless-caller fallback -- neither a bare per-request cwd/envRepo pair nor a
 *  process-wide pin is the resolver on its own. No explicit `repo` argument exists
 *  here (reconcileRound's own signature has none, by ac1), so this always resolves
 *  through the request's own cwd/envRepo/registry lookup. Rejects rather than
 *  silently defaulting when nothing resolves -- matching the chain's own documented
 *  behavior that an unresolved repo is the caller's to raise, never guessed. */
async function defaultResolveRepoRoot(): Promise<string> {
	const repo = await resolveRepoPath(undefined);
	if (repo === undefined) {
		throw new Error('reconcileRound: could not resolve the reviewed repository (no registered repo for the request\'s cwd, and no INSRC_REPO fallback)');
	}
	return repo;
}

function auditTrailDir(reviewId: string, repoRoot: string): string {
	return join(repoRoot, '.insrc/tmp', reviewId);
}

function auditTrailPath(reviewId: string, repoRoot: string): string {
	return join(auditTrailDir(reviewId, repoRoot), 'audit-trail.json');
}

/** True only when `dir` is itself a genuine directory entry, never a symlink --
 *  lstat (unlike stat) reports the link itself, so a symlinked directory reports
 *  isDirectory() false regardless of what it points at. This is what actually
 *  distinguishes THIS review's own directory from a sibling review's directory
 *  aliased in under the same name: a containment check against the shared
 *  .insrc/tmp root alone cannot tell them apart, since a sibling's real directory
 *  is legitimately inside that root too. */
function isGenuineReviewDirectory(dir: string): boolean {
	try {
		return lstatSync(dir).isDirectory();
	} catch {
		return false;
	}
}

/** True only when `path` is itself a genuine regular file, never a symlink -- the
 *  same reasoning as isGenuineReviewDirectory, applied to audit-trail.json itself:
 *  a symlink from this review's audit-trail.json to a sibling review's own
 *  (genuine) audit-trail.json would otherwise pass a root-containment check, since
 *  the sibling's file is legitimately inside .insrc/tmp too. */
function isGenuineAuditTrailFile(path: string): boolean {
	try {
		return lstatSync(path).isFile();
	} catch {
		return false;
	}
}

/** True only when `path`, after resolving every symlink in it, is truly inside the
 *  resolved `.insrc/tmp` directory for the repo AND both `dir` (this review's own
 *  directory) and `path` (its audit-trail.json) are genuine entries, not symlinks.
 *  requireValidReviewId already blocks a LEXICAL escape (`../../../private`), and
 *  existsSync/readFileSync still follow symlinks regardless of the lexical path, so
 *  containment must be re-checked against the REAL, resolved path. The root-only
 *  containment check alone is not enough: a symlinked review directory, or a
 *  symlinked audit-trail.json, pointing at a SIBLING review's own (genuine) entry
 *  under the very same .insrc/tmp tree would still satisfy it -- the identity checks
 *  on `dir`/`path` themselves are what reject that specific aliasing. */
function isContainedAuditPath(path: string, dir: string, repoRoot: string): boolean {
	if (!isGenuineReviewDirectory(dir) || !isGenuineAuditTrailFile(path)) return false;
	const tmpRoot = join(repoRoot, '.insrc/tmp');
	let realTmpRoot: string;
	let realTarget: string;
	try {
		realTmpRoot = realpathSync(tmpRoot);
		realTarget = realpathSync(path);
	} catch {
		return false;
	}
	const rel = relative(realTmpRoot, realTarget);
	return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function defaultAuditTrailExists(reviewId: string, repoRoot: string): boolean {
	const dir = auditTrailDir(reviewId, repoRoot);
	const path = auditTrailPath(reviewId, repoRoot);
	return existsSync(path) && isContainedAuditPath(path, dir, repoRoot);
}

function defaultReadAuditTrail(reviewId: string, repoRoot: string): string {
	const dir = auditTrailDir(reviewId, repoRoot);
	const path = auditTrailPath(reviewId, repoRoot);
	if (!isContainedAuditPath(path, dir, repoRoot)) {
		throw new Error(`reconcileRound: audit trail for reviewId ${JSON.stringify(reviewId)} is not a genuine entry under this review's own .insrc/tmp directory`);
	}
	return readFileSync(path, 'utf8');
}

/**
 * Whether one prior finding's disposition is unambiguous from the two finding
 * sets alone: the SAME finding -- by its own stable id (sc2, HLD rev4) --
 * recurs in currentFindings -- unambiguously confirmed. Matching category and
 * severity alone does NOT establish recurrence: two unrelated findings can
 * independently share a category and severity (e.g. two different
 * correctness/HIGH issues), and treating that coincidence as a literal
 * recurrence would wrongly suppress the audit trail even when the prior
 * finding's actual disposition -- fixed, still open, or mistaken -- is still
 * genuinely unresolved. Only a matching id is safe to treat as settled.
 */
function isUnambiguous(prior: Finding, currentFindings: readonly Finding[]): boolean {
	return currentFindings.some(c => c.id === prior.id);
}

/** Whether the two finding sets ALONE resolve every prior finding's
 *  classification -- the HLD's own test for when the audit trail is read. */
function findingSetsResolveClassification(priorFindings: readonly Finding[], currentFindings: readonly Finding[]): boolean {
	return priorFindings.every(prior => isUnambiguous(prior, currentFindings));
}

async function defaultClassify(
	reviewId: string,
	priorFindings: readonly Finding[],
	currentFindings: readonly Finding[],
	auditTrail: string | undefined,
	repoRoot: string,
): Promise<readonly ReconciliationVerdict[]> {
	const cfg = loadAnalyzeConfig();
	const { provider } = createRoleRouter().resolveProviderForRole(CLASSIFY_ROLE, cfg, repoRoot);
	const messages: LLMMessage[] = [
		{
			role:    'system',
			content: 'You classify each prior finding\'s disposition against the current round\'s findings. '
				+ `For each entry in priorFindings (in order), answer exactly one of: ${VERDICTS.join(', ')}. `
				+ 'confirmed: an equivalent finding still appears in currentFindings. still-open: the issue is unresolved '
				+ 'but not independently re-raised. contradicted: currentFindings or the audit trail shows the prior finding '
				+ 'was mistaken. no-longer-surfaced: the issue no longer appears and nothing indicates why. '
				+ 'This classification is informational only; it never blocks approval.'
				+ (auditTrail !== undefined ? ' An audit trail is included below; use it where the two finding sets alone leave an entry ambiguous.' : ''),
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
 * Runs the dedicated reconciliation pass for one round: a single classification
 * call, never re-grounding and never folded into the pass that produced
 * currentFindings. The review's temp-folder audit trail is read ONLY when the
 * two finding sets alone do not resolve every prior finding's classification
 * (findingSetsResolveClassification) AND a file exists for this reviewId --
 * a missing or unneeded audit trail is never an error, and this function
 * never attempts the read otherwise. The reviewed repository is resolved ONCE
 * per call and reused for both the audit-trail path and the classify call's
 * own provider resolution.
 */
export async function reconcileRound(
	reviewId: string,
	priorFindings: readonly Finding[],
	currentFindings: readonly Finding[],
): Promise<readonly ReconciliationResult[]> {
	requireValidReviewId(reviewId);
	if (priorFindings.length === 0) return [];
	const resolveRepoRoot = testDeps.resolveRepoRoot ?? defaultResolveRepoRoot;
	const auditTrailExists = testDeps.auditTrailExists ?? defaultAuditTrailExists;
	const readAuditTrail = testDeps.readAuditTrail ?? defaultReadAuditTrail;
	const classify = testDeps.classify ?? defaultClassify;

	const repoRoot = await resolveRepoRoot();
	const needsAuditTrail = !findingSetsResolveClassification(priorFindings, currentFindings);
	const auditTrail = needsAuditTrail && auditTrailExists(reviewId, repoRoot) ? readAuditTrail(reviewId, repoRoot) : undefined;
	const verdicts = await classify(reviewId, priorFindings, currentFindings, auditTrail, repoRoot);
	if (verdicts.length !== priorFindings.length) {
		throw new Error(`reconcileRound: classification returned ${verdicts.length} verdicts for ${priorFindings.length} prior findings`);
	}
	return priorFindings.map((finding, i) => ({ priorFindingRef: finding.id, verdict: verdicts[i] as ReconciliationVerdict }));
}
