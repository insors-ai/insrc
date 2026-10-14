/**
 * Epic E20261014613abdb3 Story S004 t1 — read a failed chat turn's error text into a cause.
 *
 * Pure and vscode-free: no I/O, no state. The queue retries a turn only when this says the
 * failure was a passing infrastructure problem (spawn, rate-limit, overloaded, network, timeout);
 * a credentials failure ('auth') and everything it cannot place ('other': a model refusal, an
 * unknown text, a CLI that is not installed) is never retried, because a wrong guess toward
 * retrying could repeat a turn that already acted.
 *
 * The patterns are written from the messages cli-adapter.ts produces and from the daemon's
 * isTransientCliError (src/agent/providers/cli-provider.ts); the plugin is a separate package and
 * does not import that. A bare number is a status code only next to a word that says so, because
 * a CLI's envelope can hold usage figures that look like one.
 */

import type { InfraCause } from './chat-queue-store.js';

/** How long a retrying message waits before its 1st, 2nd and 3rd retry. */
export const RETRY_DELAYS_MS: readonly number[] = [10_000, 60_000, 300_000];

/** How many infrastructure retries a message gets. */
export const MAX_INFRA_RETRIES = RETRY_DELAYS_MS.length;

/** Causes a message may be retried for (never 'auth' or 'other'). */
export const RETRYABLE_CAUSES: ReadonlySet<InfraCause> = new Set<InfraCause>(['spawn', 'rate-limit', 'overloaded', 'network', 'timeout']);

/** An HTTP-like status code, only when a word beside it says it is one. */
function statusCode(message: string): number | undefined {
  const m = /\b(?:api error|http(?: status)?|status(?: code)?|error code)\b\s*[:=(]?\s*(\d{3})\b/i.exec(message);
  return m?.[1] === undefined ? undefined : Number(m[1]);
}

const AUTH = /\b(?:not (?:logged in|authenticated)|unauthori[sz]ed|authentication (?:failed|required|error)|invalid (?:x-)?api[ -]?key|incorrect api key|login required|please (?:run )?(?:its )?login|run (?:its )?login)\b/i;
const NOT_INSTALLED = /\bCLI not found\b|\bENOENT\b|\bnot found — install\b/i;
const OVERLOADED = /\boverloaded(?:_error)?\b|\bservice unavailable\b|\bat capacity\b|\binternal server error\b|\bbad gateway\b/i;
const RATE_LIMIT = /\brate[ -]?limit(?:ed)?\b|\btoo many requests\b|\bquota exceeded\b/i;
const TIMEOUT = /\btime[ -]?out\b|\btimed out\b|\bETIMEDOUT\b|\bdeadline exceeded\b/i;
const NETWORK = /\bconnection closed mid-response\b|\bECONN(?:RESET|REFUSED|ABORTED)\b|\bENOTFOUND\b|\bEAI_AGAIN\b|\bEPIPE\b|\bsocket hang ?up\b|\bnetwork (?:error|is unreachable|unreachable)\b|\bfetch failed\b|\bunable to connect\b|\bconnection (?:reset|refused|lost)\b/i;
const SPAWN = /\b(?:EAGAIN|EMFILE|ENFILE|ENOMEM|EBUSY)\b|\bresource temporarily unavailable\b|\btoo many open files\b/i;

export function classifyFailure(message: string): InfraCause {
  if (AUTH.test(message)) return 'auth';
  if (NOT_INSTALLED.test(message)) return 'other';
  const code = statusCode(message);
  if (code === 401 || code === 403) return 'auth';
  // The API's refusal of the request itself (a schema it rejects, a bad argument) is the same on every attempt.
  if (code !== undefined && code >= 400 && code < 500 && code !== 408 && code !== 429) return 'other';
  if (code === 429 || RATE_LIMIT.test(message)) return 'rate-limit';
  if (code === 529 || code === 503 || code === 500 || code === 502 || OVERLOADED.test(message)) return 'overloaded';
  if (code === 408 || code === 504 || TIMEOUT.test(message)) return 'timeout';
  if (NETWORK.test(message)) return 'network';
  if (SPAWN.test(message)) return 'spawn';
  return 'other';
}

/** Whether a cause is a passing infrastructure problem worth a retry. */
export const isRetryableCause = (cause: InfraCause | undefined): boolean => cause !== undefined && RETRYABLE_CAUSES.has(cause);
