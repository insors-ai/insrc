/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Deliberately wrong: port.test.ts expects this file NOT to typecheck, proving
// the signature check bites. linkSubIssue must take a numeric child id.

import type { IssueOps, PortResult } from '../../port.js';

export const ops: Pick<IssueOps, 'linkSubIssue'> = {
	linkSubIssue: (_parent: string, childId: string): PortResult<void> => { void childId; return { ok: true, value: undefined }; },
};
