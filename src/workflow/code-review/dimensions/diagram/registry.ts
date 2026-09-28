/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) — the per-type DIAGRAM adherence handler registry.
 *
 * The 'diagram' code-review dimension is a THIN DISPATCHER over this registry: a
 * self-contained per-type handler validates one diagram kind (S003 ships ONLY the
 * 'er' handler). The registry mirrors docgen's InMemoryDocTypeRegistry — keyed by
 * a type string, fail-fast on a duplicate registration — so peers (S004's UX
 * handler, deferred sequence/component) register as peers WITHOUT S003 enumerating
 * them and WITHOUT editing the ER handler.
 */

import type { LLMProvider } from '../../../../shared/types.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionFinding } from '../../types.js';
import type { CompanionArtifactRef } from '../../../artifacts/companion/types.js';

/** One per-type diagram adherence handler. `appliesTo` selects the companion refs
 *  it owns; `judge` validates the AUTHORED body element (never the rendered file)
 *  and returns findings for the 'diagram' dimension. Deterministic handlers ignore
 *  the provider. */
export interface DiagramAdherenceHandler {
	readonly type: string;
	appliesTo(ref: CompanionArtifactRef): boolean;
	judge(subject: CodeReviewSubject, grounding: CodeReviewGrounding, provider: LLMProvider): Promise<readonly DimensionFinding[]>;
}

/** A second registration claimed the same diagram type — a startup wiring bug
 *  (mirrors docgen's DuplicateDocTypeError). */
export class DuplicateDiagramHandlerError extends Error {
	readonly type: string;
	constructor(type: string) {
		super(`code-review: diagram handler type '${type}' is already registered`);
		this.name = 'DuplicateDiagramHandlerError';
		this.type = type;
	}
}

/** The process-wide registry. Insertion order preserved by the Map. */
const REGISTRY = new Map<string, DiagramAdherenceHandler>();

/** Register a per-type handler. Fail-fast on a duplicate type. */
export function registerDiagramHandler(handler: DiagramAdherenceHandler): void {
	if (typeof handler.type !== 'string' || handler.type.length === 0) {
		throw new Error('registerDiagramHandler: handler.type must be a non-empty string');
	}
	if (REGISTRY.has(handler.type)) {
		throw new DuplicateDiagramHandlerError(handler.type);
	}
	REGISTRY.set(handler.type, handler);
}

/** Resolve the handler for a type, or undefined when none is registered. */
export function diagramHandlerFor(type: string): DiagramAdherenceHandler | undefined {
	return REGISTRY.get(type);
}

/** Every registered handler, in registration order. */
export function listDiagramHandlers(): readonly DiagramAdherenceHandler[] {
	return [...REGISTRY.values()];
}

/** Test-only: drop a registration so a suite can re-register a fresh handler
 *  (mirrors the module-load registration without a duplicate throw). */
export function _unregisterDiagramHandlerForTests(type: string): void {
	REGISTRY.delete(type);
}
