<!-- insrc:artifact TESTS-cda6558e4b0e4bea-s1 -->

# Tests: cda6558e4b0e4bea s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 44 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-13T06:30:06.183Z on commit `0b54c8de7`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: acquireRunFileGuard quarantines and acquires when the verdict is 'gone' (fake reader, mkdtemp guard)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | acquireRunFileGuard quarantines and acquires when the verdict is 'gone' (fake reader, mkdtemp guard) | `src/shared/__tests__/daemon-run-files.test.ts` |

**unit: acquireRunFileGuard quarantines and acquires on previous-boot 'replaced' (boot segments mismatch)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | acquireRunFileGuard quarantines and acquires on previous-boot 'replaced' (boot segments mismatch) | `src/shared/__tests__/daemon-run-files.test.ts` |

**unit: acquireRunFileGuard withholds 'same', same-boot 'replaced', corrupt or missing owner.json and a throwing reader; nothing is renamed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | acquireRunFileGuard withholds 'same', same-boot 'replaced', corrupt or missing owner.json and a throwing reader; nothing is renamed | `src/shared/__tests__/daemon-run-files.test.ts` |

**unit: acquireRunFileGuard recomputes the conflict and throws when the retry mkdir hits EEXIST**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | acquireRunFileGuard recomputes the conflict and throws when the retry mkdir hits EEXIST | `src/shared/__tests__/daemon-run-files.test.ts` |

**unit: acquireRunFileGuard leaves a symlink guard as a conflict**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | acquireRunFileGuard leaves a symlink guard as a conflict | `src/shared/__tests__/daemon-run-files.test.ts` |

**unit: acquireRunFileGuard suffixes the quarantine name on collision; owner.json stays byte-identical and one daemonLog line is keyed by the recorded nonce; a log-write failure is swallowed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | acquireRunFileGuard suffixes the quarantine name on collision; owner.json stays byte-identical and one daemonLog line is keyed by the recorded nonce; a log-write failure is swallowed | `src/shared/__tests__/daemon-run-files.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/daemon-run-files.test.ts` | 0 | 11 | 0.6 s |  |

## t2

Run at 2026-11-13T06:32:35.327Z on commit `30f45ce73`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the t1 decision-table suite turns green against the implementation (no new tests)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | acquireRunFileGuard quarantines and acquires when the verdict is 'gone' (fake reader, mkdtemp guard) | `src/shared/__tests__/daemon-run-files.test.ts` |
| pass | acquireRunFileGuard quarantines and acquires on previous-boot 'replaced' (boot segments mismatch) | `src/shared/__tests__/daemon-run-files.test.ts` |
| pass | acquireRunFileGuard withholds 'same', same-boot 'replaced', corrupt or missing owner.json and a throwing reader; nothing is renamed | `src/shared/__tests__/daemon-run-files.test.ts` |
| pass | acquireRunFileGuard recomputes the conflict and throws when the retry mkdir hits EEXIST | `src/shared/__tests__/daemon-run-files.test.ts` |
| pass | acquireRunFileGuard leaves a symlink guard as a conflict | `src/shared/__tests__/daemon-run-files.test.ts` |
| pass | acquireRunFileGuard suffixes the quarantine name on collision; owner.json stays byte-identical and one daemonLog line is keyed by the recorded nonce; a log-write failure is swallowed | `src/shared/__tests__/daemon-run-files.test.ts` |
| pass | killed guard owner is conclusively dead, so the next startup quarantines the stale guard and acquires | `src/shared/__tests__/daemon-run-files.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/daemon-run-files.test.ts` | 0 | 11 | 0.7 s |  |

## t3

