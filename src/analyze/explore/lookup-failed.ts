/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * How a lookup says "I could not run" (LLD-b9d5c5c40df5a574-s1).
 *
 * A lookup signals that by THROWING; the executor turns the throw into the
 * `failed` output. No lookup returns an empty result for it: an empty result
 * means the lookup ran and found nothing.
 *
 * A lookup that had gathered something before it failed throws
 * `LookupFailedError` carrying it, and the executor copies it to the failed
 * output's `partial`, so what was found is not lost with the failure.
 */

import type { PartialFinding } from '../completeness.js';

export class LookupFailedError extends Error {
	readonly partial: readonly PartialFinding[];

	constructor(message: string, partial: readonly PartialFinding[] = [], options?: { readonly cause?: unknown }) {
		super(message, options);
		this.name = 'LookupFailedError';
		this.partial = partial;
	}
}

/** The message of whatever was thrown. */
export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
