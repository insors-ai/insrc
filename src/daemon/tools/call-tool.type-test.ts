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
void _typeChecks;
