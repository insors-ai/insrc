// Epic E20261014613abdb3 Story S004 t1 — the failure classifier.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFailure, isRetryableCause, MAX_INFRA_RETRIES, RETRY_DELAYS_MS } from '../chat-failure.js';

test('overloaded, rate limit, 429 and 5xx texts, timeouts and connection failures map to their causes', () => {
  assert.equal(classifyFailure('API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'), 'overloaded');
  assert.equal(classifyFailure('claude turn failed: Overloaded'), 'overloaded');
  assert.equal(classifyFailure('API Error: 503 Service Unavailable'), 'overloaded');
  assert.equal(classifyFailure('API Error: 500 Internal Server Error'), 'overloaded');
  assert.equal(classifyFailure('API Error: 429 rate limit exceeded'), 'rate-limit');
  assert.equal(classifyFailure('codex: Too Many Requests, slow down'), 'rate-limit');
  assert.equal(classifyFailure('You have hit your rate-limit'), 'rate-limit');
  assert.equal(classifyFailure('API Error: 504 Gateway Timeout'), 'timeout');
  assert.equal(classifyFailure('the request timed out'), 'timeout');
  assert.equal(classifyFailure('claude turn failed: connect ETIMEDOUT 160.79.104.10:443'), 'timeout');
  assert.equal(classifyFailure('API Error: Connection closed mid-response'), 'network');
  assert.equal(classifyFailure('fetch failed: ECONNRESET'), 'network');
  assert.equal(classifyFailure('getaddrinfo ENOTFOUND api.anthropic.com'), 'network');
  assert.equal(classifyFailure('claude exited with code 1: spawn EAGAIN'), 'spawn');
  assert.equal(classifyFailure('spawn EMFILE: too many open files'), 'spawn');
  // Retryable causes are exactly the five passing ones.
  for (const c of ['spawn', 'rate-limit', 'overloaded', 'network', 'timeout'] as const) assert.equal(isRetryableCause(c), true, c);
  for (const c of ['auth', 'other', undefined] as const) assert.equal(isRetryableCause(c), false, String(c));
  assert.deepEqual([...RETRY_DELAYS_MS], [10_000, 60_000, 300_000]);
  assert.equal(MAX_INFRA_RETRIES, 3);
});

test("the adapter's not-authenticated text and the CLIs' unauthorised and invalid key texts map to auth", () => {
  assert.equal(classifyFailure('claude is not authenticated — run its login command, then retry'), 'auth');
  assert.equal(classifyFailure('codex is not authenticated — run its login command, then retry'), 'auth');
  assert.equal(classifyFailure('API Error: 401 {"error":"Invalid API key"}'), 'auth');
  assert.equal(classifyFailure('Unauthorized'), 'auth');
  assert.equal(classifyFailure('Invalid API key · Please run /login'), 'auth');
  assert.equal(classifyFailure('Incorrect API key provided'), 'auth');
  assert.equal(classifyFailure('Authentication failed, login required'), 'auth');
  // An auth text is never retryable, even when it also mentions a retry-looking word.
  assert.equal(classifyFailure('Unauthorized: request timed out while validating the key'), 'auth');
  assert.equal(isRetryableCause(classifyFailure('claude is not authenticated — run its login command, then retry')), false);
});

test('CLI not found and any unmatched text, including a model refusal, map to other', () => {
  assert.equal(classifyFailure('claude CLI not found — install it or check your PATH'), 'other');
  assert.equal(classifyFailure('spawn claude ENOENT'), 'other');
  assert.equal(classifyFailure('I cannot help with that request.'), 'other');
  assert.equal(classifyFailure('the turn ended with an error'), 'other');
  assert.equal(classifyFailure(''), 'other');
  // The API's refusal of the request itself is the same on every attempt.
  assert.equal(classifyFailure('API Error: 400 {"error":"messages: text content blocks must be non-empty"}'), 'other');
  assert.equal(classifyFailure('API Error: 413 request too large'), 'other');
  // A bare number is not a status code: a usage figure in an envelope must not read as 429 or 529.
  assert.equal(classifyFailure('turn used 529 input tokens and 429 output tokens'), 'other');
  assert.equal(classifyFailure('error at line 503 of the file'), 'other');
  // A refusal that only resembles a failure word is not one: 'rate limiter' is not 'rate limit'.
  assert.equal(classifyFailure('I will not write code that bypasses the rate limiter'), 'other');
});
