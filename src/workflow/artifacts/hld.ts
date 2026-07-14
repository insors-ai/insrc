/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * HldArtifact — Phase C.
 *
 * Shape mirrors `plans/workflow-design.md` §7.1. Renders to
 * `docs/designs/<epic-slug>/_hld.md`. Downstream LLDs read the
 * canonical JSON at `_hld.json`.
 *
 * The HLD's `handoff` block is what every LLD (and later `plan`)
 * consumes — framework summary, shared contracts, story
 * boundaries, rollout overview.
 */

import { artifactIdMarker, hldArtifactId } from '../storage.js';
import type { Citation, WorkflowArtifact } from '../types.js';

// ---------------------------------------------------------------------------
// Body sub-shapes
// ---------------------------------------------------------------------------

export interface SharedContract {
	readonly id:                string;               // 'sc1', 'sc2', ...
	readonly name:              string;
	readonly purpose:           string;
	readonly interfaceSketch:   string;               // type-level only; enforced
	readonly ownedByStory:      string;               // story id from Epic
	readonly consumedByStories: readonly string[];    // story ids
	readonly assumptions:       readonly string[];    // Epic citation ids
}

export interface StoryBoundary {
	readonly storyId:  string;
	readonly owns:     readonly string[];             // shared-contract ids
	readonly depends:  readonly string[];             // shared-contract ids
	readonly internal: string;
}

export interface NonFunctional {
	readonly performance?:   string;
	readonly security?:      string;
	readonly observability?: string;
	readonly durability?:    string;
}

export interface RolloutPhase {
	readonly name:            string;
	readonly includesStories: readonly string[];
	readonly rationale:       string;
	readonly backwardCompat:  string;
	readonly featureFlag:     string | null;
}

export interface RolloutOverview {
	readonly phases:            readonly RolloutPhase[];
	readonly orderingRationale: string;
	readonly riskyBits:         readonly {
		readonly area:       string;
		readonly why:        string;
		readonly mitigation: string;
	}[];
}

export interface Alternative {
	readonly id:             string;                  // 'a1', 'a2', ...
	readonly name:           string;
	readonly oneLineSummary: string;
	readonly approach:       string;
	readonly pros:           readonly string[];
	readonly cons:           readonly string[];
	readonly costEstimate:   'XS' | 'S' | 'M' | 'L';
	/** Why this alternative lost (populated only on losers). */
	readonly reasonRejected?: string;
}

// ---------------------------------------------------------------------------
// HLD body
// ---------------------------------------------------------------------------

export interface HldBody {
	readonly frameworkSummary:      string;
	readonly architectureShape:     string;
	readonly sharedContracts:       readonly SharedContract[];
	readonly storyBoundaries:       readonly StoryBoundary[];
	readonly nonFunctional:         NonFunctional;
	readonly rolloutOverview:       RolloutOverview;
	readonly alternativesConsidered: readonly Alternative[];
	readonly chosenAlternative:     string;           // alternative id
	readonly openQuestions:         readonly string[];
}

export type HldArtifact = WorkflowArtifact<HldBody>;

