/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFileSync } from 'node:fs';
import { PATHS } from '../shared/paths.js';

import { DEFAULT_REVIEW_JSON_BYTES } from './review-defaults.js';
export { DEFAULT_REVIEW_JSON_BYTES } from './review-defaults.js';
/** Storage/transport bound, not a model context-window or Git-diff budget.
 * Read fresh so raising the setting can unblock retained review history.
 * Invalid configured values fail explicitly instead of silently reducing a limit.
 */
export function reviewJsonLimit(configPath: string = PATHS.config): number {
 let raw: { review?: { maxJsonBytes?: unknown } } | null;
 try { raw = JSON.parse(readFileSync(configPath,'utf8')) as typeof raw; }
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return DEFAULT_REVIEW_JSON_BYTES;throw error;}
 const value=raw?.review?.maxJsonBytes;
 if(value===undefined)return DEFAULT_REVIEW_JSON_BYTES;
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<=0)throw new Error('review.maxJsonBytes must be a positive safe integer (bytes)');
 return value;
}
