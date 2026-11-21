<!-- insrc:artifact TESTS-779e9a08142cb057-s1 -->

# Tests: 779e9a08142cb057 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-21T15:24:24.800Z on commit `61e9c86fb`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: isSecurityFinding type guard (true/false/malformed discriminant)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | isSecurityFinding returns true only for an object whose kind discriminant is exactly 'security' | `src/workflow/review-round/__tests__/security-finding.test.ts` |

**unit: SecurityFinding structural extension of base Finding (all base fields present + security-only fields)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | SecurityFinding structurally extends base Finding -- every Finding field present plus the security-only fields | `src/workflow/review-round/__tests__/security-finding.test.ts` |

**unit: overriddenAt vs current Scope revision comparison (stale override rejected)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | overriddenAt vs current Scope revision comparison (stale override rejected) | `src/workflow/review-round/__tests__/security-finding.test.ts` |

**unit: risk-family verdict recorded as informational zero-severity SecurityFinding for not-applicable/uncertain families**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | risk-family verdict recorded as informational zero-severity SecurityFinding for not-applicable/uncertain families | `src/workflow/review-round/__tests__/security-finding.test.ts` |

**integration: reconciliation pass consuming a mixed Finding/SecurityFinding list**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reconciliation pass consuming a mixed Finding/SecurityFinding list | `src/workflow/review-round/__tests__/security-finding.test.ts` |

**integration: docgen review-report render of a round containing SecurityFinding entries**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docgen review-report render of a round containing SecurityFinding entries | `src/workflow/review-round/__tests__/security-finding.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-round/__tests__/security-finding.test.ts` | 0 | 7 | 0.7 s |  |

## t2

Run at 2026-11-21T15:26:53.723Z on commit `8355c1b51`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: SecurityLocator structural extension of Locator/Pointer (trust-boundary id + taint-path step index fields)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | SecurityLocator structural extension of Locator/Pointer (trust-boundary id + taint-path step index fields) | `src/workflow/review-round/__tests__/security-locator.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-round/__tests__/security-locator.test.ts` | 0 | 2 | 0.5 s |  |

## t3

Run at 2026-11-21T15:29:56.040Z on commit `1af308fcc`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: SecurityEvidence shape (providerCategory + optional SecurityLocator)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | SecurityEvidence shape (providerCategory + optional SecurityLocator) | `src/workflow/review-round/__tests__/evidence-provider.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-round/__tests__/evidence-provider.test.ts` | 0 | 3 | 0.6 s |  |

## t4

Run at 2026-11-21T18:29:06.540Z on commit `f879b410a`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: VerificationReceipt record shape (pass/fail/evidence linkage by id)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | VerificationReceipt record shape (pass/fail/evidence linkage by id) | `src/workflow/review-round/__tests__/receipt-record.test.ts` |

**integration: RECEIPTS.md write for a security review round**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | RECEIPTS.md write for a security review round | `src/workflow/review-round/__tests__/receipt-record.test.ts` |

**integration: approval attempt against a RECEIPTS.md/VerificationReceipt record is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval attempt against a RECEIPTS.md/VerificationReceipt record is refused | `src/workflow/review-round/__tests__/receipt-record.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-round/__tests__/receipt-record.test.ts` | 0 | 8 | 0.8 s |  |

## t5

Run at 2026-11-21T15:53:00.638Z on commit `1d9cfcca4`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: JSON Schema transformer output for SecurityFinding (kind discriminant + inherited Finding fields)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | JSON Schema transformer output for SecurityFinding (kind discriminant + inherited Finding fields) | `src/workflow/review-round/__tests__/security-schema.test.ts` |

**unit: JSON Schema transformer output for SecurityLocator (kind discriminant + inherited Locator/Pointer fields)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | JSON Schema transformer output for SecurityLocator (kind discriminant + inherited Locator/Pointer fields) | `src/workflow/review-round/__tests__/security-schema.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-round/__tests__/security-schema.test.ts` | 0 | 3 | 0.7 s |  |
