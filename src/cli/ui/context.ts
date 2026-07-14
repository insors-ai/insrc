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

export interface Ui {
	/** Show a one-line status message (undefined clears it). */
	toast(message?: string): void;
	/** Suspend/resume the app's global keybindings while a modal edits. */
	capture(on: boolean): void;
}

export const ServicesContext = createContext<Services | null>(null);
export const UiContext = createContext<Ui | null>(null);

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
