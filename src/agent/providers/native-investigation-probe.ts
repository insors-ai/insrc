/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { InvestigationReplySchema } from '../../shared/review-investigation.js';
import { PROBE_ATTEMPT_MS, PROBE_OBSERVATION_BYTES, PROBE_REQUIRED_CHECKS, probeExportSchema } from '../../shared/review-investigation-probe.js';
import type { InvestigationProbeOptions, InvestigationProbeExport, InvestigationProbeObservation } from '../../shared/review-investigation-probe.js';
import type { ReviewProviderBudgetProfile } from '../../shared/review-budget.js';
import type { ProcessGroupOpts, ProcessGroupResult } from '../../shared/process-group.js';
import { NATIVE_REVIEW_BINDING_ENV } from '../../mcp/review-investigation-native.js';
import { digestValue } from '../../workflow/code-review/investigation/identity.js';
import { consumeInvestigationProbeGrant } from './investigation-probe-grant.js';
import { investigationFileDigest } from './investigation-session.js';
import { installedInvestigationImages, assertInstalledImagesPinned } from './native-investigation-installation.js';
import { nativeInvestigationEnvironment, nativeReviewMcpConfiguration, INVESTIGATION_SYSTEM_PROMPT } from './native-investigation-session.js';
import type { NativeInvestigationAdapter } from './native-investigation-session.js';
import { scopedReviewCatalogDigest, scopedReviewToolCatalog } from '../../shared/review-investigation-catalog.js';
import { preflightProviderReviewBudget, reviewWireSchemaJson } from './review-budget.js';

export interface NativeProbeInvocation {
  readonly options: InvestigationProbeOptions;
  readonly adapter: NativeInvestigationAdapter;
  readonly binaryPath: string;
  readonly modelArgs: readonly string[];
  readonly profile: ReviewProviderBudgetProfile;
  /** Supplied only by CliProvider, never an IPC command. No retry wrapper. */
  readonly invoke: (args: readonly string[], prompt: string, execution: ProcessGroupOpts & { readonly binaryPath: string }) => Promise<ProcessGroupResult>;
  /** Version-pinned native observations are added by the concrete adapters. */
  readonly collect?: ((result: ProcessGroupResult, identity: NativeProbeInvocationIdentity) => readonly InvestigationProbeObservation[]) | undefined;
}
export interface NativeProbeInvocationIdentity {
  readonly attemptId: string; readonly launchDigest: string; readonly effectiveDigest: string;
  readonly binaryVersion: string;
}

/** A distinct synthetic-only bootstrap. Never calls production qualification
 * or relaxes runNativeInvestigationSession's installed-proof requirement. */
