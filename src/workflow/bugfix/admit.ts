/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S004 — the pure advance gate. Enforces the HLD gate 'an approved+fresh
 * IssueArtifact AND a resolved ParentLocation before proceeding'. A pure
 * predicate over meta (mirroring the admitBuild admission pattern), no IO.
 */

import type { IssueArtifact } from '../artifacts/issue.js';
import type { AdmitResult } from './types.js';

/**
 * Whether a bugfix may proceed past its issue. `admitted=true` only when the
 * issue is approved AND its parentRef has been RESOLVED. Note: `parentRef ===
 * null` (standalone — no owner found) is a RESOLVED value and admits; only an
 * ABSENT parentRef (never stamped) withholds.
 */
export function admitBugfixAdvance(issue: IssueArtifact): AdmitResult {
	const approvedAt = issue.meta.approvedAt;
	if (typeof approvedAt !== 'string' || approvedAt.length === 0) {
		return { admitted: false, reason: 'issue is not approved (meta.approvedAt absent)' };
	}
	// exactOptionalPropertyTypes: an absent parentRef is `undefined`; a resolved
	// standalone is explicit `null`. Only `undefined` means "not yet located".
	if (issue.meta.parentRef === undefined) {
		return { admitted: false, reason: 'parent not resolved (meta.parentRef absent — run the locator first)' };
	}
	return { admitted: true };
}
