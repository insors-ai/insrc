/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_analyze_step` phase='bundle' handler.
 *
 * The outer client just emitted an AnalyzeContextBundle JSON. We:
 *
 * 1. Decode + stage-check the state blob.
 * 2. Defensively re-validate the bundle against the stripped bundle
 *    schema (via finalizeSynthesize).
 * 3. Stamp meta from framework-side info (mode, shaper, toolCalls,
 *    emptyLayers, schemaVersion, repoLastIndexedAt).
 * 4. Render as markdown for the client's response.
 * 5. Return done.
 *
 * Phase A does NOT write to the one-shot bundle cache. Phase B may
 * add a step-specific cache path so repeat runs skip the whole
 * loop; see plans/mcp-multi-turn-analyze.md for the rationale.
 */

import {
	finalizeSynthesize,
	SynthesizerSchemaUnrecoverable,
} from '../../../analyze/context/synthesizer.js';
import { SCHEMA_VERSION } from '../../../analyze/context/schema.js';
import { getLogger } from '../../../shared/logger.js';

import { renderBundleAsMarkdown } from '../../bundle-md.js';
import {
	assertStage,
	decodeState,
	StepStateDecodeError,
	type StepStatePayload,
} from '../state.js';
import { releaseState } from '../state-store.js';
import type {
	StepInputBundle,
	StepOutputDone,
	StepOutputError,
} from '../types.js';
import type {
	AnalyzeContextBundle,
	BundleLayerName,
	BundleMeta,
	ShaperId,
} from '../../../analyze/context/types.js';

const log = getLogger('mcp:analyze-step:bundle');

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function handleBundle(
	input: StepInputBundle,
): Promise<StepOutputDone | StepOutputError> {
	// (1) Decode + stage-check.
	let state: StepStatePayload;
	try {
		state = decodeState(input.state);
		assertStage(state, 'awaiting_bundle');
	} catch (err) {
		if (err instanceof StepStateDecodeError) {
			return errorResult('state-decode', err.message, err.code !== 'malformed');
		}
		throw err;
	}

	// (2) Validate the bundle layers.
	let layers: Omit<AnalyzeContextBundle, 'meta'>;
	try {
		layers = finalizeSynthesize(input.bundle);
	} catch (err) {
		if (err instanceof SynthesizerSchemaUnrecoverable) {
			return errorResult(
				'bundle-schema',
				`emitted bundle failed schema validation: ${err.message}. ` +
				`Re-emit a bundle matching the schema in the prior tool response.`,
				true,
			);
		}
		throw err;
	}

	// (3) Stamp meta. toolCalls counts the deterministic + narrow-LLM
	// steps the server actually executed on the client's behalf.
	// modelId='client' captures that the outer LLM authored the
	// bundle content.
	const meta: BundleMeta = {
		mode:          'run',
		shaper:        deriveShaperId(state.intent.target),
		toolCalls:     state.executed?.results.length ?? 0,
		modelId:       'client',
		emptyLayers:   deriveEmptyLayers(layers),
		schemaVersion: SCHEMA_VERSION,
		...(state.repoIndexedAt !== null
			? { repoLastIndexedAt: state.repoIndexedAt }
			: {}),
	};
	const bundle: AnalyzeContextBundle = { ...layers, meta };

	// (4) Render.
	const markdown = renderBundleAsMarkdown(bundle);

	log.info(
		{
			runId:            state.runId,
			target:           state.intent.target,
			explorationCount: state.executed?.results.length ?? 0,
			summaryLen:       layers.summary.length,
			structureLen:     layers.structure.length,
			artefactsLen:     layers.artefacts.length,
		},
		'insrc_analyze_step[bundle]: run complete',
	);

	// Run completed -- drop the state entry so a busy MCP subprocess
	// doesn't accumulate finished-run payloads.
	releaseState(input.state);

	return {
		next:     'done',
		markdown,
		meta,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResult(code: string, message: string, retryable: boolean): StepOutputError {
	return {
		next:  'error',
		error: { code, message, retryable },
	};
}

function deriveShaperId(target: string): ShaperId {
	if (target === 'code' || target === 'docs'
	 || target === 'data' || target === 'infra'
	 || target === 'generic') {
		return target;
	}
	return 'generic';
}

function deriveEmptyLayers(layers: Omit<AnalyzeContextBundle, 'meta'>): BundleLayerName[] {
	const out: BundleLayerName[] = [];
	const keys: BundleLayerName[] = [
		'system', 'focus', 'summary', 'structure',
		'surface', 'artefacts', 'upstream',
	];
	for (const k of keys) {
		if (layers[k] === undefined || layers[k].length === 0) out.push(k);
	}
	return out;
}
