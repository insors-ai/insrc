<!-- insrc:artifact TESTS-b135647ed951c0c1-s1 -->

# Tests: b135647ed951c0c1 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## s1

Run at 2026-10-27T11:28:35.347Z on commit `55d4a00c6`. Tests check: **passed**. 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: the hosts op runs exactly `gh auth status --json hosts` with a 15 s limit and no other argument, and returns the hosts object as gh printed it with extra account fields kept**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: the hosts op runs exactly `gh auth status --json hosts` with a 15 s limit and no other argument, and returns the hosts object as gh printed it with extra account fields kept | `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts` |

**unit: src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: a missing gh, a timeout, a non-zero exit (including unknown flag --json), a cut capture and output over 256 KB are five different diagnostics (kinds missing-tool, timed-out, rejected for the non-zero exit, rejected for the cut capture, rejected for the over-size output, each with its own message) and a network failure is kind unreachable, and nothing is returned as data**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: a missing gh, a timeout, a non-zero exit (including unknown flag --json), a cut capture and output over 256 KB are five different diagnostics (kinds missing-tool, timed-out, rejected for the non-zero exit, rejected for the cut capture, rejected for the over-size output, each with its own message) and a network failure is kind unreachable, and nothing is returned as data | `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts` |

**unit: src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: valid JSON whose account fields hold multibyte text is accepted at exactly 262144 bytes and refused at 262145 bytes even when its character count is below 262144**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: valid JSON whose account fields hold multibyte text is accepted at exactly 262144 bytes and refused at 262145 bytes even when its character count is below 262144 | `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts` |

**unit: src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: a gh that outlives the hosts limit (lowered through registerGhLimits for the test, restored afterwards) is a timed-out failure that names the command and the limit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: a gh that outlives the hosts limit (lowered through registerGhLimits for the test, restored afterwards) is a timed-out failure that names the command and the limit | `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts` |

**unit: src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: output of exactly 256 KB is accepted and output of 256 KB plus one byte is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: output of exactly 256 KB is accepted and output of 256 KB plus one byte is refused | `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts` |

**unit: src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: output that is not JSON, has no hosts object, or has an account without a string state or login is refused with no partial data**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: output that is not JSON, has no hosts object, or has an account without a string state or login is refused with no partial data | `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts` |

**unit: src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: an empty hosts object and a host with no accounts are accepted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: an empty hosts object and a host with no accounts are accepted | `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts` |

**unit: src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: the ops status, switch and logout still have their commands, fields, 30 s limits, approval classes and output shapes, and the hosts op makes no model call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: the ops status, switch and logout still have their commands, fields, 30 s limits, approval classes and output shapes, and the hosts op makes no model call | `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts` |

**contract: src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts: the existing coverage check passes with the hosts op recorded for the command auth status, and all 69 tools are still registered**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-coverage.test.ts: the existing coverage check passes with the hosts op recorded for the command auth status, and all 69 tools are still registered | `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts` |

**contract: src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts: the limit table has gh_auth.hosts at 15 s**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-timeouts.test.ts: the limit table has gh_auth.hosts at 15 s | `src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts` |

**contract: src/daemon/tools/builtins/gh/__tests__/gh-output-schemas.test.ts: the hosts output schema validates a real-shape sample and rejects a sample without login**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-output-schemas.test.ts: the hosts output schema validates a real-shape sample and rejects a sample without login | `src/daemon/tools/builtins/gh/__tests__/gh-output-schemas.test.ts` |

**contract: src/daemon/tools/builtins/gh/__tests__/gh-family-tools.test.ts: the family sweep exercises gh_auth.hosts from the hosts case in _family-rows.ts (JSON stdout, exact argv, class none, 15 s limit) and gh-output-schemas.test.ts validates its output**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-family-tools.test.ts: the family sweep exercises gh_auth.hosts from the hosts case in _family-rows.ts (JSON stdout, exact argv, class none, 15 s limit) and gh-output-schemas.test.ts validates its output | `src/daemon/tools/builtins/gh/__tests__/gh-family-tools.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts` | 0 | 8 | 2.6 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts` | 0 | 4 | 4.7 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-family-tools.test.ts` | 0 | 8 | 1.3 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-output-schemas.test.ts` | 0 | 3 | 2.3 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts` | 0 | 6 | 2.6 s |  |
