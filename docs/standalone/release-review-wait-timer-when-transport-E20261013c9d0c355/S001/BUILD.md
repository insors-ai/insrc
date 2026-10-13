<!-- insrc:artifact BUILD-c9d0c355d4719346-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-13T11:58:35.412Z  ·  **Updated:** 2026-10-13T12:27:14.617Z

**Commit:** cf6df4d2

## Scope

Fix ISSUE-c9d0c355: in runReviewStream (src/shared/review-stream.ts), a transport that throws while being opened settles the request as a ReviewStreamError with failure 'unreachable' (message naming the method and the cause), with the wait timer cleared and the abort listener removed. Neither transport changes. Add a unit test in src/shared/__tests__/review-stream.test.ts that a synchronously throwing transport settles 'unreachable' and clears its timer; src/daemon/steps/__tests__/in-daemon-client.test.ts then exits on its own.

## Triage rationale

bugfix/small: one function in one shared module plus its test; reuses the existing failWith settle path.

## Summary

runReviewStream now settles a transport that throws while opening as 'unreachable', releasing the wait timer and the abort listener; in-daemon-client.test.ts exits on its own again and the full sweep finishes.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-13T12:27:14.617Z)
