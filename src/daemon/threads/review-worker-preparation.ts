/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { getLogger } from '../../shared/logger.js';
import type { MessagePort } from 'node:worker_threads';
import type { ReviewRuntime, PreparationAccess } from '../../shared/review-preparation.js';
import type { ReviewPreparationLimits } from '../../config/review.js';
import { reviewJsonLimit } from '../../config/review.js';
import type { ReviewBootstrapInput } from './review-worker-contract.js';
import { reviewWorkerCheckpoint } from './review-worker-contract.js';
import { ReviewPreparationClient } from './review-preparation-client.js';
import { PreparationHistoryStore } from '../../workflow/review/preparation-history-store.js';
import type { PreparationHistoryHandoff } from '../../workflow/review/preparation-history-store.js';
import { withPreparationPersistence } from '../../workflow/review/preparation-persistence.js';
import { loadPreparationCheckpoint } from '../../workflow/review/preparation-checkpoint.js';
import { preparationSubmission, upgradePreparationHistory } from '../../workflow/review/preparation-migration.js';
import { preparationSemanticHistory } from '../../workflow/review/preparation-semantic-history.js';
import { CodePreparation } from '../../workflow/review/code-preparation.js';
import { DesignPreparation } from '../../workflow/review/design-preparation.js';
import { preparationDigest } from '../../workflow/review/prepared-context.js';
import type { ReadyContextReceipt } from '../../workflow/review/prepared-context.js';
import { PreparedViewReader } from '../../workflow/review/prepared-views.js';
import { ReviewMemoryBudget } from '../../workflow/review/preparation-memory.js';
import { HistoryBindingSession, readPreparationHistoryBinding, preparationHistorySnapshot } from '../../workflow/review/history-binding.js';
import type { PreparationHistory, HistoryValidation } from '../../workflow/review/history-binding.js';
import { PreparationProgress } from '../../workflow/review/preparation-progress.js';
import type { PreparationObservation } from '../../workflow/review/preparation-observation.js';
import { HistoryEvidenceStore } from '../../workflow/review/history-evidence.js';
import { codeHistoryFeedback, designHistoryFeedback } from '../../workflow/review/history-feedback.js';
import { ReviewSourceSession } from '../../workflow/review/source-session.js';
import type { ReviewSources, BatchReviewSources } from '../../workflow/code-review/task-review/sources.js';
import type { PreparedReviewPacket } from '../../workflow/code-review/task-review/packet.js';
import type { TaskReviewDeps } from '../../workflow/code-review/task-review/coordinator.js';
import type { DesignCoordinatorDeps } from '../../workflow/review/design-review/coordinator.js';
import { submission } from './review-preparation-input.js';
import { writeReviewBytes } from '../../workflow/code-review/task-review/checkpoint.js';
import { readTaskReviewHistory } from '../../workflow/code-review/task-review/history.js';
import { codeReviewPreservationDigest } from '../../workflow/code-review/task-review/record.js';
import { validatePermanentDesignReview } from '../../workflow/review/design-review/history.js';
import { lifecycleFor } from '../lifecycle-registry.js';
import type { PublicationProof } from '../../workflow/review/publication-proof.js';

/** Private bootstrap payload; public review input never carries operational authority. */
export interface ReviewPreparationBootstrap {
 readonly port: MessagePort;
 readonly runtime: ReviewRuntime;
 readonly limits: ReviewPreparationLimits;
 readonly handoff?: PreparationHistoryHandoff | undefined;
}

/** The production worker assembly. Families still own semantic validation;
 * this single owner owns format-3 history, source reuse and main acknowledgment. */
