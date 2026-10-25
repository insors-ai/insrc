/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compile-time checks for callTool (s2/t6). tsx does not type-check and tsconfig
 * excludes __tests__, so these live in a file the build (tsc) compiles. Each
 * @ts-expect-error line fails the build if the line stops being an error. This
 * file exports nothing and nothing imports it.
 */

import { Type } from '@sinclair/typebox';
import { callTool } from './call-tool.js';
import { withGhFailureNet } from './builtins/gh/helpers.js';
import { ghRunViewTool } from './builtins/gh/actions.js';
import { ghPrDiffTool, ghPrListTool } from './builtins/gh/pr.js';
import { ghRepoCloneTool } from './builtins/gh/repo.js';
import type { ToolDeps, ToolResult } from './types.js';

const withSchemas = {
	id: 'type_test_typed',
	description: 'type test',
	inputSchema: Type.Object({ name: Type.String() }),
	outputSchema: Type.Object({ count: Type.Number() }),
	async execute(): Promise<ToolResult> { return { output: '', format: 'text', success: true }; },
};

const withoutOutputSchema = {
	id: 'type_test_untyped',
	description: 'type test',
	inputSchema: Type.Object({ name: Type.String() }),
	async execute(): Promise<ToolResult> { return { output: '', format: 'text', success: true }; },
};

async function _typeChecks(deps: ToolDeps): Promise<void> {
	// Data is typed from the output schema, with no cast.
	const ok = await callTool(withSchemas, { name: 'a' }, deps);
	if (ok.success) {
		const count: number = ok.data.count;
		void count;
		// @ts-expect-error the output schema has no 'missing' field
		void ok.data.missing;
	} else {
		// A failure carries a ToolFailure and no data.
		const kind: string = ok.error.kind;
		void kind;
		// @ts-expect-error data is absent when success is false
		void ok.data;
	}

	// The input is typed from the input schema.
	// @ts-expect-error name must be a string
	await callTool(withSchemas, { name: 5 }, deps);

	// A tool with no outputSchema does not compile.
	// @ts-expect-error missing outputSchema
	await callTool(withoutOutputSchema, { name: 'a' }, deps);
}

// withGhFailureNet keeps the concrete schema types (s5/t2): the wrapped definition is called exactly as the original.
const wrappedWithSchemas = withGhFailureNet(withSchemas);
async function _ghNetTypeChecks(deps: ToolDeps): Promise<void> {
	const ok = await callTool(wrappedWithSchemas, { name: 'a' }, deps);
	if (ok.success) {
		const count: number = ok.data.count;
		void count;
		// @ts-expect-error the output schema has no 'missing' field
		void ok.data.missing;
	}
	// @ts-expect-error name must be a string
	await callTool(wrappedWithSchemas, { name: 5 }, deps);
}
void _ghNetTypeChecks;

// the existing gh tools keep their concrete input and result types through callTool (s5/t6)
async function _ghToolTypeChecks(deps: ToolDeps): Promise<void> {
	const diff = await callTool(ghPrDiffTool, { number: 3 }, deps);
	if (diff.success) {
		const truncated: boolean = diff.data.truncated;
		const bytes: number = diff.data.diffBytes;
		void truncated; void bytes;
		// @ts-expect-error the diff result has no 'files' field
		void diff.data.files;
	}
	// @ts-expect-error number is required
	await callTool(ghPrDiffTool, {}, deps);
	const run = await callTool(ghRunViewTool, { runId: 9 }, deps);
	if (run.success) { const truncated: boolean = run.data.truncated; void truncated; }
	const list = await callTool(ghPrListTool, {}, deps);
	if (list.success) { const count: number = list.data.count; void count; }
	// @ts-expect-error extraArgs is a list of strings
	await callTool(ghRepoCloneTool, { repo: 'o/r', extraArgs: '--depth=1' }, deps);
}
void _ghToolTypeChecks;
void _typeChecks;
