<!-- insrc:artifact BUILD-1f7ade1a889013da-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-03T19:25:17.913Z  ·  **Updated:** 2026-10-04T04:29:34.742Z

**Commit:** 6ca328e

## Summary

Implemented all ten plan tasks for the root-union guard. Added `rootUnionKey` (pure, total, root-only) to structured-output.ts and called it as the first statement of CliProvider.completeStructured, outside withTransientRetry so non-retryability is structural rather than contingent on error wording. Exported isTransientCliError for direct assertion. Deleted normaliseSchemaForAnthropic — zero callers and a conclusively falsified premise — which also re-attached the orphaned "Phases B.1-B.5" docblock to the stub it describes (verified by reading the region). Added 25 hermetic tests in a new non-live file; nothing joined the INSRC_LIVE_TESTS-gated set, because the guard rejects before any subprocess is spawned. The falsifying mutation found three assertions that passed WITHOUT the guard: a "no codex tmpdir" check that was structurally vacuous (the provider rmSync's the dir in a finally, so it is gone before observation) — dropped with the reason recorded in its place — and both non-retryability checks, which were confirming a property of the spawn-ENOENT error instead; each now pins the message identity first. Re-run, the mutation kills 4 of 4 guard assertions. Sweep on Node 22 with INSRC_LIVE_TESTS unset: 4351 tests, 4233 pass, 2 fail, 113 skipped; the 2 failures are the known pre-existing sqlite data-driver defects, unrelated to this change (+25 tests and +25 passes vs before, failures and skips unchanged).

## t1 / t8 gate evidence (recorded per PLAN t1 acceptanceChecks[1])

The zero-caller precondition was run as a command, twice, and these are its outputs.

t1, before any edit:
    $ grep -rn 'normaliseSchemaForAnthropic' src --include='*.ts'
    src/agent/providers/structured-output.ts:341:export function normaliseSchemaForAnthropic(schema: StructuredSchema): StructuredSchema {
    1 line

t8, re-run immediately before the deletion (the plan critique added this because t1's result was eight tasks old and must not be inherited):
    $ grep -rn 'normaliseSchemaForAnthropic' src --include='*.ts' | grep -v '__tests__'
    src/agent/providers/structured-output.ts:397:export function normaliseSchemaForAnthropic(schema: StructuredSchema): StructuredSchema {
    1 non-test line

After the deletion, and again after the t9 falsification had re-added and removed the helper:
    $ grep -rn 'normaliseSchemaForAnthropic' src --include='*.ts' | grep -v '__tests__' | wc -l
    0

The line number moved 341 -> 397 between the two runs because t2 inserted the new predicate above it; the identity of the single match is unchanged. Both runs returned exactly one, so the gate's halt-or-proceed condition resolved to proceed on real output rather than on an inherited claim.

## Tasks validated

- ✗ `t1`
- ✗ `t6`

## Changes

- `.insrc/artifacts/CR-1f7ade1a889013da-S001.json` — **insrc-build** (2026-10-04T04:29:34.742Z)
- `.insrc/artifacts/PLAN-1f7ade1a889013da-S001.json` — **insrc-build** (2026-10-04T04:29:34.742Z)
- `docs/standalone/both-cli-providers-reject-top-level-E202610031f7ade1a/S001/CR.md` — **insrc-build** (2026-10-04T04:29:34.742Z)
- `src/agent/providers/__tests__/structured-output-root-union.test.ts` — **insrc-build** (2026-10-04T04:29:34.742Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-04T04:29:34.742Z)
- `src/agent/providers/structured-output.ts` — **insrc-build** (2026-10-04T04:29:34.742Z)
