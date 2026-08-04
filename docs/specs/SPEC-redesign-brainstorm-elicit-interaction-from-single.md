<!-- insrc:artifact SPEC-b77e3f38969bc8f4 -->

# Spec: Redesign the brainstorm `elicit` interaction from today's single controller-freeform pause (src/workflow/runners/brainstorm/index.ts elicit + finalizeElicit: the daemon emits ONE pause, the controller conducts the whole free-form conversation, and resumes ONCE) into an ADAPTIVE, DECISION-AT-A-TIME loop in which the controller owns the flow and surfaces one recommendation at a time.

**Category:** design

## Intent

Redesign the brainstorm `elicit` interaction from today's single controller-freeform pause (src/workflow/runners/brainstorm/index.ts elicit + finalizeElicit: the daemon emits ONE pause, the controller conducts the whole free-form conversation, and resumes ONCE) into an ADAPTIVE, DECISION-AT-A-TIME loop in which the controller owns the flow and surfaces one recommendation at a time. Target loop: (1) the daemon DRAFTS the next single decision (a fork + candidate options) using a MID-TIER model, grounded on the running spec + everything decided so far; (2) the controller REFINES the draft and AUTHORS the recommendation, then presents ONE decision at a time to the user as a single recommendation-with-options prompt — recommended option first, alternatives with short tradeoffs (and optional previews) — exactly the UX of the session that converged this very spec, which the user confirmed IS how brainstorming should work; (3) the user picks one; the controller folds the choice into the running spec and shows it back; then resumes the daemon for the NEXT decision — the `elicit` runner RE-PAUSES per decision (a genuine multi-pause loop, replacing today's single pause + finalize pass-through); (4) the daemon PROPOSES convergence when it judges the material decisions exhausted and the controller/user can OVERRIDE (raise another fork or stop early); (5) on convergence the ASSEMBLED spec is presented for ONE explicit final confirm, with reopen/revision of any prior decision allowed before it, and only after that final confirm is the SpecArtifact written.

## Scope boundary

Confined to the brainstorm `elicit` mechanism only — no other workflow stage changes. The SpecArtifact shape and the seed-focus.ts downstream contract (spec still seeds define/design.story) are unchanged. The existing guarantee that NOTHING is persisted until the user explicitly confirms is preserved (now via the final whole-spec confirm gate). Elicitation is not downgraded to the low-end local model (the daemon draft runs at mid tier). Deferred to the LLD as implementation detail (not scope): whether the mid-tier daemon draft also pulls repo/analyze grounding vs the running spec alone; the exact convergence-signal shape; and how 'reopen decision N' is represented in the resume payload.

## Non-goals

- Controller-only generation from a bare daemon decision slot
- Daemon low-end / local-shaper generation of decisions
- Deriving the whole decision list upfront then streaming it
- Upfront decision list with re-plan only on material scope change
- Committing the SpecArtifact as soon as decisions run out with no final confirm gate
- Per-decision hard lock with no reopen
- Daemon-only terminus
- User/controller-only terminus
- Changing the SpecArtifact shape or the seed-focus downstream contract
- Touching workflows other than the brainstorm elicit mechanism
- Downgrading elicitation to the low-end local model

## Decisions

- **Hybrid generation: the daemon drafts each decision + candidate options at MID tier, and the controller model refines them and authors the recommendation** — Brainstorm is accuracy-sensitive, design-seeding spec-shaping (a critical role), so the daemon draft is elevated off the cheap local model to the mid tier while the strong controller model refines + recommends.
  - Ruled out: _Controller-only generation from a bare daemon decision slot_, _Daemon low-end / local-shaper generation of decisions_
- **Adaptive sequencing: the daemon generates the NEXT single decision after each answer, grounded on all prior choices; the elicit runner re-pauses per decision (a genuine multi-pause loop)** — Later decisions are informed by earlier choices and forks can spawn or prune others; the extra mid-tier daemon draft per decision is acceptable under accuracy-first.
  - Ruled out: _Deriving the whole decision list upfront then streaming it_, _Upfront decision list with re-plan only on material scope change_
- **Incremental fold with a final whole-spec confirm gate, and reopen/revision of any prior decision allowed before the final confirm** — Preserves the existing 'nothing persisted until the user explicitly confirms' guarantee and adds safe revision; the SpecArtifact is written only after the final confirm.
  - Ruled out: _Committing the SpecArtifact as soon as decisions run out with no final confirm gate_, _Per-decision hard lock with no reopen_
- **Daemon proposes convergence when it judges decisions exhausted; the controller/user can override to add a decision or stop early** — The daemon guards completeness while the controller retains final say over the flow, matching 'controller owns the flow'.
  - Ruled out: _Daemon-only terminus_, _User/controller-only terminus_

## Citations

- **[[c1]]** `step-output` `s1` — "The confirmed elicit convergence: category=design; 4 decisions (hybrid mid-tier generation, adaptive per-decision loop, incremental fold + final confirm + reopen, daemon-proposes-convergence-controlle"
- **[[c2]]** `code` `src/workflow/runners/brainstorm/index.ts (elicit + finalizeElicit) — the current single-pause model this redesign replaces with an adaptive multi-pause decision loop.`
- **[[c3]]** `stakeholder` `User confirmation that the just-run decision-at-a-time session (one recommendation-with-options prompt at a time, recommended-first, fold + show, final confirm) IS exactly how the brainstorming session should work — the reference UX for the redesign.`
