# Plan: split the Delivery Board PRD into epics

Turns [`docs/insrc-delivery-board-prd.html`](../insrc-delivery-board-prd.html)
(Draft 0.3) into epics that can enter the workflow chain. Each epic below is a
**seed for `insrc_triage`**, not a framed Define: the stories listed are the
expected shape, and `define` will reframe them against the code.

Opened 2026-10-07.

## Shape of the split

```
E1  Delivery read model (daemon)          ← start here; everything reads it
 ├─ E2  Delivery board — VS Code          ← starts once E1's HLD fixes the IPC shape
 │   └─ E3  Delivery board — JetBrains    ← deferred; parity pass after E2 ships
 └─ (follow-on, not framed) review annotations + agent handoff
```

The split follows the PRD's own rule in §07, "The daemon owns interpretation":
all stage, gate, identity and data-quality logic lives in one daemon projection
(E1), and each IDE only renders it. That keeps the six-stage rules in one place
and makes JetBrains a rendering-only pass instead of a second implementation.

## Grounding — what already exists

- **Artifact store reads.** `buildOwnershipIndex`
  (`src/workflow/locate/ownership.ts:80`) already reads
  `.insrc/artifacts/*.json` and keys work items. `buildChainReport`
  (`src/workflow/chain.ts:84`) already derives a per-epic chain state
  (DEF / HLD / per-story LLD approval and staleness). It does not cover PLAN, BUILD,
  CR, ISSUE, routes or task results, and only the CLI calls it
  (`src/cli/services/workflow.ts:145`); there is no IPC method for it.
- **Approval state.** `pending.ts` defines pending as no `approvedAt` and no
  `rejectedAt` (`:126-128`). `PENDING_KINDS` (`:39`) excludes BUILD, so
  `workflow.pending` cannot answer completion questions.
- **Viewer.** `workflow.artifactContent` (`src/daemon/index.ts:698`) serves an
  artifact's rendered `.md` and is path-guarded under `docs/`. Markdown mirrors
  exist for most kinds, but in the 7 October recount only 40 of 80 BUILD records
  had one in `docs/epics/`. So FR-06's "open the supporting artifact through the
  existing artifact-viewing capability" is not fully covered for BUILD/CR evidence.
