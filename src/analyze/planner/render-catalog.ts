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

import type { AnalyzeTaskTemplate } from '../../shared/analyze-types.js';

/**
 * Render the catalog as a single Markdown block. The result is
 * intended for splicing into the user message of the Plan Builder
 * call.
 */
export function renderCatalog(catalog: readonly AnalyzeTaskTemplate[]): string {
	if (catalog.length === 0) {
		return '_(no templates registered)_\n';
	}
	const sections = catalog.map(renderTemplate);
	return sections.join('\n');
}

function renderTemplate(t: AnalyzeTaskTemplate): string {
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

	const producesSection = t.produces !== undefined
		? `- **produces**: ${t.produces.map(p => `\`${p}\``).join(', ')}\n`
		: '';

	const outputSection = t.outputSchema !== undefined
		? '- **outputSchema**:\n```json\n' + JSON.stringify(t.outputSchema, null, 2) + '\n```\n'
		: '';

	return [head, desc, inputSection, producesSection, outputSection].join('');
}

/**
 * Render the per-scope depth-policy band reminder the prompt
 * includes between the catalog and the OUTPUT SHAPE block.
 *
 * Mirrors SCOPE_BAND from validate.ts; importing that constant
 * would create a cycle (validate.ts -> ... -> driver.ts ->
 * render-catalog.ts), so we duplicate the small lookup here.
 */
export function renderDepthPolicy(scope: 'XS' | 'S' | 'M' | 'L' | 'XL', focused: boolean): string {
	const BAND: Readonly<Record<string, { lo: number; hi: number }>> = {
		XS: { lo: 3,  hi: 8  },
		S:  { lo: 10, hi: 20 },
		M:  { lo: 20, hi: 40 },
		L:  { lo: 30, hi: 60 },
		XL: { lo: 40, hi: 80 },
	};
	const band = BAND[scope]!;
	const lo = focused ? Math.floor(band.lo / 2) : band.lo;
	const depthHint = scope === 'XS'
		? 'most detailed per-unit; the plan is small but each task drills deeply.'
		: scope === 'XL'
			? 'most structural; the plan is large + breadth-oriented + typically composed of planner-template tasks that spawn child plans.'
			: 'balanced. Pick a count near the middle of the band unless the focus genuinely needs more or less.';
	return (
		`scope: **${scope}**\n` +
		`expected task count: **${lo}-${band.hi}**${focused ? ' (focused intent reduces the lower bound to half)' : ''}\n` +
		`depth policy: ${depthHint}\n`
	);
}
