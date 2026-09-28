/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * DefineArtifact — Phase B.
 *
 * Shape mirrors `plans/workflow-define.md` §8. Two flavors:
 *   - `enhancement`: extending existing capability. Stories carry
 *     `existingCapabilityRefs` pointing at analyze bundles from s1.
 *   - `new-capability`: brand-new work aligning with project stack.
 *
 * The renderer emits a human-facing markdown that reproduces the
 * key sections (Problem, Non-goals, Assumptions, Constraints,
 * Stories) with citation markers so the caller can eyeball the
 * grounding.
 */

import { artifactIdMarker, defineArtifactId } from '../storage.js';
import { safeCanonical, storyWorkflowId } from '../id.js';
import { trackerRefLine } from '../tracker/refs.js';
import type { Citation, WorkflowArtifact } from '../types.js';
import type { FunctionalDefinition } from './functional-definition.js';
import { renderFunctionalRequirementsSection } from './functional-definition.js';
import type { DocumentSummary } from './format/types.js';
import { renderFromFormat, type SectionBindings, type SectionItem } from './format/engine.js';
import { citationBodyLines, frBodyLines } from './format/bindings.js';
import { DEFINE_FORMAT } from './format/formats.js';

// ---------------------------------------------------------------------------
// Body shape
// ---------------------------------------------------------------------------

export type DefineFlavor = 'enhancement' | 'new-capability';

export interface DefineConstraint {
	readonly id:     string;                             // 'c1', 'c2', ...
	readonly text:   string;
	readonly type:   'convention' | 'contract' | 'invariant' | 'stakeholder';
	readonly source: string;                             // citation id (`[[cN]]` — no brackets here)
}

export interface DefineNonGoal {
	readonly text:      string;
	readonly rationale: string;
}

export interface DefineAssumption {
	readonly text:       string;
	readonly confidence: 'low' | 'med' | 'high';
	readonly source:     string;                         // citation id
}

export interface DefineAcceptanceCriterion {
	readonly id:              string;                    // 'ac1' scoped per Story
	readonly given:           string;
	readonly when:            string;
	readonly then:            string;
	readonly operationalizes: readonly string[];         // constraint ids
}

export interface DefineStory {
	readonly id:                        string;          // 's1', 's2', ...
	readonly title:                     string;
	readonly userValue:                 string;
	readonly acceptanceCriteria:        readonly DefineAcceptanceCriterion[];
	readonly localConstraints?:         readonly DefineConstraint[];
	readonly dependsOn?:                readonly string[];
	readonly sizeEstimate?:             'S' | 'M' | 'L' | 'XL';
	readonly existingCapabilityRefs?:   readonly string[];   // citation ids — enhancement only
}

export interface DefineBody {
	readonly flavor:  DefineFlavor;
	readonly problem: string;
	readonly nonGoals:    readonly DefineNonGoal[];
	readonly assumptions: readonly DefineAssumption[];
	readonly constraints: readonly DefineConstraint[];
	readonly stories:     readonly DefineStory[];
	readonly openQuestions: readonly string[];
	/** sc1 (S001): the functional-definition record this document states. Additive +
	 *  absent-safe — a body without it renders byte-identically to before (k2/k6). */
	readonly functionalDefinition?: FunctionalDefinition | undefined;
	/** sc3 (S002): the plain-language, item-scoped Summary/abstract the document
	 *  leads with. Additive + absent-safe. */
	readonly summary?: DocumentSummary | undefined;
}

export type DefineArtifact = WorkflowArtifact<DefineBody>;

