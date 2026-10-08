/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Render an `AnalyzeContextBundle` as compact markdown for MCP tool
 * responses.
 *
 * The bundle's seven layers each already contain markdown -- the
 * shaper prompts explicitly ask for headings + citation lines. So
 * this formatter's job is to:
 *   - Choose which layers to include (drop empty layers)
 *   - Add a stable top-level heading per layer
 *   - Prepend a meta-summary line (mode / shaper / toolCalls) so a
 *     downstream model can gauge the bundle's shape at a glance
 *   - Nothing more -- do NOT paraphrase, do NOT summarise, do NOT
 *     drop citation blocks. The bundle's discipline is the point.
 */

import { completenessHeadLine, isAnswerReport, renderCompletenessLine } from '../analyze/completeness.js';
import type { AnalyzeContextBundle, BundleLayerName } from '../analyze/context/types.js';

const LAYER_HEADINGS: Readonly<Record<BundleLayerName, string>> = {
	system:    '## System',
	focus:     '## Focus',
	summary:   '## Summary',
	structure: '## Structure',
	surface:   '## Surface',
	artefacts: '## Artefacts',
	upstream:  '## Upstream',
};

const LAYER_ORDER: readonly BundleLayerName[] = [
	'system', 'focus', 'summary', 'structure', 'surface', 'artefacts', 'upstream',
];

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface RenderBundleOpts {
	/** Which layers to include. Defaults to every non-empty layer. */
	readonly layers?: readonly BundleLayerName[];
	/** Whether to prefix the output with the meta-summary line.
	 *  Default: true. */
	readonly includeMeta?: boolean;
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export function renderBundleAsMarkdown(
	bundle: AnalyzeContextBundle,
	opts?:  RenderBundleOpts,
): string {
	const includeMeta = opts?.includeMeta ?? true;
	const requestedLayers = opts?.layers ?? LAYER_ORDER;

	const parts: string[] = [];
	// The completeness line is first, before anything a model wrote: an agent
	// or a person reads it before the findings. A bundle with no report (one
	// built before the report existed) says that completeness was not recorded.
	parts.push(completenessHeadLine(bundle.report, 'say-not-recorded')!);
	if (includeMeta) parts.push(renderMetaLine(bundle));

	for (const layer of requestedLayers) {
		const body = bundle[layer];
		if (typeof body !== 'string' || body.length === 0) continue;
		parts.push(`${LAYER_HEADINGS[layer]}\n\n${body.trim()}`);
	}

	return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Meta line
// ---------------------------------------------------------------------------

function renderMetaLine(bundle: AnalyzeContextBundle): string {
	if (bundle.meta === undefined) {
		return '<!-- insrc-analyze meta: (unset) -->';
	}
	const parts: string[] = [];
	parts.push(`shaper=${bundle.meta.shaper}`);
	parts.push(`mode=${bundle.meta.mode}`);
	parts.push(`toolCalls=${bundle.meta.toolCalls}`);
	parts.push(`model=${bundle.meta.modelId}`);
	if (bundle.meta.emptyLayers.length > 0) {
		parts.push(`emptyLayers=[${bundle.meta.emptyLayers.join(',')}]`);
	}
	if (bundle.meta.repoLastIndexedAt !== undefined) {
		parts.push(`repoIndexedAt=${new Date(bundle.meta.repoLastIndexedAt).toISOString()}`);
	}
	return `<!-- insrc-analyze meta: ${parts.join(' ')} -->`;
}

// ---------------------------------------------------------------------------
// A failed request
// ---------------------------------------------------------------------------

/**
 * The text the one-shot tool returns for a failed request.
 *
 * A failure that happened after the lookups ran carries the report derived
 * from them. Its completeness line is printed first, then the failed step's
 * reason where there is one, then the code and the message. Any other
 * failure prints its code and message, as before.
 */
export function renderAnalyzeFailure(error: {
	readonly code:    string;
	readonly message: string;
	readonly data?:   Readonly<Record<string, unknown>> | undefined;
}): string {
	const failure = `analyze.context.buildRun failed: ${error.code} -- ${error.message}`;
	const report = error.data?.['report'];
	if (!isAnswerReport(report)) return failure;
	const reason = error.data?.['reason'];
	return [
		renderCompletenessLine(report),
		...(typeof reason === 'string' ? [`The answer step failed: ${reason}.`] : []),
		failure,
	].join('\n\n');
}
