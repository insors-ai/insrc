/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tracker port (sc1) — the only way the workflow library talks to a tracker.
 *
 * Types only, plus the pure capability check. The GitHub adapter and the
 * strict `loadTracker` loader build on these.
 */

/** An issue reference, `owner/repo#N`, as everywhere else in the tracker code. */
export type IssueRef = string;

export type TrackerKind = string;

export type Capability = 'claim' | 'issue-create' | 'signoff-request' | 'completion';

export type PortFailureKind = 'missing-tool' | 'missing-signin' | 'unreachable' | 'rejected';

export type PortResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly reason: string; readonly kind: PortFailureKind };

export interface IssueSpec {
	readonly title: string;
	readonly body: string;
	readonly labels: readonly string[];
	readonly issueType?: string | undefined;
	/** Parent issue to link this one under as a sub-issue. */
	readonly parent?: IssueRef | undefined;
}

/** The created issue: `ref`, the REST database `id` (sub-issue linking needs it)
 *  and whether the native issue type was applied. */
export interface CreatedIssue {
	readonly ref:   IssueRef;
	readonly id:    number;
	readonly typed: boolean;
}

/** Minimal placeholder; s7 extends it by amendment. */
export interface SignoffRequestSpec {
	readonly title: string;
	readonly body: string;
}

/** Minimal placeholder; s7 extends it by amendment. */
export interface SignoffRequestRef {
	readonly ref: string;
}

/** Grouped issue operations over the existing gh wrappers, bound to one owner and repo (AMD-8). */
export interface IssueOps {
	create(spec: IssueSpec): PortResult<CreatedIssue>;
	linkSubIssue(parent: IssueRef, childId: number): PortResult<void>;
	close(issue: IssueRef): PortResult<void>;
	comment(issue: IssueRef, body: string): PortResult<void>;
	readBody(issue: IssueRef): PortResult<string>;
	writeBody(issue: IssueRef, body: string): PortResult<void>;
	ensureLabel(name: string): boolean;
	ensureMilestone(title: string): void;
	attachMilestone(issue: IssueRef, title: string): PortResult<void>;
}

export interface TrackerPort {
	readonly kind: TrackerKind;
	readonly capabilities: ReadonlySet<Capability>;
	readonly issueOps: IssueOps;
	/** The signed-in user's login. */
	whoAmI(): PortResult<string>;
	readAssignee(issue: IssueRef): PortResult<string | null>;
	setAssignee(issue: IssueRef, who: string | null): PortResult<void>;
	createIssue(spec: IssueSpec): PortResult<IssueRef>;
	findIssue(labels: string[]): PortResult<IssueRef | null>;
	openSignoffRequest(spec: SignoffRequestSpec): PortResult<SignoffRequestRef>;
	readSignoffState(ref: SignoffRequestRef): PortResult<'open' | 'changes-requested' | 'completed'>;
}

export type LoadTracker = (repo: string, needed: ReadonlySet<Capability>) => PortResult<TrackerPort>;

const ALL_CAPABILITIES: readonly Capability[] = ['claim', 'issue-create', 'signoff-request', 'completion'];

/** The capabilities in `needed` that `declared` does not contain, in a fixed order. */
export function missingCapabilities(declared: ReadonlySet<Capability>, needed: ReadonlySet<Capability>): Capability[] {
	return ALL_CAPABILITIES.filter(c => needed.has(c) && !declared.has(c));
}
