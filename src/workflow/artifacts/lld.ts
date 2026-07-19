/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LldArtifact — Phase D.
 *
 * Shape mirrors `plans/workflow-design.md` §7.2. One artifact per
 * Story in the approved Epic. Renders to
 * `docs/designs/<epic-slug>/<story-id>.md`.
 *
 * Anchors to a specific effective HLD state via `hldBaseRunId` +
 * `hldEffectiveHash`. Phase D always sees zero amendments so
 * `hldEffectiveHash === sha256(hldBaseRunId)` — Phase E extends
 * the computation when amendments land.
 */

import { createHash } from 'node:crypto';

import { artifactIdMarker, lldArtifactId } from '../storage.js';
import { trackerRefLine } from '../tracker/refs.js';
import type { Alternative, HldArtifact, SharedContract, StoryBoundary } from './hld.js';
import type { ArtifactMetaBase, Citation, WorkflowArtifact } from '../types.js';

// ---------------------------------------------------------------------------
// Sub-shapes
// ---------------------------------------------------------------------------

export interface HldContextSlice {
	readonly frameworkSummary: string;
	readonly ownedContracts:   readonly SharedContract[];
	readonly consumedContracts: readonly SharedContract[];
	readonly boundary:         StoryBoundary;
	readonly rolloutPhase:     string;             // phase name this Story sits in
	readonly nonFunctional:    {
		readonly performance?:   string;
		readonly security?:      string;
		readonly observability?: string;
		readonly durability?:    string;
	};
}

export interface ApiSpec {
	readonly name:           string;
	readonly signature:      string;
	readonly parameters:     readonly { readonly name: string; readonly type: string; readonly purpose: string; readonly optional: boolean }[];
	readonly returns:        { readonly type: string; readonly meaning: string };
	readonly errors:         readonly { readonly type: string; readonly condition: string }[];
	readonly preconditions:  readonly string[];
	readonly postconditions: readonly string[];
}

export interface ContractDetails {
	readonly surfaceLevel: 'internal' | 'internal-shared' | 'public';
	readonly api:          readonly ApiSpec[];
}

export type DataModelChange = {
	readonly entity:     string;
	readonly change:     'new' | 'field-add' | 'field-modify' | 'field-remove' | 'invariant-change';
	readonly details:    string;
	readonly schemaDiff?: string;
	readonly callSites:  readonly string[];
};

export interface SharedInteraction {
	readonly contractId: string;                    // sharedContract id from HLD
	readonly role:       'implements' | 'consumes';
	readonly howDetails: string;
}

export interface ErrorPaths {
	readonly errorCases: readonly {
		readonly scenario:    string;
		readonly detection:   string;
		readonly response:    string;
		readonly userImpact:  string;
		readonly recoverable: boolean;
	}[];
	readonly edgeCases: readonly {
		readonly input:    string;
		readonly expected: string;
	}[];
	readonly invariantsToPreserve: readonly {
		readonly text:   string;
		readonly source: string;                    // citation id
	}[];
}

export interface TestStrategy {
	readonly testLevels: readonly {
		readonly level:          'unit' | 'integration' | 'live' | 'smoke' | 'contract';
		readonly purpose:        string;
		readonly subjects:       readonly string[];
		readonly fixturesNeeded?: readonly string[];
	}[];
	readonly acceptanceMapping: readonly {
		readonly criterionId:  string;              // 'ac1' from Epic
		readonly provingTests: readonly string[];
	}[];
	readonly testFramework: string;
}

export interface Migration {
	readonly stateBefore:  string;
	readonly stateAfter:   string;
	readonly migrationSteps: readonly {
		readonly order:              number;
		readonly action:             string;
		readonly rollbackable:       boolean;
		readonly prerequisiteFlags?: readonly string[];
	}[];
	readonly backwardCompat:    string;
	readonly zeroDowntime:      boolean;
	readonly dataRewriteRequired: boolean;
}

// ---------------------------------------------------------------------------
// LLD body
// ---------------------------------------------------------------------------

