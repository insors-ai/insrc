/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Docs tools -- shaper-facing surface for the docs module.
 *
 * plans/docs-module.md Phase 7. Wraps the docs-retrieval primitive
 * + doc-summary CRUD + live-project-context assembler so the docs
 * shaper (and the code/data/infra shapers in Phase 8) can consult
 * them from the tool loop.
 *
 * Tools registered:
 *   - docs_retrieve         -- hybrid retrieval, top-K matching sections
 *   - docs_project_context  -- pre-baked LiveProjectContext rollup
 *   - docs_summary_get      -- fetch a single DocSummary by entity id
 *   - docs_family_list      -- enumerate every summarised doc in a family
 *
 * All tools are read-only + closure-scoped -- they never touch state
 * outside the current session's closureRepos.
 */

import { getDb } from '../../../../db/client.js';
import { getDocSummary, listDocSummariesForRepo, listDocSummaryEntityIdsForRepo } from '../../../../db/doc-summaries.js';
import type { DocFamily, DocSummary } from '../../../../shared/analyze-types.js';

import { retrieveDocSections } from '../../../../analyze/docs-retrieval.js';
import { assembleLiveProjectContext } from '../../../../analyze/context/live-project-context.js';
import { registerTool } from '../../registry.js';
import type { Tool, ToolDeps, ToolInput, ToolResult } from '../../types.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function str(input: ToolInput, key: string): string | undefined {
	const v = input[key];
	return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(input: ToolInput, key: string): number | undefined {
	const v = input[key];
	return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function fail(id: string, msg: string): ToolResult {
	return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

function firstClosureRepo(deps: ToolDeps): string | undefined {
	const closure = deps.closureRepos ?? [];
	// V1 doc retrieval is repo-scoped (plans/docs-module.md Section
	// 6.3): the tool always uses the FIRST closure repo. Callers that
	// legitimately want cross-repo doc lookup can widen the closure
	// on a future revision.
	return closure[0];
}

// ---------------------------------------------------------------------------
// docs_retrieve
// ---------------------------------------------------------------------------

interface RetrieveResultLine {
	entityId:  string;
	file:      string;
	heading:   string;
	kind:      string;
	score:     number;
	preview?:  string;
}

export const docsRetrieveTool: Tool = {
	id: 'docs_retrieve',
	description:
		'Hybrid retrieval over the doc corpus (vector ANN + keyword rank) for the current session repo. ' +
		'Use this instead of raw search_grep to find the design / plan / spec sections relevant to a topic; ' +
		'it filters to document / section / config entities and returns citations ready for use in `artefacts`.',
	inputSchema: {
		type: 'object',
		properties: {
			query:         { type: 'string', description: 'Natural-language question or topic to retrieve.' },
			limit:         { type: 'number', minimum: 1, maximum: 40 },
			minScore:      { type: 'number', minimum: 0, maximum: 1 },
			filenameHint:  { type: 'string', description: 'Path substring bias (e.g. "design/", "plans/", "adr/").' },
			kinds:         {
				type: 'array',
				items: { type: 'string', enum: ['document', 'section', 'config'] },
				description: 'Kind allowlist. Defaults to ["document","section","config"].',
			},
			previewChars:  { type: 'number', minimum: 0, maximum: 2_000 },
		},
		required: ['query'],
		additionalProperties: false,
	},
	requiresApproval: false,

	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const query = str(input, 'query');
		if (query === undefined) return fail('docs_retrieve', 'query required');
		const repo = firstClosureRepo(deps);
		if (repo === undefined) return fail('docs_retrieve', 'session has no closure repo initialised');

		const limit    = num(input, 'limit')    ?? 20;
		const minScore = num(input, 'minScore') ?? 0;
		const previewChars = num(input, 'previewChars') ?? 500;
		const filenameHint = str(input, 'filenameHint');
		const kindsRaw = input['kinds'];
		const kinds = Array.isArray(kindsRaw)
			? (kindsRaw.filter(k => typeof k === 'string') as ('document' | 'section' | 'config')[])
			: undefined;

		const db = await getDb();
		const results = await retrieveDocSections({
			db,
			query,
			closureRepos: [repo],
			maxResults:   limit,
			minScore,
			previewChars,
			...(filenameHint !== undefined ? { filenameHint } : {}),
			...(kinds !== undefined && kinds.length > 0 ? { kinds } : {}),
		});

		const lines: RetrieveResultLine[] = results.map(r => ({
			entityId: r.entityId,
			file:     r.file,
			heading:  r.heading,
			kind:     r.kind,
			score:    Math.round(r.score * 1_000) / 1_000,
			...(r.bodyPreview !== undefined ? { preview: r.bodyPreview } : {}),
		}));

		const markdown = lines.length === 0
			? `No doc sections matched query \`${query}\`.`
			: lines
				.map((r, i) => {
					const head = `**${i + 1}. ${r.heading}** _(score ${r.score}, ${r.kind})_`;
					const cite = `cite: { kind: 'section', entityId: '${r.entityId}', file: '${r.file}', heading: '${r.heading}' }`;
					const preview = r.preview !== undefined && r.preview.length > 0
						? `\n\n\`\`\`\n${r.preview}\n\`\`\``
						: '';
					return `${head}\n${cite}${preview}`;
				})
				.join('\n\n---\n\n');

		return {
			output:  markdown,
			format:  'markdown',
			success: true,
			data:    { query, repo, count: lines.length, results: lines },
		};
	},
};

// ---------------------------------------------------------------------------
// docs_project_context
// ---------------------------------------------------------------------------

export const docsProjectContextTool: Tool = {
	id: 'docs_project_context',
	description:
		'Return the pre-baked LiveProjectContext for the session repo: family breakdown, top subjects, cited decisions + constraints, recent doc activity. ' +
		'Use FIRST when building a docs bundle -- it saves an LLM round-trip vs re-summarising every doc yourself. ' +
		'Returns empty rollups when the summariser has not run yet.',
	inputSchema: {
		type: 'object',
		properties: {
			maxDecisions:      { type: 'number', minimum: 1, maximum: 500 },
			maxConstraints:    { type: 'number', minimum: 1, maximum: 500 },
			maxSubjects:       { type: 'number', minimum: 1, maximum: 200 },
			maxRecentActivity: { type: 'number', minimum: 1, maximum: 100 },
		},
		required: [],
		additionalProperties: false,
	},
	requiresApproval: false,

	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const repo = firstClosureRepo(deps);
		if (repo === undefined) return fail('docs_project_context', 'session has no closure repo initialised');

		const opts: Record<string, number> = {};
		const md = num(input, 'maxDecisions');       if (md !== undefined) opts['maxDecisions'] = md;
		const mc = num(input, 'maxConstraints');     if (mc !== undefined) opts['maxConstraints'] = mc;
		const ms = num(input, 'maxSubjects');        if (ms !== undefined) opts['maxSubjects'] = ms;
		const ma = num(input, 'maxRecentActivity');  if (ma !== undefined) opts['maxRecentActivity'] = ma;

		const db = await getDb();
		const ctx = await assembleLiveProjectContext(db, repo, opts);

		const familyLines = (Object.entries(ctx.familyBreakdown) as [DocFamily, number][])
			.filter(([, n]) => n > 0)
			.map(([fam, n]) => `- **${fam}**: ${n}`)
			.join('\n');
		const decisionsMd = ctx.decisions.length > 0
			? ctx.decisions.map(d => `- ${d.decision}  _(cite: entity ${d.sourceEntityId}, ${d.family})_`).join('\n')
			: '_(no decisions surfaced yet -- summariser may not have completed)_';
		const constraintsMd = ctx.constraints.length > 0
			? ctx.constraints.map(c => `- ${c.constraint}  _(cite: entity ${c.sourceEntityId}, ${c.family})_`).join('\n')
			: '_(no constraints surfaced yet)_';

		const markdown =
			`## Project docs context (${repo})\n` +
			`Total docs: **${ctx.totalDocs}**  (placeholder rows: ${ctx.placeholderCount})\n` +
			`Total code entities: **${ctx.totalCodeEntities}**\n\n` +
			`### Family breakdown\n${familyLines || '_(no docs)_'}\n\n` +
			`### Decisions\n${decisionsMd}\n\n` +
			`### Constraints\n${constraintsMd}`;

		return {
			output:  markdown,
			format:  'markdown',
			success: true,
			data:    ctx as unknown as Record<string, unknown>,
		};
	},
};

