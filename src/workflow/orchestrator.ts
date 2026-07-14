/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Workflow orchestration hooks: per-workflow decomposer + synthesizer
 * plumbing. The MCP tool + CLI both go through this module — it's
 * the seam that maps a WorkflowIntent to (a) a decomposer prompt
 * for the outer LLM, and (b) a synthesizer prompt + artifact
 * validator for the wrap-up turn.
 *
 * Phase A only implements the `stub` workflow. Later phases plug
 * in `define`, `design.epic`, `design.story`, and the tracker
 * workflows via the same seam.
 */

import { getLogger } from '../shared/logger.js';
import type { WorkflowIntent, WorkflowName, WorkflowPlan } from './types.js';
import type { ValidationResult } from './synthesizer.js';
import { renderCitationBlock, validateBodyAndCitations } from './synthesizer.js';
import {
	isCitationArray,
	isStubArtifact,
	renderStubMarkdown,
	STUB_ARTIFACT_JSON_SCHEMA,
	STUB_SCHEMA_VERSION,
	type StubArtifact,
} from './artifacts/stub.js';
import {
	checkConstraintCoverage,
	checkStoryDependencyGraph,
	DEFINE_SCHEMA_VERSION,
	isCitationArray as isDefineCitationArray,
	isDefineBody,
	renderDefineMarkdown,
	type DefineArtifact,
	type DefineBody,
} from './artifacts/define.js';
import {
	checkInterfaceSketchTypeLevel,
	checkOwnershipConsistency,
	checkRolloutCoverage,
	checkStoryCoverage,
	HLD_SCHEMA_VERSION,
	isCitationArray as isHldCitationArray,
	isHldBody,
	renderHldMarkdown,
	type HldArtifact,
} from './artifacts/hld.js';
import {
	checkAcceptanceMapping,
	checkApiSignaturesTypeLevel,
	checkImplementOwnership,
	checkSharedContractRefs,
	computeHldEffectiveHash,
	extractHldContextSlice,
	isCitationArray as isLldCitationArray,
	isLldBody,
	LLD_SCHEMA_VERSION,
	renderLldMarkdown,
	type LldArtifact,
	type LldBody,
} from './artifacts/lld.js';
import { readBaseHld, readDefineArtifact, requireApprovedEpic, requireApprovedHld } from './gates.js';
import {
	isTrackerChecklistResult,
	isTrackerPostRefs,
	isTrackerPushRefs,
	isTrackerSyncRefs,
	renderTrackerMarkdown,
	TRACKER_SCHEMA_VERSION,
	type TrackerArtifact,
	type TrackerChecklistResult,
	type TrackerPostRefs,
	type TrackerPushRefs,
	type TrackerSyncRefs,
} from './artifacts/tracker.js';
import { defineArtifactPaths, writeAtomic } from './storage.js';
import { readFileSync } from 'node:fs';
import {
	AmendmentApplyError,
	applyAmendments,
	getEffectiveHash,
	listApprovedAmendments,
	nextAmendmentId,
	proposeAmendment,
	type Amendment,
	type AmendmentRecord,
} from './amendments/index.js';
import { isAmendment } from './amendments/types.js';
import { assertEpicHash, computeEpicHash } from './hash.js';
import { deriveSlug } from './slug.js';

const log = getLogger('workflow:orchestrator');

// ---------------------------------------------------------------------------
// Decomposer
// ---------------------------------------------------------------------------

export interface DecomposerPrompt {
	readonly systemPrompt: string;
	readonly userTurn:     string;
	readonly schema:       Record<string, unknown>;
}

/** Build the decomposer prompt for a given intent. The outer LLM
 *  emits a WorkflowPlan matching `schema`, then the framework
 *  hands it to `executor.startRun`. */
export function prepareDecompose(intent: WorkflowIntent): DecomposerPrompt {
	switch (intent.workflow) {
		case 'stub':         return stubDecomposer(intent);
		case 'define':       return defineDecomposer(intent);
		case 'design.epic':  return designEpicDecomposer(intent);
		case 'design.story': return designStoryDecomposer(intent);
		case 'tracker.push':
		case 'tracker.sync':
		case 'tracker.post':
			return trackerDecomposer(intent);
		default:
			throw new Error(`prepareDecompose: workflow '${intent.workflow}' not yet supported`);
	}
}

