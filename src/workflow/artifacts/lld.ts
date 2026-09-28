/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LldArtifact — Phase D.
 *
 * Shape mirrors `plans/workflow-design.md` §7.2. One artifact per
 * Story in the approved Epic. Renders to the work item's nested `LLD.md`
 * (sc2: `docs/{epics|standalone}/<slug>-E<date><hash8>/S<nnn>/LLD.md`).
 *
 * Anchors to a specific effective HLD state via `hldBaseRunId` +
 * `hldEffectiveHash`. Phase D always sees zero amendments so
 * `hldEffectiveHash === sha256(hldBaseRunId)` — Phase E extends
 * the computation when amendments land.
 */

import { createHash } from 'node:crypto';

import { artifactIdMarker, lldArtifactId } from '../storage.js';
import { safeCanonical, storyWorkflowId } from '../id.js';
import { trackerRefLine } from '../tracker/refs.js';
import type { Alternative, HldArtifact, SharedContract, StoryBoundary } from './hld.js';
import type { ArtifactMetaBase, Citation, WorkflowArtifact } from '../types.js';
import type { FunctionalDefinition } from './functional-definition.js';
import { renderFunctionalRequirementsSection } from './functional-definition.js';
import type { DocumentSummary, SharedContextRef } from './format/types.js';
import { renderFromFormat, deriveHldContextRef, type SectionBindings, type SectionItem } from './format/engine.js';
import { citationBodyLines, frBodyLines, companionBodyLines } from './format/bindings.js';
import { resolveDocumentFormat } from './format/template-loader.js';
import type { BoundaryFinding } from '../synthesizer.js';
import type { ErDefinition } from './companion/er.js';
import type { CompanionArtifactRef } from './companion/types.js';

// ---------------------------------------------------------------------------
// Sub-shapes
// ---------------------------------------------------------------------------

export interface HldContextSlice {
	readonly frameworkSummary: string;
	readonly ownedContracts:   readonly SharedContract[];
	readonly consumedContracts: readonly SharedContract[];
	readonly boundary:         StoryBoundary;
	// Every OTHER Story's boundary in this HLD — the sibling scope this Story
	// must NOT design or implement. Surfaced so the authoring LLM knows the
	// larger scope and stays inside its own boundary (consume adjacent
	// contracts, never re-design them). Empty for a single-story / standalone HLD.
	readonly adjacentBoundaries: readonly StoryBoundary[];
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
	/** sc1 (S001): additive + absent-safe functional-definition record (k2/k6). */
	readonly functionalDefinition?: FunctionalDefinition | undefined;
	/** sc3 (S002): plain-language, Story-scoped Summary/abstract. Additive + absent-safe. */
	readonly summary?: DocumentSummary | undefined;
	/** sc3 (S002): references to upstream shared context (the HLD-context de-dup, ac2).
	 *  Absent → the renderer uses deriveHldContextRef(epicHash). */
	readonly contextRefs?: readonly SharedContextRef[] | undefined;
	/** sc4 (S003): the authored ER data-model element (source of truth for an ER
	 *  companion). Additive + absent-safe — absent bodies type-check + render
	 *  unchanged (k6). */
	readonly erDefinition?: ErDefinition | undefined;
	/** sc4 (S003): out-of-body companion references (rendered as links in the
	 *  Diagrams (`diagramsEr`) extension slot, never inlined). Additive + absent-safe. */
	readonly companions?: readonly CompanionArtifactRef[] | undefined;
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
	// Sibling boundaries — every Story other than this one. This is the ONLY
	// place the authoring LLM learns the larger scope: the work owned by the
	// stories it must not step on. Order preserved; empty for a single-story HLD.
	const adjacentBoundaries = hld.body.storyBoundaries.filter(sb => sb.storyId !== storyId);
	const phase = hld.body.rolloutOverview.phases.find(p => p.includesStories.includes(storyId));
	const rolloutPhase = phase === undefined ? '<not in any phase>' : phase.name;
	return {
		frameworkSummary: hld.body.frameworkSummary,
		ownedContracts,
		consumedContracts,
		boundary,
		adjacentBoundaries,
		rolloutPhase,
		nonFunctional: hld.body.nonFunctional,
	};
}

// ---------------------------------------------------------------------------
// Adjacent-scope ownership guard (deterministic)
// ---------------------------------------------------------------------------

