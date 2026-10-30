/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { PROBE_OBSERVATION_BYTES } from '../../shared/review-investigation-probe.js';
import { ModelResponseShapeError } from './model-call-error.js';

/** Native frames only: never recursively interpret assistant text as events. */
export function readClaudeInvestigationEvents(stdout: string, cancelled = false): readonly Record<string, unknown>[] {
  const invalid = () => new ModelResponseShapeError('review-native-stream-invalid');
  if (Buffer.byteLength(stdout) > PROBE_OBSERVATION_BYTES) throw invalid();
  const lines = stdout.split('\n'), events: Record<string, unknown>[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim(); if (!line) continue;
    let value: unknown;
    try { value = JSON.parse(line); }
    catch { if (cancelled && i === lines.length - 1) break; throw invalid(); }
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof (value as Record<string, unknown>)['type'] !== 'string') throw invalid();
    events.push(value as Record<string, unknown>);
  }
  const init = events.filter(e => e['type'] === 'system' && e['subtype'] === 'init');
  if (init.length > 1) throw invalid();
  const session = init[0]?.['session_id'];
  if (session !== undefined && (typeof session !== 'string' || events.some(e => e['session_id'] !== undefined && e['session_id'] !== session))) throw invalid();
  return events;
}

/** Production completion requires one final native result, never a partial tail. */
export function readClaudeInvestigationResult(stdout: string): Record<string, unknown> {
  const events = readClaudeInvestigationEvents(stdout), results = events.filter(e => e['type'] === 'result');
  if (results.length !== 1 || events.at(-1) !== results[0] || typeof results[0]!['is_error'] !== 'boolean')
    throw new ModelResponseShapeError('review-native-result-invalid');
  return results[0]!;
}
