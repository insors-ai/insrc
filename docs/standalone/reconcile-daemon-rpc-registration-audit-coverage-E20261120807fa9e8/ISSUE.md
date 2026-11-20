<!-- insrc:artifact ISSUE-807fa9e8fb678f4b -->

# Reconcile daemon RPC registration and audit coverage

## Reproduction

Handler-runtime, repo-call-audit/table, repo-gate-dispatch, method-class and daemon-doc-repo-table tests disagree with current handlers. Examples include daemon.qualificationState and design-review-step.cancel missing reviewed classification, newer cancellation keys absent from snapshots, and a fixed minimum count of modifying methods.

## Root cause

Several independent literal inventories and documentation tables were not reconciled with additions and review retirement. Some tests rely on historical counts instead of checking the actual supported handler set; classification omissions must still be assessed as real scoping/routing gaps.

## Fix intent

Make every registered RPC/stream/step phase have an explicit correct classification, repository-scoping rule and documented contract, then validate exact coverage against constructed handler tables. Preserve refusal behavior and ownership boundaries; do not simply whitelist unknown methods or reduce assertions to counts. Acceptance: runtime, routing, audit and documentation key sets agree with no stale or unclassified entry. Review endpoint behavioral replacement remains in batch 04.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `src/daemon/handler-runtime.ts`
- **[[c3]]** `code` `src/daemon/repo-call-gate.ts`
