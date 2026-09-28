/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S002) — shared section-binding helpers the four renderers reuse when
 * driving `renderFromFormat`. Kept separate so a renderer only supplies its
 * type-specific bindings.
 */

import type { Citation } from '../../types.js';
import type { FunctionalDefinition } from '../functional-definition.js';
import { renderFunctionalRequirementsSection } from '../functional-definition.js';

/**
 * S001's FR section content WITHOUT its own '## Functional requirements' heading
 * (the engine supplies the numbered heading). `[]` when the record is
 * absent/empty (the renderer then omits the section — absent-safe).
 */
export function frBodyLines(fd: FunctionalDefinition | undefined): string[] {
	const raw = renderFunctionalRequirementsSection(fd);
	if (raw.length === 0) return [];
	// raw[0] === '## Functional requirements', raw[1] === ''
	const body = raw.slice(2);
	while (body.length > 0 && body[body.length - 1] === '') body.pop();
	return body;
}

/** Citation list lines (no heading) for the numbered References section — mirrors
 *  the historical `renderCitationBlock` list item shape. */
export function citationBodyLines(citations: readonly Citation[]): string[] {
	return citations.map(c => {
		const quoted = c.quotedText === undefined ? '' : ` — "${c.quotedText.slice(0, 200)}"`;
		return `- **[[${c.id}]]** \`${c.kind}\` \`${c.ref}\`${quoted}`;
	});
}