export class ReviewWorkerPreparation {
 readonly client: ReviewPreparationClient;
 readonly history: PreparationHistoryStore;
 onObservation:((value:PreparationObservation)=>void)|undefined;
 private readonly progress:PreparationProgress;
 private readonly memory:ReviewMemoryBudget;
 private active = false;
 private terminal = false;
 private access: PreparationAccess | undefined;
 private receipt: ReadyContextReceipt | undefined;
 private code: CodePreparation | undefined;
 private design: DesignPreparation | undefined;
 private extra: ReviewSourceSession | undefined;
 private evidence: HistoryEvidenceStore | undefined;
 private binding: HistoryBindingSession | undefined;
 private acceptedPrefix:PreparationHistory|undefined;
 private readonly packets = new Map<number, PreparedReviewPacket>();
 private constructor(readonly input: ReviewBootstrapInput, readonly bootstrap: ReviewPreparationBootstrap, private readonly rawSources: BatchReviewSources, history: PreparationHistoryStore, client: ReviewPreparationClient) {
  this.history = history; this.client = client;
  this.memory=new ReviewMemoryBudget(bootstrap.limits.memoryMaxBytes);
  this.progress=new PreparationProgress(value=>{const at=new Date().toISOString();return this.client.progress({progress:{...this.bootstrap.runtime.progress,completedUnits:this.binding?.latest().completedUnits??0,observedAt:at,lastMeaningfulActivityAt:at},preparation:value});});
 }
 static async open(input: ReviewBootstrapInput, bootstrap: ReviewPreparationBootstrap, sources: BatchReviewSources): Promise<ReviewWorkerPreparation> {
  const client = new ReviewPreparationClient(bootstrap.port), key = input.key;
  const loaded = await loadPreparationCheckpoint(key);
  if (loaded?.format === 'historical') {
   const last = loaded.checkpoint.attempts.at(-1)!, attempt = 'header' in last ? last.header.attempt : last.number;
   const submitted = key.family === 'code' ? input.submitted : submission(input);
   const candidate = upgradePreparationHistory(loaded.checkpoint, key, bootstrap.runtime,
    input.attempt === attempt + 1 ? { attempt: input.attempt, submitted } : undefined);
   await writeReviewBytes(reviewWorkerCheckpoint(key), JSON.stringify(candidate) + '\n', reviewJsonLimit());
  }
  let owner!: ReviewWorkerPreparation;
  const history = await PreparationHistoryStore.open(key, { runtimeId: bootstrap.runtime.runtimeId, inputDigest: bootstrap.runtime.checkpointBinding.inputDigest }, {
   commit: async (next, previous) => {try{return await owner.commit(next, previous);}catch(error){getLogger('review-preparation').error({err:error,reviewId:key.reviewId},'Semantic boundary stopped; durable proof retained');throw error;}},
   observe: async update => {
    if (!owner.active || owner.terminal) return;
    const old = bootstrap.runtime.progress;
    const completedUnits = owner.binding?.latest().completedUnits ?? 0;
    const observedTotal = update.family === 'code' ? update.progress.task?.total ?? null : update.progress.totalChunks;
    await client.progress({ progress: { ...old, completedUnits,
     totalUnits: observedTotal === null ? null : Math.max(observedTotal, completedUnits),
     observedAt: update.progress.observedAt ?? old.observedAt,
     lastMeaningfulActivityAt: 'lastMeaningfulActivityAt' in update.progress ? update.progress.lastMeaningfulActivityAt : null } });
    owner.onObservation?.(update);
   },
  }, bootstrap.handoff);
  owner = new ReviewWorkerPreparation(input, bootstrap, sources, history, client);
  const prefix=await history.canonical();
  if(prefix?.context){
   const binding=await readPreparationHistoryBinding(key,prefix.context.historyBindingDigest);
   if(preparationDigest(preparationHistorySnapshot(prefix))!==binding.historyPrefixDigest){
    const {parseDesignRequest}=await import('../../workflow/review/design-review/contracts.js');
    const {requestSignature}=await import('../../workflow/review/design-review/request-signature.js');
    if(key.family!=='design')throw new Error('Unbound accepted history changed');
    const request=parseDesignRequest(input.submitted);if(request.phase!=='recover')throw new Error('Explicit recovery action required');
    const attempt=prefix.attempts.find(a=>!('header'in a)&&a.number===request.attempt);
    if(!attempt||'header'in attempt)throw new Error('Recovery source missing');
    const action=attempt.actions?.find(a=>a.actionId===request.actionId);
    if(!action||action.validation!=='unverified'||action.signature!==requestSignature(request))throw new Error('Unbound recovery action differs from explicit request');
    attempt.actions=attempt.actions!.filter(a=>a.actionId!==request.actionId);if(!attempt.actions.length)delete attempt.actions;
    if(preparationDigest(preparationHistorySnapshot(prefix))!==binding.historyPrefixDigest)throw new Error('Accepted history changed beyond its exact pending recovery action');
   }
   owner.acceptedPrefix=prefix;
  }
  return owner;
 }
 run<T>(work: () => T): T { return withPreparationPersistence(this.history, work); }
 async activate(): Promise<void> {
  // Even a semantically unchanged warm handoff must physically bind the new runtime.
  const saved = await this.history.read(); if (saved) await this.history.write(saved);
  await this.client.activate(); this.active = true;
 }
 private async borrow(): Promise<void> {
  if (this.receipt) return;
  const identity = await this.client.currentIdentity(); if (!identity) return;
  const borrowed = await this.client.borrow(identity); this.access = borrowed.access; this.receipt = borrowed.receipt;
  this.evidence = await HistoryEvidenceStore.open(this.receipt, this.client, this.bootstrap.limits, this.authorize, this.invalidate, this.receipt.manifestDigest, this.memory);
  const cp = await this.history.canonical();
  if (cp?.context?.generationId === this.receipt.generationId) {
   const node=await readPreparationHistoryBinding(this.input.key,cp.context.historyBindingDigest);
   await this.evidence.restore(node.evidenceManifestDigest);
  }
 }
 private readonly authorize = async (): Promise<ReadyContextReceipt> => {
  if (!this.access) throw new Error('Private preparation borrow required'); return this.client.resolve(this.access);
 };
 private readonly invalidate = async (error: unknown): Promise<void> => { if (this.access) await this.client.invalidate(this.access); throw error; };
 private async reader(): Promise<PreparedViewReader> {
  return PreparedViewReader.open(await this.authorize(), this.bootstrap.limits, this.memory, async () => { await this.authorize(); }, this.invalidate);
 }
 private async query(method: keyof ReviewSources, args: readonly unknown[]): Promise<unknown> {
  if (this.evidence && await this.evidence.contains(method, args)) return this.evidence.query(method, args);
  this.extra ??= await ReviewSourceSession.create(this.input.key, this.rawSources, this.bootstrap.limits, this.client, this.memory);
  switch (method) {
   case 'commit': return this.extra.commit(args[0] as string);
   case 'file': return this.extra.file(args[0] as string, args[1] as string);
   case 'isAncestor': return this.extra.isAncestor(args[0] as string, args[1] as string);
   case 'changedRanges': return this.extra.changedRanges(args[0] as string, args[1] as string | null, args[2] as readonly string[]);
   case 'pathChanges': return this.extra.pathChanges(args[0] as string, args[1] as string, args[2] as string);
  }
 }
 readonly sources: ReviewSources = {
  commit: oid => this.query('commit', [oid]) as ReturnType<ReviewSources['commit']>,
  file: (oid, path) => this.query('file', [oid, path]) as ReturnType<ReviewSources['file']>,
  isAncestor: (a, b) => this.query('isAncestor', [a, b]) as ReturnType<ReviewSources['isAncestor']>,
  changedRanges: (oid, parent, paths) => this.query('changedRanges', [oid, parent, paths]) as ReturnType<ReviewSources['changedRanges']>,
  pathChanges: (a, b, path) => this.query('pathChanges', [a, b, path]) as ReturnType<ReviewSources['pathChanges']>,
 };
 private async ensureCode(): Promise<CodePreparation> {
  if (!this.code) {
   await this.borrow();
   this.code = this.receipt ? await CodePreparation.reuse(this.input.key, await this.reader(), this.sources, this.bootstrap.limits, this.client)
    : await CodePreparation.create(this.input.key, this.rawSources, this.bootstrap.limits, this.client, this.memory);
   this.code.observeSources(metrics=>this.progress.report('fetch_sources',metrics));
  }
  return this.code;
 }
 readonly prepareCode: NonNullable<TaskReviewDeps['prepare']> = async (...args) => {
  await this.progress.report('validate_input');
  const preparation = await this.ensureCode(), review = await preparation.workerPrepare(...args);
  if (!this.receipt) {
   await this.progress.report('commit_context',preparation.sourceMetrics());
   const receipt = await preparation.seal(review); await this.client.qualify(preparation.qualificationIdentity(), receipt);
   const borrowed = await this.client.borrow(preparation.qualificationIdentity()); this.access = borrowed.access; this.receipt = borrowed.receipt;
   await preparation.close();
   this.evidence = await HistoryEvidenceStore.open(receipt, this.client, this.bootstrap.limits, this.authorize, this.invalidate, receipt.manifestDigest, this.memory);
   this.code = await CodePreparation.reuse(this.input.key, await this.reader(), this.sources, this.bootstrap.limits, this.client);
  }
  for (const attempt of review.checkpoint.attempts) this.packets.set(attempt.header.attempt,
   await this.code!.publicationPacket(attempt.submitted, this.sources, true, undefined, attempt.header.derived));
  return review;
 };
 async initializeDesign(prepareSubject?:DesignCoordinatorDeps['prepare']): Promise<void> {
  await this.borrow();
  const cp=await this.history.canonical();
  const submitted=cp?preparationSubmission(cp,this.input.key) as import('../../workflow/review/design-review/contracts.js').DesignAdmissionAttempt['submitted']:submission(this.input);
  const {publishedDesignSource}=await import('../../workflow/review/design-review/publication.js');
  const owned=this.input.maintenance&&cp&&!('storyId'in cp)?await publishedDesignSource(cp):undefined;
  const last=cp?.attempts.at(-1);
  if(this.receipt)this.design=await DesignPreparation.reuse(this.input.key,this.input.attempt,await this.reader(),this.bootstrap.limits,this.client,owned);
  else if(owned&&cp&&'subject'in cp&&cp.subject&&last&&'baseline'in last){
   this.design=DesignPreparation.published(this.input.key,this.input.attempt,{subject:cp.subject,baseline:last.baseline,inventory:last.inventory},submitted,this.bootstrap.limits,this.client,owned);
  }else{
   this.design=new DesignPreparation(this.input.key,this.input.attempt,this.bootstrap.limits,this.client,submitted,prepareSubject,undefined,this.memory);
   // A maintenance recovery can append its durable action before the
   // coordinator asks for an assignment. Qualify the current subject first so
   // that commit cannot seal an empty preparation.
   if(this.input.maintenance&&cp&&'subject'in cp&&cp.subject)this.design.prepare(cp.project,cp.subject.canonicalPath);
  }
 }
 readonly prepareDesign: NonNullable<DesignCoordinatorDeps['prepare']> = (...args) => {
  if (!this.design) throw new Error('Design preparation phase not initialized'); return this.design.prepare(...args);
 };
 readonly assertDesign: NonNullable<DesignCoordinatorDeps['assertSubject']> = (...args) => {
  if (!this.design) throw new Error('Design preparation phase not initialized'); return this.design.assertSubject(...args);
 };
 private async verifyPublication(cp: PreparationHistory): Promise<HistoryValidation> {
  if ('storyId' in cp) {
   if (!this.input.epicHash) throw new Error('Code publication epic missing');
   const story = cp.storyId.replace(/^STORY-[a-f0-9]{16}-/, '');
   const body = await readTaskReviewHistory(cp.project, this.input.epicHash, story);
   return { publication: { artifactId: `CR-${this.input.epicHash}-${story}`, preservationDigest: codeReviewPreservationDigest(body) } };
  }
  if (!cp.artifactId) throw new Error('Design publication subject missing');
  const artifact = await lifecycleFor(cp.project).store.readWithHistory(cp.artifactId);
  const entry = [...artifact.changeLog].reverse().find(e => {
   const data = e.outcome?.data as { kind?: unknown; reviewId?: unknown; applicableAttempt?: unknown } | undefined;
   return data?.kind === 'design-chunk-review' && data.reviewId === cp.reviewId && data.applicableAttempt === this.input.attempt;
  });
  if (!entry) throw new Error('Permanent design publication missing');
  const record = validatePermanentDesignReview(entry.outcome!.data, { project: cp.project, artifactId: cp.artifactId });
  return { publication: { artifactId: cp.artifactId, preservationDigest: record.preservationDigest } };
 }
 private async commit(next: PreparationHistory, previous: PreparationHistory | undefined): Promise<PreparationHistory> {
  const last = next.attempts.at(-1)!, qualified = 'review-response' in last || 'baseline' in last;
  if (!qualified || !this.active) {
   await writeReviewBytes(this.history.path, JSON.stringify(next) + '\n', reviewJsonLimit()); return next;
  }
  if (this.input.key.family === 'design' && !this.receipt) {
   if (!this.design) throw new Error('Design preparation not initialized');
   const receipt = await this.design.seal(); await this.client.qualify(this.design.qualificationIdentity(), receipt);
   const borrowed = await this.client.borrow(this.design.qualificationIdentity()); this.receipt = borrowed.receipt; this.access = borrowed.access;
  }
  if (!this.receipt || !this.access) throw new Error('Qualified source preparation required before accepting feedback');
  const feedback = 'storyId' in next ? codeHistoryFeedback(this.packets, this.sources, cp => this.verifyPublication(cp)) : designHistoryFeedback(cp => this.verifyPublication(cp));
  const validate = async (cp: PreparationHistory, prior?: PreparationHistory): Promise<HistoryValidation> => {
   const result = await feedback(cp, prior), evidence = [...(result.evidence ?? [])]; let bytes = 0;
   if (this.extra) for (const item of await this.extra.evidence()) {
    bytes += item.bytes; if (bytes > this.bootstrap.limits.memoryMaxBytes) throw new Error('Feedback evidence exceeds memory capacity');
    evidence.push({ queryDigest: item.queryDigest, bytes: await this.extra.readEvidence(item.queryDigest) });
   }
   return { ...result, evidence };
  };
  if (!this.binding) {
   await writeReviewBytes(this.history.path, JSON.stringify(next) + '\n', reviewJsonLimit());
   const deps = { authorize: this.authorize, validate, capacity: this.client, limits: this.bootstrap.limits, memory:this.memory, invalidateSource: this.invalidate };
   this.binding = next.context ? await HistoryBindingSession.requalify(this.receipt, next, deps, this.acceptedPrefix??(previous?.context ? previous : undefined))
    : await HistoryBindingSession.open(this.receipt, next, deps);
  } else await this.binding.accept(next);
  const proof = this.binding.latest();
  if (this.input.key.family === 'code') {
   this.evidence ??= await HistoryEvidenceStore.open(this.receipt, this.client, this.bootstrap.limits, this.authorize, this.invalidate, this.receipt.manifestDigest, this.memory);
   await this.evidence.restore(proof.binding.evidenceManifestDigest);
  }
  // Main retains every accepted phase allocation. Transient query stages must
  // be closed first; an acknowledgment must never turn them into leaked owners.
  await this.extra?.close(); this.extra = undefined;
  await this.client.acceptHistory(this.access, proof);
  const cp = await loadPreparationCheckpoint(this.input.key);
  if (cp?.format !== 'current') throw new Error('Committed format-3 history missing'); return cp.checkpoint;
 }
 async preparePublication():Promise<void> {
  if (!this.binding) {
   // Cold publication still runs the family qualification/feedback checks.
   if (this.input.key.family === 'code') {
    const saved = await this.history.read(); if (!saved || !('storyId' in saved)) throw new Error('Code history missing');
    const last = saved.attempts.at(-1)!;
    await this.prepareCode(saved.project, saved.reviewId, last.header.attempt, last.submitted, this.input.reviewer, this.sources, { epicHash: this.input.epicHash, operation:'resume' });
   } else {
    const cp = await this.history.canonical();
    if (!cp || !('subject' in cp) || !cp.subject) throw new Error('Design history missing'); this.prepareDesign(cp.project, cp.subject.canonicalPath);
   }
   const cp = await this.history.canonical(); if (!cp) throw new Error('Publication checkpoint missing');
   // Explicitly bind already committed feedback even when semantics did not change.
   await this.history.qualify();
  }
 }
 async authorizePublication(): Promise<PublicationProof> {
  await this.preparePublication();
  if (!this.access) throw new Error('Publication borrow missing');
  const proof = await this.client.publication(this.access, this.binding!.latest()); this.terminal = true; return proof;
 }
 async savePublication(cp: PreparationHistory): Promise<void> { await this.history.write(preparationSemanticHistory(cp)); }
 async publicationPacket(...args: Parameters<CodePreparation['publicationPacket']>): ReturnType<CodePreparation['publicationPacket']> {
  if (!this.code) throw new Error('Publication source not qualified'); return this.code.publicationPacket(...args);
 }
}
