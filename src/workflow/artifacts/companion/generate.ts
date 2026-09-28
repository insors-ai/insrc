/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) — the document-generation seam that ties the content-gate to the
 * deterministic ER render.
 *
 * `generateErCompanions` is the ADDITIVE wiring the document-generation path calls
 * after an artifact body is authored: it runs the content-gate (assessDiagramNeed —
 * the ONE added provider call), and only when an ER is warranted AND the authored
 * body carries a sound erDefinition does it render the sibling companion and return
 * the CompanionArtifactRef the S002 Diagrams extension slot links. It is inert when
 * no ER is warranted (returns no companion), never inlines the companion, and never
 * throws — a render hiccup (DiagramGenerationError) or an invalid erDefinition
 * leaves the erDefinition validated in-body without a picture (k1/k3/ac2).
 *
 * The erDefinition stays a structured body element (source of truth); this seam
 * only produces the out-of-body companion + its reference.
 */

import type { LLMProvider } from '../../../shared/types.js';
import { getLogger } from '../../../shared/logger.js';
import type { ArtifactKind, WorkItemIdentity, WorkItemKind } from '../../path-scheme.js';
import { resolveCompanionPath } from '../../path-scheme.js';
import type { FunctionalDefinition } from '../functional-definition.js';
import type { ErDefinition } from './er.js';
import { validateErDefinition } from './er.js';
import { renderErCompanion, DiagramGenerationError } from './render.js';
import { assessDiagramNeed } from './assess.js';
import type { CompanionArtifactRef } from './types.js';

const log = getLogger('artifacts:companion:generate');

/** The document under generation the seam operates on. */
export interface CompanionGenDoc {
	readonly kind:                 ArtifactKind;
	readonly body:                 { readonly erDefinition?: ErDefinition | undefined } & Record<string, unknown>;
	readonly functionalDefinition?: FunctionalDefinition | undefined;
}

/** Where the companion is written + how it is titled. */
export interface CompanionGenCtx {
	readonly repoPath:          string;
	readonly identity:          WorkItemIdentity;
	readonly workItemKind:      WorkItemKind;
	readonly slug:              string;
	/** The companion basename (default `er-model.html`). */
	readonly companionFileName?: string | undefined;
	/** The companion title (default `ER model`). */
	readonly title?:            string | undefined;
}

const DEFAULT_COMPANION_FILE = 'er-model.html';
const DEFAULT_COMPANION_TITLE = 'ER model';

/**
 * Content-gate + render the ER companion for a document. Returns the companions to
 * merge into the body (empty when no ER is warranted / renderable). Never throws.
 */
export async function generateErCompanions(
	doc:      CompanionGenDoc,
	provider: LLMProvider,
	ctx:      CompanionGenCtx,
): Promise<readonly CompanionArtifactRef[]> {
	// 1. Content-gate — one serial, fail-safe provider call.
	const need = await assessDiagramNeed(
		{ kind: doc.kind, body: doc.body, ...(doc.functionalDefinition !== undefined ? { functionalDefinition: doc.functionalDefinition } : {}) },
		provider,
	);
	const erNeed = need.diagrams.find(d => d.type === 'er');
	if (!need.warranted || erNeed === undefined) return [];

	// 2. The erDefinition (source of truth) must be authored in the body.
	const erDef = doc.body.erDefinition;
	if (erDef === undefined) {
		log.info({ kind: doc.kind }, 'ER warranted but no erDefinition authored in the body; no companion rendered');
		return [];
	}

	// 3. A broken model is NOT rendered (it stays validated in-body; the ER handler
	//    surfaces the breach at review time).
	const problems = validateErDefinition(erDef, doc.functionalDefinition);
	if (problems.some(f => f.severity === 'HIGH')) {
		log.warn({ kind: doc.kind, high: problems.filter(f => f.severity === 'HIGH').length }, 'erDefinition has HIGH validation findings; skipping companion render');
		return [];
	}

	// 4. Render the sibling companion via docgen assembleShell.
	let destPath: string;
	try {
		destPath = resolveCompanionPath(ctx.repoPath, ctx.identity, ctx.workItemKind, ctx.slug, ctx.companionFileName ?? DEFAULT_COMPANION_FILE);
	} catch (err) {
		log.warn({ kind: doc.kind, err: err instanceof Error ? err.message : String(err) }, 'could not resolve companion path; no companion rendered');
		return [];
	}
	try {
		const ref = await renderErCompanion(erDef, ctx.title ?? DEFAULT_COMPANION_TITLE, destPath, {
			repoPath: ctx.repoPath,
			...(erNeed.ofSectionId !== undefined ? { ofSectionId: erNeed.ofSectionId } : {}),
		});
		return [ref];
	} catch (err) {
		if (err instanceof DiagramGenerationError) {
			log.warn({ kind: doc.kind, status: err.status }, 'ER companion render failed; erDefinition stays in-body without a picture');
			return [];
		}
		throw err;
	}
}
