# Review rubric calibration — result (R5b)

**Date:** 2026-07-21 · **Harness:** `src/workflow/review/calibration.ts` ·
**Judge:** `claude` CLI · **Fixtures:** 7 frozen cases (3 HIGH / 2 MED / 2 LOW),
1 round.

## Result

```
calibration: 71% agreement over 7 cases × 1 round
  gate-escapes (block→LOW, UNSAFE): 0
  false-highs (over-block):         0
  missed-highs (HIGH→MED, still blocks): 2
  ✓ build-step-producer   HIGH → HIGH
  ✗ phantom-stream-anchor HIGH → MED
  ✗ progresstoken-envelope HIGH → MED
  ✓ four-producers        MED  → MED
  ✓ fork-mirror           MED  → MED
  ✓ ipcstreamkind-members LOW  → LOW
  ✓ analyze-producer-site LOW  → LOW
```

## Verdict: gate is SAFE; rubric under-labels two cases

- **0 gate-escapes** — no case that should block (HIGH or MED) was judged LOW.
  Since the gate blocks on **HIGH+MED**, every material defect is still caught.
  This is the property that must hold, and it does.
- **0 false-highs** — no over-blocking. The materiality gate (R5) successfully
  stopped the pre-calibration over-flagging (was 5 HIGH on the s2 dogfood).
- **2 missed-highs (HIGH→MED)** — the *wrong-referent citation*
  (`phantom-stream-anchor`) and the *wrong-location read* (`progresstoken-envelope`)
  were judged MED rather than HIGH. Both still **block** (MED blocks), so this is
  a labeling imprecision, not a gate failure. The judge treats "the cited line
  exists but is the wrong entity / the value is read from the wrong place" as a
  non-material anchor issue rather than a build-breaking defect.

## Follow-up (rubric refinement, non-blocking)

To lift the two under-labels to HIGH, the `verify.ts` rubric's wrong-referent /
wrong-location examples need to make the downstream consequence explicit in the
evidence the judge sees ("the task then *builds on* this entity / *reads* this
value"), or the fixtures' evidence should carry that consequence. Tracked as a
soft improvement — it changes labels, not gate outcomes. Re-run:

```
INSRC_LIVE_TESTS=1 INSRC_CAL_ROUNDS=3 npx tsx --test src/workflow/review/__tests__/calibration.live.test.ts
```
