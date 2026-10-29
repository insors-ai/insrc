/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { constants, openSync, closeSync, fsyncSync, fstatSync, lstatSync, readFileSync, writeFileSync, mkdirSync, realpathSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseInvestigationProbeCommand, investigationProbeCommandSchema, probeStatusSchema, probeExportSchema, probeObservationSchema, probeIdentitySchema, PROBE_RESPONSE_BYTES } from '../shared/review-investigation-probe.js';
import type { InvestigationProbeCommand, InvestigationProbeStatus, InvestigationProbeExport, InvestigationProbeObservation } from '../shared/review-investigation-probe.js';
import { digestValue, snapshotValue } from '../workflow/code-review/investigation/identity.js';
import { acquireInvestigationProvider } from './review-investigation-provider-lane.js';
import { createRoleRouter } from '../analyze/context/role-router.js';
import { loadAnalyzeConfig } from '../config/analyze.js';
import { createInvestigationPolicy, admitInvestigationRequest } from '../workflow/code-review/investigation/continuation-policy.js';
import { createInvestigationProbeFixture } from './review-investigation-probe-fixtures.js';
import { InvestigationReplySchema } from '../shared/review-investigation.js';
import { claudeInvestigationAdapter } from '../agent/providers/claude-investigation-session.js';
import { codexInvestigationAdapter } from '../agent/providers/codex-investigation-session.js';
import { nativeReviewMcpConfiguration } from '../agent/providers/native-investigation-session.js';
import { inspectInstalledInvestigation } from '../agent/providers/native-investigation-installation.js';
import { investigationFileDigest } from '../agent/providers/investigation-session.js';
import type { NativeAdapterIdentity } from '../agent/providers/investigation-session.js';
import { issueInvestigationProbeGrant } from '../agent/providers/investigation-probe-grant.js';
import { scopedReviewCatalogDigest } from '../shared/review-investigation-catalog.js';
import { readInstalledCommit } from './installed-commit.js';
import { investigationSourceDigest } from './review-investigation-adoption.js';
import { validateUnsignedProbeExport } from './review-investigation-probe-export.js';

type Start = Extract<InvestigationProbeCommand, { operation: 'start' }>;
const copy = <T>(value: T): T => snapshotValue(value, PROBE_RESPONSE_BYTES);
const storedSchema = z.object({ version: z.literal(1), epoch: z.string(), requestDigest: z.string(),
  request: investigationProbeCommandSchema, status: probeStatusSchema, report: probeExportSchema.optional() }).strict();
type Stored = z.infer<typeof storedSchema>;
const terminal = (state: InvestigationProbeStatus['state']) => ['completed', 'unsupported', 'failed', 'cancelled', 'interrupted'].includes(state);
export interface ProbeServiceOptions {
  readonly directory: string;
  readonly assertOwner: () => void;
  readonly registeredRepos: () => Promise<readonly string[]>;
  readonly execute: (request: Start, status: InvestigationProbeStatus, signal: AbortSignal,
    observe: (observation: InvestigationProbeObservation) => Promise<void>, pinIdentity: (identity:NativeAdapterIdentity)=>Promise<void>) => Promise<InvestigationProbeExport>;
  readonly validateExport?: ((report:InvestigationProbeExport)=>InvestigationProbeExport) | undefined;
}

