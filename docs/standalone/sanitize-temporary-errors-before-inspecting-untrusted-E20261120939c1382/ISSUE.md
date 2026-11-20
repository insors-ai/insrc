<!-- insrc:artifact ISSUE-939c138296f56a8f -->

# Sanitize temporary errors before inspecting untrusted prototypes

## Reproduction

The provider-diagnostics fixture throws a proxy whose property/prototype traps throw a private canary. It expects unsupported-temporary but gets an unclassified error. The rpc-diagnostics fixture similarly reports CM_PRIVATE_RAW_GETTER from failedOutput rather than a safe temporary failure. Both are captured in the failure audit.

## Root cause

withStructuredRetry checks instanceof VibeTurnError before its session-memory safe conversion, and failedOutput checks instanceof LookupFailedError before its temporary-mode branch. instanceof can invoke getPrototypeOf on an untrusted proxy, bypassing the intended safe error path.

## Fix intent

Ensure temporary requests produce safe typed failures without touching untrusted error properties or prototypes, preserving saved-mode diagnostics, nonretryable refusals and authority checks. Acceptance: provider and RPC hostile-proxy fixtures pass, no private canary reaches logs/envelopes, and saved positive controls retain normal diagnostics. Scope excludes general test cleanup and reviewed-evidence regeneration.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `src/agent/providers/structured-output.ts`
- **[[c3]]** `code` `src/analyze/explore/executor.ts`
