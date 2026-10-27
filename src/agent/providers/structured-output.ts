import { assertConnectionProviderAttempt } from '../../shared/connection-provider.js';
import { ConnectionExecutionError, assertExplicitConnectionExecution, currentStepContext, connectionExecutionErrorCode } from '../../shared/step-context.js';
import type { ConnectionExecutionContext } from '../../shared/step-context.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Structured-output helpers (plans/structured-output.md Phase A).
 *
 * This module is the shared infrastructure every provider's
 * `completeStructured` implementation builds on. The pattern mirrors
 * `insors-extraction`'s `OpenAISchemaProcessor` + the Instructor
 * library's retry-on-validation-failure flow.
 *
 *   - `validateAgainstSchema(schema, raw)`  -- ajv-backed validator
 *      returning `{ ok: true, value } | { ok: false, errors[] }`.
 *   - `withStructuredRetry(call, validate, maxAttempts)` -- runs the
 *      provider call, validates, on failure re-issues with the
 *      validation errors appended to the conversation. Surfaces a
 *      stable error after `maxAttempts`.
 *   - `processSchemaForOpenAIStrict(schema)` -- direct port of
 *      insors-extraction's OpenAISchemaProcessor. Walks the schema
 *      in place, sets `additionalProperties: false` on every object,
 *      ensures every non-dict property is in `required`, rewrites
 *      `oneOf` -> `anyOf` (strict mode prohibits `oneOf`). Idempotent.
 *
 * Phases B.1-B.5 wire each provider's `completeStructured` through
 * these helpers. Phases C.x migrate callsites away from
 * `JSON.parse(rawText)` to `provider.completeStructured(messages, Schema)`.
 */

import { Ajv, type ValidateFunction } from 'ajv';
import { formatAjvError } from './structured-schema.js';
export { codexStrictSchema, validateCodexReply, rootUnionKey, processSchemaForOpenAIStrict } from './structured-schema.js';
export type { RootUnionKey } from './structured-schema.js';
import { getLogger } from '../../shared/logger.js';
import { ModelCallFailedError } from './model-call-error.js';
import type { StructuredSchema } from '../../shared/types.js';

const savedLog = getLogger('providers:structured-output');
const quietLog = Object.freeze({ info() { }, warn() { } });


// ---------------------------------------------------------------------------
// ajv singleton -- one compiled cache shared across the daemon
// ---------------------------------------------------------------------------

/**
 * Singleton ajv instance. Configured for JSON Schema draft 2020-12
 * (which is what typebox emits) with informative error messages.
 *
 * `removeAdditional: false` + `useDefaults: false`: validation only
 * surfaces drift; it doesn't mutate the payload. Providers like OpenAI
 * (strict mode) already reject unknown properties at the wire layer;
 * we don't want ajv to silently strip them downstream.
 *
 * `allErrors: true` so a single failed validation surfaces every
 * issue at once -- the retry prompt then gets the full picture and
 * the LLM can fix everything in one pass.
 */
const ajvOptions = {
	allErrors:        true,
	useDefaults:      false,
	removeAdditional: false,
	strict:           false,        // be tolerant of `description`, `examples`, etc. typebox emits
};
const ajv = new Ajv(ajvOptions);


// ---------------------------------------------------------------------------
// Public validation surface
// ---------------------------------------------------------------------------

export type ValidationResult<T> =
	| { readonly ok: true;  readonly value: T }
	| { readonly ok: false; readonly errors: readonly string[] };

/**
 * Validate `raw` against `schema`. Returns the typed value or the list
 * of human-readable error messages.
 *
 * ajv-compiled validators are cached on the singleton; the same schema
 * object compiles once per process. Callers SHOULD reuse the same
 * `schema` reference across calls (typebox makes this natural -- the
 * schema is a module-level constant in the callsite's `*-schemas.ts`).
 */
function assertValidationExecution(execution?: ConnectionExecutionContext): void {
	const bound = currentStepContext()?.connectionExecution;
	if (execution !== undefined || bound?.mode === 'session-memory') assertExplicitConnectionExecution(execution);
	else bound?.assertActive();
}