/** Main-daemon-only operator work; no canonical lifecycle or review dispatcher. */
export class InvestigationProbeService {
  readonly directory: string;
  private readonly epoch = randomUUID();
  private readonly records = new Map<string, Stored>();
  private readonly active = new Map<string, { abort: AbortController; done: Promise<void> }>();
  private admission: Promise<void> = Promise.resolve();
  constructor(private readonly options: ProbeServiceOptions) {
    options.assertOwner(); mkdirSync(options.directory, { recursive: true, mode: 0o700 });
    const stat = lstatSync(options.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) throw Error('Unsafe probe store');
    this.directory = realpathSync(options.directory);
    for (const name of readdirSync(this.directory)) {
      if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
      const fd = openSync(join(this.directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
      let record: Stored;
      try {
        const s = fstatSync(fd);
        if (!s.isFile() || s.nlink !== 1 || (s.mode & 0o077) || s.size > PROBE_RESPONSE_BYTES) throw Error('Unsafe probe record');
        record = storedSchema.parse(JSON.parse(readFileSync(fd, 'utf8')));
      } finally { closeSync(fd); }
      if (record.request.operation !== 'start' || name !== `${record.status.probeId}.json` ||
        record.requestDigest !== digestValue(record.request) || record.status.requestId !== record.request.requestId ||
        record.status.repo !== record.request.repo || record.status.sourceMode !== record.request.sourceMode) throw Error('Invalid probe record identity');
      if (!terminal(record.status.state)) {
        record.status.state = 'interrupted'; record.status.endedAt = Date.now(); record.status.missingEvidence = ['daemon-restarted']; delete record.report;
        this.persist(record);
      }
      this.records.set(record.status.probeId, record);
    }
  }
  private guard() {
    this.options.assertOwner(); const s = lstatSync(this.directory);
    if (!s.isDirectory() || s.isSymbolicLink() || (s.mode & 0o077)) throw Error('Probe store ownership changed');
  }
  private persist(record: Stored) {
    this.guard(); const bytes = JSON.stringify(storedSchema.parse(record));
    if (Buffer.byteLength(bytes) > PROBE_RESPONSE_BYTES) throw Error('Probe record exceeds bound');
    const temporary = join(this.directory, `temp-${randomUUID()}`), target = join(this.directory, `${record.status.probeId}.json`);
    const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    try { this.guard(); renameSync(temporary, target); } finally { try { unlinkSync(temporary); } catch { /* Renamed or private interrupted write. */ } }
    const dir = openSync(this.directory, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { fsyncSync(dir); } finally { closeSync(dir); }
  }
  private async registered(repo: string) {
    this.guard();
    if (realpathSync(repo) !== repo || !(await this.options.registeredRepos()).includes(repo)) throw Error('Probe requires a registered canonical repository');
  }
  private record(repo: string, probeId: string) {
    const record = this.records.get(probeId);
    if (!record || record.status.repo !== repo) throw Error('Unknown probe identity');
    return record;
  }
  async dispatch(raw: unknown): Promise<Record<string, unknown>> {
    const command = parseInvestigationProbeCommand(raw); await this.registered(command.repo);
    if (command.operation === 'start') {
      const previous = this.admission; let release!: () => void;
      this.admission = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try {
        const digest = digestValue(command), prior = [...this.records.values()].find(r => r.status.repo === command.repo && r.status.requestId === command.requestId);
        if (prior) { if (prior.requestDigest !== digest) throw Error('Probe UUID payload conflict'); return this.response('status', prior); }
        const record: Stored = { version: 1, epoch: this.epoch, requestDigest: digest, request: command,
          status: { version: 1, probeId: randomUUID(), requestId: command.requestId, attemptId: randomUUID(), repo: command.repo,
            sourceMode: command.sourceMode, state: 'queued', identity: null, startedAt: null, endedAt: null, observations: [],
            missingEvidence: [], usage: { modelCalls: null, inputTokens: null, outputTokens: null, latencyMs: null } } };
        this.persist(record); this.records.set(record.status.probeId, record);
        const abort = new AbortController(), done = Promise.resolve().then(() => this.execute(record, abort.signal));
        this.active.set(record.status.probeId, { abort, done });
        void done.finally(() => this.active.delete(record.status.probeId)).catch(() => {});
        return this.response('accepted', record);
      } finally { release(); }
    }
    const record = this.record(command.repo, command.probeId);
    if (command.operation === 'cancel' && !terminal(record.status.state)) {
      const active = this.active.get(command.probeId);
      record.status.state = 'cancelling'; this.persist(record); active?.abort.abort(); await active?.done;
    }
    if (command.operation === 'export') {
      if (!terminal(record.status.state) || !record.report) throw Error('Probe evidence is incomplete or interrupted');
      return this.response('exported', record, (this.options.validateExport??validateUnsignedProbeExport)(record.report));
    }
    return this.response('status', record);
  }
  private response(next: string, record: Stored, report?: InvestigationProbeExport): Record<string, unknown> {
    const result = { version: 1, kind: 'investigation-probe', next, status: copy(record.status), ...(report ? { report: copy(report) } : {}) };
    if (Buffer.byteLength(JSON.stringify(result)) > PROBE_RESPONSE_BYTES) throw Error('Probe response exceeds bound');
    return result;
  }
  private async execute(record: Stored, signal: AbortSignal) {
    let release: (() => void) | undefined;
    try {
      release = await acquireInvestigationProvider(signal); signal.throwIfAborted();
      await this.registered(record.status.repo);
      signal.throwIfAborted();
      record.status.state = 'running'; record.status.startedAt = Date.now(); this.persist(record);
      if (record.request.operation !== 'start') throw Error('Invalid probe request');
      const report = probeExportSchema.parse(await this.options.execute(record.request, copy(record.status), signal, async value => {
        this.guard(); signal.throwIfAborted(); const observation = probeObservationSchema.parse(value);
        if (observation.attemptId !== record.status.attemptId || record.status.observations.some(o => o.check === observation.check)) throw Error('Invalid probe observation identity');
        record.status.observations.push(observation); this.persist(record);
      },async identity=>{
        this.guard();signal.throwIfAborted();
        if(record.status.identity)throw Error('Probe identity is already pinned');
        record.status.identity=probeIdentitySchema.parse(identity);this.persist(record);
      }));
      if (Buffer.byteLength(JSON.stringify(report)) > PROBE_RESPONSE_BYTES) throw Error('Probe evidence exceeds bound');
      await this.registered(record.status.repo);
      signal.throwIfAborted();
      if (report.status.probeId !== record.status.probeId || report.status.attemptId !== record.status.attemptId ||
        report.status.requestId !== record.status.requestId || report.status.repo !== record.status.repo || report.status.sourceMode !== record.status.sourceMode ||
        !terminal(report.status.state)) throw Error('Probe result identity mismatch');
      if(record.status.identity&&digestValue(record.status.identity)!==digestValue(report.status.identity))throw Error('Pinned probe result identity changed');
      record.status = copy(report.status); record.report = copy(report); this.persist(record);
    } catch (cause) {
      record.status.state = signal.aborted ? 'cancelled' : 'failed'; record.status.endedAt = Date.now();
      record.status.missingEvidence = [signal.aborted ? 'probe-cancelled' : cause instanceof Error && /exceeds bound/.test(cause.message) ? 'probe-evidence-bound-exceeded' : 'probe-execution-failed']; delete record.report;
      this.persist(record);
    } finally { release?.(); }
  }
}

/** Production composition uses the existing high-tier review role and provider
 * abstraction. Version inspection is metadata, never certification. */
export async function executeInstalledProbe(request: Start, status: InvestigationProbeStatus, signal: AbortSignal,
  observe: (value: InvestigationProbeObservation) => Promise<void>,pinIdentity:(identity:NativeAdapterIdentity)=>Promise<void>, registeredRepos: readonly string[], assertOwner: () => void): Promise<InvestigationProbeExport> {
  assertOwner(); signal.throwIfAborted();
  const { provider, resolution } = createRoleRouter({ cliTimeoutMs: 300000 }).resolveProviderForRole('review', loadAnalyzeConfig(), request.repo);
  if (!provider.runInvestigationProbe || !provider.getReviewBudgetProfile || !['cli-claude', 'cli-codex'].includes(resolution.runner)) throw Error('Unsupported review probe provider');
  const kind = resolution.runner === 'cli-claude' ? 'claude' : 'codex', adapter = kind === 'claude' ? claudeInvestigationAdapter : codexInvestigationAdapter;
  const policy = createInvestigationPolicy(provider), profile = provider.getReviewBudgetProfile('reviewer-session');
  const budget = { policy: policy.budget, admitted: admitInvestigationRequest(policy, { probeId: status.probeId, sourceMode: request.sourceMode }, InvestigationReplySchema),
    outputAllowanceTokens: profile.completionReserveTokens, reviewId: status.probeId, callId: status.attemptId, stage: 'probe', role: 'review', attempt: 1 };
  const assertCurrent = () => { assertOwner(); signal.throwIfAborted(); };
  const fixture = await createInvestigationProbeFixture({ registeredRepos, probeId: status.probeId, attemptId: status.attemptId,
    sourceMode: request.sourceMode, budget, signal, assertCurrent });
  try {
    let binary: string | undefined;
    for (const directory of (process.env['PATH'] ?? '').split(delimiter)) try { binary = realpathSync(join(directory, kind)); break; } catch { /* Continue PATH lookup. */ }
    if (!binary) throw Error('Selected CLI is not installed');
    const installed = inspectInstalledInvestigation(kind, binary, fixture.cwd), indexed = request.sourceMode === 'indexed-impact';
    const modelArgs = ['--model', resolution.model, ...(resolution.effort ? kind === 'claude' ? ['--effort', resolution.effort] : ['-c', `model_reasoning_effort=${resolution.effort}`] : [])];
    const args = adapter.args(InvestigationReplySchema, modelArgs, fixture.cwd, indexed), command = nativeReviewMcpConfiguration(fixture.cwd, indexed).mcpServers['insrc-scoped-review'];
    const pins = [...installed.images, ...[command.command, command.args.find(p => /\/insrc-review-bridge\.(?:ts|js)$/.test(p))!].map(path => ({ path: realpathSync(path), digest: investigationFileDigest(realpathSync(path)) }))];
    const identity: NativeAdapterIdentity = { kind, adapterVersion: adapter.version, binaryVersion: installed.version,
      binary: { path: binary, digest: investigationFileDigest(binary) }, runtimeFiles: [...new Map(pins.filter(p => p.path !== binary).map(p => [p.path, p])).values()],
      profileDigest: digestValue(profile), catalogDigest: scopedReviewCatalogDigest(indexed), launchDigest: adapter.launchDigest(args, fixture.cwd, InvestigationReplySchema) };
    const source = fileURLToPath(new URL('../../', import.meta.url));
    await pinIdentity(identity);
    const grant = issueInvestigationProbeGrant({ origin: 'installed-probe', probeId: status.probeId, attemptId: status.attemptId,
      repo: request.repo, cwd: fixture.cwd, sourceMode: request.sourceMode, identity, budget, deadlineAt: Date.now() + 300000, assertCurrent, observe,
      runtime: { requestId: request.requestId, sourceCommit: readInstalledCommit(source), sourceDigest: investigationSourceDigest(source), fixture } });
    return await provider.runInvestigationProbe({ grant, signal });
  } finally { await fixture.close(); }
}
