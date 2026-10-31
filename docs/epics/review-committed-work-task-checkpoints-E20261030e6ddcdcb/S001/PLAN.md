<!-- insrc:artifact PLAN-e6ddcdcb3d9cf330-s1 -->

# Plan: STORY-e6ddcdcb3d9cf330-s1

## Summary

**Epic:** `review-committed-work-task-checkpoints`
**LLD run:** `wf-1793389354040-ltweh8`
**LLD effective hash:** `68fe25ca25dc...`

Build the selected-change review path first and obtain a useful task assessment with a durable checkpoint early. Then publish it through the versioned CR format, connect the controller route, and verify shared evidence policy and compatibility using focused tests. Recovery selection and full worker/approval cleanup integration remain in later stories.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Validate selected-change packets and ordinary task results | M | — | — | unit: selected-change packet: commit pointers, exact ranges, committed documents and excluded same-commit changes; unit: derived tasks: pinned dependencies, S/M/L sizes and complete selected-change attribution; unit: ordinary results: required evidence, coverage strength, supported severity and nonblocking advice | [[c1]] [[c2]] |
| 2 | **`t2`** Run a useful task review with a durable checkpoint | L | — | `t1` | integration: task review admission: short acknowledgement, initial atomic JSON and same-id exclusion; integration: task execution: checkpoint before next task, one size-based deadline, failure continuation and no automatic retry; integration: code-task provider tools: committed reads, permitted target tests and unchanged design-review defaults; live: early installed review: useful evidence-backed task assessment and durable checkpoint with CR publication explicitly pending | [[c1]] [[c2]] [[c3]] [[c4]] |
| 3 | **`t3`** Publish task-based CR records with version-aware readers | L | — | `t2` | integration: task-based CR: version-2 validation/rendering and version-1 compatibility without fabricated dimensions; integration: CR publication: idempotent scoped summary and retained checkpoint on publication failure; integration: CR readers: partial task scope, incomplete/failed results and unknown versions cannot satisfy story review; live: early installed review publication: saved actual assessment becomes canonical CR without another model review | [[c1]] [[c2]] [[c5]] |
| 4 | **`t4`** Connect controller review to the same task coordinator | M | — | `t2`, `t3` | integration: controller parity: actual independent-party routing and equivalent assignment/result/CR semantics; integration: controller submissions: replay idempotency, conflicting/foreign result refusal and missing-checkpoint errors; integration: review disconnect: stop controller work and retain completed tasks while daemon reviewer outlives submitter | [[c1]] [[c2]] [[c3]] [[c5]] |
| 5 | **`t5`** Verify review evidence policy and focused compatibility | L | — | `t1`, `t2`, `t3`, `t4` | unit: review evidence policy: body-only logic, missing graph/run evidence and unused test-helper coverage; unit: review quality policy: target-language conventions, encapsulation/readability/naming and approved/native framework fallback; integration: review policy parity: common prompt/result classification across supported routes without coding/build-validation changes; smoke: deployable task review: production build and affected provider/backend/CR regressions with legacy/design routing preserved | [[c1]] [[c3]] [[c4]] [[c5]] [[c6]] |

### 1.1 TASK-e6ddcdcb3d9cf330-s1-t1 — Validate selected-change packets and ordinary task results

Add the minimal S1-owned sc1/sc2/sc3 types and validators, committed document/change lookup and derived task assignments. Keep the submitted file/segment selection authoritative; commits are lookup pointers. Validate ordinary findings, coverage strength, limitations and advice without introducing ledger aliases or proof machinery.

**Acceptance checks:**
- Selected segments resolve through their supplied commit/parent pointers; unrelated same-commit changes never enter scope, and no final/head commit is required.
- Committed Story/LLD/Plan and complete tests are validated once; assignments derive task order, S/M/L size and attribution from pinned inputs without losing selected changes.
- Ordinary task-result validation prevents an empty findings list or missing evidence from becoming a false pass; optional advice remains separate.
- Types retain a single attempt collection and version-2 CR distinction; no additional persisted authority or coding/build-validation changes.

