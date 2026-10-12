/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/** Pure assessment. Re-evaluate reviewed inputs rather than trusting staged labels or formatter success. */
import { types } from 'node:util';
import { canonicalJson, candidateContentDigest, CORPUS_LIMITS, hashBytes, releaseContentDigest, reviewContentDigest } from '../canonical.js';
import { decodeReleaseManifest, sortIssues } from '../contracts.js';
import type { ReleaseManifest, StageAssessment, ValidationIssue, ValidationResult } from '../contracts.js';
import { validateRelease } from '../validate.js';
import { decodeSourcePolicy, LINEAGE_PATH } from './contracts.js';
import { snapshotBlobs, stageSources } from './eligibility.js';
import type { AcquiredBlob, StagedSources } from './eligibility.js';
import { classifyPackageFiles, validatePackagedLineage } from './lineage.js';
import { assembleSourceMetadata } from './notices.js';
import { AcquisitionBudget, failure, problem, snapshotJson } from './validation-primitives.js';

export interface SourceAcquisition { readonly request: unknown; readonly blobs: unknown; }
/** Maintainer-controlled policy and output declarations; repository payloads cannot author these inputs. */
export interface EligibilityReview { readonly policy: unknown; readonly imports: readonly SourceAcquisition[]; readonly lineage: unknown; }
/** Inspect descriptors before accessing values; callers may supply arbitrary runtime data. */
function reviewSnapshot(input: unknown): ValidationResult<EligibilityReview> {
  try {
    const data = (value: unknown, keys: string[]): Record<string, unknown> => {
      if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error();
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key => !descriptors[key] || !('value' in descriptors[key]!))) throw new Error();
      return Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]));
    };
    const root = data(input, ['policy', 'imports', 'lineage']);
    const policy = snapshotJson(root['policy']); if (!policy.ok) return policy;
    const lineage = snapshotJson(root['lineage']); if (!lineage.ok) return lineage;
    const raw = root['imports'];
    if (!raw || typeof raw !== 'object' || types.isProxy(raw) || !Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype) throw new Error();
    if (raw.length > CORPUS_LIMITS.files) return failure([problem('limit.exceeded', '/imports', 'Import count exceeds limit.')]);
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(descriptors).length !== raw.length + 1) throw new Error();
    const imports: SourceAcquisition[] = [], budget = new AcquisitionBudget();
    for (let i = 0; i < raw.length; i++) {
      const entry = descriptors[String(i)]; if (!entry || !('value' in entry)) throw new Error();
      const source = data(entry.value, ['request', 'blobs']);
      const request = snapshotJson(source['request']); if (!request.ok) return request;
      const blobs = snapshotBlobs(source['blobs']); if (!blobs.ok) return blobs;
      const charged = budget.charge(blobs.value.length, blobs.value.reduce((sum, blob) => sum + blob.bytes.byteLength, 0));
      if (!charged.ok) return charged;
      imports.push({ request: request.value, blobs: blobs.value });
    }
    return { ok: true, value: { policy: policy.value, lineage: lineage.value, imports } };
  } catch { return failure([problem('schema.invalid', '/review', 'Expected plain reviewed source inputs without accessors or proxies.')]); }
}
export function evaluateSourceImports(reviewInput: unknown): ValidationResult<StagedSources[]> {
  const snapshot = reviewSnapshot(reviewInput); if (!snapshot.ok) return snapshot;
  const review = snapshot.value;
  const policy = decodeSourcePolicy(review.policy); if (!policy.ok) return policy;
  const stages: StagedSources[] = [];
  for (const input of review.imports) {
    const acquired = snapshotBlobs(input.blobs); if (!acquired.ok) return acquired;
    const stage = stageSources(policy.value, input.request, acquired.value); if (!stage.ok) return stage;
    stages.push(stage.value);
  }
  return { ok: true, value: stages };
}
/** Coverage bytes and final seal are downstream; validate all non-cyclic content using a PRIVATE structural envelope. */
function structuralCandidate(manifest: ReleaseManifest, files: readonly AcquiredBlob[]) {
  const envelope = { candidateContentDigest: candidateContentDigest(manifest) };
  const coverageBytes = Buffer.from(canonicalJson(envelope));
  const temporary = { ...manifest, files: manifest.files.map(file => file.path === manifest.coveragePath ? { ...file, digest: hashBytes(coverageBytes) } : file),
    reviewDigest: reviewContentDigest(envelope) };
  return { manifest: { ...temporary, releaseId: releaseContentDigest(temporary) },
    files: [...files.filter(file => file.path !== manifest.coveragePath), { path: manifest.coveragePath, bytes: coverageBytes }]
      .map(file => ({ ...file, kind: 'regular' as const })) };
}
export function assessEligibility(manifestInput: unknown, filesInput: unknown, reviewInput: unknown): ValidationResult<StageAssessment> {
  const snapshot = snapshotJson(manifestInput); if (!snapshot.ok) return snapshot;
  const decoded = decodeReleaseManifest(snapshot.value); if (!decoded.ok) return decoded;
  const manifest = decoded.value;
  let digest: string;
  try { digest = candidateContentDigest(manifest); } catch { return failure([problem('schema.invalid', '/manifest', 'Cannot compute candidate identity.')]); }
  if (!digest) return failure([problem('inventory.invalid', '/manifest/coveragePath', 'Exactly one coverage entry is required for eligibility binding.')]);
  const finish = (issues: readonly ValidationIssue[]): ValidationResult<StageAssessment> => ({ ok: true,
    value: { stage: 'eligibility', candidateContentDigest: digest, passed: issues.length === 0, issues: sortIssues(issues) } });
  try {
    const copied = snapshotBlobs(filesInput); if (!copied.ok) return finish(copied.issues);
    const files = new Map(copied.value.map(file => [file.path, file]));
    const structural = validateRelease(structuralCandidate(manifest, copied.value));
    if (!structural.ok) return finish(structural.issues);
    const reviewed = reviewSnapshot(reviewInput); if (!reviewed.ok) return finish(reviewed.issues);
    const review = reviewed.value;
    const policy = decodeSourcePolicy(review.policy); if (!policy.ok) return finish(policy.issues);
    const stages = evaluateSourceImports(review); if (!stages.ok) return finish(stages.issues);
    // Reconstruct independently from reviewed policy, exact acquisition bytes and the reviewed output descriptor.
    const expected = assembleSourceMetadata(stages.value, review.lineage, { policyVersion: policy.value.policyVersion,
      sourceManifestPath: manifest.sourceManifestPath, noticesPath: manifest.noticesPath });
    if (!expected.ok) return finish(expected.issues);
    const issues: ValidationIssue[] = [];
    for (const expectedFile of expected.value.files) {
      const actual = files.get(expectedFile.path);
      if (!actual) issues.push(problem('reference.missing', expectedFile.path, 'Required source metadata/evidence is absent.'));
      else if (hashBytes(actual.bytes) !== hashBytes(expectedFile.bytes)) issues.push(problem('provenance.incomplete', expectedFile.path, 'Candidate metadata/evidence differs from reviewed obligations.'));
    }
    if (issues.length) return finish(issues);
    const categories = classifyPackageFiles(manifest, stages.value); if (!categories.ok) return finish(categories.issues);
    const outputPaths = new Set(categories.value.filter(file => file.category === 'output').map(file => file.path));
    const lineageFile = files.get(LINEAGE_PATH);
    if (!lineageFile) return finish([problem('reference.missing', LINEAGE_PATH, 'Packaged lineage is absent.')]);
    let packaged: unknown;
    try { packaged = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(lineageFile.bytes)); }
    catch { return finish([problem('schema.invalid', LINEAGE_PATH, 'Invalid packaged lineage JSON.')]); }
    const records = [];
    for (const record of structural.value.records) {
      const entry = manifest.records.find(entry => entry.recordId === record.recordId);
      if (!entry) return finish([problem('reference.missing', '/manifest/records', 'Validated record has no inventory entry.')]);
      records.push({ path: entry.path, record });
    }
    const checked = validatePackagedLineage(packaged, review.lineage, copied.value.filter(file => outputPaths.has(file.path)), stages.value,
      records);
    return checked.ok ? finish([]) : finish(checked.issues);
  } catch { return finish([problem('schema.invalid', '/eligibility', 'Expected bounded candidate and reviewed source inputs.')]); }
}