// ---------------------------------------------------------------------------
// docs_summary_get
// ---------------------------------------------------------------------------

export const docsSummaryGetTool: Tool = {
	id: 'docs_summary_get',
	description:
		'Fetch the pre-baked DocSummary for a single doc / section entity. ' +
		'Returns null when the summariser has not processed the entity yet. Use to hydrate ' +
		'a specific document\'s key decisions / constraints / subjects without re-reading its body.',
	inputSchema: {
		type: 'object',
		properties: {
			entityId: { type: 'string', description: 'The doc / section entity id (SHA-32).' },
		},
		required: ['entityId'],
		additionalProperties: false,
	},
	requiresApproval: false,

	async execute(input: ToolInput): Promise<ToolResult> {
		const entityId = str(input, 'entityId');
		if (entityId === undefined) return fail('docs_summary_get', 'entityId required');

		const db = await getDb();
		const summary = await getDocSummary(db, entityId);
		if (summary === null) {
			return {
				output:  `No summary for entity \`${entityId}\`. It may not be a doc / section entity, or the summariser has not run yet.`,
				format:  'markdown',
				success: false,
				error:   'no-summary',
			};
		}
		return {
			output:  renderSummary(summary),
			format:  'markdown',
			success: true,
			data:    summary as unknown as Record<string, unknown>,
		};
	},
};