### 1.2 TASK-e6ddcdcb3d9cf330-s1-t2 — Run a useful task review with a durable checkpoint

Implement the smallest host-owned task execution path over existing reviewer providers: short admission, atomic JSON, per-task deadline and serial continuation. Exercise an actual useful installed review early, recording its assessment/checkpoint; permanent CR completion remains explicitly pending until t3. Keep code-task tool access distinct from unchanged design-review defaults.

**Acceptance checks:**
- A fresh request writes initial header/submitted input and returns id/attempt/path/status without waiting for model review; duplicate active id refuses before provider use.
- One task assessment is validated and atomically saved before the next task begins; the controller can read valid JSON while daemon work runs.
- One deadline covers exploration/tests/output validation: S/M/L 5/10/15 minutes; timeout is incomplete, provider/invalid-result error failed, remaining tasks continue and no automatic full-task retry occurs.
- Code-task evidence access reads supplied committed references and permits relevant target tests through supported existing permissions; unsupported routes remain explicit and design-review defaults are not relaxed.
- Obtain one real evidence-backed assessment/checkpoint on a small selected committed subject. Label CR publication pending until t3; do not claim completed review or task approval from a mock. If daemon deployment is required, stop at that operational prerequisite rather than building downstream machinery to avoid the live test. The t3 publication seam consumes this retained result without implementing S2 recovery selection.

### 1.3 TASK-e6ddcdcb3d9cf330-s1-t3 — Publish task-based CR records with version-aware readers

Reuse the existing CR identity and canonical round writer for a version-2 task-based body, with its own validation/rendering and version-aware read/gate handling. Complete publication of the early task assessment without another model call where its checkpoint is compatible.

**Acceptance checks:**
- New task-based CRs validate without fabricated DimensionResult fields or invocation of the legacy dimension/chunk engine; version-1 records keep their existing interpretation.
- Permanent summaries retain selected scope, reviewer provenance, source-attempt attribution, findings, coverage strength, limitations and advice without copying full tool transcripts.
- Publish idempotently by review-id/attempt and mark the attempt terminal only after the CR is durable; failures retain task results and pending publication.
- New-format failed/incomplete/changes_requested results and unknown versions cannot become pass/no-review success; task-only pass is not whole-story signoff. Do not implement S3 approval cleanup. S1 changes only version/scope interpretation; approval-event wiring and deletion remain S3.
- Show the early real assessment and its checkpoint projected into a readable canonical CR; reuse the recorded result rather than automatically re-review the subject.

### 1.4 TASK-e6ddcdcb3d9cf330-s1-t4 — Connect controller review to the same task coordinator

Add controller assignment/result exchange over the same admission, result validation, checkpoint and CR contracts. Preserve actual other-party routing and the explicit disconnect distinction; leave full multi-worker integration to S3.

**Acceptance checks:**
- Controller-built code routes to daemon review; daemon-built code routes to the actual controller. Caller-provided party labels cannot bypass that selection.
- Controller receives one assignment at a time and submits ordinary feedback through daemon validation/writes; a valid result returns the next assignment or completed metadata.
- An identical accepted submission replay is idempotent; wrong-party/task, conflicting replay and missing-checkpoint requests produce actionable errors without mutation.
- Controller disconnect retains completed tasks and stops its unfinished execution; daemon reviewer work outlives the submitting request. Explicit recovery selection remains S2, actual session-thread integration/concurrency cleanup remains S3.
- Equivalent assessments on both routes produce equivalent status, scoped results and CR content, with actual reviewer provenance retained.

### 1.5 TASK-e6ddcdcb3d9cf330-s1-t5 — Verify review evidence policy and focused compatibility

Complete shared prompt/result-policy fixtures and focused first-attempt failure/compatibility checks. Cover meaningful implementation, test coverage and target-convention evidence in both reviewer routes; do not expand into coding or build-validation changes, coverage instrumentation or broad live benchmarks.

