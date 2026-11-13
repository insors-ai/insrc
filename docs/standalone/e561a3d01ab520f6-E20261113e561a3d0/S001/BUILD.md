<!-- insrc:artifact BUILD-e561a3d01ab520f6-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-13T05:30:13.434Z  ·  **Updated:** 2026-11-13T05:33:29.561Z

**Commit:** 9624f68d6

## Scope

Keep code-review attribution prompts concise

Submit the committed whole-story packet design/review-worker-isolation-e4af6312.packet.json as review worker-isolation-e4af6312-whole-story attempt 1. The Codex attribution session exits before assessing any code: input_too_large, actual_chars 1122790 versus max_chars 1048576. Expected: concise task-scope allocation instructions with pinned references and reviewer-driven detail lookup, followed by complete per-task review; no need to fit the whole story's content into the attribution input. Evidence is retained in .insrc/tmp/code-review/worker-isolation-e4af6312-whole-story.json.

The shared attributionPrompt in src/workflow/code-review/task-review/assessment.ts interpolates the full committed Plan, functional summary, selectedCode for every projected change, all test execution details, and serialized feedback history into one input before task allocation. Both src/workflow/code-review/task-review/coordinator.ts and src/workflow/code-review/task-review/controller.ts invoke this function. Consequently task-level review partitioning does not bound the preceding attribution input. The saved CLI diagnostic confirms rejection at turn/start, not exhausted model output.

Make task-scope attribution a concise reference-based instruction shared by daemon and controller reviewers. Reference immutable pinned documents, packet/checkpoint input, indexed change/test inventory and prior feedback instead of embedding complete source, artifact bodies, test outputs or history. Let the reviewer inspect the pinned details required to allocate scope. Preserve exact change/test indexes, required replacement-witness relationships, complete-coverage validation, applicable-task rules and sequential-attempt/reuse semantics. Do not truncate selected scope, raise CLI limits, relax finding authorization, change checkpoint schemas, or redesign task assessment. Add regression coverage demonstrating that large source/artifact/test/history content does not inflate attribution prompts, reference resolution remains pinned and omitted scope is still rejected. Resume the blocked independent review only after this tracked correction is built and approved.

## Summary

Replaced full source, Plan body, test output and history interpolation in shared scope attribution with pinned document pointers and indexed source/test inventories. Both reviewer routes retain complete-scope and witness validation. Focused fake-CLI regressions pass23/23; TypeScript is clean; actual failed packet produces112888-character attribution prompt with all344changes,115testfiles,16tasks retained.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-b7b47a99a6c59f21.json` — **insrc-build** (2026-11-13T05:33:29.561Z)
- `.insrc/artifacts/ISSUE-b7b47a99a6c59f21.log.jsonl` — **insrc-build** (2026-11-13T05:33:29.561Z)
- `docs/standalone/keep-code-review-attribution-prompts-concise-E20261113b7b47a99/ISSUE.md` — **insrc-build** (2026-11-13T05:33:29.561Z)
- `src/workflow/code-review/task-review/__tests__/concise-attribution.test.ts` — **insrc-build** (2026-11-13T05:33:29.561Z)
- `src/workflow/code-review/task-review/__tests__/effective-scope.test.ts` — **insrc-build** (2026-11-13T05:33:29.561Z)
- `src/workflow/code-review/task-review/__tests__/selected-code.test.ts` — **insrc-build** (2026-11-13T05:33:29.561Z)
- `src/workflow/code-review/task-review/assessment.ts` — **insrc-build** (2026-11-13T05:33:29.561Z)
- `design/concise-attribution-e561a3d0.packet.json` — **insrc-build** (2026-11-13T05:33:29.561Z)
