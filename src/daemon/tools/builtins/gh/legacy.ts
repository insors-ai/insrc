/**
 * The failed result of the existing gh tools: gh's legacy text stays in output and error, and the typed failure
 * from ghFailureOf rides beside it.
 */

import type { ToolResult } from '../../types.js';
import { ghFailureOf } from './helpers.js';
import type { GhOutcome } from './helpers.js';

/**
 * The failed result of a gh call that did not finish clean, or undefined when it did. The legacy text stays in
 * output and error ('[id] gh's own text'); the typed failure from ghFailureOf rides beside it.
 */
export function ghFailResult(id: string, o: GhOutcome, mutating: boolean): ToolResult | undefined {
  const failure = ghFailureOf(o, { mutating });
  if (failure === undefined) { return undefined; }
  if (o.spawnError) {
    return { output: `[${id}] ${failure.message}`, format: 'text', success: false, error: 'gh not found', failure };
  }
  const msg = o.stderr.trim() || o.stdout.trim() || (o.code !== null && o.code !== 0 ? `exit ${o.code}` : failure.message);
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg, failure };
}
