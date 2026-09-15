/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared prompt fragment: the anti-overreach HARD RULE.
 *
 * The `design.story` (LLD) and `plan` workflows each see ONLY the current
 * Story's slice of the HLD. Without knowing the larger scope, the authoring
 * LLM extends past its boundary — re-designing work another Story already owns.
 *
 * The `HldContextSlice.adjacentBoundaries` field surfaces the sibling
 * boundaries (every OTHER Story's owned scope). This rule tells the LLM what to
 * DO with them: stay inside its own boundary, consume adjacent contracts rather
 * than re-design them, and expand ONLY into genuinely-uncovered capability —
 * and even then flag it, never silently build another Story's job.
 *
 * Defined ONCE and interpolated at every prompt site so the wording cannot
 * drift between steps.
 */
export const ANTI_OVERREACH_RULE: string =
	'- [HARD] STAY IN SCOPE. `hldContextSlice.adjacentBoundaries` lists the scope OTHER stories own, ' +
	'and every shared contract has a declared owner. Scope owned by an adjacent boundary — or by a ' +
	'shared contract you do not own — is OUT OF SCOPE here: CONSUME that contract, never re-design or ' +
	're-implement it. Only if a capability you genuinely need is uncovered by YOUR boundary, EVERY ' +
	'adjacent boundary, AND every shared contract may you expand to cover it — and even then flag it as ' +
	'an `openQuestion` (or an HLD back-flow / amendment), never a silent build that steps on another story.';