export async function runNativeInvestigationProbe(input: NativeProbeInvocation): Promise<InvestigationProbeExport> {
  const context = consumeInvestigationProbeGrant(input.options.grant, input.options.signal);
  const runtime = context.runtime;
  if (!runtime) throw Error('Daemon-prepared probe fixture required');
  const fixture = runtime.fixture, indexed = context.sourceMode === 'indexed-impact';
  const abort = new AbortController(), signal = AbortSignal.any([input.options.signal, abort.signal]);
  let cleanup: (() => void) | undefined, monitor: ReturnType<typeof setInterval> | undefined;
  let processStarted = false, cancellationRequested = false;
  const startedAt = Date.now();
  try {
    const check = (requireActive = true) => {
      if (requireActive) signal.throwIfAborted(); context.assertCurrent();
      if (fixture.cwd !== context.cwd || fixture.turn.attemptId !== context.attemptId || fixture.tools.seed['probeOnly'] !== true ||
        fixture.binding.runId !== `probe-${context.probeId}` || input.adapter.kind !== context.identity.kind || input.adapter.version !== context.identity.adapterVersion ||
        realpathSync(input.binaryPath) !== context.identity.binary.path || digestValue(input.profile) !== context.identity.profileDigest ||
        scopedReviewCatalogDigest(indexed) !== context.identity.catalogDigest) throw Error('Probe invocation identity mismatch');
      for (const pin of [context.identity.binary, ...context.identity.runtimeFiles])
        if (realpathSync(pin.path) !== pin.path || investigationFileDigest(pin.path) !== pin.digest) throw Error('Probe runtime changed');
      assertInstalledImagesPinned(context.identity, installedInvestigationImages(input.adapter.kind, input.binaryPath, fixture.cwd));
      const mcp = nativeReviewMcpConfiguration(fixture.cwd, indexed).mcpServers['insrc-scoped-review'];
      for (const path of [mcp.command, mcp.args.find(p => /\/insrc-review-bridge\.(?:ts|js)$/.test(p))!])
        if (!context.identity.runtimeFiles.some(pin => pin.path === realpathSync(path))) throw Error('Unpinned probe MCP runtime');
      for (const [path, value] of Object.entries(input.adapter.configuration(fixture.cwd, indexed)))
        if (digestValue(JSON.parse(readFileSync(path, 'utf8'))) !== digestValue(value)) throw Error('Probe configuration changed');
    };
    check();
    const schema = JSON.parse(JSON.stringify(InvestigationReplySchema));
    const args = input.adapter.args(schema, input.modelArgs, fixture.cwd, indexed);
    if (input.adapter.launchDigest(args, fixture.cwd, schema) !== context.identity.launchDigest) throw Error('Probe launch changed');
    const prompt = `This is a synthetic isolation probe, never a repository review. Use only the scoped tools. Read each navigation reference and checkpoint probe-block-1 then probe-block-2 with disposition unverified, empty evidence/findings/coverage/outstanding arrays and consecutive expectedSequence 0 then 1. After both ACKs continue waiting for host cancellation; do not claim isolation from your own statements.\n${JSON.stringify({ turn: fixture.turn, seed: fixture.tools.seed })}`;
    const catalogue = JSON.stringify(scopedReviewToolCatalog(indexed));
    fixture.setTrafficGuard(chars => preflightProviderReviewBudget(context.budget, input.profile,
      prompt.length + INVESTIGATION_SYSTEM_PROMPT.length + chars, reviewWireSchemaJson(input.profile, schema), undefined, catalogue));
    const timeoutMs = Math.min(PROBE_ATTEMPT_MS, context.deadlineAt - Date.now());
    if (timeoutMs < 1) throw Error('Probe deadline elapsed');
    cleanup = input.adapter.prepareLaunch?.(fixture.cwd, schema);
    monitor = setInterval(() => {
      if (processStarted && fixture.state().sequence >= 2 && !cancellationRequested) {
        cancellationRequested = true; abort.abort();
      }
      if (fixture.error()) abort.abort();
    }, 5);
    const result = await input.invoke(args, prompt, { binaryPath: context.identity.binary.path, cwd: fixture.cwd,
      timeoutMs, signal, stdin: prompt, maxOutputBytes: PROBE_OBSERVATION_BYTES, onSpawn: () => { processStarted = true; },
      env: { ...nativeInvestigationEnvironment(), [NATIVE_REVIEW_BINDING_ENV]: fixture.binding.bindingId } });
    check(false);
    // Retain the actual bounded runtime output for independent attestation.
    // It remains private diagnostic data, never a model-supplied proof object.
    const raw = JSON.stringify(result), rawOverflow = Buffer.byteLength(raw) > PROBE_OBSERVATION_BYTES;
    if (!rawOverflow) writeFileSync(join(fixture.root, 'native-output.json'), raw, { mode: 0o600, flag: 'wx' });
    // ProcessGroupResult is returned only after actual process-group teardown.
    const state = fixture.state(), effectiveDigest = digestValue(input.adapter.configuration(fixture.cwd, indexed));
    const provenance = { attemptId: context.attemptId, launchDigest: context.identity.launchDigest, effectiveDigest,
      provenance: 'runtime-event' as const, at: Date.now() };
    const observations: InvestigationProbeObservation[] = [];
    if (state.sequence >= 2) observations.push({ ...provenance, check: 'durable-progress', verdict: 'observed-allowed',
      observationDigest: digestValue(state.accepted), detail: 'Two synthetic scoped block ACKs durably accepted' });
    if (processStarted && cancellationRequested && result.aborted && !result.spawnError) observations.push({ ...provenance,
      check: 'cancellation-exit', verdict: 'observed-allowed', observationDigest: digestValue({ aborted: result.aborted, durationMs: result.durationMs }),
      detail: 'Host cancellation followed by actual process-group exit' });
    if (!rawOverflow && !result.outputLimitExceeded && !result.observerFailed && !fixture.error())
      observations.push(...(input.collect?.(result, { ...provenance, binaryVersion: context.identity.binaryVersion }) ?? []));
    for (const observation of observations) await context.observe(observation);
    const expected = (check: string) => check === 'durable-progress' || check === 'cancellation-exit' ? 'observed-allowed' : 'observed-denied';
    const observed = new Set(observations.filter(o => o.verdict === expected(o.check)).map(o => o.check));
    const missingEvidence = PROBE_REQUIRED_CHECKS.filter(check => !observed.has(check));
    const failed = rawOverflow || result.outputLimitExceeded || result.observerFailed || fixture.error() || result.spawnError ||
      observations.some(o => o.verdict !== 'unverifiable' && o.verdict !== expected(o.check)) ||
      result.timedOut || result.stalled || (!result.aborted && result.exitCode !== 0);
    return probeExportSchema.parse({ version: 1, kind: 'review-investigation-probe-observations', origin: 'unsigned-installed-observations',
      sourceCommit: runtime.sourceCommit, sourceDigest: runtime.sourceDigest,
      status: { version: 1, probeId: context.probeId, requestId: runtime.requestId, attemptId: context.attemptId, repo: context.repo,
        sourceMode: context.sourceMode, state: failed ? 'failed' : input.options.signal.aborted ? 'cancelled' : 'unsupported',
        identity: context.identity, startedAt, endedAt: Date.now(), observations, missingEvidence,
        usage: { modelCalls: null, inputTokens: null, outputTokens: null, latencyMs: processStarted ? result.durationMs : null } } });
  } finally {
    if (monitor) clearInterval(monitor);
    abort.abort();
    try { await fixture.close(); } finally { cleanup?.(); }
  }
}
