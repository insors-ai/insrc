/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import type { ReviewKey } from '../../shared/review-resources.js';
import type { ReviewPreparationLimits } from '../../config/review.js';
import { artifactJsonPath } from '../storage.js';
import { prepareDesignSubject, assertDesignSubjectUnchanged, readDesignFile } from './design-review/subject.js';
import type { PreparedDesignSubject } from './design-review/subject.js';
import { requireDesign } from './design-review/contracts.js';
import type { DesignAdmissionAttempt } from './design-review/contracts.js';
import type { SourceCapacity } from './source-session.js';
import { preparationDigest } from './prepared-context.js';
import type { ReadyContextReceipt, PreparedSourceIdentity } from './prepared-context.js';
import { PreparedViewReader, PreparedViewWriter } from './prepared-views.js';
import { ReviewMemoryBudget } from './preparation-memory.js';

interface DesignView { submitted: DesignAdmissionAttempt['submitted']; prepared: PreparedDesignSubject; ancestryDigest: string; }
type OwnedPublication = Parameters<typeof assertDesignSubjectUnchanged>[2];
function authority(subject: PreparedDesignSubject['subject']): unknown {
 const { availableReferences: _context, ...workflow } = subject.workflow;
 return { ...subject, workflow };
}
function ancestry(prepared: PreparedDesignSubject): string {
 const { subject } = prepared;
 return preparationDigest(subject.workflow.requiredReferences.map(reference => ({ ...reference,
  canonical: preparationDigest(readDesignFile(subject.project, artifactJsonPath(subject.project, reference.artifactId))),
  document: preparationDigest(readDesignFile(subject.project, reference.path)),
 })));
}
/** Design uses latest files, never code-review commit pins. Retained inventory
 * is reusable only after current author, route, target and ancestors agree. */
