/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Doc summariser driver.
 *
 * Runs at index time as a background job (one LLM call per doc /
 * section entity). Persists a `DocSummary` row to the LMDB
 * `docSummary` sub-DB. Downstream shapers + adherence checks
 * consult these summaries as a pre-baked project context.
 *
 * plans/docs-module.md Section 8. Skip-if-unchanged via contentHash;
 * failure modes produce a placeholder row (status='unknown',
 * errorCode set) so we don't infinitely retry a doc that
 * consistently breaks the schema.
 *
 * The driver is invoked from the indexer's job processor -- see
 * `indexer/index.ts`. Not a shaper; no tool loop.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadAnalyzeConfig } from '../../config/analyze.js';
import { buildShaperProvider } from '../context/shaper-provider.js';
import type { DbClient } from '../../db/client.js';
import {
	getDocSummary,
	writeDocSummary,
} from '../../db/doc-summaries.js';
import { entityU64ForId } from '../../db/entities.js';
import { getLogger } from '../../shared/logger.js';
import type {
	DocFamily,
	DocStatus,
	DocSummary,
	DocSummaryKind,
} from '../../shared/analyze-types.js';
import type {
	Entity,
	LLMMessage,
	LLMProvider,
	StructuredSchema,
} from '../../shared/types.js';

import { inferDocFamily } from './family.js';

const log = getLogger('analyze:summariser');

const SUMMARISER_PROMPT_REL = 'prompts/analyze/doc-summariser.system.md';

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class DocSummariserPromptMissingError extends Error {
	constructor(path: string) {
		super(`Doc-summariser prompt file missing: ${path}`);
		this.name = 'DocSummariserPromptMissingError';
	}
}

// ---------------------------------------------------------------------------
// LLM response schema -- tiny + shallow, so Ollama's format-constrained
// decoder is reliable
// ---------------------------------------------------------------------------

const DOC_SUMMARY_LLM_SCHEMA: StructuredSchema = {
	type:                 'object',
	additionalProperties: false,
	required:             [
		'title', 'family', 'kind', 'subjects', 'summary',
		'keyDecisions', 'keyConstraints', 'relatedEntities', 'status',
	],
	properties: {
		title:    { type: 'string' },
		family:   {
			type: 'string',
			enum: ['design', 'plans', 'docs', 'adr', 'rfc', 'spec', 'changelog', 'readme', 'other'],
		},
		kind:     {
			type: 'string',
			enum: ['design', 'plan', 'requirement', 'reference', 'changelog', 'other'],
		},
		subjects: {
			type:     'array',
			items:    { type: 'string' },
			maxItems: 6,
		},
		summary:  { type: 'string' },
		keyDecisions: {
			type:     'array',
			items:    { type: 'string' },
			maxItems: 8,
		},
		keyConstraints: {
			type:     'array',
			items:    { type: 'string' },
			maxItems: 8,
		},
		relatedEntities: {
			type:  'array',
			items: { type: 'string' },
		},
		status: {
			type: 'string',
			enum: ['current', 'superseded', 'draft', 'unknown'],
		},
	},
};

