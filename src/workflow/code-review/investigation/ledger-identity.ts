/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { snapshotValue, digestValue, freezeValue } from './identity.js';
import { SubjectPreparationError } from './types.js';
import { LEDGER_LIMITS, ReviewLedgerError } from './ledger-types.js';
import type { LedgerRequirement } from './ledger-types.js';
export function ledgerSnapshot<T>(value: T): T {
 try { return freezeValue(snapshotValue(value, LEDGER_LIMITS.canonicalBytes)); }
 catch (cause) { throw new ReviewLedgerError(cause instanceof SubjectPreparationError && cause.code === 'resource-limit'
  ? 'resource-limit' : 'invalid-input', 'Invalid or oversized ledger metadata.', { cause }); }
}
export function ledgerDigest(value: unknown): string {
 return digestValue(ledgerSnapshot(value));
}
export function coverageRowId(subjectDigest: string, requirement: Pick<LedgerRequirement, 'category' | 'requirementRef'>): string {
 return `row-${ledgerDigest({ subjectDigest, category: requirement.category, requirementRef: requirement.requirementRef })}`;
}
export function requireText(value: unknown, what: string): asserts value is string {
 if (typeof value !== 'string' || !value.trim()) throw new ReviewLedgerError('invalid-input', `Missing ${what}.`);
}
