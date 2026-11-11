/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Render a template catalog into the prompt-ready Markdown block the
 * Plan Builder LLM consumes.
 *
 * Per design/analyze-plan-builder.md "Prompt structure":
 *   ## TASK CATALOG (emit task ids from here only)
 *   [catalog summary -- one entry per template:
 *     - id, target, family, description
 *     - inputSchema -- compact JSON Schema shape
 *     - produces -- output names + outputSchema shape
 *     - consumes -- output names it reads, if any]
 *
 * The catalog is the trailing structural reference per the project's
 * prompt convention (feedback_prompt_structure memory: schemas /
 * catalogs go at the tail).
 */

import type { AnalyzeScope, AnalyzeTaskTemplate } from '../../shared/analyze-types.js';
import { focusedLowerBound, SCOPE_BAND } from './scope-band.js';
import { slotLabel, type SlotPath } from './wire-schema.js';

/**
 * Render the catalog as a single Markdown block. The result is
 * intended for splicing into the user message of the Plan Builder
 * call. Given the planner's wire slots, each template also lists the
 * params paths it emits as JSON text (ISSUE-8d39ef09).
 */
export function renderCatalog(catalog: readonly AnalyzeTaskTemplate[], slots?: ReadonlyMap<string, readonly SlotPath[]> | undefined): string {
	if (catalog.length === 0) {
		return '_(no templates registered)_\n';
	}
	const sections = catalog.map(t => renderTemplate(t, slots?.get(t.id) ?? []));
	return sections.join('\n');
}

function renderTemplate(t: AnalyzeTaskTemplate, slots: readonly SlotPath[]): string {
	const head =
		`### \`${t.id}\`\n` +
		`- **target**: \`${t.target}\`\n` +
		`- **family**: \`${t.family}\`\n` +
		`- **kind**: \`${t.kind}\`\n` +
		(t.isAggregator === true ? `- **aggregator**: yes (must be last task in the plan; per INV-12)\n` : '');

	const desc = t.description !== undefined && t.description.length > 0
		? `- **description**: ${t.description}\n`
		: '';

	const inputSection = t.inputSchema !== undefined
		? '- **inputSchema**:\n```json\n' + JSON.stringify(t.inputSchema, null, 2) + '\n```\n'
		: '';

	const slotSection = slots.length > 0
		? `- **emit as JSON text**: ${slots.map(p => p.length === 0 ? '`params` (whole params is a slot)' : `\`${slotLabel(p)}\``).join(', ')}\n`
		: '';

	const producesSection = t.produces !== undefined
		? `- **produces**: ${t.produces.map(p => `\`${p}\``).join(', ')}\n`
		: '';

	const outputSection = t.outputSchema !== undefined
		? '- **outputSchema**:\n```json\n' + JSON.stringify(t.outputSchema, null, 2) + '\n```\n'
		: '';

	return [head, desc, inputSection, slotSection, producesSection, outputSection].join('');
}

/**
 * Render the per-scope depth-policy band reminder the prompt
 * includes between the catalog and the OUTPUT SHAPE block.
 *
 * The range printed is the range the validator enforces (INV-13), read from
 * the same table; it is stated once, as a final range with nothing left to
 * adjust, so the model does not apply a reduction of its own to it.
 */
export function renderDepthPolicy(scope: AnalyzeScope, focused: boolean): string {
	const lo = focused ? focusedLowerBound(scope) : SCOPE_BAND[scope].lo;
	const hi = SCOPE_BAND[scope].hi;
	const depthHint = scope === 'XS'
		? 'most detailed per-unit; the plan is small but each task drills deeply.'
		: scope === 'XL'
			? 'most structural; the plan is large + breadth-oriented + typically composed of planner-template tasks that spawn child plans.'
			: 'balanced. Pick a count near the middle of the band unless the focus genuinely needs more or less.';
	return (
		`scope: **${scope}**\n` +
		`expected task count: **${lo}-${hi}** (the final range: a plan with fewer than ${lo} or more than ${hi} tasks is rejected)\n` +
		`depth policy: ${depthHint}\n`
	);
}
