/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The common artifact model (HLD sc2, sc3, sc8) plus the shapes it carries
 * from sc4 (Lifecycle, owned by s3) and sc6 (TrackerBinding and Attachment,
 * owned by s6). Types and error classes only: no disk, no clock.
 *
 * The stored head keeps `{ meta, body, citations }`; the envelope parts live
 * under `meta.envelope` and `meta.lifecycle`.
 */

// ---------------------------------------------------------------------------
// sc2: envelope
// ---------------------------------------------------------------------------

/** Who did something. `id` is namespaced and lower-case (`github:alice`, `insrc:daemon`). */
export interface Actor {
	readonly id:         string;
	readonly kind:       'person' | 'agent' | 'system';
	readonly name?:      string | undefined;
	readonly properties: Readonly<Record<string, unknown>>;
}

/** A typed link to another entity. `entityId` is an artifact id or an external id. */
export interface Reference {
	readonly entityId:  string;
	readonly type:      string;
	readonly relation:  'derived-from' | 'depends-on' | 'tracked-by' | 'supersedes' | 'documents' | 'implements' | 'cites' | 'reviews';
	readonly fragment?: string | undefined;
	readonly quote?:    string | undefined;
}

/** The common shape of every stored entity. */
export interface Artifact<P> {
	readonly id:          string;
	readonly description: string;
	readonly parent?:     Reference | undefined;
	readonly references:  readonly Reference[];
	readonly lifecycle:   Lifecycle;
	readonly binding?:    TrackerBinding | undefined;
	readonly attachments: readonly Attachment[];
	readonly payload:     P;
}

// ---------------------------------------------------------------------------
// sc3: history records
// ---------------------------------------------------------------------------

export type Operation =
	| 'create' | 'update' | 'delete' | 'reparent' | 'request-review' | 'review'
	| 'approve' | 'reject' | 'open-signoff' | 'signoff-changes' | 'signed-off'
	| 'complete' | 'reopen' | 'withdraw' | 'supersede' | 'mark-stale' | 'ack-stale' | 'record-override';

/** One entry of an artifact's operation log. */
export interface ChangeLogEntry {
 /** Exact resulting head for a deterministic write; absent on ordinary/historical entries. */
 readonly targetHeadHash?: string | undefined;
	readonly id:         string;
	readonly actor:      Actor;
	readonly timestamp:  string;
	readonly operation:  Operation;
	readonly revision?:  { readonly number: number; readonly contentHash: string } | undefined;
	readonly status?:    { readonly from: string; readonly to: string } | undefined;
	readonly outcome?:   { readonly result: string; readonly summary: string; readonly data?: unknown } | undefined;
	readonly references?: readonly Reference[] | undefined;
	readonly addresses?: 'all' | readonly string[] | undefined;
}

/** One feedback entry; immutable once written. Replies are `feedback`. */
export interface Feedback {
	readonly id:        string;
	readonly text:      string;
	readonly actor:     Actor;
	readonly timestamp: string;
	readonly feedback:  readonly Feedback[];
	readonly kind:      'comment' | 'suggestion' | 'revision-request';
	/** `prefix` and `suffix` are the stated extension to the HLD sketch. */
	readonly anchor?: {
		readonly quote?:   string | undefined;
		readonly prefix?:  string | undefined;
		readonly suffix?:  string | undefined;
		readonly section?: string | undefined;
		readonly lines?:   readonly [number, number] | undefined;
	} | undefined;
	readonly revision?: number | undefined;
	readonly source?:   { readonly system: string; readonly externalId: string; readonly url?: string | undefined } | undefined;
	readonly batchId?:  string | undefined;
	/** The id of the root entry this entry replies to. A stored line is never rewritten, so a reply is its own line that names its parent; an entry without it is a thread root (AMD-2f27754d4ad00b8e-9). */
	readonly inReplyTo?: string | undefined;
}

/** One persisted sidecar line: the entry and the artifact that owns it. */
export interface SidecarRecord<E> {
	readonly artifactId: string;
	readonly entry:      E;
}

// ---------------------------------------------------------------------------
// sc4: lifecycle (owned by s3)
// ---------------------------------------------------------------------------

