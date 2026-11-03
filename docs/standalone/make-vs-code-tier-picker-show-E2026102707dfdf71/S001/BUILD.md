<!-- insrc:artifact BUILD-07dfdf71974a7c45-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-27T06:52:23.695Z  ·  **Updated:** 2026-10-27T07:36:36.990Z

**Commit:** 63e5e48e0

## Scope

Fix ISSUE-07dfdf71974a7c45 (docs/standalone/make-vs-code-tier-picker-show-E2026102707dfdf71/ISSUE.md): the VS Code model-tier picker's starting tier (currentTier, vscode-plugin/src/models/model-tier-picker.ts:145-158) must be the tier the daemon resolves, under the daemon's rules (src/config/analyze.ts:216 tierSetting, parseTiering :395-407, src/daemon/model-registry.ts:274 droppedEffort): a configured runner (a family the definitions serve) AND non-empty model run with the configured effort or none; any other tier (unset, model '', a runner or model alone) is the default family's tier default, at the configured effort leaf, else the default's effort; an effort the resolved model does not accept is shown as none. Parity tests cover each rule.

## Triage rationale

bugfix (small): one function in the VS Code picker plus its tests; routed issue -> build with no LLD.

## Summary

The VS Code tier picker now marks as current the tier the daemon actually runs; parity tests cover each of the daemon's rules and fail on the old code.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` — **insrc-build** (2026-10-27T07:36:36.990Z)
- `vscode-plugin/src/models/model-tier-picker.ts` — **insrc-build** (2026-10-27T07:36:36.990Z)
