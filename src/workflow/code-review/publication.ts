import { randomUUID } from 'node:crypto';
import type { Party } from '../review/party.js';
import { SamePartyReviewError } from '../review/party.js';
import { compareReviewInputFingerprint, isReviewInputFingerprint, ReviewInputChangedError, ReviewInputUnavailableError } from './input-fingerprint.js';
import type { ReviewInputFingerprint } from './types.js';

export interface ReviewPublicationGuard {
 readonly fingerprint: ReviewInputFingerprint;
 readonly validate: () => void;
 readonly release: () => void;
}
const owners = new Map<string, string>();
export function assertReviewFingerprintCurrent(fingerprint: ReviewInputFingerprint, reviewer: Party): void {
 if (!isReviewInputFingerprint(fingerprint)) throw new ReviewInputUnavailableError('Invalid review input fingerprint');
 const compared = compareReviewInputFingerprint(fingerprint, fingerprint.repoPath, fingerprint.epicHash, fingerprint.storyId);
 if (compared.status !== 'fresh') {
  if (compared.reason === 'mismatch') throw new ReviewInputChangedError();
  throw new ReviewInputUnavailableError(compared.message);
 }
 if (fingerprint.author === reviewer) throw new SamePartyReviewError(reviewer, `the code of Story ${fingerprint.storyId}`);
 if (reviewer === 'controller' && fingerprint.author !== 'daemon') throw new ReviewInputUnavailableError('Controller review no longer has an independently authored BUILD');
}
/** One owner may publish a target at a time; release cannot remove a later owner's claim. */
export function claimReviewPublication(fingerprint: ReviewInputFingerprint, reviewer: Party): ReviewPublicationGuard {
 const key = JSON.stringify([fingerprint.repoPath, fingerprint.epicHash, BigInt(fingerprint.storyId.slice(1)).toString()]);
 if (owners.has(key)) throw new Error('An independent review already owns this publication target');
 assertReviewFingerprintCurrent(fingerprint, reviewer);
 const owner = randomUUID(); owners.set(key, owner);
 return {
  fingerprint,
  validate: () => { if (owners.get(key) !== owner) throw new Error('Review publication ownership was lost'); assertReviewFingerprintCurrent(fingerprint, reviewer); },
  release: () => { if (owners.get(key) === owner) owners.delete(key); },
 };
}