/** Deterministic scope-boundary check: flag any shared-contract interaction in
 *  which THIS Story's LLD claims to `implements` a contract that the HLD assigns
 *  to a DIFFERENT (adjacent) Story. Implementing a sibling-owned contract is a
 *  literal cross-story ownership collision — the over-reach this feature guards
 *  against. Complements the LLM-judged `sbdry5` checklist item (which covers the
 *  semantic case); this catches the unambiguous, certainly-detectable one.
 *
 *  NARROW BY DESIGN:
 *   - Only `role: 'implements'` is a collision. A `role: 'consumes'` of an
 *     adjacent-owned contract is legitimate (that is exactly how a Story leans
 *     on a sibling's contract) and is never flagged.
 *   - No-op when `adjacentBoundaries` is empty/absent (a standalone or
 *     single-story LLD has no siblings to collide with) — returns [].
 *
 *  Pure + deterministic (no LLM, no I/O). Returns the existing `BoundaryFinding`
 *  shape so the orchestrator routes findings through the same
 *  `boundaryHardFailure(retryable:false)` sink as the `sbdry` checklist items.
 */
export function findAdjacentScopeViolations(
	body:  LldArtifact['body'],
	slice: HldContextSlice,
): BoundaryFinding[] {
	const adjacent = slice.adjacentBoundaries ?? [];
	if (adjacent.length === 0) return [];
	// contractId -> owning sibling storyId, across every adjacent boundary.
	const ownedByAdjacent = new Map<string, string>();
	for (const sb of adjacent) {
		for (const contractId of sb.owns) ownedByAdjacent.set(contractId, sb.storyId);
	}
	if (ownedByAdjacent.size === 0) return [];
	const findings: BoundaryFinding[] = [];
	for (const interaction of body.interactionWithShared) {
		if (interaction.role !== 'implements') continue;
		const owner = ownedByAdjacent.get(interaction.contractId);
		if (owner === undefined) continue;
		findings.push({
			itemId: 'sbdry5',
			verdict: 'missed',
			detail:
				`LLD implements shared contract \`${interaction.contractId}\`, which the HLD assigns to ` +
				`adjacent Story '${owner}'. Consume that contract instead of re-implementing it, or raise ` +
				`an HLD amendment to reassign ownership.`,
		});
	}
	return findings;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderLldMarkdown(artifact: LldArtifact): string {
	const { body, meta } = artifact;
	const eh = typeof meta.epicHash === 'string' && meta.epicHash.length > 0 ? meta.epicHash : undefined;
	const marker = eh !== undefined ? artifactIdMarker(lldArtifactId(meta.epicHash, meta.storyId)) : undefined;
	const lldSid = eh !== undefined ? safeCanonical(() => storyWorkflowId(eh, meta.createdAt, meta.storyId)) : undefined;
	const h1 = `LLD: ${lldSid ?? meta.storyId}`;
	const isStandalone = (meta as { standalone?: boolean }).standalone === true;

	const summaryLines = (): string[] => {
		const out: string[] = [`**Epic:** \`${meta.epicSlug}\``];
		if (typeof meta.hldBaseRunId === 'string' && meta.hldBaseRunId.length > 0) out.push(`**HLD base run:** \`${meta.hldBaseRunId}\``);
		if (typeof meta.hldEffectiveHash === 'string' && meta.hldEffectiveHash.length > 0) out.push(`**HLD effective hash:** \`${meta.hldEffectiveHash.slice(0, 12)}...\``);
		const seededFromSpec = (meta as { seededFromSpec?: string }).seededFromSpec;
		if (typeof seededFromSpec === 'string' && seededFromSpec.length > 0) out.push(`**Seeded from:** \`SPEC-${seededFromSpec}\``);
		const storyRef = (meta as { tracker?: { storyRef?: string } }).tracker?.storyRef;
		if (typeof storyRef === 'string' && storyRef.includes('#')) out.push(trackerRefLine(storyRef));
		if (body.summary?.prose !== undefined && body.summary.prose.length > 0) out.push('', body.summary.prose);
		return out;
	};

	// HLD context: the framework summary is DE-DUPED to a reference (ac2) when a
	// real parent HLD exists (or the body carries explicit contextRefs); a
	// standalone LLD renders it inline (there is no HLD to reference). The LLD's
	// own boundary slice (rollout phase / owns / consumes / adjacent) always shows.
	const hldContextContent = (): { ref?: SharedContextRef; lines: string[] } => {
		const slice = body.hldContextSlice;
		const boundary: string[] = [`**Rollout phase:** ${slice.rolloutPhase}`];
		if (slice.ownedContracts.length > 0)    boundary.push(`**Owns:** ${slice.ownedContracts.map(c => `\`${c.id}\` (${c.name})`).join(', ')}`);
		if (slice.consumedContracts.length > 0) boundary.push(`**Consumes:** ${slice.consumedContracts.map(c => `\`${c.id}\` (${c.name})`).join(', ')}`);
		const adjacent = slice.adjacentBoundaries ?? [];
		if (adjacent.length > 0) {
			boundary.push('', '**Adjacent scope (owned by other stories — do NOT implement here):**');
			for (const sb of adjacent) {
				const owns = sb.owns.length > 0 ? ` — owns ${sb.owns.map(o => `\`${o}\``).join(', ')}` : '';
				boundary.push(`- \`${sb.storyId}\`: ${sb.internal}${owns}`);
			}
		}
		const explicit = body.contextRefs !== undefined && body.contextRefs.length > 0 ? body.contextRefs[0] : undefined;
		const ref = explicit ?? (eh !== undefined && !isStandalone ? deriveHldContextRef(eh) : undefined);
		if (ref !== undefined) return { ref, lines: boundary };
		// No HLD to reference (standalone) → render the framework summary inline.
		return { lines: [`**Framework:** ${slice.frameworkSummary}`, ...boundary] };
	};

	const apiItem = (api: LldBody['contractDetails']['api'][number]): SectionItem => {
		const l: string[] = ['```typescript', api.signature, '```', ''];
		if (api.parameters.length > 0) {
			l.push('**Parameters:**');
			for (const p of api.parameters) l.push(`- \`${p.name}: ${p.type}\`${p.optional ? ' _(optional)_' : ''} — ${p.purpose}`);
			l.push('');
		}
		l.push(`**Returns:** \`${api.returns.type}\` — ${api.returns.meaning}`);
		if (api.errors.length > 0) { l.push('', '**Errors:**'); for (const e of api.errors) l.push(`- \`${e.type}\` when ${e.condition}`); }
		if (api.preconditions.length > 0) { l.push('', '**Preconditions:**'); for (const pc of api.preconditions) l.push(`- ${pc}`); }
		if (api.postconditions.length > 0) { l.push('', '**Postconditions:**'); for (const pc of api.postconditions) l.push(`- ${pc}`); }
		return { title: `\`${api.name}\``, lines: l };
	};

	const dmItem = (d: LldBody['dataModelChanges'][number]): SectionItem => {
		const l: string[] = [d.details, ''];
		if (d.schemaDiff !== undefined) l.push('```', d.schemaDiff, '```', '');
		if (d.callSites.length > 0) { l.push('**Call sites:**'); for (const cs of d.callSites) l.push(`- \`${cs}\``); }
		return { title: `\`${d.entity}\` — ${d.change}`, lines: l };
	};

	const errorPathsLines = (): string[] => {
		const l: string[] = [];
		if (body.errorPaths.errorCases.length > 0) {
			l.push('**Error cases**', '');
			for (const e of body.errorPaths.errorCases) {
				l.push(`- **${e.scenario}** (${e.recoverable ? 'recoverable' : 'terminal'})`, `  - Detection: ${e.detection}`, `  - Response: ${e.response}`, `  - User impact: ${e.userImpact}`);
			}
			l.push('');
		}
		if (body.errorPaths.edgeCases.length > 0) {
			l.push('**Edge cases**', '', '| Input | Expected |', '| :--- | :--- |');
			for (const ec of body.errorPaths.edgeCases) l.push(`| ${escapePipes(ec.input)} | ${escapePipes(ec.expected)} |`);
			l.push('');
		}
		if (body.errorPaths.invariantsToPreserve.length > 0) {
			l.push('**Invariants to preserve**', '');
			for (const iv of body.errorPaths.invariantsToPreserve) l.push(`- ${iv.text} [[${iv.source}]]`);
		}
		while (l.length > 0 && l[l.length - 1] === '') l.pop();
		return l;
	};

	const testStrategyLines = (): string[] => {
		const l: string[] = [`**Test framework:** \`${body.testStrategy.testFramework}\``, '', '**Test levels**', ''];
		for (const tl of body.testStrategy.testLevels) {
			l.push(`- **${tl.level}** — ${tl.purpose}`);
			if (tl.subjects.length > 0) l.push(`  - Subjects: ${tl.subjects.map(s => `\`${s}\``).join(', ')}`);
			if (tl.fixturesNeeded !== undefined && tl.fixturesNeeded.length > 0) l.push(`  - Fixtures: ${tl.fixturesNeeded.map(f => `\`${f}\``).join(', ')}`);
		}
		if (body.testStrategy.acceptanceMapping.length > 0) {
			l.push('', '**Acceptance mapping**', '', '| Criterion | Proving tests |', '| :--- | :--- |');
			for (const am of body.testStrategy.acceptanceMapping) l.push(`| \`${am.criterionId}\` | ${am.provingTests.map(t => `\`${t}\``).join(', ')} |`);
		}
		return l;
	};

	const migrationLines = (): string[] => {
		if (body.migration === undefined) return [];
		const m = body.migration;
		const l: string[] = [`**State before:** ${m.stateBefore}`, '', `**State after:** ${m.stateAfter}`, '',
			`**Zero downtime:** ${m.zeroDowntime ? 'yes' : 'no'} — **Data rewrite:** ${m.dataRewriteRequired ? 'yes' : 'no'}`, '', '**Steps**', ''];
		for (const s of [...m.migrationSteps].sort((a, b) => a.order - b.order)) {
			const rb = s.rollbackable ? '↩ rollbackable' : '✕ non-rollbackable';
			const flags = s.prerequisiteFlags === undefined || s.prerequisiteFlags.length === 0 ? '' : ` _(needs: ${s.prerequisiteFlags.map(f => `\`${f}\``).join(', ')})_`;
			l.push(`${s.order}. ${s.action} — ${rb}${flags}`);
		}
		if (m.backwardCompat.length > 0) l.push('', `**Backward compat:** ${m.backwardCompat}`);
		return l;
	};

	const altItem = (a: LldBody['alternativesConsidered'][number]): SectionItem => {
		const badge = a.id === body.chosenAlternative ? ' — **CHOSEN**' : '';
		const l: string[] = [a.oneLineSummary, '', a.approach];
		if (a.reasonRejected !== undefined && a.reasonRejected.length > 0) l.push('', `**Rejected because:** ${a.reasonRejected}`);
		return { title: `${a.id}: ${a.name}${badge}`, lines: l };
	};

	const interactionLines = (): string[] => {
		const l = ['| Contract | Role | How |', '| :--- | :--- | :--- |'];
		for (const i of body.interactionWithShared) l.push(`| \`${i.contractId}\` | ${i.role} | ${escapePipes(i.howDetails)} |`);
		return l;
	};

	const bindings: SectionBindings = {
		summary:     () => ({ lines: summaryLines() }),
		hldContext:  () => hldContextContent(),
		fr:          () => { const f = frBodyLines(body.functionalDefinition); return f.length > 0 ? { lines: f } : { omit: true }; },
		contract:    () => ({ lines: [`**Surface level:** ${body.contractDetails.surfaceLevel}`], items: body.contractDetails.api.map(apiItem) }),
		dataModel:   () => body.dataModelChanges.length > 0 ? { items: body.dataModelChanges.map(dmItem) } : { omit: true },
		diagramsEr:  () => { const l = companionBodyLines(body.companions); return l.length > 0 ? { lines: l } : { omit: true }; },
		interaction: () => body.interactionWithShared.length > 0 ? { lines: interactionLines() } : { omit: true },
		errorPaths:  () => ({ lines: errorPathsLines() }),
		testStrategy: () => ({ lines: testStrategyLines() }),
		migration:   () => { const l = migrationLines(); return l.length > 0 ? { lines: l } : { omit: true }; },
		alternatives: () => body.alternativesConsidered.length > 0 ? { items: body.alternativesConsidered.map(altItem) } : { omit: true },
		references:  () => ({ lines: citationBodyLines(artifact.citations) }),
		openQuestions: () => body.openQuestions.length > 0 ? { lines: body.openQuestions.map(q => `- ${q}`) } : { omit: true },
	};
	const format = resolveDocumentFormat('lld', artifact.meta.repoPath);
	return renderFromFormat(format, bindings, marker !== undefined ? { h1, marker } : { h1 });
}

