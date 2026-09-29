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
import type { CompanionArtifactRef } from '../companion/types.js';
import type { ChangeLog, FeedbackRecord } from '../provenance/types.js';

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

/**
 * sc4 (S003): the Diagrams extension-slot body — each companion rendered as a
 * LINK line (never the companion's content, k1/ac2). `[]` when there are no
 * companions (the renderer then omits the extension section — absent-safe/
 * forward-only, k6). A diagram-* companion is rendered; non-diagram companions
 * (e.g. S004 ux-mock) are left for their own slot.
 */
export function companionBodyLines(companions: readonly CompanionArtifactRef[] | undefined): string[] {
	if (companions === undefined || companions.length === 0) return [];
	const diagrams = companions.filter(c => c.kind === 'diagram-mermaid' || c.kind === 'diagram-html');
	if (diagrams.length === 0) return [];
	return diagrams.map(c => {
		const suffix = c.ofSectionId !== undefined && c.ofSectionId.length > 0 ? ` (§ ${c.ofSectionId})` : '';
		return `- [${c.title}](${c.relPath})${suffix}`;
	});
}

/**
 * sc4 (S004): the UX extension-slot body — each `ux-mock` companion rendered as a
 * LINK line (never the companion's content, k1/ac1). `[]` when there are no ux-mock
 * companions (the renderer then omits the UX extension section — absent-safe/
 * forward-only, k6, so a body without a UX design renders byte-identically). Mirrors
 * {@link companionBodyLines} but for the `ux-mock` kind so a document's ER diagram
 * and UX mock render in their own slots.
 */
export function uxCompanionBodyLines(companions: readonly CompanionArtifactRef[] | undefined): string[] {
	if (companions === undefined || companions.length === 0) return [];
	const mocks = companions.filter(c => c.kind === 'ux-mock');
	if (mocks.length === 0) return [];
	return mocks.map(c => {
		const suffix = c.ofSectionId !== undefined && c.ofSectionId.length > 0 ? ` (§ ${c.ofSectionId})` : '';
		return `- [${c.title}](${c.relPath})${suffix}`;
	});
}

/**
 * S001 (provenance/feedback): the Feedback section body — each post-hoc, human-
 * authored entry rendered as one bullet showing author, timestamp, target (file +
 * optional `:startLine-endLine`), optional kind, and the comment. `[]` when there
 * is no feedback (the renderer then omits the section — absent-safe/forward-only,
 * k6), so an artifact with no feedback renders byte-identically to before.
 */
export function feedbackBodyLines(feedback: FeedbackRecord | undefined): string[] {
	if (feedback === undefined || feedback.length === 0) return [];
	return feedback.map(f => {
		const seg = f.target.segment !== undefined ? `:${f.target.segment.startLine}-${f.target.segment.endLine}` : '';
		const kind = f.kind !== undefined ? ` \`${f.kind}\`` : '';
		return `- **${f.author}** (${f.timestamp})${kind} — \`${f.target.file}${seg}\`: ${f.comment}`;
	});
}

/**
 * S002 (provenance/feedback): the Changes section body — each change-log entry
 * rendered as one bullet showing the target file (+ optional `:startLine-endLine`
 * when a segment is present), author, timestamp, and the optional summary. `[]`
 * when the change-log is absent/empty (the renderer then omits the section —
 * absent-safe/forward-only), so a build with no recorded changes renders
 * byte-identically to before. Mirrors {@link feedbackBodyLines}.
 */
export function changeLogBodyLines(changeLog: ChangeLog | undefined): string[] {
	if (changeLog === undefined || changeLog.length === 0) return [];
	return changeLog.map(c => {
		const seg = c.target.segment !== undefined ? `:${c.target.segment.startLine}-${c.target.segment.endLine}` : '';
		const summary = c.summary !== undefined && c.summary.length > 0 ? ` — ${c.summary}` : '';
		return `- \`${c.target.file}${seg}\` — **${c.author}** (${c.timestamp})${summary}`;
	});
}

/** Citation list lines (no heading) for the numbered References section — mirrors
 *  the historical `renderCitationBlock` list item shape. */
export function citationBodyLines(citations: readonly Citation[]): string[] {
	return citations.map(c => {
		const quoted = c.quotedText === undefined ? '' : ` — "${c.quotedText.slice(0, 200)}"`;
		return `- **[[${c.id}]]** \`${c.kind}\` \`${c.ref}\`${quoted}`;
	});
}
