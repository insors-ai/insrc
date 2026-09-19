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

	// Resolve the (possibly repo-relative) mdPath and GUARD it stays under
	// docs/ — never trust a client-supplied path to read outside the tree.
	const absMd = resolve(isAbsolute(p.mdPath) ? p.mdPath : join(repoPath, p.mdPath));
	const docsRoot = resolve(join(repoPath, 'docs'));
	// (1) Lexical containment — fast reject of '..' escapes and absolute paths.
	const rel = relative(docsRoot, absMd);
	if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
		return { error: `workflow.artifactContent: mdPath must resolve under docs/ (got '${p.mdPath}')` };
	}
	if (!absMd.endsWith('.md')) {
		return { error: `workflow.artifactContent: mdPath must be a workflow artifact .md (got '${p.mdPath}')` };
	}

	// (2) Symlink-safe containment — `resolve` normalizes '..' only LEXICALLY, so
	// a symlink under docs/ (e.g. docs/leak -> /etc) could otherwise let the read
	// follow the link outside the tree. Canonicalize both sides and re-check
	// containment BEFORE reading. A missing file canonicalizes to ENOENT -> the
	// same "cannot read" error as a plain missing .md.
	let realMd: string;
	try {
		realMd = realpathSync(absMd);
	} catch (err) {
		return { error: `workflow.artifactContent: cannot read '${p.mdPath}': ${(err as Error).message}` };
	}
	let realDocs: string;
	try {
		realDocs = realpathSync(docsRoot);
	} catch {
		return { error: `workflow.artifactContent: mdPath must resolve under docs/ (got '${p.mdPath}')` };
	}
	const realRel = relative(realDocs, realMd);
	if (realRel === '' || realRel.startsWith('..') || isAbsolute(realRel)) {
		return { error: `workflow.artifactContent: mdPath resolves outside docs/ via a symlink (got '${p.mdPath}')` };
	}

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