export class DesignPreparation {
 private view: DesignView | undefined;
 private failed = false;
 private sealed = false;
 private identity: PreparedSourceIdentity | undefined;
 private reader: PreparedViewReader | undefined;
 constructor(private readonly key: ReviewKey, private readonly attempt: number,
  private readonly limits: ReviewPreparationLimits, private readonly capacity: SourceCapacity,
  private readonly submitted?: DesignAdmissionAttempt['submitted'],
  private readonly prepareSubject:typeof prepareDesignSubject=prepareDesignSubject,
  private readonly ownedPublication?: OwnedPublication,
  private readonly memory = new ReviewMemoryBudget(limits.memoryMaxBytes)) {
  requireDesign(!submitted || submitted.attempt + (submitted.recovery?.operation === 'restart_full' ? 1 : 0) === attempt, 'foreign_checkpoint', 'Design submission attempt mismatch');
  requireDesign(key.family === 'design' && Number.isSafeInteger(attempt) && attempt > 0, 'foreign_checkpoint', 'Design preparation identity required');
 }
 static async reuse(key: ReviewKey, attempt: number, reader: PreparedViewReader, limits: ReviewPreparationLimits, capacity: SourceCapacity, ownedPublication?:OwnedPublication): Promise<DesignPreparation> {
  requireDesign(same(key, reader.receipt.key) && attempt === reader.receipt.attempt, 'foreign_checkpoint', 'Foreign design context');
  const result = new DesignPreparation(key, attempt, limits, capacity, undefined, prepareDesignSubject, ownedPublication, reader.memory);
  result.reader = reader;
  const metadata = await reader.metadata(await reader.descriptor('design-metadata', 'view'));
  const subject = await reader.metadata(await reader.descriptor('design-subject', 'view'));
  const baseline = await reader.metadata(await reader.descriptor('design-baseline', 'view'));
  const inventory = await reader.metadata(await reader.descriptor('design-inventory', 'view'));
  try {
   const meta = metadata.value as Pick<DesignView, 'submitted' | 'ancestryDigest'>;
   result.view = { submitted: structuredClone(meta.submitted), ancestryDigest: meta.ancestryDigest,
    prepared: { subject: structuredClone(subject.value) as PreparedDesignSubject['subject'], baseline: structuredClone(baseline.value) as PreparedDesignSubject['baseline'], inventory: structuredClone(inventory.value) as PreparedDesignSubject['inventory'] } };
  } finally { inventory.release(); baseline.release(); subject.release(); metadata.release(); }
  result.prepare(key.project, result.view.prepared.subject.canonicalPath);
  return result;
 }
 /** Cold publication requalifies current authority and ancestry while retaining
  * the reviewed inventory and baseline verified against permanent publication. */
 static published(key:ReviewKey,attempt:number,prepared:PreparedDesignSubject,submitted:DesignAdmissionAttempt['submitted'],limits:ReviewPreparationLimits,capacity:SourceCapacity,ownedPublication:OwnedPublication):DesignPreparation {
  const result=new DesignPreparation(key,attempt,limits,capacity,submitted,prepareDesignSubject,ownedPublication);
  const current=result.capture(key.project,prepared.subject.canonicalPath);
  result.view={submitted,prepared:structuredClone(prepared),ancestryDigest:current.ancestryDigest};
  result.prepare(key.project,prepared.subject.canonicalPath);return result;
 }
 private capture(repo: string, path: string): DesignView {
  requireDesign(!this.failed && repo === this.key.project, 'foreign_checkpoint', 'Design preparation owner unavailable or foreign');
  const prepared = this.prepareSubject(repo, path);
  return { submitted: this.view?.submitted ?? this.submitted ?? { artifactPath: path, attempt: this.attempt }, prepared, ancestryDigest: ancestry(prepared) };
 }
 private check(current: DesignView): void {
  const old = this.view;
  requireDesign(!old || same(authority(current.prepared.subject), authority(old.prepared.subject)) && current.ancestryDigest === old.ancestryDigest,
   'artifact_changed', 'Design author, workflow or required ancestry changed; a user-approved restart is required');
 }
 readonly prepare: typeof prepareDesignSubject = (repo, path) => {
  try {
   const current = this.capture(repo, path); this.check(current);
   if (this.view) assertDesignSubjectUnchanged(this.view.prepared.subject, this.view.prepared.baseline, this.ownedPublication);
   else this.view = current;
   return structuredClone(this.view.prepared);
  } catch (error) { this.failed = true; throw error; }
 };
 /** Called at every existing phase boundary and by the existing monitor. */
 readonly assertSubject: typeof assertDesignSubjectUnchanged = (subject, baseline, owned) => {
  try {
   assertDesignSubjectUnchanged(subject, baseline, owned ?? this.ownedPublication);
   const current = this.capture(subject.project, subject.canonicalPath); this.check(current);
   this.view ??= { ...current, prepared: { ...current.prepared, subject: structuredClone(subject), baseline: structuredClone(baseline) } };
   requireDesign(this.view && same(authority(subject), authority(this.view.prepared.subject)), 'artifact_changed', 'Design phase subject changed');
  } catch (error) { this.failed = true; throw error; }
 };
 async seal(): Promise<ReadyContextReceipt> {
  requireDesign(this.view, 'foreign_checkpoint', 'No current design preparation to seal');
  requireDesign(!this.failed, 'foreign_checkpoint', 'Fenced design preparation cannot seal');
  requireDesign(!this.sealed, 'foreign_checkpoint', 'Design preparation is already sealed');
  this.assertSubject(this.view.prepared.subject, this.view.prepared.baseline); this.sealed = true;
  const { prepared, ancestryDigest } = this.view;
  const identity: PreparedSourceIdentity = { key: this.key, attempt: this.attempt, validatorVersion: 1,
   inputDigest: preparationDigest(this.view.submitted),
   routeDigest: preparationDigest([prepared.subject, ancestryDigest]), sourceIdentity: preparationDigest([prepared.baseline.subjectFingerprints, ancestryDigest]),
   scopeDigest: preparationDigest(prepared.inventory), testDocumentDigest: preparationDigest(prepared.baseline.subjectFingerprints),
  };
  const writer = await PreparedViewWriter.create(identity, this.limits, this.capacity, this.memory);
  try {
   await writer.add('design-metadata', 'view', { submitted: this.view.submitted, ancestryDigest });
   await writer.add('design-subject', 'view', prepared.subject);
   await writer.add('design-baseline', 'view', prepared.baseline);
   await writer.add('design-inventory', 'view', prepared.inventory);
  } catch (error) { await writer.discard(); throw error; }
  const receipt = await writer.seal();
  this.identity = identity; return receipt;
 }
 /** Lookup metadata for the private main qualification channel, not a borrow. */
 qualificationIdentity(): PreparedSourceIdentity {
  requireDesign(this.identity, 'foreign_checkpoint', 'Design preparation has not sealed a context');
  return structuredClone(this.identity);
 }
 close(): void { this.failed = true; this.reader?.close(); }
}