- **Refresh.** The daemon's socket server has no push or subscription channel,
  so manual refresh (the PRD's first-increment choice) is the only option without
  new daemon work.
- **IDE surfaces.** Both plugins live in this repo (`vscode-plugin/`,
  `jetbrains-plugin/`), and both already call `workflow.pending` and open
  artifacts in a review pane (`vscode-plugin/src/chat/docs-review-panel.ts`,
  JetBrains `review/`).
- **Route metadata.** LLD `meta.sizeClass` (`feature` / `small` / `bugfix`)
  and ISSUE `meta.magnitude` (`small` / `sized`) are recorded today; full-chain
  epic stories carry no `sizeClass`.

## E1 — Delivery read model (daemon)

**Goal:** one read-only, daemon-owned projection that turns
`.insrc/artifacts/` into the PRD's work-item model, exposed over IPC.
**PRD coverage:** §03, §05, §07; FR-01, FR-02 (derivation), FR-07 (snapshot
metadata), FR-08, FR-09; AC-01 to AC-08, AC-12, AC-13, AC-15 to AC-17, AC-19,
plus the daemon half of AC-10 and AC-18.
**Likely triage:** epic → `define`. `scope.assess` should come back **new**; it
reads the same store as `chain.ts` and `ownership.ts` but answers a different
question. If it returns **extend**, accept that only if the target is a
workflow-ledger epic, not `bfe98ff7` (the VS Code review pane).

Expected stories:

- [ ] **S1 — Work-item identity and hierarchy.** Epic → story → task, standalone
      stories and issues, and issue → fix-story links (including several fix
      stories per issue). Canonical lowercase story IDs; source IDs kept;
      any other collision flagged rather than merged. One card per work item,
      whatever artifact kinds it has. *AC-01, AC-08, AC-12, AC-13.*
- [ ] **S2 — Route-aware stage derivation.** The six stages with the
      first-match-wins precedence, both "Ready" columns, the trivial route, and
      the "unknown route" notice. A CR never changes the stage; a CR without a
      BUILD gets the unledgered-code-review notice. *AC-02, AC-03, AC-15,
      AC-16.*
- [ ] **S3 — Gate signals and attention.** Approval (`approvedAt` /
      `rejectedAt` / pending), review verdict and override, task validation
      (`passed` true / false / unrecorded, build-only tasks marked unplanned),
      the approved-but-failed conflict, and the "Needs attention" rule,
      including when a past block stops counting. *AC-04 to AC-07, AC-17.*
- [ ] **S4 — Revisions, amendments and data quality.** Order artifacts by
      authoritative revision, not file modification time; resolve effective EXT/AMD
      through framework semantics; per-item and snapshot-level notices for
      malformed records, broken parents and incomplete coverage. *FR-08, the
      daemon half of AC-10.*
- [ ] **S5 — Read-only IPC snapshot and evidence reads.** One new read method
      (name decided in the HLD, e.g. `workflow.board`) that returns a whole
      snapshot with freshness metadata, ordered deterministically with a stable
      tie-breaker. Plus a read path for evidence that has no `.md` mirror
      (BUILD/CR), either by widening `workflow.artifactContent` or by returning a
      structured evidence view. Includes the 1,000-artifact / 500-item
      performance fixture. *AC-19, the daemon half of AC-18, FR-06's evidence
      gap.*

Constraints carried into the Define:

- Read-only. No method in this epic writes to `.insrc/artifacts/`, approvals,
  code or Git (FR-09).
- IPC payload types are mirrored in both plugins and the `insrc-ide` fork, so
  the HLD must pin the response shape before E2 starts.
- Test fixtures should include the real conflict shapes from the 7 October
  recount: 29 approved BUILDs with failed tasks, 74 CRs without a BUILD,
  the `S001`/`s001` pair in epic `dfc0371b…`, 53 overrides, and 39 LLDs
  without a PLAN.

## E2 — Delivery board, VS Code

**Goal:** the read-only board in the VS Code plugin, rendering E1's snapshot.
**PRD coverage:** §04, §08; FR-03 to FR-07, FR-10; AC-09, AC-11, AC-14, and the
client halves of AC-10 and AC-18; mocks A to F.
**Likely triage:** epic → `define`. It may start **after E1's HLD is
approved**, because its stories consume the IPC shape. Its Define can run in
parallel with E1's LLDs.
**Relationship to `bfe98ff7`:** that epic improves the VS Code artifact
*review pane* (`docs/plans/vscode-viewer-gaps.md`, Track A). E2 opens evidence
*in* that pane but does not change it, so it should be framed as **new**, with
`bfe98ff7` as an adjacent boundary.

Expected stories:

- [ ] **S1 — Board shell, refresh and recovery states.** Editor-tab entry
      point, manual refresh, last-successful snapshot kept on failure, and the
      four distinct states in mock F: empty, no matches, unavailable, partial.
      Only one coherent snapshot is applied at a time. *FR-07, AC-10.*
- [ ] **S2 — Board columns, cards and filters.** Six columns, card content and
      badges, search, epic/standalone scope, "Needs attention", and counts that
      include cards behind "show more". *FR-03, FR-04, AC-09.*
- [ ] **S3 — Epic rollup and issue view.** Mocks A and D: completion counts
      that name their denominator, standalone work kept separate, unresolved
      parents shown rather than dropped. *FR-03.*
- [ ] **S4 — Work-item details and evidence.** Mocks B and C: nested tasks
      with dependencies and checks, the "why this stage" explanation, the
      artifact chain, conflict presentation, and opening evidence in the
      existing viewer. *FR-05, FR-06.*
- [ ] **S5 — Narrow pane, accessibility and density.** Mock E's grouped list,
      keyboard-only navigation, screen-reader labels, compact/comfortable
      density, and the client side of the performance targets. *FR-10, AC-14,
      the client half of AC-18.*

AC-11 (no state changes) is a cross-story check: every E2 story's
code review should confirm it.

## E3 — Delivery board, JetBrains (deferred)

The JetBrains parity pass against the same snapshot. Frame it after E2 ships,
so it can copy E2's settled interaction decisions instead of revisiting them.
This matches the deferral in `docs/plans/vscode-viewer-gaps.md`. Watch out for the
JetBrains renderer gaps already listed there (`markdown-renderer.js` handles
no tables, images or nested lists).

## Not framed — review annotations and agent handoff

The PRD's follow-on (§02, mock D's "future interaction") overlaps Track B1 in
`docs/plans/vscode-viewer-gaps.md`: `artifact.feedback.append` already accepts
code-anchored targets, and that plan has an unresolved question about which
surface owns which anchor kind. Settle that question in Track B1 before framing
this; do not fold it into E1 or E2.

## Decisions to make before or during E1's Define

These are the PRD's §10 open decisions, with the recommendation each epic
assumes:

| Decision | Recommendation | Blocks |
|---|---|---|
| First host | VS Code; it has the active viewer work and both plugins share E1 | E2 framing |
| Placement | Dedicated editor tab; check against a sidebar entry in E2 S1 | E2 S1 |
| Refresh | Manual only; the daemon has no push channel | — |
| Canonical joins | Lowercase story IDs; anything else flagged (E1 S1) | E1 S1 |
| Attention policy | A pending artifact stops counting once a downstream gate on the same item is approved | E1 S3 |
| Completion wording | Keep "Complete"; test it in E2's usability session | E2 S2 |

## How to start

1. Commit the revised PRD (Draft 0.3) so the Define can cite it by path.
2. Confirm the attention-policy row above; it is the only decision that changes
   E1's projection rules.
3. `insrc_triage` with E1's goal and story list as the focus → expect `epic`
   → `define` → review → approve → `design.epic`. Run each stage turn by turn
   with `insrc_workflow_step`.
4. After E1's HLD is approved: triage E2 the same way.
5. Per story in each epic: `design.story` → `plan` → `build` →
   `insrc_code_review_step` → BUILD approval.

Risk: `define`'s grounding uses the code graph, and ISSUE-12f70133 (the graph
loses cross-file import and call edges) is still open. Expect to check
the Define's citations against source by hand, especially in `workflow/` and
`daemon/index.ts`.
