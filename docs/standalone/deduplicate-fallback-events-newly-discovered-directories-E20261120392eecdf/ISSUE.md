<!-- insrc:artifact ISSUE-392eecdfdbf26269 -->

# Deduplicate fallback events for newly discovered directories

## Reproduction

watcher-new-directories injects a rejecting per-directory subscription after a real repository subscription. The existing file must still be reported exactly once, but the audit observes four reports and fails 4 !== 1.

## Root cause

Multiple discovery/event paths in the subscription-failure scenario produce duplicate notifications for the same file. The exact filesystem-event interleaving was not isolated by the audit, so the batch must first establish a deterministic reproduction.

## Fix intent

Ensure fallback discovery and ordinary watcher events provide the intended per-change notification semantics after subscription failure without losing files, suppressing real later changes or producing unhandled rejections. Acceptance: nested/new-directory failure cases report each initial file once, independent later modifications are delivered, and existing ignore/filter behavior remains intact. Keep retired review freshness behavior out of scope.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `src/indexer/watcher.ts`
