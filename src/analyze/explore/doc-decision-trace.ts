/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * doc.decision.trace exploration runner.
 *
 * docs/plans/exploration-based-context-build.md Phase 2. Extract
 * decisions verbatim from doc sections that mention a topic.
 * Retriever + narrow LLM call with tight output schema.
 *
 * IMPORTANT: same primitive powers the existing template runtime
 * at `analyze/runtimes/docs/decision-trace.ts` (Phase 2 rollout
 * makes that runtime a thin wrapper on this shared runner). The
 * shared runner + shared prompt path guarantee that shaper-level
 * exploration + planner-level template produce identical output
 * for the same params.
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRoleProvider } from '../context/shaper-provider.js';
import { loadAnalyzeConfig } from '../../config/analyze.js';
import { getDb } from '../../db/client.js';
import { getEntity } from '../../db/entities.js';
import { getLogger } from '../../shared/logger.js';
import type {
	DbClient,
} from '../../db/client.js';
import type {
	LLMMessage,
	LLMProvider,
	StructuredSchema,
} from '../../shared/types.js';

import { retrieveDocSections } from '../docs-retrieval.js';
import type { DocsArea } from '../docs-retrieval.js';
import type { DocsRetrievalReport } from '../docs-retrieval.js';
import type {
	DocDecisionRecord,
	DocDecisionTraceOutput,
	Exploration,
	ExplorationRunnerContext,
} from './types.js';
import { buildCompleteness } from '../completeness.js';
import type { PartialFinding, PartlyReadItem, SkippedItem } from '../completeness.js';
import { carriedCompleteness, DOC_INDEX_RULE, reachedLimit, vectorPassSkipped } from './completeness-facts.js';
import { createItemMeasurer } from './item-measure.js';
import { errorMessage, LookupFailedError } from './lookup-failed.js';
import type { CarriedCompletenessFacts } from './completeness-facts.js';

/** How much of each retrieved section's stored body the model is given. */
const SECTION_BODY_CHARS = 2_000;

const log = getLogger('analyze:explore:doc-decision-trace');

// The shared prompt lives alongside the template's prompt so the
// same wording drives shaper-level + planner-level extraction.
const PROMPT_REL = 'prompts/analyze/docs.decision-trace.system.md';

// ---------------------------------------------------------------------------
// Structured-output schema (mirrors the template runtime's schema)
// ---------------------------------------------------------------------------

