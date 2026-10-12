/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type, type Static, type TProperties } from '@sinclair/typebox';
import { Ajv, type ValidateFunction } from 'ajv';
import { CORPUS_LIMITS } from '../canonical.js';
import { DIGEST_SCHEMA } from '../contracts.js';
import type { ValidationIssue, ValidationResult } from '../contracts.js';
import { failure, isCanonicalRepositoryUrl, isPortablePath, isUtcDate, pathIssues, problem, snapshotJson, sourceIdentity } from './validation-primitives.js';

const object = <T extends TProperties>(properties: T) => Type.Object(properties, { additionalProperties: false });
const text = () => Type.String({ minLength: 1, maxLength: 16384, pattern: '\\S' });
const strings = () => Type.Array(text(), { maxItems: CORPUS_LIMITS.files, uniqueItems: true });
const revision = Type.String({ pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' });
const sourceId = Type.String({ pattern: '^source:[a-f0-9]{64}$' });
const status = Type.Union((['eligible', 'excluded', 'unresolved'] as const).map(v => Type.Literal(v)));
export const SOURCE_FILE_SCHEMA = object({ sourceId, repositoryUrl: text(), revision, path: text(), digest: DIGEST_SCHEMA,
  licenseIds: strings(), licenseTextRefs: strings(), noticeRefs: strings(), attribution: strings(), modifications: strings(),
  retrievedAt: text(), eligibility: status, eligibilityReason: text(), reviewedBy: Type.String({ maxLength: 16384 }) });
export const SOURCE_MANIFEST_SCHEMA = object({ schemaVersion: Type.Literal(1), policyVersion: text(),
  files: Type.Array(SOURCE_FILE_SCHEMA, { maxItems: CORPUS_LIMITS.files }) });
export const IMPORT_REPORT_SCHEMA = object({ admitted: strings(), excluded: Type.Array(object({ path: text(), reason: text() }),
  { maxItems: CORPUS_LIMITS.files }), unresolved: strings() });
// Private maintainer inputs. No license expression parser or automatic license decision.
const evidence = object({ path: text(), digest: DIGEST_SCHEMA });
export const REVIEWED_PROFILE_SCHEMA = object({ repositoryUrl: text(), revision, path: text(), digest: DIGEST_SCHEMA,
  category: text(), decision: status, reason: text(), reviewedBy: Type.String({ maxLength: 16384 }),
  termsResolved: Type.Boolean(), licenseIds: strings(), licenseEvidence: Type.Array(evidence, { maxItems: CORPUS_LIMITS.files }),
  noticeEvidence: Type.Array(evidence, { maxItems: CORPUS_LIMITS.files }), attribution: strings(), modifications: strings(),
  conditions: strings(), modificationNoticeRequired: Type.Boolean() });
export const SOURCE_POLICY_SCHEMA = object({ schemaVersion: Type.Literal(1), policyVersion: text(), repositories: strings(),
  categories: Type.Array(object({ id: text(), licenseIds: strings(), conditions: strings(), reviewedBy: text() }), { maxItems: CORPUS_LIMITS.files }),
  profiles: Type.Array(REVIEWED_PROFILE_SCHEMA, { maxItems: CORPUS_LIMITS.files }) });
export const OUTPUT_BINDING_SCHEMA = object({ path: text(), digest: DIGEST_SCHEMA,
  authorship: Type.Union([Type.Literal('imported'), Type.Literal('derived')]),
  sourceIds: Type.Array(sourceId, { minItems: 1, maxItems: CORPUS_LIMITS.files, uniqueItems: true }),
  transformation: text(), modifications: strings(), reviewedBy: text(),
  inference: Type.Optional(object({ author: text(), rationale: text() })) });
export const ORIGINAL_OUTPUT_SCHEMA = object({ path: text(), digest: DIGEST_SCHEMA,
  authorship: Type.Union([Type.Literal('original'), Type.Literal('inferred')]), author: text(), rationale: text() });
export const LINEAGE_SCHEMA = object({ schemaVersion: Type.Literal(1),
  bindings: Type.Array(OUTPUT_BINDING_SCHEMA, { maxItems: CORPUS_LIMITS.files }),
  originals: Type.Array(ORIGINAL_OUTPUT_SCHEMA, { maxItems: CORPUS_LIMITS.files }) });
export const LINEAGE_PATH = 'sources/lineage.json';
export type SourceFile = Static<typeof SOURCE_FILE_SCHEMA>;
export type SourceManifest = Static<typeof SOURCE_MANIFEST_SCHEMA>;
export type ImportReport = Static<typeof IMPORT_REPORT_SCHEMA>;
export type ReviewedProfile = Static<typeof REVIEWED_PROFILE_SCHEMA>;
export type SourcePolicy = Static<typeof SOURCE_POLICY_SCHEMA>;
export type OutputBinding = Static<typeof OUTPUT_BINDING_SCHEMA>;
export type OriginalOutput = Static<typeof ORIGINAL_OUTPUT_SCHEMA>;
export type Lineage = Static<typeof LINEAGE_SCHEMA>;

const ajv = new Ajv({ allErrors: true, strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
const sourceValidator = ajv.compile<SourceManifest>(SOURCE_MANIFEST_SCHEMA);
const reportValidator = ajv.compile<ImportReport>(IMPORT_REPORT_SCHEMA);
const policyValidator = ajv.compile<SourcePolicy>(SOURCE_POLICY_SCHEMA);
const lineageValidator = ajv.compile<Lineage>(LINEAGE_SCHEMA);
function decode<T>(validator: ValidateFunction<T>, input: unknown): ValidationResult<T> {
  const snapshot = snapshotJson(input);
  if (!snapshot.ok) return snapshot;
  if (validator(snapshot.value)) return { ok: true, value: snapshot.value };
  return failure((validator.errors ?? []).map(e => problem(e.instancePath === '/schemaVersion' ? 'schema.unsupported' : 'schema.invalid', e.instancePath, `Schema requirement failed: ${e.keyword}.`)));
}
function identities(files: readonly { repositoryUrl: string; revision: string; path: string }[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [], seen = new Set<string>();
  const pathsByRepo = new Map<string, string[]>();
  for (const [i, file] of files.entries()) {
    if (!isCanonicalRepositoryUrl(file.repositoryUrl)) issues.push(problem('schema.invalid', `/files/${i}/repositoryUrl`, 'Expected canonical repository URL.'));
    if (!isPortablePath(file.path)) issues.push(problem('path.invalid', `/files/${i}/path`, 'Expected portable path.'));
    const key = JSON.stringify([file.repositoryUrl, file.revision, file.path]);
    if (seen.has(key)) issues.push(problem('inventory.invalid', `/files/${i}`, 'Duplicate source identity.'));
    seen.add(key);
    const repoKey = JSON.stringify([file.repositoryUrl, file.revision]);
    const paths = pathsByRepo.get(repoKey) ?? []; paths.push(file.path); pathsByRepo.set(repoKey, paths);
  }
  for (const paths of pathsByRepo.values()) issues.push(...pathIssues(paths, '/files'));
  return issues;
}
export function decodeSourceManifest(input: unknown): ValidationResult<SourceManifest> {
  const result = decode(sourceValidator, input); if (!result.ok) return result;
  const issues = identities(result.value.files), ids = new Set<string>();
  for (const [i, file] of result.value.files.entries()) {
    const prefix = `/files/${i}`;
    if (ids.has(file.sourceId)) issues.push(problem('inventory.invalid', prefix, 'Duplicate source ID.'));
    ids.add(file.sourceId);
    if (isCanonicalRepositoryUrl(file.repositoryUrl) && isPortablePath(file.path)
      && file.sourceId !== sourceIdentity(file.repositoryUrl, file.revision, file.path)) issues.push(problem('digest.mismatch', `${prefix}/sourceId`, 'Source ID disagrees with pinned tuple.'));
    if (!isUtcDate(file.retrievedAt)) issues.push(problem('schema.invalid', `${prefix}/retrievedAt`, 'Expected UTC ISO calendar instant.'));
    issues.push(...pathIssues(file.licenseTextRefs, `${prefix}/licenseTextRefs`), ...pathIssues(file.noticeRefs, `${prefix}/noticeRefs`));
    if (file.eligibility === 'eligible' && (!file.reviewedBy.trim() || !file.licenseIds.length || !file.licenseTextRefs.length || !file.attribution.length)) {
      issues.push(problem('provenance.incomplete', prefix, 'Eligible source requires reviewer, license evidence and attribution.'));
    }
  }
  return issues.length ? failure(issues) : result;
}
export function decodeImportReport(input: unknown): ValidationResult<ImportReport> {
  const result = decode(reportValidator, input); if (!result.ok) return result;
  const issues = pathIssues([...result.value.admitted, ...result.value.excluded.map(e => e.path), ...result.value.unresolved]);
  return issues.length ? failure(issues) : result;
}
export function decodeSourcePolicy(input: unknown): ValidationResult<SourcePolicy> {
  const result = decode(policyValidator, input); if (!result.ok) return result;
  const policy = result.value, issues = identities(policy.profiles);
  for (const url of policy.repositories) if (!isCanonicalRepositoryUrl(url)) issues.push(problem('schema.invalid', '/repositories', 'Expected canonical repository URL.'));
  const categories = new Set<string>();
  for (const category of policy.categories) {
    if (categories.has(category.id)) issues.push(problem('inventory.invalid', '/categories', 'Duplicate category.'));
    categories.add(category.id);
  }
  for (const [i, profile] of policy.profiles.entries()) {
    issues.push(...pathIssues(profile.licenseEvidence.map(e => e.path), `/profiles/${i}/licenseEvidence`),
      ...pathIssues(profile.noticeEvidence.map(e => e.path), `/profiles/${i}/noticeEvidence`));
  }
  return issues.length ? failure(issues) : result;
}
export function decodeLineage(input: unknown): ValidationResult<Lineage> {
  const result = decode(lineageValidator, input); if (!result.ok) return result;
  const issues = pathIssues([...result.value.bindings, ...result.value.originals].map(e => e.path));
  return issues.length ? failure(issues) : result;
}
