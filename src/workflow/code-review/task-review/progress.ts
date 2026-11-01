/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type { ReviewActivityEvent } from '../../../shared/review-activity.js';

const count = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const timestamp = Type.Union([Type.String({ minLength: 20, maxLength: 30, pattern: '^\\d{4}-\\d{2}-\\d{2}T.*Z$' }), Type.Null()]);
export const ProgressSchema = Type.Object({
 schemaVersion: Type.Literal(1), executionId: Type.String({ minLength: 1, maxLength: 128 }), sequence: count,
 phase: Type.Union((['scope_preparation','task_review','tool_running','test_execution','feedback_persistence','cr_publication','complete','interrupted','error'] as const).map(value => Type.Literal(value))),
 task: Type.Union([Type.Object({ id: Type.String({ minLength: 1, maxLength: 256 }), name: Type.String({ maxLength: 256 }), position: count, total: count }, { additionalProperties: false }), Type.Null()]),
 completedTasks: count, reviewElapsedMs: count, taskElapsedMs: Type.Union([count, Type.Null()]),
 observedAt: timestamp, lastMeaningfulActivityAt: timestamp,
 processState: Type.Union([Type.Literal('alive'), Type.Literal('exited'), Type.Literal('unknown')]), lastProcessObservedAt: timestamp,
 activeToolCount: Type.Integer({ minimum: 0, maximum: 128 }),
}, { additionalProperties: false });
export type ReviewProgress = Static<typeof ProgressSchema>;
export interface ProgressClock { now(): number; wall(): string; }
const clock: ProgressClock = { now: () => performance.now(), wall: () => new Date().toISOString() };
const clean = (value: string) => value.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 256);
/** Bounded projection of already validated host observations; never stores native payloads. */
export class ReviewProgressTracker {
 readonly executionId = randomUUID();
 private readonly started: number;
 private taskStarted: number | undefined;
 private value: ReviewProgress;
 constructor(private readonly time: ProgressClock = clock) {
  this.started = time.now();
  this.value = { schemaVersion: 1, executionId: this.executionId, sequence: 0, phase: 'scope_preparation', task: null,
   completedTasks: 0, reviewElapsedMs: 0, taskElapsedMs: null, observedAt: time.wall(), lastMeaningfulActivityAt: null,
   processState: 'unknown', lastProcessObservedAt: null, activeToolCount: 0 };
 }
 task(task: { id: string; title: string }, position: number, total: number, completed: number): void {
  this.taskStarted = this.time.now();
  this.value.task = { id: clean(task.id), name: clean(task.title), position, total };
  this.value.completedTasks = completed; this.value.activeToolCount = 0;
  this.value.lastMeaningfulActivityAt = null; this.value.processState = 'unknown'; this.value.lastProcessObservedAt = null;
  this.phase('scope_preparation');
 }
 phase(phase: ReviewProgress['phase'], completed = this.value.completedTasks): void {
  this.value.phase = phase; this.value.completedTasks = completed; this.touch();
 }
 /** Caller passes only events accepted by its activity monitor. Heartbeat is liveness only. */
 activity(event: ReviewActivityEvent, tools: number): void {
  this.value.processState = 'alive'; this.value.lastProcessObservedAt = this.time.wall();
  this.value.activeToolCount = Math.min(128, Math.max(0, tools));
  if (event.kind !== 'heartbeat' && event.kind !== 'session_started') {
   this.value.lastMeaningfulActivityAt = this.time.wall();
   this.value.phase = event.kind === 'feedback_submitted' ? 'feedback_persistence' : tools ? 'tool_running' : 'task_review';
  }
  this.touch();
 }
 stopped(): void { this.value.processState = 'unknown'; this.value.activeToolCount = 0; this.touch(); }
 snapshot(): ReviewProgress {
  const elapsed = (start: number) => Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(this.time.now() - start)));
  return { ...structuredClone(this.value), reviewElapsedMs: elapsed(this.started), taskElapsedMs: this.taskStarted === undefined ? null : elapsed(this.taskStarted) };
 }
 private touch(): void { this.value.sequence++; this.value.observedAt = this.time.wall(); }
}
