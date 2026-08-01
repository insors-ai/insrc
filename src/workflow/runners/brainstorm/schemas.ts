/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Per-step JSON schemas for the `brainstorm` stage (Story S001 — sc2).
 *
 * SCAFFOLD ONLY: this story registers the stage and makes it invokable; the
 * real elicitation-turn validation (questions, working statement, converged
 * spec) is owned by S002–S005. So the schema here is a minimal, ajv-compilable
 * placeholder — an open object — one per registered scaffold step runner. Later
 * stories tighten it in place; they do not add a new schema module.
 */

/** Minimal open-object schema for the scaffold `elicit` step. Valid JSON Schema
 *  (ajv-compilable); carries no field-level validation yet. */
export const brainstormElicitSchema = {
	type: 'object',
	additionalProperties: true,
} as const satisfies Record<string, unknown>;
