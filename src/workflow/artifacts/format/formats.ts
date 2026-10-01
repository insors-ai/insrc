/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S002) — the bundled default `DocumentFormat` per artifact type.
 *
 * These encode the reviewed per-type mocks
 * (docs/epics/…/S002/mocks/{define,hld,lld,plan}.mock.md): a short H1, an
 * unnumbered plain-language item-scoped Summary, a generated Contents, and the
 * human-first ordered body sections (with NAMED `extension` slots for S003
 * diagrams / S004 UX). They are the DEFAULT the `renderFromFormat` engine drives;
 * a per-repo/user override on the template-loader cascade (loadTemplate) may
 * supersede them (wired at the renderer cutover).
 */

import type { DocumentFormat, SectionSpec } from './types.js';

const S = (o: Partial<SectionSpec> & { id: string; heading: string }): SectionSpec => ({
	contentGuidance: '', required: false, numbered: true, source: 'body', ...o,
});

// Common envelope Summary specs (unnumbered pre-TOC abstract), audience-tagged.
const summaryBusiness  = S({ id: 'summary', heading: 'Summary', numbered: false, required: true, audience: 'business',
	contentGuidance: 'Plain business terms, contextualized to THIS Epic; 2-4 sentences; foreground the functional requirements; no implementation detail.' });
const summaryProduct = (item: string): SectionSpec => S({ id: 'summary', heading: 'Summary', numbered: false, required: true, audience: 'product',
	contentGuidance: `Lead with one plain-language sentence — the outcome THIS ${item} delivers, in reviewer terms — then the technical detail.` });

export const DEFINE_FORMAT: DocumentFormat = {
	kind: 'define',
	h1: 'Epic: <short name>',
	summary: summaryBusiness,
	sections: [
		S({ id: 'problem',    heading: 'Problem', required: true, contentGuidance: 'The problem in outcome terms; who is blocked and how.' }),
		S({ id: 'fr',         heading: 'Functional requirements', source: 'fr', contentGuidance: "S001's renderFunctionalRequirementsSection, unchanged." }),
		S({ id: 'nonGoals',   heading: 'Non-goals' }),
		S({ id: 'assumptions', heading: 'Assumptions' }),
		S({ id: 'constraints', heading: 'Constraints' }),
		S({ id: 'stories',    heading: 'Stories', contentGuidance: 'Per-story sub-template: user value, Given/When/Then acceptance criteria, local constraints.' }),
		S({ id: 'references', heading: 'References', required: true, contentGuidance: 'Citations as grouped links.' }),
		S({ id: 'openQuestions', heading: 'Open questions' }),
		S({ id: 'feedback',   heading: 'Feedback', contentGuidance: 'Post-hoc human-authored feedback appended after authoring; never authored by the synthesizer.' }),
	],
	itemFormat: { itemKind: 'story', sections: [
		S({ id: 'userValue', heading: 'User value', numbered: false }),
		S({ id: 'acceptanceCriteria', heading: 'Acceptance criteria', numbered: false }),
	] },
};

export const HLD_FORMAT: DocumentFormat = {
	kind: 'hld',
	h1: 'HLD: <epic short name>',
	summary: summaryProduct('Epic'),
	sections: [
		S({ id: 'problemContext', heading: 'Problem context', source: 'shared-ref', contentGuidance: 'Reference the DEF problem, not copied.' }),
		S({ id: 'framework',   heading: 'Framework summary', required: true }),
		S({ id: 'fr',          heading: 'Functional requirements', source: 'fr' }),
		S({ id: 'architecture', heading: 'Architecture shape' }),
		S({ id: 'diagrams',    heading: 'Diagrams', source: 'extension', contentGuidance: 'NAMED extension point — S003 component diagram companion.' }),
		S({ id: 'contracts',   heading: 'Shared contracts' }),
		S({ id: 'boundaries',  heading: 'Story boundaries' }),
		S({ id: 'nonFunctional', heading: 'Non-functional targets' }),
		S({ id: 'rollout',     heading: 'Rollout' }),
		S({ id: 'alternatives', heading: 'Alternatives considered' }),
		S({ id: 'ux',          heading: 'UX', source: 'extension', contentGuidance: 'NAMED extension point — S004 UX section/mock reference.' }),
		S({ id: 'references',  heading: 'References', required: true }),
		S({ id: 'openQuestions', heading: 'Open questions' }),
		S({ id: 'feedback',    heading: 'Feedback', contentGuidance: 'Post-hoc human-authored feedback appended after authoring; never authored by the synthesizer.' }),
	],
};

export const LLD_FORMAT: DocumentFormat = {
	kind: 'lld',
	h1: 'LLD: <story id — title>',
	summary: summaryProduct('Story'),
	sections: [
		S({ id: 'hldContext',  heading: 'HLD context', source: 'shared-ref', required: true, contentGuidance: 'Reference the HLD framework-summary (de-dup, ac2); never copy it.' }),
		S({ id: 'fr',          heading: 'Functional requirements', source: 'fr' }),
		S({ id: 'contract',    heading: 'Contract details', required: true }),
		S({ id: 'dataModel',   heading: 'Data model changes' }),
		S({ id: 'diagramsEr',  heading: 'Diagrams', source: 'extension', contentGuidance: 'NAMED extension point — S003 ER/sequence diagram companion.' }),
		S({ id: 'interaction', heading: 'Interaction with shared contracts' }),
		S({ id: 'errorPaths',  heading: 'Error paths' }),
		S({ id: 'testStrategy', heading: 'Test strategy' }),
		S({ id: 'migration',   heading: 'Migration' }),
		S({ id: 'alternatives', heading: 'Alternatives considered' }),
		S({ id: 'ux',          heading: 'UX', source: 'extension', contentGuidance: 'NAMED extension point — S004 UX section/mock reference.' }),
		S({ id: 'references',  heading: 'References', required: true }),
		S({ id: 'openQuestions', heading: 'Open questions' }),
		S({ id: 'feedback',    heading: 'Feedback', contentGuidance: 'Post-hoc human-authored feedback appended after authoring; never authored by the synthesizer.' }),
	],
};

export const PLAN_FORMAT: DocumentFormat = {
	kind: 'plan',
	h1: 'Plan: <story id>',
	summary: summaryProduct('Story'),
	sections: [
		S({ id: 'fr',          heading: 'Functional requirements', source: 'fr' }),
		S({ id: 'tasks',       heading: 'Tasks', required: true, contentGuidance: 'Per-task sub-template: size, depends-on, acceptance checks, tests.' }),
		S({ id: 'coverage',    heading: 'Test-strategy coverage' }),
		S({ id: 'references',  heading: 'References', required: true }),
		S({ id: 'feedback',    heading: 'Feedback', contentGuidance: 'Post-hoc human-authored feedback appended after authoring; never authored by the synthesizer.' }),
	],
	itemFormat: { itemKind: 'task', sections: [
		S({ id: 'size', heading: 'Size', numbered: false }),
		S({ id: 'acceptanceChecks', heading: 'Acceptance checks', numbered: false }),
	] },
};

/** The bundled default format for an artifact kind. */
export function defaultFormat(kind: DocumentFormat['kind']): DocumentFormat {
	switch (kind) {
		case 'define': return DEFINE_FORMAT;
		case 'hld':    return HLD_FORMAT;
		case 'lld':    return LLD_FORMAT;
		case 'plan':   return PLAN_FORMAT;
	}
}
