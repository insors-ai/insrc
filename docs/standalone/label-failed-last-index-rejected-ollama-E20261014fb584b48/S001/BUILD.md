<!-- insrc:artifact BUILD-fb584b4856ebeea9-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-14T05:11:54.822Z  ·  **Updated:** 2026-10-14T05:16:50.783Z

**Commit:** 77e91e87

## Scope

ISSUE-fb584b4856ebeea9. (1) The analyze step tool marks a 'repo-indexing' refusal retryable only while the repository is being indexed (RepoIndexingError data.status 'indexing'); a refusal for a failed last index (status 'error') is not retryable; code and message unchanged (src/daemon/steps/analyze-step/handler.ts scopeErrorResult). (2) The local Ollama provider keeps reporting a failure to reach or keep the model (connection refused, socket hang up, fetch failed, a stream that ends early) as ModelCallFailedError, but a request the Ollama server rejected for its content (the client's ResponseError with an HTTP status, e.g. 400) is raised as that rejection with the server's status and message, not as a failed model call; 'Ollama not running' and 'model not found' keep their actionable wording and stay failed model calls; a cancellation stays a cancellation (src/agent/providers/ollama.ts wrapOllamaError).

## Triage rationale

bugfix/small: scopeErrorResult sets retryable from the code alone; wrapOllamaError wraps every non-abort error, including request rejections. Two files plus tests.

## Summary

The step tool marks a 'repo-indexing' refusal retryable only while the repository is being indexed; a failed last index is not retryable. The Ollama provider passes through a request the server rejected for its content (ResponseError 4xx other than 404) with its status, keeping 404 (model not found), 5xx and transport failures as failed model calls; the structured retry helper keeps the last thrown error as its final error's cause. Four falsifying mutations each fail the new tests.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-fb584b4856ebeea9.json` — **insrc-build** (2026-10-14T05:16:50.783Z)
- `src/agent/providers/__tests__/ollama-model-call-failure.test.ts` — **insrc-build** (2026-10-14T05:16:50.783Z)
- `src/agent/providers/ollama.ts` — **insrc-build** (2026-10-14T05:16:50.783Z)
- `src/agent/providers/structured-output.ts` — **insrc-build** (2026-10-14T05:16:50.783Z)
- `src/daemon/steps/__tests__/scope-not-indexed-steps.test.ts` — **insrc-build** (2026-10-14T05:16:50.783Z)
- `src/daemon/steps/analyze-step/handler.ts` — **insrc-build** (2026-10-14T05:16:50.783Z)
