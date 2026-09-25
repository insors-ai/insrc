# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Epic:** edb76e2e4d41217d  ·  **Commit:** 083a022

Implements the approved S002 LLD + PLAN: the vscode-plugin `src/chat/` CLI stream
adapter (sc2 `stream-events.ts` + sc5 `cli-adapter.ts`) and its test suites.

## Tasks validated

- ✓ `t1` — spike: pin claude/codex native stream + resume flags
- ✓ `t2` — sc2 `stream-events.ts` (TurnEvent union + UnifiedDiff)
- ✓ `t3` — sc5 `cli-adapter.ts` (StreamAdapter, per-provider mappers, ProviderRegistry, cancel, resume, error paths)
- ✓ `t4` — fake-spawner unit suite + k1/k2/k4 source-scan + INSRC_LIVE_TESTS-gated live check

## Validation

- `tsc --noEmit` clean.
- Full plugin sweep: **287 pass / 0 fail / 2 live-skip** (24 new chat tests).
- Code review (CR-edb76e2e4d41217d-S002): **warn**, 0 HIGH / 0 MED / 1 LOW.
- Opposite-actor cold review: 4 findings (terminal-event guard, uncaught stdout
  error, subprocess leak, dead session-id capture) — all fixed with regression
  tests before completion.
