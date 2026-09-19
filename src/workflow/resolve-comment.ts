/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S004 (Epic ide-artifact-review-panel-jetbrains-plugin, sc3) — the daemon-side
 * recording of submitted review comments as OPEN-QUESTION RESOLUTIONS.
 *
 * `handleResolveComment` is the pure core the `workflow.resolveComment` IPC
 * handler delegates to (mirroring S002's handleArtifactContent). Given the
 * artifactId of the artifact under review + the submitted comment buffer, it
 * folds every comment through the EXISTING recordResolution machinery (k4/lc1 —
 * no parallel comment store):
 *   - a comment anchored to a CURRENT open question resolves that question
 *     (status='resolved', rationale=the comment body);
 *   - a section/quote/general comment (or one whose anchored openQuestionId is
 *     stale) is APPENDED to the artifact's own body.openQuestions and then
 *     immediately resolved (chosen alternative a1). recordResolution VALIDATES
 *     the qId against the current open questions and THROWS otherwise, so the
 *     append MUST precede the resolve.
 *
 * Only DEF / HLD / LLD artifacts carry open-question resolutions
 * (QuestionArtifactKind), so any other artifactId is refused with a structured
 * { error }. EVERY failure maps to a RETURNED { error } (framed by server.ts as
 * result:{error}; the transport surfaces the non-empty result.error as ok=false
 * — the S001 invariant), never a partial/silent success, so the plugin keeps
 * the un-submitted buffer and surfaces the failure (ac3).
 *
 * The artifact remains the single source of truth (k5): the only writes are the
 * append to that artifact's own body.openQuestions and recordResolution's own
 * write; nothing outside the target artifact is touched.
 */

import { readFileSync } from 'node:fs';

import { questionId, recordResolution, type QuestionArtifactKind } from './questions.js';
import { artifactJsonPath, writeAtomic } from './storage.js';
import { commitAndPushArtifacts } from './tracker/github.js';

/** The recordResolution seam — injectable so the a1 mapping logic is testable
 *  headlessly without recordResolution's full artifact re-render (production
 *  passes the real recordResolution). */
export type RecordResolutionFn = typeof recordResolution;
export interface ResolveCommentDeps { readonly record?: RecordResolutionFn }

// ---------------------------------------------------------------------------
// sc3 contract types (internal-shared; mirrored as Kotlin data classes plugin-side)
// ---------------------------------------------------------------------------

export interface CommentAnchor {
	readonly sectionPath?:    string;   // heading path into the rendered artifact
	readonly quote?:          string;   // anchoring snippet within that section
	readonly openQuestionId?: string;   // set when the comment targets an open question
}

export interface ReviewComment {
	readonly id:     string;            // client-generated until submitted
	readonly anchor: CommentAnchor;
	readonly body:   string;
}

export interface ResolveCommentRequest {
	readonly repo?:      string;
	readonly artifactId: string;
	readonly comments:   readonly ReviewComment[];
}

/** One recorded resolution reported back per comment (sc3). Under a1 the status
 *  is always 'resolved' (the existing enum; no 'note' value is introduced). */
export interface ResolvedCommentEntry {
	readonly openQuestionId?: string;
	readonly status:          'resolved' | 'ignored' | 'deferred';
}

export interface ResolveCommentResult {
	readonly recorded:    number;                              // comments successfully written
	readonly resolutions: readonly ResolvedCommentEntry[];
}

/** Structured failure relayed verbatim; DISTINCT from a partial success (the
 *  plugin maps it to Unavailable and keeps the buffer). */
export interface ResolveCommentError { readonly error: string }

// ---------------------------------------------------------------------------
// artifactId parsing (the locator recordResolution needs)
// ---------------------------------------------------------------------------

export interface ArtifactIdentity {
	readonly kind:     QuestionArtifactKind;   // 'define' | 'hld' | 'lld'
	readonly epicHash: string;
	readonly storyId:  string | undefined;
}

// KIND-<epicHash>[-<storyId>]: DEF-/HLD- carry no story; LLD- carries one.
const ARTIFACT_ID_RE = /^(DEF|HLD|LLD)-([0-9a-fA-F]{6,})(?:-(s\d+))?$/;

/**
 * Decode a canonical artifactId into the (kind, epicHash, storyId) locator, or
 * null when it is malformed OR names a kind that carries no open-question
 * resolutions (SPEC/PLAN/ISSUE/CR/BUILD). No filesystem access.
 */
export function parseArtifactId(id: string): ArtifactIdentity | null {
	const m = ARTIFACT_ID_RE.exec(typeof id === 'string' ? id : '');
	if (m === null) return null;
	const prefix = m[1]!;
	const epicHash = m[2]!;
	const story = m[3];
	if (prefix === 'LLD') {
		return story !== undefined ? { kind: 'lld', epicHash, storyId: story } : null;
	}
	// DEF / HLD are epic-scoped and must NOT carry a story segment.
	if (story !== undefined) return null;
	return { kind: prefix === 'DEF' ? 'define' : 'hld', epicHash, storyId: undefined };
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

interface ArtifactShape {
	readonly meta?: Record<string, unknown>;
	readonly body?: Record<string, unknown> & { openQuestions?: unknown };
}

/**
 * Record the submitted comments against their artifact as open-question
 * resolutions, or a structured { error }. Pure over the filesystem apart from
 * the append to the artifact's own body.openQuestions + recordResolution's
 * write (both on the ONE target artifact).
 */
export function handleResolveComment(
	params: { repo?: string; artifactId?: string; comments?: readonly ReviewComment[] } | undefined,
	repoEnv: string | undefined,
	deps?: ResolveCommentDeps,
): ResolveCommentResult | ResolveCommentError {
	const record = deps?.record ?? recordResolution;
	const p = params ?? {};
	const repoPath = (p.repo !== undefined && p.repo.length > 0 ? p.repo : repoEnv) ?? '';
	if (repoPath.length === 0) {
		return { error: 'workflow.resolveComment: `repo` is required' };
	}
	if (typeof p.artifactId !== 'string' || p.artifactId.length === 0) {
		return { error: 'workflow.resolveComment: `artifactId` is required' };
	}
	const identity = parseArtifactId(p.artifactId);
	if (identity === null) {
		return {
			error: `workflow.resolveComment: unrecognized or unsupported artifactId '${p.artifactId}' ` +
				'(only DEF/HLD/LLD artifacts carry open-question resolutions)',
		};
	}

	const comments = Array.isArray(p.comments) ? p.comments : [];
	if (comments.length === 0) {
		return { error: 'workflow.resolveComment: no comments to record' };
	}
	for (const c of comments) {
		if (c === null || typeof c !== 'object' || typeof c.body !== 'string' || c.body.trim().length === 0) {
			return { error: 'workflow.resolveComment: every comment must have a non-empty body' };
		}
	}

	const jsonPath = artifactJsonPath(repoPath, p.artifactId);
	// Fail cleanly (recorded 0) before any write when the artifact is absent.
	try {
		readArtifact(jsonPath);
	} catch (err) {
		return { error: `workflow.resolveComment: artifact '${p.artifactId}' not found or unreadable: ${(err as Error).message}` };
	}

	const resolutions: ResolvedCommentEntry[] = [];
	let recorded = 0;
	let lastJsonPath: string | undefined;
	let lastMdPath: string | undefined;
	for (const c of comments) {
		try {
			const qId = resolveTargetQuestion(jsonPath, c);
			// commit:false — every comment writes the artifact but we commit ONCE
			// after the batch (below), so a submit of N comments is ONE git
			// commit, not N synchronous commit+push cycles that block the daemon.
			const res = record(repoPath, identity.kind, identity.epicHash, identity.storyId, qId, 'resolved', anchorSummary(c.anchor), c.body.trim(), { commit: false });
			lastJsonPath = res.jsonPath;
			lastMdPath = res.mdPath;
			resolutions.push({ openQuestionId: qId, status: 'resolved' });
			recorded += 1;
		} catch (err) {
			// Never silently drop: report recorded-so-far so the plugin keeps the
			// whole buffer and surfaces the failure (ac3). The append path is
			// IDEMPOTENT (an identical comment already appended is reused, not
			// duplicated — see resolveTargetQuestion), so a retry after a partial
			// failure does not duplicate the comments already recorded.
			commitRecorded(repoPath, lastJsonPath, lastMdPath, recorded, comments.length, p.artifactId);
			return {
				error: `workflow.resolveComment: recorded ${recorded} of ${comments.length} before failing on comment '${c.id}': ${(err as Error).message}`,
			};
		}
	}

	// One commit for the whole submit (best-effort — a commit/push failure never
	// turns a successful recording into a failure; the resolutions are already on
	// disk, the single source of truth).
	commitRecorded(repoPath, lastJsonPath, lastMdPath, recorded, comments.length, p.artifactId);
	return { recorded, resolutions };
}

/** Best-effort single commit of the artifact after a (partial or full) batch. */
function commitRecorded(
	repoPath: string,
	jsonPath: string | undefined,
	mdPath: string | undefined,
	recorded: number,
	total: number,
	artifactId: string,
): void {
	if (recorded === 0 || jsonPath === undefined || mdPath === undefined) return;
	try {
		commitAndPushArtifacts(repoPath, [jsonPath, mdPath], `review: recorded ${recorded} of ${total} comment(s) on ${artifactId}`);
	} catch {
		/* best-effort: the resolutions are already written; git is not on the success path */
	}
}

/**
 * Resolve the open-question id this comment should resolve. A comment anchored
 * to a CURRENT open question keeps that id; otherwise the comment is appended to
 * the artifact's own body.openQuestions (a1) and the id of the appended question
 * is returned — so the subsequent recordResolution (which validates the id
 * against the current open questions) always finds it.
 */
function resolveTargetQuestion(jsonPath: string, c: ReviewComment): string {
	const art = readArtifact(jsonPath);
	const texts = openQuestionTexts(art);
	const currentIds = new Set(texts.map(t => questionId(t)));

	const anchored = c.anchor?.openQuestionId;
	if (typeof anchored === 'string' && anchored.length > 0 && currentIds.has(anchored)) {
		return anchored; // resolve the existing question in place
	}

	// a1: append the comment as a new open question, then resolve it. IDEMPOTENT:
	// if this exact comment was already appended (same derived id), reuse it
	// instead of appending a duplicate — so a retry after a partial-batch failure
	// does not grow duplicate questions.
	const text = commentQuestionText(c);
	const id = questionId(text);
	if (currentIds.has(id)) return id;
	const nextBody: Record<string, unknown> = { ...(art.body ?? {}), openQuestions: [...texts, text] };
	const next = { ...art, body: nextBody };
	writeAtomic(jsonPath, JSON.stringify(next, null, 2) + '\n');
	return id;
}

function readArtifact(jsonPath: string): ArtifactShape {
	return JSON.parse(readFileSync(jsonPath, 'utf8')) as ArtifactShape;
}

function openQuestionTexts(art: ArtifactShape): string[] {
	const raw = art.body?.openQuestions;
	return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string') : [];
}

/** The open-question text a general/section/quote comment becomes: the reviewer
 *  body, tagged with its anchor for provenance. Immediately resolved (a1). */
function commentQuestionText(c: ReviewComment): string {
	const where = c.anchor?.sectionPath
		? ` @ ${c.anchor.sectionPath}`
		: (c.anchor?.quote ? ` @ “${truncate(c.anchor.quote, 80)}”` : '');
	return `[review comment${where}] ${c.body.trim()}`;
}

/** A short anchor summary stored as the resolution's `choice` (provenance). */
function anchorSummary(anchor: CommentAnchor | undefined): string | undefined {
	if (anchor === undefined) return undefined;
	if (typeof anchor.sectionPath === 'string' && anchor.sectionPath.length > 0) return anchor.sectionPath;
	if (typeof anchor.quote === 'string' && anchor.quote.length > 0) return truncate(anchor.quote, 80);
	if (typeof anchor.openQuestionId === 'string' && anchor.openQuestionId.length > 0) return `open question ${anchor.openQuestionId}`;
	return undefined;
}

function truncate(s: string, n: number): string {
	return s.length > n ? s.slice(0, n) : s;
}
