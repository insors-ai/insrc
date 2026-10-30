/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readClaudeSourcePolicyDiagnostics } from './claude-investigation-policy.js';
import { collectClaudeProbeObservations } from './claude-investigation-probe.js';
import { readClaudeInvestigationEvents } from './claude-investigation-events.js';
import { MANAGED_POLICY_PATHS } from './claude-investigation-diagnostics.js';
import { isClaudeCapabilityAdapter, reviewProtocolSchemaDigestFor, reviewModelProtocolFor, CAPABILITY_BOUNDARY, ISOLATION_CHECKS, isolationBasisFor } from '../../shared/review-isolation-evidence.js';
import { scopedReviewToolCatalog } from '../../shared/review-investigation-catalog.js';
import { probeCandidateSchema } from '../../shared/review-investigation-probe.js';
import type { InvestigationProbeExport, InvestigationProbeObservation } from '../../shared/review-investigation-probe.js';
import type { NativeAdapterIdentity } from './investigation-session.js';
import type { ProcessGroupResult } from '../../shared/process-group.js';
import { digestValue } from '../../workflow/code-review/investigation/identity.js';

const snapshot = z.array(z.object({path:z.enum(MANAGED_POLICY_PATHS),state:z.enum(['absent','present','unknown'])}).strict()).length(3);
export const sourcePolicyHostSchema = z.object({version:z.literal(1),probeId:z.uuid(),attemptId:z.uuid(),phase:z.literal('restricted'),
  before:snapshot,after:snapshot,processStarted:z.boolean(),cancellationRequested:z.boolean(),externallyCancelled:z.boolean()}).strict();
export type SourcePolicyHost = z.infer<typeof sourcePolicyHostSchema>;
export interface ClaudeQualificationInputs {
  readonly identity: NativeAdapterIdentity;
  readonly sourceMode: 'source-only' | 'indexed-impact';
  readonly cwd: string;
  readonly endedAt: number;
  readonly raw: ProcessGroupResult;
  readonly diagnostics: string;
  readonly host: SourcePolicyHost;
  readonly broker: {readonly positiveBefore:boolean;readonly positiveAfter:boolean;readonly crossRunRejected:number;readonly approvalRejected:boolean};
  readonly canaries: NonNullable<InvestigationProbeExport['canaries']>;
  readonly files: NonNullable<InvestigationProbeExport['evidenceFiles']>;
}

/** Deterministic reconstruction from host-retained raw evidence. No authority is
 * issued here; export replays this and installed canonical approval still gates
 * qualification. This concerns agent capabilities, never OS sandboxing.
 */