/** The answer the model (or the agent, on the step tool's path) must give this lookup. */
export const DOC_DECISIONS_SCHEMA: StructuredSchema = {
	type:                 'object',
	additionalProperties: false,
	required:             ['topic', 'decisions', 'notFoundNote'],
	properties: {
		topic:        { type: 'string' },
		notFoundNote: { type: 'string' },
		decisions:    {
			type:  'array',
			items: {
				type:                 'object',
				additionalProperties: false,
				required:             ['decision', 'sourceEntityId', 'file', 'heading', 'rationale'],
				properties: {
					decision:       { type: 'string' },
					sourceEntityId: { type: 'string' },
					file:           { type: 'string' },
					heading:        { type: 'string' },
					rationale:      { type: 'string' },
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// Shared runner (called from both the exploration runner AND the
// template runtime -- see analyze/runtimes/docs/decision-trace.ts)
// ---------------------------------------------------------------------------

export interface RunDocDecisionTraceArgs {
	readonly topic:       string;
	readonly repoPath:    string;
	readonly db:          DbClient;
	/** The part of the repo to keep to; absent, the whole repo. Forwarded to
	 *  retrieval, so sections are selected, ranked and counted within it. */
	readonly area?:       DocsArea | undefined;
	readonly maxSources?: number;
	readonly runId?:      string;
	readonly logContext?: string;
	/** The model that reads the sections; a test passes a stand-in. */
	readonly provider?:   LLMProvider | undefined;
}

/**
 * Original all-in-one runner. Retains behaviour unchanged for the
 * Ollama / CliProvider path (existing template runtime + exploration
 * executor without the multi-turn MCP pause). Internally now composes
 * `prepareDocDecisionTrace` + provider.completeStructured +
 * `finalizeDocDecisionTrace` so any bug fix in the shared halves is
 * picked up here for free.
 */
export async function runSharedDocDecisionTrace(
	args: RunDocDecisionTraceArgs,
): Promise<DocDecisionTraceOutput> {
	const prepared = await prepareDocDecisionTrace({
		topic:      args.topic,
		repoPath:   args.repoPath,
		db:         args.db,
		// Handed over explicitly: prepare is given a new object, built field by field.
		...(args.area !== undefined ? { area: args.area } : {}),
		...(args.maxSources !== undefined ? { maxSources: args.maxSources } : {}),
		...(args.runId !== undefined ? { runId: args.runId } : {}),
		...(args.logContext !== undefined ? { logContext: args.logContext } : {}),
	});

	if (prepared.kind === 'short-circuit') return prepared.shortCircuit;

	// Fire the LLM call against the daemon-side shaperProvider.
	const cfg = loadAnalyzeConfig();
	const provider = args.provider ?? resolveRoleProvider('analyze.narrow', cfg);
	let raw: DocDecisionTraceLLMOutput;
	try {
		raw = await provider.completeStructured(
			[
				{ role: 'system', content: prepared.systemPrompt },
				{ role: 'user',   content: prepared.userTurn     },
			],
			DOC_DECISIONS_SCHEMA,
			{
				maxAttempts:     cfg.shaper.structuredOutputRetries,
				disableThinking: true,
				maxTokens:       4_096,
			},
		);
	} catch (err) {
		// The sections were retrieved and the model that reads them could not be
		// called: the lookup could not run. What it had retrieved goes with the failure.
		throw new LookupFailedError(
			`doc.decision.trace: the model call that reads the retrieved sections failed: ${errorMessage(err)}`,
			prepared.retrieved,
			{ cause: err },
		);
	}

	return finalizeDocDecisionTrace(prepared.prepared, raw, args.runId, args.logContext);
}

// ---------------------------------------------------------------------------
// prepare / finalize split (used by the multi-turn MCP handler so the
// LLM call happens in the OUTER client's session instead of the
// daemon's shaperProvider)
// ---------------------------------------------------------------------------

/** Deterministic-portion output preserved between prepare and finalize. */
export interface DocDecisionTracePrepared {
	readonly topic:                  string;
	readonly retrievedSectionCount:  number;
	readonly validEntityIds:         readonly string[];
	/** What prepare left out. Absent on a value minted before the field existed. */
	readonly completenessFacts?:     CarriedCompletenessFacts | undefined;
}

interface HydratedSection {
	readonly entityId: string;
	readonly file:     string;
	readonly heading:  string;
	readonly body:     string;
}

interface DocDecisionTraceLLMOutput {
	readonly topic:        string;
	readonly decisions:    DocDecisionRecord[];
	readonly notFoundNote: string;
}

/** Prepare result. Either a short-circuit ExplorationOutput (no
 *  sections retrieved -- LLM call is not needed) or a payload the
 *  caller emits to the outer LLM for structured output. */
export type DocDecisionTracePrepareResult =
	| {
		readonly kind:         'short-circuit';
		readonly shortCircuit: DocDecisionTraceOutput;
	  }
	| {
		readonly kind:         'narrow-llm';
		readonly systemPrompt: string;
		readonly userTurn:     string;
		readonly schema:       StructuredSchema;
		/** The sections prepare retrieved, for a failure after this point to report. */
		readonly retrieved:    readonly PartialFinding[];
		readonly prepared:     DocDecisionTracePrepared;
	  };

export async function prepareDocDecisionTrace(
	args: RunDocDecisionTraceArgs,
): Promise<DocDecisionTracePrepareResult> {
	const topic = args.topic.trim();
	if (topic.length === 0) {
		throw new Error('doc.decision.trace: topic is required (non-empty string)');
	}
	const maxSources = args.maxSources !== undefined
		? Math.max(1, Math.min(30, args.maxSources))
		: 15;

	// (1) Retrieve. V1 = repo-scoped (single-repo closure).
	const report: DocsRetrievalReport = {};
	const sections = await retrieveDocSections({
		db:           args.db,
		report,
		query:        topic,
		closureRepos: [args.repoPath],
		...(args.area !== undefined ? { area: args.area } : {}),
		maxResults:   maxSources,
		kinds:        ['document', 'section'],
		previewChars: 0,
	});

	if (sections.length === 0) {
		log.info(
			{ runId: args.runId, topic, ctx: args.logContext },
			'doc.decision.trace: no matching sections',
		);
		return {
			kind: 'short-circuit',
			shortCircuit: {
				type:                  'doc.decision.trace',
				// The document index returned no section for the topic: empty, and complete.
				completeness:          buildCompleteness({ returned: 0, skipped: vectorPassSkipped(report.vectorPassSkipped), basis: 'doc-index', basisNote: DOC_INDEX_RULE }),
				topic,
				decisions:             [],
				notFoundNote:          `No doc sections in the retrieved corpus mention "${topic}".`,
				retrievedSectionCount: 0,
			},
		};
	}

	// (2) Hydrate full bodies for the LLM extraction pass.
	const hydrated: HydratedSection[] = [];
	const skipped: SkippedItem[] = vectorPassSkipped(report.vectorPassSkipped);
	const partlyRead: PartlyReadItem[] = [];
	const measurer = createItemMeasurer(args.db);
	for (const s of sections) {
		const entity = await getEntity(args.db, s.entityId);
		if (entity === null) {
			skipped.push({ what: `${s.file} § ${s.heading}`, reason: 'the section is no longer in the index' });
			continue;
		}
		const body = (entity.body ?? '').slice(0, SECTION_BODY_CHARS);
		hydrated.push({
			entityId: s.entityId,
			file:     s.file,
			heading:  s.heading,
			body,
		});
		// The model reads this much of the section; say so when the section is longer.
		const cut = await measurer.partlyRead(`${s.file} § ${s.heading}`, entity, body.length);
		if (cut !== undefined) partlyRead.push(cut);
	}

	const promptContent = loadPromptFile();
	const messages = buildMessages(promptContent, topic, hydrated);
	const systemMsg = messages[0]!.content as string;
	const userMsg   = messages[1]!.content as string;

	return {
		kind:         'narrow-llm',
		systemPrompt: systemMsg,
		userTurn:     userMsg,
		schema:       DOC_DECISIONS_SCHEMA,
		retrieved:    hydrated.map(h => ({ source: `${h.file} § ${h.heading}`, content: h.body })),
		prepared: {
			topic,
			retrievedSectionCount: sections.length,
			validEntityIds:        hydrated.map(h => h.entityId),
			completenessFacts: {
				// The retrieval returns at most maxSources sections and does not say how many
				// matched. The limit is on what was read, not on what is returned from it.
				limited: sections.length >= maxSources
					? [reachedLimit('document sections', maxSources, 'source', null)]
					: [],
				skipped,
				partlyRead,
			},
		},
	};
}

/**
 * Finalize the LLM output: apply the citation faithfulness filter
 * against the retrieved entity set. `raw` is the JSON the outer LLM
 * emitted against DOC_DECISIONS_SCHEMA.
 */
export function finalizeDocDecisionTrace(
	prepared:   DocDecisionTracePrepared,
	raw:        DocDecisionTraceLLMOutput,
	runId?:     string,
	logContext?: string,
): DocDecisionTraceOutput {
	// Faithfulness check: drop any decision whose sourceEntityId isn't
	// in the retrieved set. Prevents the LLM from inventing citations.
	const validIds = new Set(prepared.validEntityIds);
	const filtered = raw.decisions.filter(d => validIds.has(d.sourceEntityId));

	log.info(
		{
			runId,
			ctx:       logContext,
			topic:     prepared.topic,
			retrieved: prepared.retrievedSectionCount,
			extracted: raw.decisions.length,
			surviving: filtered.length,
		},
		'doc.decision.trace: extraction complete',
	);

	return {
		type:                  'doc.decision.trace',
		completeness:          carriedCompleteness(filtered.length, 'doc-index', prepared.completenessFacts, DOC_INDEX_RULE),
		topic:                 prepared.topic,
		decisions:             filtered,
		notFoundNote:          filtered.length === 0 ? (raw.notFoundNote || `No decisions on "${prepared.topic}" found in the retrieved sections.`) : '',
		retrievedSectionCount: prepared.retrievedSectionCount,
	};
}

// ---------------------------------------------------------------------------
// Exploration wrapper (shaper-level entry point)
// ---------------------------------------------------------------------------

interface ExplorationParams {
	readonly topic:       string;
	readonly maxSources?: number;
}

function parseExplorationParams(exp: Exploration): ExplorationParams {
	const p = exp.params as Record<string, unknown>;
	const topic = typeof p['topic'] === 'string' ? (p['topic'] as string).trim() : '';
	if (topic.length === 0) {
		throw new Error('doc.decision.trace: params.topic is required (non-empty string)');
	}
	return {
		topic,
		...(typeof p['maxSources'] === 'number' ? { maxSources: p['maxSources'] as number } : {}),
	};
}

export async function runDocDecisionTrace(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<DocDecisionTraceOutput> {
	const params = parseExplorationParams(exp);
	const db = await getDb();
	return runSharedDocDecisionTrace({
		topic:      params.topic,
		repoPath:   ctx.repoPath,
		db,
		...(params.maxSources !== undefined ? { maxSources: params.maxSources } : {}),
		...(ctx.runId !== undefined ? { runId: ctx.runId } : {}),
		logContext: 'exploration',
	});
}

// ---------------------------------------------------------------------------
// Message + prompt loading
// ---------------------------------------------------------------------------

function buildMessages(
	promptContent: string,
	topic:         string,
	sections:      ReadonlyArray<{ entityId: string; file: string; heading: string; body: string }>,
): LLMMessage[] {
	const sectionsBlock = sections
		.map(s =>
			`### ${s.entityId} :: ${s.file} :: ${s.heading}\n` +
			'```\n' +
			s.body +
			'\n```',
		)
		.join('\n\n');

	const userContent =
		`Topic: ${topic}\n` +
		`\n` +
		`Retrieved doc sections:\n\n` +
		sectionsBlock +
		`\n\n` +
		'Now emit the DecisionTrace JSON object. First character `{`, ' +
		'no markdown fence, no prose intro. Preserve VERBATIM decision ' +
		'wording; never paraphrase.';

	return [
		{ role: 'system', content: promptContent.trimEnd() },
		{ role: 'user',   content: userContent },
	];
}

function loadPromptFile(): string {
	const abs = isAbsolute(PROMPT_REL)
		? PROMPT_REL
		: resolveRelativeToInsrcRoot(PROMPT_REL);
	return readFileSync(abs, 'utf8');
}

function resolveRelativeToInsrcRoot(relativePath: string): string {
	const thisFile = fileURLToPath(import.meta.url);
	// .../analyze/explore/doc-decision-trace.js -> ... -> .../insrc
	const insrcRoot = resolve(thisFile, '..', '..', '..');
	return resolve(insrcRoot, relativePath);
}

// ---------------------------------------------------------------------------
// Boot validator hook -- template-runtime + exploration share the
// same prompt, so registering once at analyze/context/boot-validator.ts
// (via the template runtime's constant) suffices. Re-export the path
// as a convenience for callers that reference it from the exploration
// module.
// ---------------------------------------------------------------------------

export const DOC_DECISION_TRACE_PROMPT_PATH = PROMPT_REL;
