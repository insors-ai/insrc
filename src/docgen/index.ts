/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — daemon bootstrap + generation orchestration (Epic 870ed3dd, s1 · t7).
 *
 * Stands up the DocTypeRegistry with the Phase A type-structure extractor bound
 * to the graph-backed reader, and exposes the single generation entry point
 * every surface (tool / IPC / MCP) funnels through:
 *
 *   generateDocument(docType, input)
 *     = registry.get(docType)            (→ not-found)
 *       .extract(input)                  (→ empty-scope / source-not-ready / ok)
 *       .flatMap(assembleShell)          (→ fallback-unavailable / ok)
 *
 * Reads happen entirely inside the daemon (k2); the caller receives only the
 * finished DocGenOutcome<RenderedDocumentShell>.
 */

import { InMemoryDocTypeRegistry, toSerializable } from './registry.js';
import { typeStructureRegistration } from './extract/type-structure.js';
import { graphTypeReader } from './extract/graph-reader.js';
import { componentDependencyRegistration } from './extract/component-dependency.js';
import { componentGraphReader } from './extract/component-graph-reader.js';
import { callSequenceRegistration } from './extract/call-sequence.js';
import { callGraphReader } from './extract/call-graph-reader.js';
import { narrativeRegistration } from './extract/narrative.js';
import { narrativeGenerator } from './extract/narrative-generator.js';
import { notFound, sourceNotReady, type ShellOutcome } from './outcome.js';
import { assembleShell } from './render/shell.js';
import { listRepos } from '../db/repos.js';
import type { DocTypeRegistry, SerializableDocTypeRegistration } from './types.js';

/** The process-wide docgen registry, bootstrapped with the Phase A doc types. */
export const docgenRegistry: DocTypeRegistry = (() => {
	const r = new InMemoryDocTypeRegistry();
	r.register(typeStructureRegistration(graphTypeReader));           // s1
	const componentDependency = componentDependencyRegistration(componentGraphReader); // s2
	const callSequence = callSequenceRegistration(callGraphReader);   // s3
	r.register(componentDependency);
	r.register(callSequence);
	// s4 narrative composes the s2/s3 derived extractors as its diagram bases +
	// the core-tier narrator seam (k1-safe). No new tool/IPC surface.
	r.register(narrativeRegistration({
		'component-dependency': componentDependency.extract,
		'call-sequence':        callSequence.extract,
	}, narrativeGenerator));
	return r;
})();

/** The serializable capability listing every surface enumerates (one source of
 *  truth → tool / IPC / MCP cannot drift, k4). */
export function listDocTypes(): readonly SerializableDocTypeRegistration[] {
	return docgenRegistry.list().map(toSerializable);
}

/**
 * The centralized ac3 precondition (s6 · t1): a repo is documentable only when
 * it is REGISTERED and has FINISHED indexing (registry status `ready`). This
 * mirrors the graph readers' own `revision()` rule (a repo with no pinnable
 * revision → source-not-ready), so the check is the same one the extractors
 * apply — hoisted to the single generation entry point so every surface (tool,
 * IPC, MCP) inherits it identically instead of re-checking (k11/k2).
 */
export async function isRepoReady(repoRoot: string): Promise<boolean> {
	const repos = await listRepos(undefined);
	const repo = repos.find(r => r.path === repoRoot);
	return repo !== undefined && repo.status === 'ready';
}

/** Injectable dependencies for generateDocument. The readiness check defaults
 *  to `isRepoReady` over the live repo registry; tests inject a fake so the
 *  boundary is exercised without a live store. */
export interface GenerateDeps {
	readonly isRepoReady?: (repoRoot: string) => Promise<boolean>;
}

/**
 * Generate a document: resolve the docType, enforce the registered/indexed
 * precondition, run the extractor with the FULL input, and assemble the
 * self-contained shell. The single path every surface funnels through (k4):
 *
 *   1. unknown docType            → not-found   (precedence over source-not-ready)
 *   2. repo not registered/indexed → source-not-ready (ac3, before extraction)
 *   3. extract(input)             → empty-scope / source-not-ready / ok
 *   4. assembleShell              → fallback-unavailable / ok
 *
 * The whole `input` is forwarded to the extractor verbatim, so a call-sequence
 * request ({repo,symbol}) and a narrative request ({repo,base,question}) reach
 * their extractor's parseScope identically to type-structure — the surfaces
 * just have to forward it (s6 · t3/t4).
 */
export async function generateDocument(
	docType: string,
	input: Record<string, unknown>,
	deps: GenerateDeps = {},
): Promise<ShellOutcome> {
	const reg = docgenRegistry.get(docType);
	if (reg === undefined) return notFound(docType);   // not-found first (ac3 precedence)

	// ac3: registered + finished indexing, checked before any extractor runs. A
	// missing repo is left to the extractor's parseScope (→ empty-scope), so a
	// malformed input is reported as such rather than as source-not-ready.
	const repo = input['repo'];
	if (typeof repo === 'string' && repo.length > 0) {
		const ready = await (deps.isRepoReady ?? isRepoReady)(repo);
		if (!ready) {
			return sourceNotReady(
				`repo '${repo}' is not registered or has not finished indexing; add and index it (repo.add) before generating documentation`,
			);
		}
	}

	const ir = await reg.extract(input);
	if (ir.status !== 'ok') return ir;           // empty-scope / source-not-ready / …
	return assembleShell(ir.value);              // → ok(shell) / fallback-unavailable
}
