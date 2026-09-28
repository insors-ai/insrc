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
import { getLogger } from '../../../shared/logger.js';
import type { ErDefinition } from './er.js';
import { erDefinitionToIr } from './er.js';
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

/** Options for renderErCompanion. */
export interface RenderErCompanionOpts {
	/** Registered repo root — when supplied, `relPath` is computed relative to it
	 *  (else it is derived from the `docs/` segment of destPath). */
	readonly repoPath?:    string | undefined;
	/** The document section id this companion visualizes (bound onto the ref). */
	readonly ofSectionId?: string | undefined;
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
	const ir = erDefinitionToIr(erDef);
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
