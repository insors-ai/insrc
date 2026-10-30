<!-- insrc:artifact EXT-c32aa60534232f36-s7 -->

# Extend: review-planned-changes-through-agent-investigation — Make scoped reviews usable with simple assessments and durable progress

> **Extends Epic `review-planned-changes-through-agent-investigation`** — this builds on existing docs + code; no new Epic was created.

**Scope:** L   ·   **New Story:** `s7`

Extends Epic c32aa60534232f36 — one remediation Story builds on the existing review subject, evidence, recovery and publication code; no new epic or storage platform.

## Added Story

### s7: Make scoped reviews usable with simple assessments and durable progress

**User value:** A developer obtains an independent, useful review of the exact built changes, sees progress survive interruption, and can enable a proven review mode without repeated evidence-approval ceremonies. Existing safeguards remain intact and unavailable evidence is clear.

**Acceptance criteria:**
- **ac1:** Given A built Story and an explicitly selected immutable review scope, when an independent reviewer investigates the change, then the reviewer can read the selected changes and surrounding pinned context and submit a block assessment without constructing internal run digests, ownership generations, sequence counters or complete coverage-row objects; host-owned binding, provenance and scope checks remain authoritative..
- **ac2:** Given Added, deleted or insertion-only changes and a rejected evidence request, when navigation is presented and source is inspected, then supplied references are valid for their actual source spans, contextual reads are clearly distinguished from changed scope, and safe actionable refusal details identify how to correct a request; bounded diagnostics retain the failed operation's cause without leaking private source or credentials..
- **ac3:** Given A review has established a block assessment and further investigation remains, when the reviewer moves on, its attempt approaches the existing budget/time cap, or the run is cancelled or interrupted, then useful assessed progress is durably acknowledged promptly, unfinished work yields explicitly, and compatible resume retains accepted work without repeating it; cross-file investigation stays possible and one current owner controls updates..
- **ac4:** Given Approved tasks, applicable design expectations and selected changes include related requirements or missing evidence, when coverage and results are presented, then the reviewer and user receive concise grouped expectations with traceability to all applicable obligations, no fabricated satisfaction and an explicit useful inconclusive report when evidence is missing; inconclusive work never becomes a successful complete review or automatic BUILD approval..
- **ac5:** Given A qualified installed backend and an operator considering a bounded pilot or default adoption, when readiness is checked or ordinary review implementation code changes, then one understandable operational decision exposes actual compatibility, test and live-review evidence without repeated standalone approval workflows for fixture outputs; isolation qualification follows the actual execution boundary, source/contract freshness remains enforced, and default activation still requires explicit human signoff..
- **ac6:** Given The qualified Claude source-only path is the first deployment target, when representative real clean-change and known-defect reviews and a cancel/resume/concurrent-owner scenario are exercised, then the existing engine produces useful durable progress and a correct final result or explicit limitation through normal admission, recorded evidence supports the activation decision, and indexed enrichment and other backends can be enabled separately only after their own capability checks..
- **ac7:** Given The implementation is ready for independent final Story review, when build validation and Story completion are performed, then task validation precedes final code review and final code review precedes completion approval, with no circular prerequisite, no silent review bypass and no relabelling of earlier failed acceptance as passed; existing legacy/design-review compatibility, accuracy policy, CLI-only cloud access and cancellation/budget controls remain preserved..

## Building on

- `doc` docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/DEF.md
- `doc` docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/HLD.md
- `code` src/daemon/review-investigation-repository.ts
- `code` src/daemon/review-investigation-adoption.ts

## Next

Proposed HLD amendment `AMD-c32aa60534232f36-2` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-c32aa60534232f36-2`) and the updated Epic, then run `design.story` for the new Story `s7` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"c32aa60534232f36","storyId":"s7"}
```
