/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Classifier types -- inputs, outputs, options.
 *
 * The classifier consumes a raw user request + a starting scope ref
 * (whatever the user explicitly pointed at, or a workspace fallback)
 * and emits a typed `ClassifiedIntent` that the run-level shaper and
 * Plan Builder consume.
 *
 * See: design/analyze-framework.md "Flow / 2. Classify"
 *      design/analyze-context-builder.md "Invocation modes / classification"
 */

import type {
	AnalyzeScopeRef,
	ClassifiedIntent,
} from '../../shared/analyze-types.js';

/** Input to the classifier. */
export interface ClassifyInput {
	/** The raw user request. */
	readonly userPrompt: string;
	/**
	 * Starting scope reference. The classifier may refine this
	 * (e.g. promote a `workspace` hint to a more specific `repo` /
	 * `manifest-dir` / `connection` ref) but cannot invent a value
	 * the user didn't surface.
	 */
	readonly scopeRef: AnalyzeScopeRef;
}

/** Per-invocation options. Mirrors the shaper's ShapeOpts where it overlaps. */
export interface ClassifyOpts {
	readonly runId: string;
	/** Force-skip cache reads. Tests only. */
	readonly bypassCache?: boolean;
}

/** Re-export so consumers don't double-import. */
export type {
	AnalyzeScopeRef,
	AnalyzeScope,
	AnalyzeTarget,
	ClassifiedIntent,
} from '../../shared/analyze-types.js';

/**
 * Tagged-union response, mirroring the AnalyzeRpcResponse shape so
 * the daemon RPC layer can pass it through verbatim.
 */
export type ClassifyResponse =
	| { readonly ok: true;  readonly intent: ClassifiedIntent }
	| { readonly ok: false; readonly error: ClassifyErrorPayload };

export interface ClassifyErrorPayload {
	readonly code:    ClassifyErrorCode;
	readonly message: string;
	readonly data?:   Readonly<Record<string, unknown>>;
}

/**
 * Stable error codes the orchestrator + IDE dispatch on. New codes
 * land in lock-step with new typed classifier errors.
 */
export type ClassifyErrorCode =
	| 'invalid-input'
	| 'scope-ref-unresolved'
	| 'scope-ref-kind-target-mismatch'
	| 'classifier-llm-unavailable'
	| 'classifier-schema-unrecoverable'
	| 'classifier-validation-exhausted'
	| 'classifier-prompt-missing'
	| 'internal-error';
