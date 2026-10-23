/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * convertText (sc3): turns the text output of a CLI that gives no structured
 * output into a value of a declared shape, without ever trusting the model.
 *
 * - Calls run one after another through a module-level queue (k3): no two
 *   conversions reach a provider at once, whatever the number of concurrent
 *   tool calls.
 * - Two attempts on the cheap role (tools.convert), then, only if those fail,
 *   two on the escalation role (tools.convert.escalate). The count is a
 *   constant, not a setting.
 * - Each value is checked against the schema and then against the raw text
 *   (crossCheck): a value the text does not contain is never accepted.
 * - Requirement R1: completeStructured runs with internalRetry false and
 *   maxAttempts 1, and withStructuredRetry is the only retry loop, so
 *   "two attempts per tier" is exactly two provider calls.
 * - A per-attempt deadline is raised as an ordinary 'timed out' error (so it
 *   is retried); only the caller's own cancellation surfaces as AbortError.
 * - No fallback to the unconverted text and no direct REST call: providers
 *   come only from deps.conversion (the RoleRouter).
 */

import type { Static, TSchema } from '@sinclair/typebox';
import { withStructuredRetry, validateAgainstSchema, type StructuredCall } from '../../agent/providers/structured-output.js';
import { getLogger } from '../../shared/logger.js';
import type { LLMMessage, LLMProvider, StructuredSchema } from '../../shared/types.js';
import { crossCheck } from './cross-check.js';
import type { ToolDeps } from './types.js';

const log = getLogger('tools-convert-text');

/** Attempts per tier. */
const ATTEMPTS_PER_TIER = 2;
let attemptDeadlineMs = 120_000;

/** Test seam: shorten the per-attempt deadline. */
export function _setAttemptDeadlineForTests(ms: number): void { attemptDeadlineMs = ms; }

type Role = 'tools.convert' | 'tools.convert.escalate';

export interface ConversionRequest<S extends TSchema> {
	/** The tool whose output is converted; named in the prompt and the logs. */
	readonly toolId:    string;
	readonly rawText:   string;
	readonly schema:    S;
	/** The values expected to occur verbatim in rawText (identifiers, numbers, paths, status words). */
	readonly keyValues: (value: Static<S>) => string[];
}

export type ConversionFailureKind = 'shape-mismatch' | 'value-not-in-text' | 'retries-exhausted';

export interface ConversionFailure {
	readonly kind:   ConversionFailureKind;
	readonly detail: string;
}

export type ConversionResult<T> =
	| { readonly ok: true;  readonly value: T; readonly tier: 'cheap' | 'escalated' }
	| { readonly ok: false; readonly failure: ConversionFailure };

// ---------------------------------------------------------------------------
// The serial queue
// ---------------------------------------------------------------------------

let tail: Promise<void> = Promise.resolve();

/** Wait for the previous conversion, then hold the slot until the returned release is called. */
function takeSlot(): Promise<() => void> {
	const previous = tail;
	let release!: () => void;
	tail = new Promise<void>(resolve => { release = resolve; });
	return previous.then(() => release);
}

// ---------------------------------------------------------------------------
// One provider call, bounded by a deadline and by the caller's signal
// ---------------------------------------------------------------------------

function abortError(): Error {
	const e = new Error('conversion cancelled');
	e.name = 'AbortError';
	return e;
}

function boundedCall<T>(start: (signal: AbortSignal) => Promise<T>, caller: AbortSignal | undefined): Promise<T> {
	const controller = new AbortController();
	return new Promise<T>((resolve, reject) => {
		let done = false;
		const finish = (fn: () => void): void => { if (done) return; done = true; clearTimeout(timer); caller?.removeEventListener('abort', onCaller); fn(); };
		const onCaller = (): void => finish(() => { controller.abort(); reject(abortError()); });
		const timer = setTimeout(() => finish(() => { controller.abort(); reject(new Error('timed out')); }), attemptDeadlineMs);
		if (caller?.aborted === true) { onCaller(); return; }
		caller?.addEventListener('abort', onCaller, { once: true });
		// A late rejection after the race is settled (the aborted provider call) is swallowed.
		start(controller.signal).then(v => finish(() => resolve(v)), e => finish(() => reject(e)));
	});
}

// ---------------------------------------------------------------------------
// One tier
// ---------------------------------------------------------------------------

