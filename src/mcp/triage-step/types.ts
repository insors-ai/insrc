/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_triage` types — the controller-driven classification front door.
 *
 * Loop: start → emit_classification → classify → done. The controller sizes
 * the request (grounding on its own `insrc_analyze_step` passes) and emits a
 * `TriageResult`; the server maps the size to a workflow entry and hands back
 * the exact next call to make. See `plans/feature-triage-router.md`.
 */

import type { TriageResult } from '../../workflow/triage/types.js';

export type TriagePhase = 'start' | 'classify';

export interface TriageInputStart {
	readonly phase: 'start';
	readonly focus: string;
	readonly repo?: string | undefined;
}

export interface TriageInputClassify {
	readonly phase:  'classify';
	readonly result: unknown;          // controller-emitted TriageResult (validated server-side)
	readonly state:  string;           // opaque token from start
}

export type TriageInput = TriageInputStart | TriageInputClassify;

/** Opaque state carried between the two turns (base64 JSON). */
export interface TriageState {
	readonly runId: string;
	readonly focus: string;
	readonly repo:  string;
}

export interface TriageEmitClassification {
	readonly next:     'emit_classification';
	readonly guidance: string;
	readonly prompt:   { readonly system: string; readonly user: string };
	readonly schema:   Record<string, unknown>;
	readonly state:    string;
}

/** The terminal turn — the routing decision + the exact next call to make. */
export interface TriageDone {
	readonly next:      'done';
	readonly result:    TriageResult;
	/** The workflow entry chosen for this size class. */
	readonly route: {
		readonly startStage:  string;
		readonly standalone:  boolean;
		readonly needsPlan:   boolean;
		readonly producesLld: boolean;
	};
	/** The exact tool call the controller should make next, pre-filled. */
	readonly nextCall: {
		readonly tool:   'insrc_workflow_run' | 'insrc_build_step';
		readonly params: Record<string, unknown>;
	};
	/** Human-readable one-liner rendered to the user. */
	readonly summary: string;
}

export interface TriageError {
	readonly next:    'error';
	readonly code:    string;
	readonly message: string;
}

export type TriageOutput = TriageEmitClassification | TriageDone | TriageError;

export interface TriageMcpEnvelope {
	readonly content:  { readonly type: 'text'; readonly text: string }[];
	readonly isError?: boolean;
	readonly [key: string]: unknown;
}