export type Status =
	| 'draft' | 'pending-review' | 'approved' | 'in-signoff' | 'changes-requested'
	| 'signed-off' | 'rejected' | 'completed' | 'withdrawn' | 'superseded';

export interface Revision {
	readonly number:      number;
	readonly contentHash: string;
	readonly at:          string;
	readonly by:          Actor;
}

export interface Approval {
	readonly revision:  number;
	readonly by:        Actor;
	readonly at:        string;
	readonly override?: { readonly reason: string } | undefined;
}

export interface Review {
	readonly revision: number;
	readonly reviewer: Actor;
	readonly party:    'controller' | 'daemon';
	readonly verdict:  'pass' | 'warn' | 'block';
	readonly counts:   Readonly<Record<string, number>>;
	readonly at:       string;
	readonly report?:  Reference | undefined;
}

export interface Signoff {
	readonly revision: number;
	readonly request:  Reference;
	readonly state:    'open' | 'changes-requested' | 'completed';
	readonly actors:   readonly Actor[];
	readonly at:       string;
}

export interface Staleness {
	readonly upstream:         Reference;
	readonly upstreamRevision: number;
	readonly since:            string;
}

export interface Lifecycle {
	readonly status:    Status;
	readonly revision:  Revision;
	readonly approval?: Approval | undefined;
	readonly review?:   Review | undefined;
	readonly signoffs:  readonly Signoff[];
	readonly stale?:    Staleness | undefined;
}

// ---------------------------------------------------------------------------
// sc6: tracker binding (owned by s6)
// ---------------------------------------------------------------------------

export interface TrackerBinding {
	readonly reference:         Reference;
	readonly createdAtRevision: number;
	readonly posted: readonly {
		readonly kind:         'milestone' | 'task-list' | 'design' | 'review' | 'plan';
		readonly at:           string;
		readonly externalId?:  string | undefined;
	}[];
	readonly pendingLink?: {
		readonly parent:    Reference;
		readonly child?:    Reference | undefined;
		readonly childId?:  number | undefined;
	} | undefined;
}

export interface Attachment {
	readonly target:      Reference;
	readonly revision:    number;
	readonly at:          string;
	readonly externalId?: string | undefined;
}

// ---------------------------------------------------------------------------
// sc8: repository schema version
// ---------------------------------------------------------------------------

