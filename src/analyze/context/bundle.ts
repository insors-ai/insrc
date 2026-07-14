/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Bundle assembler -- renders an AnalyzeContextBundle into prompt
 * Markdown in the fixed render order with the contract footer pinned
 * at the tail.
 *
 * Render order:
 *   system -> focus -> summary -> structure -> surface -> artefacts
 *   -> upstream -> CONTRACT_FOOTER_MD
 *
 * The `system` layer is rendered without a heading (it is the role
 * intro, the lead paragraph of the prompt). Every other layer is
 * prefixed with `## <Label>`.
 *
 * Empty-layer omission honors a dual signal: a layer is omitted
 * when its body is the empty string OR when its name is listed in
 * `bundle.meta.emptyLayers`. Either signal is sufficient; the
 * shaper driver typically writes both.
 *
 * `## Contract reminder` always closes the rendered Markdown so the
 * LLM's attention (recency-weighted) lands on the citation contract
 * last. The reminder string itself is single-sourced in
 * analyze/contract.ts -- editing it affects shaper + planner both.
 *
 * See: design/analyze-context-builder.md "The bundle"
 *      plans/analyze-context-builder.md Phase 1
 */

import { CONTRACT_FOOTER_MD } from '../contract.js';
import type {
	AnalyzeContextBundle,
	BundleLayerName,
} from './types.js';

/** Render order. Drives both the assembled Markdown and any caller
 *  that needs to walk layers deterministically. */
export const RENDER_ORDER: readonly BundleLayerName[] = Object.freeze([
	'system',
	'focus',
	'summary',
	'structure',
	'surface',
	'artefacts',
	'upstream',
]);

/** Display labels for each layer (used in headings). The `system`
 *  layer is rendered without a heading; its label is here for
 *  symmetry but never used. */
export const LAYER_LABELS: Readonly<Record<BundleLayerName, string>> = Object.freeze({
	system:    'System',
	focus:     'Focus',
	summary:   'Summary',
	structure: 'Structure',
	surface:   'Surface',
	artefacts: 'Artefacts',
	upstream:  'Upstream',
});

/**
 * Render `body` under a `## <label>` heading, with a blank line above
 * and below the heading and a trailing blank line after the body.
 *
 * Returns the empty string if `body` is empty (or whitespace-only)
 * so callers can blindly concatenate without orphan headings.
 */
export function omitEmpty(label: string, body: string): string {
	if (body.trim().length === 0) {
		return '';
	}
	return `## ${label}\n\n${body.trim()}\n`;
}

/**
 * Assemble the bundle's layers into prompt-ready Markdown in the
 * fixed render order, omitting empty layers (by body OR by
 * meta.emptyLayers membership), and appending the contract reminder.
 *
 * The output is deterministic for a given bundle -- bundle assembly
 * is a pure function. Callers that need to embed the assembled
 * Markdown into a prompt template just splice the returned string in.
 */
export function assembleMarkdown(bundle: AnalyzeContextBundle): string {
	const emptyLayers = new Set<BundleLayerName>(bundle.meta?.emptyLayers ?? []);
	const sections: string[] = [];

	for (const layer of RENDER_ORDER) {
		const body = bundle[layer];

		if (emptyLayers.has(layer) || body.trim().length === 0) {
			continue;
		}

		if (layer === 'system') {
			sections.push(body.trim());
			continue;
		}

		sections.push(omitEmpty(LAYER_LABELS[layer], body));
	}

	sections.push(CONTRACT_FOOTER_MD);

	return sections.join('\n\n');
}
