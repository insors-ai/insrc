/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S004 — public surface of the scope-gated bugfix orchestration. Composes sc1
 * (route table), sc2 (approved IssueArtifact) and sc3 (parent-locator); owns no
 * new shared type. Completion reuses the existing approveWorkflowTarget gate.
 */

export * from './types.js';
export { nextAfterIssue } from './next-after-issue.js';
export { admitBugfixAdvance } from './admit.js';
export { locateAndStampParent, defaultStampDeps } from './stamp.js';
export { advanceBugfixAfterIssue } from './advance.js';
