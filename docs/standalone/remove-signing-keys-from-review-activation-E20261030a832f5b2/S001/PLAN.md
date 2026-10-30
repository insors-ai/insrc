<!-- insrc:artifact PLAN-a832f5b2560d917f-s1 -->

# Plan: STORY-a832f5b2560d917f-s1

## Summary

**Epic:** `remove-signing-keys-from-review-activation`
**LLD run:** `wf-1793333884419-pqrofu`
**LLD effective hash:** `a832f5b2560d...`

Remove the signing-key gate using existing canonical approvals as record authority, while retaining installed runtime isolation validation and stale-evidence checks. Implement the localized gate change with focused regressions, then align operator guidance and run the affected build checks. Activation remains a separate signoff.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Replace signature verification with canonical evidence authority | M | — | — | integration: Approved installed probe without signature is accepted without trust-key provisioning; integration: Draft stale and tampered evidence remain refused; integration: Legacy signature metadata is inert and bounded; integration: Qualification still rejects incomplete isolation evidence, changed runtime pins and stale canonical authority | [[c1]] |
| 2 | **`t2`** Update activation guidance and verify affected boundary | S | — | `t1` | smoke: Operator prerequisites and runbook omit signer/trust-key provisioning and preserve runtime isolation and explicit signoff; integration: Affected activation and native qualification regressions and build pass | [[c2]] |

### 1.1 TASK-a832f5b2560d917f-s1-t1 — Replace signature verification with canonical evidence authority

Make signature optional deprecated bounded metadata; remove crypto verifier/key IO and verifyProbe seam; preserve approved-reference/digest revalidation on qualification use and existing isolation/file checks. Update focused adoption and qualification regression tests.

**Acceptance checks:**
- Approved unsigned installed-probe records require no key or signature; legacy bounded signatures are inert.
- Draft, stale, tampered and raw export records remain refused.
- Incomplete isolation evidence, changed runtime pins and stale canonical authority still fail qualification; no engine default flip.

### 1.2 TASK-a832f5b2560d917f-s1-t2 — Update activation guidance and verify affected boundary

Remove signer/trust-key provisioning from operator prerequisites and runbook; describe canonical approved record authority and retained isolation/signoff checks. Run affected focused tests and build. Use the mandatory final Story code-review gate once; do not launch repeated legacy review rounds.

**Acceptance checks:**
- Runbook and operator prerequisites no longer require signer/key provisioning, while preserving runtime evidence and explicit activation signoff.
- Affected focused tests and build pass; no new live claims or activation state change.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Approved installed probe without signature is accepted without trust-key provisioning | `t1` |
| Draft stale and tampered evidence remain refused | `t1` |
| Legacy signature metadata is inert and bounded | `t1` |
| Qualification still rejects incomplete isolation evidence, changed runtime pins and stale canonical authority | `t1` |
| Operator prerequisites and runbook omit signer/trust-key provisioning and preserve runtime isolation and explicit signoff | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 dataModelChanges/errorPaths/testStrategy/migration` — "Remove cryptographic signature and trust key requirement; preserve approved canonical and installed runtime evidence validation."
- **[[c2]]** `prior-artifact` `LLD s1 testStrategy/migration/summary` — "Update operator guidance and focused verification; no implicit activation or data rewrite."
