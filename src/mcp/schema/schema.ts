/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_schema` (sc1) — the read-only shape-lookup surface.
 *
 * A controller about to call an insrc_* tool looks up the authoritative
 * input contract for exactly the call it intends to make (for a multi-turn
 * tool, the specific phase it is on) instead of reconstructing the shape
 * from memory. The schema served is derived from the SAME zod raw shape the
 * MCP SDK validates against — there is no hand-maintained copy (k1), and
 * every failure returns a structured value rather than throwing (k3).
 *
 * These are the type-level contracts + the tool's own input shape. The pure
 * lookup logic lives in `./handler.js`; the registration-time recorder that
 * populates the registry lives in `../server.ts`.
 */

import { z } from 'zod';
import type { ZodRawShape } from 'zod';

/** A JSON Schema document (the shape the MCP SDK advertises for a tool). */
export type JsonSchema = Record<string, unknown>;

/**
 * The `insrc_schema` request. `tool` is optional at the wire level so the
 * handler — not the SDK's input validation — owns the "no tool named"
 * response (ac4): omitting it returns a structured `validTools` listing
 * rather than a thrown protocol error.
 */
export interface InsrcSchemaInput {
	tool?: string | undefined;
	phase?: string | undefined;
}

/** A hit: the requested tool (+phase) resolved to its input contract. */
export interface InsrcSchemaOk {
	schema: JsonSchema;
	description: string;
	validPhases?: string[] | undefined;
}

/** A miss: a structured, machine-parseable error carrying the valid options. */
export interface InsrcSchemaError {
	error: string;
	validTools?: string[] | undefined;
	validPhases?: string[] | undefined;
}

/** The never-thrown result of an `insrc_schema` lookup. */
export type InsrcSchemaResult = InsrcSchemaOk | InsrcSchemaError;

/**
 * One registry entry per registered insrc_* tool. `rawShape` is the EXACT
 * object handed to `server.registerTool` (JSON Schema is derived on demand,
 * never stored) — so the served schema cannot drift from the enforced one.
 * `phases` is the accepted phase-name list for a multi-turn tool (absent for
 * a phaseless tool). `dynamicNote` is present only for a call whose inner
 * payload is generated during the run (ac5).
 */
export interface InsrcToolSchemaRecord {
	name: string;
	description: string;
	rawShape: ZodRawShape;
	phases?: string[] | undefined;
	dynamicNote?: string | undefined;
}

/** Tool name -> record, built at registration time, read by the handler. */
export type InsrcToolSchemaRegistry = ReadonlyMap<string, InsrcToolSchemaRecord>;

/**
 * The `insrc_schema` tool's own input zod raw shape. `tool` is optional so an
 * omitted tool reaches the handler as the ac4 structured-error path rather
 * than a wire-level rejection.
 */
export const SCHEMA_INPUT = {
	tool: z
		.string()
		.optional()
		.describe(
			'The insrc_* tool whose input contract you want (e.g. ' +
				'"insrc_workflow_step"). Omit it to receive the list of valid tools.',
		),
	phase: z
		.string()
		.optional()
		.describe(
			'For a multi-turn tool, the phase whose contract you want (e.g. ' +
				'"plan"). Ignored for a single-shape (phaseless) tool.',
		),
} satisfies ZodRawShape;
