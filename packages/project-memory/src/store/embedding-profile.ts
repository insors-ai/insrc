import { MemoryError } from '../errors.js';
import { boundedString, snapshotJson } from '../queue/codec.js';
import { shape } from '../queue/shape.js';
import type { EmbeddingProfile } from './types.js';

export const EMBEDDING_NORMALIZATION_VERSION = 'utf8-verbatim-f32-no-renorm-v1';
export const MAX_EMBEDDING_DIMENSION = 8192;
function invalid(): never { throw new MemoryError('INVALID_REQUEST', 'Invalid memory embedding data.'); }
export function validateProfile(value: unknown): asserts value is EmbeddingProfile {
  const copy = snapshotJson(value, 4096).value;
  shape(invalid, copy, ['model', 'dimension', 'normalizationVersion']);
  if (!boundedString(copy.model) || !Number.isSafeInteger(copy.dimension) || (copy.dimension as number) < 1 || (copy.dimension as number) > MAX_EMBEDDING_DIMENSION) invalid();
  if (copy.normalizationVersion !== EMBEDDING_NORMALIZATION_VERSION) throw new MemoryError('UNSUPPORTED_VERSION', 'Unsupported memory embedding normalization version.');
}
export function embeddingProfile(model: string, dimension: number): EmbeddingProfile {
  const result = Object.freeze({ model, dimension, normalizationVersion: EMBEDDING_NORMALIZATION_VERSION });
  validateProfile(result); return result;
}
export function requireProfile(value: unknown, expected: EmbeddingProfile): asserts value is EmbeddingProfile {
  validateProfile(value); validateProfile(expected);
  if (value.model !== expected.model || value.dimension !== expected.dimension || value.normalizationVersion !== expected.normalizationVersion) {
    throw new MemoryError('UNSUPPORTED_VERSION', 'Memory embedding profile does not match the store.');
  }
}
/** Validate, do not normalize: preserve text bytes for both store and query. */
export function embeddingText(text: unknown, maxBytes: number): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 64 * 1024 * 1024) invalid();
  const value = snapshotJson(text, maxBytes).value;
  if (typeof value !== 'string' || !value.length) invalid();
  return value;
}
export function embeddingVector(value: unknown, profile: EmbeddingProfile): readonly number[] {
  validateProfile(profile);
  const copy = snapshotJson(value, profile.dimension * 32 + 16).value;
  if (!Array.isArray(copy) || copy.length !== profile.dimension) invalid();
  return Object.freeze(copy.map(n => {
    if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isFinite(Math.fround(n))) invalid();
    return Math.fround(n);
  }));
}
