<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T17:56:43.986Z

**Commit:** 168e7b85

## Summary

parkPlan now validates the branch before it touches the tracker or git: right after the Task check it resolves the repo's branch pattern and the Epic slug (a file read) and calls handoffBranchName, so a bad pattern refuses with no tracker context, no policy read and no git command. A test case shows this: with a bad pattern the stubbed tracker loader is never called (0 loads). The tracker context is built with createIssue false (no issue is ever created), and the test's fake port now records every write path: addAssignee and setAssignee are counted and any access to issueOps throws; after every refusal and plan in the test (including the success paths) the recorded writes are empty, git status/branches/refs are unchanged and the run store is unchanged. About the policy reader the judge raised: reading the team policy is what every gate call does (team claim, approve, authoring), and its only side effect is that the first time it sees a policy file it records, once and create-only, in the user's own ~/.insrc/team area, that this repo is a team repo (s2's sighting record, written under the reader's lock and never on the repo or the tracker). That is the gate's standard read, not a write by park, and no refusal in the LLD can avoid reading who holds the unit; the LLD's 'writes nothing' for park refusals is about the repository, the branch, the tracker and the run store, which the assertions now cover. Earlier fixes stand (per-component .lock refusal, park-offer.ts untouched). handoff-park-plan, handoff-pure and park-offer tests pass; tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✗ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/s6-open-issues.md` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/daemon/steps/workflow-step/park-offer.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/workflow/team/__tests__/handoff-park-plan.test.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T17:56:43.986Z)
