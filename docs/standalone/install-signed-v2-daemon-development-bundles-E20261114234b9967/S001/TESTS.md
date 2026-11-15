<!-- insrc:artifact TESTS-234b9967599e56d9-s1 -->

# Tests: 234b9967599e56d9 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 15 pass, 1 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-14T17:29:43.827Z on commit `20e5965cc`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Canonical development manifest, branch policy and wrong-domain proof rejection**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | development verification accepts a configured ref and canonical manifest | `scripts/__tests__/daemon-development-metadata.test.ts` |
| pass | development verification rejects invalid branch policy, signatures and host before staging | `scripts/__tests__/daemon-development-metadata.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/daemon-development-metadata.test.ts` | 0 | 2 | 0.9 s |  |

## t2

Run at 2026-11-15T07:28:22.605Z on commit `dc9eb4190`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Local clean branch fetch, exact commit and measured candidate with no main dispatch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | local development packaging pins a configured ref and measures candidate bytes | `scripts/__tests__/package-daemon-development.test.ts` |
| pass | development archives omit overlong SDK metadata and reject lost runtime files | `scripts/__tests__/package-daemon-development.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/package-daemon-development.test.ts` | 0 | 2 | 7.4 s |  |

## t3

Run at 2026-11-14T17:42:03.707Z on commit `f20d9071f`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Authenticated signing handoff, sequence allocation, writable format and crash-reopen qualification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | development signer binds the authenticated archive, sequence and exact qualified predecessor | `scripts/__tests__/sign-daemon-development.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/sign-daemon-development.test.ts` | 0 | 1 | 2.1 s |  |

## t4

Run at 2026-11-14T17:51:02.627Z on commit `b456ee688`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Development proof and reservation floor, rollback and equal-sequence byte identity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | development admission floor survives rollback and only permits exact equal-sequence retry | `src/daemon/__tests__/managed-development-bundle-proof.test.ts` |
| pass | managed development proof revalidates signed identity and pinned runtime | `src/daemon/__tests__/managed-development-bundle-proof.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/managed-development-bundle-proof.test.ts` | 0 | 2 | 1.1 s |  |

## t5

Run at 2026-11-15T07:30:46.352Z on commit `c9b65182b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Authenticated bootstrap fixture and host, archive and foreign-state refusal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | development first-install preflight refuses existing state and symlink markers | `scripts/__tests__/daemon-development-metadata.test.ts` |
| pass | development verification rejects invalid branch policy, signatures and host before staging | `scripts/__tests__/daemon-development-metadata.test.ts` |
| pass | a fresh installation journal read leaves the trust-only state root pristine | `src/shared/__tests__/installation-mutation-gate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/daemon-development-metadata.test.ts` | 0 | 4 | 4 s |  |
| `src/shared/__tests__/installation-mutation-gate.test.ts` | 0 | 9 | 10.3 s |  |

## t6

Run at 2026-11-15T08:34:58.627Z on commit `f836bc655`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Exact predecessor, cross-branch state, idle intent and offline rollback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | development bootstrap admits a cross-ref upgrade only with the exact installed predecessor | `scripts/__tests__/daemon-development-metadata.test.ts` |
| pass | managed development proof revalidates signed identity and pinned runtime | `src/daemon/__tests__/managed-development-bundle-proof.test.ts` |
| pass | development admission floor survives rollback and only permits exact equal-sequence retry | `src/daemon/__tests__/managed-development-bundle-proof.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/daemon-development-metadata.test.ts` | 0 | 6 | 17 s |  |
| `src/daemon/__tests__/managed-development-bundle-proof.test.ts` | 0 | 2 | 7.5 s |  |

## t7

Run at 2026-11-15T08:40:25.501Z on commit `4e9d67267`. Tests check: **failed**. 2 pass, 1 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

named test cases that did not pass: fail: 'Fresh controller activation reconciles partial selector and bootstrap' in src/daemon/__tests__/fresh-managed-activation.test.ts

**integration: Crash before selector, after job and before receipt, with foreign or live ownership refusal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | development bootstrap authenticates an orphaned first activation without an installed receipt | `scripts/__tests__/daemon-development-metadata.test.ts` |
| pass | fresh activation reconnects after a lost start reply and retains the admitted generation | `src/daemon/__tests__/fresh-managed-activation.test.ts` |
| fail | Fresh controller activation reconciles partial selector and bootstrap | `src/daemon/__tests__/fresh-managed-activation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/daemon-development-metadata.test.ts` | 0 | 6 | 7.1 s |  |
| `src/daemon/__tests__/fresh-managed-activation.test.ts` | 1 | 5 | 115.4 s |  |

**Failures outside the named cases**

- `src/daemon/__tests__/fresh-managed-activation.test.ts`: Fresh install and verified ordinary restart
- `src/daemon/__tests__/fresh-managed-activation.test.ts`: Fresh --no-start and later supervisor start
