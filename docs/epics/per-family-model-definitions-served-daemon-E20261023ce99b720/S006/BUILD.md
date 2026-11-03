<!-- insrc:artifact BUILD-ce99b72065d03b1b-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-26T19:37:41.399Z  ·  **Updated:** 2026-10-27T04:43:09.090Z

**Commit:** 2b0929a14

## Summary

The Repo Configuration panel shows, for the chosen repo, a tier select per taxonomy role (global / core / mid / cheap, from models.byRepo[repo].tasks) and a coreFloor select, laid out as table rows (c6f35e07f, after a rendered screenshot showed the selects running together); no runner, model or effort field. The write handler accepts only ['tasks', roleId] and ['coreFloor'] (anything else dropped with a warning before consent), shows the daemon's reason and detail, and offers a restart (restartDaemonAndReport) on restartRequired. The existing panel tests were moved to the new segments. Mutation-checked: the segment guard.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/config/__tests__/gateway.test.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/config/gateway.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/config/types.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/daemon/__tests__/commands.test.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/daemon/commands.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/scripts/sync-manifest-catalog.mjs` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/config/__tests__/key-map.test.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/config/__tests__/manifest-catalog.test.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/config/__tests__/vscode-bundle-catalog.test.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/config/key-map.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/models/__tests__/tier-effort.test.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/config/__tests__/manifest-key-map-engine.test.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/config/sync-engine.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/models/definitions.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/models/model-tier-picker.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/vscode.d.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/panels/__tests__/repo-config.test.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/panels/repo-config.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
- `vscode-plugin/src/panels/types.ts` — **insrc-build** (2026-10-27T04:43:09.090Z)
