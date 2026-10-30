<!-- insrc:artifact TESTS-a832f5b2560d917f-s1 -->

# Tests: a832f5b2560d917f s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 9 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-30T04:34:24.430Z on commit `d106c6883`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Approved installed probe without signature is accepted without trust-key provisioning**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Approved installed probe without signature is accepted without trust-key provisioning | `src/daemon/__tests__/review-investigation-adoption.test.ts` |

**integration: Draft stale and tampered evidence remain refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Draft stale and tampered evidence remain refused | `src/daemon/__tests__/review-investigation-adoption.test.ts` |

**integration: Legacy signature metadata is inert and bounded**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Legacy signature metadata is inert and bounded | `src/daemon/__tests__/review-investigation-adoption.test.ts` |

**integration: Qualification still rejects incomplete isolation evidence, changed runtime pins and stale canonical authority**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Effective native isolation qualification rejects inherited tools and unproven binaries | `src/agent/providers/__tests__/investigation-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/investigation-session.test.ts` | 0 | 1 | 0.8 s |  |
| `src/daemon/__tests__/review-investigation-adoption.test.ts` | 0 | 8 | 9.7 s |  |

## t2

Run at 2026-10-30T04:38:43.440Z on commit `fd31793e7`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**smoke: Operator prerequisites and runbook omit signer/trust-key provisioning and preserve runtime isolation and explicit signoff**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/remove-review-signing-guidance-smoke.log; docs/review-investigation.md activation handoff and scripts/review-investigation-probe.mjs prerequisites; operator regression test passed.

**integration: Affected activation and native qualification regressions and build pass**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Approved installed probe without signature is accepted without trust-key provisioning | `src/daemon/__tests__/review-investigation-adoption.test.ts` |
| pass | Draft stale and tampered evidence remain refused | `src/daemon/__tests__/review-investigation-adoption.test.ts` |
| pass | Legacy signature metadata is inert and bounded | `src/daemon/__tests__/review-investigation-adoption.test.ts` |
| pass | Effective native isolation qualification rejects inherited tools and unproven binaries | `src/agent/providers/__tests__/investigation-session.test.ts` |
| pass | IPC-only operator client reports runtime isolation and approval prerequisites without signing keys | `src/daemon/__tests__/review-investigation-probe-export.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/investigation-session.test.ts` | 0 | 1 | 0.7 s |  |
| `src/daemon/__tests__/review-investigation-adoption.test.ts` | 0 | 8 | 9.4 s |  |
| `src/daemon/__tests__/review-investigation-probe-export.test.ts` | 0 | 3 | 0.7 s |  |
