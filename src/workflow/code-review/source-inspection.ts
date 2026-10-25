/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Shared evidence policy for the two source-inspecting review dimensions. */
export const SOURCE_INSPECTION_RULES = [
	'Inspect the actual source before judging implementation; structured summaries and notes are navigation, not complete evidence.',
	'Use Read/Grep/Glob when available. In Codex use read-only commands such as rg, sed or git show in the repository working directory. Do not edit files, run tests, builds or mutating commands.',
	'Trace relevant helpers and inspect relevant test source when needed; a matching name alone proves nothing. Reading a test does not prove it passed.',
	'A finding with confidence "breach" requires source-demonstrated missing or incorrect behavior, including proven partial implementation. Cite the inspected file:line and explain the specific departure at an actual changed-code location.',
	'Absent summaries or notes never prove missing implementation. If source is missing, unreadable, inconsistent or insufficient, report only a LOW finding with confidence "observation" saying what could not be verified and why; never call that behavior unimplemented.',
	'Preserve source citations and uncertainty in evidence notes. If source changed or contradicts the supplied snapshot, identify what you inspected and report unresolved uncertainty instead of inferring absence.',
].join('\n');
