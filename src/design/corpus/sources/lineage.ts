/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { canonicalJson, CORPUS_LIMITS, hashBytes } from '../canonical.js';
import { decodeReleaseManifest } from '../contracts.js';
import type { GuidanceRecord, ReleaseManifest, ValidationIssue, ValidationResult } from '../contracts.js';
import { decodeLineage, decodeSourceManifest, LINEAGE_PATH } from './contracts.js';
import type { Lineage } from './contracts.js';
import { snapshotBlobs, evidencePath } from './eligibility.js';
import type { AdmittedSource, StagedSources } from './eligibility.js';
import { compareText, failure, pathCollisionKey, pathIssues, problem, snapshotJson } from './validation-primitives.js';

const sorted = (values: readonly string[]): string[] => [...new Set(values)].sort(compareText);
const equalSet = (a: readonly string[], b: readonly string[]): boolean => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
/** Internal composition of freshly evaluated source stages, not a public authorization token. */
export function collectSources(stages: readonly StagedSources[]): ValidationResult<AdmittedSource[]> {
  const sources = new Map<string, AdmittedSource>(); let bytes = 0;
  for (const stage of stages) for (const source of stage.admitted) {
    const old = sources.get(source.source.sourceId);
    if (old) {
      if (canonicalJson(old.source) !== canonicalJson(source.source) || canonicalJson(old.profile) !== canonicalJson(source.profile)
        || hashBytes(old.bytes) !== hashBytes(source.bytes)) return failure([problem('provenance.incomplete', '/sources', 'Conflicting repeated source identity.')]);
      continue;
    }
    bytes += source.bytes.byteLength;
    if (sources.size >= CORPUS_LIMITS.files || bytes > CORPUS_LIMITS.packageBytes) return failure([problem('limit.exceeded', '/sources', 'Combined source inventory exceeds limits.')]);
    sources.set(source.source.sourceId, source);
  }
  const result = [...sources.values()].sort((a, b) => compareText(a.source.sourceId, b.source.sourceId));
  const decoded = decodeSourceManifest({ schemaVersion: 1, policyVersion: stages[0]?.policyVersion ?? 'original-only', files: result.map(s => s.source) });
  if (!decoded.ok) return decoded;
  if (stages.some(stage => stage.policyVersion !== stages[0]?.policyVersion)) return failure([problem('provenance.incomplete', '/policyVersion', 'One candidate requires one reviewed policy version.')]);
  return { ok: true, value: result };
}
export function canonicalLineage(lineage: Lineage): Lineage {
  return { schemaVersion: 1, bindings: lineage.bindings.map(binding => ({ ...binding, sourceIds: sorted(binding.sourceIds), modifications: sorted(binding.modifications) }))
    .sort((a, b) => compareText(a.path, b.path)), originals: [...lineage.originals].sort((a, b) => compareText(a.path, b.path)) };
}
export const lineageBytes = (lineage: Lineage): Uint8Array => Buffer.from(canonicalJson(canonicalLineage(lineage), CORPUS_LIMITS.packageBytes));
export interface RecordOutput { readonly path: string; readonly record: GuidanceRecord; }
/** Validate reviewed output declarations; use classifyPackageFiles for the explicit package partition. */
export function validateOutputLineage(lineageInput: unknown, outputsInput: unknown, stages: readonly StagedSources[], records: readonly RecordOutput[] = []): ValidationResult<Lineage> {
  const decoded = decodeLineage(lineageInput); if (!decoded.ok) return decoded;
  const outputs = snapshotBlobs(outputsInput); if (!outputs.ok) return outputs;
  const collected = collectSources(stages); if (!collected.ok) return collected;
  const sources = new Map(collected.value.map(source => [source.source.sourceId, source]));
  const lineage = decoded.value, files = new Map(outputs.value.map(output => [output.path, output]));
  const declarations = new Map([...lineage.bindings, ...lineage.originals].map(binding => [binding.path, binding]));
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push(problem('provenance.incomplete', path, message));
  for (const [path, file] of files) {
    const declaration = declarations.get(path);
    if (!declaration) { add(path, 'Every distributed output requires a source binding or original declaration.'); continue; }
    if (hashBytes(file.bytes) !== declaration.digest) issues.push(problem('digest.mismatch', path, 'Output bytes differ from reviewed lineage.'));
  }
  for (const path of declarations.keys()) if (!files.has(path)) add(path, 'Lineage references an absent output.');
  for (const binding of lineage.bindings) {
    for (const id of binding.sourceIds) {
      const source = sources.get(id);
      if (!source) { add(binding.path, 'Output references an unresolved or missing source.'); continue; }
      if (binding.authorship === 'imported' && binding.digest !== source.source.digest) add(binding.path, 'Imported copy must equal every referenced source digest.');
      if (source.profile.modifications.some(note => !binding.modifications.includes(note))) add(binding.path, 'Source modification obligations must be retained.');
      if (source.profile.modificationNoticeRequired && binding.authorship === 'derived' && !binding.modifications.length) add(binding.path, 'Derived output requires modification notices.');
    }
    if (binding.authorship === 'derived' && !binding.modifications.length) add(binding.path, 'Derived output requires recorded modifications.');
  }
  for (const { path, record } of records) {
    const own = declarations.get(path);
    if (!own) { add(path, 'Record has no output declaration.'); continue; }
    const related = [own, ...record.examples.map(example => declarations.get(example.contentRef))];
    if (related.some(value => !value)) add(path, 'Record references an undeclared specimen.');
    const bound = related.filter((entry): entry is Lineage['bindings'][number] => !!entry && 'sourceIds' in entry);
    if (!equalSet(record.provenance.sourceRefs, bound.flatMap(binding => binding.sourceIds))) add(path, 'Record sourceRefs must equal its output and specimen contributors.');
    if (!equalSet(record.provenance.modificationNotes, bound.flatMap(binding => binding.modifications))) add(path, 'Record modification notes must retain its output and specimen modifications.');
    if ('sourceIds' in own) {
      if (record.provenance.authorship === 'inferred' && (!own.inference || own.inference.author !== record.provenance.author
        || own.inference.rationale !== record.rationale)) add(path, 'Inferred record requires a matching reviewed author and rationale.');
      if (record.provenance.authorship !== own.authorship && !(record.provenance.authorship === 'inferred' && own.authorship === 'derived')) add(path, 'Record authorship disagrees with reviewed output binding.');
    } else if (record.provenance.authorship !== own.authorship || record.provenance.author !== own.author || record.rationale !== own.rationale) {
      add(path, 'Original or inferred record declaration must match its authored provenance and rationale.');
    }
  }
  return issues.length ? failure(issues) : { ok: true, value: canonicalLineage(lineage) };
}

