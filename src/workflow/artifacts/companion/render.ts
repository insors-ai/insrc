/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) — deterministic ER companion rendering.
 *
 * `renderErCompanion` visualizes an authored ErDefinition into a self-contained
 * offline HTML companion by reusing docgen's SEPARABLE `assembleShell` render seam
 * (render/shell.ts) — NOT generateDocument / a graph extractor, no Python, no
 * cloud REST (ac4/k5). On a successful DocGenOutcome it writes the HTML to the
 * sibling `destPath` and returns the CompanionArtifactRef the core markdown links
 * (never inlines — ac2/k1); on a non-ok outcome it writes NOTHING and throws
 * DiagramGenerationError so the caller omits the diagram while the erDefinition
 * stays validated in-body.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, sep } from 'node:path';

import { assembleShell } from '../../../docgen/render/shell.js';
import type { DocumentIR } from '../../../docgen/types.js';
import { getLogger } from '../../../shared/logger.js';
import type { ErDefinition } from './er.js';
import { erDefinitionToIr } from './er.js';
import type { UxDefinition } from './ux.js';
import { renderUxMockDocument } from './ux.js';
import type { SequenceDefinition } from './sequence.js';
import { sequenceDefinitionToIr } from './sequence.js';
import type { ComponentDependencyDefinition } from './component.js';
import { componentDependencyDefinitionToIr } from './component.js';
import type { CompanionArtifactRef } from './types.js';

const log = getLogger('artifacts:companion:render');

/** Thrown when assembleShell returns a non-ok DocGenOutcome for a valid
 *  ErDefinition — the caller omits the companion (no file, no ref). */
export class DiagramGenerationError extends Error {
	readonly status: string;
	readonly reason: string;
	constructor(status: string, reason: string) {
		super(`renderErCompanion: docgen render did not succeed (${status}): ${reason}`);
		this.name = 'DiagramGenerationError';
		this.status = status;
		this.reason = reason;
	}
}

/** A back-reference to the source artifact markdown, rendered as an escaped `<a>`
 *  in the companion's narrated band (S001). */
export interface CompanionSourceLink {
	readonly label: string;
	readonly href:  string;
}

/** Set the source-doc back-link onto an IR's narrated content (S001). Returns
 *  the IR unchanged when no link is supplied, so a caller that omits it produces
 *  byte-identical HTML to before. Non-mutating (spreads a fresh narrated). */
function withSourceLink(ir: DocumentIR, sourceLink?: CompanionSourceLink): DocumentIR {
	if (sourceLink === undefined) return ir;
	return { ...ir, narrated: { ...ir.narrated, sourceLink } };
}

/** Options for renderErCompanion. */
export interface RenderErCompanionOpts {
	/** Registered repo root — when supplied, `relPath` is computed relative to it
	 *  (else it is derived from the `docs/` segment of destPath). */
	readonly repoPath?:    string | undefined;
	/** The document section id this companion visualizes (bound onto the ref). */
	readonly ofSectionId?: string | undefined;
	/** S001: a back-link to the source artifact `.md`; set onto ir.narrated.sourceLink
	 *  so the rendered HTML links back to the document it visualizes. */
	readonly sourceLink?:  CompanionSourceLink | undefined;
}

/**
 * Render the ER companion for `erDef` to `destPath` (a sibling of the artifact
 * `.md`, from resolveCompanionPath). Builds the IR, awaits assembleShell, and on
 * `status:'ok'` writes the HTML + returns the diagram-mermaid CompanionArtifactRef.
 *
 * @throws DiagramGenerationError on a non-ok DocGenOutcome (nothing is written).
 */
