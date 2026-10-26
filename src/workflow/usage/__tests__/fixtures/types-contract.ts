/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type {
  AccountingGroup, EffectiveAccounting, LedgerRecord, RequestFinished, RequestStarted,
  SourcePayload, TransferAccepted, TransferCommitted, TransferPrepared, UsageAttributionInput,
  UsageAttributionPolicy, UsageBinding, UsageReducer, UsageRootKind,
} from '../../index.js';

// The HLD boundary remains compatible with the closed implementation-side types.
interface HldRecord {
  readonly schemaVersion: 1; readonly eventId: string; readonly rootArtifactId: string;
  readonly artifactId: string; readonly sequence: number; readonly recordedAt: string;
  readonly recordKind: string; readonly callId: string | null; readonly payloadDigest: string;
  readonly context: Readonly<Record<string, unknown>> | null;
  readonly observation: Readonly<Record<string, unknown>> | null;
  readonly control: Readonly<Record<string, unknown>> | null;
}
interface HldAccounting {
  readonly knownTokens: string; readonly estimatedTokens: string;
  readonly quality: readonly string[]; readonly basisEventIds: readonly string[];
  readonly notices: readonly string[];
  readonly effectiveOwners?: ReadonlyArray<Readonly<{
    callId: string; rootArtifactId: string | null; artifactId: string | null;
    ownerVersion: string | null; captureRootArtifactId: string; captureArtifactId: string;
    basisEventIds: readonly string[]; provenanceEventIds: readonly string[];
    state: 'resolved' | 'pending' | 'conflict' | 'unavailable';
  }>> | undefined;
}
interface HldReducer {
  validate(record: HldRecord): readonly string[];
  reduce(records: AsyncIterable<HldRecord>, scope: Readonly<Record<string, unknown>>): Promise<HldAccounting>;
}
declare const reducer: UsageReducer;
const hldReducer: HldReducer = reducer;
declare const attribution: UsageAttributionPolicy;
const hldAttribution: { validate(input: UsageAttributionInput): readonly string[] } = attribution;
declare const start: RequestStarted;
declare const finish: RequestFinished;
const record: LedgerRecord = start;
const hldRecord: HldRecord = finish;
const root: UsageRootKind = 'EPIC';
const legacyConsumer: EffectiveAccounting = { knownTokens: '0', estimatedTokens: '0', quality: [], basisEventIds: [], notices: [] };
const mapped: EffectiveAccounting = { ...legacyConsumer, effectiveOwners: [{ callId: 'call-1', rootArtifactId: 'EPIC-root', artifactId: 'LLD-root-s1', ownerVersion: 'v1', captureRootArtifactId: 'EPIC-root', captureArtifactId: 'LLD-root-s1', basisEventIds: ['finish-1'], provenanceEventIds: ['start-1'], state: 'resolved' }] };
const unresolved: EffectiveAccounting = { ...legacyConsumer, effectiveOwners: [{ callId: 'call-1', rootArtifactId: null, artifactId: null, ownerVersion: null, captureRootArtifactId: 'EPIC-root', captureArtifactId: 'LLD-root-s1', basisEventIds: [], provenanceEventIds: ['start-1'], state: 'conflict' }] };
declare const committed: TransferCommitted;
const sameRoot: TransferCommitted = { ...committed, control: { ...committed.control, mode: 'same-root', preparedEventId: null, acceptedEventId: null } };
const crossRoot: TransferCommitted = { ...committed, control: { ...committed.control, mode: 'cross-root', preparedEventId: 'prepare', acceptedEventId: 'accept' } };
const group: AccountingGroup = { invocationId: 'invocation-1', modelSliceId: 'model', isolatedCallId: null };

// @ts-expect-error a start requires its typed context
const invalidStart: RequestStarted = { ...start, context: null };
// @ts-expect-error a finish must not carry a start context
const invalidFinish: RequestFinished = { ...finish, context: start.context };
// @ts-expect-error future kinds are not silently accepted into the v1 union
const unknownKind: LedgerRecord = { ...start, recordKind: 'request.future' };
// @ts-expect-error service-assigned sequence is excluded from source payload
const invalidSource: SourcePayload = { ...finish, sequence: 3 };
// @ts-expect-error DEF is a document kind, not a canonical usage-root kind
const invalidRoot: UsageRootKind = 'DEF';
// @ts-expect-error an accounting group cannot select invocation and isolated-call scopes together
const invalidGroup: AccountingGroup = { invocationId: 'invocation', modelSliceId: 'model', isolatedCallId: 'call' };
declare const prepared: TransferPrepared;
// @ts-expect-error same-root reassignment has no prepared operation
const invalidPrepare: TransferPrepared = { ...prepared, control: { ...prepared.control, mode: 'same-root' } };
declare const accepted: TransferAccepted;
// @ts-expect-error acceptance must refer to a prepare
const invalidAccept: TransferAccepted = { ...accepted, control: { ...accepted.control, preparedEventId: null } };
// @ts-expect-error cross-root commits require both phase references
const invalidCross: TransferCommitted = { ...committed, control: { ...committed.control, mode: 'cross-root', preparedEventId: null, acceptedEventId: null } };
// @ts-expect-error same-root commits must not claim a cross-root phase receipt
const invalidSame: TransferCommitted = { ...committed, control: { ...committed.control, mode: 'same-root', preparedEventId: 'prepare', acceptedEventId: 'accept' } };
// @ts-expect-error unresolved effective ownership cannot fabricate a nonnull owner
const invalidOwner: EffectiveAccounting = { ...legacyConsumer, effectiveOwners: [{ callId: 'call', rootArtifactId: 'root', artifactId: 'artifact', ownerVersion: 'v', captureRootArtifactId: 'root', captureArtifactId: 'artifact', basisEventIds: [], provenanceEventIds: [], state: 'conflict' }] };
// @ts-expect-error source binding facts are immutable
start.context.binding.version = 'changed';
declare const binding: UsageBinding;
// @ts-expect-error only declared binding provenance is accepted
const inventedBinding: UsageBinding = { ...binding, provenance: 'guess' };
void [hldReducer, hldAttribution, record, hldRecord, root, legacyConsumer, mapped, unresolved, sameRoot, crossRoot, group];
