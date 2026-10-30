/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { z } from 'zod';
import { reviewBudgetDeclarationSchema } from './review-controller-budget-schema.js';
import { ISOLATION_CHECKS, boundaryEvidenceFields, boundaryEvidenceValid } from './review-isolation-evidence.js';

export const PROBE_ATTEMPT_MS = 300_000;
export const PROBE_CONTEXT_TOKENS = 128_000;
export const PROBE_OBSERVATION_BYTES = 8 * 1024 * 1024;
export const PROBE_RESPONSE_BYTES = 2 * 1024 * 1024;
const text = z.string().min(1).max(4096);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.number().int().nonnegative().safe();
const id = z.uuid();
const mode = z.enum(['source-only', 'indexed-impact']);
const file = z.object({ path: text, digest }).strict();

export const probeIdentitySchema = z.object({
  kind: z.enum(['claude', 'codex']), adapterVersion: text, binaryVersion: text,
  binary: file, runtimeFiles: z.array(file).max(64),
  profileDigest: digest, catalogDigest: digest, launchDigest: digest,
}).strict();

/** Only this input crosses IPC. Launch authority and observations are daemon-owned. */
export const investigationProbeCommandSchema = z.discriminatedUnion('operation', [
  z.object({ version: z.literal(1), operation: z.literal('start'), requestId: id,
    repo: text, sourceMode: mode, reviewBudget: reviewBudgetDeclarationSchema }).strict(),
  ...(['status', 'cancel', 'export'] as const).map(operation =>
    z.object({ version: z.literal(1), operation: z.literal(operation), repo: text, probeId: id }).strict()),
]);
export type InvestigationProbeCommand = z.infer<typeof investigationProbeCommandSchema>;

export const PROBE_REQUIRED_CHECKS = ISOLATION_CHECKS;
export const probeObservationSchema = z.object({
  check: z.enum(PROBE_REQUIRED_CHECKS),
  verdict: z.enum(['observed-denied', 'observed-allowed', 'unverifiable']),
  attemptId: id, launchDigest: digest, effectiveDigest: digest,
  provenance: z.enum(['runtime-event', 'observer-attestation']),
  observationDigest: digest, detail: text, at: time,
}).strict();
export type InvestigationProbeObservation = z.infer<typeof probeObservationSchema>;

/** Same version-1 shape consumed by installed qualification; this schema grants no authority. */
export const probeCandidateSchema = z.object({
  version: z.literal(1), identity: probeIdentitySchema,
  effective: z.object({ cwd: text, configFiles: z.array(file).min(1).max(64),
    ...boundaryEvidenceFields,
    builtinTools: z.array(text).max(128), inheritedConfigSources: z.array(text).max(128),
    mcpServers: z.array(text).max(128), plugins: z.array(text).max(128), hooks: z.array(text).max(128),
    repositoryInstructions: z.array(text).max(128), credentialCopies: z.array(text).max(128),
    auth: z.literal('existing-cli-oauth'), catalog: z.array(z.unknown()).max(16),
  }).strict(),
  trace: z.object({ effectiveDigest: digest, events: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('denied'), capability: text }).strict(),
    z.object({ kind: z.literal('block-ack'), sequence: z.number().int().positive() }).strict(),
    z.object({ kind: z.literal('cancel-requested') }).strict(),
    z.object({ kind: z.literal('process-exited'), cancelled: z.literal(true) }).strict(),
  ])).max(256) }).strict(), validUntil: time,
}).strict().superRefine((value, ctx) => {
  if (!boundaryEvidenceValid(value.identity.adapterVersion, value.effective))
    ctx.addIssue({ code: 'custom', message: 'Unsupported or incomplete isolation boundary evidence' });
});

export const probeUsageSchema = z.object({
  modelCalls: time.nullable(), inputTokens: time.nullable(), outputTokens: time.nullable(),
  latencyMs: time.nullable(),
}).strict();
export const probeStatusSchema = z.object({
  version: z.literal(1), probeId: id, requestId: id, attemptId: id, repo: text, sourceMode: mode,
  state: z.enum(['queued', 'running', 'cancelling', 'completed', 'unsupported', 'failed', 'cancelled', 'interrupted']),
  identity: probeIdentitySchema.nullable(), startedAt: time.nullable(), endedAt: time.nullable(),
  missingEvidence: z.array(text).max(64), observations: z.array(probeObservationSchema).max(64),
  usage: probeUsageSchema,
}).strict();
export type InvestigationProbeStatus = z.infer<typeof probeStatusSchema>;

export const probePhaseSchema = z.object({
  phase: z.enum(['control', 'restricted']), probeId: id, attemptId: id,
  launchDigest: digest, effectiveDigest: digest, catalogDigest: digest, manifestDigest: digest,
  startedAt: time, endedAt: time, outputPath: text.nullable(), outputBytes: time,
  exitCode: z.number().int(), exitSignal: text.nullable(), aborted: z.boolean(), timedOut: z.boolean(),
  usage: probeUsageSchema,
}).strict();
export type InvestigationProbePhase = z.infer<typeof probePhaseSchema>;