interface LlmDocSummary {
	title:           string;
	family:          DocFamily;
	kind:            DocSummaryKind;
	subjects:        readonly string[];
	summary:         string;
	keyDecisions:    readonly string[];
	keyConstraints:  readonly string[];
	relatedEntities: readonly string[];
	status:          DocStatus;
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export interface SummariseDocArgs {
	readonly db:            DbClient;
	readonly entity:        Entity;
	/** Optional list of code identifiers in the workspace to help the
	 *  LLM ground its `relatedEntities` extraction. Pass a sample
	 *  (up to ~200 identifiers) -- the LLM sees them in the prompt.
	 *  Empty array = summariser runs without grounding hints. */
	readonly identifierHints?: readonly string[];
	/** Optional injected provider (tests / bench). Production callers
	 *  leave undefined; the driver constructs its own. */
	readonly provider?: LLMProvider | undefined;
}

export interface SummariseDocResult {
	readonly ok:        boolean;
	readonly skipped?:  'unchanged' | 'not-a-doc' | 'body-empty';
	readonly summary?:  DocSummary;
	readonly errorCode?: string;
	readonly errorMessage?: string;
}

/**
 * Summarise a single doc / section / config entity. Idempotent +
 * cache-aware:
 *
 * 1. Bail with `skipped='not-a-doc'` if the entity isn't a doc /
 *    section (config entities are covered by other indexer passes).
 * 2. Bail with `skipped='body-empty'` when the entity has no body
 *    to summarise.
 * 3. Bail with `skipped='unchanged'` when an existing summary matches
 *    the current `contentHash` + `modelId`.
 * 4. Run the LLM call; on schema-recoverable failure, write a
 *    placeholder row + return `ok=false`.
 * 5. On success, persist the summary + return `ok=true`.
 *
 * NEVER throws for LLM-side or schema-side failures -- the indexer
 * job runner treats a `false` return as "try again on next re-index"
 * rather than crashing the daemon.
 */
export async function summariseDoc(args: SummariseDocArgs): Promise<SummariseDocResult> {
	const { db, entity } = args;

	if (entity.kind !== 'document' && entity.kind !== 'section') {
		return { ok: false, skipped: 'not-a-doc' };
	}

	const body = entity.body ?? '';
	if (body.trim().length === 0) {
		return { ok: false, skipped: 'body-empty' };
	}

	const cfg = loadAnalyzeConfig();
	const modelId = cfg.shaperModel;
	const contentHash = sha256(body);

	// Skip-if-unchanged: same body + same model = same summary.
	const existing = await getDocSummary(db, entity.id);
	if (existing !== null
		&& existing.contentHash === contentHash
		&& existing.modelId    === modelId
		&& existing.errorCode  === undefined) {
		log.debug({ entityId: entity.id, file: entity.file }, 'summariseDoc: skip-if-unchanged');
		return { ok: true, skipped: 'unchanged', summary: existing };
	}

	const family = inferDocFamily(entity.file);
	const promptContent = loadPromptFile();
	const provider = args.provider ?? buildShaperProvider(cfg);

	const messages = buildMessages({
		promptContent,
		entity,
		family,
		identifierHints: args.identifierHints ?? [],
	});

	let raw: LlmDocSummary;
	try {
		raw = await provider.completeStructured<LlmDocSummary>(
			messages,
			DOC_SUMMARY_LLM_SCHEMA,
			{
				maxAttempts:     cfg.shaper.structuredOutputRetries,
				disableThinking: true,
				// Tiny response -- 9 fields, mostly short strings.
				// 1024 is generous headroom; caps runaway output.
				maxTokens: 1_024,
			},
		);
	} catch (err) {
		const errorCode = classifyErrorCode(err);
		const errorMessage = (err as Error).message ?? String(err);
		log.warn(
			{ entityId: entity.id, file: entity.file, errorCode, err: errorMessage },
			'summariseDoc: LLM call failed; writing placeholder row',
		);
		const placeholder = buildPlaceholder(family, entity, modelId, contentHash, errorCode);
		try {
			await writeDocSummary(db, entity.id, entity.repo, placeholder);
		} catch (writeErr) {
			log.warn(
				{ entityId: entity.id, err: (writeErr as Error).message },
				'summariseDoc: placeholder write failed',
			);
		}
		return { ok: false, errorCode, errorMessage };
	}

	// Filter relatedEntities to entity ids we know about. The LLM may
	// have emitted paths, symbols, or hallucinations; keep only the
	// ones that resolve to a real entity.
	const relatedEntities: string[] = [];
	for (const cand of raw.relatedEntities) {
		if (typeof cand !== 'string' || cand.length === 0) continue;
		const u64 = await entityU64ForId(cand);
		if (u64 !== undefined) relatedEntities.push(cand);
	}

	const summary: DocSummary = {
		title:           raw.title,
		family:          raw.family,
		kind:            raw.kind,
		subjects:        raw.subjects,
		summary:         raw.summary,
		keyDecisions:    raw.keyDecisions,
		keyConstraints:  raw.keyConstraints,
		relatedEntities,
		status:          raw.status,
		summarisedAt:    new Date().toISOString(),
		modelId,
		contentHash,
	};

	try {
		await writeDocSummary(db, entity.id, entity.repo, summary);
	} catch (writeErr) {
		log.warn(
			{ entityId: entity.id, err: (writeErr as Error).message },
			'summariseDoc: persistence failed',
		);
		return {
			ok:           false,
			errorCode:    'persistence-failed',
			errorMessage: (writeErr as Error).message,
		};
	}
	log.info(
		{
			entityId:      entity.id,
			file:          entity.file,
			family:        summary.family,
			kind:          summary.kind,
			decisions:     summary.keyDecisions.length,
			constraints:   summary.keyConstraints.length,
			related:       summary.relatedEntities.length,
		},
		'summariseDoc: written',
	);
	return { ok: true, summary };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildMessages(args: {
	promptContent:    string;
	entity:           Entity;
	family:           DocFamily;
	identifierHints:  readonly string[];
}): LLMMessage[] {
	const { promptContent, entity, family, identifierHints } = args;

	const hintsBlock = identifierHints.length > 0
		? '\n\nWorkspace identifier hints (for `relatedEntities` grounding):\n' +
		  identifierHints.map(h => `  - ${h}`).join('\n')
		: '';

	const userContent =
		`Entity kind: ${entity.kind}\n` +
		`File path: ${entity.file}\n` +
		`Path-inferred family: ${family}\n` +
		'\n' +
		'Doc body:\n' +
		'```\n' +
		entity.body?.slice(0, 8_192) + '\n' +
		'```\n' +
		hintsBlock +
		'\n\n' +
		'Now emit the DocSummary JSON object. First character `{`, no ' +
		'markdown fence, no prose intro. Every required field present.';

	return [
		{ role: 'system', content: promptContent.trimEnd() },
		{ role: 'user',   content: userContent },
	];
}

function buildPlaceholder(
	family:      DocFamily,
	entity:      Entity,
	modelId:     string,
	contentHash: string,
	errorCode:   string,
): DocSummary {
	return {
		title:           entity.name,
		family,
		kind:            'other',
		subjects:        [],
		summary:         '',
		keyDecisions:    [],
		keyConstraints:  [],
		relatedEntities: [],
		status:          'unknown',
		summarisedAt:    new Date().toISOString(),
		modelId,
		contentHash,
		errorCode,
	};
}

function sha256(s: string): string {
	return createHash('sha256').update(s, 'utf8').digest('hex');
}

const UNAVAILABLE_PATTERNS = [
	'Ollama is not running',
	'Model not found',
	'ECONNREFUSED',
	'ECONNRESET',
	'fetch failed',
	'socket hang up',
	'EPIPE',
	'other side closed',
	'Did not receive done or success response in stream',
];

function classifyErrorCode(err: unknown): string {
	if (!(err instanceof Error)) return 'unknown';
	const msg = err.message;
	for (const pat of UNAVAILABLE_PATTERNS) {
		if (msg.includes(pat)) return 'llm-unavailable';
	}
	if (msg.includes('response-truncated')) return 'response-truncated';
	if (msg.includes('validation failed'))  return 'schema-unrecoverable';
	if (msg.includes('was not valid JSON')) return 'schema-unrecoverable';
	return 'other';
}

// ---------------------------------------------------------------------------
// Prompt loading + provider construction
// ---------------------------------------------------------------------------

function loadPromptFile(): string {
	const abs = isAbsolute(SUMMARISER_PROMPT_REL)
		? SUMMARISER_PROMPT_REL
		: resolveRelativeToInsrcRoot(SUMMARISER_PROMPT_REL);
	try {
		return readFileSync(abs, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new DocSummariserPromptMissingError(abs);
		}
		throw err;
	}
}

function resolveRelativeToInsrcRoot(relativePath: string): string {
	const thisFile = fileURLToPath(import.meta.url);
	// .../analyze/summariser/driver.js -> .../summariser -> .../analyze -> .../insrc
	const insrcRoot = resolve(thisFile, '..', '..', '..');
	return resolve(insrcRoot, relativePath);
}

// ---------------------------------------------------------------------------
// Boot validator hook
// ---------------------------------------------------------------------------

export const DOC_SUMMARISER_PROMPT_PATH = SUMMARISER_PROMPT_REL;