export interface LldBody {
	readonly hldContextSlice:      HldContextSlice;
	readonly contractDetails:      ContractDetails;
	readonly dataModelChanges:     readonly DataModelChange[];
	readonly interactionWithShared: readonly SharedInteraction[];
	readonly errorPaths:           ErrorPaths;
	readonly testStrategy:         TestStrategy;
	readonly migration?:           Migration;                    // enhancement flavor only
	readonly alternativesConsidered: readonly Alternative[];
	readonly chosenAlternative:    string;                       // alternative id
	readonly openQuestions:        readonly string[];
}

// LLD meta extends the base with HLD anchoring. Every LLD carries
// the Epic hash (canonical Epic identity) + slug (display only).
// `questionResolutions` is inherited from `ArtifactMetaBase` (shared
// across DEF/HLD/LLD — see `workflow/questions.ts`).
export interface LldMeta extends ArtifactMetaBase {
	readonly epicHash:             string;
	readonly epicSlug:             string;
	readonly storyId:              string;
	readonly hldBaseRunId:         string;
	readonly hldEffectiveHash:     string;
	readonly hldAmendmentsApplied: readonly string[];
	readonly staleReason?:         string;
}

export interface LldArtifact {
	readonly meta:      LldMeta;
	readonly body:      LldBody;
	readonly citations: readonly Citation[];
}

// Cheap runtime type guard that any WorkflowArtifact shape matches
// (structural only — for use in orchestrator's finalize path).
export type LldWorkflowArtifact = WorkflowArtifact<LldBody>;

export const LLD_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Effective HLD hash
// ---------------------------------------------------------------------------

/** Compute the effective HLD hash: `sha256(baseRunId || approvedAmendmentIds...)`.
 *  Kept deterministic so the same inputs always produce the same
 *  hash — Phase E's amendment applier will call this same helper. */
export function computeHldEffectiveHash(
	baseRunId:            string,
	approvedAmendmentIds: readonly string[],
): string {
	const h = createHash('sha256');
	h.update(baseRunId);
	for (const id of approvedAmendmentIds) {
		h.update('|');
		h.update(id);
	}
	return h.digest('hex');
}

// ---------------------------------------------------------------------------
// HLD slice extractor
// ---------------------------------------------------------------------------

/** Project the HLD to just the pieces this Story leans on:
 *   - The Story's boundary entry
 *   - Every shared contract this Story owns or consumes
 *   - The rollout phase this Story sits in
 *   - The framework summary + non-functional targets
 *  Throws when the Story id doesn't exist in the HLD.
 */
