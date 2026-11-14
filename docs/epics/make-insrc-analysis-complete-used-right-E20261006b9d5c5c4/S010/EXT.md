<!-- insrc:artifact EXT-b9d5c5c40df5a574-s10 -->

# Extend: make-insrc-analysis-complete-used-right — A running analysis can be cancelled, and the tool loop has no turn limit

> **Extends Epic `make-insrc-analysis-complete-used-right`** — this builds on existing docs + code; no new Epic was created.

**Scope:** L   ·   **New Story:** `s10`

Extends Epic `make-insrc-analysis-complete-used-right` (EPIC-b9d5c5c40df5a574): split out of Story s4, building on DEF/HLD docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4 and the lookup code in src/analyze/explore (freeform-probe.ts, executor.ts).

## Added Story

### s10: A running analysis can be cancelled, and the tool loop has no turn limit

**User value:** As someone running or relying on an analysis, I can stop one that is running and get what it found so far, and no analysis is cut short by a fixed number of turns, because a running analysis can always be stopped by its caller instead.

**Acceptance criteria:**
- **ac1:** Given an analysis or lookup that is running, on either path a request can take through the analyzer, when its caller cancels it, then it stops at its next safe point, makes no further model or tool call for that request, and is reported as cancelled, neither failed nor complete, with the findings gathered so far kept.
- **ac2:** Given any way a request can reach a tool loop (the three context requests, the plan request and the classify request), when its caller cancels it, then the loop for that request stops, and no other running request is affected.
- **ac3:** Given a cancel request that names a run that does not exist or has already finished, when it is received, then it is refused with a reason that says so and changes nothing.
- **ac4:** Given cancellation works on every path that reaches a tool loop, when the tool loop's turn limit is removed, then a loop ends only by finishing, by failing for a reason it reports, or by being cancelled, and reaching a number of turns is no longer a way for it to end or to fail.
- **ac5:** Given a configuration that still holds the retired turn-limit setting, when it is loaded, then the setting is ignored and reported as retired in the way other retired settings are, the load does not fail, and no prompt, documentation page or client declaration still states a turn limit.

## Building on

- `doc` docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/HLD.md — Building cancellation
- `doc` docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/DEF.md
- `code` src/analyze/explore/freeform-probe.ts
- `code` src/analyze/explore/executor.ts

## Next

Proposed HLD amendment `AMD-b9d5c5c40df5a574-3` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-b9d5c5c40df5a574-3`) and the updated Epic, then run `design.story` for the new Story `s10` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"b9d5c5c40df5a574","storyId":"s10"}
```
