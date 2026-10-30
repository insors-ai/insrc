/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { randomUUID } from 'node:crypto';
import { PROBE_ATTEMPT_MS, PROBE_CONTEXT_TOKENS, probeIdentitySchema } from '../../shared/review-investigation-probe.js';
import type { InvestigationProbeGrant, InvestigationProbeObservation } from '../../shared/review-investigation-probe.js';
import type { ReviewExecutionBudget } from '../../shared/review-budget.js';
import type { NativeAdapterIdentity } from './investigation-session.js';
import { digestValue, freezeValue, snapshotValue } from '../../workflow/code-review/investigation/identity.js';
import type { InvestigationProbeFixture } from '../../daemon/review-investigation-probe-fixtures.js';

export interface ProbeExecutionRuntime {
  readonly requestId: string;
  readonly sourceCommit: string;
  readonly sourceDigest: string;
  readonly fixture: InvestigationProbeFixture;
}

export interface ProbeGrantContext {
  readonly origin: 'installed-probe' | 'scripted-fixture';
  readonly probeId: string;
  readonly attemptId: string;
  readonly repo: string;
  readonly cwd: string;
  readonly sourceMode: 'source-only' | 'indexed-impact';
  readonly identity: NativeAdapterIdentity;
  readonly budget: ReviewExecutionBudget;
  readonly deadlineAt: number;
  readonly assertCurrent: () => void;
  readonly observe: (observation: InvestigationProbeObservation) => Promise<void>;
  /** Present only on a daemon-prepared fixture invocation, never a wire option. */
  readonly runtime?: ProbeExecutionRuntime | undefined;
}
const grants = new WeakMap<InvestigationProbeGrant, ProbeGrantContext>();

/** Internal daemon composition only; never export an issuer as an IPC/MCP capability. */
export function issueInvestigationProbeGrant(context: ProbeGrantContext): InvestigationProbeGrant {
  probeIdentitySchema.parse(context.identity);
  if (!Number.isSafeInteger(context.deadlineAt) || context.deadlineAt <= Date.now() ||
    context.deadlineAt > Date.now() + PROBE_ATTEMPT_MS ||
    context.budget.policy.totalTokens !== PROBE_CONTEXT_TOKENS ||
    digestValue(context.budget.policy.profile) !== context.identity.profileDigest)
    throw new Error('Invalid probe deadline, inclusive budget or profile');
  context.assertCurrent();
  const grant = Object.freeze({ version: 1 as const, grantId: randomUUID() });
  const { identity, budget, ...rest } = context;
  grants.set(grant, Object.freeze({ ...rest, identity: freezeValue(snapshotValue(identity)), budget: freezeValue(snapshotValue(budget)) }));
  return grant;
}

/** Consume before launch. A failed/stale/cancelled attempt cannot reuse its grant. */
export function consumeInvestigationProbeGrant(grant: InvestigationProbeGrant, signal: AbortSignal): ProbeGrantContext {
  const context = grants.get(grant);
  if (!context) throw new Error('Untrusted or already consumed probe grant');
  grants.delete(grant);
  if (context.origin !== 'installed-probe') throw new Error('Scripted grants cannot invoke installed probes');
  signal.throwIfAborted();
  context.assertCurrent();
  if (context.deadlineAt <= Date.now()) throw new Error('Probe grant expired');
  return context;
}

export function revokeInvestigationProbeGrant(grant: InvestigationProbeGrant): void {
  grants.delete(grant);
}
/** Metadata selection only; the probe still consumes and authenticates the grant before launch. */
export function investigationProbeAdapterVersion(grant: InvestigationProbeGrant): string {
 const context=grants.get(grant);if(!context)throw Error('Untrusted or already consumed probe grant');return context.identity.adapterVersion;
}
