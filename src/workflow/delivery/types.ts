/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Delivery read model — shared types (E1 / S001, HLD-2ff0dfda sc1–sc3).
 *
 * The record set (sc1), the work-item graph (sc2) and the notice shape (sc3)
 * every delivery pass reads. Type-only apart from DeliveryStoreUnreadableError,
 * so IDE clients can import the shapes without pulling in node:fs.
 */

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
// Filesystem port + store error
// ---------------------------------------------------------------------------

/** The only filesystem surface the loader uses. Read operations only. */
export interface ReadonlyStoreFs {
	exists(path: string): boolean;
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
