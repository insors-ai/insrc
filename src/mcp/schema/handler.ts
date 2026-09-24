/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_schema` handler — the pure lookup + JSON-Schema slice.
 *
 * `handleInsrcSchema` is a pure function of `(input, registry)`: it performs
 * no I/O and mutates nothing, so it unit-tests over a hand-built registry
 * without a live server. Every failure mode returns an `InsrcSchemaError`
 * value; nothing throws (k3). The JSON Schema is derived from the record's
 * `rawShape` via the SAME converter the MCP SDK uses to advertise each tool's
 * schema (`toJsonSchemaCompat`) — so the served schema equals the enforced
 * one (k1), never a hand-maintained copy.
 */

import { z } from 'zod';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import type {
	InsrcSchemaInput,
	InsrcSchemaResult,
	InsrcToolSchemaRecord,
	InsrcToolSchemaRegistry,
	JsonSchema,
} from './schema.js';

/**
 * Derive a JSON Schema from a record's registered zod raw shape via the SDK's
 * own conversion (the same path + options `McpServer` uses when it advertises
 * a tool). Returns `null` if the conversion throws, so the caller can shape a
 * structured 'schema unavailable' error rather than letting it escape.
 */
function deriveJsonSchema(record: InsrcToolSchemaRecord): JsonSchema | null {
	try {
		const shape: unknown = record.rawShape;
		// A registered inputSchema is normally a zod RAW SHAPE ({ field: zod }).
		// Wrap it into a ZodObject unless it is already a zod schema (has parse).
		const obj =
			shape && typeof (shape as { safeParse?: unknown }).safeParse === 'function'
				? (shape as z.ZodTypeAny)
				: z.object(record.rawShape);
		return toJsonSchemaCompat(obj as never, {
			strictUnions: true,
			pipeStrategy: 'input',
		}) as JsonSchema;
	} catch {
		return null;
	}
}

/** Append a record's dynamicNote to its description, when present (ac5). */
function describeWith(record: InsrcToolSchemaRecord): string {
	return record.dynamicNote
		? `${record.description}\n\n${record.dynamicNote}`
		: record.description;
}

/**
 * Look up the authoritative input contract for `input.tool` (+ `input.phase`
 * for a multi-turn tool), or return the valid options on a miss. Never throws.
 */
export function handleInsrcSchema(
	input: InsrcSchemaInput,
	registry: InsrcToolSchemaRegistry,
): InsrcSchemaResult {
	const validTools = (): string[] => [...registry.keys()].sort();

	const tool = typeof input.tool === 'string' ? input.tool : '';
	if (tool.length === 0) {
		return { error: '`tool` is required', validTools: validTools() };
	}

	const record = registry.get(tool);
	if (!record) {
		return { error: `unknown tool: ${tool}`, validTools: validTools() };
	}

	const phases = record.phases;
	if (phases && phases.length > 0) {
		// Multi-turn tool: a phase is required and must be one it accepts.
		if (typeof input.phase !== 'string' || input.phase.length === 0) {
			return { error: `phase required for ${tool}`, validPhases: phases };
		}
		if (!phases.includes(input.phase)) {
			return {
				error: `unknown phase for ${tool}: ${input.phase}`,
				validPhases: phases,
			};
		}
		const schema = deriveJsonSchema(record);
		if (!schema) {
			return { error: `schema unavailable for ${tool}` };
		}
		return { schema, description: describeWith(record), validPhases: phases };
	}

	// Phaseless tool: a single fixed shape; a spurious phase is ignored (ac3).
	const schema = deriveJsonSchema(record);
	if (!schema) {
		return { error: `schema unavailable for ${tool}` };
	}
	return { schema, description: describeWith(record) };
}
