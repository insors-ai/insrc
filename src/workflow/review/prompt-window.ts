/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { ActivityReviewSessionOpts, StructuredSchema } from '../../shared/types.js';
import { PreparedViewReader } from './prepared-views.js';
import type { PreparedWindow } from './prepared-views.js';
import { metadataJsonBound } from './preparation-memory.js';

/** Assembly and CLI transport are distinct concurrently owned allocations.
 * The provider retains its lease until its native session actually settles. */
export class ReviewPromptWindow {
 private pending = false;
 private released = false;
 private readonly window: PreparedWindow<string>;
 readonly inputOwnership: NonNullable<ActivityReviewSessionOpts['inputOwnership']>;
 private constructor(private readonly reader: PreparedViewReader, window: PreparedWindow<string>, private readonly assertCurrent?: () => Promise<void>) {
  this.window = window; const owner = this;
  this.inputOwnership = { get signal() { return owner.reader.signal; }, acquire: (prompt, schema) => owner.acquire(prompt, schema) };
 }
 static async create(reader: PreparedViewReader, maxCharacters: number, build: () => string, assertCurrent?: () => Promise<void>): Promise<ReviewPromptWindow> {
  await reader.verify(); await assertCurrent?.();
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 0) throw new Error('Invalid review prompt assembly bound');
  // Raw fragments, escaped intermediate JSON, final joined UTF-16 prompt.
  const lease = reader.memory.reserve(maxCharacters * 6 + 1024, 'review prompt assembly and serialization');
  try {
   const prompt = build();
   if (prompt.length > maxCharacters) throw new Error('Review prompt exceeded its preallocated assembly bound');
   await reader.verify(); await assertCurrent?.();
   return new ReviewPromptWindow(reader, reader.retainWindow(prompt, [lease]), assertCurrent);
  } catch (error) { lease.release(); throw error; }
 }
 get prompt(): string { if (this.released) throw new Error('Review prompt released'); return this.window.value; }
 belongsTo(reader: PreparedViewReader): boolean { return reader === this.reader; }
 private async acquire(prompt: string, schema: StructuredSchema): Promise<{ release(): void }> {
   if (this.released || this.pending || prompt !== this.prompt) throw new Error('Foreign or active review prompt');
   this.pending = true;
   try {
   await this.reader.verify(); await this.assertCurrent?.(); this.reader.signal.throwIfAborted();
   // Covers schema transforms/argv JSON, appended contract text, transport JSON
   // escaping and UTF-8 stdin/RPC buffers while the assembled prompt is held.
   const lease = this.reader.memory.reserve(prompt.length * 24 + metadataJsonBound(schema) * 32 + 16384, 'review CLI prompt/schema transport');
   let active = true;
   return { release: () => { if (active) { active = false; this.pending = false; lease.release(); } } };
   } catch (error) { this.pending = false; throw error; }
 }
 release(): void {
  if (this.pending) throw new Error('Review provider still owns prompt transport');
  if (!this.released) { this.released = true; this.window.release(); }
 }
}

