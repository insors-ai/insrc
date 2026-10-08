/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * doc.constraint.enumerate exploration runner.
 *
 * docs/plans/exploration-based-context-build.md Phase 2. Enumerate
 * constraints stated in doc sections about a subject. Retriever +
 * narrow LLM call with tight output schema; preserves MUST /
 * SHALL / HARD RULE language verbatim.
 *
 * Same shared-runner pattern as doc.decision.trace: the existing
 * template runtime at `analyze/runtimes/docs/constraint-enumerate.ts`
 * becomes a thin wrapper on `runSharedDocConstraintEnumerate`.
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRoleProvider } from '../context/shaper-provider.js';
import { loadAnalyzeConfig } from '../../config/analyze.js';
import { getDb } from '../../db/client.js';
import { getEntity } from '../../db/entities.js';
import { getLogger } from '../../shared/logger.js';
import type { DbClient } from '../../db/client.js';
import type {
	LLMMessage,
	LLMProvider,
	StructuredSchema,
} from '../../shared/types.js';

import { retrieveDocSections } from '../docs-retrieval.js';
import type { DocsRetrievalReport } from '../docs-retrieval.js';
import type {
	DocConstraintEnumerateOutput,
	DocConstraintRecord,
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

const log = getLogger('analyze:explore:doc-constraint-enumerate');

const PROMPT_REL = 'prompts/analyze/docs.constraint-enumerate.system.md';

const CONSTRAINT_KIND_ENUM = [
	'must', 'should', 'may', 'hard-rule', 'forbidden', 'invariant',
] as const;

// ---------------------------------------------------------------------------
// Structured-output schema
// ---------------------------------------------------------------------------

/** The answer the model (or the agent, on the step tool's path) must give this lookup. */
export const DOC_CONSTRAINTS_SCHEMA: StructuredSchema = {
	type:                 'object',
	additionalProperties: false,
	required:             ['subject', 'constraints', 'notFoundNote'],
	properties: {
		subject:      { type: 'string' },
		notFoundNote: { type: 'string' },
		constraints:  {
			type:  'array',
			items: {
				type:                 'object',
				additionalProperties: false,
				required:             ['constraint', 'kind', 'sourceEntityId', 'file', 'heading', 'rationale'],
				properties: {
					constraint:     { type: 'string' },
					kind:           { type: 'string', enum: [...CONSTRAINT_KIND_ENUM] },
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
// Shared runner
// ---------------------------------------------------------------------------

export interface RunDocConstraintEnumerateArgs {
	readonly subject:     string;
	readonly repoPath:    string;
	readonly db:          DbClient;
	readonly maxSources?: number;
	readonly runId?:      string;
	readonly logContext?: string;
	/** The model that reads the sections; a test passes a stand-in. */
	readonly provider?:   LLMProvider | undefined;
}

/**
 * Original all-in-one runner. Retains behaviour for the Ollama /
 * CliProvider path. Internally composes prepare + provider.
 * completeStructured + finalize.
 */
export async function runSharedDocConstraintEnumerate(
	args: RunDocConstraintEnumerateArgs,
): Promise<DocConstraintEnumerateOutput> {
	const prepared = await prepareDocConstraintEnumerate({
		subject:    args.subject,
		repoPath:   args.repoPath,
		db:         args.db,
		...(args.maxSources !== undefined ? { maxSources: args.maxSources } : {}),
		...(args.runId !== undefined ? { runId: args.runId } : {}),
		...(args.logContext !== undefined ? { logContext: args.logContext } : {}),
	});
	if (prepared.kind === 'short-circuit') return prepared.shortCircuit;

	const cfg = loadAnalyzeConfig();
	const provider = args.provider ?? resolveRoleProvider('analyze.narrow', cfg);
	let raw: DocConstraintEnumerateLLMOutput;
	try {
		raw = await provider.completeStructured(
			[
				{ role: 'system', content: prepared.systemPrompt },
				{ role: 'user',   content: prepared.userTurn     },
			],
			DOC_CONSTRAINTS_SCHEMA,
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
			`doc.constraint.enumerate: the model call that reads the retrieved sections failed: ${errorMessage(err)}`,
			prepared.retrieved,
			{ cause: err },
		);
	}

	return finalizeDocConstraintEnumerate(prepared.prepared, raw, args.runId, args.logContext);
}

// ---------------------------------------------------------------------------
// prepare / finalize split (used by the multi-turn MCP handler)
// ---------------------------------------------------------------------------

export interface DocConstraintEnumeratePrepared {
	readonly subject:                string;
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

interface DocConstraintEnumerateLLMOutput {
	readonly subject:      string;
	readonly constraints:  DocConstraintRecord[];
	readonly notFoundNote: string;
}

export type DocConstraintEnumeratePrepareResult =
	| {
		readonly kind:         'short-circuit';
		readonly shortCircuit: DocConstraintEnumerateOutput;
	  }
	| {
		readonly kind:         'narrow-llm';
		readonly systemPrompt: string;
		readonly userTurn:     string;
		readonly schema:       StructuredSchema;
		/** The sections prepare retrieved, for a failure after this point to report. */
		readonly retrieved:    readonly PartialFinding[];
		readonly prepared:     DocConstraintEnumeratePrepared;
	  };

export async function prepareDocConstraintEnumerate(
	args: RunDocConstraintEnumerateArgs,
): Promise<DocConstraintEnumeratePrepareResult> {
	const subject = args.subject.trim();
	if (subject.length === 0) {
		throw new Error('doc.constraint.enumerate: subject is required (non-empty string)');
	}
	const maxSources = args.maxSources !== undefined
		? Math.max(1, Math.min(30, args.maxSources))
		: 15;

	const report: DocsRetrievalReport = {};
	const sections = await retrieveDocSections({
		db:           args.db,
		report,
		query:        subject,
		closureRepos: [args.repoPath],
		maxResults:   maxSources,
		kinds:        ['document', 'section'],
		previewChars: 0,
	});

	if (sections.length === 0) {
		log.info(
			{ runId: args.runId, subject, ctx: args.logContext },
			'doc.constraint.enumerate: no matching sections',
		);
		return {
			kind: 'short-circuit',
			shortCircuit: {
				type:                  'doc.constraint.enumerate',
				// The document index returned no section for the subject: empty, and complete.
				completeness:          buildCompleteness({ returned: 0, skipped: vectorPassSkipped(report.vectorPassSkipped), basis: 'doc-index', basisNote: DOC_INDEX_RULE }),
				subject,
				constraints:           [],
				notFoundNote:          `No doc sections in the retrieved corpus mention "${subject}".`,
				retrievedSectionCount: 0,
			},
		};
	}

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
	const messages = buildMessages(promptContent, subject, hydrated);
	const systemMsg = messages[0]!.content as string;
	const userMsg   = messages[1]!.content as string;

	return {
		kind:         'narrow-llm',
		systemPrompt: systemMsg,
		userTurn:     userMsg,
		schema:       DOC_CONSTRAINTS_SCHEMA,
		retrieved:    hydrated.map(h => ({ source: `${h.file} § ${h.heading}`, content: h.body })),
		prepared: {
			subject,
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

export function finalizeDocConstraintEnumerate(
	prepared:   DocConstraintEnumeratePrepared,
	raw:        DocConstraintEnumerateLLMOutput,
	runId?:     string,
	logContext?: string,
): DocConstraintEnumerateOutput {
	const validIds = new Set(prepared.validEntityIds);
	const filtered = raw.constraints.filter(c => validIds.has(c.sourceEntityId));

	log.info(
		{
			runId,
			ctx:       logContext,
			subject:   prepared.subject,
			retrieved: prepared.retrievedSectionCount,
			extracted: raw.constraints.length,
			surviving: filtered.length,
		},
		'doc.constraint.enumerate: extraction complete',
	);

	return {
		type:                  'doc.constraint.enumerate',
		completeness:          carriedCompleteness(filtered.length, 'doc-index', prepared.completenessFacts, DOC_INDEX_RULE),
		subject:               prepared.subject,
		constraints:           filtered,
		notFoundNote:          filtered.length === 0 ? (raw.notFoundNote || `No constraints on "${prepared.subject}" found in the retrieved sections.`) : '',
		retrievedSectionCount: prepared.retrievedSectionCount,
	};
}

// ---------------------------------------------------------------------------
// Exploration wrapper
// ---------------------------------------------------------------------------

interface ExplorationParams {
	readonly subject:     string;
	readonly maxSources?: number;
}

function parseExplorationParams(exp: Exploration): ExplorationParams {
	const p = exp.params as Record<string, unknown>;
	const subject = typeof p['subject'] === 'string' ? (p['subject'] as string).trim() : '';
	if (subject.length === 0) {
		throw new Error('doc.constraint.enumerate: params.subject is required (non-empty string)');
	}
	return {
		subject,
		...(typeof p['maxSources'] === 'number' ? { maxSources: p['maxSources'] as number } : {}),
	};
}

export async function runDocConstraintEnumerate(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<DocConstraintEnumerateOutput> {
	const params = parseExplorationParams(exp);
	const db = await getDb();
	return runSharedDocConstraintEnumerate({
		subject:    params.subject,
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
	subject:       string,
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
		`Subject: ${subject}\n` +
		`\n` +
		`Retrieved doc sections:\n\n` +
		sectionsBlock +
		`\n\n` +
		'Now emit the ConstraintList JSON object. First character `{`, ' +
		'no markdown fence, no prose intro. Preserve VERBATIM constraint ' +
		'wording; preserve MUST / SHALL / HARD RULE language.';

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
	const insrcRoot = resolve(thisFile, '..', '..', '..');
	return resolve(insrcRoot, relativePath);
}

export const DOC_CONSTRAINT_ENUMERATE_PROMPT_PATH = PROMPT_REL;
