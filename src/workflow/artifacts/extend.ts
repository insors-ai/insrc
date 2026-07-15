/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ExtendArtifact — produced by the `define` workflow's EXTEND branch,
 * when `scope.assess` decides the ask extends an existing Epic rather
 * than warranting a new one. It records the scoping decision, the Story
 * appended to the existing Define, the proposed HLD `storyBoundary.addStory`
 * amendment, the cited docs/code it builds on, and the next action
 * (approve the amendment → run `design.story` for the new Story).
 *
 * The human-facing markdown leads with a clear "Extends Epic …" banner so
 * the user is told it's building on existing work.
 */

import { artifactIdMarker, extendArtifactId } from '../storage.js';
import type { ArtifactMetaBase, Citation } from '../types.js';
import type { DefineStory } from './define.js';

export type ExtendScope = 'XS' | 'S' | 'M' | 'L' | 'XL';

export interface ExtendEvidence {
	readonly kind:  string;                 // 'doc' | 'code' | 'analyze-bundle' | ...
	readonly ref:   string;                 // path / artifact id / bundle id
	readonly quote?: string;
}

export interface ExtendBody {
	readonly scope:       ExtendScope;
	readonly notify:      string;           // user-facing "building on Epic X + docs/code …"
	readonly addedStory:  DefineStory;      // appended to the target Define's body.stories
	readonly amendmentId: string;           // the pending storyBoundary.addStory amendment
	readonly evidence:    readonly ExtendEvidence[];
	readonly nextAction:  { readonly command: string; readonly description: string };
}

/** ExtendArtifact meta pins the target Epic + the new Story. */
export interface ExtendMeta extends ArtifactMetaBase {
	readonly epicHash: string;
	readonly epicSlug: string;
	readonly storyId:  string;
}

export interface ExtendArtifact {
	readonly meta:      ExtendMeta;
	readonly body:      ExtendBody;
	readonly citations: readonly Citation[];
}

export const EXTEND_SCHEMA_VERSION = 1;

export function renderExtendMarkdown(a: ExtendArtifact): string {
	const { meta, body } = a;
	const lines: string[] = [];
	lines.push(artifactIdMarker(extendArtifactId(meta.epicHash, meta.storyId)));
	lines.push('');
	lines.push(`# Extend: ${meta.epicSlug} — ${body.addedStory.title}`);
	lines.push('');
	lines.push(`> **Extends Epic \`${meta.epicSlug}\`** — this builds on existing docs + code; no new Epic was created.`);
	lines.push('');
	lines.push(`**Scope:** ${body.scope}   ·   **New Story:** \`${meta.storyId}\``);
	lines.push('');
	lines.push(body.notify);
	lines.push('');
	lines.push('## Added Story');
	lines.push('');
	lines.push(`### ${body.addedStory.id}: ${body.addedStory.title}`);
	lines.push('');
	lines.push(`**User value:** ${body.addedStory.userValue}`);
	if (body.addedStory.acceptanceCriteria.length > 0) {
		lines.push('');
		lines.push('**Acceptance criteria:**');
		for (const ac of body.addedStory.acceptanceCriteria) {
			lines.push(`- **${ac.id}:** Given ${ac.given}, when ${ac.when}, then ${ac.then}.`);
		}
	}
	lines.push('');
	if (body.evidence.length > 0) {
		lines.push('## Building on');
		lines.push('');
		for (const e of body.evidence) lines.push(`- \`${e.kind}\` ${e.ref}${e.quote !== undefined && e.quote.length > 0 ? ` — ${e.quote}` : ''}`);
		lines.push('');
	}
	lines.push('## Next');
	lines.push('');
	lines.push(`Proposed HLD amendment \`${body.amendmentId}\` (pending approval — it adds the new Story's boundary).`);
	lines.push('');
	lines.push(body.nextAction.description);
	lines.push('');
	lines.push('```');
	lines.push(body.nextAction.command);
	lines.push('```');
	return lines.join('\n') + '\n';
}
