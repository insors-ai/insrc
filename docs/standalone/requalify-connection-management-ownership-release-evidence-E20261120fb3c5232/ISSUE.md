<!-- insrc:artifact ISSUE-fb3c5232029e3b33 -->

# Requalify connection-management ownership and release evidence

## Reproduction

Source/module-state inventories retain removed review/budget entries and omit changed structured-schema state. Connection release checks reject changed method-class and ipc-client hashes; a synthetic positive release-verifier control fails. These failures block claims that the current source and compiled bundle satisfy their recorded proof.

## Root cause

Recorded reviewed inventories and release fingerprints no longer describe the present source/module state. Some failures may also depend on incomplete compiled output from overlapping builds, so a clean isolated build is a prerequisite before classifying the remaining evidence gaps.

## Fix intent

After runtime, registry and retirement fixes, independently re-audit changed boundaries, classify every real mutable state owner and regenerate source/compiled evidence from one clean build. Acceptance: verifier positive controls pass, stale/mixed/forged controls still fail closed, every changed ownership boundary has actual review evidence, and unavailable external prerequisites remain explicitly pending. Never refresh digests, mark proof verified or enable release merely to turn tests green.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `src/daemon/db/management-enablement.ts`
- **[[c3]]** `code` `src/daemon/handler-runtime.ts`
