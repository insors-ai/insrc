/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Delivery read model — field readers shared by every pass (E1).
 *
 * One definition of which values count as a plain object and which ids parse as
 * a story or task ordinal, so the loader, the graph and the gate pass agree: the
 * graph mints task items from the task ids these accept, and the gate pass
 * matches build results back to them by the same ordinals. Never throws.
 */

import { storyIdToOrdinal, taskIdToOrdinal } from '../id.js';

/** The value as a plain object, or null for anything else (arrays included). */
export function asObject(value: unknown): Readonly<Record<string, unknown>> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** An error's message, or the thrown value as text. */
export function errorText(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/** The value when it is a string, else null. */
export function asString(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

/** Code-unit order, independent of locale: the one string order every sorted list in the snapshot uses. */
export const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The ordinal of an `s<n>` / `S<nnn>` story id, or null when it does not parse. */
export function storyOrdinalOf(storyId: string): number | null {
	try {
		return storyIdToOrdinal(storyId);
	} catch {
		return null;
	}
}

/** The ordinal of a `t<n>` task id, or null when it does not parse. */
export function taskOrdinalOf(taskId: string): number | null {
	try {
		return taskIdToOrdinal(taskId);
	} catch {
		return null;
	}
}
