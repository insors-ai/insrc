/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * doc.mention exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 2. Given a subject,
 * find doc sections that mention it via hybrid retrieval (vector +
 * keyword). Repo-scoped by ExplorationRunnerContext.repoPath. No
 * LLM: this is pure retrieval with typed output.
 *
 * Backing: `analyze/docs-retrieval.ts::retrieveDocSections` -- same
 * primitive the docs shaper's `docs_retrieve` tool wraps. Reusing
 * the retriever means the exploration output is consistent with
 * the tool-loop path when Phase 6 retires the legacy shaper.
 */

import { getDb } from '../../db/client.js';
import { getLogger } from '../../shared/logger.js';

import { retrieveDocSections } from '../docs-retrieval.js';
import type {
	DocMentionHit,
	DocMentionOutput,
	Exploration,
	ExplorationRunnerContext,
} from './types.js';

const log = getLogger('analyze:explore:doc-mention');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 15;
const MAX_LIMIT     = 40;
const DEFAULT_PREVIEW_CHARS = 300;
const MAX_PREVIEW_CHARS     = 1_500;

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface DocMentionParams {
	readonly subject:      string;
	readonly limit?:       number;
	readonly filenameHint?: string;
	readonly kinds?:       readonly ('document' | 'section' | 'config')[];
	readonly previewChars?: number;
	readonly minScore?:    number;
}

function parseParams(exp: Exploration): DocMentionParams {
	const p = exp.params as Record<string, unknown>;
	const subject = typeof p['subject'] === 'string' ? (p['subject'] as string).trim() : '';
	if (subject.length === 0) {
		throw new Error(`doc.mention: params.subject is required (non-empty string)`);
	}
	const limit = typeof p['limit'] === 'number' && p['limit']! > 0
		? Math.min(MAX_LIMIT, Math.floor(p['limit'] as number))
		: DEFAULT_LIMIT;
	const previewChars = typeof p['previewChars'] === 'number' && p['previewChars']! >= 0
		? Math.min(MAX_PREVIEW_CHARS, Math.floor(p['previewChars'] as number))
		: DEFAULT_PREVIEW_CHARS;
	const minScore = typeof p['minScore'] === 'number' && p['minScore']! >= 0
		? p['minScore'] as number
		: 0;
	const filenameHint = typeof p['filenameHint'] === 'string' && p['filenameHint']!.length > 0
		? (p['filenameHint'] as string)
		: undefined;
	const kindsRaw = p['kinds'];
	const kinds = Array.isArray(kindsRaw)
		? kindsRaw.filter(k => k === 'document' || k === 'section' || k === 'config') as ('document' | 'section' | 'config')[]
		: undefined;
	return {
		subject,
		limit,
		previewChars,
		minScore,
		...(filenameHint !== undefined ? { filenameHint } : {}),
		...(kinds !== undefined && kinds.length > 0 ? { kinds } : {}),
	};
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runDocMention(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<DocMentionOutput> {
	const params = parseParams(exp);
	const db = await getDb();

	const results = await retrieveDocSections({
		db,
		query:        params.subject,
		closureRepos: [ctx.repoPath],
		maxResults:   params.limit ?? DEFAULT_LIMIT,
		minScore:     params.minScore ?? 0,
		previewChars: params.previewChars ?? DEFAULT_PREVIEW_CHARS,
		...(params.filenameHint !== undefined ? { filenameHint: params.filenameHint } : {}),
		...(params.kinds !== undefined ? { kinds: params.kinds } : {}),
	});

	const hits: DocMentionHit[] = results.map(r => ({
		entityId: r.entityId,
		file:     r.file,
		heading:  r.heading,
		kind:     r.kind,
		score:    Math.round(r.score * 1_000) / 1_000,
		...(r.bodyPreview !== undefined && r.bodyPreview.length > 0 ? { preview: r.bodyPreview } : {}),
	}));

	log.info(
		{
			runId:    ctx.runId,
			subject:  params.subject,
			returned: hits.length,
		},
		'doc.mention: complete',
	);

	return {
		type:    'doc.mention',
		subject: params.subject,
		hits,
	};
}