export function reconstructClaudeQualification(input: ClaudeQualificationInputs) {
  const {identity,raw,host,broker,canaries,files,cwd} = input;
  if (!isClaudeCapabilityAdapter(identity.adapterVersion) || identity.kind !== 'claude' ||
    !host.processStarted || !host.cancellationRequested || host.externallyCancelled ||
    raw.aborted !== true || raw.exitSignal !== 'SIGKILL' || raw.spawnError || raw.timedOut || raw.stalled || raw.outputLimitExceeded || raw.observerFailed) return;
  if (!readClaudeSourcePolicyDiagnostics(input.diagnostics,identity.binaryVersion)) return;
  for (const values of [host.before,host.after]) if (values.length!==MANAGED_POLICY_PATHS.length ||
    MANAGED_POLICY_PATHS.some(path=>values.filter(v=>v.path===path&&v.state==='absent').length!==1)) return;
  if (!broker.positiveBefore || !broker.positiveAfter || broker.crossRunRejected!==6 || !broker.approvalRejected ||
    canaries.checks.length!==4 || canaries.checks.some(c=>!c.controlObserved||c.restrictedObserved)) return;
  const native = collectClaudeProbeObservations(raw,{attemptId:host.attemptId,launchDigest:identity.launchDigest,effectiveDigest:'0'.repeat(64),
    binaryVersion:identity.binaryVersion,sourceMode:input.sourceMode,adapterVersion:identity.adapterVersion,schemaDigest:reviewProtocolSchemaDigestFor(identity.adapterVersion)});
  if (native.some(o=>o.verdict==='observed-allowed') || !['builtin-tools','shell','network','raw-filesystem'].every(check=>native.some(o=>o.check===check&&o.verdict==='observed-denied'))) return;
  const events=readClaudeInvestigationEvents(raw.stdout,true),init=events.find(e=>e['type']==='system'&&e['subtype']==='init');
  if (!init || init['permissionMode']!=='dontAsk') return;
  const journal=files.find(f=>f.kind==='checkpoint-journal'),debug=files.find(f=>f.kind==='native-diagnostic'),hostFile=files.find(f=>f.kind==='source-policy');
  if (!journal||!debug||!hostFile) return;
  const rows=readFileSync(journal.path,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l) as {probeId?:string;attemptId?:string;value?:{kind?:string;receipt?:{sequence?:number}}});
  if (rows.some(r=>r.probeId!==host.probeId||r.attemptId!==host.attemptId||r.value?.kind==='canary-hit')) return;
  const sequences=rows.filter(r=>r.value?.kind==='block-ack').map(r=>r.value?.receipt?.sequence);
  if (sequences.length<2||sequences.some((n,i)=>n!==i+1)) return;
  const configFiles=files.filter(f=>f.kind==='configuration').map(f=>({path:f.path,digest:f.digest}));
  if (configFiles.length!==2 || !['investigation-settings.json','investigation-mcp.json'].every(name=>configFiles.some(f=>f.path===join(cwd,name)))) return;
  const allDigests=files.map(f=>f.digest).filter((v,i,a)=>a.indexOf(v)===i);
  const effective={cwd,configFiles,builtinTools:[],inheritedConfigSources:[],mcpServers:['insrc-scoped-review'],plugins:[],hooks:[],repositoryInstructions:[],credentialCopies:[],auth:'existing-cli-oauth' as const,
    catalog:JSON.parse(JSON.stringify(scopedReviewToolCatalog(input.sourceMode==='indexed-impact',reviewModelProtocolFor(identity.adapterVersion)))) as unknown[],boundary:CAPABILITY_BOUNDARY,
    protocolTools:[{name:'StructuredOutput' as const,schemaDigest:reviewProtocolSchemaDigestFor(identity.adapterVersion)}],
    evidenceBasis:ISOLATION_CHECKS.map(check=>({check,basis:isolationBasisFor(check),policyVersion:1 as const,rawDigests:allDigests}))};
  const effectiveDigest=digestValue(effective);
  const candidate=probeCandidateSchema.parse({version:1,identity,effective,validUntil:input.endedAt+86400000,trace:{effectiveDigest,
    events:[...ISOLATION_CHECKS.filter(check=>check!=='durable-progress'&&check!=='cancellation-exit').map(capability=>({kind:'denied',capability})),
      ...sequences.map(sequence=>({kind:'block-ack',sequence})),{kind:'cancel-requested'},{kind:'process-exited',cancelled:true}]}});
  const observations:InvestigationProbeObservation[]=ISOLATION_CHECKS.map(check=>({check,attemptId:host.attemptId,launchDigest:identity.launchDigest,effectiveDigest,
    provenance:'observer-attestation',at:input.endedAt,observationDigest:check==='cross-run'||check==='approval'?digestValue(broker):digestValue({check,basis:candidate.effective.evidenceBasis!.find(b=>b.check===check)}),
    verdict:check==='durable-progress'||check==='cancellation-exit'?'observed-allowed':'observed-denied',
    detail:`Verified ${CAPABILITY_BOUNDARY}: ${isolationBasisFor(check)}; exact native inventory, bound host policy and active controls; no OS sandbox claim` }));
  return {candidate,observations};
}
