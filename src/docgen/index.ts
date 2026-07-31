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
import { notFound, type ShellOutcome } from './outcome.js';
import { assembleShell } from './render/shell.js';
import type { DocTypeRegistry, SerializableDocTypeRegistration } from './types.js';

/** The process-wide docgen registry, bootstrapped with the Phase A doc types. */
export const docgenRegistry: DocTypeRegistry = (() => {
	const r = new InMemoryDocTypeRegistry();
	r.register(typeStructureRegistration(graphTypeReader));           // s1
	r.register(componentDependencyRegistration(componentGraphReader)); // s2
	return r;
})();

/** The serializable capability listing every surface enumerates (one source of
 *  truth → tool / IPC / MCP cannot drift, k4). */
export function listDocTypes(): readonly SerializableDocTypeRegistration[] {
	return docgenRegistry.list().map(toSerializable);
}

/**
 * Generate a document: resolve the docType, run its extractor, and assemble the
 * self-contained shell. The single path from an external request to a rendered
 * document; unknown docType → not-found, everything else flows through the
 * extractor's + assembler's own outcomes.
 */
export async function generateDocument(
	docType: string,
	input: Record<string, unknown>,
): Promise<ShellOutcome> {
	const reg = docgenRegistry.get(docType);
	if (reg === undefined) return notFound(docType);
	const ir = await reg.extract(input);
	if (ir.status !== 'ok') return ir;           // empty-scope / source-not-ready / …
	return assembleShell(ir.value);              // → ok(shell) / fallback-unavailable
}
