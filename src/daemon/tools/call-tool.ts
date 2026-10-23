/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * callTool (sc2): the typed way for workflow and daemon code to run a registry
 * tool. The caller passes the tool DEFINITION, so its input and its result are
 * typed from the definition's typebox schemas with no cast, and a tool without
 * an outputSchema does not compile. Every failure comes back as a ToolFailure;
 * nothing is thrown for a tool failure and no model call is made here (a
 * text-only tool converts inside itself with convertText).
 */

import type { Static, TSchema } from '@sinclair/typebox';
import { executeTool } from './executor.js';
import type { Tool, ToolDeps, ToolFailure, ToolInput } from './types.js';

/** A tool whose input and result shapes are both typebox schemas. */
export type TypedTool = Tool & { readonly inputSchema: TSchema; readonly outputSchema: TSchema };

export type TypedToolResult<T> =
	| { readonly success: true;  readonly data: T; readonly output: string }
	| { readonly success: false; readonly error: ToolFailure; readonly output: string };

export async function callTool<T extends TypedTool>(
	tool:  T,
	input: Static<T['inputSchema']>,
	deps:  ToolDeps,
): Promise<TypedToolResult<Static<T['outputSchema']>>> {
	const result = await executeTool(tool.id, input as ToolInput, deps);
	if (result.success && result.data !== undefined) {
		return { success: true, data: result.data as Static<T['outputSchema']>, output: result.output };
	}
	const error: ToolFailure = result.failure ?? (result.success
		? { kind: 'schema-mismatch', message: `tool ${tool.id} returned no data for its declared output schema` }
		: { kind: 'rejected', message: result.error ?? result.output });
	return { success: false, error, output: result.output };
}
