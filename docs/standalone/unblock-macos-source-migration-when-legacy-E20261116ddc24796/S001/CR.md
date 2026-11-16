<!-- insrc:artifact CR-ddc24796d6d788e6-s1 -->

# Code review: s1

Status: **incomplete** · task-based schema version 3

## legacy-esbuild-ddc24796 — attempt 1: admission failed

Technical admission only; scope was not verified and no task assessment was performed. code_review_admission_failed (tests): tests: Reported execution needs provenance

## legacy-esbuild-ddc24796 — attempt 2

Scope: task s1 · reviewer: daemon · 2026-11-16T05:46:31.273Z

1 selected task assessment(s): incomplete.

### Submitted scope

- `d02fb640882dd3a89840871d1631398f6b69c8e4:src/daemon/__tests__/legacy-cutover-admission.test.ts` — [{"after":[7,7]},{"after":[16,16]},{"after":[19,19]},{"after":[224,224]},{"after":[227,227]},{"after":[234,287]}]
- `d02fb640882dd3a89840871d1631398f6b69c8e4:src/daemon/legacy-cutover-admission.ts` — [{"after":[8,8]},{"after":[10,10]},{"after":[13,13]},{"after":[193,212]},{"after":[214,214]},{"after":[216,217]},{"after":[219,219]},{"after":[221,222]},{"after":[224,230]},{"after":[244,249]},{"after":[253,282]},{"after":[297,297]},{"after":[301,301]},{"deletionAt":304},{"after":[307,308]},{"after":[347,347]},{"after":[351,352]}]
- `d02fb640882dd3a89840871d1631398f6b69c8e4:src/daemon/managed-update-recovery.ts` — [{"after":[25,25]},{"after":[398,399]},{"after":[428,430]}]

### Verified final scope: d02fb640882dd3a89840871d1631398f6b69c8e4

Projection: 93c7a80a513d6f62e65334e1ee52c9ee1eebb0a464bb70049e871853d174516d · attribution: accepted

- `src/daemon/__tests__/legacy-cutover-admission.test.ts` (0b4f9d67b79bf2fe1c7df21f07a0afb7861c7b41) — selected: [{"after":[7,7]},{"after":[16,16]},{"after":[19,19]},{"after":[224,224]},{"after":[227,227]},{"after":[234,287]}]
- `src/daemon/legacy-cutover-admission.ts` (482f156b5db3f09107ce52dee7237222cccdf3b4) — selected: [{"after":[8,8]},{"after":[10,10]},{"after":[13,13]},{"after":[193,212]},{"after":[214,214]},{"after":[216,217]},{"after":[219,219]},{"after":[221,222]},{"after":[224,230]},{"after":[244,249]},{"after":[253,282]},{"after":[297,297]},{"after":[301,301]},{"after":[307,308]},{"after":[347,347]},{"after":[351,352]},{"deletionAt":304}]
- `src/daemon/managed-update-recovery.ts` (57f8e69bd9756df78577ed6fdbbafa3cf268d098) — selected: [{"after":[25,25]},{"after":[398,399]},{"after":[428,430]}]
- Task s1: reassess; changes 0, 1, 2; identity a0d57c6e0306867dff01026be4f21bb9397a675bc3e13d6df4518bfe4c4d3bed

Reassessed s1 against the pinned issue and attempt 2. The issue requires narrowly admitting the verified predecessor-owned esbuild helper, waiting for its verified exit before candidate activation, and preserving fail-closed behavior for unrelated or ambiguous processes. All listed changes and both supplied tests belong to this task; the unchanged run-guard regression verifies adjacent update compatibility without expanding finding scope.

### s1: incomplete

Inspected the pinned issue, all three submitted change segments, and both relevant test files. The focused tests assert verified helper admission, rejection of an unrelated helper, and refusal to proceed while the admitted helper remains alive. The required disposable-VM acceptance checks are not established by the inspected pinned evidence, so the review is incomplete.

Coverage: **partial** — The focused regression bodies cover helper admission, unrelated-process rejection, and helper-exit quiescence. The unchanged legacy-run-guard tests exercise guard transfer and recovery, but do not directly verify the new managed-update wiring. The issue also requires rerunning signed source migration, managed restart, MCP readiness, and seeded-state checks on a disposable VM; I could not verify those checks against the reviewed commit.


Review limitations (blocking):

- Could not verify the issue's disposable-VM acceptance checks (signed source migration, managed restart, MCP readiness, and seeded-state checks) against the reviewed commit. The supplied builder test report covers focused macOS tests only.

