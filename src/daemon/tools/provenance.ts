/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Where a registered tool came from.
 *
 * The failure-net wrappers (withFailureNet for git, withGhFailureNet for gh) return a spread copy of the
 * definition they are given. This module records, for each such copy, the object it was built from, so
 * callTool can tell that the tool registered under an id is the definition the caller passed and not a
 * replacement registered over the same id.
 *
 * The table is module-private and written only by markDefinition. A marker property or symbol on the
 * definition would not do: a spread copies enumerable own and symbol properties, so a replacement made by
 * spreading would carry the marker.
 */

import type { Tool } from './types.js';

/** A chain of wrappers longer than this is not followed; it also ends a cycle. */
const MAX_CHAIN = 8;

const originals = new WeakMap<Tool, Tool>();

/** Record that `copy` was built from `original`, the object exactly as passed to the wrapper (the immediate original). */
export function markDefinition(copy: Tool, original: Tool): void {
	originals.set(copy, original);
}

/** The object the wrapper copy was built from, or undefined for an object no wrapper produced. */
export function definitionOf(registered: Tool): Tool | undefined {
	return originals.get(registered);
}

/**
 * True when `registered` is `tool`, or when walking registered, definitionOf(registered),
 * definitionOf(definitionOf(registered)), ... reaches `tool` within MAX_CHAIN steps.
 */
export function isDefinitionOf(registered: Tool, tool: Tool): boolean {
	let current: Tool | undefined = registered;
	for (let step = 0; current !== undefined && step <= MAX_CHAIN; step++) {
		if (current === tool) return true;
		current = originals.get(current);
	}
	return false;
}
