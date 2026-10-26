/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The signal of the tool call that is running, carried on the async call chain.
 *
 * executeTool resolves one effective signal per call and runs the approval preview and the tool
 * under it, so every subprocess a registered tool starts, even one that forwards no signal, can be
 * stopped when the call is cancelled. Hooks run with the context cleared, so a hook is never
 * cancelled by an unrelated outer call. Outside executeTool nothing is stored and behaviour is as before.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** The store is a signal, or an explicit undefined that clears an inherited one. */
const storage = new AsyncLocalStorage<AbortSignal | undefined>();

/** The signal of the tool call the caller runs under, or undefined. */
export function currentToolSignal(): AbortSignal | undefined {
	return storage.getStore();
}

/** The call's own signal combined with the one already in the context; either alone; or undefined. */
export function effectiveToolSignal(signal: AbortSignal | undefined): AbortSignal | undefined {
	const inherited = storage.getStore();
	if (signal === undefined) return inherited;
	if (inherited === undefined || inherited === signal) return signal;
	return AbortSignal.any([signal, inherited]);
}

/** Run fn with the effective signal in the context. An undefined signal leaves the context unchanged. */
export function runWithToolSignal<R>(signal: AbortSignal | undefined, fn: () => R): R {
	const effective = effectiveToolSignal(signal);
	if (effective === undefined) return fn();
	return storage.run(effective, fn);
}

/** Run fn with no tool signal in the context, even inside an outer tool call. The only way to clear it. */
export function runWithoutToolSignal<R>(fn: () => R): R {
	return storage.run(undefined, fn);
}
