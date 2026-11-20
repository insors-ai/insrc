<!-- insrc:artifact ISSUE-ea90a8d530a0b69d -->

# Handle rejected queue drains without losing cleanup ownership

## Reproduction

The session-cleanup child matrix case rejected queue drain still closes native resources and ends once with failure raises an unhandled private-queue-failure at its fixture. The parent EXPIRY and RECONNECT tests share the rejected matrix promise and both fail, despite the child explicitly clearing diagnostic environment variables.

## Root cause

The queue-drain rejection escapes the expected bounded cleanup/error-completion path in the child matrix. Two parent failures arise from the same rejected matrix, not independently proven expiry and reconnect defects. Whether the escaping rejection is fixture timing or production ownership handling must be established.

## Fix intent

Ensure queue-drain failure is observed through the supported failure boundary while native resources and retained ownership are released exactly once. Acceptance: the rejecting-drain case completes once with an intentional failure outcome, all owned resources close, no unhandled rejection/private canary escapes, and the shared expiry/reconnect matrix passes without hiding unexpected errors.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `src/daemon/db/__tests__/fixtures/session-cleanup-child.ts`