Optional verification and advice (nonblocking):

- Optional execution: I did not run tests or integration checks. The supplied focused-test pass is builder-reported; I did not independently execute it. The supplied evidence does not establish the disposable-VM checks.

Inspected references:

- `733f0077ff7f3fa7c9d772e5a850719c9ec7c9c8:docs/standalone/unblock-macos-source-migration-when-legacy-E20261116ddc24796/ISSUE.md`
- `d02fb640882dd3a89840871d1631398f6b69c8e4:src/daemon/legacy-cutover-admission.ts`
- `d02fb640882dd3a89840871d1631398f6b69c8e4:src/daemon/managed-update-recovery.ts`
- `d02fb640882dd3a89840871d1631398f6b69c8e4:src/daemon/__tests__/legacy-cutover-admission.test.ts`
- `d02fb640882dd3a89840871d1631398f6b69c8e4:src/daemon/__tests__/legacy-run-guard.test.ts`
## legacy-esbuild-ddc24796 — attempt 3

Scope: task s1 · reviewer: daemon · 2026-11-16T06:17:23.099Z

1 selected task assessment(s): incomplete.

### Submitted scope

- `d02fb640882dd3a89840871d1631398f6b69c8e4:src/daemon/__tests__/legacy-cutover-admission.test.ts` — [{"after":[7,7]},{"after":[16,16]},{"after":[19,19]},{"after":[224,224]},{"after":[227,227]},{"after":[234,287]}]
- `d02fb640882dd3a89840871d1631398f6b69c8e4:src/daemon/legacy-cutover-admission.ts` — [{"after":[8,8]},{"after":[10,10]},{"after":[13,13]},{"after":[193,212]},{"after":[214,214]},{"after":[216,217]},{"after":[219,219]},{"after":[221,222]},{"after":[224,230]},{"after":[244,249]},{"after":[253,282]},{"after":[297,297]},{"after":[301,301]},{"deletionAt":304},{"after":[307,308]},{"after":[347,347]},{"after":[351,352]}]
- `d02fb640882dd3a89840871d1631398f6b69c8e4:src/daemon/managed-update-recovery.ts` — [{"after":[25,25]},{"after":[398,399]},{"after":[428,430]}]
- `60a7c1cc885c104360a64a570f5134cbb2de6169:src/daemon/__tests__/legacy-cutover-admission.test.ts` — [{"after":[7,7]},{"after":[239,239]},{"after":[241,243]},{"after":[253,253]},{"after":[268,268]}]
- `60a7c1cc885c104360a64a570f5134cbb2de6169:src/daemon/legacy-cutover-admission.ts` — [{"after":[194,196]},{"after":[198,199]},{"after":[201,202]},{"after":[204,218]},{"after":[250,250]},{"after":[258,258]}]
- `ba9d1cc82ecd39fba270377a18938f56f1ad5bf3:src/daemon/legacy-cutover-admission.ts` — [{"after":[197,200]},{"after":[210,210]},{"after":[212,212]},{"after":[214,214]},{"after":[218,218]},{"after":[221,226]}]

### Verified final scope: ba9d1cc82ecd39fba270377a18938f56f1ad5bf3

Projection: bd5a4fc88054af5d9c11dff9a4860f2c9f2e1b9c2e9218ae092845412493e824 · attribution: accepted

