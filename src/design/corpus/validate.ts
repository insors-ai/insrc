/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { canonicalJson, CorpusInputError, recordContentDigest, CORPUS_LIMITS, hashBytes, candidateContentDigest, reviewContentDigest, releaseContentDigest } from './canonical.js';
import { decodeGuidanceRecord, decodeReleaseManifest, decodeStageAssessments, sortIssues } from './contracts.js';
import type { GuidanceRecord, ReleaseManifest, PublicationCheck, ValidationIssue, ValidationResult } from './contracts.js';

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
const pathCollisionKey = (path: string): string => path.normalize('NFC').toLowerCase();
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

export interface PackageFile {
  readonly path: string;
  readonly kind: 'regular' | 'symlink' | 'directory' | 'other';
  readonly bytes: Uint8Array;
}
export interface ReleaseCandidate {
  readonly manifest: unknown;
  readonly files: readonly PackageFile[];
  /** Reserved manifest name; the manifest never belongs in its own data inventory. */
  readonly manifestPath?: string | undefined;
}
export interface ValidatedRelease {
  readonly manifest: ReleaseManifest;
  readonly records: readonly GuidanceRecord[];
  readonly candidateContentDigest: string;
  readonly manifestDigest: string;
}
function parsedBytes(bytes: Uint8Array, maxBytes: number): unknown {
  if (bytes.byteLength > maxBytes) throw new CorpusInputError('limit.exceeded', '', 'JSON bytes exceed the format limit.');
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  canonicalJson(value, maxBytes);
  return value;
}
/** Only inspect data descriptors, never invoke accessors at the inventory boundary. */
function dataProperties(value: unknown, allowed: readonly string[]): Record<string, PropertyDescriptor> | undefined {
  if (!value || typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return undefined;
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key))) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Object.values(descriptors).every(d => 'value' in d && d.enumerable) ? descriptors : undefined;
}
/** Validate a closed in-memory package. Source/editorial semantics are owned by later adapters. */
export function validateRelease(input: unknown): ValidationResult<ValidatedRelease> {
  const candidate = dataProperties(input, ['manifest', 'files', 'manifestPath']);
  if (!candidate) return failure([issue('schema.invalid', '', 'Expected a release candidate with data properties.')]);
  const manifestInput: unknown = candidate['manifest']?.value;
  let manifestBytes: number;
  try { manifestBytes = Buffer.byteLength(canonicalJson(manifestInput, CORPUS_LIMITS.packageBytes)); }
  catch (error) { const problem = inputIssue(error); return failure([{ ...problem, path: '/manifest' + problem.path }]); }
  const decoded = decodeReleaseManifest(manifestInput);
  if (!decoded.ok) return failure(decoded.issues.map(problem => ({ ...problem, path: '/manifest' + problem.path })));
  const manifest = decoded.value;
  const issues: ValidationIssue[] = [];
  const add = (code: ValidationIssue['code'], path: string, message: string) => issues.push(issue(code, path, message));
  const manifestPath: unknown = candidate['manifestPath']?.value ?? 'manifest.json';
  if (typeof manifestPath !== 'string' || !isPortablePath(manifestPath)) add('path.invalid', '/manifestPath', 'Expected a portable reserved manifest path.');
  if (!utcDate(manifest.createdAt)) add('schema.invalid', '/manifest/createdAt', 'Expected a valid UTC ISO timestamp.');
  const rawFiles: unknown = candidate['files']?.value;
  if (!Array.isArray(rawFiles)) return failure([...issues, issue('inventory.invalid', '/files', 'Expected an in-memory file array.')]);
  if (rawFiles.length > CORPUS_LIMITS.files || manifest.files.length > CORPUS_LIMITS.files || manifest.records.length > CORPUS_LIMITS.files) {
    return failure([...issues, issue('limit.exceeded', '/files', 'File count exceeds the format limit.')]);
  }
  const fileArrayKeys = Reflect.ownKeys(rawFiles);
  if (fileArrayKeys.length !== rawFiles.length + 1 || fileArrayKeys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= rawFiles.length))) {
    return failure([...issues, issue('inventory.invalid', '/files', 'Expected a dense file array without extra properties.')]);
  }
  const files = new Map<string, PackageFile>();
  const fileIndices = new Map<string, number>();
  const folded = new Set<string>();
  let totalBytes = manifestBytes;
  for (let i = 0; i < rawFiles.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(rawFiles, String(i));
    const entry = descriptor && 'value' in descriptor ? dataProperties(descriptor.value, ['path', 'kind', 'bytes']) : undefined;
    const path: unknown = entry?.['path']?.value;
    const kind: unknown = entry?.['kind']?.value;
    const bytes: unknown = entry?.['bytes']?.value;
    if (!entry || typeof path !== 'string' || !(bytes instanceof Uint8Array)) {
      add('inventory.invalid', `/files/${i}`, 'Expected a path, file kind and byte buffer.'); continue;
    }
    if (!isPortablePath(path)) add('path.invalid', `/files/${i}/path`, 'Expected a portable package-relative path.');
    if (kind !== 'regular') add('inventory.invalid', `/files/${i}/kind`, 'Only regular files are admitted.');
    if (files.has(path) || folded.has(pathCollisionKey(path))) add('inventory.invalid', `/files/${i}/path`, 'Inventory paths must be unique without case collisions.');
    if (typeof manifestPath === 'string' && pathCollisionKey(path) === pathCollisionKey(manifestPath)) add('inventory.invalid', `/files/${i}/path`, 'Manifest must not appear in its own data inventory.');
    totalBytes += bytes.byteLength;
    if (totalBytes > CORPUS_LIMITS.packageBytes) return failure([...issues, issue('limit.exceeded', '/files', 'Package bytes exceed the format limit.')]);
    folded.add(pathCollisionKey(path)); fileIndices.set(path, i);
    files.set(path, { path, kind: 'regular', bytes });
  }
  const listed = new Set<string>(); const listedFolded = new Set<string>();
  const fileDigests = new Map<string, string>();
  manifest.files.forEach((entry, i) => {
    if (!isPortablePath(entry.path)) add('path.invalid', `/manifest/files/${i}/path`, 'Expected a portable package-relative path.');
    if (listed.has(entry.path) || listedFolded.has(pathCollisionKey(entry.path))) add('inventory.invalid', `/manifest/files/${i}/path`, 'Manifest file paths must be unique without case collisions.');
    listed.add(entry.path); listedFolded.add(pathCollisionKey(entry.path));
    const file = files.get(entry.path);
    if (!file) add('reference.missing', `/manifest/files/${i}/path`, 'Declared file is missing from inventory.');
    else {
      const digest = hashBytes(file.bytes); fileDigests.set(entry.path, digest);
      if (digest !== entry.digest) add('digest.mismatch', `/manifest/files/${i}/digest`, 'File digest does not match exact bytes.');
    }
  });
  for (const path of files.keys()) {
    if (!listed.has(path)) add('inventory.invalid', `/files/${fileIndices.get(path)!}`, 'Inventory contains an undeclared file.');
  }
  const reserved = new Set<string>();
  for (const field of ['sourceManifestPath', 'noticesPath', 'coveragePath'] as const) {
    if (!isPortablePath(manifest[field])) add('path.invalid', `/manifest/${field}`, 'Expected a portable package-relative path.');
    if (!listed.has(manifest[field]) || !files.has(manifest[field])) add('reference.missing', `/manifest/${field}`, 'Required package file is missing.');
    if (reserved.has(manifest[field])) add('inventory.invalid', `/manifest/${field}`, 'Source, notices and coverage require distinct files.');
    reserved.add(manifest[field]);
  }
  const ids = new Set<string>(); const recordPaths = new Set<string>();
  const records: GuidanceRecord[] = [];
  const recordEntries = new Map<string, { record: GuidanceRecord; index: number }>();
  const metadataAndRecords = new Set([...reserved, ...manifest.records.map(record => record.path)]);
  const contentPaths = new Set([...files.keys()].filter(path => !metadataAndRecords.has(path)));
  manifest.records.forEach((entry, i) => {
    const prefix = `/manifest/records/${i}`;
    const contentPrefix = `/files/${fileIndices.get(entry.path) ?? 0}/bytes`;
    if (ids.has(entry.recordId)) add('inventory.invalid', `${prefix}/recordId`, 'Each record identity may appear once.');
    ids.add(entry.recordId);
    if (!isPortablePath(entry.path)) add('path.invalid', `${prefix}/path`, 'Expected a portable package-relative path.');
    if (recordPaths.has(entry.path) || reserved.has(entry.path)) add('inventory.invalid', `${prefix}/path`, 'Record files must be unique and distinct from metadata.');
    recordPaths.add(entry.path);
    if (!listed.has(entry.path) || !files.has(entry.path)) { add('reference.missing', `${prefix}/path`, 'Record file is missing.'); return; }
    if (fileDigests.get(entry.path) !== entry.digest) add('digest.mismatch', `${prefix}/digest`, 'Record file digest does not match exact bytes.');
    let value: unknown;
    try { value = parsedBytes(files.get(entry.path)!.bytes, CORPUS_LIMITS.recordBytes); }
    catch (error) { const problem = inputIssue(error); issues.push({ ...problem, path: contentPrefix, message: `Decoded record ${problem.path || '/'}: ${problem.message}` }); return; }
    const checked = validateGuidanceRecord(value, { mode: 'publication', contentPaths });
    if (!checked.ok) issues.push(...checked.issues.map(problem => ({ ...problem, path: contentPrefix, message: `Decoded record ${problem.path || '/'}: ${problem.message}` })));
    // Retain structurally valid siblings for exact relationship diagnostics even if another semantic check failed.
    const structural = decodeGuidanceRecord(value);
    if (!structural.ok) return;
    const record = structural.value;
    if (record.recordId !== entry.recordId || record.recordVersion !== entry.recordVersion) add('digest.mismatch', prefix, 'Manifest record pair does not match decoded content.');
    records.push(record); recordEntries.set(record.recordId, { record, index: i });
  });
  issues.push(...validateRelationships(recordEntries, manifest, fileIndices));
  const candidateDigest = candidateContentDigest(manifest);
  issues.push(...validateCoverageEnvelope(manifest, files, fileIndices, candidateDigest));
  const manifestDigest = releaseContentDigest(manifest);
  if (manifest.releaseId !== manifestDigest) add('digest.mismatch', '/manifest/releaseId', 'Release identity does not match canonical manifest.');
  return issues.length ? failure(issues) : { ok: true, value: { manifest, records, candidateContentDigest: candidateDigest, manifestDigest } };
}