export function validateAgainstSchema<T>(
	schema: StructuredSchema,
	raw:    unknown,
	execution?: ConnectionExecutionContext,
): ValidationResult<T> {
	assertValidationExecution(execution);
	let validate: ValidateFunction;
	try {
		validate = (execution?.mode === 'session-memory' ? new Ajv(ajvOptions) : ajv).compile(schema);
	} catch (err) {
		assertValidationExecution(execution);
		if (execution?.mode === 'session-memory') throw new ConnectionExecutionError('unsupported-temporary');
		return { ok: false, errors: [`ajv.compile failed: ${(err as Error).message}`] };
	}
	assertValidationExecution(execution);
	if (validate(raw)) {
		return { ok: true, value: raw as T };
	}
	if (execution?.mode === 'session-memory') return { ok: false, errors: ['Structured output did not match the schema.'] };
	const errors = (validate.errors ?? []).map(formatAjvError);
	return { ok: false, errors };
}




// ---------------------------------------------------------------------------
// Retry wrapper (Instructor-style)
// ---------------------------------------------------------------------------

/**
 * Caller-supplied function that issues the provider call. Receives an
 * optional `extraSystemNote` -- when set, the call MUST append it as
 * an additional user-side message so the LLM sees the validation
 * feedback from the prior attempt. Returns the raw, unvalidated value
 * the provider produced (a parsed object, NOT a string).
 *
 * On retry the helper appends the feedback note; the provider is
 * responsible for translating the conversation into its wire format
 * (anthropic.ts builds the messages array, gemini-schema-adapter
 * translates, etc.).
 */
export type StructuredCall = (extraSystemNote: string | undefined) => Promise<unknown>;

export type StructuredValidator<T> = (raw: unknown) => ValidationResult<T>;

/**
 * Build the retry-feedback note for attempts 2..N. Historically this
 * said "return valid JSON conforming to the schema" -- which qwen3.6
 * interprets as "be more explicit about what you're producing" and it
 * fence-wraps the response ` ```json ... ``` ` on the retry (ISSUES.md
 * I-003). The reworded note names the two failure modes we've actually
 * seen -- markdown fence wrappers and mid-stream truncation -- so the
 * model knows what NOT to do rather than only what to do.
 */
/** The correction note a re-asked structured call carries: the problems, then how to answer. */
export function buildRetryNote(errors: readonly string[]): string {
	const errorList = errors.length > 0
		? `\n  - ${errors.join('\n  - ')}\n`
		: ' (no structured error captured)';
	return (
		'Your previous response could not be parsed.' + errorList +
		'\n' +
		'Retry with a raw JSON object that conforms to the schema. Rules:\n' +
		'  - Emit the JSON object directly. Do NOT wrap it in a markdown\n' +
		'    code fence (no ```json ..., no ``` ...). The response must\n' +
		'    start with `{` and end with `}`.\n' +
		'  - Do NOT prefix the JSON with explanatory prose (no "Here is\n' +
		'    the JSON:", no "Sure, ..."). The very first character of\n' +
		'    your response must be `{`.\n' +
		'  - Do NOT abbreviate or elide fields with placeholders like\n' +
		'    "..." -- emit every required field in full.\n' +
		'  - Every string value must be complete + properly terminated.\n' +
		'    If a field is at risk of being long, keep it concise rather\n' +
		'    than truncating mid-string.\n' +
		'  - Fix every schema-validation error listed above.'
	);
}


/**
 * Issue the provider call, validate. On validation failure, append
 * the errors as a feedback note + re-issue up to `maxAttempts`. Throws
 * a stable error after exhaustion.
 *
 * This is the Instructor-style retry pattern. The cloud LLM gets
 * three shots; if it can't conform after the third, the call surfaces
 * as a hard error that bubbles up to the orchestrator's existing
 * Phase2Out retry loop (which is the next layer of defence in the
 * meta-task framework).
 *
 * Application-level errors thrown by `call` (e.g. "the model returned
 * text instead of using the forced tool") are treated as retryable
 * validation failures -- the error message becomes the feedback note
 * for the next attempt. Network-level transient errors (5xx, rate
 * limits) should be handled BEFORE reaching this helper, via the
 * per-provider cloud-retry wrapper. They're rare here because the
 * provider's `withCloudRetry` already covers them; if they leak
 * through, we treat them as validation failures and re-issue, which
 * isn't ideal but degrades gracefully.
 */
