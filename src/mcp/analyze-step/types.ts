/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Public input / output shapes for `insrc_analyze_step`. Kept in one
 * file so the tool description + docs + tests reference a single
 * authoritative surface.
 *
 * See docs/plans/mcp-multi-turn-analyze.md for the full protocol design.
 */

import type { ExecutedExploration, ExplorationPlan } from '../../analyze/explore/index.js';
import type { BundleMeta } from '../../analyze/context/types.js';
import type { AnswerReport } from '../../analyze/completeness.js';

// ---------------------------------------------------------------------------
// Input phases
// ---------------------------------------------------------------------------

export type StepPhase = 'start' | 'plan' | 'narrow' | 'bundle';

export interface StepInputStart {
	readonly phase:   'start';
	readonly focus:   string;
	readonly repo?:   string;
	readonly target?: 'code' | 'docs' | 'data' | 'infra' | 'generic';
	readonly scope?:  'XS' | 'S' | 'M' | 'L' | 'XL';
}

export interface StepInputPlan {
	readonly phase: 'plan';
	readonly plan:  ExplorationPlan;
	readonly state: string;
}

/**
 * Client-emitted narrow-LLM output. `narrow` is the raw structured
 * JSON your LLM produced against the schema returned in the prior
 * `emit_narrow` response. `explorationId` echoes the id from that
 * response so the server can defensively confirm we're finalising
 * the right exploration.
 */
export interface StepInputNarrow {
	readonly phase:         'narrow';
	readonly explorationId: string;
	readonly narrow:        Record<string, unknown>;
	readonly state:         string;
}

export interface StepInputBundle {
	readonly phase:  'bundle';
	readonly bundle: {
		readonly system:    string;
		readonly focus:     string;
		readonly summary:   string;
		readonly structure: string;
		readonly surface:   string;
		readonly artefacts: string;
		readonly upstream:  string;
	};
	readonly state: string;
}

export type StepInput =
	| StepInputStart
	| StepInputPlan
	| StepInputNarrow
	| StepInputBundle;

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

/** Server needs the client to emit an ExplorationPlan (only fires after `start`). */
export interface StepOutputEmitPlan {
	readonly next:     'emit_plan';
	readonly guidance: string;
	readonly prompt:   string;
	readonly userTurn: string;
	readonly schema:   Record<string, unknown>;
	readonly state:    string;
}

/**
 * Server pauses mid-plan because the next exploration is a narrow-
 * LLM step (doc.decision.trace / doc.constraint.enumerate /
 * capability.reuse-check) and we're routing its inner LLM call to the
 * outer client's model. The client emits the JSON matching `schema`
 * as its next reasoning turn and calls back with phase='narrow'.
 */
export interface StepOutputEmitNarrow {
	readonly next:            'emit_narrow';
	readonly guidance:        string;
	readonly prompt:          string;
	readonly userTurn:        string;
	readonly schema:          Record<string, unknown>;
	readonly state:           string;
	/** Which plan exploration this narrow output finalizes. Client
	 *  must echo it back in phase='narrow' so the server can
	 *  cross-check state coherence. */
	readonly explorationId:   string;
	readonly explorationType: string;
}

/** Server needs the client to emit an AnalyzeContextBundle (fires after `plan`). */
export interface StepOutputEmitBundle {
	readonly next:     'emit_bundle';
	readonly guidance: string;
	readonly prompt:   string;
	readonly userTurn: string;
	readonly schema:   Record<string, unknown>;
	readonly state:    string;
}

/** Terminal result. Fires either on `start` cache-hit or after `bundle`. */
export interface StepOutputDone {
	readonly next:     'done';
	readonly markdown: string;
	readonly meta:     BundleMeta;
	/** The answer report the tool derived from the lookups it executed. Absent only on the cached-bundle path. */
	readonly report?:  AnswerReport | undefined;
}

/** Retryable / non-retryable failure. */
export interface StepOutputError {
	readonly next:  'error';
	readonly error: {
		readonly code:      string;
		readonly message:   string;
		readonly retryable: boolean;
		/**
		 * Set by one error only: the answer prompt is missing after the lookups
		 * ran. It holds what they returned and the report derived from it, so the
		 * findings are not lost with the failure.
		 */
		readonly data?: StepErrorData | undefined;
	};
}

/** What the lookups found before a step failed. */
export interface StepErrorData {
	readonly results: readonly ExecutedExploration[];
	readonly report:  AnswerReport;
}

export type StepOutput =
	| StepOutputEmitPlan
	| StepOutputEmitNarrow
	| StepOutputEmitBundle
	| StepOutputDone
	| StepOutputError;

// ---------------------------------------------------------------------------
// Envelope: MCP tool responses expect { content: [...], isError? }.
// The step handler renders StepOutput as a JSON string in a text
// content block; the outer client parses it back.
// ---------------------------------------------------------------------------

export interface StepMcpEnvelope {
	readonly content:  { readonly type: 'text'; readonly text: string }[];
	readonly isError?: boolean;
	// MCP SDK's CallToolResult uses an index signature; keep the extra
	// property surface open so a `return handleAnalyzeStep(rawArgs)`
	// call type-checks against the SDK's ToolCallback signature.
	readonly [key: string]: unknown;
}
