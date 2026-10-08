/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Delivery read model — shared types (E1, HLD-2ff0dfda sc1–sc7).
 *
 * The record set (sc1), the work-item graph (sc2) and the notice shape (sc3)
 * every delivery pass reads. Type-only apart from DeliveryStoreUnreadableError,
 * so IDE clients can import the shapes without pulling in node:fs.
 */

import type { ReviewVerdict } from '../review/types.js';

/** The one verdict language, shared with review/ and code-review/ (sc5). */
export type { ReviewVerdict };

// ---------------------------------------------------------------------------
// sc1 — ArtifactRecordSet
// ---------------------------------------------------------------------------

export type DeliveryArtifactKind = 'SPEC' | 'DEF' | 'HLD' | 'LLD' | 'PLAN' | 'BUILD' | 'CR' | 'ISSUE' | 'EXT' | 'AMD';

export type ApprovalState = 'approved' | 'rejected' | 'pending';

export interface ArtifactRecord {
	/** File stem, e.g. 'LLD-<hash>-s1'. */
	readonly artifactId: string;
	readonly kind: DeliveryArtifactKind;
	/** meta.epicHash; meta.issueHash for an ISSUE; meta.specHash for a SPEC; top-level epicHash for an AMD. */
	readonly workItemHash: string | null;
	/** meta.storyId exactly as written. */
	readonly storyIdRaw: string | null;
	/** Canonical ordinal of storyIdRaw; null when absent or unparseable. */
	readonly storyOrdinal: number | null;
	/** meta.approvedAt / meta.rejectedAt; for an AMD, top-level approvedAt / rejectedAt / status. */
	readonly approval: {
		readonly state:      ApprovalState;
		readonly approvedAt: string | null;
		readonly rejectedAt: string | null;
	};
	/** meta.createdAt; top-level proposedAt for an AMD. */
	readonly createdAt: string | null;
	/** meta.epicCreatedAt when stamped. */
	readonly epicCreatedAt: string | null;
	/** The record's meta; for a flat AMD, every top-level field except `amendment`. */
	readonly meta: Readonly<Record<string, unknown>>;
	/** The record's body; for a flat AMD, its `amendment` object. */
	readonly body: unknown;
}

export interface RecordLoadFailure {
	readonly fileName: string;
	readonly reason:   'unreadable' | 'invalid-json' | 'missing-meta' | 'unknown-kind';
	readonly detail:   string;
}

export interface ArtifactRecordSet {
	readonly repo:     string;
	/** ISO time the directory was listed. */
	readonly readAt:   string;
	/** Sorted by artifactId. */
	readonly records:  readonly ArtifactRecord[];
	/** Sorted by fileName. */
	readonly failures: readonly RecordLoadFailure[];
}

// ---------------------------------------------------------------------------
// sc2 — WorkItemGraph
// ---------------------------------------------------------------------------

export type DeliveryItemKind = 'epic' | 'story' | 'task' | 'issue';

export interface CorrectsRef {
	readonly epicHash?:      string | undefined;
	readonly storyId?:       string | undefined;
	readonly slug?:          string | undefined;
	readonly resolvedItemId: string | null;
}

export interface WorkItemNode {
	/** Canonical work-item id ('E<date><hash8>[:S<nnn>][:T<nnn>]'); an H-form or ':R(<raw>)' fallback when it cannot be minted. */
	readonly id:                  string;
	readonly kind:                DeliveryItemKind;
	/** Null when no record names it. */
	readonly title:               string | null;
	readonly workItemHash:        string | null;
	readonly standalone:          boolean;
	/** Every raw id joined into this item, e.g. ['S001', 's1']. */
	readonly sourceIds:           readonly string[];
	readonly parentId:            string | null;
	/** Sorted. */
	readonly childIds:            readonly string[];
	/** Sorted; artifacts whose identity resolves to this item. */
	readonly evidenceArtifactIds: readonly string[];
	/** Stories only: task ids from the PLAN. */
	readonly plannedTaskIds:      readonly string[];
	/** Issues only, from meta.parentRef; null otherwise or when the issue names only itself. */
	readonly correctsRef:         CorrectsRef | null;
	/** 'SPEC-' + meta.seededFromSpec when the item was seeded from a spec. */
	readonly seededFromSpecId:    string | null;
}

