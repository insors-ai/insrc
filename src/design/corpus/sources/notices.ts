/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { canonicalJson, CORPUS_LIMITS, hashBytes } from '../canonical.js';
import type { ValidationResult } from '../contracts.js';
import { decodeLineage, decodeSourceManifest, LINEAGE_PATH } from './contracts.js';
import type { Lineage, SourceFile, SourceManifest } from './contracts.js';
import { evidencePath } from './eligibility.js';
import type { AcquiredBlob, StagedSources } from './eligibility.js';
import { canonicalLineage, collectSources, lineageBytes } from './lineage.js';
import { compareText, failure, pathIssues, problem, sourceIdentity } from './validation-primitives.js';

export interface NoticeDocument {
  schemaVersion: 1; policyVersion: string; lineage: Lineage;
  sources: { source: SourceFile; conditions: string[]; modificationNoticeRequired: boolean }[];
}
export interface MetadataOptions { readonly policyVersion: string; readonly sourceManifestPath: string; readonly noticesPath: string; }
export interface SourceMetadata { readonly sourceManifest: SourceManifest; readonly notice: NoticeDocument; readonly files: AcquiredBlob[]; }
export const NOTICE_HEADER = 'insrc-design-notices-v1\n';
/** Exact evidence stays in separate files; the notice is readable deterministic UTF-8 metadata. */
export function assembleSourceMetadata(stages: readonly StagedSources[], lineageInput: unknown, options: MetadataOptions): ValidationResult<SourceMetadata> {
  const decoded = decodeLineage(lineageInput); if (!decoded.ok) return decoded;
  const collected = collectSources(stages); if (!collected.ok) return collected;
  const sources = collected.value, byId = new Map(sources.map(source => [source.source.sourceId, source]));
  const lineage = canonicalLineage(decoded.value);
  if (stages.some(stage => stage.policyVersion !== options.policyVersion)) return failure([problem('provenance.incomplete', '/policyVersion', 'Metadata policy version differs from evaluated inputs.')]);
  const manifest: SourceManifest = { schemaVersion: 1, policyVersion: options.policyVersion, files: sources.map(source => source.source) };
  const checked = decodeSourceManifest(manifest); if (!checked.ok) return checked;
  const evidence = new Map<string, Uint8Array>();
  for (const admitted of sources) {
    for (const ref of [...admitted.profile.licenseEvidence, ...admitted.profile.noticeEvidence]) {
      const dependency = byId.get(sourceIdentity(admitted.source.repositoryUrl, admitted.source.revision, ref.path));
      if (!dependency || hashBytes(dependency.bytes) !== ref.digest || dependency.source.digest !== ref.digest) {
        return failure([problem('provenance.incomplete', ref.path, 'Required notice/license evidence is missing or stale.')]);
      }
      // Fail malformed text; do not normalize newlines, strip BOMs or re-encode evidence.
      try { new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(dependency.bytes); }
      catch { return failure([problem('schema.invalid', ref.path, 'License/notice evidence must be valid UTF-8 text.')]); }
      evidence.set(evidencePath(ref.digest), new Uint8Array(dependency.bytes));
    }
  }
  const paths = [options.sourceManifestPath, options.noticesPath, LINEAGE_PATH, ...evidence.keys()];
  const issues = pathIssues(paths); if (issues.length) return failure(issues);
  const notice: NoticeDocument = { schemaVersion: 1, policyVersion: options.policyVersion, lineage,
    sources: sources.map(source => ({ source: source.source, conditions: [...source.profile.conditions], modificationNoticeRequired: source.profile.modificationNoticeRequired })) };
  try {
    const files: AcquiredBlob[] = [
      { path: options.sourceManifestPath, bytes: Buffer.from(canonicalJson(manifest, CORPUS_LIMITS.packageBytes)) },
      { path: options.noticesPath, bytes: Buffer.from(NOTICE_HEADER + canonicalJson(notice, CORPUS_LIMITS.packageBytes) + '\n') },
      { path: LINEAGE_PATH, bytes: lineageBytes(lineage) },
      ...[...evidence].map(([path, bytes]) => ({ path, bytes })),
    ].sort((a, b) => compareText(a.path, b.path));
    if (files.length > CORPUS_LIMITS.files || files.reduce((sum, file) => sum + file.bytes.byteLength, 0) > CORPUS_LIMITS.packageBytes) {
      return failure([problem('limit.exceeded', '/metadata', 'Metadata inventory exceeds package limits.')]);
    }
    return { ok: true, value: { sourceManifest: manifest, notice, files } };
  } catch { return failure([problem('limit.exceeded', '/metadata', 'Metadata serialization exceeds bounded format.')]); }
}
