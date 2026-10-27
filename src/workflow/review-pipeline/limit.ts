/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The configured total allowance and legacy text-limit coordinate (Epic 8315a11f, shared
 * contract sc6). One setting, `review.chunkTokens`, counted at a fixed three
 * characters per token. Inclusive admission additionally uses provider-qualified wire accounting and reserves in budget.ts.
 */

import { existsSync, readFileSync } from 'node:fs';

import { PATHS } from '../../shared/paths.js';

/** Characters per token when a review's material is measured. Fixed, not a setting. */
export const REVIEW_CHARS_PER_TOKEN = 3;

/** The `review.chunkTokens` default: 128K tokens, comfortably inside the >= 256K
 *  windows of review-capable models. */
export const DEFAULT_REVIEW_CHUNK_TOKENS = 128_000;

/** Read `review.chunkTokens` from `~/.insrc/config.json`. Fail-safe: a missing or
 *  unparseable file, or a value that is not a positive whole number, gives the
 *  default. Never throws. */
export function readReviewChunkTokens(configPath: string = PATHS.config): number {
	try {
		if (!existsSync(configPath)) return DEFAULT_REVIEW_CHUNK_TOKENS;
		const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as { review?: { chunkTokens?: unknown } };
		const v = parsed.review?.chunkTokens;
		return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : DEFAULT_REVIEW_CHUNK_TOKENS;
	} catch {
		return DEFAULT_REVIEW_CHUNK_TOKENS;
	}
}

/** The gross text coordinate in characters: `review.chunkTokens` x {@link REVIEW_CHARS_PER_TOKEN}.
 *  It takes no provider: the limit is the same for every one. */
export function reviewLimitChars(configPath: string = PATHS.config): number {
	return readReviewChunkTokens(configPath) * REVIEW_CHARS_PER_TOKEN;
}