function renderSummary(s: DocSummary): string {
	const decisions   = s.keyDecisions.length   > 0 ? s.keyDecisions.map(d => `- ${d}`).join('\n')   : '_(none)_';
	const constraints = s.keyConstraints.length > 0 ? s.keyConstraints.map(c => `- ${c}`).join('\n') : '_(none)_';
	const subjects    = s.subjects.length       > 0 ? s.subjects.join(', ')                          : '_(none)_';
	const errorLine   = s.errorCode !== undefined
		? `\n**Placeholder row** (errorCode: ${s.errorCode})\n`
		: '';
	return (
		`### ${s.title}\n` +
		`Family: ${s.family}  ·  Kind: ${s.kind}  ·  Status: ${s.status}  ·  Model: ${s.modelId}${errorLine}\n\n` +
		`Subjects: ${subjects}\n\n` +
		`**Summary**\n${s.summary}\n\n` +
		`**Key decisions**\n${decisions}\n\n` +
		`**Key constraints**\n${constraints}\n`
	);
}

// ---------------------------------------------------------------------------
// docs_family_list
// ---------------------------------------------------------------------------

export const docsFamilyListTool: Tool = {
	id: 'docs_family_list',
	description:
		'List every summarised doc in a family (design / plans / docs / adr / rfc / spec / changelog / readme / other) for the session repo. ' +
		'Returns entity id + title + status + subjects per doc. Use to enumerate all decisions / plans / etc without a retrieval query.',
	inputSchema: {
		type: 'object',
		properties: {
			family: {
				type: 'string',
				enum: ['design', 'plans', 'docs', 'adr', 'rfc', 'spec', 'changelog', 'readme', 'other'],
			},
			limit: { type: 'number', minimum: 1, maximum: 200 },
		},
		required: ['family'],
		additionalProperties: false,
	},
	requiresApproval: false,

	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const family = str(input, 'family') as DocFamily | undefined;
		if (family === undefined) return fail('docs_family_list', 'family required');
		const repo = firstClosureRepo(deps);
		if (repo === undefined) return fail('docs_family_list', 'session has no closure repo initialised');
		const limit = num(input, 'limit') ?? 100;

		const db = await getDb();
		const summaries = await listDocSummariesForRepo(db, repo);
		const ids       = await listDocSummaryEntityIdsForRepo(db, repo);
		const zipLen = Math.min(summaries.length, ids.length);

		const rows: Array<{
			entityId: string;
			title:    string;
			status:   string;
			subjects: readonly string[];
		}> = [];
		for (let i = 0; i < zipLen; i++) {
			const s = summaries[i]!;
			if (s.family !== family) continue;
			if (s.errorCode !== undefined) continue;
			rows.push({
				entityId: ids[i]!,
				title:    s.title,
				status:   s.status,
				subjects: s.subjects,
			});
			if (rows.length >= limit) break;
		}

		const markdown = rows.length === 0
			? `No summarised docs in family \`${family}\` for repo \`${repo}\`.`
			: `## ${family} docs (${rows.length} in ${repo})\n\n` +
				rows.map(r =>
					`- **${r.title}** _(entity ${r.entityId}, status ${r.status})_\n` +
					`  Subjects: ${r.subjects.join(', ')}`
				).join('\n');

		return {
			output:  markdown,
			format:  'markdown',
			success: true,
			data:    { family, repo, count: rows.length, docs: rows },
		};
	},
};

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

export function registerDocsTools(): void {
	registerTool(docsRetrieveTool);
	registerTool(docsProjectContextTool);
	registerTool(docsSummaryGetTool);
	registerTool(docsFamilyListTool);
}
