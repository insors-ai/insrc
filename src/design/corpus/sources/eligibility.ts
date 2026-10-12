/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { types as utilTypes } from 'node:util';
import { CORPUS_LIMITS, hashBytes } from '../canonical.js';
import type { ValidationResult } from '../contracts.js';
import { decodeSourcePolicy } from './contracts.js';
import type { ImportReport, ReviewedProfile, SourceFile, SourcePolicy } from './contracts.js';
import { profileDecision } from './policy.js';
import type { PolicyDecision } from './policy.js';
import { compareText, failure, isCanonicalRepositoryUrl, isFullRevision, isUtcDate, pathIssues, problem, snapshotJson, sourceIdentity } from './validation-primitives.js';

export interface SourceRequest { repositoryUrl: string; revision: string; paths: string[]; retrievedAt: string; }
export interface AcquiredBlob { readonly path: string; readonly bytes: Uint8Array; }
export interface AdmittedSource { readonly source: SourceFile; readonly profile: ReviewedProfile; readonly bytes: Uint8Array; }
export interface StagedSources { readonly policyVersion: string; readonly report: ImportReport; readonly admitted: readonly AdmittedSource[]; }
export function decodeSourceRequest(input: unknown): ValidationResult<SourceRequest> {
  const decoded = snapshotJson(input); if (!decoded.ok) return decoded;
  const value = decoded.value as Partial<SourceRequest> | null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'paths,repositoryUrl,retrievedAt,revision'
    || typeof value.repositoryUrl !== 'string' || !isCanonicalRepositoryUrl(value.repositoryUrl)
    || typeof value.revision !== 'string' || !isFullRevision(value.revision)
    || typeof value.retrievedAt !== 'string' || !isUtcDate(value.retrievedAt)
    || !Array.isArray(value.paths) || value.paths.some(path => typeof path !== 'string')) {
    return failure([problem('schema.invalid', '', 'Expected pinned source request with explicit UTC retrieval timestamp.')]);
  }
  if (value.paths.length > CORPUS_LIMITS.files) return failure([problem('limit.exceeded', '/paths', 'Source count exceeds limit.')]);
  const issues = pathIssues(value.paths, '/paths');
  return issues.length ? failure(issues) : { ok: true, value: value as SourceRequest };
}
/** Enumerate only exact requested paths and their declared evidence; no directory scanning. */
export function requiredSourcePaths(policy: SourcePolicy, request: SourceRequest): ValidationResult<string[]> {
  const profiles = new Map(policy.profiles.filter(p => p.repositoryUrl === request.repositoryUrl && p.revision === request.revision).map(p => [p.path, p]));
  const paths = new Set(request.paths), queue = [...paths];
  for (let i = 0; i < queue.length; i++) {
    if (paths.size > CORPUS_LIMITS.files) return failure([problem('limit.exceeded', '/paths', 'Evidence closure exceeds file limit.')]);
    const profile = profiles.get(queue[i]!);
    for (const ref of [...(profile?.licenseEvidence ?? []), ...(profile?.noticeEvidence ?? [])]) {
      if (!paths.has(ref.path)) { paths.add(ref.path);
        if (paths.size > CORPUS_LIMITS.files) return failure([problem('limit.exceeded', '/paths', 'Evidence closure exceeds file limit.')]);
        queue.push(ref.path); }
    }
  }
  const result = [...paths].sort(compareText), issues = pathIssues(result, '/paths');
  return issues.length ? failure(issues) : { ok: true, value: result };
}
const lengthGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;
/** Copy native buffers before policy checks. Accessors, proxies and sparse arrays are not data. */
export function snapshotBlobs(input: unknown): ValidationResult<AcquiredBlob[]> {
  if (!Array.isArray(input) || utilTypes.isProxy(input)) return failure([problem('inventory.invalid', '/blobs', 'Expected plain blob array.')]);
  if (input.length > CORPUS_LIMITS.files) return failure([problem('limit.exceeded', '/blobs', 'Blob count exceeds limit.')]);
  if (Reflect.ownKeys(input).length !== input.length + 1) return failure([problem('inventory.invalid', '/blobs', 'Expected dense array without extra properties.')]);
  const blobs: AcquiredBlob[] = []; let total = 0;
  for (let i = 0; i < input.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
    const raw: unknown = descriptor && 'value' in descriptor ? descriptor.value : null;
    if (!raw || typeof raw !== 'object' || utilTypes.isProxy(raw)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(raw) as typeof Object.prototype)) return failure([problem('inventory.invalid', '/blobs', 'Expected plain blob data.')]);
    const props = Object.getOwnPropertyDescriptors(raw);
    const path: unknown = props['path']?.value, bytes: unknown = props['bytes']?.value;
    if (Reflect.ownKeys(raw).length !== 2 || !props['path']?.enumerable || !props['bytes']?.enumerable
      || typeof path !== 'string' || !utilTypes.isUint8Array(bytes)) return failure([problem('inventory.invalid', '/blobs', 'Expected path and native bytes.')]);
    try {
      const length = lengthGetter.call(bytes) as number; total += length;
      if (total > CORPUS_LIMITS.packageBytes) return failure([problem('limit.exceeded', '/blobs', 'Aggregate source bytes exceed limit.')]);
      const copy = new Uint8Array(length); Uint8Array.prototype.set.call(copy, bytes); blobs.push({ path, bytes: copy });
    } catch { return failure([problem('inventory.invalid', '/blobs', 'Unreadable byte buffer.')]); }
  }
  const issues = pathIssues(blobs.map(b => b.path), '/blobs');
  return issues.length ? failure(issues) : { ok: true, value: blobs };
}
export const evidencePath = (digest: string): string => `sources/evidence/${digest}.txt`;
export const isLfsPointer = (bytes: Uint8Array): boolean => Buffer.from(bytes.subarray(0, 128)).toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1\n');

