/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The message-log model behind the TUI's single bottom message box.
 *
 * `MsgLine` is the unit stored in the shared `messages` array app.tsx owns; the
 * pure helpers here (append/clear/dismiss) are the load-bearing logic — kept
 * ink-free so they unit-test without rendering. app.tsx assigns the monotonic
 * `id` and maps each row to a per-kind coloured <Text>; a bounded last-N window
 * (MAX_MESSAGES) means the bottom box never grows the layout.
 */

/** success = green, error = red, info = dim. */
export type MsgKind = 'info' | 'error' | 'success';

/** One line in the shared bottom message log. `transient` lines (from `toast`)
 *  auto-clear on a timer; `note`/`task` lines are sticky until they scroll out
 *  of the bounded window. `id` is a monotonic key for React + dismiss targeting. */
export interface MsgLine {
	readonly id: number;
	readonly text: string;
	readonly kind: MsgKind;
	readonly transient: boolean;
}

/** How many lines the bottom box keeps (bounded — older lines scroll off). */
export const MAX_MESSAGES = 8;

/** Append `line` and bound to the last `max` entries (copy-on-write). */
export function appendMessage(list: readonly MsgLine[], line: MsgLine, max: number = MAX_MESSAGES): MsgLine[] {
	const next = [...list, line];
	return next.length > max ? next.slice(-max) : next;
}

/** Remove ALL transient lines — the `toast(undefined)` clear path. Sticky
 *  note/task lines are left untouched. */
export function clearTransient(list: readonly MsgLine[]): MsgLine[] {
	return list.filter(m => !m.transient);
}

/** Remove the single line with `id` — the per-toast auto-dismiss timer path.
 *  Targeting by id means a newer sticky line added before the timer fires is
 *  never swept away with the transient. */
export function dismissMessage(list: readonly MsgLine[], id: number): MsgLine[] {
	return list.filter(m => m.id !== id);
}