export function extractHldContextSlice(hld: HldArtifact, storyId: string): HldContextSlice {
	const boundary = hld.body.storyBoundaries.find(sb => sb.storyId === storyId);
	if (boundary === undefined) {
		throw new Error(
			`extractHldContextSlice: HLD has no storyBoundaries entry for Story '${storyId}'. ` +
			`Amend or re-run the HLD to cover this Story.`,
		);
	}
	const ownedContracts    = hld.body.sharedContracts.filter(sc => sc.ownedByStory === storyId);
	const consumedContracts = hld.body.sharedContracts.filter(sc => sc.consumedByStories.includes(storyId));
	const phase = hld.body.rolloutOverview.phases.find(p => p.includesStories.includes(storyId));
	const rolloutPhase = phase === undefined ? '<not in any phase>' : phase.name;
	return {
		frameworkSummary: hld.body.frameworkSummary,
		ownedContracts,
		consumedContracts,
		boundary,
		rolloutPhase,
		nonFunctional: hld.body.nonFunctional,
	};
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderLldMarkdown(artifact: LldArtifact): string {
	const { body, meta } = artifact;
	const lines: string[] = [];
	if (typeof meta.epicHash === 'string' && meta.epicHash.length > 0) {
		lines.push(artifactIdMarker(lldArtifactId(meta.epicHash, meta.storyId)));
		lines.push('');
	}
	lines.push(`# LLD: ${meta.storyId}`);
	lines.push('');
	lines.push(`**Epic:** \`${meta.epicSlug}\``);
	lines.push(`**HLD base run:** \`${meta.hldBaseRunId}\``);
	lines.push(`**HLD effective hash:** \`${meta.hldEffectiveHash.slice(0, 12)}...\``);
	const storyRef = (meta as { tracker?: { storyRef?: string } }).tracker?.storyRef;
	if (typeof storyRef === 'string' && storyRef.includes('#')) {
		lines.push(trackerRefLine(storyRef));
	}
	lines.push('');

	lines.push('## HLD context');
	lines.push('');
	lines.push(`**Framework:** ${body.hldContextSlice.frameworkSummary}`);
	lines.push(`**Rollout phase:** ${body.hldContextSlice.rolloutPhase}`);
	if (body.hldContextSlice.ownedContracts.length > 0) {
		lines.push(`**Owns:** ${body.hldContextSlice.ownedContracts.map(c => `\`${c.id}\` (${c.name})`).join(', ')}`);
	}
	if (body.hldContextSlice.consumedContracts.length > 0) {
		lines.push(`**Consumes:** ${body.hldContextSlice.consumedContracts.map(c => `\`${c.id}\` (${c.name})`).join(', ')}`);
	}
	lines.push('');

	lines.push('## Contract details');
	lines.push('');
	lines.push(`**Surface level:** ${body.contractDetails.surfaceLevel}`);
	lines.push('');
	for (const api of body.contractDetails.api) {
		lines.push(`### \`${api.name}\``);
		lines.push('');
		lines.push('```typescript');
		lines.push(api.signature);
		lines.push('```');
		lines.push('');
		if (api.parameters.length > 0) {
			lines.push('**Parameters:**');
			for (const p of api.parameters) {
				const opt = p.optional ? ' _(optional)_' : '';
				lines.push(`- \`${p.name}: ${p.type}\`${opt} — ${p.purpose}`);
			}
			lines.push('');
		}
		lines.push(`**Returns:** \`${api.returns.type}\` — ${api.returns.meaning}`);
		lines.push('');
		if (api.errors.length > 0) {
			lines.push('**Errors:**');
			for (const e of api.errors) lines.push(`- \`${e.type}\` when ${e.condition}`);
			lines.push('');
		}
		if (api.preconditions.length > 0) {
			lines.push('**Preconditions:**');
			for (const pc of api.preconditions) lines.push(`- ${pc}`);
			lines.push('');
		}
		if (api.postconditions.length > 0) {
			lines.push('**Postconditions:**');
			for (const pc of api.postconditions) lines.push(`- ${pc}`);
			lines.push('');
		}
	}

	if (body.dataModelChanges.length > 0) {
		lines.push('## Data model changes');
		lines.push('');
		for (const d of body.dataModelChanges) {
			lines.push(`### \`${d.entity}\` — ${d.change}`);
			lines.push('');
			lines.push(d.details);
			lines.push('');
			if (d.schemaDiff !== undefined) {
				lines.push('```');
				lines.push(d.schemaDiff);
				lines.push('```');
				lines.push('');
			}
			if (d.callSites.length > 0) {
				lines.push('**Call sites:**');
				for (const cs of d.callSites) lines.push(`- \`${cs}\``);
				lines.push('');
			}
		}
	}

	if (body.interactionWithShared.length > 0) {
		lines.push('## Interaction with shared contracts');
		lines.push('');
		lines.push('| Contract | Role | How |');
		lines.push('| :--- | :--- | :--- |');
		for (const i of body.interactionWithShared) {
			lines.push(`| \`${i.contractId}\` | ${i.role} | ${escapePipes(i.howDetails)} |`);
		}
		lines.push('');
	}

	lines.push('## Error paths');
	lines.push('');
	if (body.errorPaths.errorCases.length > 0) {
		lines.push('### Error cases');
		lines.push('');
		for (const e of body.errorPaths.errorCases) {
			const rec = e.recoverable ? 'recoverable' : 'terminal';
			lines.push(`- **${e.scenario}** (${rec})`);
			lines.push(`  - Detection: ${e.detection}`);
			lines.push(`  - Response: ${e.response}`);
			lines.push(`  - User impact: ${e.userImpact}`);
		}
		lines.push('');
	}
	if (body.errorPaths.edgeCases.length > 0) {
		lines.push('### Edge cases');
		lines.push('');
		lines.push('| Input | Expected |');
		lines.push('| :--- | :--- |');
		for (const ec of body.errorPaths.edgeCases) {
			lines.push(`| ${escapePipes(ec.input)} | ${escapePipes(ec.expected)} |`);
		}
		lines.push('');
	}
	if (body.errorPaths.invariantsToPreserve.length > 0) {
		lines.push('### Invariants to preserve');
		lines.push('');
		for (const iv of body.errorPaths.invariantsToPreserve) {
			lines.push(`- ${iv.text} [[${iv.source}]]`);
		}
		lines.push('');
	}

	lines.push('## Test strategy');
	lines.push('');
	lines.push(`**Test framework:** \`${body.testStrategy.testFramework}\``);
	lines.push('');
	lines.push('### Test levels');
	lines.push('');
	for (const tl of body.testStrategy.testLevels) {
		lines.push(`- **${tl.level}** — ${tl.purpose}`);
		if (tl.subjects.length > 0) lines.push(`  - Subjects: ${tl.subjects.map(s => `\`${s}\``).join(', ')}`);
		if (tl.fixturesNeeded !== undefined && tl.fixturesNeeded.length > 0) {
			lines.push(`  - Fixtures: ${tl.fixturesNeeded.map(f => `\`${f}\``).join(', ')}`);
		}
	}
	lines.push('');
	if (body.testStrategy.acceptanceMapping.length > 0) {
		lines.push('### Acceptance mapping');
		lines.push('');
		lines.push('| Criterion | Proving tests |');
		lines.push('| :--- | :--- |');
		for (const am of body.testStrategy.acceptanceMapping) {
			lines.push(`| \`${am.criterionId}\` | ${am.provingTests.map(t => `\`${t}\``).join(', ')} |`);
		}
		lines.push('');
	}

	if (body.migration !== undefined) {
		lines.push('## Migration');
		lines.push('');
		lines.push(`**State before:** ${body.migration.stateBefore}`);
		lines.push('');
		lines.push(`**State after:** ${body.migration.stateAfter}`);
		lines.push('');
		lines.push(`**Zero downtime:** ${body.migration.zeroDowntime ? 'yes' : 'no'} — **Data rewrite:** ${body.migration.dataRewriteRequired ? 'yes' : 'no'}`);
		lines.push('');
		lines.push('### Steps');
		lines.push('');
		for (const s of [...body.migration.migrationSteps].sort((a, b) => a.order - b.order)) {
			const rb = s.rollbackable ? '↩ rollbackable' : '✕ non-rollbackable';
			const flags = s.prerequisiteFlags === undefined || s.prerequisiteFlags.length === 0
				? ''
				: ` _(needs: ${s.prerequisiteFlags.map(f => `\`${f}\``).join(', ')})_`;
			lines.push(`${s.order}. ${s.action} — ${rb}${flags}`);
		}
		lines.push('');
		if (body.migration.backwardCompat.length > 0) {
			lines.push(`**Backward compat:** ${body.migration.backwardCompat}`);
			lines.push('');
		}
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

function escapePipes(s: string): string { return s.replace(/\|/g, '\\|'); }

// ---------------------------------------------------------------------------
// Runtime type guards
// ---------------------------------------------------------------------------

export function isLldBody(v: unknown): v is LldBody {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	if (typeof r['hldContextSlice']  !== 'object' || r['hldContextSlice']  === null) return false;
	if (typeof r['contractDetails']  !== 'object' || r['contractDetails']  === null) return false;
	if (!Array.isArray(r['dataModelChanges']))       return false;
	if (!Array.isArray(r['interactionWithShared']))  return false;
	if (typeof r['errorPaths']    !== 'object' || r['errorPaths']    === null) return false;
	if (typeof r['testStrategy']  !== 'object' || r['testStrategy']  === null) return false;
	if (!Array.isArray(r['alternativesConsidered'])) return false;
	if (typeof r['chosenAlternative'] !== 'string')  return false;
	if (!Array.isArray(r['openQuestions']))          return false;
	return true;
}

export function isCitationArray(v: unknown): v is Citation[] {
	if (!Array.isArray(v)) return false;
	for (const c of v) {
		if (typeof c !== 'object' || c === null) return false;
		const r = c as Record<string, unknown>;
		if (typeof r['id']   !== 'string') return false;
		if (typeof r['kind'] !== 'string') return false;
		if (typeof r['ref']  !== 'string') return false;
	}
	return true;
}

// ---------------------------------------------------------------------------
// Cross-artifact validations
// ---------------------------------------------------------------------------

/** Every `interactionWithShared[].contractId` must resolve to a
 *  real HLD shared contract id. */
export function checkSharedContractRefs(
	body: LldBody,
	hld:  HldArtifact,
): readonly string[] {
	const details: string[] = [];
	const scIds = new Set(hld.body.sharedContracts.map(c => c.id));
	for (const i of body.interactionWithShared) {
		if (!scIds.has(i.contractId)) {
			details.push(`interactionWithShared '${i.contractId}' does not resolve to a HLD sharedContract`);
		}
	}
	return details;
}

/** For every shared contract this LLD claims to `implement`, HLD's
 *  `ownedByStory` for that contract must equal this LLD's storyId. */
export function checkImplementOwnership(
	body:    LldBody,
	hld:     HldArtifact,
	storyId: string,
): readonly string[] {
	const details: string[] = [];
	for (const i of body.interactionWithShared) {
		if (i.role !== 'implements') continue;
		const sc = hld.body.sharedContracts.find(c => c.id === i.contractId);
		if (sc === undefined) continue;   // caught by checkSharedContractRefs
		if (sc.ownedByStory !== storyId) {
			details.push(
				`LLD for '${storyId}' claims to IMPLEMENT '${i.contractId}' ` +
				`but HLD says it is owned by '${sc.ownedByStory}'`,
			);
		}
	}
	return details;
}

/** Every acceptance-criterion id in `testStrategy.acceptanceMapping`
 *  must match a real criterion on the Story from the Epic. */
export function checkAcceptanceMapping(
	body:         LldBody,
	storyAcIds:   readonly string[],
): readonly string[] {
	const details: string[] = [];
	const acSet = new Set(storyAcIds);
	for (const am of body.testStrategy.acceptanceMapping) {
		if (!acSet.has(am.criterionId)) {
			details.push(`testStrategy.acceptanceMapping references unknown criterion '${am.criterionId}'`);
		}
	}
	// Every Story acceptance criterion must have at least one proving test.
	const mapped = new Set(body.testStrategy.acceptanceMapping.map(am => am.criterionId));
	for (const id of storyAcIds) {
		if (!mapped.has(id)) {
			details.push(`Story acceptance criterion '${id}' has no proving test in acceptanceMapping`);
		}
	}
	return details;
}

/** Heuristic: contractDetails.api signatures must not contain a
 *  function body. Matches obvious `=> { statement; }` or standalone
 *  `{ ... return ... }` patterns. Same spirit as HLD's
 *  interfaceSketch guard. */
export function checkApiSignaturesTypeLevel(body: LldBody): readonly string[] {
	const details: string[] = [];
	for (const api of body.contractDetails.api) {
		if (/\{[^{}]*\breturn\b[^{}]*\}/s.test(api.signature)) {
			details.push(`API '${api.name}' signature contains a function body`);
		}
	}
	return details;
}
