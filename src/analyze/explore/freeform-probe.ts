/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * freeform.probe exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 6. The escape hatch:
 * when an intent falls outside every deterministic recipe, the
 * decomposer emits ONE `freeform.probe` step. The runner invokes the
 * target's legacy tool-loop shaper (`runShaperToolLoop`) bounded by
 * `cfg.shaper.maxToolTurns` and returns the resulting bundle layers
 * verbatim.
 *
 * The scope-boundary HARD RULE stays in force: the legacy target
 * prompts already carry it (feedback_shaper_scope_boundary in the
 * user's project memory), and this runner reuses those prompts as-is
 * so the rule doesn't get bypassed just because the tool loop now
 * fires as an exploration step instead of the shaper's tail.
 *
 * Not-yet-implemented cases (unknown shaperId, ToolLoopExhausted,
 * SchemaUnrecoverable) surface via a `failed` output the executor
 * emits -- the runner throws and the outer loop classifies.
 */

import { legacyShaperPromptPathFor } from '../context/index.js';
import type { RunShapeInput } from '../context/types.js';
import { runShaperToolLoop, ShaperToolLoopExhausted } from '../context/driver.js';
import { getLogger } from '../../shared/logger.js';

import type {
	Exploration,
	ExplorationRunnerContext,
	FreeformProbeOutput,
} from './types.js';

const log = getLogger('analyze:explore:freeform-probe');

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface FreeformProbeParams {
	readonly purpose: string;
	readonly shaperId: FreeformProbeOutput['shaperId'];
}

const VALID_SHAPER_IDS: readonly FreeformProbeOutput['shaperId'][] = [
	'code', 'docs', 'data', 'infra', 'generic',
];

function parseParams(exp: Exploration): FreeformProbeParams {
	const p = exp.params as Record<string, unknown>;
	const purpose = typeof p['purpose'] === 'string' ? (p['purpose'] as string).trim() : '';
	if (purpose.length === 0) {
		throw new Error('freeform.probe: params.purpose is required (non-empty string)');
	}
	const shaperIdRaw = typeof p['shaperId'] === 'string' ? (p['shaperId'] as string).trim() : '';
	if (!VALID_SHAPER_IDS.includes(shaperIdRaw as FreeformProbeOutput['shaperId'])) {
		throw new Error(
			`freeform.probe: params.shaperId must be one of [${VALID_SHAPER_IDS.join(', ')}]`,
		);
	}
	return { purpose, shaperId: shaperIdRaw as FreeformProbeOutput['shaperId'] };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * The exploration executor doesn't hand the runner the calling
 * intent -- runners get an `ExplorationRunnerContext` with the
 * repo path + closure + `readDep` for dependent outputs. For
 * freeform.probe we need the full `RunShapeInput` (intent) so the
 * legacy tool loop's `buildMessages` has the same input shape it
 * always did. We rebuild a minimal `RunShapeInput` from the params
 * -- the decomposer is required to seed `purpose` with the intent's
 * focus so the tool loop knows what it's answering.
 */
export async function runFreeformProbe(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<FreeformProbeOutput> {
	const params = parseParams(exp);
	const promptPath = legacyShaperPromptPathFor(params.shaperId);

	// Reconstruct a run-mode input. The tool loop's buildMessages
	// carries the intent verbatim; we use the runner context's repo
	// path as the scope reference target so the legacy prompt's
	// scope-boundary rule keys off the correct closure.
	const inputs: RunShapeInput = {
		intent: {
			target:    params.shaperId === 'generic' ? 'generic'
				: params.shaperId === 'code'   ? 'code'
				: params.shaperId === 'docs'   ? 'docs'
				: params.shaperId === 'data'   ? 'data'
				: 'infra',
			scope:    'M',
			focused:  true,
			focus:    params.purpose,
			scopeRef: { kind: 'workspace', value: ctx.repoPath },
			reasoning:
				'freeform.probe escape-hatch: intent fell outside every ' +
				'deterministic recipe; the decomposer emitted a single ' +
				'freeform.probe so the target\'s legacy tool loop can ' +
				'answer with its full read-only tool surface.',
		},
	};

	let rawBundle: Awaited<ReturnType<typeof runShaperToolLoop>>['rawBundle'];
	let toolCallCount = 0;
	let exhaustedNote = '';
	try {
		const result = await runShaperToolLoop({
			runId:          ctx.runId,
			shaperId:       params.shaperId,
			invocationMode: 'run',
			inputs,
			promptPath,
		});
		rawBundle     = result.rawBundle;
		toolCallCount = result.toolCallCount;
	} catch (err) {
		if (err instanceof ShaperToolLoopExhausted) {
			// Exhausted -> emit an honest empty bundle + note. The
			// synthesizer will surface the note in Diagnostics.
			log.warn(
				{ runId: ctx.runId, purpose: params.purpose, shaperId: params.shaperId },
				'freeform.probe: tool-loop exhausted',
			);
			return {
				type:      'freeform.probe',
				purpose:   params.purpose,
				shaperId:  params.shaperId,
				rawBundle: emptyRawBundle(),
				toolCallCount: 0,
				exhaustedNote:
					`Tool loop exhausted its maxTurns cap without settling on a bundle; ` +
					`the reader should refine the intent or request a specific recipe.`,
			};
		}
		// Anything else (LLM unavailable, schema unrecoverable, ...) --
		// bubble so the executor catches + emits a `failed` output.
		throw err;
	}

	log.info(
		{
			runId:         ctx.runId,
			purpose:       params.purpose,
			shaperId:      params.shaperId,
			toolCallCount,
		},
		'freeform.probe: complete',
	);

	return {
		type:      'freeform.probe',
		purpose:   params.purpose,
		shaperId:  params.shaperId,
		rawBundle,
		toolCallCount,
		exhaustedNote,
	};
}

function emptyRawBundle(): FreeformProbeOutput['rawBundle'] {
	return {
		system:    '',
		focus:     '',
		summary:   '',
		structure: '',
		surface:   '',
		artefacts: '',
		upstream:  '',
	};
}
