/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S005 — the GitHub-issue surface of the bugfix flow (the epic's last story).
 *
 * Two config-gated, injectable-deps policy functions:
 *   - `createBugfixTrackerIssue` — render the approved IssueArtifact's body via
 *     `renderIssueMarkdown` VERBATIM (k4), create the GH issue, link it under the
 *     located parent's GH issue (sc3 → meta.parentRef), and record the created
 *     `owner/repo#N` ref on `meta.tracker.issueRef`. A no-op (`skipped`) when no
 *     tracker is configured / not authed (ac2); idempotent (`reused`) once a ref
 *     is recorded.
 *   - `closeBugfixTrackerIssue` — read the recorded ref and close the GH issue on
 *     completion; a no-op when nothing was created (ac2 symmetry).
 *
 * All GitHub access stays on the existing `gh` CLI through the tracker's
 * injectable `_exec` seam (k5: no direct cloud REST) and reuses the existing
 * create/link/config/resolve surface — the ONLY new gh-verb is the thin
 * `ghCloseIssue` (github.ts), forced because no close wrapper existed (k6). This
 * module owns no new SHARED type; the helper types below are module-internal.
 *
 * Prompt-on-lost-ref (the resolved open-question `q12a87841`): when a recorded
 * ref is lost/unexpectedly missing where one should exist, the injected
 * `promptOnLostRef` is consulted for a next-step ACTION rather than silently
 * degrading. Its default is a no-op returning `skip`, which keeps the pure-defer
 * behaviour byte-compatible with the approved LLD when no prompter is injected
 * (non-interactive runs). `ghFindIssueByLabels` is consulted ONLY inside the
 * user-chosen `relink-by-label` branch — never on the normal create path — so
 * the create path pays no per-create GitHub round-trip (a1).
 */

import { existsSync, readFileSync } from 'node:fs';

import type { IssueArtifact } from '../artifacts/issue.js';
import { renderIssueMarkdown } from '../artifacts/issue.js';
import { resolveGithubConfig, type ResolvedGithubConfig } from '../config/github.js';
import { GithubConfigError } from '../config/github.js';
import { artifactJsonPath, issueArtifactId } from '../storage.js';
import {
	ghAuthOk,
	ghCloseIssue,
	ghCreateIssueTyped,
	ghFindIssueByLabels,
	ghLinkSubIssue,
	type CreatedIssue,
} from '../tracker/github.js';
import { patchTrackerMeta, readTrackerMeta } from '../tracker/refs.js';
import { issueForWorkflowId } from '../tracker/resolve.js';
import type { WorkItemRef } from '../types.js';

// ---------------------------------------------------------------------------
// Result records (module-internal, non-shared)
// ---------------------------------------------------------------------------

export interface TrackerIssueResult {
	readonly status: 'created' | 'reused' | 'skipped';
	readonly ref?:    string;    // owner/repo#N — present on created / reused
	readonly linked?: boolean;   // present on created — whether a parent link landed
	readonly reason?: string;    // why skipped, or a residual note (e.g. ref-unrecorded)
}

export interface TrackerCloseResult {
	readonly status: 'closed' | 'skipped';
	readonly ref?:    string;
	readonly reason?: string;
}

// ---------------------------------------------------------------------------
// Prompt-on-lost-ref (resolved open-question q12a87841)
// ---------------------------------------------------------------------------

/** The next-step actions offered when a recorded ref is lost/missing. */
export type LostRefAction = 'retry-record' | 'record-manual' | 'relink-by-label' | 'skip';

/** What the prompter is told about the lost-ref situation. */
export interface LostRefContext {
	readonly phase:      'create' | 'close';
	readonly issueHash:  string;
	readonly reason:     string;
	/** On the create phase: the ref that WAS created but could not be recorded. */
	readonly createdRef?: string;
}

/** The prompter's decision. `manualRef` is required for `record-manual`. */
export interface LostRefResolution {
	readonly action:     LostRefAction;
	readonly manualRef?: string;
}

/** Injected user-prompt seam. Async so an interactive prompt fits; the default
 *  (`defaultPromptOnLostRef`) resolves to `skip` with no interaction. */
export type PromptOnLostRef = (ctx: LostRefContext) => LostRefResolution | Promise<LostRefResolution>;

/** The no-op default — preserves the LLD's pure-defer behaviour. */
export const defaultPromptOnLostRef: PromptOnLostRef = () => ({ action: 'skip' });

// ---------------------------------------------------------------------------
// Injectable deps
// ---------------------------------------------------------------------------

type AuthResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface TrackerCreateDeps {
	readonly resolveConfig:         (repoPath: string) => ResolvedGithubConfig;
	readonly authOk:                () => AuthResult;
	readonly readIssue:             (repoPath: string, issueHash: string) => IssueArtifact | null;
	readonly readRecordedRef:       (repoPath: string, issueHash: string) => string | null;
	readonly renderBody:            (issue: IssueArtifact) => string;
	readonly createIssue:           (owner: string, repo: string, title: string, body: string, labels: readonly string[], issueType?: string) => CreatedIssue;
	readonly resolveParentIssueRef: (repoPath: string, parentRef: WorkItemRef) => string | null;
	readonly linkSubIssue:          (owner: string, repo: string, parentRef: string, childId: number) => void;
	readonly recordRef:             (repoPath: string, issueHash: string, ref: string) => void;
	readonly labels:                readonly string[];
	readonly promptOnLostRef:       PromptOnLostRef;
}

export interface TrackerCloseDeps {
	readonly resolveConfig:   (repoPath: string) => ResolvedGithubConfig;
	readonly authOk:          () => AuthResult;
	readonly readRecordedRef: (repoPath: string, issueHash: string) => string | null;
	readonly closeIssue:      (owner: string, repo: string, ref: string) => void;
	readonly recordRef:       (repoPath: string, issueHash: string, ref: string) => void;
	readonly findByLabels:    (owner: string, repo: string, labels: readonly string[]) => string | undefined;
	readonly labels:          readonly string[];
	readonly promptOnLostRef: PromptOnLostRef;
}

// ---------------------------------------------------------------------------
// createBugfixTrackerIssue
// ---------------------------------------------------------------------------

/**
 * Config-gated create + link + record. See the module header for the contract.
 *
 * @throws issue-not-found — `deps.readIssue` returns null for `input.issueHash`.
 * A gh CLI failure DURING create (after the config + auth checks) propagates —
 * nothing is recorded, so there is no half-state and a re-run retries cleanly.
 */
export async function createBugfixTrackerIssue(
	input: { repoPath: string; issueHash: string },
	deps: TrackerCreateDeps,
): Promise<TrackerIssueResult> {
	const cfg = resolveConfigOrNone(deps.resolveConfig, input.repoPath);
	if (cfg.type === 'none') {
		return { status: 'skipped', reason: `no tracker configured (${cfg.reason})` };
	}

	const auth = deps.authOk();
	if (!auth.ok) {
		return { status: 'skipped', reason: auth.reason };
	}

	// Idempotency (a1): a ref already on meta.tracker means the issue exists.
	const existing = deps.readRecordedRef(input.repoPath, input.issueHash);
	if (existing !== null && existing.length > 0) {
		return { status: 'reused', ref: existing };
	}

	const issue = deps.readIssue(input.repoPath, input.issueHash);
	if (issue === null) {
		throw new Error(`createBugfixTrackerIssue: issue-not-found for issueHash '${input.issueHash}'`);
	}

	// k4: the GH issue body is renderIssueMarkdown(issue) VERBATIM — the SAME
	// bytes as the internal chain record. Title is the issue's own title.
	const body    = deps.renderBody(issue);
	const title   = issue.body.title;
	const created = deps.createIssue(cfg.owner, cfg.repo, title, body, deps.labels);

	// Best-effort link to the located parent's GH issue (sc3). A standalone
	// bugfix (parentRef null/absent), an unpushed parent, or a disabled
	// sub-issue feature all leave the created issue UNLINKED — never an error.
	const linked = linkToParent(deps, input.repoPath, cfg, issue, created.id);

	// Record the created ref for close + idempotency.
	try {
		deps.recordRef(input.repoPath, input.issueHash, created.ref);
	} catch (err) {
		// The GH issue exists but its ref could not be recorded — prompt for a
		// next step rather than silently leaving an unclosable/duplicable issue.
		return await onLostRefAfterCreate(deps, input, created.ref, linked, err);
	}

	return { status: 'created', ref: created.ref, linked };
}

/** Resolve + link a parent GH issue best-effort. Returns whether a link landed. */
function linkToParent(
	deps: TrackerCreateDeps,
	repoPath: string,
	cfg: GithubTarget,
	issue: IssueArtifact,
	childId: number,
): boolean {
	const parentRef = issue.meta.parentRef;
	if (parentRef === null || parentRef === undefined) return false;   // standalone
	const parentIssueRef = deps.resolveParentIssueRef(repoPath, parentRef);
	if (parentIssueRef === null || parentIssueRef.length === 0) return false;   // unpushed parent
	try {
		deps.linkSubIssue(cfg.owner, cfg.repo, parentIssueRef, childId);
		return true;
	} catch {
		return false;   // sub-issues disabled / parent inaccessible — degrade, don't fail
	}
}

/** The create-side prompt-on-lost-ref branch: recordRef threw AFTER a successful
 *  create, so we hold a live GH issue whose ref did not persist. */
async function onLostRefAfterCreate(
	deps: TrackerCreateDeps,
	input: { repoPath: string; issueHash: string },
	createdRef: string,
	linked: boolean,
	cause: unknown,
): Promise<TrackerIssueResult> {
	const resolution = await deps.promptOnLostRef({
		phase:      'create',
		issueHash:  input.issueHash,
		reason:     `recordRef failed after create: ${errMessage(cause)}`,
		createdRef,
	});

	switch (resolution.action) {
		case 'retry-record': {
			try {
				deps.recordRef(input.repoPath, input.issueHash, createdRef);
				return { status: 'created', ref: createdRef, linked };
			} catch {
				return { status: 'created', ref: createdRef, linked, reason: 'ref-unrecorded' };
			}
		}
		case 'record-manual': {
			const manual = resolution.manualRef;
			if (typeof manual === 'string' && manual.length > 0) {
				try {
					deps.recordRef(input.repoPath, input.issueHash, manual);
					return { status: 'created', ref: manual, linked };
				} catch { /* fall through to unrecorded */ }
			}
			return { status: 'created', ref: createdRef, linked, reason: 'ref-unrecorded' };
		}
		case 'relink-by-label':
		case 'skip':
		default:
			// The created issue stands; its ref just is not persisted this run.
			return { status: 'created', ref: createdRef, linked, reason: 'ref-unrecorded' };
	}
}

// ---------------------------------------------------------------------------
// closeBugfixTrackerIssue
// ---------------------------------------------------------------------------

/**
 * Read the recorded ref and close the GH issue on completion. A no-op
 * (`skipped`) when no tracker is configured / not authed, or when no ref was
 * recorded (nothing was ever created — ac2 symmetry). A gh close failure
 * against a real ref propagates (an already-closed issue is a no-op success).
 *
 * When a repo IS configured but has no recorded ref, `promptOnLostRef` is
 * consulted (default: `skip` → the LLD's byte-compatible skipped result).
 */
export async function closeBugfixTrackerIssue(
	input: { repoPath: string; issueHash: string },
	deps: TrackerCloseDeps,
): Promise<TrackerCloseResult> {
	const cfg = resolveConfigOrNone(deps.resolveConfig, input.repoPath);
	if (cfg.type === 'none') {
		return { status: 'skipped', reason: `no tracker configured (${cfg.reason})` };
	}

	const auth = deps.authOk();
	if (!auth.ok) {
		return { status: 'skipped', reason: auth.reason };
	}

	const ref = deps.readRecordedRef(input.repoPath, input.issueHash);
	if (ref === null || ref.length === 0) {
		return await onLostRefOnClose(deps, input, cfg);
	}

	deps.closeIssue(cfg.owner, cfg.repo, ref);   // throws on a deleted issue → propagate
	return { status: 'closed', ref };
}

/** The close-side prompt-on-lost-ref branch: configured but no recorded ref. */
async function onLostRefOnClose(
	deps: TrackerCloseDeps,
	input: { repoPath: string; issueHash: string },
	cfg: GithubTarget,
): Promise<TrackerCloseResult> {
	const resolution = await deps.promptOnLostRef({
		phase:     'close',
		issueHash: input.issueHash,
		reason:    'no recorded ref for a configured repo',
	});

	switch (resolution.action) {
		case 'relink-by-label': {
			// Recovery ONLY here (never on create): re-discover via labels, re-record, close.
			if (deps.labels.length === 0) {
				return { status: 'skipped', reason: 'relink-by-label unavailable (no labels)' };
			}
			const found = deps.findByLabels(cfg.owner, cfg.repo, deps.labels);
			if (found === undefined || found.length === 0) {
				return { status: 'skipped', reason: 'relink-by-label found no matching issue' };
			}
			deps.recordRef(input.repoPath, input.issueHash, found);
			deps.closeIssue(cfg.owner, cfg.repo, found);
			return { status: 'closed', ref: found };
		}
		case 'record-manual': {
			const manual = resolution.manualRef;
			if (typeof manual === 'string' && manual.length > 0) {
				deps.recordRef(input.repoPath, input.issueHash, manual);
				deps.closeIssue(cfg.owner, cfg.repo, manual);
				return { status: 'closed', ref: manual };
			}
			return { status: 'skipped', reason: 'record-manual: no ref supplied' };
		}
		case 'retry-record':
		case 'skip':
		default:
			return { status: 'skipped', reason: 'no recorded ref' };
	}
}

// ---------------------------------------------------------------------------
// Config gate (shared by create + close)
// ---------------------------------------------------------------------------

interface GithubTarget { readonly type: 'github'; readonly owner: string; readonly repo: string }
type NoneTarget = { readonly type: 'none'; readonly reason: string };

/** Normalise the config resolution to a target OR a `none` carrying the skip
 *  reason. A `GithubConfigError` (github requested but no target) is NOT an
 *  error here — it degrades to `none` (ac2), mirroring the sync.ts skip. */
function resolveConfigOrNone(
	resolveConfig: (repoPath: string) => ResolvedGithubConfig,
	repoPath: string,
): GithubTarget | NoneTarget {
	let cfg: ResolvedGithubConfig;
	try {
		cfg = resolveConfig(repoPath);
	} catch (err) {
		if (err instanceof GithubConfigError) {
			return { type: 'none', reason: err.message };
		}
		throw err;
	}
	if (cfg.type === 'none') {
		return { type: 'none', reason: `source=${cfg.source}` };
	}
	return { type: 'github', owner: cfg.owner, repo: cfg.repo };
}

function errMessage(v: unknown): string {
	return v instanceof Error ? v.message : String(v);
}

// ---------------------------------------------------------------------------
// Default fs/CLI-backed deps
// ---------------------------------------------------------------------------

function readIssueFromDisk(repoPath: string, issueHash: string): IssueArtifact | null {
	const json = artifactJsonPath(repoPath, issueArtifactId(issueHash));
	if (!existsSync(json)) return null;
	try {
		return JSON.parse(readFileSync(json, 'utf8')) as IssueArtifact;
	} catch {
		return null;
	}
}

function readRecordedRefFromDisk(repoPath: string, issueHash: string): string | null {
	const json = artifactJsonPath(repoPath, issueArtifactId(issueHash));
	const meta = readTrackerMeta(json);
	const ref  = meta?.issueRef;
	return typeof ref === 'string' && ref.length > 0 ? ref : null;
}

function recordRefToDisk(repoPath: string, issueHash: string, ref: string): void {
	const json = artifactJsonPath(repoPath, issueArtifactId(issueHash));
	patchTrackerMeta(json, { issueRef: ref });
}

/** Map a WorkItemRef to the parent's GH issue ref, trying the most specific
 *  identifier form first (slug → storyId label → epicHash). */
function defaultResolveParentIssueRef(repoPath: string, parentRef: WorkItemRef): string | null {
	const candidates: string[] = [];
	if (parentRef.slug)     candidates.push(parentRef.slug);
	if (parentRef.storyId)  candidates.push(parentRef.storyId);
	if (parentRef.epicHash) candidates.push(parentRef.epicHash);
	for (const id of candidates) {
		const ref = issueForWorkflowId(repoPath, id);
		if (ref !== null && ref.length > 0) return ref;
	}
	return null;
}

/** Real create-side deps: config resolver + `gh` CLI wrappers + storage
 *  round-trip. `labels` defaults to none (safe create); `promptOnLostRef`
 *  defaults to the no-op skip. */
export function defaultTrackerCreateDeps(
	opts?: { readonly labels?: readonly string[]; readonly promptOnLostRef?: PromptOnLostRef },
): TrackerCreateDeps {
	return {
		resolveConfig:         (repoPath) => resolveGithubConfig(repoPath),
		authOk:                ghAuthOk,
		readIssue:             readIssueFromDisk,
		readRecordedRef:       readRecordedRefFromDisk,
		renderBody:            renderIssueMarkdown,
		createIssue:           ghCreateIssueTyped,
		resolveParentIssueRef: defaultResolveParentIssueRef,
		linkSubIssue:          ghLinkSubIssue,
		recordRef:             recordRefToDisk,
		labels:                opts?.labels ?? [],
		promptOnLostRef:       opts?.promptOnLostRef ?? defaultPromptOnLostRef,
	};
}

/** Real close-side deps. */
export function defaultTrackerCloseDeps(
	opts?: { readonly labels?: readonly string[]; readonly promptOnLostRef?: PromptOnLostRef },
): TrackerCloseDeps {
	return {
		resolveConfig:   (repoPath) => resolveGithubConfig(repoPath),
		authOk:          ghAuthOk,
		readRecordedRef: readRecordedRefFromDisk,
		closeIssue:      ghCloseIssue,
		recordRef:       recordRefToDisk,
		findByLabels:    ghFindIssueByLabels,
		labels:          opts?.labels ?? [],
		promptOnLostRef: opts?.promptOnLostRef ?? defaultPromptOnLostRef,
	};
}
