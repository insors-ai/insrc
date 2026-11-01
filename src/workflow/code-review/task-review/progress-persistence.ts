/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { ReviewAttempt } from './contracts.js';
import type { ReviewProgressTracker } from './progress.js';

export interface ProgressPersistenceDeps {
 /** The same serial queue used by task feedback; never a second writer lane. */
 serial(work: () => Promise<void>): Promise<void>;
 save(): Promise<void>;
 timer?: ((callback: () => void, ms: number) => () => void) | undefined;
}
/** One pending flush, no event journal or captured copy of the checkpoint. */
export class ReviewProgressPersistence {
 private cancel: (() => void) | undefined;
 private pending: Promise<void> | undefined;
 private stopped = false;
 private dirty = false;
 warning: 'progress_persistence_failed' | undefined;
 constructor(private readonly attempt: ReviewAttempt, readonly tracker: ReviewProgressTracker, private readonly deps: ProgressPersistenceDeps) {}
 request(immediate = false): void {
  if (this.stopped) return;
  if (this.pending) { this.dirty = true; return; }
  if (immediate) { this.cancel?.(); this.cancel = undefined; this.enqueue(); return; }
  if (this.cancel) return;
  const timer = this.deps.timer ?? ((callback: () => void, ms: number) => { const handle = setTimeout(callback, ms); handle.unref(); return () => clearTimeout(handle); });
  this.cancel = timer(() => { this.cancel = undefined; this.enqueue(); }, 5000);
 }
 /** Called inside the owner's serial feedback operation, immediately before its authoritative save. */
 boundary(): void {
  this.cancel?.(); this.cancel = undefined;
  this.attempt.progress = this.tracker.snapshot();
  this.dirty = false;
 }
 stop(): void { this.stopped = true; this.cancel?.(); this.cancel = undefined; }
 async settled(): Promise<void> { await this.pending; }
 private enqueue(): void {
  if (this.stopped || this.pending) return;
  this.pending = this.deps.serial(async () => {
   if (this.stopped) return;
   const prior = this.attempt.progress;
   this.attempt.progress = this.tracker.snapshot();
   try { await this.deps.save(); this.warning = undefined; }
   catch {
    if (prior) this.attempt.progress = prior; else delete this.attempt.progress;
    this.warning = 'progress_persistence_failed';
   }
  }).catch(() => { this.warning = 'progress_persistence_failed'; }).finally(() => { this.pending = undefined; if (this.dirty) { this.dirty = false; this.request(); } });
 }
}