export const HLD_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderHldMarkdown(artifact: HldArtifact): string {
	const { body } = artifact;
	const lines: string[] = [];
	if (typeof artifact.meta.epicHash === 'string' && artifact.meta.epicHash.length > 0) {
		lines.push(artifactIdMarker(hldArtifactId(artifact.meta.epicHash)));
		lines.push('');
	}
	lines.push(`# HLD: ${firstLine(body.frameworkSummary)}`);
	lines.push('');
	lines.push('## Framework summary');
	lines.push('');
	lines.push(body.frameworkSummary);
	lines.push('');
	lines.push('## Architecture shape');
	lines.push('');
	lines.push(body.architectureShape);
	lines.push('');

	lines.push('## Shared contracts');
	lines.push('');
	for (const sc of body.sharedContracts) {
		lines.push(`### ${sc.id}: ${sc.name}`);
		lines.push('');
		lines.push(`**Owner Story:** \`${sc.ownedByStory}\``);
		if (sc.consumedByStories.length > 0) {
			lines.push(`**Consumed by:** ${sc.consumedByStories.map(s => `\`${s}\``).join(', ')}`);
		}
		lines.push('');
		lines.push(`**Purpose:** ${sc.purpose}`);
		lines.push('');
		lines.push('**Interface sketch (type-level):**');
		lines.push('');
		lines.push('```');
		lines.push(sc.interfaceSketch);
		lines.push('```');
		lines.push('');
		if (sc.assumptions.length > 0) {
			lines.push(`**Assumptions cited:** ${sc.assumptions.map(a => `[[${a}]]`).join(' ')}`);
			lines.push('');
		}
	}

	lines.push('## Story boundaries');
	lines.push('');
	for (const sb of body.storyBoundaries) {
		lines.push(`### Story \`${sb.storyId}\``);
		lines.push('');
		if (sb.owns.length > 0)    lines.push(`**Owns:** ${sb.owns.map(x => `\`${x}\``).join(', ')}`);
		if (sb.depends.length > 0) lines.push(`**Depends on:** ${sb.depends.map(x => `\`${x}\``).join(', ')}`);
		lines.push('');
		lines.push(sb.internal);
		lines.push('');
	}

	lines.push('## Non-functional targets');
	lines.push('');
	if (body.nonFunctional.performance   !== undefined) lines.push(`- **Performance:** ${body.nonFunctional.performance}`);
	if (body.nonFunctional.security      !== undefined) lines.push(`- **Security:** ${body.nonFunctional.security}`);
	if (body.nonFunctional.observability !== undefined) lines.push(`- **Observability:** ${body.nonFunctional.observability}`);
	if (body.nonFunctional.durability    !== undefined) lines.push(`- **Durability:** ${body.nonFunctional.durability}`);
	lines.push('');

	lines.push('## Rollout');
	lines.push('');
	for (const p of body.rolloutOverview.phases) {
		lines.push(`### ${p.name}`);
		lines.push('');
		lines.push(`**Stories:** ${p.includesStories.map(s => `\`${s}\``).join(', ')}`);
		if (p.featureFlag !== null) lines.push(`**Flag:** \`${p.featureFlag}\``);
		lines.push('');
		lines.push(p.rationale);
		if (p.backwardCompat.length > 0) {
			lines.push('');
			lines.push(`**Backward compat:** ${p.backwardCompat}`);
		}
		lines.push('');
	}
	if (body.rolloutOverview.orderingRationale.length > 0) {
		lines.push('**Ordering rationale:** ' + body.rolloutOverview.orderingRationale);
		lines.push('');
	}
	if (body.rolloutOverview.riskyBits.length > 0) {
		lines.push('### Risky bits');
		lines.push('');
		lines.push('| Area | Why | Mitigation |');
		lines.push('| :--- | :--- | :--- |');
		for (const rb of body.rolloutOverview.riskyBits) {
			lines.push(`| ${escapePipes(rb.area)} | ${escapePipes(rb.why)} | ${escapePipes(rb.mitigation)} |`);
		}
		lines.push('');
	}

	lines.push('## Alternatives considered');
	lines.push('');
	for (const a of body.alternativesConsidered) {
		const badge = a.id === body.chosenAlternative ? ' — **CHOSEN**' : '';
		lines.push(`### ${a.id}: ${a.name}${badge}`);
		lines.push('');
		lines.push(a.oneLineSummary);
		lines.push('');
		lines.push(a.approach);
		lines.push('');
		if (a.pros.length > 0) { lines.push('**Pros:**'); for (const p of a.pros) lines.push(`- ${p}`); lines.push(''); }
		if (a.cons.length > 0) { lines.push('**Cons:**'); for (const c of a.cons) lines.push(`- ${c}`); lines.push(''); }
		lines.push(`**Cost estimate:** ${a.costEstimate}`);
		lines.push('');
		if (a.reasonRejected !== undefined && a.reasonRejected.length > 0) {
			lines.push(`**Rejected because:** ${a.reasonRejected}`);
			lines.push('');
		}
	}

	if (body.openQuestions.length > 0) {
		lines.push('## Open questions');
		lines.push('');
		for (const q of body.openQuestions) lines.push(`- ${q}`);
		lines.push('');
	}

	return lines.join('\n');
}

function firstLine(s: string): string {
	const m = /^(.+?)(?:\.|\n|$)/.exec(s);
	if (m !== null) return m[1]!;
	return s.length > 80 ? s.slice(0, 77) + '...' : s;
}
function escapePipes(s: string): string { return s.replace(/\|/g, '\\|'); }

// ---------------------------------------------------------------------------
// Runtime type guards
// ---------------------------------------------------------------------------