export interface WorkItemGraph {
	readonly items:   ReadonlyMap<string, WorkItemNode>;
	/** Epics, standalone stories, issues; sorted. */
	readonly rootIds: readonly string[];
	/** Identity notices (sc3). */
	readonly notices: readonly DeliveryNotice[];
}

// ---------------------------------------------------------------------------
// sc3 — DeliveryNotice
// ---------------------------------------------------------------------------

export type NoticeCode =
	| 'record-unreadable'          // s1: a file in the store could not be loaded
	| 'identity-ambiguous'         // s1: records the canonical rule cannot settle as same or different
	| 'unresolved-parent'          // s1: an issue's corrected parent, or a record's epic, is not in the store
	| 'identity-anchor-missing'    // s1: no usable date to mint the canonical id; hash form used
	| 'unattached-spec'            // s1: a SPEC no work item names as its seededFromSpec
	| 'unknown-route'              // s2: no recorded route for an item that needs one
	| 'review-without-build'       // s2: a code review exists with no build record
	| 'unplanned-task'             // s3: a build task with no matching planned task
	| 'validation-conflict'        // s3: completion approved while a task failed
	| 'incomplete-evidence'        // s4 / s5: expected evidence absent
	| 'review-currency-unknown'    // s4: no recorded field settles whether a review is current
	| 'base-predates-extension';   // s4: an accepted extension is newer than the epic framing

export interface DeliveryNotice {
	readonly code:        NoticeCode;
	readonly message:     string;
	/** Sorted; empty for store-level notices. */
	readonly itemIds:     readonly string[];
	/** Sorted. */
	readonly artifactIds: readonly string[];
	/** Sorted; for unreadable files that have no artifact id. */
	readonly fileNames:   readonly string[];
	/** True when this notice alone makes an item need attention (fixed per code). */
	readonly attention:   boolean;
}

// ---------------------------------------------------------------------------
// sc4 — StageAnnotation (E1 s2)
// ---------------------------------------------------------------------------

export type DeliveryStage =
	| 'scoped'
	| 'design-plan'
	| 'ready-design-approved'
	| 'ready-plan-approved'
	| 'build-recorded'
	| 'complete';

/** The route a work item was triaged onto; it decides which gate makes the item ready. */
export type DeliveryRoute = 'full-chain' | 'feature' | 'small' | 'small-bugfix' | 'sized-bugfix' | 'trivial' | 'unknown';

export interface StageAnnotation {
	readonly itemId: string;
	readonly stage:  DeliveryStage;
	readonly route:  DeliveryRoute;
	/** The records the deciding rule used (sorted) and a sentence naming them. */
	readonly reason: { readonly text: string; readonly artifactIds: readonly string[] };
}

export interface StagePassResult {
	/** Keyed by item id; stories and issues only. */
	readonly stages:  ReadonlyMap<string, StageAnnotation>;
	readonly notices: readonly DeliveryNotice[];
}

// ---------------------------------------------------------------------------
// sc5 — GateAnnotation (E1 s3)
// ---------------------------------------------------------------------------

/**
 * Approval and review facts for one record. A design artifact's review is its
 * meta.review; a CR record is itself a review (body.verdict / body.counts).
 */
export interface ArtifactGate {
	readonly artifactId: string;
	readonly approval:   { readonly state: 'approved' | 'rejected' | 'pending'; readonly at: string | null };
	readonly review: {
		readonly verdict:          ReviewVerdict;
		readonly reviewedAt:       string;
		readonly reviewedBy:       'controller' | 'daemon' | null;
		readonly counts:           { readonly high: number; readonly med: number; readonly low: number };
		readonly override:         { readonly reason: string; readonly at: string | null } | null;
		/** HIGH/MED findings with an entry in meta.reviewResolutions. */
		readonly resolvedFindings: number;
		readonly effectiveVerdict: ReviewVerdict;
		/** effectiveVerdict 'block', the gate the review guards unapproved, and no override. */
		readonly blocking:         boolean;
	} | null;
}