**Acceptance checks:**
- Body-only regressions require implementation evidence; missing graph/run records and unsupported verification remain limitations, not fabricated HIGH/MED or false pass.
- Passing files with unused helpers do not prove executed assertions. Revision-mismatched test results cannot establish reviewed behavior.
- Review fixtures cover Python/JS/TS/Go/JVM conventions/verification limits, encapsulation and responsibility boundaries, readability extremes, local/fallback naming and approved-framework/native fallback; optional taste/framework advice does not request changes. These are focused review-input/result fixtures, not a language execution benchmark or new test adapters.
- Shared prompt and result normalization apply equivalently across daemon/controller and supported planned/standalone/bugfix entrypoints; no separate coding/build validation adapter changes are included.
- Affected backend/provider/CR regression checks and production build pass. Preserve early actual live evidence unless a changed prerequisite or failure requires a targeted rerun; no repeated broad model sweep, automatic extra review rounds or legacy-engine deletion.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| packet scope: selected segments only, commits as pointers, no final/head commit or generic-diff requirement | `t1` |
| packet evidence: valid parent/blob ranges, committed documents, root/insertion/deletion/rename and unsupported content | `t1` |
| task assignment: pinned Plan dependency order, S/M/L sizing, multi-task attribution and no omitted selected changes | `t1` |
| result policy: required unknown evidence prevents pass; optional advice never becomes changes_requested; supported HIGH/MED retained | `t1`, `t5` |
| review evidence fixtures: body-only defect, absent graph/run evidence, unused helper in passing test file, naming/readability/encapsulation and native-framework fallback | `t5` |
| daemon/controller contract parity: same assignment/result normalization, scope, statuses and independent-party checks | `t4`, `t5` |
| provider code-task tools: focused committed reads and permitted target test route, unsupported route explicit, no design-review default permission changes | `t2` |
| CR compatibility: version-1 unchanged; version-2 task body validated/rendered without legacy dimensions; unknown version refuses | `t3` |
| controller result replay: identical accepted result is idempotent, conflicting or wrong task/party refuses | `t4` |
| short start: initial JSON is durable before acknowledgement and model work is not awaited | `t2` |
| per-task checkpoint: atomic result before next task; pollers always parse valid JSON | `t2` |
| task deadline: 5/10/15-minute clocks include reads/tests/validation; timeout incomplete and provider failure failed; remaining tasks continue without automatic retries | `t2` |
| first-attempt ownership: same-id duplicate refuses before provider; no source/attempt rewrite | `t2` |
| publication: one idempotent scoped version-2 CR summary; failure retains terminal task results and pending publication | `t3` |
| reader/gate compatibility: a task-only pass is not whole-story review; failed/incomplete/unknown version is never a new-format pass | `t3` |
| installed first useful review: explicit selected committed change with a body-only regression is inspected and produces evidence-backed feedback, a real completed-task JSON checkpoint and task-based CR; unrelated same-commit changes stay outside scope | `t2`, `t3` |
| production build and affected backend review/provider/CR suites; fresh task-review request uses new path while existing design review and explicitly legacy tokens retain their routes | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S001/LLD.md#2-contract-details` — "S1 APIs, first-useful review, reviewer routing and shared contract behavior."
- **[[c2]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S001/LLD.md#3-data-model-changes` — "Selected-change packet, commit pointers, derived tasks, one checkpoint and task-based results."
- **[[c3]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S001/LLD.md#6-error-paths` — "Admission errors, per-task deadline/failure continuation, evidence limits and persistence failure."
- **[[c4]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S001/LLD.md#7-test-strategy` — "Focused unit/integration/provider-policy tests and one early installed useful assessment."
- **[[c5]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S001/LLD.md#5-interaction-with-shared-contracts` — "sc1-sc3 ownership, versioned CR publication and downstream S2/S3 boundaries."
- **[[c6]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S001/LLD.md#8-migration` — "Explicit new route, legacy/design compatibility and no mass artifact rewrite or retired-engine recovery."
