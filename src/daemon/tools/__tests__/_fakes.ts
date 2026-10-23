/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared fakes for the s2 tool tests: a fake Tool factory that records whether it ran,
 * and small typebox schemas. Not a test file (no .test suffix).
 */

import { Type } from '@sinclair/typebox';
import type { Tool, ToolDeps, ToolInput, ToolResult } from '../types.js';

export const InSchema = Type.Object({ name: Type.String(), count: Type.Number() }, { additionalProperties: false });
export const OutSchema = Type.Object({ id: Type.String(), total: Type.Number() }, { additionalProperties: false });

export interface FakeTool extends Tool { ran: number }

export function fakeTool(id: string, result: ToolResult | (() => ToolResult), opts: { schemas?: boolean; outputSchema?: unknown; inputSchema?: unknown } = {}): FakeTool {
	const t = {
		id, description: 'fake', ran: 0,
		inputSchema: (opts.inputSchema ?? (opts.schemas === false ? { type: 'object' } : InSchema)) as Record<string, unknown>,
		...(opts.schemas === false ? {} : { outputSchema: (opts.outputSchema ?? OutSchema) as never }),
		async execute(_input: ToolInput, _deps: ToolDeps): Promise<ToolResult> {
			t.ran += 1;
			return typeof result === 'function' ? result() : result;
		},
	};
	return t as FakeTool;
}

export const deps = (): ToolDeps => ({ sessionId: 's', repoPath: '/tmp', send: () => {}, requestId: 1 });