export interface EligibilityCandidate {
  readonly manifest: ReleaseManifest; readonly files: AcquiredBlob[]; readonly assessment: StageAssessment;
}
/** Assemble a candidate from reviewed output bytes and source acquisitions; never create coverage or publish. */
export function prepareEligibilityCandidate(manifestInput: unknown, outputsInput: unknown, reviewInput: unknown): ValidationResult<EligibilityCandidate> {
  const snapshot = snapshotJson(manifestInput); if (!snapshot.ok) return snapshot;
  const decoded = decodeReleaseManifest(snapshot.value); if (!decoded.ok) return decoded;
  const base = decoded.value;
  const coverage = base.files.filter(file => file.path === base.coveragePath);
  if (coverage.length !== 1) return failure([problem('inventory.invalid', '/manifest/coveragePath', 'Declare exactly one coverage path and media type before staging.')]);
  const reviewed = reviewSnapshot(reviewInput); if (!reviewed.ok) return reviewed;
  const review = reviewed.value;
  const output = snapshotBlobs(outputsInput); if (!output.ok) return output;
  const policy = decodeSourcePolicy(review.policy); if (!policy.ok) return policy;
  const stages = evaluateSourceImports(review); if (!stages.ok) return stages;
  const metadata = assembleSourceMetadata(stages.value, review.lineage, { policyVersion: policy.value.policyVersion,
    sourceManifestPath: base.sourceManifestPath, noticesPath: base.noticesPath });
  if (!metadata.ok) return metadata;
  const files = snapshotBlobs([...output.value, ...metadata.value.files]); if (!files.ok) return files;
  const byPath = new Map(base.files.map(file => [file.path, file]));
  if (byPath.size !== base.files.length) return failure([problem('inventory.invalid', '/manifest/files', 'Manifest paths must be unique.')]);
  for (const file of output.value) if (!byPath.has(file.path)) return failure([problem('reference.missing', file.path, 'Output requires explicit media type in manifest inventory.')]);
  const present = new Set(files.value.map(file => file.path));
  for (const file of base.files) if (file.path !== base.coveragePath && !present.has(file.path)) {
    return failure([problem('reference.missing', file.path, 'Staging must not silently discard declared output.')]);
  }
  const manifest: ReleaseManifest = { ...base, files: [...files.value.map(file => ({ path: file.path, digest: hashBytes(file.bytes),
    mediaType: byPath.get(file.path)?.mediaType ?? (file.path === LINEAGE_PATH || file.path === base.sourceManifestPath ? 'application/json' : 'text/plain') })), coverage[0]!] };
  const assessment = assessEligibility(manifest, files.value, review);
  if (!assessment.ok) return assessment;
  if (!assessment.value.passed) return failure(assessment.value.issues);
  return { ok: true, value: { manifest, files: files.value, assessment: assessment.value } };
}