export const probeExportSchema = z.object({
  version: z.literal(1), kind: z.literal('review-investigation-probe-observations'),
  origin: z.literal('unsigned-installed-observations'),
  sourceCommit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/), sourceDigest: digest,
  status: probeStatusSchema, candidate: probeCandidateSchema.optional(),
  evidenceFiles: z.array(z.object({kind:z.enum(['native-output','control-output','checkpoint-journal','configuration','canary-manifest','canary-signals','host-checks']),path:text,digest,bytes:time}).strict()).max(16).optional(),
  phases: z.array(probePhaseSchema).min(1).max(2).optional(),
  canaries: z.object({ manifestPath: text, manifestDigest: digest,
    checks: z.array(z.object({ capability: z.enum(['hooks','plugins','repository-instructions','project-mcp']),
      controlObserved: z.boolean(), restrictedObserved: z.boolean(),
      verdict: z.enum(['unverifiable','observed-allowed']) }).strict()).length(4),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.phases) {
    const phases = value.phases;
    if (phases[0]?.phase !== 'control' || (phases[1] && phases[1].phase !== 'restricted') ||
      phases.some(p => p.probeId !== value.status.probeId || p.attemptId !== value.status.attemptId || p.endedAt < p.startedAt || p.manifestDigest !== value.canaries?.manifestDigest) ||
      (phases[1] && (phases[1].startedAt < phases[0]!.endedAt || phases[1].launchDigest !== value.status.identity?.launchDigest || phases[1].catalogDigest !== value.status.identity?.catalogDigest)) ||
      (value.status.startedAt !== null && phases[0]!.startedAt < value.status.startedAt) ||
      phases.at(-1)!.endedAt - phases[0]!.startedAt > PROBE_ATTEMPT_MS)
      ctx.addIssue({ code: 'custom', message: 'Foreign, out-of-order or unbounded probe phases' });
    if (value.canaries?.checks.some(c => (c.restrictedObserved ? c.verdict !== 'observed-allowed' : c.verdict !== 'unverifiable')))
      ctx.addIssue({ code: 'custom', message: 'Canary silence is not exclusion evidence' });
    if (new Set(value.canaries?.checks.map(c => c.capability)).size !== 4)
      ctx.addIssue({ code: 'custom', message: 'Canary capabilities must be unique and complete' });
    if (value.candidate && (phases.length !== 2 || value.status.identity?.launchDigest !== phases[1]?.launchDigest))
      ctx.addIssue({ code: 'custom', message: 'Control evidence cannot qualify production' });
  } else if (value.canaries) ctx.addIssue({ code: 'custom', message: 'Canary evidence requires labelled phases' });
  const checks = value.status.observations.map(o => o.check);
  if (new Set(checks).size !== checks.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate probe observation checks' });
  for (const o of value.status.observations) {
    if (o.attemptId !== value.status.attemptId ||
      (value.status.identity && o.launchDigest !== value.status.identity.launchDigest))
      ctx.addIssue({ code: 'custom', message: 'Observation belongs to a different invocation' });
  }
  if (value.candidate) {
    if (value.status.state !== 'completed' || value.status.missingEvidence.length || !value.status.identity)
      ctx.addIssue({ code: 'custom', message: 'Incomplete probe cannot export a candidate' });
    if (JSON.stringify(value.candidate.identity) !== JSON.stringify(value.status.identity))
      ctx.addIssue({ code: 'custom', message: 'Candidate belongs to a different installation' });
    if (value.status.observations.some(o => o.effectiveDigest !== value.candidate!.trace.effectiveDigest))
      ctx.addIssue({ code: 'custom', message: 'Observation belongs to a different effective configuration' });
    for (const check of PROBE_REQUIRED_CHECKS) {
      const expected = check === 'durable-progress' || check === 'cancellation-exit' ? 'observed-allowed' : 'observed-denied';
      if (!value.status.observations.some(o => o.check === check && o.verdict === expected))
        ctx.addIssue({ code: 'custom', message: `Missing supported observation: ${check}` });
    }
  }
});
export type InvestigationProbeExport = z.infer<typeof probeExportSchema>;

export function parseInvestigationProbeCommand(raw: unknown): InvestigationProbeCommand {
  const encoded = JSON.stringify(raw);
  if (!encoded || Buffer.byteLength(encoded) > PROBE_RESPONSE_BYTES) throw new Error('Probe command exceeds bound');
  return investigationProbeCommandSchema.parse(JSON.parse(encoded));
}

/** An inert public handle. The provider-private WeakMap, not these fields, is authority. */
export interface InvestigationProbeGrant {
  readonly version: 1;
  readonly grantId: string;
}
export interface InvestigationProbeOptions {
  readonly grant: InvestigationProbeGrant;
  readonly signal: AbortSignal;
}
