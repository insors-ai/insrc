/**
 * The shared answer builders of the Jira ops: each takes what acli printed (BuildContext) and returns the data of the
 * op's output member, or a rejected failure. A builder never guesses: text it cannot read is a failure that keeps acli's
 * text in `original`.
 */

import type { BuildContext } from '../gh/op-table.js';
import type { ToolResult } from '../../types.js';
import { readBatch, readClonedKey, readCount, stripAnsi } from './readers.js';

export type Build = (ctx: BuildContext) => Promise<Record<string, unknown> | ToolResult>;

const ORIGINAL_MAX = 2000;

/** A rejected failure; acli's text (cut) rides along in `original`. */
export function rejected(message: string, original?: string): ToolResult {
  const cut = original === undefined ? undefined : original.length > ORIGINAL_MAX ? `${original.slice(0, ORIGINAL_MAX)}...[truncated]` : original;
  return { output: message, format: 'text', success: false, error: message, failure: { kind: 'rejected', message, ...(cut !== undefined ? { original: cut } : {}) } };
}

/**
 * A batch result ({results,totalCount,successCount}, exit 0 even when every result failed). Not ok is a rejected failure that
 * lists each failed id with acli's message and, when some succeeded, each succeeded id and says the batch was partly applied.
 * `clone`: the target is the new key(s), read from each success message (the result id is the source key).
 */
export function batchAnswer(opts: { clone?: boolean } = {}): Build {
  return async ctx => {
    const batch = readBatch(ctx.stdout);
    if (batch === undefined) { return rejected('acli did not print a batch result', ctx.stdout); }
    if (!batch.ok) {
      const failed = batch.failed.map(e => `${e.id}: ${e.message}`).join('; ');
      const parts = [batch.failed.length > 0 ? `failed: ${failed}` : 'acli reported a batch that does not add up'];
      if (batch.succeeded.length > 0) { parts.push(`succeeded: ${batch.succeeded.map(e => e.id).join(', ')}`, 'the batch was partly applied'); }
      return rejected(parts.join('; '), ctx.stdout);
    }
    let target = batch.succeeded.map(e => e.id).join(',');
    if (opts.clone === true) {
      const keys = batch.succeeded.map(e => readClonedKey(e.message));
      if (keys.some(k => k === undefined)) { return rejected('acli did not say the key of the new work item', ctx.stdout); }
      target = keys.join(',');
    }
    return { ok: true, target, message: batch.succeeded.map(e => e.message).join('; ') };
  };
}

/** A text result that starts with the success mark (comment update and delete, link create and delete, the project commands). */
export function markAnswer(target: (input: BuildContext['input']) => string): Build {
  return async ctx => {
    const text = stripAnsi(ctx.stdout).trim();
    if (!text.startsWith('✓')) { return rejected('acli did not confirm the change', ctx.stdout || ctx.stderr); }
    return { ok: true, target: target(ctx.input), message: text.replace(/^✓\s*/, '').split('\n')[0] ?? text };
  };
}

/**
 * A text result whose first line (after an optional check mark) matches `expected`: the project commands, whose real success
 * text was recorded by the live probe ('Project K has been successfully archived'; archive, restore and delete print no mark).
 */
export function patternAnswer(expected: RegExp, target: (input: BuildContext['input']) => string): Build {
  return async ctx => {
    const first = stripAnsi(ctx.stdout).trim().replace(/^✓\s*/, '').split('\n')[0] ?? '';
    if (!expected.test(first)) { return rejected('acli did not confirm the change', ctx.stdout || ctx.stderr); }
    return { ok: true, target: target(ctx.input), message: first };
  };
}

/** A JSON read: `pick` shapes the parsed document into the answer, or returns undefined when it is not what the op expects. */
export function jsonAnswer(what: string, pick: (doc: unknown) => Record<string, unknown> | undefined): Build {
  return async ctx => {
    let doc: unknown;
    try { doc = JSON.parse(ctx.stdout); } catch { return rejected(`acli did not print ${what}`, ctx.stdout); }
    const answer = pick(doc);
    return answer ?? rejected(`acli did not print ${what}`, ctx.stdout);
  };
}

/** `search --count`. */
export function countAnswer(): Build {
  return async ctx => {
    const count = readCount(ctx.stdout);
    return count === undefined ? rejected('acli did not print the number of work items', ctx.stdout) : { count };
  };
}