export interface RepoSchema {
	readonly version:       number;
	readonly convertedAt?:  string | undefined;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** No head file exists for the id. */
export class ArtifactNotFoundError extends Error {
	constructor(message: string) { super(message); this.name = 'ArtifactNotFoundError'; }
}

/** A head is not valid JSON, has no meta and body objects, or fails its codec. */
export class ArtifactShapeError extends Error {
	constructor(message: string) { super(message); this.name = 'ArtifactShapeError'; }
}

/** No codec is registered for the id's kind. */
export class UnknownArtifactKindError extends Error {
	constructor(message: string) { super(message); this.name = 'UnknownArtifactKindError'; }
}

/** A change log or feedback entry fails validation. */
export class HistoryEntryError extends Error {
	constructor(message: string) { super(message); this.name = 'HistoryEntryError'; }
}

/** The sidecar reader failed or a line is not a SidecarRecord. */
export class HistoryReadError extends Error {
	constructor(message: string) { super(message); this.name = 'HistoryReadError'; }
}

/** The repository marker file is unreadable or invalid. */
export class RepoSchemaError extends Error {
	constructor(message: string) { super(message); this.name = 'RepoSchemaError'; }
}

// ---------------------------------------------------------------------------
// Lifecycle errors (sc4)
// ---------------------------------------------------------------------------

/** Why a head and its history cannot be trusted to agree. */
export type IntegrityReason = 'hash-mismatch' | 'head-ahead-of-log' | 'log-ahead-of-head' | 'head-changed-after-stage';

/** approve, review or complete was refused, or an ordinary write was refused, because the head conflicts with its own hash or log. */
export class LifecycleConflictError extends Error {
	constructor(readonly artifactId: string, readonly reason: IntegrityReason, message?: string) {
		super(message ?? `${artifactId} is in conflict (${reason}); a person has to resolve it before this can proceed`);
		this.name = 'LifecycleConflictError';
	}
}

/** The operation is not a step of the closed transition table from the current status, or its required detail is missing. */
export class IllegalTransitionError extends Error {
	constructor(message: string) { super(message); this.name = 'IllegalTransitionError'; }
}

/** A content change was written to a completed, withdrawn or superseded artifact. */
export class TerminalArtifactError extends Error {
	constructor(message: string) { super(message); this.name = 'TerminalArtifactError'; }
}

/** approve on a design artifact with no review bound to its current revision. */
export class ReviewRequiredError extends Error {
	constructor(message: string) { super(message); this.name = 'ReviewRequiredError'; }
}

/** A child head could not be read while rolling up a unit. */
export class UnreadableChildError extends Error {
	constructor(readonly unreadable: readonly string[], message?: string) {
		super(message ?? `cannot roll up: unreadable children ${unreadable.join(', ')}`);
		this.name = 'UnreadableChildError';
	}
}

// ---------------------------------------------------------------------------
// shared-reviewcontext-data-model Epic sc1/sc2/sc6 (Locator/Pointer/staleness/path-validation), owned by s1
// ---------------------------------------------------------------------------

/** Known Locator kinds; the set is open, not exhaustive -- a future kind is just a new string. */
export type LocatorKind = 'symbol' | 'lineRange' | 'docSection';

/** Pins an exact region within an authored file. `kind` is read structurally, never via exhaustive switch. */
export interface Locator {
	readonly kind:  LocatorKind | string;
	readonly value: string;
}

/** References an existing authored file directly; never a generated extract. */
export interface Pointer {
	readonly path:        string;
	readonly section?:    Locator | undefined;
	readonly contentHash?: string | undefined;
}

/** The outcome of comparing a Pointer's recorded contentHash against the referenced file's current content. */
export interface StalenessResult {
	readonly stale:     boolean;
	readonly checkedAt: string;
}

/** The outcome of checking a Pointer's path against the registered repo root. */
export interface PathValidationResult {
	readonly ok:         boolean;
	readonly violations: readonly string[];
}

// ---------------------------------------------------------------------------
// shared-reviewcontext-data-model Epic sc3 (Scope + its validator contract), owned by s2
// ---------------------------------------------------------------------------

export type ScopeType = 'design' | 'code';
export type ScopeLevel = 'def' | 'hld' | 'lld' | 'plan' | 'task';

/** Names which review family and chain depth a review attempt covers, self-inclusive at the artifact under review. */
export interface Scope {
	readonly scopeType:   ScopeType;
	readonly scopeLevel:  ScopeLevel;
	readonly def?:        Pointer | undefined;
	readonly hld?:        Pointer | undefined;
	readonly lld?:        Pointer | undefined;
	readonly plan?:       Pointer | undefined;
	readonly tasks?:      readonly Pointer[] | undefined;
	readonly extension?:  Pointer | undefined;
	readonly amendment?:  Pointer | undefined;
}

/** The outcome of a ScopeValidator checking a populated Scope against its own (scopeType, scopeLevel) pair. */
export interface ValidationResult {
	readonly ok:         boolean;
	readonly violations: readonly string[];
}

/**
 * `registeredRepoRoot` threads a real root to sc6's PointerPathValidator -- no fixed/synthetic
 * root can detect a '..'-escape soundly (a crafted path reusing that root's own last segment
 * resolves back inside it while still escaping the real repo).
 */
export type ScopeValidator = (scope: Scope, registeredRepoRoot: string) => ValidationResult;

/**
 * Which of Scope's named Pointer-typed fields must be populated (the self-inclusive chain up to
 * and including scopeLevel) and which must be absent (anything deeper), for one (scopeType,
 * scopeLevel) pair. Not exported: this shape is internal to this Story's validators and not part
 * of sc3's public contract, so src/workflow/artifact-core/scope-checks.ts declares its own
 * equivalent private type rather than importing this one.
 */
interface ScopeFieldRequirement {
	readonly required:     readonly (keyof Scope)[];
	readonly mustBeAbsent: readonly (keyof Scope)[];
}