/** Semantic graph checking stays independent of byte decoding and inventory admission. */
function validateRelationships(
  recordEntries: ReadonlyMap<string, { record: GuidanceRecord; index: number }>,
  manifest: ReleaseManifest,
  fileIndices: ReadonlyMap<string, number>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (code: ValidationIssue['code'], path: string, message: string) => issues.push(issue(code, path, message));
  const edges = new Map<string, Set<string>>();
  for (const { record, index } of recordEntries.values()) {
    const targets = new Set<string>(); edges.set(record.recordId, targets);
    record.relations.forEach((relation, i) => {
      const prefix = `/files/${fileIndices.get(manifest.records[index]!.path)!}/bytes`;
      if (targets.has(relation.recordId)) add('inventory.invalid', prefix, 'Duplicate relationship target is not allowed.');
      targets.add(relation.recordId);
      const target = recordEntries.get(relation.recordId)?.record;
      if (!target || target.recordVersion !== relation.recordVersion) add('reference.missing', prefix, 'Relationship must resolve to the exact included record version.');
      if (relation.recordId === record.recordId) add('reference.cycle', prefix, 'Self references are not allowed.');
    });
  }
  // Iterative topological check keeps long valid DAGs off the JavaScript call stack.
  const indegrees = new Map([...edges.keys()].map(key => [key, 0]));
  for (const targets of edges.values()) for (const target of targets) if (indegrees.has(target)) indegrees.set(target, indegrees.get(target)! + 1);
  const ready = [...indegrees].filter(([, n]) => n === 0).map(([key]) => key); let visited = 0;
  for (let cursor = 0; cursor < ready.length; cursor++) {
    const key = ready[cursor]!; visited++;
    for (const target of edges.get(key) ?? []) {
      const n = indegrees.get(target); if (n === undefined) continue;
      indegrees.set(target, n - 1); if (n === 1) ready.push(target);
    }
  }
  if (visited !== edges.size) add('reference.cycle', '/manifest/records', 'Included record relationships must form an acyclic graph.');
  return issues;
}

