/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared adherence-check runner used by
 * code.adherence.check / data.adherence.check /
 * infra.adherence.check.
 *
 * docs/plans/docs-module.md Phase 4. Per-target runtimes contribute:
 *   - subjectKey     ('codeSubject' | 'dataSubject' | 'infraSubject')
 *   - subjectLabel   (rendered in the prompt: "Code" | "Data" | "Infra")
 *   - hydrateExcerpts(subject, repoPath, cap) -> AdherenceExcerpt[]
 *
 * Everything else -- constraint sourcing, LLM call, prompt, schema,
 * output shape -- is shared. Contradictions preserve BOTH sides
 * verbatim; no auto-adjudication.
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadAnalyzeConfig } from '../../../config/analyze.js';
import { resolveRoleProvider } from '../../context/shaper-provider.js';
import { getDb } from '../../../db/client.js';
import { getEntity } from '../../../db/entities.js';
import { getLogger } from '../../../shared/logger.js';
import type {
	LLMMessage,
	LLMProvider,
	StructuredSchema,
} from '../../../shared/types.js';

import { assembleLiveProjectContext } from '../../context/live-project-context.js';
import type { LiveProjectContextReport } from '../../context/live-project-context.js';
import { createItemMeasurer, summarisedFrom } from '../../explore/item-measure.js';
import type { ItemMeasurer } from '../../explore/item-measure.js';
import { SUMMARISER_BODY_CHARS } from '../../summariser/driver.js';
import type { Completeness, PartlyReadItem, ReachedLimit } from '../../completeness.js';
import type { TemplateExecuteArgs } from '../../executor/types.js';
import { graphCompleteness, reachedLimit } from '../../explore/completeness-facts.js';

/** How many decisions and constraints the check asks the project context for. */
const PROJECT_CONTEXT_LIMIT = 500;

import { familyOfTemplate, graphRepoOf, resolveTaskScope } from './task-scope.js';

const log = getLogger('analyze:runtimes:shared:adherence');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AdherenceExcerpt {
	readonly entityId?: string;
	readonly file:      string;
	readonly kind:      string;
	readonly name:      string;
	readonly body:      string;
	readonly lineStart: number;
	readonly lineEnd:   number;
}

export interface ConstraintInput {
	readonly constraint:      string;
	readonly sourceEntityId?: string;
	readonly file?:           string;
	readonly heading?:        string;
}

export interface AdherenceRunArgs {
	readonly executeArgs:  TemplateExecuteArgs;
	readonly subjectKey:   string;   // 'codeSubject' | 'dataSubject' | 'infraSubject'
	readonly subjectLabel: string;   // 'Code' | 'Data' | 'Infra'
	readonly templateId:   string;
	readonly promptRelPath: string;
	readonly hydrateExcerpts: (subject: string, repoPath: string, cap: number)
		=> Promise<readonly AdherenceExcerpt[]>;
}

export interface AdherenceResult {
	readonly subject:        string;
	readonly matches:        readonly unknown[];
	readonly drifts:         readonly unknown[];
	readonly missingImpl:    readonly unknown[];
	readonly contradictions: readonly unknown[];
	readonly diagnostics: {
		readonly constraintCount:   number;
		readonly excerptCount:      number;
	};
	/** What the check read and what it left out; the runtime returns it as the task's record. */
	readonly completeness:   Completeness;
}

// ---------------------------------------------------------------------------
// LLM schema
// ---------------------------------------------------------------------------

const CITATION_SCHEMA = {
	type:                 'object',
	additionalProperties: true,
	required:             ['kind'],
	properties: {
		kind:      { type: 'string' },
		entityId:  { type: 'string' },
		file:      { type: 'string' },
		heading:   { type: 'string' },
		lineStart: { type: 'integer' },
		lineEnd:   { type: 'integer' },
	},
} as const;