type TierOutcome<T> =
	| { readonly ok: true;  readonly value: T }
	| { readonly ok: false; readonly detail: string; readonly stop?: 'cancelled' | 'input too large' };

function prompt(toolId: string, rawText: string, schema: TSchema): string {
	return [
		`Convert the output of the tool \`${toolId}\` into the JSON object described by the schema at the end.`,
		'Use only values that appear in the text. Do not invent, infer, round or reformat any identifier, number, path or status word.',
		'Leave out an optional field the text does not support.',
		'',
		'<tool-output>',
		rawText,
		'</tool-output>',
		'',
		'Schema:',
		JSON.stringify(schema),
	].join('\n');
}

async function runTier<S extends TSchema>(
	role: Role, req: ConversionRequest<S>, deps: ToolDeps,
): Promise<TierOutcome<Static<S>>> {
	let provider: LLMProvider;
	try {
		provider = deps.conversion!.resolveProvider(role);
	} catch (err) {
		return { ok: false, detail: `no provider for role ${role}: ${err instanceof Error ? err.message : String(err)}` };
	}

	const base: LLMMessage = { role: 'user', content: prompt(req.toolId, req.rawText, req.schema) };
	let lastKind: ConversionFailureKind = 'shape-mismatch';
	let lastDetail = '';
	let lastCallError: string | undefined;

	const call: StructuredCall = note => {
		const messages: LLMMessage[] = note === undefined ? [base] : [base, { role: 'user', content: note }];
		return boundedCall(signal => provider.completeStructured<unknown>(messages, req.schema as unknown as StructuredSchema, {
			maxAttempts: 1, internalRetry: false, disableThinking: true, signal, cwd: deps.repoPath,
		}), deps.signal).then(
			v => { lastCallError = undefined; return v; },
			e => { lastCallError = e instanceof Error ? e.message : String(e); throw e; },
		);
	};
	const validate = (raw: unknown) => {
		const v = validateAgainstSchema<Static<S>>(req.schema as unknown as StructuredSchema, raw);
		if (!v.ok) { lastKind = 'shape-mismatch'; lastDetail = v.errors.join('; '); return v; }
		const check = crossCheck(req.rawText, req.keyValues(v.value));
		if (!check.ok) {
			lastKind = 'value-not-in-text';
			lastDetail = `not found in the text: ${check.missing.join(', ')}`;
			return { ok: false as const, errors: [`these values are not in the tool output: ${check.missing.join(', ')}`] };
		}
		return v;
	};

	try {
		return { ok: true, value: await withStructuredRetry(call, validate, ATTEMPTS_PER_TIER) };
	} catch (err) {
		const name = err instanceof Error ? err.name : '';
		if (name === 'AbortError') return { ok: false, detail: 'cancelled', stop: 'cancelled' };
		if (name === 'InputTooLargeError') return { ok: false, detail: 'input too large', stop: 'input too large' };
		if (lastCallError !== undefined) return { ok: false, detail: `the provider call for role ${role} failed: ${lastCallError}` };
		return { ok: false, detail: `${lastKind} (role ${role}): ${lastDetail}` };
	}
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export async function convertText<S extends TSchema>(
	req: ConversionRequest<S>, deps: ToolDeps,
): Promise<ConversionResult<Static<S>>> {
	if (deps.conversion === undefined) {
		log.warn({ toolId: req.toolId }, 'no conversion provider configured; no model call made');
		return { ok: false, failure: { kind: 'retries-exhausted', detail: 'no conversion provider configured' } };
	}
	const release = await takeSlot();
	try {
		if (deps.signal?.aborted === true) {
			return { ok: false, failure: { kind: 'retries-exhausted', detail: 'cancelled' } };
		}
		let last = '';
		for (const [i, role] of (['tools.convert', 'tools.convert.escalate'] as const).entries()) {
			if (i === 1) log.info({ toolId: req.toolId, role }, 'cheap conversion attempts failed; escalating once');
			const out = await runTier(role, req, deps);
			if (out.ok) {
				if (i === 1) log.info({ toolId: req.toolId, role }, 'conversion accepted on the escalated tier');
				return { ok: true, value: out.value, tier: i === 0 ? 'cheap' : 'escalated' };
			}
			last = out.detail;
			if (out.stop !== undefined) break;
		}
		log.warn({ toolId: req.toolId, detail: last }, 'conversion failed');
		return { ok: false, failure: { kind: 'retries-exhausted', detail: last } };
	} finally {
		release();
	}
}
