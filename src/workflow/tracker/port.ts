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

import type { Reference } from '../artifact-core/types.js';
import type { UnitRef } from './refs.js';

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

/**
 * What a signoff request asks to be signed off and where it is linked (AMD-315d510cb28100e2-16): the stage unit, each artifact
 * with the revision it covers and its committed path, the branch that holds them, and the issue the request is linked from.
 */
export interface SignoffRequestSpec {
	readonly title:     string;
	readonly body:      string;
	readonly unit:      UnitRef;
	readonly artifacts: ReadonlyArray<{ readonly artifactId: string; readonly revision: number; readonly path: string }>;
	readonly branch:    string;
	readonly issue:     IssueRef;
}

/** An opened signoff request: its `ref` (a GitHub pull request is `owner/repo#N`) and, when the tracker has one, its url (AMD-315d510cb28100e2-16). */
export interface SignoffRequestRef {
	readonly ref: string;
	readonly url?: string | undefined;
}

/** Grouped issue operations over the existing gh wrappers, bound to one owner and repo (AMD-8). */
export interface IssueOps {
	create(spec: IssueSpec): PortResult<CreatedIssue>;
	linkSubIssue(parent: IssueRef, childId: number): PortResult<void>;
	/** The tracker's numeric id of an issue, the `childId` linkSubIssue needs (AMD-315d510cb28100e2-11). Reads only. */
	resolveIssueId(ref: IssueRef): PortResult<number>;
	close(issue: IssueRef): PortResult<void>;
	comment(issue: IssueRef, body: string): PortResult<void>;
	readBody(issue: IssueRef): PortResult<string>;
	writeBody(issue: IssueRef, body: string): PortResult<void>;
	ensureLabel(name: string): boolean;
	ensureMilestone(title: string): void;
	attachMilestone(issue: IssueRef, title: string): PortResult<void>;
}

/** One comment of an issue, as `listComments` reads it. */
export interface TrackerComment {
	readonly externalId: string;
	readonly author:     string;
	readonly text:       string;
	/** ISO time the comment was created. */
	readonly at:         string;
	readonly url?:       string | undefined;
}

export interface TrackerPort {
	readonly kind: TrackerKind;
	readonly capabilities: ReadonlySet<Capability>;
	readonly issueOps: IssueOps;
	/** The signed-in user's login. */
	whoAmI(): PortResult<string>;
	readAssignee(issue: IssueRef): PortResult<string | null>;
	setAssignee(issue: IssueRef, who: string | null): PortResult<void>;
	/** Adds `who` to the assignees without removing anyone, then returns the assignees read back (AMD-315d510cb28100e2-12). A claim uses it so it never removes another claimant. */
	addAssignee(issue: IssueRef, who: string): PortResult<string[]>;
	createIssue(spec: IssueSpec): PortResult<IssueRef>;
	findIssue(labels: string[]): PortResult<IssueRef | null>;
	/** Every issue, open or closed, carrying all the labels, complete across pages, in ascending issue-number order (AMD-315d510cb28100e2-10). */
	findIssues(labels: string[]): PortResult<IssueRef[]>;
	/** Every issue, open or closed, whose title is exactly the artifact-id `token` or starts with it followed by an em dash and a space ({@link titleMatchesToken}), complete across pages, in ascending issue-number order. A failed lookup is a failed result, never an empty list (AMD-2f27754d4ad00b8e-6). */
	findIssuesByTitleToken(token: string): PortResult<IssueRef[]>;
	/** Every comment of the issue, in ascending time order and complete across pages; with `since` (ISO time), only those created or updated at or after it. A failed read is a failure, never an empty list (s6). */
	listComments(issue: IssueRef, since?: string): PortResult<TrackerComment[]>;
	/** Post one comment on the issue and answer its id, so a caller can record the post (s8). {@link IssueOps.comment} answers nothing and is unchanged. */
	postComment(issue: IssueRef, body: string): PortResult<{ externalId: string }>;
	/** Make `artifact`'s file reachable from the issue through `link`. A tracker without an attachment API (GitHub) posts one comment holding the link; `externalId` is that comment's id (s6). */
	attach(issue: IssueRef, artifact: Reference, link: string): PortResult<{ externalId?: string }>;
	openSignoffRequest(spec: SignoffRequestSpec): PortResult<SignoffRequestRef>;
	/** With `since` (ISO time), only a request for changes made after it counts, so one made on an earlier push does not hold a resubmission (s8). */
	readSignoffState(ref: SignoffRequestRef, since?: string): PortResult<'open' | 'changes-requested' | 'completed'>;
	/** The branch a signoff request was opened from and whether it can still take a push. A tracker without it cannot resubmit to a request (s8). */
	readSignoffRequest?(ref: SignoffRequestRef): PortResult<{ branch: string; open: boolean }>;
}

/** Whether an issue title names the artifact id `token`: the title is the token, or the token then ` — ` and a
 *  title. A longer id that merely starts with the token (`STORY-<h>-s10` for `STORY-<h>-s1`) does not match. */
export function titleMatchesToken(title: string, token: string): boolean {
	return token.length > 0 && (title === token || title.startsWith(`${token} \u2014 `));
}

export type LoadTracker = (repo: string, needed: ReadonlySet<Capability>) => PortResult<TrackerPort>;

const ALL_CAPABILITIES: readonly Capability[] = ['claim', 'issue-create', 'signoff-request', 'completion'];

/** The capabilities in `needed` that `declared` does not contain, in a fixed order. */
export function missingCapabilities(declared: ReadonlySet<Capability>, needed: ReadonlySet<Capability>): Capability[] {
	return ALL_CAPABILITIES.filter(c => needed.has(c) && !declared.has(c));
}
