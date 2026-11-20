<!-- insrc:artifact ISSUE-03bd849749a52b41 -->

# Align historical tests with the retired review contract

## Reproduction

Review-label, lifecycle-wiring, in-daemon-client, indexing-port, router-session and worker-token tests still expect automated reviews to run. They now receive Design/Code review functionality is being rewritten. Store-isolation audits launch deleted review test files; the persistence fixture imports removed provenance writer code.

## Root cause

Review execution was intentionally retired, but several tests and fixture inventories still depend on the removed implementation, tokens and paths. This is established contract drift, separate from the new RPC coverage omissions.

## Fix intent

Replace obsolete execution expectations with coverage of the supported unavailable response and retained history/lifecycle guarantees; remove dependencies on deleted review fixtures and restore meaningful persistence/isolation controls against current APIs. Acceptance: affected backend, worker, MCP and store-isolation cases exercise current behavior without restoring automated reviews, deleting valid assertions or adding deprecated insrc-ide compatibility. Keep RPC table classification in its separate batch.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `src/workflow/review-unavailable.ts`
- **[[c3]]** `code` `src/daemon/handler-runtime.ts`