function stubDecomposer(intent: WorkflowIntent): DecomposerPrompt {
	const systemPrompt = [
		'You are the workflow decomposer for the `stub` workflow.',
		'The stub workflow demonstrates the framework skeleton with three deterministic steps.',
		'',
		'Emit a plan with EXACTLY three steps, all of runner type `echo.a`, `echo.b`, `echo.c` in order.',
		'Each step has an id `s1`, `s2`, `s3`. Params are freeform objects; use `$s1.echoed` in s2 and `$s1.echoed` / `$s2.marker` in s3 to demonstrate placeholder substitution.',
		'',
		'The plan must satisfy the schema below. Do not deviate.',
	].join('\n');
	const userTurn = `Focus: ${intent.focus}\nRepo: ${intent.repoPath}\nEmit the plan JSON now.`;
	const schema = {
		type: 'object',
		required: ['workflow', 'steps'],
		properties: {
			workflow: { const: 'stub' },
			rationale: { type: 'string' },
			steps: {
				type:     'array',
				minItems: 3,
				maxItems: 3,
				items: {
					type: 'object',
					required: ['id', 'runner', 'params'],
					properties: {
						id:     { type: 'string', pattern: '^s[1-3]$' },
						runner: { enum: ['echo.a', 'echo.b', 'echo.c'] },
						params: { type: 'object' },
						note:   { type: 'string' },
					},
					additionalProperties: false,
				},
			},
		},
		additionalProperties: false,
	} as const;
	return { systemPrompt, userTurn, schema: schema as unknown as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Synthesizer
// ---------------------------------------------------------------------------

export interface SynthesizerPrompt {
	readonly systemPrompt: string;
	readonly userTurn:     string;
	readonly schema:       Record<string, unknown>;
}

/** Build the synthesizer prompt. The outer LLM reads the executor's
 *  stepOutputs (rendered into the userTurn) and emits an artifact
 *  JSON matching `schema`. */
export function prepareSynthesize(
	intent:      WorkflowIntent,
	stepOutputs: Readonly<Record<string, unknown>>,
): SynthesizerPrompt {
	switch (intent.workflow) {
		case 'stub':         return stubSynthesizer(intent, stepOutputs);
		case 'define':       return defineSynthesizer(intent, stepOutputs);
		case 'design.epic':  return designEpicSynthesizer(intent, stepOutputs);
		case 'design.story': return designStorySynthesizer(intent, stepOutputs);
		case 'tracker.push':
		case 'tracker.sync':
		case 'tracker.post':
			return trackerSynthesizer(intent, stepOutputs);
		default:
			throw new Error(`prepareSynthesize: workflow '${intent.workflow}' not yet supported`);
	}
}

function stubSynthesizer(
	intent:      WorkflowIntent,
	stepOutputs: Readonly<Record<string, unknown>>,
): SynthesizerPrompt {
	const systemPrompt = [
		'You are the synthesizer for the `stub` workflow.',
		'Emit a StubArtifact JSON matching the schema below.',
		'',
		'Every claim in `body.summary` or `body.bulletList` MUST cite at least one entry from `citations[]` using the `[[cN]]` marker.',
		'Every citation MUST reference one of the three step outputs (s1, s2, s3) — cite them as { kind: "step-output", ref: "s1" | "s2" | "s3" }.',
		'',
		'Do NOT include code fences, do NOT invent facts that are not in the step outputs.',
	].join('\n');
	const userTurn = [
		`Focus: ${intent.focus}`,
		'',
		'Step outputs:',
		'```json',
		JSON.stringify(stepOutputs, null, 2),
		'```',
		'',
		'Emit the artifact JSON now.',
	].join('\n');
	const schema = {
		type: 'object',
		required: ['body', 'citations'],
		properties: {
			body: {
				type: 'object',
				required: ['title', 'summary', 'bulletList'],
				properties: {
					title:      { type: 'string', minLength: 1 },
					summary:    { type: 'string', minLength: 1 },
					bulletList: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
				},
				additionalProperties: false,
			},
			citations: {
				type:     'array',
				minItems: 1,
				items: {
					type: 'object',
					required: ['id', 'kind', 'ref'],
					properties: {
						id:   { type: 'string', pattern: '^c\\d+$' },
						kind: { enum: ['step-output', 'analyze-bundle', 'doc', 'code', 'stakeholder', 'convention', 'prior-artifact'] },
						ref:  { type: 'string', minLength: 1 },
						quotedText: { type: 'string' },
					},
					additionalProperties: false,
				},
			},
		},
		additionalProperties: false,
	} as const;
	return { systemPrompt, userTurn, schema: schema as unknown as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Artifact validation + render
// ---------------------------------------------------------------------------

/** Finalize the artifact JSON emitted by the synthesizer. Fills in
 *  meta, renders markdown, runs all three validation checks, and
 *  returns the rendered strings ready for `storage.writeAtomic`. */
export interface FinalizedArtifact {
	readonly workflow:     WorkflowName;
	readonly renderedMd:   string;
	readonly renderedJson: string;
	readonly artifact:     unknown;
}

/** Validation-aware finalizer. Returns `ValidationResult` on failure
 *  so the caller can prompt the LLM to retry. */
export type FinalizeResult =
	| { readonly ok: true;  readonly finalized: FinalizedArtifact }
	| { readonly ok: false; readonly failure:   ValidationResult };

export function finalizeArtifact(
	intent:       WorkflowIntent,
	stepOutputs:  Readonly<Record<string, unknown>>,
	runId:        string,
	elapsedMs:    number,
	llmResponse:  Record<string, unknown>,
): FinalizeResult {
	switch (intent.workflow) {
		case 'stub':         return finalizeStub(intent, stepOutputs, runId, elapsedMs, llmResponse);
		case 'define':       return finalizeDefine(intent, stepOutputs, runId, elapsedMs, llmResponse);
		case 'design.epic':  return finalizeDesignEpic(intent, stepOutputs, runId, elapsedMs, llmResponse);
		case 'design.story': return finalizeDesignStory(intent, stepOutputs, runId, elapsedMs, llmResponse);
		case 'tracker.push':
		case 'tracker.sync':
		case 'tracker.post':
			return finalizeTracker(intent, stepOutputs, runId, elapsedMs, llmResponse);
		default:
			throw new Error(`finalizeArtifact: workflow '${intent.workflow}' not yet supported`);
	}
}

function finalizeStub(
	intent:      WorkflowIntent,
	_stepOutputs: Readonly<Record<string, unknown>>,
	runId:       string,
	elapsedMs:   number,
	llmResponse: Record<string, unknown>,
): FinalizeResult {
	// Basic JSON shape check via runtime guards.
	if (typeof llmResponse !== 'object' || llmResponse === null) {
		return { ok: false, failure: schemaFailure(`synthesizer response is not an object`) };
	}
	const body = (llmResponse as { body?: unknown }).body;
	const citations = (llmResponse as { citations?: unknown }).citations;
	if (!isCitationArray(citations)) {
		return { ok: false, failure: schemaFailure(`citations must be an array of { id, kind, ref }`) };
	}
	const artifact: StubArtifact = {
		meta: {
			workflow:      'stub',
			runId,
			repoPath:      intent.repoPath,
			createdAt:     new Date().toISOString(),
			model:         'client',
			elapsedMs,
			repoIndexedAt: intent.repoIndexedAt,
			schemaVersion: STUB_SCHEMA_VERSION,
		},
		body:      body as StubArtifact['body'],
		citations,
	};
	if (!isStubArtifact(artifact)) {
		return { ok: false, failure: schemaFailure(`artifact does not match StubArtifact shape`) };
	}
	const renderedBody = renderStubMarkdown(artifact);
	const check = validateBodyAndCitations(artifact, renderedBody);
	if (!check.ok) return { ok: false, failure: check };
	const renderedMd = renderedBody + renderCitationBlock(citations);
	const renderedJson = JSON.stringify(artifact, null, 2) + '\n';
	log.info(
		{ workflow: 'stub', runId, size: renderedMd.length, citations: citations.length },
		'finalizeStub: artifact ready',
	);
	return {
		ok: true,
		finalized: {
			workflow:   'stub',
			renderedMd,
			renderedJson,
			artifact,
		},
	};
}

function schemaFailure(message: string): ValidationResult {
	return { ok: false, kind: 'schema', message };
}

// Kept as an unused import guard: STUB_ARTIFACT_JSON_SCHEMA is
// referenced by the MCP tool descriptions in Phase B; export it
// through this module so consumers only pull from `orchestrator`.
export { STUB_ARTIFACT_JSON_SCHEMA };

// ---------------------------------------------------------------------------
// define workflow
// ---------------------------------------------------------------------------

function defineDecomposer(intent: WorkflowIntent): DecomposerPrompt {
	const systemPrompt = [
		'You are the workflow decomposer for the `define` workflow.',
		'',
		'The `define` workflow always runs the SAME four steps in the SAME order:',
		'  s1: `context.assemble`  — discovery via insrc_analyze_step + flavor detection',
		'  s2: `epic.frame`        — problem + non-goals + assumptions + constraints',
		'  s3: `stories.compose`   — Stories with Given/When/Then acceptance criteria',
		'  s4: `checklist.verify`  — audit against the fixed §9 checklist',
		'',
		'Emit the plan JSON verbatim. Params are `{}` for every step; the runners read prior step outputs via the executor. Do not deviate.',
	].join('\n');
	const userTurn = `Focus: ${intent.focus}\nRepo: ${intent.repoPath}\nEmit the plan JSON now.`;
	const schema = {
		type: 'object',
		required: ['workflow', 'steps'],
		properties: {
			workflow:  { const: 'define' },
			rationale: { type: 'string' },
			steps: {
				type:     'array',
				minItems: 4,
				maxItems: 4,
				items: {
					type: 'object',
					required: ['id', 'runner', 'params'],
					properties: {
						id:     { type: 'string', pattern: '^s[1-4]$' },
						runner: { enum: ['context.assemble', 'epic.frame', 'stories.compose', 'checklist.verify'] },
						params: { type: 'object' },
						note:   { type: 'string' },
					},
					additionalProperties: false,
				},
			},
		},
		additionalProperties: false,
	} as const;
	return { systemPrompt, userTurn, schema: schema as unknown as Record<string, unknown> };
}

function defineSynthesizer(
	intent:      WorkflowIntent,
	stepOutputs: Readonly<Record<string, unknown>>,
): SynthesizerPrompt {
	const systemPrompt = [
		'You are the synthesizer for the `define` workflow.',
		'',
		'Read s1 (context) + s2 (Epic) + s3 (Stories) + s4 (checklist verdict) and emit a DefineArtifact JSON matching the schema below.',
		'',
		'HARD RULES:',
		'- `body.problem` MUST be verbatim from s2.problem.',
		'- `body.constraints` MUST be verbatim from s2.constraints (same ids, same sources).',
		'- `body.stories` MUST preserve s3 Stories verbatim.',
		'- `citations[]` MUST be the UNION of s2.citations + s3.citations, de-duplicated by id. No new citation ids invented at this step.',
		'- `openQuestions` is populated from s4 verdict: every `missed`/`ambiguous` result (except the sb1/sb2/sb3 hard-fail items — those fail the whole synthesize) becomes an open question phrased as "Item <itemId>: <notes|verdict>".',
		'- `body.flavor` matches s1.flavor exactly.',
	].join('\n');
	const userTurn = [
		`Focus: ${intent.focus}`,
		'',
		'Step outputs:',
		'```json',
		JSON.stringify(stepOutputs, null, 2),
		'```',
		'',
		'Emit the DefineArtifact JSON now.',
	].join('\n');
	const schema = {
		type: 'object',
		required: ['body', 'citations'],
		properties: {
			body: {
				type: 'object',
				required: ['flavor', 'problem', 'nonGoals', 'assumptions', 'constraints', 'stories', 'openQuestions'],
				properties: {
					flavor:       { enum: ['enhancement', 'new-capability'] },
					problem:      { type: 'string', minLength: 20 },
					nonGoals:     { type: 'array' },
					assumptions:  { type: 'array' },
					constraints:  { type: 'array' },
					stories:      { type: 'array', minItems: 1 },
					openQuestions: { type: 'array', items: { type: 'string' } },
				},
				additionalProperties: false,
			},
			citations: {
				type: 'array',
				minItems: 1,
				items: {
					type: 'object',
					required: ['id', 'kind', 'ref'],
					properties: {
						id:         { type: 'string', pattern: '^c\\d+$' },
						kind:       { enum: ['step-output', 'analyze-bundle', 'doc', 'code', 'stakeholder', 'convention', 'prior-artifact'] },
						ref:        { type: 'string', minLength: 1 },
						quotedText: { type: 'string' },
					},
					additionalProperties: false,
				},
			},
		},
		additionalProperties: false,
	} as const;
	return { systemPrompt, userTurn, schema: schema as unknown as Record<string, unknown> };
}

function finalizeDefine(
	intent:      WorkflowIntent,
	stepOutputs: Readonly<Record<string, unknown>>,
	runId:       string,
	elapsedMs:   number,
	llmResponse: Record<string, unknown>,
): FinalizeResult {
	if (typeof llmResponse !== 'object' || llmResponse === null) {
		return { ok: false, failure: schemaFailure(`synthesizer response is not an object`) };
	}
	const body      = (llmResponse as { body?: unknown }).body;
	const citations = (llmResponse as { citations?: unknown }).citations;
	if (!isDefineBody(body)) {
		return { ok: false, failure: schemaFailure(`body does not match DefineBody shape`) };
	}
	if (!isDefineCitationArray(citations)) {
		return { ok: false, failure: schemaFailure(`citations must be an array of { id, kind, ref }`) };
	}
	// scope-boundary hard-fail from s4
	const s4 = stepOutputs['s4'] as { results?: Array<{ itemId?: string; verdict?: string }> } | undefined;
	if (s4 !== undefined && Array.isArray(s4.results)) {
		const boundaryIds = new Set(['sb1', 'sb2', 'sb3']);
		const failed = s4.results.filter(r =>
			r.itemId !== undefined && boundaryIds.has(r.itemId) &&
			(r.verdict === 'missed' || r.verdict === 'ambiguous'),
		);
		if (failed.length > 0) {
			const items = failed.map(f => f.itemId).join(', ');
			return { ok: false, failure: schemaFailure(`s4 scope-boundary hard-fail on: ${items}`) };
		}
	}
	// Cross-artifact invariants: dependency DAG + constraint coverage.
	const dagIssues = checkStoryDependencyGraph(body.stories);
	if (dagIssues.length > 0) {
		return { ok: false, failure: { ok: false, kind: 'schema', message: 'Story dependency graph invalid', details: dagIssues } };
	}
	const coverageIssues = checkConstraintCoverage(body);
	if (coverageIssues.length > 0) {
		return { ok: false, failure: { ok: false, kind: 'schema', message: 'Constraint coverage broken', details: coverageIssues } };
	}
	// Every Define artifact mints the canonical Epic hash (deterministic
	// from the runId minted at start-time) + carries the display slug
	// derived from the focus. Both flow through the meta so downstream
	// workflows can look up their Epic by hash and display the slug.
	const epicHash = computeEpicHash(runId);
	const epicSlug = safeDeriveSlug(intent.focus);
	const artifact: DefineArtifact = {
		meta: {
			workflow:      'define',
			runId,
			repoPath:      intent.repoPath,
			createdAt:     new Date().toISOString(),
			model:         'client',
			elapsedMs,
			repoIndexedAt: intent.repoIndexedAt,
			schemaVersion: DEFINE_SCHEMA_VERSION,
			epicHash,
			epicSlug,
		},
		body,
		citations,
	};
	const renderedBody = renderDefineMarkdown(artifact);
	const check = validateBodyAndCitations(artifact, renderedBody);
	if (!check.ok) return { ok: false, failure: check };
	const renderedMd = renderedBody + renderCitationBlock(citations);
	const renderedJson = JSON.stringify(artifact, null, 2) + '\n';
	log.info(
		{ workflow: 'define', runId, size: renderedMd.length, citations: citations.length, stories: body.stories.length },
		'finalizeDefine: artifact ready',
	);
	return {
		ok: true,
		finalized: {
			workflow:   'define',
			renderedMd,
			renderedJson,
			artifact,
		},
	};
}

// ---------------------------------------------------------------------------
// design.epic (HLD) workflow
// ---------------------------------------------------------------------------

function designEpicDecomposer(intent: WorkflowIntent): DecomposerPrompt {
	const epicHash = requireEpicHash(intent);
	const systemPrompt = [
		'You are the workflow decomposer for the `design.epic` (HLD) workflow.',
		'',
		'The HLD workflow always runs the SAME six steps in the SAME order:',
		'  s1: `context.assemble`       — analyze bundles at whole-Epic scope',
		'  s2: `alternatives.enumerate` — 2-4 framework alternatives',
		'  s3: `alternatives.judge`     — score against Epic constraints',
		'  s4: `framework.write`        — chosen framework + shared contracts + Story boundaries',
		'  s5: `rollout.overview`       — phases + risky bits',
		'  s6: `checklist.verify`       — audit against HLD checklist',
		'',
		'Params are `{}` on every step; the runners read prior step outputs via the executor.',
	].join('\n');
	const userTurn = `Focus: ${intent.focus}\nEpic hash: ${epicHash}\nEmit the plan JSON now.`;
	const schema = {
		type: 'object',
		required: ['workflow', 'steps'],
		properties: {
			workflow:  { const: 'design.epic' },
			rationale: { type: 'string' },
			steps: {
				type:     'array',
				minItems: 6,
				maxItems: 6,
				items: {
					type: 'object',
					required: ['id', 'runner', 'params'],
					properties: {
						id:     { type: 'string', pattern: '^s[1-6]$' },
						runner: { enum: ['context.assemble', 'alternatives.enumerate', 'alternatives.judge', 'framework.write', 'rollout.overview', 'checklist.verify'] },
						params: { type: 'object' },
						note:   { type: 'string' },
					},
					additionalProperties: false,
				},
			},
		},
		additionalProperties: false,
	} as const;
	return { systemPrompt, userTurn, schema: schema as unknown as Record<string, unknown> };
}

function designEpicSynthesizer(
	intent:      WorkflowIntent,
	stepOutputs: Readonly<Record<string, unknown>>,
): SynthesizerPrompt {
	const systemPrompt = [
		'You are the synthesizer for the `design.epic` (HLD) workflow.',
		'',
		'Read s1..s6 outputs and emit an HldArtifact JSON matching the schema below.',
		'',
		'HARD RULES:',
		'- `body.frameworkSummary`, `architectureShape`, `sharedContracts`, `storyBoundaries`, `nonFunctional` MUST be verbatim from s4.',
		'- `body.rolloutOverview` MUST be verbatim from s5.',
		'- `body.alternativesConsidered` MUST include EVERY alternative from s2, with each loser carrying a `reasonRejected` line pulled from s3.',
		'- `body.chosenAlternative` MUST equal s3.winnerId.',
		'- `body.openQuestions` collects every `missed`/`ambiguous` verdict from s6 that is NOT a scope-boundary item (sbdry1..sbdry4 hard-fail those instead).',
		'- `citations[]` MUST reference analyze bundles from s1 for every module/api name that appears in the framework body.',
	].join('\n');
	const userTurn = [
		`Focus: ${intent.focus}`,
		'',
		'Step outputs:',
		'```json',
		JSON.stringify(stepOutputs, null, 2),
		'```',
		'',
		'Emit the HldArtifact JSON now.',
	].join('\n');
	const schema = {
		type: 'object',
		required: ['body', 'citations'],
		properties: {
			body: {
				type: 'object',
				required: ['frameworkSummary', 'architectureShape', 'sharedContracts', 'storyBoundaries', 'nonFunctional', 'rolloutOverview', 'alternativesConsidered', 'chosenAlternative', 'openQuestions'],
				additionalProperties: false,
				properties: {
					frameworkSummary:  { type: 'string', minLength: 20 },
					architectureShape: { type: 'string', minLength: 20 },
					sharedContracts:   { type: 'array' },
					storyBoundaries:   { type: 'array', minItems: 1 },
					nonFunctional:     { type: 'object' },
					rolloutOverview:   { type: 'object' },
					alternativesConsidered: { type: 'array', minItems: 2 },
					chosenAlternative: { type: 'string', pattern: '^a\\d+$' },
					openQuestions:     { type: 'array', items: { type: 'string' } },
				},
			},
			citations: {
				type: 'array',
				minItems: 1,
				items: {
					type: 'object',
					required: ['id', 'kind', 'ref'],
					properties: {
						id:         { type: 'string', pattern: '^c\\d+$' },
						kind:       { enum: ['step-output', 'analyze-bundle', 'doc', 'code', 'stakeholder', 'convention', 'prior-artifact'] },
						ref:        { type: 'string', minLength: 1 },
						quotedText: { type: 'string' },
					},
					additionalProperties: false,
				},
			},
		},
		additionalProperties: false,
	} as const;
	return { systemPrompt, userTurn, schema: schema as unknown as Record<string, unknown> };
}

function finalizeDesignEpic(
	intent:      WorkflowIntent,
	stepOutputs: Readonly<Record<string, unknown>>,
	runId:       string,
	elapsedMs:   number,
	llmResponse: Record<string, unknown>,
): FinalizeResult {
	if (typeof llmResponse !== 'object' || llmResponse === null) {
		return { ok: false, failure: schemaFailure(`synthesizer response is not an object`) };
	}
	const body      = (llmResponse as { body?: unknown }).body;
	const citations = (llmResponse as { citations?: unknown }).citations;
	if (!isHldBody(body)) {
		return { ok: false, failure: schemaFailure(`body does not match HldBody shape`) };
	}
	if (!isHldCitationArray(citations)) {
		return { ok: false, failure: schemaFailure(`citations must be an array of { id, kind, ref }`) };
	}

	// s6 hard-fail scope-boundary items.
	const s6 = stepOutputs['s6'] as { results?: Array<{ itemId?: string; verdict?: string }> } | undefined;
	if (s6 !== undefined && Array.isArray(s6.results)) {
		const boundaryIds = new Set(['sbdry1', 'sbdry2', 'sbdry3', 'sbdry4']);
		const failed = s6.results.filter(r =>
			r.itemId !== undefined && boundaryIds.has(r.itemId) &&
			(r.verdict === 'missed' || r.verdict === 'ambiguous'),
		);
		if (failed.length > 0) {
			const items = failed.map(f => f.itemId).join(', ');
			return { ok: false, failure: schemaFailure(`s6 scope-boundary hard-fail on: ${items}`) };
		}
	}

	// Cross-artifact invariants — HLD must fit the approved Epic.
	const epicHash = requireEpicHash(intent);
	const epic = requireApprovedEpic(intent.repoPath, epicHash);
	const epicStoryIds = epic.body.stories.map(s => s.id);
	const epicSlug = epic.meta.epicSlug ?? safeDeriveSlug(intent.focus);

	const coverIssues = checkStoryCoverage(body, epicStoryIds);
	if (coverIssues.length > 0) {
		return { ok: false, failure: { ok: false, kind: 'schema', message: 'HLD Story coverage broken', details: coverIssues } };
	}
	const ownIssues = checkOwnershipConsistency(body);
	if (ownIssues.length > 0) {
		return { ok: false, failure: { ok: false, kind: 'schema', message: 'HLD ownership inconsistent', details: ownIssues } };
	}
	const rolloutIssues = checkRolloutCoverage(body, epicStoryIds);
	if (rolloutIssues.length > 0) {
		return { ok: false, failure: { ok: false, kind: 'schema', message: 'Rollout coverage broken', details: rolloutIssues } };
	}
	const sketchIssues = checkInterfaceSketchTypeLevel(body);
	if (sketchIssues.length > 0) {
		return { ok: false, failure: { ok: false, kind: 'schema', message: 'InterfaceSketch leaks implementation', details: sketchIssues } };
	}
	// chosenAlternative must actually appear in alternativesConsidered.
	const alt = body.alternativesConsidered.find(a => a.id === body.chosenAlternative);
	if (alt === undefined) {
		return { ok: false, failure: schemaFailure(`chosenAlternative '${body.chosenAlternative}' not in alternativesConsidered`) };
	}

	const artifact: HldArtifact = {
		meta: {
			workflow:      'design.epic',
			runId,
			repoPath:      intent.repoPath,
			createdAt:     new Date().toISOString(),
			model:         'client',
			elapsedMs,
			repoIndexedAt: intent.repoIndexedAt,
			schemaVersion: HLD_SCHEMA_VERSION,
			epicHash,
			epicSlug,
		},
		body,
		citations,
	};
	const renderedBody = renderHldMarkdown(artifact);
	const check = validateBodyAndCitations(artifact, renderedBody);
	if (!check.ok) return { ok: false, failure: check };
	const renderedMd = renderedBody + renderCitationBlock(citations);
	const renderedJson = JSON.stringify(artifact, null, 2) + '\n';
	log.info(
		{ workflow: 'design.epic', runId, size: renderedMd.length, citations: citations.length, contracts: body.sharedContracts.length },
		'finalizeDesignEpic: artifact ready',
	);
	return {
		ok: true,
		finalized: {
			workflow:   'design.epic',
			renderedMd,
			renderedJson,
			artifact,
		},
	};
}

/** Epic-scoped workflows carry `params.epicHash` (16-char hex). */
function requireEpicHash(intent: WorkflowIntent): string {
	const hash = intent.params['epicHash'];
	assertEpicHash(hash, `${intent.workflow} requires intent.params.epicHash`);
	return hash;
}

/** Best-effort slug derivation for display. If the focus is too
 *  short / all-stopwords, fall back to the runId prefix so we
 *  always populate meta.epicSlug with something readable. */
function safeDeriveSlug(focus: string): string {
	try { return deriveSlug(focus); }
	catch { return focus.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'epic'; }
}

// ---------------------------------------------------------------------------
// design.story (LLD) workflow
// ---------------------------------------------------------------------------

function designStoryDecomposer(intent: WorkflowIntent): DecomposerPrompt {
	const epicHash = requireEpicHash(intent);
	const storyId  = requireStoryId(intent);
	const systemPrompt = [
		'You are the workflow decomposer for the `design.story` (LLD) workflow.',
		'',
		'The LLD workflow always runs the SAME eight steps in the SAME order (s7 short-circuits for new-capability Epics):',
		'  s1: `context.assemble`       — analyze bundles at Story scope',
		'  s2: `alternatives.enumerate` — 2-4 contract/data-model shapes',
		'  s3: `alternatives.judge`     — score against Story + HLD constraints',
		'  s4: `contract.detail`        — Story API + data model + shared-contract interaction',
		'  s5: `error.paths`            — errors, edges, invariants to preserve',
		'  s6: `test.strategy`          — test types + acceptance mapping',
		'  s7: `migration.write`        — conditional; runs only for enhancement flavor',
		'  s8: `checklist.verify`       — LLD audit',
		'',
		'Params are `{}` on every step. Runners read prior step outputs via the executor.',
	].join('\n');
	const userTurn = `Focus: ${intent.focus}\nEpic hash: ${epicHash}   Story: ${storyId}\nEmit the plan JSON now.`;
	const schema = {
		type: 'object',
		required: ['workflow', 'steps'],
		properties: {
			workflow:  { const: 'design.story' },
			rationale: { type: 'string' },
			steps: {
				type:     'array',
				minItems: 8,
				maxItems: 8,
				items: {
					type: 'object',
					required: ['id', 'runner', 'params'],
					properties: {
						id:     { type: 'string', pattern: '^s[1-8]$' },
						runner: { enum: ['context.assemble', 'alternatives.enumerate', 'alternatives.judge', 'contract.detail', 'error.paths', 'test.strategy', 'migration.write', 'checklist.verify'] },
						params: { type: 'object' },
						note:   { type: 'string' },
					},
					additionalProperties: false,
				},
			},
		},
		additionalProperties: false,
	} as const;
	return { systemPrompt, userTurn, schema: schema as unknown as Record<string, unknown> };
}

function designStorySynthesizer(
	intent:      WorkflowIntent,
	stepOutputs: Readonly<Record<string, unknown>>,
): SynthesizerPrompt {
	const epicHash = requireEpicHash(intent);
	const storyId  = requireStoryId(intent);
	const hld = requireApprovedHld(intent.repoPath, epicHash);
	const hldSlice = extractHldContextSlice(hld, storyId);
	const s7 = stepOutputs['s7'] as { skipped?: boolean } | undefined;
	const migrationOptional = s7 !== undefined && s7.skipped === true;

	const systemPrompt = [
		'You are the synthesizer for the `design.story` (LLD) workflow.',
		'',
		'Read s1..s8 outputs and emit an LldArtifact JSON matching the schema.',
		'',
		'HARD RULES:',
		'- `body.hldContextSlice` MUST be verbatim from the HLD context slice below.',
		'- `body.contractDetails`, `body.dataModelChanges`, `body.interactionWithShared` MUST be verbatim from s4.',
		'- `body.errorPaths` MUST be verbatim from s5.',
		'- `body.testStrategy` MUST be verbatim from s6.',
		`- ${migrationOptional
			? '`body.migration` MUST be OMITTED (Epic is new-capability; s7 short-circuited).'
			: '`body.migration` MUST be verbatim from s7.'}`,
		'- `body.alternativesConsidered` MUST include every alternative from s2 with losers carrying `reasonRejected` pulled from s3.',
		'- `body.chosenAlternative` MUST equal s3.winnerId.',
		'- `body.openQuestions` collects `missed`/`ambiguous` verdicts from s8 (except sbdry1-4 which hard-fail).',
		'- Citation ids `cN` reference `citations[]`; every claim in body cites at least one.',
	].join('\n');
	const userTurn = [
		`Focus: ${intent.focus}   Epic: ${epicHash}   Story: ${storyId}`,
		'',
		'HLD context slice (verbatim into body.hldContextSlice):',
		'```json',
		JSON.stringify(hldSlice, null, 2),
		'```',
		'',
		'Step outputs:',
		'```json',
		JSON.stringify(stepOutputs, null, 2),
		'```',
		'',
		'Emit the LldArtifact JSON now.',
	].join('\n');

	const schema = {
		type: 'object',
		required: ['body', 'citations'],
		properties: {
			body: {
				type: 'object',
				required: ['hldContextSlice', 'contractDetails', 'dataModelChanges', 'interactionWithShared', 'errorPaths', 'testStrategy', 'alternativesConsidered', 'chosenAlternative', 'openQuestions'],
				additionalProperties: false,
				properties: {
					hldContextSlice:       { type: 'object' },
					contractDetails:       { type: 'object' },
					dataModelChanges:      { type: 'array' },
					interactionWithShared: { type: 'array' },
					errorPaths:            { type: 'object' },
					testStrategy:          { type: 'object' },
					migration:             { type: 'object' },
					alternativesConsidered: { type: 'array', minItems: 2 },
					chosenAlternative:     { type: 'string', pattern: '^a\\d+$' },
					openQuestions:         { type: 'array', items: { type: 'string' } },
				},
			},
			citations: {
				type: 'array',
				minItems: 1,
				items: {
					type: 'object',
					required: ['id', 'kind', 'ref'],
					properties: {
						id:         { type: 'string', pattern: '^c\\d+$' },
						kind:       { enum: ['step-output', 'analyze-bundle', 'doc', 'code', 'stakeholder', 'convention', 'prior-artifact'] },
						ref:        { type: 'string', minLength: 1 },
						quotedText: { type: 'string' },
					},
					additionalProperties: false,
				},
			},
		},
		additionalProperties: false,
	} as const;
	return { systemPrompt, userTurn, schema: schema as unknown as Record<string, unknown> };
}

function finalizeDesignStory(
	intent:      WorkflowIntent,
	stepOutputs: Readonly<Record<string, unknown>>,
	runId:       string,
	elapsedMs:   number,
	llmResponse: Record<string, unknown>,
): FinalizeResult {
	if (typeof llmResponse !== 'object' || llmResponse === null) {
		return { ok: false, failure: schemaFailure(`synthesizer response is not an object`) };
	}
	const body      = (llmResponse as { body?: unknown }).body;
	const citations = (llmResponse as { citations?: unknown }).citations;
	if (!isLldBody(body)) {
		return { ok: false, failure: schemaFailure(`body does not match LldBody shape`) };
	}
	if (!isLldCitationArray(citations)) {
		return { ok: false, failure: schemaFailure(`citations must be an array of { id, kind, ref }`) };
	}

	// s8 hard-fail scope-boundary items.
	const s8 = stepOutputs['s8'] as { results?: Array<{ itemId?: string; verdict?: string }> } | undefined;
	if (s8 !== undefined && Array.isArray(s8.results)) {
		const boundaryIds = new Set(['sbdry1', 'sbdry2', 'sbdry3', 'sbdry4']);
		const failed = s8.results.filter(r =>
			r.itemId !== undefined && boundaryIds.has(r.itemId) &&
			(r.verdict === 'missed' || r.verdict === 'ambiguous'),
		);
		if (failed.length > 0) {
			const items = failed.map(f => f.itemId).join(', ');
			return { ok: false, failure: schemaFailure(`s8 scope-boundary hard-fail on: ${items}`) };
		}
	}

	// Cross-artifact invariants — LLD must fit approved Epic + HLD.
	const epicHash = requireEpicHash(intent);
	const storyId  = requireStoryId(intent);
	const epic     = requireApprovedEpic(intent.repoPath, epicHash);
	const hld      = requireApprovedHld(intent.repoPath, epicHash);
	const epicSlug = epic.meta.epicSlug ?? safeDeriveSlug(intent.focus);
	const story    = epic.body.stories.find(s => s.id === storyId);
	if (story === undefined) {
		return { ok: false, failure: schemaFailure(`Story '${storyId}' not found in Epic '${epicHash}'`) };
	}

	// Migration conditional consistency.
	const s7 = stepOutputs['s7'] as { skipped?: boolean } | undefined;
	const migrationExpected = epic.body.flavor === 'enhancement';
	if (migrationExpected && body.migration === undefined) {
		return { ok: false, failure: schemaFailure(`Epic flavor is enhancement but body.migration is missing`) };
	}
	if (!migrationExpected && body.migration !== undefined) {
		return { ok: false, failure: schemaFailure(`Epic flavor is new-capability but body.migration is present (s7 should have been skipped: ${JSON.stringify(s7)})`) };
	}

	const scRefIssues       = checkSharedContractRefs(body, hld);
	const implIssues        = checkImplementOwnership(body, hld, storyId);
	const acIssues          = checkAcceptanceMapping(body, story.acceptanceCriteria.map(ac => ac.id));
	const apiSigIssues      = checkApiSignaturesTypeLevel(body);
	const combined = [...scRefIssues, ...implIssues, ...acIssues, ...apiSigIssues];
	if (combined.length > 0) {
		return { ok: false, failure: { ok: false, kind: 'schema', message: 'LLD cross-artifact checks failed', details: combined } };
	}

	// chosenAlternative sanity
	if (!body.alternativesConsidered.some(a => a.id === body.chosenAlternative)) {
		return { ok: false, failure: schemaFailure(`chosenAlternative '${body.chosenAlternative}' not in alternativesConsidered`) };
	}

	// LLD anchors to (a) the BASE HLD runId (not amendment applier's
	// output) and (b) the ids of every approved amendment currently
	// applied. Read base separately so we can capture the true
	// runId — `requireApprovedHld` returns the effective view where
	// meta.runId still equals base.runId, but read the disk copy to
	// be sure.
	const baseHld = readBaseHld(intent.repoPath, epicHash);
	const appliedAmendments = listApprovedAmendments(intent.repoPath, epicHash);
	const effectiveHash = getEffectiveHash(intent.repoPath, epicHash, baseHld);

	const artifact: LldArtifact = {
		meta: {
			workflow:      'design.story',
			runId,
			repoPath:      intent.repoPath,
			createdAt:     new Date().toISOString(),
			model:         'client',
			elapsedMs,
			repoIndexedAt: intent.repoIndexedAt,
			schemaVersion: LLD_SCHEMA_VERSION,
			epicHash,
			epicSlug,
			storyId,
			hldBaseRunId:         baseHld.meta.runId,
			hldEffectiveHash:     effectiveHash,
			hldAmendmentsApplied: appliedAmendments.map(a => a.id),
		},
		body,
		citations,
	};
	const renderedBody = renderLldMarkdown(artifact);
	const check = validateBodyAndCitations({ meta: artifact.meta, body: artifact.body as LldBody, citations: artifact.citations }, renderedBody);
	if (!check.ok) return { ok: false, failure: check };
	const renderedMd = renderedBody + renderCitationBlock(citations);
	const renderedJson = JSON.stringify(artifact, null, 2) + '\n';

	// Collect any amendment proposals from s4 / s5 outputs + persist
	// them as pending AmendmentRecords. Dry-runs the applier against
	// the CURRENT effective HLD to catch obviously-broken proposals
	// before writing to disk — a proposal that even the applier
	// refuses would never be approvable, so refusing at finalize is
	// the right time.
	const proposals = collectAmendmentProposals(stepOutputs);
	const persisted: string[] = [];
	if (proposals.length > 0) {
		const currentEffective = applyAmendments(baseHld.body, appliedAmendments);
		for (const p of proposals) {
			try {
				applyAmendments(currentEffective, [
					{
						id: 'dry-run', epicHash, epicSlug, hldBaseRunId: baseHld.meta.runId,
						amendment: p.amendment, rationale: p.rationale, citations: p.citations,
						proposedBy: { workflow: 'design.story', runId, storyId, stepId: p.stepId },
						proposedAt: new Date().toISOString(), status: 'approved',
					},
				]);
			} catch (err) {
				const msg = err instanceof AmendmentApplyError ? err.message : (err instanceof Error ? err.message : String(err));
				return { ok: false, failure: schemaFailure(`amendment proposal from ${p.stepId} would fail applier: ${msg}`) };
			}
			const amendmentId = nextAmendmentId(intent.repoPath, epicHash);
			const record: AmendmentRecord = {
				id:           amendmentId,
				epicHash,
				epicSlug,
				hldBaseRunId: baseHld.meta.runId,
				amendment:    p.amendment,
				rationale:    p.rationale,
				citations:    p.citations,
				proposedBy:   { workflow: 'design.story', runId, storyId, stepId: p.stepId },
				proposedAt:   new Date().toISOString(),
				status:       'pending',
			};
			proposeAmendment(intent.repoPath, record);
			persisted.push(amendmentId);
		}
	}

	log.info(
		{ workflow: 'design.story', runId, epicHash, storyId, size: renderedMd.length, citations: citations.length, amendmentProposals: persisted.length },
		'finalizeDesignStory: artifact ready',
	);
	return {
		ok: true,
		finalized: {
			workflow:   'design.story',
			renderedMd,
			renderedJson,
			artifact,
		},
	};
}

// Collect any amendment proposals from an LLD step-output map.
// Returns an empty array when no step emitted a proposal.
interface ProposalCarrier {
	readonly stepId:    string;
	readonly amendment: Amendment;
	readonly rationale: string;
	readonly citations: readonly import('./types.js').Citation[];
}

function collectAmendmentProposals(stepOutputs: Readonly<Record<string, unknown>>): readonly ProposalCarrier[] {
	const out: ProposalCarrier[] = [];
	for (const stepId of ['s4', 's5']) {
		const step = stepOutputs[stepId] as { hld?: { amendmentProposal?: unknown } } | undefined;
		if (step === undefined || typeof step !== 'object' || step.hld === undefined) continue;
		const proposal = step.hld.amendmentProposal;
		if (proposal === undefined || proposal === null || typeof proposal !== 'object') continue;
		const p = proposal as { amendment?: unknown; rationale?: unknown; citations?: unknown };
		if (!isAmendment(p.amendment) || typeof p.rationale !== 'string') continue;
		const citations = Array.isArray(p.citations) ? (p.citations as import('./types.js').Citation[]) : [];
		out.push({ stepId, amendment: p.amendment, rationale: p.rationale, citations });
	}
	return out;
}

function requireStoryId(intent: WorkflowIntent): string {
	const id = intent.params['storyId'];
	if (typeof id !== 'string' || id.length === 0) {
		throw new Error(`design.story requires intent.params.storyId`);
	}
	return id;
}

// ---------------------------------------------------------------------------
// tracker.push / tracker.sync / tracker.post
// ---------------------------------------------------------------------------

function trackerDecomposer(intent: WorkflowIntent): DecomposerPrompt {
	const flavor = intent.workflow.split('.')[1]!;   // 'push' | 'sync' | 'post'
	const systemPrompt = [
		`You are the workflow decomposer for the \`${intent.workflow}\` workflow.`,
		'',
		'This is a COARSE HANDOFF workflow. The plan is always the SAME three steps in the SAME order:',
		'  s1: `context.assemble`   — deterministic; framework reads Epic + gh config',
		'  s2: `execute`            — LLM turn; invokes `gh` directly to perform the action',
		'  s3: `checklist.verify`   — LLM turn; audits refs against the conventions',
		'',
		'Params are `{}` on every step; the runners read prior step outputs via the executor.',
	].join('\n');
	const userTurn = `Focus: ${intent.focus}\nWorkflow: ${intent.workflow}\nEmit the plan JSON now.`;
	const schema = {
		type: 'object',
		required: ['workflow', 'steps'],
		properties: {
			workflow:  { const: intent.workflow },
			rationale: { type: 'string' },
			steps: {
				type:     'array',
				minItems: 3,
				maxItems: 3,
				items: {
					type: 'object',
					required: ['id', 'runner', 'params'],
					properties: {
						id:     { type: 'string', pattern: '^s[1-3]$' },
						runner: { enum: ['context.assemble', 'execute', 'checklist.verify'] },
						params: { type: 'object' },
						note:   { type: 'string' },
					},
					additionalProperties: false,
				},
			},
		},
		additionalProperties: false,
	} as const;
	return { systemPrompt, userTurn, schema: schema as unknown as Record<string, unknown> };
	void flavor;
}

function trackerSynthesizer(
	intent:      WorkflowIntent,
	stepOutputs: Readonly<Record<string, unknown>>,
): SynthesizerPrompt {
	const systemPrompt = [
		`You are the synthesizer for the \`${intent.workflow}\` workflow.`,
		'',
		'Emit a compact JSON with `{ refs, checklist, notes? }` where:',
		'  - `refs` is the s2 execute output verbatim.',
		'  - `checklist` is the s3 checklist.verify output verbatim.',
		'  - `notes` is an optional short human-facing note.',
		'',
		'Do NOT re-derive; just pass through.',
	].join('\n');
	const userTurn = [
		`Focus: ${intent.focus}`,
		'',
		'Step outputs:',
		'```json',
		JSON.stringify(stepOutputs, null, 2),
		'```',
		'',
		'Emit the JSON now.',
	].join('\n');
	const schema = {
		type: 'object',
		required: ['refs', 'checklist'],
		properties: {
			refs:      { type: 'object' },
			checklist: { type: 'object' },
			notes:     { type: 'string' },
		},
		additionalProperties: false,
	} as const;
	return { systemPrompt, userTurn, schema: schema as unknown as Record<string, unknown> };
}

function finalizeTracker(
	intent:      WorkflowIntent,
	stepOutputs: Readonly<Record<string, unknown>>,
	runId:       string,
	elapsedMs:   number,
	llmResponse: Record<string, unknown>,
): FinalizeResult {
	if (typeof llmResponse !== 'object' || llmResponse === null) {
		return { ok: false, failure: schemaFailure(`synthesizer response is not an object`) };
	}
	const refs      = (llmResponse as { refs?: unknown }).refs;
	const checklist = (llmResponse as { checklist?: unknown }).checklist;
	const notes     = (llmResponse as { notes?: unknown }).notes;
	if (!isTrackerChecklistResult(checklist)) {
		return { ok: false, failure: schemaFailure(`checklist must be an object with items[] + failedCount`) };
	}
	if (checklist.failedCount > 0) {
		const failed = checklist.items.filter(i => i.verdict === 'failed').map(i => i.itemId).join(', ');
		return { ok: false, failure: schemaFailure(`tracker checklist failed on: ${failed}`) };
	}

	// Type-narrow refs per workflow.
	let typedRefs: TrackerPushRefs | TrackerSyncRefs | TrackerPostRefs;
	if (intent.workflow === 'tracker.push') {
		if (!isTrackerPushRefs(refs)) return { ok: false, failure: schemaFailure(`refs do not match TrackerPushRefs`) };
		typedRefs = refs;
	} else if (intent.workflow === 'tracker.sync') {
		if (!isTrackerSyncRefs(refs)) return { ok: false, failure: schemaFailure(`refs do not match TrackerSyncRefs`) };
		typedRefs = refs;
	} else {
		if (!isTrackerPostRefs(refs)) return { ok: false, failure: schemaFailure(`refs do not match TrackerPostRefs`) };
		typedRefs = refs;
	}

	// Read gh config from the s1 output (deterministic bundle).
	const s1 = stepOutputs['s1'] as { gh?: { owner?: string; repo?: string }; epicHash?: string; epicSlug?: string } | undefined;
	if (s1 === undefined || typeof s1.gh !== 'object' || typeof s1.gh.owner !== 'string' || typeof s1.gh.repo !== 'string' || typeof s1.epicHash !== 'string') {
		return { ok: false, failure: schemaFailure(`s1 context bundle is missing gh + epicHash`) };
	}
	const epicHash = s1.epicHash;
	const epicSlug = typeof s1.epicSlug === 'string' ? s1.epicSlug : epicHash;

	// Mutate the Epic artifact's meta.tracker for push + sync.
	try {
		mutateEpicTrackerMeta(intent.repoPath, epicHash, intent.workflow, typedRefs);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { ok: false, failure: schemaFailure(`failed to patch Epic tracker meta: ${msg}`) };
	}

	const artifact: TrackerArtifact = {
		meta: {
			workflow:      intent.workflow,
			runId,
			repoPath:      intent.repoPath,
			createdAt:     new Date().toISOString(),
			model:         'client',
			elapsedMs,
			repoIndexedAt: intent.repoIndexedAt,
			schemaVersion: TRACKER_SCHEMA_VERSION,
			epicHash,
			epicSlug,
		},
		body: {
			workflow:  intent.workflow as 'tracker.push' | 'tracker.sync' | 'tracker.post',
			epicSlug,
			ghOwner:   s1.gh.owner,
			ghRepo:    s1.gh.repo,
			refs:      typedRefs,
			checklist,
			...(typeof notes === 'string' ? { notes } : {}),
		},
		citations: [] as const,
	};
	const renderedMd   = renderTrackerMarkdown(artifact);
	const renderedJson = JSON.stringify(artifact, null, 2) + '\n';
	log.info(
		{ workflow: intent.workflow, runId, epicHash, refs: Object.keys(typedRefs).length },
		'finalizeTracker: artifact ready',
	);
	return {
		ok: true,
		finalized: {
			workflow:   intent.workflow as WorkflowName,
			renderedMd,
			renderedJson,
			artifact,
		},
	};
}

/** Merge tracker refs into the Epic artifact's meta.tracker. Push
 *  writes epicRef + storyRefs + milestoneRef + labelsCreated; sync
 *  writes storyStatus + epicStatus + lastSyncedAt; post is a no-op
 *  at the Epic level (comment ids attach to the target artifact by
 *  the caller if needed — Phase F doesn't record commentIds in the
 *  design artifact meta since that would fragment the surface). */
function mutateEpicTrackerMeta(
	repoPath:   string,
	epicHash:   string,
	workflow:   string,
	refs:       TrackerPushRefs | TrackerSyncRefs | TrackerPostRefs,
): void {
	if (workflow === 'tracker.post') return;   // no-op for post
	const paths = defineArtifactPaths(repoPath, epicHash);
	const raw = readFileSync(paths.json, 'utf8');
	const artifact = JSON.parse(raw) as { meta?: { tracker?: Record<string, unknown> } };
	if (artifact.meta === undefined) artifact.meta = {};
	if (artifact.meta.tracker === undefined) artifact.meta.tracker = {};
	if (workflow === 'tracker.push') {
		const push = refs as TrackerPushRefs;
		artifact.meta.tracker = {
			...artifact.meta.tracker,
			adapter:   'github',
			epicRef:   push.epicRef,
			storyRefs: push.storyRefs,
			...(push.milestoneRef !== undefined ? { milestoneRef: push.milestoneRef } : {}),
			labelsCreated: push.labelsCreated,
			pushedAt:  new Date().toISOString(),
		};
	} else {
		const sync = refs as TrackerSyncRefs;
		artifact.meta.tracker = {
			...artifact.meta.tracker,
			epicStatus:   sync.epicStatus,
			storyStatus:  sync.storyStatus,
			lastSyncedAt: sync.syncedAt,
		};
	}
	writeAtomic(paths.json, JSON.stringify(artifact, null, 2) + '\n');
}

// Kept as silences — referenced above for JSDoc navigation.
export { readDefineArtifact as _readDefineArtifact };