/** Pure eligibility; repository bytes cannot change the separately supplied reviewed policy. */
export function stageSources(policyInput: unknown, requestInput: unknown, acquiredInput: unknown): ValidationResult<StagedSources> {
  const policyResult = decodeSourcePolicy(policyInput); if (!policyResult.ok) return policyResult;
  const requestResult = decodeSourceRequest(requestInput); if (!requestResult.ok) return requestResult;
  const blobResult = snapshotBlobs(acquiredInput); if (!blobResult.ok) return blobResult;
  const policy = policyResult.value, request = requestResult.value;
  const required = requiredSourcePaths(policy, request); if (!required.ok) return required;
  const blobs = new Map(blobResult.value.map(blob => [blob.path, blob]));
  if (blobs.size !== required.value.length || required.value.some(path => !blobs.has(path))) {
    return failure([problem('reference.missing', '/blobs', 'Acquisition must contain exactly the requested evidence closure.')]);
  }
  const profiles = new Map(policy.profiles.filter(p => p.repositoryUrl === request.repositoryUrl && p.revision === request.revision).map(p => [p.path, p]));
  const decisions = new Map<string, PolicyDecision>();
  const digests = new Map([...blobs].map(([path, blob]) => [path, hashBytes(blob.bytes)]));
  for (const path of required.value) {
    const profile = profiles.get(path), blob = blobs.get(path)!;
    let decision = profileDecision(policy, profile, request.repositoryUrl);
    if (decision.status === 'eligible' && (isLfsPointer(blob.bytes) || !profile || digests.get(path) !== profile.digest)) {
      decision = { status: 'unresolved', reason: 'Unsupported LFS content or stale reviewed file digest.' };
    }
    decisions.set(path, decision);
  }
  // Fixed point handles shared/cyclic license evidence without recursive stack growth.
  let changed = true;
  while (changed) {
    changed = false;
    for (const path of required.value) {
      if (decisions.get(path)!.status !== 'eligible') continue;
      const profile = profiles.get(path)!;
      if ([...profile.licenseEvidence, ...profile.noticeEvidence].some(ref => decisions.get(ref.path)?.status !== 'eligible'
        || digests.get(ref.path) !== ref.digest)) {
        decisions.set(path, { status: 'unresolved', reason: 'Required evidence is ineligible or differs from the reviewed digest.' }); changed = true;
      }
    }
  }
  const report: ImportReport = { admitted: [], excluded: [], unresolved: [] };
  for (const path of [...request.paths].sort(compareText)) {
    const decision = decisions.get(path)!;
    if (decision.status === 'eligible') report.admitted.push(path);
    else if (decision.status === 'excluded') report.excluded.push({ path, reason: decision.reason });
    else report.unresolved.push(path);
  }
  const included = requiredSourcePaths(policy, { ...request, paths: report.admitted });
  if (!included.ok) return included;
  const admitted = included.value.map(path => {
    const profile = profiles.get(path)!, source: SourceFile = {
      sourceId: sourceIdentity(request.repositoryUrl, request.revision, path), repositoryUrl: request.repositoryUrl, revision: request.revision,
      path, digest: profile.digest, licenseIds: [...profile.licenseIds], licenseTextRefs: [...new Set(profile.licenseEvidence.map(ref => evidencePath(ref.digest)))].sort(compareText),
      noticeRefs: [...new Set(profile.noticeEvidence.map(ref => evidencePath(ref.digest)))].sort(compareText), attribution: [...profile.attribution], modifications: [...profile.modifications],
      retrievedAt: request.retrievedAt, eligibility: 'eligible', eligibilityReason: profile.reason, reviewedBy: profile.reviewedBy,
    };
    return { source, profile, bytes: blobs.get(path)!.bytes };
  });
  return { ok: true, value: { policyVersion: policy.policyVersion, report, admitted } };
}