- `src/daemon/__tests__/legacy-cutover-admission.test.ts` (0ec73e569ede67636dbb7fa7b53abde7129d229d) — selected: [{"after":[16,16]},{"after":[19,19]},{"after":[224,224]},{"after":[227,227]},{"after":[234,238]},{"after":[240,240]},{"after":[244,252]},{"after":[254,267]},{"after":[269,291]}]
- `src/daemon/legacy-cutover-admission.ts` (8776ec39962df1474115799c9e81ba72e0eafab2) — selected: [{"after":[8,8]},{"after":[10,10]},{"after":[13,13]},{"after":[193,193]},{"after":[201,201]},{"after":[204,204]},{"after":[207,207]},{"after":[219,220]},{"after":[227,234]},{"after":[236,236]},{"after":[238,239]},{"after":[241,241]},{"after":[243,244]},{"after":[246,252]},{"after":[266,271]},{"after":[275,304]},{"after":[319,319]},{"after":[323,323]},{"after":[329,330]},{"after":[369,369]},{"after":[373,374]},{"deletionAt":326}]
- `src/daemon/managed-update-recovery.ts` (57f8e69bd9756df78577ed6fdbbafa3cf268d098) — selected: [{"after":[25,25]},{"after":[398,399]},{"after":[428,430]}]
- `src/daemon/__tests__/legacy-cutover-admission.test.ts` (0ec73e569ede67636dbb7fa7b53abde7129d229d) — selected: [{"after":[7,7]},{"after":[239,239]},{"after":[241,243]},{"after":[253,253]},{"after":[268,268]}]
- `src/daemon/legacy-cutover-admission.ts` (8776ec39962df1474115799c9e81ba72e0eafab2) — selected: [{"after":[194,196]},{"after":[202,203]},{"after":[205,206]},{"after":[208,209]},{"after":[211,211]},{"after":[213,213]},{"after":[215,217]},{"after":[253,253]},{"after":[261,261]}]
- `src/daemon/legacy-cutover-admission.ts` (8776ec39962df1474115799c9e81ba72e0eafab2) — selected: [{"after":[197,200]},{"after":[210,210]},{"after":[212,212]},{"after":[214,214]},{"after":[218,218]},{"after":[221,226]}]
- Task s1: reassess; changes 0, 1, 2, 3, 4, 5; identity 0f8dea20c332b6ac88fa2b69d9705a4ed1ba4495ea3a76ba6eed789d84225594

Attribution complete for s1. All six listed change entries and both supplied tests concern the legacy cutover admission behavior or its guard compatibility evidence. No code findings are included.

### s1: incomplete

Reviewed all three selected changed files, the pinned issue, and both relevant test bodies at the submitted revision. The code and focused tests support narrow admission of the verified esbuild child, rejection of an unrelated helper, and waiting for helper exit before candidate staging. The supplied VM summary reports signed migration, MCP readiness, and seeded-state checks passed, but managed restart failed twice during native shutdown; that acceptance check remains unresolved, so the task is incomplete.

Coverage: **verified** — Completed the coverage review of both relevant test files. The cutover tests assert helper admission, unrelated-process rejection, and refusal to proceed while the admitted helper remains alive; the alias case also exercises the two hard-linked binary paths. The run-guard tests assert identity-bound transfer and recovery around interruptions. These bodies do not directly exercise completeManagedLegacyMigration's wiring; the supplied VM summary provides integration evidence, including the failed restart, but no pinned test result establishes a successful managed restart.


Review limitations (blocking):

- The required managed-restart acceptance check is not satisfied by the supplied VM summary: restart returned failure twice after the migrated Node process aborted during native shutdown. Although the supervisor reportedly restarted it, successful managed restart qualification is not established.

Optional verification and advice (nonblocking):

- Optional execution: I did not run tests, integration checks, typechecks, or builds. The focused test pass is builder-reported; I did not independently execute it. The VM outcomes are supplied in the task summary, not independently verified from pinned logs.

Inspected references:

- `733f0077ff7f3fa7c9d772e5a850719c9ec7c9c8:docs/standalone/unblock-macos-source-migration-when-legacy-E20261116ddc24796/ISSUE.md`
- `ba9d1cc82ecd39fba270377a18938f56f1ad5bf3:src/daemon/legacy-cutover-admission.ts`
- `ba9d1cc82ecd39fba270377a18938f56f1ad5bf3:src/daemon/managed-update-recovery.ts`
- `ba9d1cc82ecd39fba270377a18938f56f1ad5bf3:src/daemon/__tests__/legacy-cutover-admission.test.ts`
- `ba9d1cc82ecd39fba270377a18938f56f1ad5bf3:src/daemon/__tests__/legacy-run-guard.test.ts`
- `60a7c1cc885c104360a64a570f5134cbb2de6169:src/daemon/legacy-cutover-admission.ts`
- `60a7c1cc885c104360a64a570f5134cbb2de6169:src/daemon/__tests__/legacy-cutover-admission.test.ts`

Test: `/opt/homebrew/opt/node@22/bin/node --import tsx --test src/daemon/__tests__/legacy-cutover-admission.test.ts src/daemon/__tests__/legacy-run-guard.test.ts` — pass
Builder-reported pass on Apple Silicon macOS with Node 22; not executed by this review. The cited build record reports the focused file run at d02fb6408.

Test: `/opt/homebrew/opt/node@22/bin/node --import tsx --test src/daemon/__tests__/legacy-cutover-admission.test.ts src/daemon/__tests__/legacy-run-guard.test.ts` — pass
Builder-reported pass on Apple Silicon macOS with Node 22; not executed by this review.
