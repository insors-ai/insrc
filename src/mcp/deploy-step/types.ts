/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Root type contracts for the deployment-design framework (s1: sc1 + sc2).
 *
 * `sc1 DeployStepProtocol` — the flat, string-discriminated multi-turn envelope
 * that drives the deploy-step MCP loop, joining the analyze-step / workflow-step
 * / build-step envelope family so the capability feels native. `sc2
 * DeploymentContextBundle` — the graph-grounded, structured entity/relation
 * output every stage emits (never raw file dumps), deliberately independent of
 * the analyze framework's `AnalyzeContextBundle` internal shape.
 *
 * Every stage runner (s2–s6) consumes these verbatim.
 */

// ---------------------------------------------------------------------------
// sc1 — DeployStepProtocol
// ---------------------------------------------------------------------------

/** Ordered stage discriminant driving the deploy-step loop: the chain order
 *  discover → reuse → topology → {security, scale} plus start/done terminals.
 *  No phase string outside this union is dispatchable. */
export type DeployPhase = 'start' | 'discover' | 'reuse' | 'topology' | 'security' | 'scale' | 'done';

/** Flat, string-discriminated request envelope consumed by `handleDeployStep`. */
export interface DeployStepRequest {
	readonly phase:    DeployPhase;
	readonly repo?:    string | undefined;
	readonly state?:   string | undefined;
	readonly focus?:   string | undefined;
	readonly payload?: unknown;
}

/** Flat response envelope. `state` is an opaque continuation token carried
 *  out-of-band, matching the workflow-step precedent; `next` drives the loop. */
export interface DeployStepResponse {
	readonly next:      DeployPhase | 'emit_bundle' | 'done';
	readonly guidance:  string;
	readonly prompt?:   string | undefined;
	readonly schema?:   object | undefined;
	readonly state:     string;
	readonly markdown?: string | undefined;
}

/** The per-story registration seam s2–s6 implement to plug a stage into the
 *  s1-owned chain without touching chain internals. After `register()`, the
 *  stage's `DeployPhase` is dispatchable by `handleDeployStep`. */
export interface DeployStageRegistrar {
	readonly stage: DeployPhase;
	register(): void;
}

// ---------------------------------------------------------------------------
// sc2 — DeploymentContextBundle quartet (independent of AnalyzeContextBundle)
// ---------------------------------------------------------------------------

/** A single graph-grounded entity reference. */
export interface DeploymentEntityRef {
	/** Deterministic entity id from the daemon graph: SHA256(repo+file+kind+name). */
	readonly entityId: string;
	readonly kind:     string;
	readonly name:     string;
	readonly path:     string;
}

/** A typed relation between two graph entities (by entityId). */
export interface DeploymentRelationRef {
	readonly from:     string;
	readonly to:       string;
	readonly relation: string;
}

/** A grounding citation. `entityId` is optional — a citation may point at a
 *  file/path with no resolved graph entity. */
export interface DeploymentCitation {
	readonly entityId?: string | undefined;
	readonly path:      string;
	readonly note:      string;
}

/** The structured, graph-grounded output every deploy stage emits — never a
 *  raw file dump. Structurally independent of `AnalyzeContextBundle`. */
export interface DeploymentContextBundle {
	readonly stage:     string;
	readonly summary:   string;
	readonly entities:  readonly DeploymentEntityRef[];
	readonly relations: readonly DeploymentRelationRef[];
	readonly citations: readonly DeploymentCitation[];
}
