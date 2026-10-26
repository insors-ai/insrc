/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compile-time checks of the typed git definitions (npm run typecheck:tools). Nothing here runs.
 *
 * Each @ts-expect-error line must really be an error: tsc reports an unused directive, so a change that
 * widens a tool's schema types (a ': Tool' annotation, a loose schema) fails the check.
 */

import type { Static } from '@sinclair/typebox';
import { gitCatFileTool } from '../builtins/git/cat-file.js';
import { gitToolDefinitions } from '../builtins/git/definitions.js';
import { gitDiffTool } from '../builtins/git/diff.js';
import { gitFetchTool } from '../builtins/git/fetch.js';
import { gitFetchRefsTool } from '../builtins/git/fetch-refs.js';
import { gitLsTreeTool } from '../builtins/git/ls-tree.js';
import { gitRevParseTool } from '../builtins/git/rev-parse.js';
import { gitShowTool } from '../builtins/git/show.js';
import { gitSymbolicRefTool } from '../builtins/git/symbolic-ref.js';
import { callTool } from '../call-tool.js';
import type { TypedTool } from '../call-tool.js';
import type { spawnManaged } from '../shell-helper.js';
import type { ToolDeps } from '../types.js';

declare const deps: ToolDeps;

// The list of all git definitions satisfies readonly TypedTool[] (every element is checked).
export const allGit: readonly TypedTool[] = gitToolDefinitions;

export async function positive(): Promise<void> {
	// valid input compiles and the result fields are concrete
	const diff = await callTool(gitDiffTool, { cwd: '/repo', staged: true }, deps);
	if (diff.success) {
		const files: Array<{ path: string }> = diff.data.files;
		const total: number = diff.data.totalInsertions;
		void files; void total;
	}
	const show = await callTool(gitShowTool, { ref: 'HEAD' }, deps);
	if (show.success) { const subject: string = show.data.subject; void subject; }
	const rev = await callTool(gitRevParseTool, { rev: 'HEAD' }, deps);
	if (rev.success) { const values: string[] = rev.data.values; void values; }
	const fetch = await callTool(gitFetchTool, { remote: 'origin' }, deps);
	if (fetch.success) { const updates: string[] = fetch.data.updates; void updates; }
	const input: Static<typeof gitCatFileTool.inputSchema> = { rev: 'HEAD', exists: true, timeoutMs: 100 };
	void input;
	void gitFetchRefsTool; void gitLsTreeTool; void gitSymbolicRefTool;
}

export async function negative(): Promise<void> {
	// @ts-expect-error an input field the schema does not have
	await callTool(gitDiffTool, { nope: 1 }, deps);
	// @ts-expect-error an input field of the wrong type
	await callTool(gitDiffTool, { cwd: 5 }, deps);
	// @ts-expect-error timeoutMs is a number
	await callTool(gitCatFileTool, { rev: 'HEAD', timeoutMs: 'soon' }, deps);
	const r = await callTool(gitDiffTool, {}, deps);
	if (r.success) {
		// @ts-expect-error a misspelt result field
		void r.data.filez;
	}
}

// spawnManaged: reading child without narrowing on spawned does not compile.
export function spawnedNeedsNarrowing(m: ReturnType<typeof spawnManaged>): void {
	// @ts-expect-error child exists only on the spawned branch
	void m.child;
	if (m.spawned) { void m.child; }
}