export type TaskResult = 'passed' | 'failed' | 'unrecorded';

export interface TaskValidation {
	readonly taskItemId: string;
	readonly result:     TaskResult;
	/** False for a build-only task. */
	readonly planned:    boolean;
}

/** 'validation-failed' is raised by a failed task result or a failed storyLevelResult alike. */
export type AttentionReason = 'pending-decision' | 'rejected' | 'review-blocked' | 'validation-failed' | 'validation-conflict';

export interface ItemGates {
	readonly itemId:           string;
	/** Sorted by taskItemId. */
	readonly tasks:            readonly TaskValidation[];
	readonly validation:       { readonly passed: number; readonly failed: number; readonly unrecorded: number; readonly unplanned: number };
	/** A build result recorded against the story itself; not a task, never unplanned. */
	readonly storyLevelResult: TaskResult | null;
	/** Set when a BUILD is approved and a task result or the storyLevelResult failed. */
	readonly conflict:         { readonly failedTaskItemIds: readonly string[]; readonly storyLevelFailed: boolean } | null;
	readonly attentionReasons: readonly AttentionReason[];
	/** The attention rule applied, naming any superseded pending records it excluded. */
	readonly attentionRule:    string;
}

export interface GatePassResult {
	/** Keyed by artifactId. */
	readonly artifacts: ReadonlyMap<string, ArtifactGate>;
	/** Keyed by item id; epics, stories and issues. */
	readonly items:     ReadonlyMap<string, ItemGates>;
	readonly notices:   readonly DeliveryNotice[];
}

// ---------------------------------------------------------------------------
// sc6 — CurrencyAnnotation (E1 s4)
// ---------------------------------------------------------------------------

/** current and stale only where a recorded field settles it; unknown otherwise. */
export type ReviewCurrency = 'current' | 'stale' | 'unknown';

export interface ArtifactCurrency {
	readonly artifactId:     string;
	/** Null when the record carries no review. */
	readonly reviewCurrency: ReviewCurrency | null;
	/** The recorded fields that settled it; null when unknown. */
	readonly basis:          string | null;
}

export interface EffectiveAmendment {
	/** e.g. 'AMD-<hash>-1'. */
	readonly amendmentId:  string;
	readonly status:       'pending' | 'approved' | 'rejected';
	/** The amendment's recorded type, e.g. 'storyBoundary.addStory'. */
	readonly type:         string | null;
	readonly storyId:      string | null;
	/** Approved and counted in the epic's effective HLD. */
	readonly appliesToHld: boolean;
}

export interface CurrencyPassResult {
	/** Keyed by artifactId. */
	readonly artifacts:  ReadonlyMap<string, ArtifactCurrency>;
	/** Keyed by epic item id; each list sorted by amendmentId. */
	readonly amendments: ReadonlyMap<string, readonly EffectiveAmendment[]>;
	readonly notices:    readonly DeliveryNotice[];
}

// ---------------------------------------------------------------------------
// sc7 — Delivery IPC contract (E1 s5): workflow.delivery, workflow.deliveryEvidence
// ---------------------------------------------------------------------------

/** method 'workflow.delivery'. */
export interface DeliverySnapshotRequest { readonly repo?: string | undefined }

export interface DeliveryEvidenceEntry {
	readonly artifactId:     string;
	readonly kind:           DeliveryArtifactKind;
	/** Rendered markdown under docs/ when one exists. */
	readonly mdPath:         string | null;
	/** review-view when the markdown carries the artifact marker. */
	readonly openWith:       'review-view' | 'evidence-read';
	readonly approval:       { readonly state: 'approved' | 'rejected' | 'pending'; readonly at: string | null };
	readonly review:         ArtifactGate['review'];
	readonly reviewCurrency: ReviewCurrency | null;
}

