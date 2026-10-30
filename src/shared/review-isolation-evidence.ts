/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { z } from 'zod';
import { InvestigationReplySchema } from './review-investigation.js';
import { digestValue } from '../workflow/code-review/investigation/identity.js';

export const ISOLATION_CHECKS = ['effective-inventory', 'raw-filesystem', 'shell', 'network', 'approval', 'cross-run',
  'builtin-tools', 'user-mcp', 'project-mcp', 'plugins', 'hooks', 'repository-instructions', 'durable-progress', 'cancellation-exit'] as const;
export const CAPABILITY_BOUNDARY = 'review-agent-capabilities-v1' as const;
export const CLAUDE_V2_ADAPTER = 'claude-scoped-v2';
// TypeBox schemas carry symbol metadata; bind the JSON schema sent on the wire.
export const REVIEW_PROTOCOL_SCHEMA_DIGEST = digestValue(JSON.parse(JSON.stringify(InvestigationReplySchema)));
export const ISOLATION_BASES = ['native-catalog', 'native-source-policy-control', 'native-permission-broker',
  'host-cross-run', 'durable-journal', 'actual-process-exit'] as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const boundaryEvidenceFields = {
  boundary: z.literal(CAPABILITY_BOUNDARY).optional(),
  protocolTools: z.array(z.object({ name: z.literal('StructuredOutput'), schemaDigest: digest }).strict()).max(1).optional(),
  evidenceBasis: z.array(z.object({ check: z.enum(ISOLATION_CHECKS), basis: z.enum(ISOLATION_BASES), policyVersion: z.literal(1),
    rawDigests: z.array(digest).min(1).max(16) }).strict()).max(ISOLATION_CHECKS.length).optional(),
};
export interface CapabilityBoundaryEvidence {
  readonly boundary?: typeof CAPABILITY_BOUNDARY | undefined;
  readonly protocolTools?: readonly { readonly name: 'StructuredOutput'; readonly schemaDigest: string }[] | undefined;
  readonly evidenceBasis?: readonly { readonly check: typeof ISOLATION_CHECKS[number]; readonly basis: typeof ISOLATION_BASES[number];
    readonly policyVersion: 1; readonly rawDigests: readonly string[] }[] | undefined;
}
export function isolationBasisFor(check: typeof ISOLATION_CHECKS[number]): typeof ISOLATION_BASES[number] {
  if (check === 'cross-run') return 'host-cross-run';
  if (check === 'approval') return 'native-permission-broker';
  if (check === 'durable-progress') return 'durable-journal';
  if (check === 'cancellation-exit') return 'actual-process-exit';
  return ['effective-inventory', 'plugins', 'hooks', 'repository-instructions'].includes(check) ? 'native-source-policy-control' : 'native-catalog';
}

/** This validates the evidence contract, never the truth of its referenced facts. */
export function boundaryEvidenceValid(adapter: string, input: unknown): boolean {
  const parsed = z.object(boundaryEvidenceFields).passthrough().safeParse(input);
  if (!parsed.success) return false;
  const value = parsed.data;
  if (adapter !== CLAUDE_V2_ADAPTER)
    return value.boundary === undefined && value.protocolTools === undefined && value.evidenceBasis === undefined;
  return value.boundary === CAPABILITY_BOUNDARY && value.protocolTools?.length === 1 &&
    value.evidenceBasis?.length === ISOLATION_CHECKS.length && new Set(value.evidenceBasis.map(b => b.check)).size === ISOLATION_CHECKS.length &&
    value.evidenceBasis.every(b => b.basis === isolationBasisFor(b.check) && new Set(b.rawDigests).size === b.rawDigests.length);
}
