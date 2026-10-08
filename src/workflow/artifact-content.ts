/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S002 (Epic ide-artifact-review-panel-jetbrains-plugin, sc2) — the daemon-side
 * assembly of an artifact's REVIEW VIEW: its own rendered content, its open
 * questions, and whether it is currently approvable.
 *
 * `handleArtifactContent` is the pure core the `workflow.artifactContent` IPC
 * handler delegates to (mirroring S001's handleWorkflowPending). Given the
 * mdPath from an S001 PendingArtifact, it:
 *   - validates the path resolves UNDER the repo's docs/ tree (path-traversal
 *     guard) and names a .md,
 *   - reads that .md VERBATIM into renderedMarkdown (k5/lc1/ac3 — the artifact
 *     is the single source of truth; no divergent second copy is authored),
 *   - resolves the sibling hash-flat .json via jsonPathForMd and projects
 *     body.openQuestions + meta.questionResolutions into OpenQuestionRef[]
 *     (id/text/status) and meta.review into approvable/blockReason,
 *   - maps EVERY failure to a structured { error } (never a partial/empty view),
 * so the plugin maps a failure to Unavailable rather than a blank pane.
 *
 * Read-only: it opens no write path and mutates nothing.
 */

import { readFileSync, realpathSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

import { jsonPathForMd } from './gates.js';
import { openQuestions, type OpenQuestionStatus } from './questions.js';
import { effectiveReviewVerdict } from './review/resolve.js';
import type { ReviewReport } from './review/types.js';
import type { FunctionalDefinition } from './artifacts/functional-definition.js';
import type { ErDefinition } from './artifacts/companion/er.js';
import type { SequenceDefinition } from './artifacts/companion/sequence.js';
import type { UxDefinition } from './artifacts/companion/ux.js';
import type { CompanionArtifactRef } from './artifacts/companion/types.js';

// ---------------------------------------------------------------------------
// sc2 contract types (internal-shared; mirrored as Kotlin data classes plugin-side)
// ---------------------------------------------------------------------------

export interface OpenQuestionRef {
	readonly id:     string;
	readonly text:   string;
	readonly status: OpenQuestionStatus;   // 'open' | 'resolved' | 'ignored' | 'deferred'
}

export interface ArtifactReviewView {
	readonly artifactId:       string;   // canonical file identity, e.g. 'LLD-<hash>-s2'
	readonly kind:             string;   // SPEC / DEF / HLD / LLD / PLAN / ISSUE / CR
	readonly renderedMarkdown: string;   // the artifact's own .md read verbatim (k5/lc1)
	readonly openQuestions:    readonly OpenQuestionRef[];
	readonly approvable:       boolean;  // false when a review block-verdict stands
	readonly blockReason?:     string | null;
	// sc1 (Epic build-vs-code-plugin-ui-integration, S001/t1) — the artifact's
	// STRUCTURED body records, projected verbatim alongside the rendered markdown
	// so a review surface can present them as identified items / diagrams / mocks
	// instead of re-parsing prose. Additive + absent-safe: a body that omits one
	// projects the field ABSENT (never null, never {}), so `=== undefined` is the
	// single absence test and a consumer deserializing only the original six is
	// unaffected. Not gated on `kind` — a PLAN body carries functionalDefinition too.
	readonly functionalDefinition?: FunctionalDefinition | undefined;
	readonly erDefinition?:         ErDefinition | undefined;
	// AMD-bfe98ff7f97178cf-1 (S003) — sharedContract.fieldAdd on sc1, breaking:false.
	// THREE daemon renderers stamp kind:'diagram-mermaid' (companion/render.ts:104
	// ER, :205 sequence, :243 component), so a companion ref CANNOT identify which
	// record drew it and a review surface must dispatch on the RECORD. Projecting
	// only `erDefinition` left the majority of real diagram documents undrawable —
	// the ledger holds 5 diagram-mermaid refs against 2 erDefinitions and 3
	// sequenceDefinitions. `componentDependencyDefinition` is DEFERRED, not
	// forgotten: 0 artifact bodies carry one, so it is added when a producer first
	// emits it, on these same additive terms.
	readonly sequenceDefinition?:   SequenceDefinition | undefined;
	readonly uxDefinition?:         UxDefinition | undefined;
	readonly companions?:           readonly CompanionArtifactRef[] | undefined;
}

/** Structured failure the daemon relays verbatim; DISTINCT from a partial view
 *  (the plugin maps it to Unavailable, never a blank pane). */
export interface ArtifactContentError { readonly error: string }

export interface WorkflowArtifactContentRequest { readonly repo: string; readonly mdPath: string }

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

interface ArtifactShape {
	readonly meta?: Record<string, unknown>;
	readonly body?: Record<string, unknown>;
}

/** Why a markdown path was refused, in the order the checks run. */
export type DocsMarkdownRefusal = 'outside-docs' | 'not-md' | 'unreadable' | 'symlink-escape';

/**
 * The docs/ containment rule for reading an artifact's rendered markdown:
 * resolve the (possibly repo-relative) path, require it to sit lexically under
 * the repo's docs/ tree and end in .md, then canonicalize both sides and
 * re-check, so a symlink under docs/ (e.g. docs/leak -> /etc) cannot carry the
 * read outside the tree. A missing file is 'unreadable'. Reads nothing beyond
 * realpath; shared by workflow.artifactContent and the delivery read model.
 */
export function resolveDocsMarkdown(
	repoPath: string,
	mdPath: string,
): { readonly realPath: string } | { readonly reason: DocsMarkdownRefusal; readonly detail: string } {
	const absMd = resolve(isAbsolute(mdPath) ? mdPath : join(repoPath, mdPath));
	const docsRoot = resolve(join(repoPath, 'docs'));
	// (1) Lexical containment — fast reject of '..' escapes and absolute paths.
	const rel = relative(docsRoot, absMd);
	if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return { reason: 'outside-docs', detail: '' };
	if (!absMd.endsWith('.md')) return { reason: 'not-md', detail: '' };

	// (2) Symlink-safe containment — `resolve` normalizes '..' only LEXICALLY.
	// Canonicalize both sides and re-check containment BEFORE any read.
	let realMd: string;
	try {
		realMd = realpathSync(absMd);
	} catch (err) {
		return { reason: 'unreadable', detail: (err as Error).message };
	}
	let realDocs: string;
	try {
		realDocs = realpathSync(docsRoot);
	} catch {
		return { reason: 'outside-docs', detail: '' };
	}
	const realRel = relative(realDocs, realMd);
	if (realRel === '' || realRel.startsWith('..') || isAbsolute(realRel)) return { reason: 'symlink-escape', detail: '' };
	return { realPath: realMd };
}

/**
 * Assemble the sc2 ArtifactReviewView for a pending artifact, or a structured
 * { error }. Pure over the filesystem (no daemon state, no writes). Extracted
 * from the daemon handler so the repo/path resolution + view assembly are
 * integration-testable without a socket (like handleWorkflowPending).
 */
export function handleArtifactContent(
	params: { repo?: string; mdPath?: string } | undefined,
	repoEnv: string | undefined,
): ArtifactReviewView | ArtifactContentError {
	const p = params ?? {};
	const repoPath = (p.repo !== undefined && p.repo.length > 0 ? p.repo : repoEnv) ?? '';
	if (repoPath.length === 0) {
		return { error: 'workflow.artifactContent: `repo` is required' };
	}
	if (typeof p.mdPath !== 'string' || p.mdPath.length === 0) {
		return { error: 'workflow.artifactContent: `mdPath` is required' };
	}

	const located = resolveDocsMarkdown(repoPath, p.mdPath);
	if ('reason' in located) {
		switch (located.reason) {
			case 'outside-docs':   return { error: `workflow.artifactContent: mdPath must resolve under docs/ (got '${p.mdPath}')` };
			case 'not-md':         return { error: `workflow.artifactContent: mdPath must be a workflow artifact .md (got '${p.mdPath}')` };
			case 'unreadable':     return { error: `workflow.artifactContent: cannot read '${p.mdPath}': ${located.detail}` };
			case 'symlink-escape': return { error: `workflow.artifactContent: mdPath resolves outside docs/ via a symlink (got '${p.mdPath}')` };
		}
	}
	const realMd = located.realPath;

	let renderedMarkdown: string;
	try {
		renderedMarkdown = readFileSync(realMd, 'utf8');
	} catch (err) {
		return { error: `workflow.artifactContent: cannot read '${p.mdPath}': ${(err as Error).message}` };
	}

	// The sibling hash-flat .json (meta + body) via the in-file insrc:artifact marker.
	let jsonPath: string;
	try {
		jsonPath = jsonPathForMd(realMd);
	} catch (err) {
		return { error: `workflow.artifactContent: cannot resolve artifact metadata: ${(err as Error).message}` };
	}

	let art: ArtifactShape;
	try {
		art = JSON.parse(readFileSync(jsonPath, 'utf8')) as ArtifactShape;
	} catch (err) {
		return { error: `workflow.artifactContent: artifact metadata unreadable: ${(err as Error).message}` };
	}

	const meta = art.meta ?? {};
	const body = art.body ?? {};
	const artifactId = basename(jsonPath).replace(/\.json$/, '');
	const dash = artifactId.indexOf('-');
	const kind = dash < 0 ? artifactId : artifactId.slice(0, dash);

	const texts = Array.isArray(body['openQuestions'])
		? (body['openQuestions'] as unknown[]).filter((t): t is string => typeof t === 'string')
		: [];
	const resolutions = meta['questionResolutions'] as Parameters<typeof openQuestions>[1];
	const oq: OpenQuestionRef[] = openQuestions(texts, resolutions)
		.map(q => ({ id: q.id, text: q.text, status: q.status }));

	const review = meta['review'] as ReviewReport | undefined;
	const reviewResolutions = meta['reviewResolutions'] as Parameters<typeof effectiveReviewVerdict>[1];
	const blocked = review !== undefined && effectiveReviewVerdict(review, reviewResolutions) === 'block';

	return {
		artifactId,
		kind,
		renderedMarkdown,
		openQuestions: oq,
		approvable: !blocked,
		...(blocked ? { blockReason: summarizeBlock(review!) } : {}),
		...structuredRecords(body),
	};
}

/**
 * sc1 (S001/t1) — project the four STRUCTURED body records onto the view.
 *
 * Deliberately pass-through: the body has already been parsed, so this performs
 * no additional read, no reshaping, no defaulting and NO VALIDATION. A record
 * whose shape is invalid travels through rather than failing the read, so one
 * malformed record can never refuse to open a document — the surface degrades
 * to prose, it does not go blank.
 *
 * Absence is keyed on `undefined` ALONE, and an absent record omits its key
 * entirely rather than carrying `undefined`: that is what makes a consumer's
 * `=== undefined` the single absence test under `exactOptionalPropertyTypes`.
 * A body that literally stores `null` is a malformed record, not an absent one,
 * so it travels through as written.
 */
function structuredRecords(body: Record<string, unknown>): Partial<Pick<
	ArtifactReviewView,
	'functionalDefinition' | 'erDefinition' | 'sequenceDefinition' | 'uxDefinition' | 'companions'
>> {
	const fd = body['functionalDefinition'] as FunctionalDefinition | undefined;
	const er = body['erDefinition']         as ErDefinition | undefined;
	const sq = body['sequenceDefinition']   as SequenceDefinition | undefined;
	const ux = body['uxDefinition']         as UxDefinition | undefined;
	const co = body['companions']           as readonly CompanionArtifactRef[] | undefined;
	return {
		...(fd !== undefined ? { functionalDefinition: fd } : {}),
		...(er !== undefined ? { erDefinition:         er } : {}),
		...(sq !== undefined ? { sequenceDefinition:   sq } : {}),
		...(ux !== undefined ? { uxDefinition:         ux } : {}),
		...(co !== undefined ? { companions:           co } : {}),
	};
}

/** A one-line reason a review block-verdict withholds approval (from the report
 *  counts + the top blocking finding). s5 surfaces it; s2 only carries it. */
function summarizeBlock(review: ReviewReport): string {
	const top = review.findings.find(f => f.severity === 'HIGH')
		?? review.findings.find(f => f.severity === 'MED');
	const head = `Review blocks approval — ${review.counts.high} HIGH, ${review.counts.med} MED`;
	return top !== undefined ? `${head}: ${top.premise}` : head;
}
