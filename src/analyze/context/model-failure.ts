/**
 * One test for "the call to the model failed", shared by every place
 * in the analyzer that has to tell a failed call from an answer in the
 * wrong shape.
 *
 * The provider behind a call is role-routed: it can be the local
 * Ollama, the claude / codex CLI, or an MCP sampling client. Each
 * reports a failed call differently:
 *   - Ollama: by a typed error. The local provider raises every
 *     transport failure (connection refused, socket hang up, a stream
 *     that ends early) as ModelCallFailedError, so no socket wording is
 *     looked for inside a message, where it could be quoted text.
 *   - CLI: by its own wording at the START of the message -- a non-zero
 *     exit (which also covers a binary that could not be started) or an
 *     error envelope/event.
 *   - sampling: by a typed error, since the client's wording is its own.
 * A typed failure passed on as a plain message is still recognised by the
 * 'Model call failed: ' its message opens with.
 *
 * Anything else is NOT a failed call: no structured output, an answer
 * that does not parse, validation that fails after its retries.
 */

import { ModelCallFailedError } from '../../agent/providers/model-call-error.js';

/** Failures of the CLI call itself (src/agent/providers/cli-provider.ts). */
const CLI_FAILURE_TEXTS: readonly string[] = [
	'claude --print failed',
	'claude exited with',
	'codex emitted error event',
	'codex exited with',
];

/** A ModelCallFailedError's message opens with this (model-call-error.ts). */
const TYPED_FAILURE_TEXT = 'Model call failed: ';

/** Every wording a failed call's message opens with. */
export const MODEL_CALL_FAILURE_TEXTS: readonly string[] = Object.freeze([
	TYPED_FAILURE_TEXT,
	...CLI_FAILURE_TEXTS,
]);

/**
 * A provider's retry helper reports the last attempt's error behind
 * this prefix (src/agent/providers/structured-output.ts).
 */
const RETRY_PREFIX = /^structured-output: validation failed after \d+ attempts: /;

/**
 * A wrong-shaped answer is reported with the answer itself quoted
 * after ` text=` (a CLI answer that does not parse, a sampling answer
 * that is not JSON). What the MODEL wrote is not evidence about the
 * call: an answer that merely mentions 'ECONNREFUSED' -- likely when
 * the repository under analysis is this one -- must not be read as a
 * failed call. So the quoted answer is cut off before matching.
 */
function withoutQuotedAnswer(message: string): string {
	const at = message.indexOf(' text=');
	return at === -1 ? message : message.slice(0, at);
}

/** True when `err` reports that the call to the model failed. */
export function isModelCallFailure(err: unknown): boolean {
	if (err instanceof ModelCallFailedError) return true;
	if (!(err instanceof Error)) return false;
	const msg = withoutQuotedAnswer(err.message);
	// The provider's own wording for a failed call opens the message
	// (after the retry helper's prefix, when there is one). It is never
	// matched further in, where it could be quoted text.
	const own = msg.replace(RETRY_PREFIX, '');
	for (const text of MODEL_CALL_FAILURE_TEXTS) {
		if (own.startsWith(text)) return true;
	}
	return false;
}

/**
 * The failure's own words, without a wrapper's prefix: a typed
 * failure's detail, else the error's message.
 */
export function modelCallFailureDetail(err: unknown): string {
	if (err instanceof ModelCallFailedError) return err.detail;
	return err instanceof Error ? err.message : String(err);
}
