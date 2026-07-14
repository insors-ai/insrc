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

import type { Citation, WorkflowArtifact } from '../types.js';

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
}

export type DefineArtifact = WorkflowArtifact<DefineBody>;

export const DEFINE_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderDefineMarkdown(artifact: DefineArtifact): string {
	const { body } = artifact;
	const lines: string[] = [];
	lines.push(`# Epic: ${firstSentence(body.problem)}`);
	lines.push('');
	lines.push(`**Flavor:** ${body.flavor}`);
	lines.push('');

	lines.push('## Problem');
	lines.push('');
	lines.push(body.problem);
	lines.push('');

	if (body.nonGoals.length > 0) {
		lines.push('## Non-goals');
		lines.push('');
		for (const ng of body.nonGoals) {
			lines.push(`- **${ng.text}** — ${ng.rationale}`);
		}
		lines.push('');
	}

	if (body.assumptions.length > 0) {
		lines.push('## Assumptions');
		lines.push('');
		for (const a of body.assumptions) {
			lines.push(`- \`${a.confidence}\` ${a.text} [[${a.source}]]`);
		}
		lines.push('');
	}

	if (body.constraints.length > 0) {
		lines.push('## Constraints');
		lines.push('');
		lines.push('| ID | Type | Text | Source |');
		lines.push('| :--- | :--- | :--- | :--- |');
		for (const c of body.constraints) {
			lines.push(`| \`${c.id}\` | ${c.type} | ${escapePipes(c.text)} | [[${c.source}]] |`);
		}
		lines.push('');
	}

	lines.push('## Stories');
	lines.push('');
	for (const s of body.stories) {
		lines.push(`### ${s.id}: ${s.title}`);
		lines.push('');
		const size = s.sizeEstimate === undefined ? '' : ` \`size: ${s.sizeEstimate}\``;
		lines.push(`**User value:**${size}`);
		lines.push('');
		lines.push(s.userValue);
		lines.push('');
		if (s.dependsOn !== undefined && s.dependsOn.length > 0) {
			lines.push(`**Depends on:** ${s.dependsOn.map(x => `\`${x}\``).join(', ')}`);
			lines.push('');
		}
		if (s.existingCapabilityRefs !== undefined && s.existingCapabilityRefs.length > 0) {
			lines.push(`**Extends:** ${s.existingCapabilityRefs.map(x => `[[${x}]]`).join(' ')}`);
			lines.push('');
		}
		lines.push('**Acceptance criteria:**');
		lines.push('');
		for (const ac of s.acceptanceCriteria) {
			const ops = ac.operationalizes.length === 0
				? ''
				: ` _(operationalizes ${ac.operationalizes.map(o => `\`${o}\``).join(', ')})_`;
			lines.push(`- **${ac.id}:** Given ${ac.given}, when ${ac.when}, then ${ac.then}.${ops}`);
		}
		lines.push('');
		if (s.localConstraints !== undefined && s.localConstraints.length > 0) {
			lines.push('**Local constraints:**');
			lines.push('');
			for (const c of s.localConstraints) {
				lines.push(`- \`${c.id}\` (${c.type}) ${c.text} [[${c.source}]]`);
			}
			lines.push('');
		}
	}

	if (body.openQuestions.length > 0) {
		lines.push('## Open questions');
		lines.push('');
		for (const q of body.openQuestions) {
			lines.push(`- ${q}`);
		}
		lines.push('');
	}

	return lines.join('\n');
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
