/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The shapes of the s9 conversion of a repository onto the common artifact model: the plan the planner computes
 * (a preview prints it and writes nothing), what the applier reports, the delivery view that verification compares
 * before and after, and the three errors the command raises. Nothing here reads or writes a file.
 */

import type { ArtifactStore } from '../artifact-core/store.js';
import type { History } from '../artifact-core/history.js';
import type { UnmappedField } from '../artifact-core/feedback-convert.js';
import type { Actor, ChangeLogEntry } from '../artifact-core/types.js';
import type { TaskSets } from '../tasks/task-set.js';
import type { TrackerPort } from '../tracker/port.js';

/** One stored file as the planner read it: parsed JSON, never passed through the strict decoder. */
export interface RawHead {
	/** The file stem, e.g. `LLD-<hash>-s1`. */
	readonly artifactId: string;
	readonly json:       unknown;
}

/** The rules of the conversion, in the order the applier runs them. */
export type ConversionRule =
	| 'rename-id' | 'stamp-epic-created-at' | 'convert-amendment' | 'convert-feedback' | 'migrate-head'
	| 'create-epic' | 'create-story' | 'create-tasks' | 'move-binding' | 'move-story-history' | 'relabel-issue';

/** One change the plan would make: the rule, the artifact and the stored state that makes the rule apply. */
export interface ConversionChange {
	readonly rule:       ConversionRule;
	readonly artifactId: string;
	readonly detail:     string;
}

/** A file the planner could not use. It is listed, never skipped silently, and blocks an apply. */
export interface ConversionProblem {
	readonly file:   string;
	readonly reason: string;
}

/** A value with no home in the new shape, with the artifact and entry it came from. */
export interface ConversionUnmapped extends UnmappedField {
	readonly artifactId: string;
	readonly entryId:    string;
}

/** A pre-s8 `Attached ...` comment found on a bound issue: listed in the report, never rewritten. */
export interface LegacyAttachComment {
	readonly issue:     string;
	readonly commentId: string;
}

/** A reference to a renamed id that sits where the planner cannot rewrite it (prose, an issue body). */
export interface ProseReference {
	readonly file:  string;
	readonly oldId: string;
}

/** The delivery facts of one unit that verification compares: the same fields before (from the legacy stamps) and after. */
export interface UnitView {
	readonly artifactId: string;
	/** The kind named by the file prefix, e.g. 'LLD'. */
	readonly kind:       string;
	readonly approval:   'approved' | 'rejected' | 'pending';
	/** meta.revision; null when the head has none. */
	readonly revision:   number | null;
	readonly review: {
		readonly verdict:          'pass' | 'warn' | 'block';
		readonly effectiveVerdict: 'pass' | 'warn' | 'block';
		readonly blocking:         boolean;
		readonly counts:           { readonly high: number; readonly med: number; readonly low: number };
	} | null;
	/** Feedback no change has addressed. A legacy body.feedback entry has no addressing, so each counts. */
	readonly openFeedback: number;
}

export interface ConversionPlan {
	readonly changes:              readonly ConversionChange[];
	/** Old file stem to new, e.g. `LLD-<h>-S001` to `LLD-<h>-s1`. */
	readonly renames:              readonly { readonly from: string; readonly to: string }[];
	readonly unmapped:             readonly ConversionUnmapped[];
	readonly problems:             readonly ConversionProblem[];
	readonly proseReferences:      readonly ProseReference[];
	/** Heads whose review is older than the head's revision, so it is not bound to the lifecycle. */
	readonly unboundReviews:       readonly string[];
	readonly legacyAttachComments: readonly LegacyAttachComment[];
	/** The before-snapshot, computed from the raw legacy heads by `legacyDeliveryView`. */
	readonly snapshot:             readonly UnitView[];
}

/** A head the migration write replaces: its id, the full bytes of the converted head, and the log entries to record first. */
export interface ConvertedHead {
	readonly artifactId: string;
	readonly bytes:      string;
	/** Stamp and review entries first, the revision-bearing `migrated-<artifact id>` entry last. */
	readonly entries:    readonly ChangeLogEntry[];
}

/** What the conversion works with. The store and history are the ones every other writer uses. */
export interface ConversionDeps {
	readonly store:    ArtifactStore;
	readonly history:  History;
	readonly taskSets: TaskSets;
	readonly now:      () => Date;
	/** Who the migrated entries are recorded as (`insrc:migration`). */
	readonly actor:    Actor;
	/** Present only when the optional tracker steps may run. */
	readonly tracker?: TrackerPort | undefined;
}

/** One unit whose before and after delivery facts differ. */
export interface ViewDifference {
	readonly artifactId: string;
	readonly field:      'approval' | 'revision' | 'review' | 'openFeedback' | 'missing';
	readonly before:     unknown;
	readonly after:      unknown;
	readonly reason:     string;
}

export interface VerifyReport {
	readonly differences: readonly ViewDifference[];
}

export interface ConversionResult {
	readonly written:        readonly ConversionChange[];
	readonly markerWritten:  boolean;
	/** Failures of the optional tracker steps; they never block the marker. */
	readonly trackerFailures: readonly { readonly issue: string; readonly reason: string }[];
	readonly verification?:  VerifyReport | undefined;
}

export interface ConversionReport {
	readonly mode:    'preview' | 'apply';
	readonly plan:    ConversionPlan;
	readonly result?: ConversionResult | undefined;
}

/** The tree is not in a state the command may start from (a merge, uncommitted artifacts, a changed plan). */
export class ConversionRefused extends Error {
	constructor(message: string, readonly paths: readonly string[] = []) { super(message); this.name = 'ConversionRefused'; }
}

/** A stored file that is not JSON, has conflict markers or has no body. */
export class ConversionUnreadable extends Error {
	constructor(message: string, readonly file: string) { super(message); this.name = 'ConversionUnreadable'; }
}

/** The conversion ran but a head is not in the converted state; the marker is not written. */
export class ConversionIncomplete extends Error {
	constructor(message: string, readonly heads: readonly { readonly artifactId: string; readonly reason: string }[] = []) { super(message); this.name = 'ConversionIncomplete'; }
}
