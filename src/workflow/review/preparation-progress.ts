/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { ReviewRuntime } from '../../shared/review-preparation.js';
import type { ReviewSourceSession } from './source-session.js';

type Preparation = NonNullable<ReviewRuntime['preparation']>;
/** Event-driven preparation observation. Polling never advances these values
 * and attempted/failed fetches do not count as completed source operations. */
export class PreparationProgress {
 private readonly started: number;
 private stamp = '';
 constructor(private readonly publish: (value: Preparation) => Promise<void>, private readonly now: () => number = Date.now) { this.started = now(); }
 async report(stage: Preparation['stage'], source?: ReturnType<ReviewSourceSession['snapshot']>, total: number | null = null): Promise<void> {
  const value: Preparation = { stage, logicalCompleted: source?.logicalCompleted ?? 0, physicalCompleted: source?.physicalCompleted ?? 0,
   cacheHits: source?.cacheHits ?? 0, bytes: source?.storedBytes ?? 0, total, elapsedMs: Math.max(0, this.now() - this.started) };
  const stamp = JSON.stringify({ ...value, elapsedMs: 0 });
  if (stamp === this.stamp) return;
  await this.publish(value); this.stamp = stamp;
 }
}
