/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * insrc_docgen — the MCP (assistant-facing) surface for docgen (Epic 870ed3dd,
 * Story s6). The missing THIRD surface: with the daemon tool + IPC method, this
 * brings docgen to full tool/IPC/MCP parity (k4/ac1/ac4).
 *
 * The handler is a thin, DAEMON-OWNED-READ boundary (k2/ac2): it resolves the
 * repo, forwards the whole request to the `docgen.generate` IPC over the daemon
 * socket, and returns the finished DocGenOutcome. It deliberately imports ONLY
 * the daemon IPC client (`docgenGenerate` / `docgenList`) + `resolveRepoPath`
 * and NEVER `generateDocument` or any docgen extractor module — the graph read
 * happens inside the daemon, and this process only ever sees the finished
 * outcome. Non-ok / unreachable results become an actionable `isError` (ac3).
 */

import { getLogger } from '../../shared/logger.js';
import { resolveRepoPath } from '../resolve-repo.js';
import { docgenGenerate, type UnaryRpcDeps } from '../daemon-stream.js';
import type { DocGenOutcome, RenderedDocumentShell } from '../../docgen/types.js';

const log = getLogger('mcp:docgen');

/** Parsed args of `insrc_docgen`. `docType` is required; `repo` falls back to
 *  the session workspace / INSRC_REPO; the rest are per-doc-type scope fields
 *  forwarded verbatim to the daemon (each extractor reads only its own keys). */
export interface DocgenArgs {
	readonly docType?:  string | undefined;
	readonly repo?:     string | undefined;
	readonly path?:     string | undefined;
	readonly symbol?:   string | undefined;
	readonly base?:     string | undefined;
	readonly question?: string | undefined;
	readonly maxDepth?: number | undefined;
}

/** The MCP tool result envelope (text carrying the JSON outcome). */
export interface DocgenEnvelope {
	readonly content:  { readonly type: 'text'; readonly text: string }[];
	readonly isError?: boolean;
	readonly [key: string]: unknown;
}

/** One human line for a non-ok outcome (local copy so this module never imports
 *  the daemon-side tool.ts, which would transitively pull in generateDocument). */
function describe(outcome: DocGenOutcome<RenderedDocumentShell>): string {
	switch (outcome.status) {
		case 'ok':                   return `document generated (${outcome.value.docType}, ${outcome.value.backend})`;
		case 'empty-scope':          return `empty scope: ${outcome.reason}`;
		case 'not-found':            return `unknown document type: ${outcome.symbol}`;
		case 'truncated':            return `truncated at depth ${outcome.depthUsed}`;
		case 'fallback-unavailable': return `${outcome.reason} — remedy: ${outcome.remedy}`;
		case 'source-not-ready':     return `source not ready: ${outcome.reason}`;
	}
}

const err = (msg: string): DocgenEnvelope => ({ content: [{ type: 'text', text: msg }], isError: true });

/**
 * Handle an `insrc_docgen` call: resolve the repo, forward the whole request to
 * the daemon `docgen.generate` IPC, and return the outcome. `deps` is the unary
 * socket test seam (a fake in tests; the real daemon connection in production).
 */
export async function handleDocgen(args: DocgenArgs, deps: UnaryRpcDeps = {}): Promise<DocgenEnvelope> {
	const docType = typeof args.docType === 'string' ? args.docType : '';
	if (docType.length === 0) {
		return err('insrc_docgen: `docType` is required — a registered docgen document type (enumerate them via the daemon docgen.list surface).');
	}

	const repo = await resolveRepoPath(args.repo);
	if (repo === undefined || repo.length === 0) {
		return err('insrc_docgen: no repo — pass `repo`, or run inside a registered repo (INSRC_REPO). The repo must be registered and finished indexing.');
	}

	// Forward the WHOLE request (+ resolved repo) so every doc type's per-type
	// fields reach its extractor; the daemon performs the read (ac2), we get only
	// the finished outcome back.
	const params: Record<string, unknown> = { ...args, docType, repo };
	try {
		const outcome = await docgenGenerate(params, deps);
		if (outcome.status === 'ok') {
			return { content: [{ type: 'text', text: JSON.stringify(outcome) }] };
		}
		log.info({ docType, status: outcome.status }, 'insrc_docgen non-ok outcome');
		return err(`insrc_docgen: ${describe(outcome)}`);
	} catch (e) {
		// Daemon unreachable / IPC rejection → an actionable error, never a
		// fabricated document.
		return err(`insrc_docgen: ${e instanceof Error ? e.message : String(e)}`);
	}
}
