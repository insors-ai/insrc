<!-- insrc:artifact TESTS-56343cf2a9c3b509-s1 -->

# Tests: 56343cf2a9c3b509 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 18 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-16T10:09:36.480Z on commit `7e5d189f2`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Linux manifest schema and digest boundaries**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Linux manifest rejects noncanonical, malformed, oversized and mismatched metadata | `scripts/__tests__/linux-daemon-metadata.test.ts` |

**unit: Role-separated Ed25519 grants and configured channel scope**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Linux qualification and channel grants authenticate identical scoped bytes with separate keys | `scripts/__tests__/linux-daemon-metadata.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/linux-daemon-metadata.test.ts` | 0 | 2 | 0.7 s |  |

## t2

Run at 2026-11-16T11:52:44.564Z on commit `14599ab17`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: Linux staging inventory, path safety and ELF dependency fixture checks**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Linux packaging rejects wrong ELF architecture and runtime ABI floors | `scripts/__tests__/package-linux-daemon-candidate.test.ts` |
| pass | Linux staging requires Linux entry points, retains matching native dependencies and refuses escaping links | `scripts/__tests__/package-linux-daemon-candidate.test.ts` |
| pass | Linux native dependency inventory rejects missing libraries and escaping ELF search paths | `scripts/__tests__/package-linux-daemon-candidate.test.ts` |

**smoke: Local Ubuntu 24.04 amd64 package, relocate, verify fingerprint, load native modules and exercise required entry points**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/insrc-linux-x64-lifecycle-smoke.log lines 29–48. Ubuntu 24.04 amd64 OrbStack guest, translated user space. Packaged at 11f65c779, relocated and measured fingerprint, loaded ten staged native dependencies, verified CLI, daemon and MCP. Actual packaged broker captured and terminated a disposable target and confirmed exit. Actual packaged watchdog reported ready and disarmed, then terminated a blocked disposable parent on deadline and recorded the cause.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/package-linux-daemon-candidate.test.ts` | 0 | 3 | 0.4 s |  |

## t3

Run at 2026-11-16T10:39:48.453Z on commit `d9aefe07e`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Linux workflow shape, credential isolation, exact revision and configured ref tests**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Linux candidate workflow isolates the Ubuntu build and has only pinned read-only Actions | `scripts/__tests__/linux-daemon-dispatch.test.ts` |
| pass | Linux dispatch uses configured full refs and records the exact target-qualified candidate | `scripts/__tests__/linux-daemon-dispatch.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/linux-daemon-dispatch.test.ts` | 0 | 2 | 0.6 s |  |

## t4

Run at 2026-11-16T10:46:59.983Z on commit `902ec06ef`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: GitHub origin and validated download fixtures for Linux, Darwin, rerun, substituted origin, duplicate ZIP members and digest tampering**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Linux candidate origin distinguishes exact workflow attempt and artifact from Darwin and other revisions | `scripts/__tests__/fetch-linux-daemon-candidate.test.ts` |
| pass | Linux retrieval verifies both digests and rejects duplicate or foreign ZIP members | `scripts/__tests__/fetch-linux-daemon-candidate.test.ts` |
| pass | GitHub fetch path separates same-version Linux and Darwin artifacts by workflow and exact attempt | `scripts/__tests__/fetch-linux-daemon-candidate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/fetch-linux-daemon-candidate.test.ts` | 0 | 3 | 3.7 s |  |

## t5

Run at 2026-11-16T10:49:52.973Z on commit `fab6b555c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Fixture qualification grant and signed local evidence for exact artifact, host, required tests and predecessor**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Linux qualification authenticates exact immutable subject and separate signer privileges | `scripts/__tests__/linux-daemon-qualification.test.ts` |
| pass | Linux qualification rejects foreign host, artifact, test and predecessor evidence | `scripts/__tests__/linux-daemon-qualification.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/linux-daemon-qualification.test.ts` | 0 | 2 | 0.4 s |  |

## t6

Run at 2026-11-16T11:47:41.425Z on commit `14599ab17`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Independent-writer sequence race, scoped ledger, stale and corrupt ledger, and interrupted exact retry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Protected Linux signing ledger serializes independent writers and preserves exact interrupted retries | `scripts/__tests__/linux-daemon-final-signing.test.ts` |
| pass | Linux signing ledger refuses a valid older head or deleted latest binding | `scripts/__tests__/linux-daemon-final-signing.test.ts` |
| pass | Linux dispatch, qualification and protected signer CLI preserve hosted origin through interrupted delivery | `scripts/__tests__/linux-daemon-final-signing.test.ts` |

**integration: Final signing role, evidence and origin checks across all Linux stages using fixtures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Linux final signing revalidates qualification, artifact and lane before allocating a signature | `scripts/__tests__/linux-daemon-final-signing.test.ts` |
| pass | Linux signing rejects independently qualified substitutions for the same approved archive | `scripts/__tests__/linux-daemon-final-signing.test.ts` |
| pass | Linux dispatch, qualification and protected signer CLI preserve hosted origin through interrupted delivery | `scripts/__tests__/linux-daemon-final-signing.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/linux-daemon-final-signing.test.ts` | 0 | 5 | 4.5 s |  |
