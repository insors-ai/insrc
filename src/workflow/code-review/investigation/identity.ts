/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { canonicalJson, hashCanonical, CorpusInputError } from '../../../design/corpus/canonical.js';
import { SUBJECT_LIMITS, SubjectPreparationError } from './types.js';
import type { ReviewSubjectV1 } from './types.js';

/** A defensive JSON copy never invokes getters or toJSON; the shared primitive validates first. */
export function snapshotValue<T>(value: T, maxBytes = SUBJECT_LIMITS.canonicalBytes): T {
 try { return JSON.parse(canonicalJson(value, maxBytes)) as T; }
 catch (cause) {
  throw new SubjectPreparationError(cause instanceof CorpusInputError && cause.code === 'limit.exceeded'
   ? 'resource-limit' : 'invalid-input', 'Invalid or oversized review value.', { cause });
 }
}
export function freezeValue<T>(value: T): T {
 if (value !== null && typeof value === 'object') {
  for (const child of Object.values(value)) freezeValue(child);
  Object.freeze(value);
 }
 return value;
}
export function digestValue(value: unknown): string {
 try { return hashCanonical(value, SUBJECT_LIMITS.canonicalBytes); }
 catch (cause) {
  throw new SubjectPreparationError(cause instanceof CorpusInputError && cause.code === 'limit.exceeded'
   ? 'resource-limit' : 'invalid-input', 'Cannot hash review value.', { cause });
 }
}
export function identifySubject(input: Omit<ReviewSubjectV1, 'subjectId' | 'subjectDigest'>): ReviewSubjectV1 {
 const copy = snapshotValue(input), subjectDigest = digestValue(copy);
 return freezeValue({ ...copy, subjectId: `subject-${subjectDigest}`, subjectDigest });
}
