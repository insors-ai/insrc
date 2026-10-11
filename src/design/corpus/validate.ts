/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { canonicalJson, CorpusInputError, recordContentDigest } from './canonical.js';
import { decodeGuidanceRecord, sortIssues } from './contracts.js';
import type { GuidanceRecord, ValidationIssue, ValidationResult } from './contracts.js';

export interface RecordValidationOptions {
  readonly mode: 'draft' | 'publication';
  /** Publication requires a caller-supplied package inventory. No paths are opened. */
  readonly contentPaths?: ReadonlySet<string> | undefined;
}
const issue = (code: ValidationIssue['code'], path: string, message: string): ValidationIssue => ({ code, path, message });
const failure = <T>(issues: readonly ValidationIssue[]): ValidationResult<T> => ({ ok: false, issues: sortIssues(issues) });
const inputIssue = (error: unknown): ValidationIssue => error instanceof CorpusInputError
  ? issue(error.code, error.path, error.message) : issue('schema.invalid', '', 'Expected bounded JSON data.');
export function isPortablePath(path: string): boolean {
  return path.length > 0 && !/[\\%:\x00-\x1f\x7f]/.test(path)
    && path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}
function utcDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z'));
}
/** Validate JSON safety, closed schema, then semantic invariants without changing authored values. */
export function validateGuidanceRecord(input: unknown, options: RecordValidationOptions = { mode: 'draft' }): ValidationResult<GuidanceRecord> {
  // Inspect descriptors before AJV can read properties. This also bounds traversal and hashing.
  try { canonicalJson(input); } catch (error) { return failure([inputIssue(error)]); }
  const decoded = decodeGuidanceRecord(input);
  if (!decoded.ok) return decoded;
  const record = decoded.value;
  const issues: ValidationIssue[] = [];
  const add = (code: ValidationIssue['code'], path: string, message: string) => issues.push(issue(code, path, message));
  if (record.checks.length === 0 && !record.noMeasurableChecksRationale?.trim()) {
    add('guidance.incomplete', '/noMeasurableChecksRationale', 'Zero measurable checks require an explicit rationale.');
  }
  const provenance = record.provenance;
  // The exception is a declaration, not verification of originality; downstream eligibility assesses it.
  const independentInference = provenance.authorship === 'inferred'
    && /\bindependently\s+(?:authored|inferred|developed)\b/i.test(record.rationale)
    && provenance.author.trim().length > 0;
  if (provenance.authorship !== 'original' && !independentInference && provenance.sourceRefs.length === 0) {
    add('provenance.incomplete', '/provenance/sourceRefs', 'Non-original guidance requires sources or an explicitly independently inferred rationale and author attribution.');
  }
  for (const [domain, payload] of [['Color', 'color'], ['Layout', 'layout'], ['Visual style', 'style']] as const) {
    if (record.domains.includes(domain) && !record.domainPayload[payload]) {
      add('domain.invalid', `/domainPayload/${payload}`, 'Declared domain requires its complete payload.');
    }
  }
  const color = record.domainPayload.color;
  if (color) {
    const roles = new Set<string>();
    color.roles.forEach((role, i) => {
      if (roles.has(role.name)) add('domain.invalid', `/domainPayload/color/roles/${i}/name`, 'Color role names must be unique.');
      roles.add(role.name);
    });
    color.pairings.forEach((pair, i) => {
      for (const field of ['foregroundRole', 'backgroundRole'] as const) {
        if (!roles.has(pair[field])) add('domain.invalid', `/domainPayload/color/pairings/${i}/${field}`, 'Pairing must reference a declared role.');
      }
    });
  }
  for (const uiType of record.applicability.uiTypes) {
    for (const kind of ['example', 'misuse'] as const) {
      if (!record.examples.some(example => example.uiType === uiType && example.kind === kind)) {
        add('guidance.incomplete', '/examples', `Each declared UI type requires ${kind} content.`);
      }
    }
  }
  record.examples.forEach((example, i) => {
    if (!isPortablePath(example.contentRef)) add('path.invalid', `/examples/${i}/contentRef`, 'Expected a portable package-relative path.');
    if (!record.applicability.uiTypes.includes(example.uiType)) add('domain.invalid', `/examples/${i}/uiType`, 'Example UI type must be declared in applicability.');
    if ((options.mode === 'publication' || options.contentPaths) && !options.contentPaths?.has(example.contentRef)) {
      add('reference.missing', `/examples/${i}/contentRef`, 'Example content must exist in the supplied inventory.');
    }
  });
  const version = recordContentDigest(record);
  if (record.recordVersion !== version) add('digest.mismatch', '/recordVersion', 'Record version does not match canonical content.');
  if (options.mode === 'publication' || record.review.status === 'reviewed') {
    if (record.review.status !== 'reviewed' || !record.review.reviewer.trim() || !utcDate(record.review.reviewedAt) || !record.review.contentDigest) {
      add('review.required', '/review', 'Publication requires a complete reviewed status and valid UTC ISO timestamp.');
    }
    if (record.review.contentDigest !== version || record.review.contentDigest !== record.recordVersion) {
      add('review.stale', '/review/contentDigest', 'Review is not bound to this content version.');
    }
  }
  return issues.length ? failure(issues) : { ok: true, value: record };
}