/** Coverage is opaque except for canonical bytes, exact binding and prohibited self-reference. */
function validateCoverageEnvelope(
  manifest: ReleaseManifest,
  files: ReadonlyMap<string, PackageFile>,
  fileIndices: ReadonlyMap<string, number>,
  candidateDigest: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (code: ValidationIssue['code'], path: string, message: string) => issues.push(issue(code, path, message));
  const coverage = files.get(manifest.coveragePath);
  if (coverage) {
    try {
      const envelope = parsedBytes(coverage.bytes, CORPUS_LIMITS.packageBytes);
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || (envelope as Record<string, unknown>)['candidateContentDigest'] !== candidateDigest) {
        add('review.stale', '/manifest/coveragePath', 'Coverage must bind the exact candidate content digest.');
      }
      const pending: unknown[] = [envelope];
      while (pending.length) {
        const value = pending.pop();
        if (value === manifest.releaseId || (value && typeof value === 'object' && Object.hasOwn(value, 'releaseId'))) {
          add('inventory.invalid', '/manifest/coveragePath', 'Coverage must not reference a final release identity.'); break;
        }
        if (value && typeof value === 'object') for (const child of Object.values(value)) pending.push(child);
      }
      if (reviewContentDigest(envelope) !== manifest.reviewDigest) add('digest.mismatch', '/manifest/reviewDigest', 'Review digest does not match canonical coverage bytes.');
    } catch (error) { const problem = inputIssue(error); issues.push({ ...problem, path: `/files/${fileIndices.get(manifest.coveragePath)!}/bytes`, message: `Decoded coverage ${problem.path || '/'}: ${problem.message}` }); }
  }
  return issues;
}

