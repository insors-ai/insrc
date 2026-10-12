/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { canonicalJson, CORPUS_LIMITS, CorpusInputError, hashCanonical } from '../canonical.js';
import { sortIssues } from '../contracts.js';
import type { ValidationIssue, ValidationResult } from '../contracts.js';
import { isPortablePath } from '../validate.js';

export { isPortablePath };
export const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
// S001 keeps these primitives private. Public-behavior parity is regression tested.
export const pathCollisionKey = (path: string): string => path.normalize('NFC').toLowerCase();
export function isUtcDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z'));
}
/** Stable URL spelling is part of identity, never a network location to fetch. */
export function isCanonicalRepositoryUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['https:', 'ssh:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
      && !url.search && !url.hash && url.pathname !== '/' && !url.pathname.endsWith('/')
      && url.href === value && !/%|[\x00-\x20\x7f-\x9f]/.test(value);
  } catch { return false; }
}
export const isFullRevision = (value: string): boolean => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
export function sourceIdentity(repositoryUrl: string, revision: string, path: string): string {
  if (!isCanonicalRepositoryUrl(repositoryUrl) || !isFullRevision(revision) || !isPortablePath(path)) {
    throw new CorpusInputError('schema.invalid', '', 'Expected canonical repository, full commit and portable path.');
  }
  return `source:${hashCanonical({ repositoryUrl, revision, path })}`;
}
export const problem = (code: ValidationIssue['code'], path: string, message: string): ValidationIssue => ({ code, path, message });
export const failure = <T = never>(issues: readonly ValidationIssue[]): ValidationResult<T> => ({ ok: false, issues: sortIssues(issues) });
export function snapshotJson(value: unknown): ValidationResult<unknown> {
  try { return { ok: true, value: JSON.parse(canonicalJson(value, CORPUS_LIMITS.packageBytes)) as unknown }; }
  catch (error) { return failure([error instanceof CorpusInputError ? problem(error.code, error.path, error.message)
    : problem('schema.invalid', '', 'Expected bounded plain JSON data.')]); }
}
export function pathIssues(paths: readonly string[], prefix = ''): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const [i, path] of paths.entries()) {
    if (!isPortablePath(path)) issues.push(problem('path.invalid', `${prefix}/${i}`, 'Expected portable relative path.'));
    const key = pathCollisionKey(path);
    if (seen.has(key)) issues.push(problem('inventory.invalid', `${prefix}/${i}`, 'Duplicate or colliding path.'));
    seen.add(key);
  }
  return issues;
}

/** Shared aggregate acquisition bound; count preflight and byte acquisition may be charged separately. */
export class AcquisitionBudget {
  private count = 0;
  private bytes = 0;
  constructor(private readonly maxFiles: number = CORPUS_LIMITS.files, private readonly maxBytes: number = CORPUS_LIMITS.packageBytes) {}
  get remainingBytes(): number { return this.maxBytes - this.bytes; }
  charge(count: number, bytes: number): ValidationResult<true> {
    this.count += count; this.bytes += bytes;
    return this.count > this.maxFiles || this.bytes > this.maxBytes
      ? failure([problem('limit.exceeded', '/imports', 'Combined acquired inputs exceed limits.')]) : { ok: true, value: true };
  }
}

/** Typed staged values are still allowed to fail safely if a caller constructs them incorrectly. */
export function guardStagedOperation<T>(operation: () => ValidationResult<T>): ValidationResult<T> {
  try { return operation(); }
  catch { return failure([problem('schema.invalid', '/stages', 'Expected valid evaluated source stages.')]); }
}
