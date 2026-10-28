/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Compile-time fixture: typechecked by port.test.ts. It only compiles when
// IssueOps and TrackerPort carry the AMD-8 signatures.

import type { CreatedIssue, IssueOps, IssueRef, PortResult, TrackerPort } from '../../port.js';

const ref: IssueRef = 'o/r#1';
const created: CreatedIssue = { ref, id: 1, typed: true };
const ok = async <T>(value: T): Promise<PortResult<T>> => ({ ok: true, value });

export const ops: IssueOps = {
	create: spec => { const labels: readonly string[] = spec.labels; void labels; return ok(created); },
	linkSubIssue: (parent: IssueRef, childId: number) => { void parent; void childId; return ok(undefined); },
	resolveIssueId: (ref: IssueRef) => { void ref; return ok(42); },
	close: (issue: IssueRef) => { void issue; return ok(undefined); },
	comment: (issue: IssueRef, body: string) => { void issue; void body; return ok(undefined); },
	readBody: (issue: IssueRef) => { void issue; return ok(''); },
	writeBody: (issue: IssueRef, body: string) => { void issue; void body; return ok(undefined); },
	ensureLabel: async (name: string): Promise<boolean> => name.length > 0,
	ensureMilestone: async (title: string): Promise<void> => { void title; },
	attachMilestone: (issue: IssueRef, title: string) => { void issue; void title; return ok(undefined); },
};

export const port: Pick<TrackerPort, 'issueOps'> = { issueOps: ops };

// The numeric child id is the only accepted shape.
export const link: Promise<PortResult<void>> = port.issueOps.linkSubIssue(ref, 42);
