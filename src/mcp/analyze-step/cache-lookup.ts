/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cache-lookup helper for the multi-turn `insrc_analyze_step` tool.
 *
 * The one-shot bundle cache (`analyze/context/cache.ts`) is keyed by
 * (runId, computeCacheKey(promptContent, inputs)). Multi-turn runs
 * don't share the one-shot cache line because the runId is unique
 * per multi-turn invocation and the "prompt content" seen by the
 * client differs from what the in-process pipeline sends to Ollama.
 *
 * For Phase A we do NOT read from the one-shot cache -- a `start`
 * phase call always emits `emit_plan` and lets the client walk the
 * loop. Phase B will add a step-specific cache keyed by
 * (repoPath, repoIndexedAt, intent hash). This helper exists so the
 * `start` handler can call it without a compile error; today it
 * always returns null.
 *
 * Leaving the cache path stubbed keeps Phase A shippable: no bundle
 * cache dedupe, no observable staleness bugs, no interaction with
 * the one-shot cache.
 */

import type { AnalyzeContextBundle } from '../../analyze/context/types.js';
import type { ClassifiedIntent } from '../../shared/analyze-types.js';

export interface StepCacheLookupArgs {
	readonly repoPath:       string;
	readonly intent:         ClassifiedIntent;
	readonly repoIndexedAt?: number;
}

/**
 * Phase A: no cache. Return null. Structural docstring above
 * explains why.
 */
export function readBundleForStep(_args: StepCacheLookupArgs): AnalyzeContextBundle | null {
	return null;
}