export const DEFINE_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderDefineMarkdown(artifact: DefineArtifact): string {
	const { body, meta } = artifact;
	const eh = typeof meta.epicHash === 'string' && meta.epicHash.length > 0 ? meta.epicHash : undefined;
	const marker = eh !== undefined ? artifactIdMarker(defineArtifactId(eh)) : undefined;
	const h1 = `Epic: ${epicShortName(artifact)}`;

	// The Summary envelope carries the Flavor + provenance meta lines (previously
	// rendered right after the H1), then the plain-language abstract when present.
	const summaryLines = (): string[] => {
		const out: string[] = [`**Flavor:** ${body.flavor}`];
		const seededFromSpec = (meta as { seededFromSpec?: string }).seededFromSpec;
		if (typeof seededFromSpec === 'string' && seededFromSpec.length > 0) out.push(`**Seeded from:** \`SPEC-${seededFromSpec}\``);
		const epicRef = (meta as { tracker?: { epicRef?: string } }).tracker?.epicRef;
		if (typeof epicRef === 'string' && epicRef.includes('#')) out.push(trackerRefLine(epicRef));
		if (body.summary?.prose !== undefined && body.summary.prose.length > 0) out.push('', body.summary.prose);
		return out;
	};

	const storyItem = (s: DefineStory): SectionItem => {
		const sid = eh !== undefined ? safeCanonical(() => storyWorkflowId(eh, meta.createdAt, s.id)) : undefined;
		const title = sid !== undefined ? `${sid} — ${s.title}` : `${s.id}: ${s.title}`;
		const l: string[] = [];
		const size = s.sizeEstimate === undefined ? '' : ` \`size: ${s.sizeEstimate}\``;
		l.push(`**User value:**${size}`, '', s.userValue, '');
		if (s.dependsOn !== undefined && s.dependsOn.length > 0) l.push(`**Depends on:** ${s.dependsOn.map(x => `\`${x}\``).join(', ')}`, '');
		if (s.existingCapabilityRefs !== undefined && s.existingCapabilityRefs.length > 0) l.push(`**Extends:** ${s.existingCapabilityRefs.map(x => `[[${x}]]`).join(' ')}`, '');
		l.push('**Acceptance criteria:**', '');
		for (const ac of s.acceptanceCriteria) {
			const ops = ac.operationalizes.length === 0 ? '' : ` _(operationalizes ${ac.operationalizes.map(o => `\`${o}\``).join(', ')})_`;
			l.push(`- **${ac.id}:** Given ${ac.given}, when ${ac.when}, then ${ac.then}.${ops}`);
		}
		if (s.localConstraints !== undefined && s.localConstraints.length > 0) {
			l.push('', '**Local constraints:**', '');
			for (const c of s.localConstraints) l.push(`- \`${c.id}\` (${c.type}) ${c.text} [[${c.source}]]`);
		}
		while (l.length > 0 && l[l.length - 1] === '') l.pop();
		return { title, lines: l };
	};

	const bindings: SectionBindings = {
		summary:       () => ({ lines: summaryLines() }),
		problem:       () => ({ lines: [body.problem] }),
		fr:            () => { const f = frBodyLines(body.functionalDefinition); return f.length > 0 ? { lines: f } : { omit: true }; },
		nonGoals:      () => body.nonGoals.length > 0 ? { lines: body.nonGoals.map(ng => `- **${ng.text}** — ${ng.rationale}`) } : { omit: true },
		assumptions:   () => body.assumptions.length > 0 ? { lines: body.assumptions.map(a => `- \`${a.confidence}\` ${a.text} [[${a.source}]]`) } : { omit: true },
		constraints:   () => body.constraints.length > 0 ? { lines: constraintTable(body.constraints) } : { omit: true },
		stories:       () => ({ items: body.stories.map(storyItem) }),
		references:    () => ({ lines: citationBodyLines(artifact.citations) }),
		openQuestions: () => body.openQuestions.length > 0 ? { lines: body.openQuestions.map(q => `- ${q}`) } : { omit: true },
	};
	return renderFromFormat(DEFINE_FORMAT, bindings, marker !== undefined ? { h1, marker } : { h1 });
}

/** A short, distinct H1 name (fixes defect #4 — the 40-word H1). Prefers the Epic
 *  slug; falls back to the problem's first sentence. */
function epicShortName(artifact: DefineArtifact): string {
	const slug = (artifact.meta as { epicSlug?: string }).epicSlug;
	if (typeof slug === 'string' && slug.length > 0) return slug;
	return firstSentence(artifact.body.problem);
}

