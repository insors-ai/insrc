<!-- insrc:artifact EXT-abd1ecf6a5f5063e-s10 -->

# Extend: frame-epic-new-pre-workflow-brainstorm — Rebuild the elicit convergence as an adaptive, daemon-drafted, decision-at-a-time loop

> **Extends Epic `frame-epic-new-pre-workflow-brainstorm`** — this builds on existing docs + code; no new Epic was created.

**Scope:** L   ·   **New Story:** `s10`

Extends Epic `frame-epic-new-pre-workflow-brainstorm` (abd1ecf6a5f5063e) — the adaptive decision-at-a-time elicit loop is a new slice of that epic's existing brainstorm-elicitation capability (its s3 'converge a vague idea through in-chat iteration' + s4 'see the options and tradeoffs, and have the chosen direction recorded'), building on src/workflow/runners/brainstorm/ + src/workflow/executor.ts. Not a new Epic.

## Added Story

### s10: Rebuild the elicit convergence as an adaptive, daemon-drafted, decision-at-a-time loop

**User value:** Today the brainstorm `elicit` stage is a SINGLE controller-freeform pause: the daemon emits one pause and the controller conducts the entire clarify→fold→show→confirm conversation freeform, resuming once (src/workflow/runners/brainstorm/index.ts elicit + finalizeElicit, which returns output/error and never re-pauses). Rebuild it into an ADAPTIVE, DECISION-AT-A-TIME loop where the controller owns the flow and surfaces one recommendation at a time: the daemon DRAFTS each next decision (a fork + candidate options) at a MID tier grounded on the running spec + all prior choices; the controller refines + authors the recommendation and presents ONE decision at a time (recommended option first, alternatives with tradeoffs); the user picks; the choice folds into the running spec; the runner RE-PAUSES for the next decision. The daemon proposes convergence when decisions look exhausted and the controller/user can override; on convergence the assembled spec gets one explicit final confirm (any prior decision reopenable) before the SpecArtifact is written. Preserves 'nothing persisted until confirm'; stays confined to elicit; keeps the SpecArtifact shape + seed-focus contract; never downgrades to the low-end local model.

**Acceptance criteria:**
- **ac1:** Given a rough idea has entered the brainstorm `elicit` stage and no decision has been answered yet, when the elicit step runs, then the daemon drafts exactly ONE next decision (a fork with candidate options) using a MID-tier model grounded on the running spec, and the controller refines it and presents a single recommendation-with-options prompt to the user (recommended option first, alternatives with short tradeoffs) — one decision at a time, not a batch and not a freeform pause.
- **ac2:** Given the user has chosen an option for the current decision, when the controller resumes the elicit step with that choice, then the daemon folds the choice into the running spec and generates the NEXT single decision grounded on all prior choices, and the `elicit` runner RE-PAUSES for it (a genuine multi-pause loop), so later decisions are informed by earlier ones and a fork can spawn or prune others.
- **ac3:** Given the daemon judges the material decisions exhausted and proposes convergence, when the controller/user responds, then they can override to raise another decision or stop early; on convergence the ASSEMBLED spec is presented for ONE explicit final confirm with any prior decision reopenable before it, and the SpecArtifact is written ONLY after that final confirm (nothing persisted until the user explicitly confirms).
- **ac4:** Given the redesigned elicit loop ships, when it runs end to end, then the change stays confined to the brainstorm elicit mechanism — the SpecArtifact shape and the seed-focus.ts downstream contract are unchanged, elicitation is never served by the low-end local model (the daemon draft runs at the mid tier), and the existing single-pause pathway is replaced rather than left as a second mode.

## Next

Proposed HLD amendment `AMD-abd1ecf6a5f5063e-1` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-abd1ecf6a5f5063e-1`) and the updated Epic, then run `design.story` for the new Story `s10` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"abd1ecf6a5f5063e","storyId":"s10"}
```
