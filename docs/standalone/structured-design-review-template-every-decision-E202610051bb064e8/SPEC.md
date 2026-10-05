<!-- insrc:artifact SPEC-1bb064e8e2a1edd1 -->

# Spec: Replace the single free-form design-review prompt with a structured review template for HLD and LLD documents.

**Category:** design

## Intent

Replace the single free-form design-review prompt with a structured review template for HLD and LLD documents.

Why. Today one prompt tells the reviewer to "extract EVERY load-bearing premise" (src/workflow/review/extract.ts). The reviewer attaches greps and `path:line` reads to each premise, a separate engine runs them, and a judge decides each premise from that output alone. Reviewing one 17-40 KB design on 2026-10-04/05 showed four failures:
- No bound. The non-controller reviewer extracted 37 to 48 premises, with one model call per premise run one after another: 12 minutes for one pass and 27 with the automatic second pass, about 90 model calls. Across 235 earlier reviews the controller, answering the same prompt, returned 7 premises on average and 21 at most.
- Trivial premises. Most of the 39 premises on the small design were "this file or symbol exists" checks or checks of the document against itself.
- Evidence too thin to judge. A read returns exactly one line, so a claim about a signature or a function body cannot be confirmed; a grep stops at 50 matches and filled up on docs/ files before reaching src/. The judge cannot look further.
- "Could not verify" counted as a defect. Those premises were rated medium, the same as a wrong claim, and blocked approval: 20 medium findings on a design in which two small points were actually wrong.

What the template does.
1. It is a fixed checklist, not an open instruction. The reviewer answers named check items instead of deciding for itself what to extract.
2. It varies by the intent the design serves. A design answering an ISSUE (a fix) gets a lower premise threshold; a design answering a SPEC (a feature or epic) gets a higher one. Each intent can also carry its own dimensions (what is checked).
3. The reviewer does its own checking. It has the code base and the relevant docs and fires its own probes. For any drill-down it uses insrc analyze: to learn how a module is structured, whether a capability already exists, who calls a symbol, or whether the code follows a documented rule. It reads as much of a file as the claim needs, not one line.
4. Every finding is clearly identified as one of two kinds and the two are never merged into one severity: "does not hold" (the design is wrong) or "could not verify" (the reviewer could not confirm it).
5. Only "does not hold" blocks approval. "Could not verify" is reported for the user to see and does not block.

## Scope boundary

Scope stops at how a design document (HLD or LLD) is reviewed. Nothing else in the flow changes: which artifacts are reviewed, when, and by which party stay as they are.

Left for the design stage, not decided here:
- The check items and dimensions for each intent.
- The threshold numbers. Reference points from the record: 7 premises on average and 21 at most in 235 controller reviews; 37 to 48 from the uncapped non-controller reviewer; an interim cap of 16, tried on 2026-10-05, brought one review from 13 minutes to 5.
- Whether the non-controller reviewer, which runs as a `claude` or `codex` CLI subprocess started by insrc, has tools and insrc analyze available today, and what enabling them takes.
- What replaces the interim 16-premise cap and the "no placeholder line anchor" rule, both of which sit uncommitted in the working tree.
- Whether the automatic second review pass after auto-fixes stays.

## Non-goals

- Pre-declared probes run by a separate engine with a judge that only sees that output
- A single uncapped 'extract every premise' instruction
- Reliance on a free-form steering prompt alone
- Named dimensions with only a premise budget and no checklist
- A checklist plus free-form extra premises chosen by the reviewer
- Separate review checklists for the ISSUE, SPEC or DEF documents themselves
- One threshold for every design
- Merging 'does not hold' and 'could not verify' into one severity scale
- Blocking approval on 'could not verify'
- Any change to which artifacts are reviewed: a DEF is still reviewed as today, and ISSUE, SPEC and PLAN still need only user approval
- Any change to another part of the workflow

## Decisions

- **The reviewer fires its own probes and uses insrc analyze for drill-down.** — User: "the reviewer has access to the code base and all the relevant docs, should be able to fire their own probes" and "there is insrc analyze that it can use for any drill down information required". The pre-declared probes returned one line per read and capped greps at 50 matches, which left sound claims unverifiable.
  - Ruled out: _Pre-declared probes run by a separate engine with a judge that only sees that output_
- **A fixed checklist per kind, with its own dimensions and its own premise threshold.** — User: "I prefer a per-kind checklist ... we can also specify dimensions for each". Two reviewers given the same open instruction returned 7 and 40 premises; a checklist is bounded and gives the same review whoever runs it.
  - Ruled out: _A single uncapped 'extract every premise' instruction_, _Reliance on a free-form steering prompt alone_, _Named dimensions with only a premise budget and no checklist_, _A checklist plus free-form extra premises chosen by the reviewer_
- **The kind is the intent the design serves: a design for an ISSUE gets a lower threshold than a design for a SPEC.** — User: "the review should only focus on design, the threshold applies to the intent of the design ISSUE vs SPEC". A fix is narrower than a feature, so its design carries fewer premises worth checking.
  - Ruled out: _Separate review checklists for the ISSUE, SPEC or DEF documents themselves_, _One threshold for every design_
- **Findings are clearly identified as 'does not hold' or 'could not verify'; only 'does not hold' blocks approval.** — User: "Separate 'wrong' from 'could not verify'. <- clear identification". On 2026-10-05 ten "partly unverifiable" findings blocked a design whose one real defect was a mis-cited line.
  - Ruled out: _Merging 'does not hold' and 'could not verify' into one severity scale_, _Blocking approval on 'could not verify'_
- **Scope is the design review flow only.** — User: "nothing changes the current flow, DEF is still reviewed as it happens today. the brainstorming we are doing right now is only for the Design review flow".
  - Ruled out: _Any change to which artifacts are reviewed: a DEF is still reviewed as today, and ISSUE, SPEC and PLAN still need only user approval_, _Any change to another part of the workflow_