export type PackageClassification =
  | { path: string; category: 'metadata'; role: 'source-manifest' | 'notices' | 'coverage' | 'lineage' }
  | { path: string; category: 'evidence'; sourceIds: string[] }
  | { path: string; category: 'output' };
/** Classification is derived from manifest roles and admitted evidence, never an output's self-label. */
export function classifyPackageFiles(manifest: ReleaseManifest, stages: readonly StagedSources[]): ValidationResult<PackageClassification[]> {
  const collected = collectSources(stages); if (!collected.ok) return collected;
  const roles = [
    [manifest.sourceManifestPath, 'source-manifest'], [manifest.noticesPath, 'notices'],
    [manifest.coveragePath, 'coverage'], [LINEAGE_PATH, 'lineage'],
  ] as const;
  const issues = pathIssues(roles.map(([path]) => path));
  const evidence = new Map<string, Set<string>>();
  for (const admitted of collected.value) for (const ref of [...admitted.profile.licenseEvidence, ...admitted.profile.noticeEvidence]) {
    const path = evidencePath(ref.digest), ids = evidence.get(path) ?? new Set<string>();
    ids.add(admitted.source.sourceId); evidence.set(path, ids);
  }
  issues.push(...pathIssues([...roles.map(([path]) => path), ...evidence.keys()]));
  const files = new Set(manifest.files.map(file => file.path));
  for (const [path] of roles) if (!files.has(path)) issues.push(problem('reference.missing', path, 'Required metadata category is absent.'));
  for (const path of evidence.keys()) if (!files.has(path)) issues.push(problem('reference.missing', path, 'Required evidence category is absent.'));
  for (const record of manifest.records) if (roles.some(([path]) => path === record.path) || evidence.has(record.path)) {
    issues.push(problem('inventory.invalid', record.path, 'Record cannot masquerade as metadata or license evidence.'));
  }
  if (issues.length) return failure(issues);
  return { ok: true, value: manifest.files.map(file => {
    const role = roles.find(([path]) => path === file.path);
    if (role) return { path: file.path, category: 'metadata' as const, role: role[1] };
    const sourceIds = evidence.get(file.path);
    if (sourceIds) return { path: file.path, category: 'evidence' as const, sourceIds: [...sourceIds].sort(compareText) };
    return { path: file.path, category: 'output' as const };
  }) };
}
/** Add immutable lineage bytes to the candidate inventory; final release resealing stays downstream. */
export function bindLineageToManifest(manifestInput: unknown, lineageInput: unknown): ValidationResult<{
  manifest: ReleaseManifest; file: { path: string; kind: 'regular'; bytes: Uint8Array };
}> {
  const snapshot = snapshotJson(manifestInput); if (!snapshot.ok) return snapshot;
  const manifest = decodeReleaseManifest(snapshot.value); if (!manifest.ok) return manifest;
  const lineage = decodeLineage(lineageInput); if (!lineage.ok) return lineage;
  const conflicts = [manifest.value.sourceManifestPath, manifest.value.noticesPath, manifest.value.coveragePath,
    ...manifest.value.records.map(record => record.path), ...lineage.value.bindings.map(binding => binding.path), ...lineage.value.originals.map(original => original.path)];
  if (conflicts.some(path => pathCollisionKey(path) === pathCollisionKey(LINEAGE_PATH))) {
    return failure([problem('inventory.invalid', LINEAGE_PATH, 'Lineage metadata path conflicts with another package role.')]);
  }
  const inventoryIssues = pathIssues(manifest.value.files.map(file => file.path));
  if (inventoryIssues.length) return failure(inventoryIssues);
  const bytes = lineageBytes(lineage.value);
  const files = manifest.value.files.filter(file => file.path !== LINEAGE_PATH);
  files.push({ path: LINEAGE_PATH, digest: hashBytes(bytes), mediaType: 'application/json' });
  const issues = pathIssues(files.map(file => file.path)); if (issues.length) return failure(issues);
  return { ok: true, value: { manifest: { ...manifest.value, files }, file: { path: LINEAGE_PATH, kind: 'regular', bytes } } };
}
/** Compare distributable claims to the separate maintainer-reviewed output descriptor, even without records. */
export function validatePackagedLineage(candidateInput: unknown, reviewedInput: unknown, outputsInput: unknown,
  stages: readonly StagedSources[], records: readonly RecordOutput[] = []): ValidationResult<Lineage> {
  const candidate = decodeLineage(candidateInput); if (!candidate.ok) return candidate;
  const reviewed = decodeLineage(reviewedInput); if (!reviewed.ok) return reviewed;
  if (hashBytes(lineageBytes(candidate.value)) !== hashBytes(lineageBytes(reviewed.value))) {
    return failure([problem('provenance.incomplete', LINEAGE_PATH, 'Packaged contributors or transformations differ from reviewed output lineage.')]);
  }
  return validateOutputLineage(reviewed.value, outputsInput, stages, records);
}
