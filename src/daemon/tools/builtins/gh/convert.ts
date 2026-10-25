/**
 * Free-text reads of gh (a diff, a run log) go through convertText, and every value the model reads out is
 * cross-checked against the raw text. Without a conversion provider the read still answers with the raw text.
 */

import type { Static, TSchema } from '@sinclair/typebox';
import { convertText } from '../../convert-text.js';
import type { ToolDeps, ToolResult } from '../../types.js';

/** The most raw text kept in failure.original. */
const ORIGINAL_CAP = 64 * 1024;

export type GhConversion<S extends TSchema> =
  | { ok: true; value: Static<S> | undefined }
  | { ok: false; failure: ToolResult };

/**
 * Convert `raw` to `schema`. Empty text gives no value. A daemon with no conversion provider gives no value (the
 * caller shows the raw text) unless the conversion is `required`, which is then a conversion-failed result; a conversion that fails its cross-check after the one escalation is a conversion-failed result
 * that keeps the raw text in failure.original.
 */
export async function ghConvert<S extends TSchema>(
  toolId: string, raw: string, schema: S, keyValues: (value: Static<S>) => string[], deps: ToolDeps, opts: { required?: boolean } = {},
): Promise<GhConversion<S>> {
  if (raw.trim().length === 0) { return { ok: true, value: undefined }; }
  if (deps.conversion === undefined) {
    if (opts.required !== true) { return { ok: true, value: undefined }; }
    const msg = `${toolId}: its text needs a conversion and no conversion provider is configured`;
    return { ok: false, failure: { output: `[${toolId}] ${msg}`, format: 'text', success: false, error: msg, failure: { kind: 'conversion-failed', message: msg, original: raw.slice(0, ORIGINAL_CAP) } } };
  }
  const c = await convertText({ toolId, rawText: raw, schema, keyValues }, deps);
  if (c.ok) { return { ok: true, value: c.value }; }
  const msg = `${toolId}: its text could not be converted and checked against the raw output (${c.failure.detail})`;
  return {
    ok: false,
    failure: {
      output: `[${toolId}] ${msg}`, format: 'text', success: false, error: msg,
      failure: { kind: 'conversion-failed', message: msg, original: raw.slice(0, ORIGINAL_CAP) },
    },
  };
}
