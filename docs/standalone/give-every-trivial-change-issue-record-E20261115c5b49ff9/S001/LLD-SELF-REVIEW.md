# Design review record: LLD-c5b49ff953a9a295-s1

Review id `lld-c5b49ff953a9a295-s1`.

## Why a self-review

The daemon reviewer paused attempt 1 with `technical_retry_exhausted` during planning: "Unit /body/alternativesConsidered lacks matching substantive coverage", three retries, no chunk reviewed. This is the daemon design-review defect also seen on LLD-66d4d41d99f805af-s1 and LLD-7d2422c8f57fa483-s1. On those, the user directed a recorded controller self-review followed by an override approval. The same process is used here, by the party that wrote the LLD, so it is not independent.

## Decisions recorded before the review

- q1, the 16 existing headless trivial builds: the user chose the backfill (an ISSUE for each from its BUILD's request text, then completion), over leaving them as they are.
- ts1: ac1-ac5 are the five fix-intent points of ISSUE-c5b49ff953a9a295; ac6 covers the backfill.

## Round 1: controller self-review, changes requested

Checked against the code:

- **Routing.** `routeForSizeClass` (`src/workflow/triage/classify.ts:36-70`) and `buildNextCall` (`src/daemon/steps/triage-step/phases/classify.ts:41-100`) are the only places that send trivial work to build. Flipping both is enough.
- **Advance.** `nextAfterIssue` (`src/workflow/bugfix/next-after-issue.ts:26-95`) reads the stamped ISSUE, which carries `meta.issueHash`, so adding it to both emitted calls needs no new lookup. `design.story` already accepts `params.epicHash` for a standalone run: this LLD was produced that way.
- **Build identity.** `handleStandaloneImplement` (`src/daemon/steps/build-step/phases/implement.ts:142`) is the only place a focus-derived hash is minted. The `(standalone-bugfix)` and `(standalone-trivial)` targets both take the no-LLD path, so one refusal covers both.
- **Completion.** A trivial build under an ISSUE head completes today (BUILD-f0da1b8b9cdb28b6-s1, completed 2026-11-14), so no anchor change is needed.
- **The 16 headless builds.** 15 are approved and 1 (6fb63e5090d2e35f) is still a draft. Four of the approved ones have no code review but carry an override. Repair's settle step (`src/workflow/convert/settle.ts`, `COMPLETION_RULE_FROM` 2026-11-09T16:00Z) completes a Story only by its rules: an approval before the cutoff with an attributed override, or a later one by the live rule.

| Id | Severity | Finding | Change |
| :--- | :--- | :--- | :--- |
| f1-kind-persist-site | MED | `meta.kind` is written by `finalizeIssue` (`src/workflow/orchestrator.ts:908-926`), which builds the ISSUE meta from `intent.params` and today copies only `magnitude`. The LLD's data-model call sites omit it, so a build following the LLD could add the field to the type and renderer but never store it. | Name `finalizeIssue` as the site that persists `params.kind` ('defect' or 'change'; anything else refused) next to `magnitude`. |
| f2-backfill-completion-rules | MED | The backfill is described as "then completes each Story". Of the 16, one BUILD is still a draft and several approvals predate the completion rule. Forcing completion would bypass the rule repair already enforces, and would complete a Story whose BUILD was never approved. | The backfill is a repair rule: `repair-preview` lists one `backfill-issue` change per headless standalone trivial BUILD; `repair` writes the ISSUE (kind 'change', body from the BUILD's focus and triage rationale, anchor from the BUILD's `epicCreatedAt`) approved by the migration actor with the reason recorded; then the existing units and settle steps run and report completed, held or failed per Story. A draft BUILD gets its ISSUE but its Story is not settled. Add tests for the preview, the write, a held Story and the draft case (ac6). |
| f3-steering-sites | LOW | The steering update lists lines 231, 341, 463 and 557. Line 536 (the bugfix guide: "the standalone BUILD is the ledger entry") and line 342 say the same thing. | Include them; the steering test asserts no remaining "ledger entry" wording for a BUILD. |

The LLD is regenerated with these changes before round 2.

## Round 2: controller self-review, passed

Checked the regenerated LLD against the round-1 findings and the code:

- **f1.** `finalizeIssue` is now an API entry and a data-model call site (`src/workflow/orchestrator.ts:900-935`), storing `params.kind` and refusing an unknown value.
- **f2.** The backfill is the repair rule `backfill-issue`, ordered before `units`. Repair's units step names a Story only from LLD, PLAN, BUILD or CR records (`src/workflow/convert/units.ts:50-66`). Creating those units needs the Epic anchor, so the ISSUE must exist first, as the order gives. Settle reads the BUILD's approval state (`src/workflow/convert/settle.ts:46-49`), so the draft BUILD is not settled and pre-cutoff approvals without an override are held. The tests cover completed, held and draft cases and a part-way failure.
- **f3.** Steering lines 342 and 536 are included, with a test that no BUILD record is called a ledger entry.
- **Consistency.** ac1-ac6 each map to tests; the summary, contract, migration (7 steps) and open questions (none) agree.

| Id | Severity | Finding | Change |
| :--- | :--- | :--- | :--- |
| f4-mcp-descriptions | LOW | The MCP tool descriptions say a Trivial build is a no-LLD build with the focus as its spec and that `standalone.epicHash` is required only for a Small build (`src/mcp/server.ts:634`, `src/mcp/server.ts:638`), and the triage description lists "Trivial → build" (`src/mcp/server.ts:693-706`). Behaviour is enforced by the code (the triage nextCall and the build refusal), so this is wording, but agents read it. | Carried to the plan: update the three descriptions with the steering text. |
| f5-draft-backfill | LOW | The backfill approves the ISSUE of the one draft BUILD (6fb63e5090d2e35f) as well, although its work was never approved. | Carried to the plan: write that ISSUE as pending, not approved, so a person approves it with the BUILD. |

No open MED or HIGH findings. Two of three rounds used.
