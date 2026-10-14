<!-- insrc:artifact BUILD-fb584b4856ebeea9-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-14T05:11:54.822Z  ·  **Updated:** 2026-10-14T05:35:08.018Z

**Commit:** c9bc3b37

## Scope

ISSUE-fb584b4856ebeea9. (1) The analyze step tool marks a 'repo-indexing' refusal retryable only while the repository is being indexed (RepoIndexingError data.status 'indexing'); a refusal for a failed last index (status 'error') is not retryable; code and message unchanged (src/daemon/steps/analyze-step/handler.ts scopeErrorResult). (2) The local Ollama provider keeps reporting a failure to reach or keep the model (connection refused, socket hang up, fetch failed, a stream that ends early) as ModelCallFailedError, but a request the Ollama server rejected for its content (the client's ResponseError with an HTTP status, e.g. 400) is raised as that rejection with the server's status and message, not as a failed model call; 'Ollama not running' and 'model not found' keep their actionable wording and stay failed model calls; a cancellation stays a cancellation (src/agent/providers/ollama.ts wrapOllamaError).

## Triage rationale

bugfix/small: scopeErrorResult sets retryable from the code alone; wrapOllamaError wraps every non-abort error, including request rejections. Two files plus tests.

## Summary

The step tool marks a 'repo-indexing' refusal retryable only while the repository is being indexed. The Ollama provider passes through a request the server rejected for its content (ResponseError 4xx other than 404, 408 and 429) with its status; 404 (model not found), 408/429 (not reached in time), 5xx and transport failures stay failed model calls; the structured retry helper keeps the last thrown error as its final error's cause. Code-review LOW (408/429) fixed in 5 falsifying mutations' worth of tests.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-fb584b4856ebeea9-S001.json` — **insrc-build** (2026-10-14T05:35:08.018Z)
- `.insrc/artifacts/ISSUE-fb584b4856ebeea9.json` — **insrc-build** (2026-10-14T05:35:08.018Z)
- `docs/standalone/label-failed-last-index-rejected-ollama-E20261014fb584b48/S001/CR.md` — **insrc-build** (2026-10-14T05:35:08.018Z)
- `src/agent/providers/__tests__/ollama-model-call-failure.test.ts` — **insrc-build** (2026-10-14T05:35:08.018Z)
- `src/agent/providers/ollama.ts` — **insrc-build** (2026-10-14T05:35:08.018Z)
- `src/agent/providers/structured-output.ts` — **insrc-build** (2026-10-14T05:35:08.018Z)
- `src/daemon/steps/__tests__/scope-not-indexed-steps.test.ts` — **insrc-build** (2026-10-14T05:35:08.018Z)
- `src/daemon/steps/analyze-step/handler.ts` — **insrc-build** (2026-10-14T05:35:08.018Z)

## Feedback

- **subho@insors.io (decision, recorded by the controller)** (2026-10-14T05:35:07.921Z) `comment` — `src/agent/providers/ollama.ts`: Code review (warn 0/0/6), stakeholder decision 2026-10-14 (option A): the LOW at ollama.ts:774 (408 and 429 treated as request rejections) fixed in c9bc3b37 and re-gated; both stay failed model calls. Accepted with a note: the three 'present but unverified' coverage LOWs (the gate ran the tests, all pass); the structured retry helper retrying a content rejection up to its attempt limit (unchanged behaviour, not a regression); the type cast in scopeErrorResult (style).
