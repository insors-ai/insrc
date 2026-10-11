/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Companion rendering (LLD-d9f85b3c S001/t8).
 *
 * Each `render*Companion` turns one authored definition (ER, UX, sequence,
 * component) into a self-contained offline HTML page in the shared companion
 * shell (shell.ts), writes it beside the artifact `.md`, and returns the
 * CompanionArtifactRef the core markdown links (never inlines). If a runtime
 * asset is missing it writes NOTHING and throws DiagramGenerationError, so the
 * caller omits that companion while the definition stays validated in-body.
 * The docgen tool keeps its own shell (docgen/render/shell.ts), unchanged.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, sep } from 'node:path';

import { getLogger } from '../../../shared/logger.js';
import type { ErDefinition } from './er.js';
import { erDefinitionToPage } from './er.js';
import type { UxDefinition } from './ux.js';
import { uxDefinitionToPage } from './ux.js';
import type { SequenceDefinition } from './sequence.js';
import { sequenceDefinitionToPage } from './sequence.js';
import type { ComponentDependencyDefinition } from './component.js';
import { componentDependencyDefinitionToPage } from './component.js';
import { loadCompanionRuntime, renderCompanionPage, type CompanionPageContent } from './shell.js';
import type { CompanionArtifactRef, CompanionHeader } from './types.js';

const log = getLogger('artifacts:companion:render');

/** Thrown when a companion page cannot be produced for a valid definition (a
 *  runtime asset is missing) — the caller omits the companion (no file, no ref). */
export class DiagramGenerationError extends Error {
	readonly status: string;
	readonly reason: string;
	constructor(status: string, reason: string) {
		super(`companion render did not succeed (${status}): ${reason}`);
		this.name = 'DiagramGenerationError';
		this.status = status;
		this.reason = reason;
	}
}

/** What every companion render needs besides its definition. */
export interface CompanionRenderOpts {
	/** Registered repo root — when supplied, `relPath` is computed relative to it
	 *  (else it is derived from the `docs/` segment of destPath). */
	readonly repoPath?:    string | undefined;
	/** The document section id this companion visualizes (bound onto the ref). */
	readonly ofSectionId?: string | undefined;
	/** The page header, resolved once per finalize site (header.ts). */
	readonly header:       CompanionHeader;
}

/** Options for renderErCompanion. */
export type RenderErCompanionOpts = CompanionRenderOpts;

/**
 * LLD-d9f85b3c S001/t8 — every companion is one page from the shared shell
 * (shell.ts): Header, Narrative, a pan/zoom View and Description tables. Each
 * kind's builder turns its definition into page content; this module loads the
 * runtimes, renders the page and writes it beside the source markdown.
 *
 * @throws DiagramGenerationError when a runtime asset is missing (nothing is
 *   written; the definition stays validated in-body without a picture).
 */
function writeCompanionPage(page: CompanionPageContent, destPath: string, header: CompanionHeader): void {
	const runtime = loadCompanionRuntime(page.visual.kind);
	const html = renderCompanionPage(header, page, runtime);
	mkdirSync(dirname(destPath), { recursive: true });
	writeFileSync(destPath, html, 'utf8');
}

function companionRef(kind: CompanionArtifactRef['kind'], title: string, destPath: string, opts: CompanionRenderOpts): CompanionArtifactRef {
	return {
		kind,
		relPath: toRepoRelative(destPath, opts.repoPath),
		title,
		...(opts.ofSectionId !== undefined ? { ofSectionId: opts.ofSectionId } : {}),
	};
}

/** Render the ER companion (er-model.html) for `erDef` to `destPath`, a sibling of
 *  the artifact `.md`, and return the `diagram-mermaid` ref the markdown links. */
export async function renderErCompanion(
	erDef:    ErDefinition,
	title:    string,
	destPath: string,
	opts:     RenderErCompanionOpts,
): Promise<CompanionArtifactRef> {
	writeCompanionPage(erDefinitionToPage(erDef, title), destPath, opts.header);
	const ref = companionRef('diagram-mermaid', title, destPath, opts);
	log.info({ destPath, relPath: ref.relPath }, 'ER companion rendered');
	return ref;
}

/** Options for renderUxCompanion. */
export type RenderUxCompanionOpts = CompanionRenderOpts;

/** Render the UX mock companion (ux-mock.html): the card inside the same pan/zoom
 *  view panel as the diagrams, with numbered markers matching the key-elements
 *  table. Returns the `ux-mock` ref the markdown links (never inlined). */
export async function renderUxCompanion(
	uxDef:    UxDefinition,
	title:    string,
	destPath: string,
	opts:     RenderUxCompanionOpts,
): Promise<CompanionArtifactRef> {
	writeCompanionPage(uxDefinitionToPage(uxDef, title), destPath, opts.header);
	const ref = companionRef('ux-mock', title, destPath, opts);
	log.info({ destPath, relPath: ref.relPath }, 'UX mock companion rendered');
	return ref;
}

/** Options for renderSequenceCompanion / renderComponentCompanion. */
export type RenderDiagramCompanionOpts = CompanionRenderOpts;

/** Render the sequence-diagram companion (sequence-diagram.html). */
export async function renderSequenceCompanion(
	seqDef:   SequenceDefinition,
	title:    string,
	destPath: string,
	opts:     RenderDiagramCompanionOpts,
): Promise<CompanionArtifactRef> {
	writeCompanionPage(sequenceDefinitionToPage(seqDef, title), destPath, opts.header);
	const ref = companionRef('diagram-mermaid', title, destPath, opts);
	log.info({ destPath, relPath: ref.relPath }, 'sequence companion rendered');
	return ref;
}

/** Render the component-dependency companion (component-dependency.html). */
export async function renderComponentCompanion(
	compDef:  ComponentDependencyDefinition,
	title:    string,
	destPath: string,
	opts:     RenderDiagramCompanionOpts,
): Promise<CompanionArtifactRef> {
	writeCompanionPage(componentDependencyDefinitionToPage(compDef, title), destPath, opts.header);
	const ref = companionRef('diagram-mermaid', title, destPath, opts);
	log.info({ destPath, relPath: ref.relPath }, 'component-dependency companion rendered');
	return ref;
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
