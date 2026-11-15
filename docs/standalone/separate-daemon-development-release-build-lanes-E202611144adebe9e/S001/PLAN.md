<!-- insrc:artifact PLAN-4adebe9eb17a3ef2-s1 -->

# Plan: STORY-4adebe9eb17a3ef2-s1

## Summary

**Epic:** `separate-daemon-development-release-build-lanes`
**LLD run:** `wf-1794663683617-c2huez`
**LLD effective hash:** `b1d6f6a0370a...`

Separate unsigned v2 build artifacts from protected main release candidates, and keep testing and qualification local.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Implement branch and readiness admission | M | — | — | integration: Local branch routing and candidate metadata | [[c1]] |
| 2 | **`t2`** Bind the exact candidate origin | M | — | `t1` | integration: Exact attempt and signed archive provenance | [[c2]] |
| 3 | **`t3`** Enforce signing policy and live shutdown | M | — | `t2` | integration: Local environment policy and live disable checks | [[c3]] |
| 4 | **`t4`** Document and verify staged rollout | M | — | `t3` | integration: Local staged rollout and release sequence | [[c4]] |

### 1.1 TASK-4adebe9eb17a3ef2-s1-t1 — Implement branch and readiness admission

Update the build workflow and candidate packager to derive branch/lane from the dispatch ref and emit run-attempt metadata. Keep main default off.

**Acceptance checks:**
- Protected and ready main builds a release candidate; unsigned v2 builds a development candidate even when release readiness is off.
- Unsupported refs, incorrect dispatch SHA and missing main readiness fail before a job. No signing credentials or hosted tests are available to the v2 job.

### 1.2 TASK-4adebe9eb17a3ef2-s1-t2 — Bind the exact candidate origin

Verify GitHub attempt and artifact identity from both signing workflows, make the signed manifest and qualification record carry identical origin data, and reject pre-policy or cross-attempt records.

**Acceptance checks:**
- Only successful exact main attempts and matching immutable artifacts are eligible.
- Promotion rejects wrong repository, branch, workflow, SHA, run, attempt, artifact, expiration or payload digest, including byte-identical reruns.

### 1.3 TASK-4adebe9eb17a3ef2-s1-t3 — Enforce signing policy and live shutdown

Enforce main-only environment configuration and live readiness after approvals, before signing, and before each publish write. Preserve the two-key model and existing exact-archive checks.

**Acceptance checks:**
- Both environment policies require main-only refs, designated reviewers and no self-approval/bypass. Missing or unverifiable live policy aborts.
- Disabling readiness while awaiting approval or after signing refuses the next operation; v2 and tags never reach signing.

### 1.4 TASK-4adebe9eb17a3ef2-s1-t4 — Document and verify staged rollout

Document the narrow default-branch workflow landing, operator setup and shutdown/reconciliation. Verify unsigned v2 can build before main release activation.

**Acceptance checks:**
- Runbook defers enabling main until packaging/installer, branch protection and environment configuration are verified.
- Local end-to-end fixtures prove pre-test signing, evidence approval, byte-preserving promotion, and cancellation guidance. No release is dispatched during implementation.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| New local workflow policy fixture: main protected builds a release candidate, main unprotected refuses, v2 creates an unsigned development artifact, and all other refs refuse | `t1` |
| New mocked GitHub API integration: main run plus matching artifact succeeds; v2 origin, mismatched run branch and artifact branch, wrong repository/workflow/commit/run ID or expired artifact all refuse before download or signing | `t2` |
| New workflow wiring check: both qualification-sign and promotion enforce main provenance independently, dev jobs have no signing environment, and no Actions test commands are added | `t1`, `t3` |
| New local sequence coverage: qualification signature precedes verified test install; failed or absent local record blocks production signing; valid approved evidence admits the identical manifest/archive | `t2`, `t4` |
| New local GitHub policy fixtures: enforce exact main branch-only rules and reject a tag rule, extra branch rule, missing reviewers, self-approval, bypass, unavailable policy and v2 environment access | `t3` |
| New mocked API test: failed attempt 1 plus successful attempt 2; reject attempt 1 and cross-attempt artifact substitution, accept only successful matching attempt | `t2` |
| New local job-admission tests: missing or false readiness blocks main build before runner and both signing workflows, but v2 development still builds | `t1`, `t3` |
| New test: two successful main attempts with the same commit and archive bytes; substitute attempt or artifact ID and assert promotion rejects the valid signature for the wrong identity | `t2` |
| New test: readiness is true at scheduling and false after approval, or becomes false after signing; deny signing or the next publish mutation, respectively. Missing/read-failed live settings also fail closed. | `t3`, `t4` |

## 3. References

- **[[c1]]** `doc` `docs/standalone/separate-daemon-development-release-build-lanes-E202611144adebe9e/S001/LLD.md:34`
- **[[c2]]** `doc` `docs/standalone/separate-daemon-development-release-build-lanes-E202611144adebe9e/S001/LLD.md:54`
- **[[c3]]** `doc` `docs/standalone/separate-daemon-development-release-build-lanes-E202611144adebe9e/S001/LLD.md:87`
- **[[c4]]** `doc` `docs/standalone/separate-daemon-development-release-build-lanes-E202611144adebe9e/S001/LLD.md:160`
