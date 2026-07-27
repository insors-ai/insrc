/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * React contexts shared across the TUI. Kept in its own module so both
 * `app.tsx` and the panes import from here (no import cycle).
 *
 * - `ServicesContext` carries the injectable `Services` facade (tests
 *   pass a fake of the same shape).
 * - `UiContext` lets a pane raise a toast and tell the app to suspend
 *   its global keybindings while a modal (text field) is capturing keys.
 */

import { createContext, useContext } from 'react';

import type { Services } from '../services/index.js';

/** A streaming handle for a multi-line operation (daemon start/stop/restart/
 *  update/backup/compact, or a `:` command). `push` appends a progress line,
 *  `done`/`fail` append the terminal success/error line — all into the single
 *  bottom message box, never a pane body. */
export interface UiTask {
	push(line: string): void;
	done(message: string): void;
	fail(message: string): void;
}

export interface Ui {
	/** Append a one-line transient (auto-dismissing) status to the bottom
	 *  message box; `undefined` clears the current transient. */
	toast(message?: string): void;
	/** Append a one-off sticky line to the bottom message box. `error` renders
	 *  red and persists until superseded; `info` (default) renders dim. */
	note(line: string, kind?: 'info' | 'error'): void;
	/** Begin a streaming operation (seeds a title line) and return a handle
	 *  whose push/done/fail stream into the bottom message box. */
	task(title: string): UiTask;
	/** Suspend/resume the app's global keybindings while a modal edits. */
	capture(on: boolean): void;
}

export const ServicesContext = createContext<Services | null>(null);
export const UiContext = createContext<Ui | null>(null);

/** True while a modal / the command bar is capturing keys; panes read
 *  this to suspend their own `useInput` so keystrokes don't leak. */
export const CaptureContext = createContext<boolean>(false);
export function useCaptured(): boolean {
	return useContext(CaptureContext);
}

export function useServices(): Services {
	const s = useContext(ServicesContext);
	if (s === null) throw new Error('ServicesContext not provided');
	return s;
}

export function useUi(): Ui {
	const u = useContext(UiContext);
	if (u === null) throw new Error('UiContext not provided');
	return u;
}