function escapePipes(s: string): string { return s.replace(/\|/g, '\\|'); }

// ---------------------------------------------------------------------------
// Runtime type guards
// ---------------------------------------------------------------------------

/** True iff `o[key]` is an array — for validating nested required arrays. */
function hasArray(o: unknown, key: string): boolean {
	return typeof o === 'object' && o !== null && Array.isArray((o as Record<string, unknown>)[key]);
}

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
	// Nested required arrays iterated unguarded by the checks + renderer. A body
	// whose parent object is present but whose array is missing (a partial LLM
	// emission) must be rejected as a schema-failure here — not throw a
	// TypeError deep in checkApiSignaturesTypeLevel / renderLldMarkdown.
	if (!hasArray(r['contractDetails'], 'api'))                return false;
	if (!hasArray(r['hldContextSlice'], 'ownedContracts'))    return false;
	if (!hasArray(r['hldContextSlice'], 'consumedContracts')) return false;
	if (!hasArray(r['errorPaths'], 'errorCases'))             return false;
	if (!hasArray(r['errorPaths'], 'edgeCases'))              return false;
	if (!hasArray(r['errorPaths'], 'invariantsToPreserve'))   return false;
	if (!hasArray(r['testStrategy'], 'testLevels'))           return false;
	if (!hasArray(r['testStrategy'], 'acceptanceMapping'))    return false;
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
