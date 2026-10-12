/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { hashBytes } from '../../canonical.js';
import type { SourcePolicy, ReviewedProfile } from '../contracts.js';
import type { AcquiredBlob, SourceRequest } from '../eligibility.js';
export const repositoryUrl = 'https://example.org/original-test-data';
export const revision = 'a'.repeat(40);
export const makeBytes = (text: string): Uint8Array => new Uint8Array(Buffer.from(text));
/** Independently authored bytes and synthetic decisions, not a real licensed import. */
export function sourceFixture(): { policy: SourcePolicy; request: SourceRequest; blobs: AcquiredBlob[] } {
  const texts = { 'good.txt': 'Original fixture asset', 'LICENSE': 'Original synthetic license evidence', 'unknown.txt': 'Unknown fixture', 'excluded.txt': 'Excluded fixture' };
  const blobs = Object.entries(texts).map(([path, text]) => ({ path, bytes: makeBytes(text) }));
  const licenseDigest = hashBytes(texts.LICENSE);
  const profiles: ReviewedProfile[] = blobs.filter(b => b.path !== 'unknown.txt').map(blob => ({ repositoryUrl, revision,
    path: blob.path, digest: hashBytes(blob.bytes), category: 'text', decision: blob.path === 'excluded.txt' ? 'excluded' : 'eligible',
    reason: 'Synthetic fixture decision', reviewedBy: 'Fixture reviewer', termsResolved: true, licenseIds: ['MIT'],
    licenseEvidence: [{ path: 'LICENSE', digest: licenseDigest }], noticeEvidence: [], attribution: ['Fixture author'],
    modifications: [], conditions: ['Retain synthetic license'], modificationNoticeRequired: false }));
  return { policy: { schemaVersion: 1, policyVersion: 'fixture-v1', repositories: [repositoryUrl],
    categories: [{ id: 'text', licenseIds: ['MIT'], conditions: ['Retain synthetic license'], reviewedBy: 'Fixture reviewer' }], profiles },
  request: { repositoryUrl, revision, paths: ['good.txt', 'unknown.txt', 'excluded.txt'], retrievedAt: '2026-10-12T00:00:00Z' }, blobs };
}
