<!-- insrc:artifact ISSUE-869155c5c2c15e67 -->

# Diagnose macOS native lifecycle capability failures

## Reproduction

With the audit's native fixtures, the process broker refuses capture with denied (errno 1), while identity/peer observer prerequisites fail without a more specific captured diagnostic. Stop/restart, watchdog and installation-mutation tests then fail before their later ownership assertions. Missing helpers from shared-output races are a separate prerequisite, not this native diagnosis.

## Root cause

The immediate established failures are broker admission refusal and unsuccessful native identity/peer observation. The underlying entitlement, host-policy, helper packaging or native API cause has not been diagnosed. A clean Node-22 build and isolated disposable-process reproduction are required before changing lifecycle behavior.

## Fix intent

Identify the exact native admission/observation failure on macOS and correct only the diagnosed capability or packaging defect, retaining immutable identity, PID-reuse protection, peer verification and fail-closed ownership. Acceptance: supported disposable stop/restart/observer fixtures succeed; permission denial, wrong peer, reused PID, replacement run files and competing installation mutations remain correctly refused; healthy and forced shutdown paths terminate within their documented bounds. Do not bypass native security checks or infer a product defect from audit timeouts.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `src/shared/darwin-lifecycle.ts`