export async function renderErCompanion(
	erDef:    ErDefinition,
	title:    string,
	destPath: string,
	opts:     RenderErCompanionOpts = {},
): Promise<CompanionArtifactRef> {
	const ir = withSourceLink(erDefinitionToIr(erDef), opts.sourceLink);
	const outcome = await assembleShell(ir);
	if (outcome.status !== 'ok') {
		const reason = 'reason' in outcome ? outcome.reason
			: 'symbol' in outcome ? `not found: ${outcome.symbol}`
			: 'depthUsed' in outcome ? `truncated at depth ${outcome.depthUsed}`
			: 'unknown';
		throw new DiagramGenerationError(outcome.status, reason);
	}
	mkdirSync(dirname(destPath), { recursive: true });
	writeFileSync(destPath, outcome.value.html, 'utf8');
	const relPath = toRepoRelative(destPath, opts.repoPath);
	log.info({ destPath, relPath }, 'ER companion rendered');
	return {
		kind:    'diagram-mermaid',
		relPath,
		title,
		...(opts.ofSectionId !== undefined ? { ofSectionId: opts.ofSectionId } : {}),
	};
}

/** Options for renderUxCompanion (mirrors RenderErCompanionOpts). */
export interface RenderUxCompanionOpts {
	/** Registered repo root — when supplied, `relPath` is computed relative to it. */
	readonly repoPath?:    string | undefined;
	/** The document section id this companion visualizes (bound onto the ref). */
	readonly ofSectionId?: string | undefined;
	/** S001: a back-link to the source artifact `.md` (see RenderErCompanionOpts). */
	readonly sourceLink?:  CompanionSourceLink | undefined;
}

/**
 * sc4 (S004) — render the UX mock companion for `uxDef` to `destPath` (a sibling of
 * the artifact `.md`), writing the self-contained offline HTML and returning the
 * `kind:'ux-mock'` CompanionArtifactRef the core markdown LINKS (never inlines —
 * ac1/k1).
 *
 * UNLIKE the three DIAGRAM companions it does not build a DocumentIR and does not
 * go through assembleShell (ISSUE-85e6a58693579b6d / S001): a card is a nested box
 * layout, not a graph, so it renders through its own layout emitter instead. That
 * emitter is pure and build-time, which is why this function no longer has a
 * render failure mode — the DiagramGenerationError it used to raise on a non-ok
 * DocGenOutcome is unreachable from here. A filesystem failure from the write
 * still propagates, exactly as before.
 */
export async function renderUxCompanion(
	uxDef:    UxDefinition,
	title:    string,
	destPath: string,
	opts:     RenderUxCompanionOpts = {},
): Promise<CompanionArtifactRef> {
	// S001/t1-t2 (ISSUE-85e6a58693579b6d): the UX companion no longer borrows the
	// DIAGRAM pipeline. It used to lower the card into a DocumentIR of nodes and
	// edges and hand that to assembleShell, which draws a mermaid graph — so an
	// "experience mock" was published as a picture of the card's JSON. It now goes
	// through its own layout emitter, which renders each element as the thing it
	// denotes. Build-time and pure, so whatever the emitter produced is exactly
	// what the reader sees; there is no runtime step between the two that could
	// swallow it. assembleShell is UNTOUCHED and still serves the ER, sequence and
	// component companions.
	const html = renderUxMockDocument(uxDef, title, { sourceLink: opts.sourceLink });
	mkdirSync(dirname(destPath), { recursive: true });
	writeFileSync(destPath, html, 'utf8');
	const relPath = toRepoRelative(destPath, opts.repoPath);
	log.info({ destPath, relPath }, 'UX mock companion rendered');
	return {
		kind:    'ux-mock',
		relPath,
		title,
		...(opts.ofSectionId !== undefined ? { ofSectionId: opts.ofSectionId } : {}),
	};
}

/** Options for renderSequenceCompanion / renderComponentCompanion (mirrors
 *  RenderErCompanionOpts). */
export interface RenderDiagramCompanionOpts {
	/** Registered repo root — when supplied, `relPath` is computed relative to it. */
	readonly repoPath?:    string | undefined;
	/** The document section id this companion visualizes (bound onto the ref). */
	readonly ofSectionId?: string | undefined;
	/** S001: a back-link to the source artifact `.md` (see RenderErCompanionOpts). */
	readonly sourceLink?:  CompanionSourceLink | undefined;
}