function constraintTable(cs: readonly DefineConstraint[]): string[] {
	const l = ['| ID | Type | Text | Source |', '| :--- | :--- | :--- | :--- |'];
	for (const c of cs) l.push(`| \`${c.id}\` | ${c.type} | ${escapePipes(c.text)} | [[${c.source}]] |`);
	return l;
}

function firstSentence(s: string): string {
	const m = /^(.+?[.!?])\s/.exec(s);
	if (m !== null) return m[1]!;
	return s.length > 80 ? s.slice(0, 77) + '...' : s;
}

function escapePipes(s: string): string {
	return s.replace(/\|/g, '\\|');
}

// ---------------------------------------------------------------------------
// Runtime type guards
// ---------------------------------------------------------------------------

export function isDefineBody(v: unknown): v is DefineBody {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	if (r['flavor'] !== 'enhancement' && r['flavor'] !== 'new-capability') return false;
	if (typeof r['problem'] !== 'string')       return false;
	if (!Array.isArray(r['nonGoals']))          return false;
	if (!Array.isArray(r['assumptions']))       return false;
	if (!Array.isArray(r['constraints']))       return false;
	if (!Array.isArray(r['stories']))           return false;
	if (!Array.isArray(r['openQuestions']))     return false;
	return true;
}

export function isCitationArray(v: unknown): v is Citation[] {
	if (!Array.isArray(v)) return false;
	for (const c of v) {
		if (typeof c !== 'object' || c === null) return false;
		const r = c as Record<string, unknown>;
		if (typeof r['id'] !== 'string')   return false;
		if (typeof r['kind'] !== 'string') return false;
		if (typeof r['ref'] !== 'string')  return false;
	}
	return true;
}

// ---------------------------------------------------------------------------
// Cross-artifact sanity checks
// ---------------------------------------------------------------------------

/** Story dependsOn edges must reference real Story ids AND form a
 *  DAG (no cycles). Returns detail messages on failure. */
export function checkStoryDependencyGraph(stories: readonly DefineStory[]): readonly string[] {
	const details: string[] = [];
	const ids = new Set(stories.map(s => s.id));
	for (const s of stories) {
		if (s.dependsOn === undefined) continue;
		for (const d of s.dependsOn) {
			if (!ids.has(d)) {
				details.push(`Story '${s.id}' depends on unknown story '${d}'`);
			}
		}
	}
	// Cycle detection via DFS colouring. white=0, grey=1, black=2.
	const color: Record<string, number> = {};
	for (const s of stories) color[s.id] = 0;
	const byId: Record<string, DefineStory> = {};
	for (const s of stories) byId[s.id] = s;
	const stack: string[] = [];
	function visit(id: string): boolean {
		color[id] = 1;
		stack.push(id);
		const s = byId[id];
		if (s !== undefined && s.dependsOn !== undefined) {
			for (const d of s.dependsOn) {
				if (color[d] === 1) {
					details.push(`Story dependency cycle: ${[...stack, d].join(' -> ')}`);
					return true;
				}
				if (color[d] === 0 && visit(d)) return true;
			}
		}
		color[id] = 2;
		stack.pop();
		return false;
	}
	for (const s of stories) if (color[s.id] === 0) visit(s.id);
	return details;
}

/** Every constraint id referenced from a Story `operationalizes` or
 *  from an Assumption/Constraint `source` must resolve. Returns
 *  detail messages on failure. */
export function checkConstraintCoverage(body: DefineBody): readonly string[] {
	const details: string[] = [];
	const globalIds = new Set(body.constraints.map(c => c.id));
	for (const s of body.stories) {
		const localIds = new Set((s.localConstraints ?? []).map(c => c.id));
		for (const ac of s.acceptanceCriteria) {
			for (const op of ac.operationalizes) {
				if (!globalIds.has(op) && !localIds.has(op)) {
					details.push(`Story '${s.id}' AC '${ac.id}' operationalizes unknown constraint '${op}'`);
				}
			}
		}
	}
	return details;
}
