/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash,randomUUID } from 'node:crypto';
import { constants,openSync,closeSync,fstatSync,readSync,lstatSync,realpathSync } from 'node:fs';
import { relative,isAbsolute } from 'node:path';
import type { QualifiedInvestigationSessionBinding } from '../../shared/types.js';
import type { InvestigationTools,InvestigationTurnV1,InvestigationState } from '../../workflow/code-review/investigation/continuation-types.js';
import { digestValue,snapshotValue,freezeValue } from '../../workflow/code-review/investigation/identity.js';
import { scopedReviewCatalogDigest } from '../../shared/review-investigation-catalog.js';

export class InvestigationQualificationError extends Error {
 constructor(message:string){super(message);this.name='InvestigationQualificationError';}
}
function refuse(message:string):never{throw new InvestigationQualificationError(message);}
const inside=(root:string,path:string)=>{const rel=relative(root,path);return rel===''||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../'));};
export interface IsolationFile {readonly path:string;readonly digest:string;}
export interface NativeAdapterIdentity {
 readonly kind:'claude'|'codex';readonly adapterVersion:string;readonly binaryVersion:string;
 readonly binary:IsolationFile;readonly runtimeFiles:readonly IsolationFile[];
 readonly profileDigest:string;readonly catalogDigest:string;readonly launchDigest:string;
}
export interface EffectiveInvestigationIsolation {
 readonly cwd:string;readonly configFiles:readonly IsolationFile[];
 readonly builtinTools:readonly string[];readonly inheritedConfigSources:readonly string[];
 readonly mcpServers:readonly string[];readonly plugins:readonly string[];readonly hooks:readonly string[];
 readonly repositoryInstructions:readonly string[];readonly credentialCopies:readonly string[];
 readonly auth:'existing-cli-oauth';readonly catalog:readonly unknown[];
}
export const ISOLATION_DENIAL_PROBES=Object.freeze(['raw-filesystem','shell','network','approval','cross-run','builtin-tools','user-mcp','project-mcp','plugins','hooks','repository-instructions']);
export interface IsolationProbeTrace {
 readonly effectiveDigest:string;
 readonly events:readonly ({readonly kind:'denied';readonly capability:string}|{readonly kind:'block-ack';readonly sequence:number}|{readonly kind:'cancel-requested'}|{readonly kind:'process-exited';readonly cancelled:true})[];
}
export interface NativeIsolationEvidence {
 readonly version:1;readonly identity:NativeAdapterIdentity;readonly effective:EffectiveInvestigationIsolation;
 readonly trace:IsolationProbeTrace;readonly validUntil:number;
}
/** Supplied only by daemon qualification storage/probing, never by a provider or wire request.
 * An installed authority must independently authenticate the probe evidence; fixture authority cannot upgrade it. */
export interface NativeIsolationEvidenceAuthority {
 readonly origin:'installed-probe'|'scripted-fixture';
 readonly read:(reference:string)=>Promise<NativeIsolationEvidence>;
 readonly verifyInstalled?:((reference:string,digest:string)=>Promise<void>)|undefined;
}
export interface NativeInvestigationQualification {
 readonly version:1;readonly origin:NativeIsolationEvidenceAuthority['origin'];readonly reference:string;readonly evidenceDigest:string;
 readonly identity:NativeAdapterIdentity;readonly effective:EffectiveInvestigationIsolation;readonly validUntil:number;
}
const qualifications=new WeakMap<NativeInvestigationQualification,{authority:NativeIsolationEvidenceAuthority;repo:string;indexed:boolean}>();
export interface NativeInvestigationRuntime {
 readonly processEpoch:string;readonly assertProcessOwner:()=>void;readonly assertCurrent:()=>void;
 readonly state:()=>InvestigationState;
 readonly navigation?:{readonly sourceRefs:readonly string[];readonly testRefs:readonly string[];readonly changedEntityRefs:readonly string[];
  readonly changedEntities?:readonly unknown[]|undefined;readonly index?:unknown}|undefined;
}
const bindings=new WeakMap<QualifiedInvestigationSessionBinding,{qualification:NativeInvestigationQualification;turn:InvestigationTurnV1;repo:string;runtime:NativeInvestigationRuntime|undefined}>();
const invocations=new WeakMap<QualifiedInvestigationSessionBinding,Promise<unknown>>();
export function trackInvestigationInvocation<T>(binding:QualifiedInvestigationSessionBinding,invoke:()=>Promise<T>):Promise<T>{
 if(!bindings.has(binding))return Promise.reject(new InvestigationQualificationError('Untrusted investigation session binding'));
 if(invocations.has(binding))return Promise.reject(new InvestigationQualificationError('Investigation binding already has an invocation'));
 const work=Promise.resolve().then(invoke);invocations.set(binding,work);
 void work.then(()=>{if(invocations.get(binding)===work)invocations.delete(binding);},()=>{if(invocations.get(binding)===work)invocations.delete(binding);});return work;
}
/** Host cancellation must await actual CLI/bridge teardown, not only S3's aborted wait. */
export async function drainInvestigationInvocation(binding:QualifiedInvestigationSessionBinding):Promise<void>{try{await invocations.get(binding);}catch{/* The owning turn reports the invocation error. */}}
/** Hash the current real installed bytes without following a replacement final symlink or dumping content. */
export function investigationFileDigest(path:string):string{
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{
  const stat=fstatSync(fd);if(!stat.isFile()||stat.size>512*1024*1024)refuse('Unsupported qualification file');
  const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let size:number;
  while((size=readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,size));return hash.digest('hex');
 }finally{closeSync(fd);}
}
function checkFiles(q:Pick<NativeInvestigationQualification,'identity'|'effective'>,repo:string){
 const cwd=realpathSync(q.effective.cwd),stat=lstatSync(q.effective.cwd);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||inside(repo,cwd)||inside(cwd,repo))refuse('Reviewer working directory is not isolated from the repository');
 for(const f of [q.identity.binary,...q.identity.runtimeFiles,...q.effective.configFiles]){
  if(realpathSync(f.path)!==f.path||!/^[a-f0-9]{64}$/.test(f.digest)||investigationFileDigest(f.path)!==f.digest)refuse('Installed binary/runtime/configuration changed');
 }
 for(const f of q.effective.configFiles){const stat=lstatSync(f.path);if(!inside(cwd,f.path)||(stat.mode&0o077)!==0)refuse('Configuration is not daemon-private');}
}
/** Validate full effective inventory and independently captured negative/progress/cancel probe trace.
 * Read-only sandbox declarations and CLI/provider boolean claims cannot qualify an adapter. */
