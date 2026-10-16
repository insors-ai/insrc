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

/**
 * Shared prompt fragments: prefer the smallest complete change.
 *
 * Adapted from Ponytail (https://github.com/DietrichGebert/ponytail, MIT, Copyright (c) 2026
 * DietrichGebert): its ladder of "take the first option that fully works". The wording is ours;
 * the "already in this codebase" rung asks the insrc analyzer instead of a repo map, and the
 * limits are insrc's own (the spec wins, the named tests stay required). The credit and the
 * licence text are also in THIRD_PARTY_NOTICES.md at the repository root.
 *
 * Defined ONCE and interpolated at every prompt site, like ANTI_OVERREACH_RULE.
 */

/** Build side: placed in the implement prompts as the section "The smallest complete change". */
export const SMALLEST_CHANGE_RULE: string = [
	'Before you write code, take the first option that fully works:',
	'',
	'1. Does it need to exist at all? Leave out features, options and flexibility nobody asked for, and say in one line what you left out.',
	'2. Is it already in this codebase (a helper, a component, a pattern)? Ask the insrc analyzer, `insrc_analyze_step`, "does the codebase already do X?" before you write one, and use what exists the way the surrounding code does. If it returns nothing, search and read the code yourself.',
	'3. Does the standard library or a platform feature do it? Use it, unless the project has its own.',
	'4. Does an installed dependency do it? Use it. Never add a dependency for a few lines.',
	'5. Can it be one line a reader gets at a glance? Then write one line.',
	'6. Otherwise write the minimum code that works.',
	'',
	'Be lazy about the solution, never about the change: finish every part the work needs, including the callers and tests it breaks.',
	'',
	'The limits: the Task (or the LLD) is the spec, so build everything it asks for, and the tests it names are still required. ' +
		'Never cut validation at trust boundaries, error handling that prevents data loss, security or accessibility. ' +
		'In your report, say what you deliberately left out or did not check.',
].join('\n');

/** Design side: two HARD RULES for the alternatives step, before ANTI_OVERREACH_RULE. */
export const SMALLEST_SHAPE_RULE: string = [
	'- Prefer shapes that reuse what the codebase already has: ask the insrc analyzer (`insrc_analyze_step`) whether it already does what an alternative would add. Make at least one alternative the smallest that fully meets the Story, and add no option, abstraction or flexibility nobody asked for.',
	'- Small is not an excuse to drop validation at trust boundaries, error handling that prevents data loss, security or accessibility, and larger alternatives the Story really needs stay on the list.',
].join('\n');

/**
 * Shared prompt fragment: how a file reference is written.
 *
 * The chat plugin's clickable code references resolve only from the workspace root, so a shortened
 * path, or prose inside the same code span, silently does nothing. `checkPathForms` in
 * `../synthesizer.ts` enforces the shape of what this rule describes.
 *
 * Defined ONCE and used at every prompt site and in the descriptions of the path-valued schema fields.
 */
export const PATH_FORM_RULE: string =
	'- [HARD] WRITE FILE REFERENCES IN ONE FORM. A file inside the project is written relative to the project root ' +
	'(`src/workflow/synthesizer.ts`), optionally followed by `:N`, `:N-M` or `:N:C` and, for a doc, `#anchor`: never shortened ' +
	'(not `synthesizer.ts` or `workflow/synthesizer.ts`), never with `./` or `..`, and never with a note or any other prose in the same ' +
	'code span or string. A file outside the project is written with its full path (absolute path or URL). ' +
	'A path you copy from a step output that is not in this form is written in this form, not copied as it is.';