/**
 * Compose trusted internal eligibility/coverage results for this exact candidate.
 * This is a pure preflight, not approval, installation or publication. Adapters must
 * produce the assessments; caller-supplied JSON is never an authorization token.
 */
export function checkPublication(candidate: unknown, assessments: unknown): PublicationCheck {
  const checked = validateRelease(candidate);
  const issues: ValidationIssue[] = checked.ok ? [] : [...checked.issues];
  let manifestDigest = checked.ok ? checked.value.manifestDigest : '';
  let contentDigest = checked.ok ? checked.value.candidateContentDigest : '';
  if (!checked.ok) {
    const descriptor = dataProperties(candidate, ['manifest', 'files', 'manifestPath']);
    const input: unknown = descriptor?.['manifest']?.value;
    try {
      canonicalJson(input, CORPUS_LIMITS.packageBytes);
      const decoded = decodeReleaseManifest(input);
      if (decoded.ok) {
        manifestDigest = releaseContentDigest(decoded.value);
        contentDigest = candidateContentDigest(decoded.value);
      }
    } catch { /* Invalid JSON has no computable format identity. Keep the diagnostic from validateRelease. */ }
  }
  try { canonicalJson(assessments, CORPUS_LIMITS.packageBytes); }
  catch (error) {
    const problem = inputIssue(error);
    issues.push({ ...problem, path: '/assessments' + problem.path });
    return { eligible: false, manifestDigest, issues: sortIssues(issues) };
  }
  const decoded = decodeStageAssessments(assessments);
  if (!decoded.ok) {
    issues.push(...decoded.issues.map(problem => ({ ...problem, path: '/assessments' + problem.path })));
    return { eligible: false, manifestDigest, issues: sortIssues(issues) };
  }
  for (const stage of ['eligibility', 'coverage'] as const) {
    const matches = decoded.value.filter(assessment => assessment.stage === stage);
    if (matches.length !== 1) issues.push(issue('assessment.missing', '/assessments', 'Exactly one assessment is required for each stage.'));
  }
  decoded.value.forEach((assessment, i) => {
    if (!contentDigest || assessment.candidateContentDigest !== contentDigest) issues.push(issue('assessment.stale', `/assessments/${i}/candidateContentDigest`, 'Assessment does not bind this exact candidate.'));
    if (!assessment.passed || assessment.issues.length !== 0) issues.push(issue('assessment.failed', `/assessments/${i}`, 'Assessment failed or contradicts its diagnostic issues.'));
    // Keep downstream codes/pointers/messages verbatim, then sort the combined diagnostics.
    issues.push(...assessment.issues);
  });
  return { eligible: issues.length === 0, manifestDigest, issues: sortIssues(issues) };
}