export async function qualifyInvestigationAdapter(reference:string,expected:NativeAdapterIdentity,repoPath:string,indexed:boolean,
 authority:NativeIsolationEvidenceAuthority,supportedAdapterVersions:readonly string[],now=Date.now()):Promise<NativeInvestigationQualification>{
 const evidence=snapshotValue(await authority.read(reference)),identity=snapshotValue(expected),repo=realpathSync(repoPath),effective=evidence.effective;
 if(evidence.version!==1||!supportedAdapterVersions.includes(identity.adapterVersion)||!identity.binaryVersion.trim()||digestValue(evidence.identity)!==digestValue(identity))refuse('Unsupported or unproven adapter/binary/profile identity');
 if(![identity.profileDigest,identity.catalogDigest,identity.launchDigest].every(d=>/^[a-f0-9]{64}$/.test(d))||identity.catalogDigest!==scopedReviewCatalogDigest(indexed)
  ||digestValue(effective.catalog)!==scopedReviewCatalogDigest(indexed))refuse('Effective scoped tool catalogue differs');
 if([effective.builtinTools,effective.inheritedConfigSources,effective.plugins,effective.hooks,effective.repositoryInstructions,effective.credentialCopies].some(values=>!Array.isArray(values)||values.length)
  ||digestValue(effective.mcpServers)!==digestValue(['insrc-scoped-review'])||effective.auth!=='existing-cli-oauth'||!effective.configFiles.length)refuse('Inherited configuration/tools or replaced OAuth authority');
 if(!Number.isSafeInteger(evidence.validUntil)||evidence.validUntil<=now||evidence.validUntil>now+86400000)refuse('Isolation evidence expired or validity unbounded');
 const trace=evidence.trace;if(trace.effectiveDigest!==digestValue(effective))refuse('Probe trace belongs to different effective configuration');
 for(const capability of ISOLATION_DENIAL_PROBES)if(!trace.events.some(e=>e.kind==='denied'&&e.capability===capability))refuse(`Missing independent isolation probe: ${capability}`);
 const ack=trace.events.flatMap(e=>e.kind==='block-ack'?[e.sequence]:[]),cancel=trace.events.findIndex(e=>e.kind==='cancel-requested'),exit=trace.events.findIndex(e=>e.kind==='process-exited'&&e.cancelled===true);
 if(ack.length<2||ack.some((n,i)=>!Number.isSafeInteger(n)||n!==i+1)||cancel<0||exit<=cancel)refuse('In-session progress or cancellation not proven');
 const evidenceDigest=digestValue(evidence);if(authority.origin==='installed-probe'){
  if(!authority.verifyInstalled)refuse('Installed evidence has no independent verification authority');await authority.verifyInstalled(reference,evidenceDigest);
 }else if(authority.origin!=='scripted-fixture')refuse('Unknown qualification evidence origin');
 const q=freezeValue({version:1 as const,origin:authority.origin,reference,evidenceDigest,identity,effective,validUntil:evidence.validUntil});checkFiles(q,repo);qualifications.set(q,{authority,repo,indexed});return q;
}
export function createQualifiedInvestigationBinding(q:NativeInvestigationQualification,turn:InvestigationTurnV1,tools:InvestigationTools,runtime?:NativeInvestigationRuntime):QualifiedInvestigationSessionBinding{
 const trusted=qualifications.get(q);if(!trusted)refuse('Qualification was not issued by the daemon verifier');
 if(q.validUntil<=Date.now())refuse('Qualification expired');checkFiles(q,trusted.repo);
 if((tools.impact.mode==='indexed-impact')!==trusted.indexed)refuse('Binding source mode differs from qualification');
 const scope=tools.seed['scope'] as {subjectDigest?:unknown}|undefined;
 if(scope?.subjectDigest!==turn.subjectDigest||digestValue(tools.execution.budget.policy.profile)!==q.identity.profileDigest)refuse('Binding subject/provider profile differs from qualified turn');
 const binding=Object.freeze({version:1 as const,bindingId:randomUUID(),adapterVersion:q.identity.adapterVersion,profileDigest:q.identity.profileDigest,catalogDigest:q.identity.catalogDigest,
  tools:Object.freeze({...tools,impact:Object.freeze({...tools.impact}),seed:freezeValue(snapshotValue(tools.seed))}),qualificationRef:q.reference});
 if(runtime){runtime.assertProcessOwner();runtime.assertCurrent();if(runtime.state().ledger.runId!==turn.runId||runtime.state().ledger.subjectDigest!==turn.subjectDigest)refuse('Native runtime belongs to another run');}
 bindings.set(binding,{qualification:q,turn:freezeValue(snapshotValue(turn)),repo:trusted.repo,runtime});return binding;
}
/** Metadata lookup is not invocation authority; inspectQualifiedInvestigationBinding still verifies installed proof/bytes. */
export function investigationBindingIdentity(binding:QualifiedInvestigationSessionBinding):NativeAdapterIdentity{
 const trusted=bindings.get(binding);if(!trusted)refuse('Untrusted investigation session binding');return trusted.qualification.identity;
}
export function investigationBindingDirectory(binding:QualifiedInvestigationSessionBinding):string{
 const trusted=bindings.get(binding);if(!trusted)refuse('Untrusted investigation session binding');return trusted.qualification.effective.cwd;
}
/** Default is production: serialized lookalikes and scripted evidence both refuse before any CLI launch. */
export async function inspectQualifiedInvestigationBinding(binding:QualifiedInvestigationSessionBinding,identity:NativeAdapterIdentity,requireInstalled=true){
 const trusted=bindings.get(binding);if(!trusted)refuse('Untrusted investigation session binding');const q=trusted.qualification,record=qualifications.get(q)!;
 if(requireInstalled&&q.origin!=='installed-probe')refuse('Scripted fixtures do not certify an installed binary');
 if(q.validUntil<=Date.now()||digestValue(q.identity)!==digestValue(identity))refuse('Qualification expired or native invocation identity changed');
 if(q.origin==='installed-probe'){if(!record.authority.verifyInstalled)refuse('Installed authority unavailable');await record.authority.verifyInstalled(q.reference,q.evidenceDigest);}
 checkFiles(q,trusted.repo);return {qualification:q,turn:trusted.turn,repo:trusted.repo,runtime:trusted.runtime};
}