export async function withStructuredRetry<T>(
	call:         StructuredCall,
	validate:     StructuredValidator<T>,
	maxAttempts:  number,
	execution?: ConnectionExecutionContext,
): Promise<T> {
	assertConnectionProviderAttempt(execution);
	const log = execution?.mode === 'session-memory' ? quietLog : savedLog;
	if (maxAttempts < 1) {
		throw new Error(`structured-output: maxAttempts must be >= 1; got ${maxAttempts}`);
	}
	let lastErrors: readonly string[] = [];
	// The last attempt's failed model call, when it was one: the helper's
	// final error keeps that type, so a real outage is not reported as a
	// failure of shape.
	let lastCallFailure: ModelCallFailedError | undefined;
	// The error the last attempt threw, when it threw one: kept as the cause of
	// the helper's final error, so a caller can still read what it was (a
	// request the server rejected keeps its status).
	let lastThrown: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		assertConnectionProviderAttempt(execution);
		const note = attempt === 1
			? undefined
			: buildRetryNote(lastErrors);

		let raw: unknown;
		try {
			raw = await call(note);
			assertConnectionProviderAttempt(execution);
		} catch (err) {
			assertConnectionProviderAttempt(execution);
			if (execution?.mode === 'session-memory') throw new ConnectionExecutionError(connectionExecutionErrorCode(err) ?? 'unsupported-temporary');
			if (err instanceof ConnectionExecutionError) throw err;
			// A cancelled call ends the helper as it was raised: it is neither
			// retried nor reported as a failure of shape or of the model.
			if (err instanceof Error && err.name === 'AbortError') throw err;
			// A refusal of the input for its size (cli-provider's InputTooLargeError,
			// matched by name: that module imports this one) is never resent: the
			// same prompt cannot succeed, and the caller splits the work instead.
			if (err instanceof Error && err.name === 'InputTooLargeError') throw err;
			// Application-level error (model didn't use the tool, parse
			// error inside the provider's call closure, etc.). Convert to
			// a validation failure so the next attempt re-issues with the
			// error message as feedback.
			const msg = (err as Error).message ?? String(err);
			lastErrors = [msg];
			lastCallFailure = err instanceof ModelCallFailedError ? err : undefined;
			lastThrown = err;
			log.warn({ attempt, maxAttempts, error: msg }, 'structured-output: call threw; treating as validation failure for retry');
			continue;
		}

		let result: ValidationResult<T>;
		try { result = validate(raw); } catch (error) { assertConnectionProviderAttempt(execution); if (execution?.mode === 'session-memory') throw new ConnectionExecutionError(connectionExecutionErrorCode(error) ?? 'unsupported-temporary'); throw error; }
		assertConnectionProviderAttempt(execution);
		if (result.ok) {
			if (attempt > 1) {
				log.info({ attempt, maxAttempts }, 'structured-output: validation passed after retry');
			}
			return result.value;
		}
		lastErrors = execution?.mode === 'session-memory' ? ['Temporary provider response was invalid.'] : result.errors;
		lastCallFailure = undefined;
		lastThrown = undefined;
		log.warn({ attempt, maxAttempts, errors: lastErrors }, 'structured-output: validation failed; will retry');
	}
	assertConnectionProviderAttempt(execution);
	if (execution?.mode === 'session-memory') throw new ConnectionExecutionError('unsupported-temporary');
	const prefix = `structured-output: validation failed after ${maxAttempts} attempts: `;
	if (lastCallFailure !== undefined) {
		throw new ModelCallFailedError(`${prefix}${lastCallFailure.detail}`, { cause: lastCallFailure });
	}
	throw new Error(`${prefix}${lastErrors.join('; ')}`, lastThrown !== undefined ? { cause: lastThrown } : undefined);
}


// ---------------------------------------------------------------------------
// Stable error builder for "not implemented" provider stubs
// ---------------------------------------------------------------------------

/**
 * Phases B.1-B.5 land per-provider implementations one at a time. Each
 * provider that hasn't migrated yet exports a `completeStructured` that
 * throws this stable error. Callers gated on `capabilities.structuredOutput`
 * never hit it in production; tests gated on the same flag see a clear
 * "not yet implemented" rather than a malformed response.
 */
export function notImplementedStructuredOutput(provider: string): never {
	throw new Error(
		`structured-output: provider '${provider}' does not implement completeStructured yet. `
		+ `Gate the callsite on \`provider.capabilities.structuredOutput\` and route through `
		+ `\`provider.complete\` until the per-provider phase lands.`,
	);
}
