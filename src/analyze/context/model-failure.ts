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

/** True when `err` reports that the call to the model failed. */
export function isModelCallFailure(err: unknown): boolean {
	if (err instanceof ModelCallFailedError) return true;
	if (!(err instanceof Error)) return false;
	const msg = err.message;
	for (const text of MODEL_CALL_FAILURE_TEXTS) {
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