/**
 * sc3 (S003) — render the SEQUENCE-diagram companion for `seqDef` to `destPath` (a
 * sibling of the artifact `.md`). Mirrors renderErCompanion: builds the IR
 * (sequenceDefinitionToIr → docType 'call-sequence'), awaits the SAME docgen
 * assembleShell render seam, and on `status:'ok'` writes the self-contained offline
 * HTML + returns the `kind:'diagram-mermaid'` CompanionArtifactRef the core markdown
 * LINKS (never inlines — k1).
 *
 * @throws DiagramGenerationError on a non-ok DocGenOutcome (nothing is written; the
 *   sequenceDefinition stays validated in-body without a picture).
 */
export async function renderSequenceCompanion(
	seqDef:   SequenceDefinition,
	title:    string,
	destPath: string,
	opts:     RenderDiagramCompanionOpts = {},
): Promise<CompanionArtifactRef> {
	const ir = withSourceLink(sequenceDefinitionToIr(seqDef), opts.sourceLink);
	const outcome = await assembleShell(ir);
	if (outcome.status !== 'ok') {
		const reason = 'reason' in outcome ? outcome.reason
			: 'symbol' in outcome ? `not found: ${outcome.symbol}`
			: 'depthUsed' in outcome ? `truncated at depth ${outcome.depthUsed}`
			: 'unknown';
		throw new DiagramGenerationError(outcome.status, reason);
	}
	mkdirSync(dirname(destPath), { recursive: true });
	writeFileSync(destPath, outcome.value.html, 'utf8');
	const relPath = toRepoRelative(destPath, opts.repoPath);
	log.info({ destPath, relPath }, 'sequence companion rendered');
	return {
		kind:    'diagram-mermaid',
		relPath,
		title,
		...(opts.ofSectionId !== undefined ? { ofSectionId: opts.ofSectionId } : {}),
	};
}

/**
 * sc3 (S003) — render the COMPONENT-DEPENDENCY companion for `compDef` to
 * `destPath` (a sibling of the artifact `.md`). Mirrors renderErCompanion: builds
 * the IR (componentDependencyDefinitionToIr → docType 'component-dependency'),
 * awaits the SAME docgen assembleShell render seam, and on `status:'ok'` writes the
 * self-contained offline HTML + returns the `kind:'diagram-mermaid'`
 * CompanionArtifactRef the core markdown LINKS (never inlines — k1).
 *
 * @throws DiagramGenerationError on a non-ok DocGenOutcome (nothing is written; the
 *   componentDependencyDefinition stays validated in-body without a picture).
 */
export async function renderComponentCompanion(
	compDef:  ComponentDependencyDefinition,
	title:    string,
	destPath: string,
	opts:     RenderDiagramCompanionOpts = {},
): Promise<CompanionArtifactRef> {
	const ir = withSourceLink(componentDependencyDefinitionToIr(compDef), opts.sourceLink);
	const outcome = await assembleShell(ir);
	if (outcome.status !== 'ok') {
		const reason = 'reason' in outcome ? outcome.reason
			: 'symbol' in outcome ? `not found: ${outcome.symbol}`
			: 'depthUsed' in outcome ? `truncated at depth ${outcome.depthUsed}`
			: 'unknown';
		throw new DiagramGenerationError(outcome.status, reason);
	}
	mkdirSync(dirname(destPath), { recursive: true });
	writeFileSync(destPath, outcome.value.html, 'utf8');
	const relPath = toRepoRelative(destPath, opts.repoPath);
	log.info({ destPath, relPath }, 'component-dependency companion rendered');
	return {
		kind:    'diagram-mermaid',
		relPath,
		title,
		...(opts.ofSectionId !== undefined ? { ofSectionId: opts.ofSectionId } : {}),
	};
}

/** A repo-relative, forward-slashed path for the companion ref. Prefers
 *  `path.relative(repoPath, destPath)`; falls back to the `docs/` segment. */
function toRepoRelative(destPath: string, repoPath?: string): string {
	if (repoPath !== undefined && repoPath.length > 0) {
		return relative(repoPath, destPath).split(sep).join('/');
	}
	const norm = destPath.split(sep).join('/');
	const i = norm.lastIndexOf('/docs/');
	if (i >= 0) return norm.slice(i + 1);   // drop the leading '/'
	if (norm.startsWith('docs/')) return norm;
	return norm;
}