Run at 2026-11-13T06:37:32.119Z on commit `51b5328fd`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: startup lease acquires over a guard whose owner.json records a genuinely exited child process (src/daemon/__tests__/run-file-ownership.test.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | startup lease acquires over a guard whose owner.json records a genuinely exited child process | `src/daemon/__tests__/run-file-ownership.test.ts` |

**integration: vault guard reclaims a genuinely-exited-owner guard through the real readProcessIdentity verdict path (src/daemon/__tests__/keystore-guard.test.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vault guard reclaims a genuinely-exited-owner guard through the real readProcessIdentity verdict path | `src/daemon/__tests__/keystore-guard.test.ts` |
| pass | Guarded stale run files and replacement ownership | `src/daemon/__tests__/supervisor-run-files.test.ts` |
| pass | Run-file mutation rejects a mismatched grant, channel or generation | `src/daemon/__tests__/supervisor-run-files.test.ts` |
| pass | Partially published run files stay fenced while startup reap is unconfirmed | `src/daemon/__tests__/supervisor-run-files.test.ts` |
| pass | Repeated or stale lease release cannot change the physical run-file guard | `src/daemon/__tests__/supervisor-run-files.test.ts` |
| pass | Queued release before and after escalation preserves shutdown guard | `src/daemon/__tests__/supervisor-run-files.test.ts` |
| pass | Kill startup child before PID, after PID, and after socket publication before ready | `src/daemon/__tests__/supervisor-run-files.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/keystore-guard.test.ts` | 0 | 4 | 7.8 s |  |
| `src/daemon/__tests__/run-file-ownership.test.ts` | 0 | 5 | 2 s |  |
| `src/daemon/__tests__/supervisor-run-files.test.ts` | 0 | 6 | 0.5 s |  |

## t4

Run at 2026-11-13T08:23:42.529Z on commit `1a6d72e6e`. Tests check: **passed**. 23 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: full sweep npx tsx --test 'src/**/__tests__/*.test.ts' exits clean with shutdown and supervisor suites unmodified**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Watchdog arm failure self-kills before blocked native cleanup | `src/daemon/__tests__/shutdown-bounded.test.ts` |
| pass | Bounded shutdown preserves lock-loss, fatal and normal cleanup behavior | `src/daemon/__tests__/shutdown-bounded.test.ts` |
| pass | Repeated signals and guarded async close preserve ownership | `src/daemon/__tests__/shutdown-bounded.test.ts` |
| pass | Guard-owner death reclaims the stale guard so the restart proceeds like the healthy control | `src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts` |
| pass | Compiled helper packaging and affected lifecycle regression suites | `src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts` |
| pass | status after failure: storeFailure names another process and does not contain 'semume' | `src/daemon/__tests__/shutdown-store-failure.test.ts` |
| pass | store failure to stop: exit within 5 seconds, pid file and socket gone, second start succeeds, last log line names the skipped close | `src/daemon/__tests__/shutdown-store-failure.test.ts` |
| pass | fatal after failure: an unhandled rejection with the store failed ends the process within 5 seconds | `src/daemon/__tests__/shutdown-store-failure.test.ts` |
| pass | healthy shutdown is unchanged: queue drained, connections closed in order, normal exit | `src/daemon/__tests__/shutdown-store-failure.test.ts` |
| pass | with the store failed no path calls exit: the shutdown, its backstop, a failure found during the drain, and any other exit | `src/daemon/__tests__/shutdown-store-failure.test.ts` |
| pass | Store-child fixture exercises owned publication watchdog readiness and guarded close | `src/daemon/__tests__/shutdown-store-failure.test.ts` |
| pass | Independent watchdog bounds a disposable blocked parent and disarms after healthy exit | `src/daemon/__tests__/shutdown-watchdog.test.ts` |
| pass | Ready handshake reports spawn failure, early exit and timeout | `src/daemon/__tests__/shutdown-watchdog.test.ts` |
| pass | Watchdog never signals after reparenting and imports only Node built-ins | `src/daemon/__tests__/shutdown-watchdog.test.ts` |
| pass | Watchdog IPC disconnect during readiness releases its shared broker session without signalling the parent | `src/daemon/__tests__/shutdown-watchdog.test.ts` |
| pass | IPC transport loss never disarms the deadline for a blocked parent or blocked exit hook | `src/daemon/__tests__/shutdown-watchdog.test.ts` |
| pass | Backward wall-clock adjustment cannot extend the independent monotonic shutdown duration | `src/daemon/__tests__/shutdown-watchdog.test.ts` |
| pass | Guarded stale run files and replacement ownership | `src/daemon/__tests__/supervisor-run-files.test.ts` |
| pass | Run-file mutation rejects a mismatched grant, channel or generation | `src/daemon/__tests__/supervisor-run-files.test.ts` |
| pass | Partially published run files stay fenced while startup reap is unconfirmed | `src/daemon/__tests__/supervisor-run-files.test.ts` |
| pass | Repeated or stale lease release cannot change the physical run-file guard | `src/daemon/__tests__/supervisor-run-files.test.ts` |
| pass | Queued release before and after escalation preserves shutdown guard | `src/daemon/__tests__/supervisor-run-files.test.ts` |
| pass | Kill startup child before PID, after PID, and after socket publication before ready | `src/daemon/__tests__/supervisor-run-files.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/shutdown-bounded.test.ts` | 0 | 3 | 24.5 s |  |
| `src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts` | 0 | 2 | 22.4 s |  |
| `src/daemon/__tests__/shutdown-store-failure.test.ts` | 0 | 6 | 3.8 s |  |
| `src/daemon/__tests__/shutdown-watchdog.test.ts` | 0 | 6 | 27.6 s |  |
| `src/daemon/__tests__/supervisor-run-files.test.ts` | 0 | 6 | 0.6 s |  |
