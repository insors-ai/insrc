/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import type { ReviewKey } from '../../shared/review-resources.js';
import type { ReviewPreparationLimits } from '../../config/review.js';
import { artifactJsonPath } from '../storage.js';
import { prepareDesignSubject, assertDesignSubjectUnchanged, readDesignFile } from './design-review/subject.js';
import type { PreparedDesignSubject } from './design-review/subject.js';
import { requireDesign } from './design-review/contracts.js';
import type { SourceCapacity } from './source-session.js';
import { preparationDigest, writePreparedContext } from './prepared-context.js';
import type { PreparedContextReader, ReadyContextReceipt } from './prepared-context.js';

interface DesignView { submitted: { artifactPath: string; attempt: number }; prepared: PreparedDesignSubject; ancestryDigest: string; }
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
 constructor(private readonly key: ReviewKey, private readonly attempt: number,
  private readonly limits: ReviewPreparationLimits, private readonly capacity: SourceCapacity,
  private readonly submitted?: { artifactPath: string; attempt: number }) {
  requireDesign(!submitted || submitted.attempt === attempt, 'foreign_checkpoint', 'Design submission attempt mismatch');
  requireDesign(key.family === 'design' && Number.isSafeInteger(attempt) && attempt > 0, 'foreign_checkpoint', 'Design preparation identity required');
 }
 static async reuse(key: ReviewKey, attempt: number, reader: PreparedContextReader, limits: ReviewPreparationLimits, capacity: SourceCapacity): Promise<DesignPreparation> {
  requireDesign(same(key, reader.receipt.key) && attempt === reader.receipt.attempt, 'foreign_checkpoint', 'Foreign design context');
  const result = new DesignPreparation(key, attempt, limits, capacity);
  result.view = await reader.view('design-subject') as DesignView;
  result.prepare(key.project, result.view.prepared.subject.canonicalPath);
  return result;
 }
 private capture(repo: string, path: string): DesignView {
  requireDesign(!this.failed && repo === this.key.project, 'foreign_checkpoint', 'Design preparation owner unavailable or foreign');
  const prepared = prepareDesignSubject(repo, path);
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
   if (this.view) assertDesignSubjectUnchanged(this.view.prepared.subject, this.view.prepared.baseline);
   else this.view = current;
   return structuredClone(this.view.prepared);
  } catch (error) { this.failed = true; throw error; }
 };
 /** Called at every existing phase boundary and by the existing monitor. */
 readonly assertSubject: typeof assertDesignSubjectUnchanged = (subject, baseline, owned) => {
  try {
   assertDesignSubjectUnchanged(subject, baseline, owned);
   const current = this.capture(subject.project, subject.canonicalPath); this.check(current);
   this.view ??= { ...current, prepared: { ...current.prepared, subject: structuredClone(subject), baseline: structuredClone(baseline) } };
   requireDesign(this.view && same(authority(subject), authority(this.view.prepared.subject)), 'artifact_changed', 'Design phase subject changed');
  } catch (error) { this.failed = true; throw error; }
 };
 async seal(): Promise<ReadyContextReceipt> {
  requireDesign(this.view && !this.failed && !this.sealed, 'foreign_checkpoint', 'No current design preparation to seal');
  this.assertSubject(this.view.prepared.subject, this.view.prepared.baseline); this.sealed = true;
  const { prepared, ancestryDigest } = this.view;
  return writePreparedContext({ key: this.key, attempt: this.attempt, validatorVersion: 1,
   inputDigest: preparationDigest(this.view.submitted),
   routeDigest: preparationDigest([prepared.subject, ancestryDigest]), sourceIdentity: preparationDigest([prepared.baseline.subjectFingerprints, ancestryDigest]),
   scopeDigest: preparationDigest(prepared.inventory), testDocumentDigest: preparationDigest(prepared.baseline.subjectFingerprints),
  }, { 'design-subject': this.view }, undefined, this.limits, this.capacity);
 }
 close(): void { this.failed = true; }
}
