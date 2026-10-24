/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The planner's wire form of a template's params (ISSUE-8d39ef09,
 * LLD-9874475f902756f6-S001).
 *
 * Codex's strict grammar cannot express an open object (one with no declared
 * properties, or whose additionalProperties is not false). The wire form keeps
 * every closed object as it is, with its optional properties nullable, and
 * sends each open object as a string holding that object's JSON: a slot. A
 * slot is placed only where the template's schema admits nothing but an object,
 * so a string there can only be encoded JSON and decoding it back is exact.
 * The template's own inputSchema stays the validation source (INV-5).
 */

/** Where a slot sits, from the params root: property names, and `[]` for array items. */
export type SlotPath = readonly string[];

/** One template's params in wire form, and where its JSON-string slots are. */
export interface WireBranch {
	readonly schema: Record<string, unknown>;
	readonly slots:  readonly SlotPath[];
}

/** The array-items step of a slot path. */
export const ITEMS = '[]';

type Schema = Record<string, unknown>;

const isObjectNode = (node: Schema): boolean => node['type'] === 'object';
const isOpen = (node: Schema): boolean => node['properties'] === undefined || node['additionalProperties'] !== false;

/** A root `anyOf` whose every branch only names required properties: a one-of-N rule INV-5 keeps enforcing. */
function isRequiredOnlyAnyOf(value: unknown): boolean {
	return Array.isArray(value) && value.length > 0
		&& value.every(b => b !== null && typeof b === 'object' && Object.keys(b).length === 1 && Array.isArray((b as Schema)['required']));
}

/** A schema that also admits null: an optional property the model may leave empty. */
function nullable(node: Schema): Schema {
	const type = node['type'];
	if (typeof type === 'string' && node['enum'] === undefined && node['const'] === undefined) return { ...node, type: [type, 'null'] };
	return { anyOf: [node, { type: 'null' }] };
}

function wireNode(node: Schema, path: SlotPath, slots: SlotPath[]): Schema {
	if (isObjectNode(node)) {
		if (isOpen(node)) {
			slots.push(path);
			return { type: 'string', description: 'The JSON text of this object.' };
		}
		const required = new Set((node['required'] as string[] | undefined) ?? []);
		const properties: Schema = {};
		for (const [name, child] of Object.entries(node['properties'] as Record<string, Schema>)) {
			const wired = wireNode(child, [...path, name], slots);
			properties[name] = required.has(name) ? wired : nullable(wired);
		}
		const out: Schema = { ...node, properties };
		return out;
	}
	if (node['type'] === 'array' && node['items'] !== null && typeof node['items'] === 'object' && !Array.isArray(node['items'])) {
		return { ...node, items: wireNode(node['items'] as Schema, [...path, ITEMS], slots) };
	}
	return node;
}

/** One template's inputSchema in wire form, with the paths of its JSON-string slots. */
export function wireBranchFor(inputSchema: Readonly<Record<string, unknown>>): WireBranch {
	const root: Schema = { ...inputSchema };
	if (isRequiredOnlyAnyOf(root['anyOf'])) delete root['anyOf'];
	const slots: SlotPath[] = [];
	const schema = wireNode(root, [], slots);
	return { schema, slots };
}
