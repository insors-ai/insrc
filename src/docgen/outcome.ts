/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — DocGenOutcome combinators (Epic 870ed3dd, Story s1 · t2).
 *
 * `map` / `flatMap` are the ONLY place the outcome variants are handled, so a
 * reason / symbol / depthUsed produced deep in extraction reaches the caller as
 * the same value it was logged with — non-ok variants short-circuit outward
 * with their payload untouched, field for field (k11). Downstream stories
 * (s3 truncated, s5 fallback-unavailable, s6 not-found) inherit this rather
 * than re-implementing per story.
 */

import type { DocGenOutcome, RenderedDocumentShell } from './types.js';

/** Chain a fallible stage. `f` runs ONLY for the `ok` arm; every non-ok variant
 *  is returned unchanged (short-circuit), so its payload is never re-worded. */
export function flatMap<T, U>(
	outcome: DocGenOutcome<T>,
	f: (value: T) => DocGenOutcome<U>,
): DocGenOutcome<U> {
	return outcome.status === 'ok' ? f(outcome.value) : outcome;
}

/** Transform the `ok` payload with an infallible `f`; non-ok variants pass
 *  through unchanged. Use `flatMap` when `f` can itself fail. */
export function map<T, U>(
	outcome: DocGenOutcome<T>,
	f: (value: T) => U,
): DocGenOutcome<U> {
	return outcome.status === 'ok' ? { status: 'ok', value: f(outcome.value) } : outcome;
}

/** True when the outcome is the `ok` arm (narrows `T`). */
export function isOk<T>(outcome: DocGenOutcome<T>): outcome is { status: 'ok'; value: T } {
	return outcome.status === 'ok';
}

// ── Constructors (keep call sites terse + make the detection point obvious) ──

export const ok         = <T>(value: T): DocGenOutcome<T> => ({ status: 'ok', value });
export const emptyScope = <T>(reason: string): DocGenOutcome<T> => ({ status: 'empty-scope', reason });
export const notFound   = <T>(symbol: string): DocGenOutcome<T> => ({ status: 'not-found', symbol });
export const truncated  = <T>(depthUsed: number): DocGenOutcome<T> => ({ status: 'truncated', depthUsed });
export const sourceNotReady = <T>(reason: string): DocGenOutcome<T> => ({ status: 'source-not-ready', reason });
export const fallbackUnavailable = <T>(reason: string, remedy: string): DocGenOutcome<T> =>
	({ status: 'fallback-unavailable', reason, remedy });

/** The boundary outcome the tool/IPC surface returns to a caller. */
export type ShellOutcome = DocGenOutcome<RenderedDocumentShell>;