/** Build the schema on-demand with the right subjectKey field. */
function buildAdherenceSchema(subjectKey: string): StructuredSchema {
	return {
		type:                 'object',
		additionalProperties: false,
		required:             [subjectKey, 'matches', 'drifts', 'missingImpl', 'contradictions'],
		properties: {
			[subjectKey]: { type: 'string' },
			matches: {
				type: 'array',
				items: {
					type:                 'object',
					additionalProperties: false,
					required:             ['constraint', 'docCitation', 'codeCitation', 'codeEvidence', 'rationale'],
					properties: {
						constraint:      { type: 'string' },
						docCitation:     CITATION_SCHEMA,
						codeCitation:    CITATION_SCHEMA,
						codeEvidence:    { type: 'string' },
						rationale:       { type: 'string' },
					},
				},
			},
			drifts: {
				type: 'array',
				items: {
					type:                 'object',
					additionalProperties: false,
					required:             ['constraint', 'docCitation', 'codeCitation', 'drift', 'codeSnippet'],
					properties: {
						constraint:   { type: 'string' },
						docCitation:  CITATION_SCHEMA,
						codeCitation: CITATION_SCHEMA,
						drift:        { type: 'string' },
						codeSnippet:  { type: 'string' },
					},
				},
			},
			missingImpl: {
				type: 'array',
				items: {
					type:                 'object',
					additionalProperties: false,
					required:             ['constraint', 'docCitation', 'whereExpected', 'rationale'],
					properties: {
						constraint:    { type: 'string' },
						docCitation:   CITATION_SCHEMA,
						whereExpected: { type: 'string' },
						rationale:     { type: 'string' },
					},
				},
			},
			contradictions: {
				type: 'array',
				items: {
					type:                 'object',
					additionalProperties: false,
					required:             ['constraint', 'docPosition', 'docCitation', 'codePosition', 'codeCitation', 'codeSnippet', 'reader_note'],
					properties: {
						constraint:   { type: 'string' },
						docPosition:  { type: 'string' },
						docCitation:  CITATION_SCHEMA,
						codePosition: { type: 'string' },
						codeCitation: CITATION_SCHEMA,
						codeSnippet:  { type: 'string' },
						reader_note:  { type: 'string' },
					},
				},
			},
		},
	};
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function runAdherenceCheck(args: AdherenceRunArgs): Promise<AdherenceResult> {
	const { executeArgs, subjectKey, subjectLabel, templateId, promptRelPath, hydrateExcerpts } = args;
	const params = executeArgs.task.params as Record<string, unknown>;

	const subject = params[subjectKey];
	if (typeof subject !== 'string' || subject.trim().length === 0) {
		throw new Error(`${templateId}: params.${subjectKey} is required (non-empty string)`);
	}
	const maxExcerpts = typeof params['maxSourceExcerpts'] === 'number'
		? Math.max(1, Math.min(30, params['maxSourceExcerpts'] as number))
		: 12;

	// What the check's inputs left out, gathered where each is read.
	const sourceLimits: ReachedLimit[] = [];
	const partlyRead: PartlyReadItem[] = [];
	const db = await getDb();
	const measurer = createItemMeasurer(db);

	const constraints = await resolveConstraints(executeArgs, params, { limited: sourceLimits, partlyRead, measurer });
	if (constraints.length === 0) {
		throw new Error(
			`${templateId}: no constraints available. Provide one of: ` +
			`params.constraintsSource (upstream taskId of a docs.constraint.enumerate task), ` +
			`params.constraints (inline list), OR ` +
			`params.constraintIds (list of doc-summary entity ids -- the runtime hydrates their ` +
			`keyConstraints from the LiveProjectContext).`,
		);
	}

	const repoPath = await adherenceRepoPath(executeArgs, templateId);
	const excerpts = await hydrateExcerpts(subject, repoPath, maxExcerpts);

	if (excerpts.length === 0) {
		log.warn(
			{ runId: executeArgs.runId, taskId: executeArgs.task.taskId, subject },
			`${templateId}: no ${subjectLabel.toLowerCase()} excerpts hydrated`,
		);
	}

	// The excerpts are the check's sources. The lookup stops at maxExcerpts and
	// does not say how many more entities match the subject.
	const limited: ReachedLimit[] = [...sourceLimits];
	if (excerpts.length >= maxExcerpts) limited.push(reachedLimit('source excerpts', maxExcerpts, 'source', null));

	// Each excerpt is the first part of an entity's stored body. Say so when the
	// entity is longer than what the model is shown.
	for (const x of excerpts) {
		if (x.entityId === undefined) continue;
		const entity = await getEntity(db, x.entityId);
		if (entity === null) continue;
		const cut = await measurer.partlyRead(`${x.file}:${x.lineStart} ${x.name}`, entity, x.body.length);
		if (cut !== undefined) partlyRead.push(cut);
	}

	const cfg = loadAnalyzeConfig();
	const provider = resolveRoleProvider('analyze.adherence', cfg);
	const promptContent = loadPromptFile(promptRelPath);
	const messages = buildMessages(promptContent, subjectLabel, subject, constraints, excerpts);
	const schema = buildAdherenceSchema(subjectKey);

	let raw: Record<string, unknown>;
	try {
		raw = await provider.completeStructured<Record<string, unknown>>(
			messages,
			schema,
			{
				maxAttempts:     cfg.shaper.structuredOutputRetries,
				disableThinking: true,
				maxTokens:       6_144,
			},
		);
	} catch (err) {
		// The model that judges adherence could not be called: the task did not
		// do its work. It throws, and the walk records the task as failed. (It
		// used to return every constraint as "missing implementation", which
		// reads as a finding.)
		log.warn(
			{ runId: executeArgs.runId, taskId: executeArgs.task.taskId, err: (err as Error).message },
			`${templateId}: LLM call failed`,
		);
		throw new Error(
			`${templateId}: the model call that judges adherence failed: ${(err as Error).message}. ` +
			`${constraints.length} constraint(s) and ${excerpts.length} excerpt(s) were gathered and not judged.`,
			{ cause: err },
		);
	}

	const matches        = Array.isArray(raw['matches'])        ? raw['matches']        as unknown[] : [];
	const drifts         = Array.isArray(raw['drifts'])         ? raw['drifts']         as unknown[] : [];
	const missingImpl    = Array.isArray(raw['missingImpl'])    ? raw['missingImpl']    as unknown[] : [];
	const contradictions = Array.isArray(raw['contradictions']) ? raw['contradictions'] as unknown[] : [];

	log.info(
		{
			runId:          executeArgs.runId,
			taskId:         executeArgs.task.taskId,
			[subjectKey]:   subject,
			constraints:    constraints.length,
			matches:        matches.length,
			drifts:         drifts.length,
			missingImpl:    missingImpl.length,
			contradictions: contradictions.length,
		},
		`${templateId}: complete`,
	);

	return {
		subject,
		matches,
		drifts,
		missingImpl,
		contradictions,
		diagnostics: {
			constraintCount: constraints.length,
			excerptCount:    excerpts.length,
		},
		completeness: graphCompleteness({
			returned: matches.length + drifts.length + missingImpl.length + contradictions.length,
			limited,
			partlyRead,
		}),
	};
}

// ---------------------------------------------------------------------------
// The repo the check reads
// ---------------------------------------------------------------------------

/**
 * The repo whose graph the check reads, from the request's scope, resolved by
 * the one scope function for the family of the template the check runs as
 * (the same check is registered as a code, a data and an infra template). A
 * kind the family's row refuses is refused here; only the code family is
 * checked for an index, so a data or an infra check on a directory that is
 * not a registered repo goes on with that directory, as before.
 */
async function adherenceRepoPath(args: TemplateExecuteArgs, templateId: string): Promise<string> {
	return graphRepoOf(await resolveTaskScope(args.intent.scopeRef, familyOfTemplate(templateId), templateId));
}

// ---------------------------------------------------------------------------
// Constraint sourcing
// ---------------------------------------------------------------------------

/** Where `resolveConstraints` records what its source left out. */
interface ConstraintSourceFacts {
	readonly limited:    ReachedLimit[];
	readonly partlyRead: PartlyReadItem[];
	readonly measurer:   ItemMeasurer;
}

async function resolveConstraints(
	args:   TemplateExecuteArgs,
	params: Record<string, unknown>,
	facts:  ConstraintSourceFacts,
): Promise<ConstraintInput[]> {
	// Priority 1: upstream task output.
	const source = params['constraintsSource'];
	if (typeof source === 'string' && source.length > 0) {
		const upstream = args.upstreamOutputs.get(source);
		if (upstream !== undefined && typeof upstream === 'object' && upstream !== null) {
			const constraintsField = (upstream as Record<string, unknown>)['constraints'];
			if (Array.isArray(constraintsField)) {
				return normaliseConstraints(constraintsField);
			}
		}
	}

	// Priority 2: inline constraint objects.
	const inline = params['constraints'];
	if (Array.isArray(inline)) {
		return normaliseConstraints(inline);
	}

	// Priority 3: constraintIds -- doc-summary entity ids whose
	// keyConstraints are hydrated from the LiveProjectContext
	// (docs/plans/docs-module.md Phase 7). Lets the planner point at
	// specific docs by id without needing a docs.constraint.enumerate
	// upstream task in every plan.
	const constraintIds = params['constraintIds'];
	if (Array.isArray(constraintIds) && constraintIds.length > 0) {
		const ids = constraintIds.filter(x => typeof x === 'string' && x.length > 0) as string[];
		if (ids.length > 0) {
			return await hydrateFromConstraintIds(args, ids, facts);
		}
	}

	return [];
}

/**
 * Given a set of doc-summary entity ids, hydrate their
 * `keyConstraints` into the shared ConstraintInput shape. Each
 * constraint is cited back to its source entity + file + doc
 * title. Skips ids that don't resolve to a summarised doc.
 */
async function hydrateFromConstraintIds(
	args:  TemplateExecuteArgs,
	ids:   readonly string[],
	facts: ConstraintSourceFacts,
): Promise<ConstraintInput[]> {
	const db = await getDb();
	const repoPath = await adherenceRepoPath(args, args.task.template);
	// Assemble the live context once to lift decisions/constraints
	// with their citations pre-computed. This avoids per-id lookups
	// against getDocSummary + entity hydration.
	const report: LiveProjectContextReport = {};
	const ctx = await assembleLiveProjectContext(db, repoPath, {
		maxDecisions:   PROJECT_CONTEXT_LIMIT,
		maxConstraints: PROJECT_CONTEXT_LIMIT,
		report,
	});
	// The assembler stops at its limit. A constraint of a requested document
	// that lies past it would be missing here without a word.
	for (const l of report.limitsReached ?? []) {
		if (l.what !== 'constraints') continue;
		facts.limited.push(reachedLimit('project constraints', l.limit, 'source', l.found));
	}
	const idSet = new Set(ids);
	const out: ConstraintInput[] = [];
	// Fetch entity metadata (for `file` + `heading`) on demand, cached
	// per entity id to avoid duplicate lookups.
	const fileByEntityId = new Map<string, string>();
	for (const c of ctx.constraints) {
		if (!idSet.has(c.sourceEntityId)) continue;
		let file = fileByEntityId.get(c.sourceEntityId);
		if (file === undefined) {
			const entity = await getEntity(db, c.sourceEntityId);
			file = entity?.file ?? '';
			fileByEntityId.set(c.sourceEntityId, file);
			// The constraints come from the document's SUMMARY, and a summary of a
			// long document rests on its first part.
			if (entity !== null) {
				const cut = await summarisedFrom(facts.measurer, entity, SUMMARISER_BODY_CHARS);
				if (cut !== undefined) facts.partlyRead.push(cut);
			}
		}
		out.push({
			constraint:     c.constraint,
			sourceEntityId: c.sourceEntityId,
			...(file.length > 0 ? { file } : {}),
			heading:        c.docTitle,
		});
	}
	log.info(
		{
			templateContext: 'runAdherenceCheck',
			requestedIds:    ids.length,
			hydrated:        out.length,
		},
		'runAdherenceCheck: hydrated constraints from constraintIds',
	);
	return out;
}

function normaliseConstraints(raw: readonly unknown[]): ConstraintInput[] {
	const out: ConstraintInput[] = [];
	for (const item of raw) {
		if (typeof item !== 'object' || item === null) continue;
		const o = item as Record<string, unknown>;
		const constraint = typeof o['constraint'] === 'string' ? o['constraint'] as string : undefined;
		if (constraint === undefined || constraint.length === 0) continue;
		out.push({
			constraint,
			...(typeof o['sourceEntityId'] === 'string' ? { sourceEntityId: o['sourceEntityId'] as string } : {}),
			...(typeof o['file']           === 'string' ? { file:           o['file']           as string } : {}),
			...(typeof o['heading']        === 'string' ? { heading:        o['heading']        as string } : {}),
		});
	}
	return out;
}

// ---------------------------------------------------------------------------
// Message + prompt
// ---------------------------------------------------------------------------

function buildMessages(
	promptContent: string,
	subjectLabel:  string,
	subject:       string,
	constraints:   readonly ConstraintInput[],
	excerpts:      readonly AdherenceExcerpt[],
): LLMMessage[] {
	const constraintsBlock = constraints
		.map((c, i) => {
			const citationBits: string[] = ["kind: 'section'"];
			if (c.sourceEntityId !== undefined) citationBits.push(`entityId: '${c.sourceEntityId}'`);
			if (c.file           !== undefined) citationBits.push(`file: '${c.file}'`);
			if (c.heading        !== undefined) citationBits.push(`heading: '${c.heading}'`);
			return `${i + 1}. ${c.constraint}\n   docCitation: { ${citationBits.join(', ')} }`;
		})
		.join('\n\n');

	const excerptsBlock = excerpts.length > 0
		? excerpts
			.map(e => {
				const header = e.entityId !== undefined
					? `### ${e.entityId} :: ${e.file} (${e.kind} ${e.name}, lines ${e.lineStart}-${e.lineEnd})`
					: `### ${e.file} (${e.kind} ${e.name}, lines ${e.lineStart}-${e.lineEnd})`;
				return `${header}\n\`\`\`\n${e.body}\n\`\`\``;
			})
			.join('\n\n')
		: `(no ${subjectLabel.toLowerCase()} excerpts hydrated -- the subject did not resolve)`;

	const userContent =
		`${subjectLabel} subject: ${subject}\n` +
		`\n` +
		`${subjectLabel} excerpts:\n\n` +
		excerptsBlock +
		`\n\n` +
		`Constraints to check:\n\n` +
		constraintsBlock +
		`\n\n` +
		'Now emit the AdherenceReport JSON object. First character `{`, ' +
		'no markdown fence, no prose intro. On contradictions, preserve ' +
		'BOTH doc position (verbatim) and code/data/infra position (concrete). ' +
		'Do NOT adjudicate.';

	return [
		{ role: 'system', content: promptContent.trimEnd() },
		{ role: 'user',   content: userContent },
	];
}

function loadPromptFile(relPath: string): string {
	const abs = isAbsolute(relPath)
		? relPath
		: resolveRelativeToInsrcRoot(relPath);
	return readFileSync(abs, 'utf8');
}

function resolveRelativeToInsrcRoot(relativePath: string): string {
	const thisFile = fileURLToPath(import.meta.url);
	// .../analyze/runtimes/shared/adherence.js -> ... -> .../insrc
	const insrcRoot = resolve(thisFile, '..', '..', '..', '..');
	return resolve(insrcRoot, relativePath);
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

/** Test seam: resolve the constraints as the check does, with somewhere to record what the source left out. */
export async function _resolveConstraintsForTest(
	args:   TemplateExecuteArgs,
	params: Record<string, unknown>,
	facts?: { limited: ReachedLimit[]; partlyRead: PartlyReadItem[] },
): Promise<ConstraintInput[]> {
	return resolveConstraints(args, params, {
		limited:    facts?.limited ?? [],
		partlyRead: facts?.partlyRead ?? [],
		measurer:   createItemMeasurer(await getDb()),
	});
}
