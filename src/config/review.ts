/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFileSync } from 'node:fs';
import { PATHS } from '../shared/paths.js';

import { DEFAULT_REVIEW_JSON_BYTES } from './review-defaults.js';
import { DEFAULT_REVIEW_PREPARATION } from './review-defaults.js';
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

export type ReviewPreparationLimits = { -readonly [K in keyof typeof DEFAULT_REVIEW_PREPARATION]: number };
export function reviewPreparationLimits(configPath: string = PATHS.config): ReviewPreparationLimits {
 let raw: { review?: { preparation?: unknown } } | null;
 try { raw = JSON.parse(readFileSync(configPath, 'utf8')) as typeof raw; }
 catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_REVIEW_PREPARATION }; throw error; }
 const input = raw?.review?.preparation;
 if (input === undefined) return { ...DEFAULT_REVIEW_PREPARATION };
 if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('review.preparation must be an object');
 const result: ReviewPreparationLimits = { ...DEFAULT_REVIEW_PREPARATION };
 for (const [key, value] of Object.entries(input)) {
  if (!Object.hasOwn(result, key) || typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid review.preparation.${key}: expected positive safe bound`);
  result[key as keyof ReviewPreparationLimits] = value;
 }
 result.batchMaxObjects = Math.min(result.batchMaxObjects, 256);
 result.batchMaxBytes = Math.min(result.batchMaxBytes, 4 * 1024 * 1024);
 return result;
}
