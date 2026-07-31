/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — daemon tool wrapper (Epic 870ed3dd, Story s1 · t7).
 *
 * `docgen_generate` is the daemon tool-surface entry point. Its handler is a
 * thin boundary: resolve + run entirely daemon-side via `generateDocument`, and
 * return only the finished `DocGenOutcome<RenderedDocumentShell>` — never a
 * store handle, EntityRow, or DocumentIR (ac5/k2). The identical capability is
 * enumerated on the IPC + MCP surfaces from the same registry (k4).
 */

import { registerTool } from '../daemon/tools/registry.js';
import type { Tool, ToolInput, ToolResult } from '../daemon/tools/types.js';
import { getLogger } from '../shared/logger.js';

import { generateDocument, listDocTypes } from './index.js';
import { buildDocgenInputSchema } from './schema.js';
import type { ShellOutcome } from './outcome.js';

const log = getLogger('docgen:tool');

export const DOCGEN_TOOL_ID = 'docgen_generate';

/** One-line human description of a non-ok outcome for the tool's rendered
 *  output + error field. The `ok` arm is handled by the caller. */
export function describeOutcome(outcome: ShellOutcome): string {
	switch (outcome.status) {
		case 'ok':                  return `document generated (${outcome.value.docType}, ${outcome.value.backend})`;
		case 'empty-scope':         return `empty scope: ${outcome.reason}`;
		case 'not-found':           return `unknown document type: ${outcome.symbol}`;
		case 'truncated':           return `truncated at depth ${outcome.depthUsed}`;
		case 'fallback-unavailable': return `${outcome.reason} — remedy: ${outcome.remedy}`;
		case 'source-not-ready':    return `source not ready: ${outcome.reason}`;
	}
}

/** The docgen daemon tool. Exported so the surface-parity test can assert its
 *  inputSchema is the registry-derived shape (not a hand-maintained literal). */
export const docgenTool: Tool = {
	id: DOCGEN_TOOL_ID,
	description:
		'Generate a self-contained offline HTML developer document from the code graph. ' +
		`docType is a registered document type (currently: ${listDocTypes().map(d => d.docType).join(', ')}); ` +
		'repo is an absolute registered+indexed repo root; per-type fields (path / symbol / base / ' +
		'question / maxDepth) scope the document — see each type\'s summary. ' +
		'Output data: `{ status, value?: RenderedDocumentShell }` — the shell `html` is a ' +
		'single offline file (inlined Mermaid SVG runtime + zoom/pan, no network). Read-only; ' +
		'reads happen inside the daemon and only the finished document is returned.',
	// Registry-derived: the advertised input mirrors listDocTypes() so the tool,
	// IPC, and MCP surfaces cannot drift and a new doc type needs no edit (k4/ac4).
	inputSchema: buildDocgenInputSchema(listDocTypes()),
	requiresApproval: false,

	async execute(input: ToolInput): Promise<ToolResult> {
		const docType = typeof input['docType'] === 'string' ? input['docType'] : '';
		const repo    = typeof input['repo'] === 'string' ? input['repo'] : '';
		if (docType.length === 0 || repo.length === 0) {
			return { output: 'docgen_generate requires { docType, repo }', format: 'text', success: false, error: 'missing docType/repo' };
		}
		// Forward the WHOLE validated input so every registered doc type's fields
		// (symbol/base/question/maxDepth) reach its extractor — not just {repo,path}
		// (ac1). docType in the object is harmless; extractors read only their keys.
		const outcome = await generateDocument(docType, input);
		if (outcome.status === 'ok') {
			return {
				output: describeOutcome(outcome),
				format: 'json',
				success: true,
				data: outcome,   // { status:'ok', value: RenderedDocumentShell } — html carried here, not dumped to output
			};
		}
		log.info({ docType, status: outcome.status }, 'docgen_generate non-ok outcome');
		return { output: describeOutcome(outcome), format: 'text', success: false, error: describeOutcome(outcome), data: outcome };
	},
};

/** Register the docgen tool on the daemon tool surface. Idempotent-safe via the
 *  registry's overwrite-warn; called once at daemon boot. */
export function registerDocgenTool(): void {
	registerTool(docgenTool);
}
