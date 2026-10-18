<!-- insrc:artifact BUILD-315d510cb28100e2-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-18T14:16:36.004Z  ·  **Updated:** 2026-10-18T14:53:33.952Z

**Commit:** 404fb77f

## Summary

approval-gate.ts is generalized: authorizeStageChange maps an artifact to its stage unit(s) and asks a decide function; authorizeApproval (approve-local) is unchanged in behaviour, authorizeFindingApply asks review-fix, and reviewFixModeFor decides through reviewFixDecision (apply-auto-fixes only when every unit allows). resolveReviewFinding (resolve.ts) calls authorizeFindingApply for action apply before reading the markdown or writing anything and throws TeamGateRefusedError for a non-holder; accept, override and defer are untouched. Both automatic review paths consult reviewFixModeFor before applyAutoFixes (verdicts.ts and run-artifact.ts) and, when report-only, skip the fixes so the review still runs, stamps its findings, writes meta only and keeps the revision. The terminal resolve case prints '✗ not applied — <reason>'. Tests: gate-resolve-finding.test.ts (apply refused with markdown and artifact byte-identical, accept/override/defer still run, holder and no-policy apply work), gate-review-fix.test.ts (verdicts phase and reviewArtifactFile: non-holder reports findings, applies no fix and keeps revision 2; holder applies and mints revision 3), and a resolve test in gate-refusal-output.test.ts. The review, cli, workflow and review-step suites pass apart from the known TUI poll-interval timing flake.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✗ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/AMD-315d510cb28100e2-12.json` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `.insrc/artifacts/PLAN-315d510cb28100e2-s5.json` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S005/PLAN.md` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/cli/__tests__/gate-refusal-output.test.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/daemon/steps/review-step/__tests__/gate-review-fix.test.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/daemon/steps/review-step/phases/verdicts.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/workflow/__tests__/gate-approve.test.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/workflow/review/__tests__/gate-resolve-finding.test.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/workflow/review/resolve.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/workflow/review/run-artifact.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/workflow/team/__tests__/gate.test.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/workflow/team/__tests__/review-fix-decision.test.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/workflow/team/approval-gate.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-18T14:53:33.952Z)
