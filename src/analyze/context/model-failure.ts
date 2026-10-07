/**
 * One test for "the call to the model failed", shared by every place
 * in the analyzer that has to tell a failed call from an answer in the
 * wrong shape.
 *
 * The provider behind a call is role-routed: it can be the local
 * Ollama, the claude / codex CLI, or an MCP sampling client. Each
 * reports a failed call differently:
 *   - Ollama + sockets: by message text (the provider wraps a clean
 *     connection failure into these strings).
 *   - CLI: by message text too -- a non-zero exit (which also covers a
 *     binary that could not be started) or an error envelope/event.
 *   - sampling: by a typed error, since the client's wording is its own.
 *
 * Anything else is NOT a failed call: no structured output, an answer
 * that does not parse, validation that fails after its retries.
 */

import { ModelCallFailedError } from '../../agent/providers/model-call-error.js';

/** Ollama / socket failures, as the local provider words them. */
const OLLAMA_FAILURE_TEXTS: readonly string[] = [
	'Ollama is not running',
	'Model not found',
	'ECONNREFUSED',
	'ECONNRESET',
	'fetch failed',
	'socket hang up',
	'EPIPE',
	'other side closed',
	'Did not receive done or success response in stream',
];

/** Failures of the CLI call itself (src/agent/providers/cli-provider.ts). */
const CLI_FAILURE_TEXTS: readonly string[] = [
	'claude --print failed',
	'claude exited with',
	'codex emitted error event',
	'codex exited with',
];

export const MODEL_CALL_FAILURE_TEXTS: readonly string[] = Object.freeze([
	...OLLAMA_FAILURE_TEXTS,
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
	for (const text of CLI_FAILURE_TEXTS) {
		if (own.startsWith(text)) return true;
	}
	// The local provider wraps a connection failure with its own
	// prefix, and a socket error can be nested in another's message,
	// so these are matched anywhere -- outside a quoted answer.
	for (const text of OLLAMA_FAILURE_TEXTS) {
		if (msg.includes(text)) return true;
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