export interface DeliveryItem {
	readonly id:               string;
	readonly kind:             DeliveryItemKind;
	readonly title:            string | null;
	readonly standalone:       boolean;
	readonly sourceIds:        readonly string[];
	readonly parentId:         string | null;
	readonly childIds:         readonly string[];
	/** Null for epics and tasks. */
	readonly stage:            { readonly stage: DeliveryStage; readonly route: DeliveryRoute; readonly reason: { readonly text: string; readonly artifactIds: readonly string[] } } | null;
	/** Sorted by artifactId. */
	readonly evidence:         readonly DeliveryEvidenceEntry[];
	/** Stories only. */
	readonly tasks:            readonly TaskValidation[];
	readonly validation:       ItemGates['validation'] | null;
	readonly storyLevelResult: ItemGates['storyLevelResult'];
	readonly conflict:         ItemGates['conflict'];
	readonly correctsRef:      WorkItemNode['correctsRef'];
	/** Epics only; empty otherwise. */
	readonly amendments:       readonly EffectiveAmendment[];
	readonly notices:          readonly DeliveryNotice[];
	readonly needsAttention:   boolean;
	readonly attentionReasons: readonly (AttentionReason | NoticeCode)[];
}

export interface DeliverySnapshot {
	readonly schemaVersion:   1;
	readonly repo:            string;
	/** ISO time the store was read. */
	readonly takenAt:         string;
	readonly recordCount:     number;
	readonly unreadableCount: number;
	/** Sorted by id. */
	readonly items:           readonly DeliveryItem[];
	readonly rootIds:         readonly string[];
	/** Store-level, sorted by code then artifactIds. */
	readonly notices:         readonly DeliveryNotice[];
	readonly counts: {
		readonly items:          Readonly<Record<DeliveryItemKind, number>>;
		readonly byStage:        Readonly<Record<DeliveryStage, number>>;
		readonly needsAttention: number;
	};
	readonly attentionRule:   string;
}

/** method 'workflow.deliveryEvidence'. */
export interface DeliveryEvidenceRequest { readonly repo?: string | undefined; readonly artifactId: string }

export interface DeliveryEvidenceRecord {
	readonly artifactId:       string;
	readonly kind:             DeliveryArtifactKind;
	readonly meta:             Readonly<Record<string, unknown>>;
	readonly body:             unknown;
	readonly renderedMarkdown: string | null;
}

export interface DeliveryError { readonly error: string }

export type DeliverySnapshotResponse = DeliverySnapshot | DeliveryError;
export type DeliveryEvidenceResponse = DeliveryEvidenceRecord | DeliveryError;

/**
 * Locates a record's rendered markdown and whether it starts with that record's
 * marker. realPath is the file the docs/ containment check resolved, so a
 * reader opens exactly that file without resolving the path a second time.
 */
export interface DeliveryMarkdownPort {
	markdownOf(record: ArtifactRecord): { readonly mdPath: string; readonly realPath: string; readonly hasMarker: boolean } | null;
}

/** Test seams for the two handlers; the defaults read the real store and docs/ tree. */
export interface DeliveryDeps {
	readonly fs?:       ReadonlyStoreFs | undefined;
	readonly now?:      (() => string) | undefined;
	readonly markdown?: DeliveryMarkdownPort | undefined;
}

// ---------------------------------------------------------------------------
// Filesystem port + store error
// ---------------------------------------------------------------------------

/** The only filesystem surface the loader and the evidence handler use. Read operations only. */
export interface ReadonlyStoreFs {
	exists(path: string): boolean;
	/** The path with every symlink resolved; throws when it does not exist. */
	realpath(path: string): string;
	listDir(path: string): readonly string[];
	readFile(path: string): string;
}

/** The artifact store directory exists but cannot be listed. */
export class DeliveryStoreUnreadableError extends Error {
	readonly storePath: string;

	constructor(storePath: string, cause: string) {
		super(`delivery: artifact store at '${storePath}' cannot be read: ${cause}`);
		this.name = 'DeliveryStoreUnreadableError';
		this.storePath = storePath;
	}
}
