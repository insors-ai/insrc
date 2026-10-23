/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The deterministic half of convertText: after a model turns a tool's text
 * output into a value, every key value the caller named (identifiers, numbers,
 * paths, status words) must occur in the raw text, so a made-up value never
 * reaches a caller.
 */

import { getLogger } from '../../shared/logger.js';

const log = getLogger('tools-cross-check');

export interface CrossCheckResult {
	/** True when every checked key value was found (or there was nothing to check). */
	readonly ok:      boolean;
	/** The key values not found in the raw text, as the caller gave them. */
	readonly missing: readonly string[];
	/** How many key values were actually checked. */
	readonly checked: number;
}

/** Collapse whitespace and fold case. */
const normalise = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

const QUOTES = /^["'`]+|["'`]+$/g;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Look for each key value in the raw text. Matching ignores case and runs of
 * whitespace, drops quotes around a key value, and requires a token boundary on
 * both sides (a letter or digit next to the match does not count), so '12' is
 * not found in '123'. An empty list is accepted on the schema alone.
 */
export function crossCheck(rawText: string, keyValues: readonly string[]): CrossCheckResult {
	const text = normalise(rawText);
	const missing: string[] = [];
	let checked = 0;
	for (const given of keyValues) {
		const want = normalise(given.replace(QUOTES, ''));
		if (want.length === 0) continue;
		checked += 1;
		const found = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(want)}(?![\\p{L}\\p{N}])`, 'u').test(text);
		if (!found) missing.push(given);
	}
	if (checked === 0) log.info('no key value was checked; the value is accepted on its schema alone');
	return { ok: missing.length === 0, missing, checked };
}