export function isHldBody(v: unknown): v is HldBody {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	if (typeof r['frameworkSummary'] !== 'string')  return false;
	if (typeof r['architectureShape'] !== 'string') return false;
	if (!Array.isArray(r['sharedContracts']))       return false;
	if (!Array.isArray(r['storyBoundaries']))       return false;
	if (typeof r['nonFunctional'] !== 'object' || r['nonFunctional'] === null) return false;
	if (typeof r['rolloutOverview'] !== 'object' || r['rolloutOverview'] === null) return false;
	if (!Array.isArray(r['alternativesConsidered'])) return false;
	if (typeof r['chosenAlternative'] !== 'string') return false;
	if (!Array.isArray(r['openQuestions']))         return false;
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
// Cross-artifact validations
// ---------------------------------------------------------------------------

/** Every shared contract has an owning Story from the Epic; every
 *  consumer is a real Story; every Story from the Epic appears as
 *  a `storyBoundaries[]` entry. Returns detail messages. */
export function checkStoryCoverage(
	body:         HldBody,
	epicStoryIds: readonly string[],
): readonly string[] {
	const details: string[] = [];
	const epicSet = new Set(epicStoryIds);
	const boundaryStories = new Set(body.storyBoundaries.map(s => s.storyId));

	for (const id of epicSet) {
		if (!boundaryStories.has(id)) {
			details.push(`Story '${id}' from Epic missing in storyBoundaries (sb1)`);
		}
	}
	for (const sc of body.sharedContracts) {
		if (!epicSet.has(sc.ownedByStory)) {
			details.push(`Shared contract '${sc.id}' owned by unknown Story '${sc.ownedByStory}' (sc1)`);
		}
		for (const c of sc.consumedByStories) {
			if (!epicSet.has(c)) {
				details.push(`Shared contract '${sc.id}' consumed by unknown Story '${c}' (sc2)`);
			}
		}
	}
	return details;
}

/** Every Story appears in exactly one rollout phase. */
export function checkRolloutCoverage(
	body:         HldBody,
	epicStoryIds: readonly string[],
): readonly string[] {
	const details: string[] = [];
	const seen: Record<string, number> = {};
	for (const p of body.rolloutOverview.phases) {
		for (const s of p.includesStories) {
			seen[s] = (seen[s] ?? 0) + 1;
		}
	}
	for (const id of epicStoryIds) {
		const count = seen[id] ?? 0;
		if (count === 0) details.push(`Story '${id}' not covered by any rollout phase (ro1)`);
		if (count > 1)   details.push(`Story '${id}' appears in ${count} rollout phases (ro1)`);
	}
	for (const s of Object.keys(seen)) {
		if (!epicStoryIds.includes(s)) {
			details.push(`Rollout references unknown Story '${s}'`);
		}
	}
	return details;
}

/** Every shared contract is owned by exactly one Story boundary
 *  (redundancy vs sharedContracts.ownedByStory — cross-check). */
export function checkOwnershipConsistency(body: HldBody): readonly string[] {
	const details: string[] = [];
	const scOwner: Record<string, string> = {};
	for (const sc of body.sharedContracts) scOwner[sc.id] = sc.ownedByStory;
	const boundaryOwns: Record<string, string[]> = {};
	for (const sb of body.storyBoundaries) {
		for (const scId of sb.owns) {
			if (boundaryOwns[scId] === undefined) boundaryOwns[scId] = [];
			boundaryOwns[scId]!.push(sb.storyId);
		}
	}
	for (const [scId, owner] of Object.entries(scOwner)) {
		const boundary = boundaryOwns[scId] ?? [];
		if (boundary.length === 0) {
			details.push(`Shared contract '${scId}' has ownedByStory='${owner}' but no Story boundary owns it (sb2)`);
		} else if (boundary.length > 1) {
			details.push(`Shared contract '${scId}' owned by multiple Story boundaries: ${boundary.join(', ')} (sb2)`);
		} else if (boundary[0] !== owner) {
			details.push(`Shared contract '${scId}': ownedByStory='${owner}' vs boundary owner='${boundary[0]}' (sb2)`);
		}
	}
	return details;
}

/** Type-level-only interfaceSketch heuristic: no `return`, no `{`
 *  after a `)`, no clearly-imperative statements. Flags obvious
 *  implementation leaks in the sharedContract sketches. */
export function checkInterfaceSketchTypeLevel(body: HldBody): readonly string[] {
	const details: string[] = [];
	const bannedTokens = [
		/\breturn\b/,
		/\bconsole\.\w+/,
		/=>\s*\{[\s\S]*?[^;{}]\s*;/m,     // arrow with a body containing a statement
	];
	for (const sc of body.sharedContracts) {
		const sketch = sc.interfaceSketch;
		for (const re of bannedTokens) {
			if (re.test(sketch)) {
				details.push(`Shared contract '${sc.id}' interfaceSketch contains implementation-like text (sc3)`);
				break;
			}
		}
	}
	return details;
}
