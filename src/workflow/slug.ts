/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Slug derivation for workflow artifacts.
 *
 * Post-hash-migration: slugs are DISPLAY-ONLY. Every artifact file
 * is named by the 16-char Epic hash (see `workflow/hash.ts`); the
 * slug rides in `meta.epicSlug` for humans reading the artifact and
 * appears in prompts + CLI hints only.
 *
 * ## Approach
 *
 * 1. Lowercase.
 * 2. Strip a small set of high-frequency stopwords (the / a / and /
 *    for / of / to / in / on / with / as / at).
 * 3. Tokenise on any non-alphanumeric run.
 * 4. Keep the first `MAX_TOKENS` distinctive words.
 * 5. Join with `-`.
 * 6. Truncate to `MAX_LENGTH` chars.
 */

const MAX_TOKENS = 6;
const MAX_LENGTH = 60;
const MIN_LENGTH = 3;

const STOPWORDS = new Set([
	'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else',
	'for', 'of', 'to', 'in', 'on', 'at', 'by', 'with', 'as',
	'is', 'are', 'be', 'been', 'was', 'were',
	'that', 'this', 'these', 'those',
	'we', 'i', 'you', 'they', 'it',
]);

/** Pure derivation. Throws if the focus yields a slug shorter than
 *  `MIN_LENGTH` — usually means the focus was all-stopwords or all
 *  punctuation, and the caller should reprompt for a clearer ask. */
export function deriveSlug(focus: string): string {
	if (typeof focus !== 'string' || focus.length === 0) {
		throw new Error('deriveSlug: focus is empty');
	}
	const tokens = focus
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(t => t.length > 0)
		.filter(t => !STOPWORDS.has(t))
		.slice(0, MAX_TOKENS);
	const slug = tokens.join('-').slice(0, MAX_LENGTH);
	if (slug.length < MIN_LENGTH) {
		throw new Error(
			`deriveSlug: focus '${focus}' produced a slug too short ` +
			`(${slug.length} < ${MIN_LENGTH} chars). Rephrase with more distinctive nouns.`,
		);
	}
	return slug;
}
