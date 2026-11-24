<!-- insrc:artifact TESTS-c3d71313f34bce71-s1 -->

# Tests: c3d71313f34bce71 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 54 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-24T08:10:14.616Z on commit `da6255072`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: strict installer schemas reject invalid target runtime entrypoint hook and bridge records**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | strict installer schemas reject invalid target runtime entrypoint hook and bridge records | `src/installer/__tests__/contracts.test.ts` |
| pass | install is rejected even with a forged source/bootstrap marker | `src/installer/__tests__/contracts.test.ts` |
| pass | foundation reports and snapshots validate identity without inventing readiness | `src/installer/__tests__/contracts.test.ts` |

**unit: explicit home endpoint and terminal launch identity remain consistent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | explicit home endpoint and terminal launch identity remain consistent | `src/installer/__tests__/location.test.ts` |
| pass | control-root inspection rejects symlinks and files and never creates missing homes | `src/installer/__tests__/location.test.ts` |
| pass | unknown and network filesystem families fail closed until qualified | `src/installer/__tests__/location.test.ts` |
| pass | terminal launch preserves explicit home and successful handoff contract | `src/installer/__tests__/contracts.test.ts` |
| pass | terminal invocation binds actual arguments to metadata and Windows drive aliases | `src/installer/__tests__/contracts.test.ts` |
| pass | canonical drive-letter comparison preserves stored spelling and Unix identity | `src/installer/__tests__/location.test.ts` |

**integration: correlated bridge send cancel write outcomes preserve uncertainty**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | correlated bridge send cancel write outcomes preserve uncertainty | `src/installer/__tests__/bridge-protocol.test.ts` |

**integration: bridge hello ready requires exact nonce within three seconds before dispatch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bridge hello ready requires exact nonce within three seconds before dispatch | `src/installer/__tests__/bridge-protocol.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/bridge-protocol.test.ts` | 0 | 2 | 0.5 s |  |
| `src/installer/__tests__/contracts.test.ts` | 0 | 5 | 0.4 s |  |
| `src/installer/__tests__/location.test.ts` | 0 | 4 | 0.4 s |  |

## t2

Run at 2026-11-24T08:11:18.607Z on commit `da6255072`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: OS lock excludes another writer and releases on owned fixture self exit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | OS lock excludes another writer and releases on owned fixture self exit | `src/installer/__tests__/controller-store.test.ts` |
| pass | controller rejects lock replacement and unsafe records or control roots | `src/installer/__tests__/controller-store.test.ts` |

**integration: atomic replacement crash points preserve one valid snapshot**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | atomic replacement crash points preserve one valid snapshot | `src/installer/__tests__/controller-store.test.ts` |
| pass | controller inspection and revision failures never silently enroll or overwrite | `src/installer/__tests__/controller-store.test.ts` |
| pass | native publication remains gated without exact target runtime and live qualification | `src/installer/__tests__/controller-store.test.ts` |
| pass | native publisher denies unqualified output before publishing target artifacts | `src/installer/__tests__/controller-store.test.ts` |
| pass | canonical drive-letter comparison preserves stored spelling and Unix identity | `src/installer/__tests__/location.test.ts` |

**smoke: target private runtime loads qualified native lock and atomic adapters**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/evidence/t2.md — exact Node 22.22.1 darwin-arm64 lock and atomic smoke; Linux/Windows/other targets explicitly unqualified.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/controller-store.test.ts` | 0 | 7 | 1.2 s |  |
| `src/installer/__tests__/location.test.ts` | 0 | 4 | 0.4 s |  |

## t3

Run at 2026-11-23T19:06:41.785Z on commit `e4008df4b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: bootstrap rejects corrupt wrong target runtime and missing extraction prerequisites**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bootstrap rejects corrupt wrong target runtime and missing extraction prerequisites | `src/installer/__tests__/bootstrap.test.ts` |
| pass | bootstrap reuses identical runtime and refuses changed immutable runtime | `src/installer/__tests__/bootstrap.test.ts` |

**integration: bootstrap works with missing or wrong host Node and clears Node injection**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bootstrap works with missing or wrong host Node and clears Node injection | `src/installer/__tests__/bootstrap.test.ts` |

**unit: private runtime policy matches native headers and preserves explicit CUDA setting**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | private runtime policy matches native headers and preserves explicit CUDA setting | `src/installer/__tests__/bootstrap.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/bootstrap.test.ts` | 0 | 4 | 17.6 s |  |

## t4

Run at 2026-11-23T19:29:59.021Z on commit `8a572dc6d`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: publisher binds exact source target runtime inventory and independent archive digest**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | publisher binds exact source target runtime inventory and independent archive digest | `src/installer/__tests__/publisher.test.ts` |
| pass | publisher rejects uncommitted compiler inputs despite unchanged source revision | `src/installer/__tests__/publisher.test.ts` |

**integration: production payload closure rejects missing entrypoints and escaping workspace links**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | production payload closure rejects missing entrypoints and escaping workspace links | `src/installer/__tests__/publisher.test.ts` |

**integration: bundled manager excludes DB indexer model imports and consumer npm build**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bundled manager excludes DB indexer model imports and consumer npm build | `src/installer/__tests__/publisher.test.ts` |
| pass | real bundler produces one dependency-minimal control fixture under owned build scope | `src/installer/__tests__/publisher.test.ts` |

**live: published manual and both IDE installer script assets have exact byte parity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | published manual and both IDE installer script assets have exact byte parity | `src/installer/__tests__/publisher.test.ts` |
| pass | client resource sync removes stale installer assets and retains steering and unrelated resources | `scripts/__tests__/client-assets-retirement.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/client-assets-retirement.test.ts` | 0 | 1 | 0.4 s |  |
| `src/installer/__tests__/publisher.test.ts` | 0 | 6 | 2.8 s |  |

## t5

Run at 2026-11-23T20:03:20.007Z on commit `5f300d660`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: hostile ZIP corpus cannot escape staging or exceed bounded extraction**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | hostile ZIP corpus cannot escape staging or exceed bounded extraction | `src/installer/__tests__/bundle.test.ts` |
| pass | candidate publication is exclusive and requires retained location and lock | `src/installer/__tests__/controller-store.test.ts` |

**integration: download digest target runtime cancellation and retry preserve incumbent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | download digest target runtime cancellation and retry preserve incumbent | `src/installer/__tests__/bundle.test.ts` |
| pass | release discovery rejects insecure redirects and never falls back to dev | `src/installer/__tests__/bundle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/bundle.test.ts` | 0 | 3 | 49.7 s |  |
| `src/installer/__tests__/controller-store.test.ts` | 0 | 7 | 1.3 s |  |

## t6

Run at 2026-11-24T08:15:31.351Z on commit `13d5db970`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: install is rejected even with a forged source/bootstrap marker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | install is rejected even with a forged source/bootstrap marker | `src/installer/__tests__/manager.test.ts` |

**integration: required peer admission and exact offer state transitions fail closed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | required peer admission and exact offer state transitions fail closed | `src/installer/__tests__/manager.test.ts` |
| pass | stop and interrupted stop recovery bypass dependency health and payload checks | `src/installer/__tests__/manager.test.ts` |

**integration: manager death and candidate journal receipt projections cannot start duplicate runner**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | manager death and candidate journal receipt projections cannot start duplicate runner | `src/installer/__tests__/manager.test.ts` |
| pass | pre-admission manager self exit recovers install and upgrade without duplicate hooks | `src/installer/__tests__/manager.test.ts` |
| pass | missing launch metadata in a later phase cannot masquerade as preparation recovery | `src/installer/__tests__/manager.test.ts` |
| pass | owned manager self exit leaves candidate running and recovery needs actual wrapper exit receipt | `src/installer/__tests__/manager.test.ts` |

**integration: corrupt controller revisions and immutable candidate mismatches fail closed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | corrupt controller revisions and immutable candidate mismatches fail closed | `src/installer/__tests__/manager.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/manager.test.ts` | 0 | 13 | 3.2 s |  |

## t7

Run at 2026-11-24T05:03:49.828Z on commit `5b92b40d6`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: cross window immediate forwards while owner lock remains held**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cross window immediate forwards while owner lock remains held | `src/installer/__tests__/operation-control.test.ts` |

**integration: duplicate stale wrong phase and dead owner escalation preserve exact completion nonce**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | duplicate stale wrong phase and dead owner escalation preserve exact completion nonce | `src/installer/__tests__/operation-control.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/operation-control.test.ts` | 0 | 2 | 4.6 s |  |

## t8

Run at 2026-11-24T08:22:41.761Z on commit `13d5db970`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: terminal installer requires all TTY streams and absent dev adapter fails explicitly**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | terminal installer requires all TTY streams and absent dev adapter fails explicitly | `src/installer/__tests__/terminal-install.test.ts` |
| pass | terminal consent binds exact dependency offer and never installs coding CLIs | `src/installer/__tests__/terminal-install.test.ts` |
| pass | terminal upgrade retains delivery and rejects stale dependency consent before disruption | `src/installer/__tests__/terminal-install.test.ts` |

**integration: ready commit and lock release precede same terminal installed TUI**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ready commit and lock release precede same terminal installed TUI | `src/installer/__tests__/terminal-install.test.ts` |
| pass | installed explicit home scopes socket config and daemon-owned data together | `src/shared/__tests__/installation-home.test.ts` |

**integration: cancel install failure and post install TUI error preserve correct outcome**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cancel install failure and post install TUI error preserve correct outcome | `src/installer/__tests__/terminal-install.test.ts` |
| pass | terminal cancellation settles owned work and suppresses later TUI handoff | `src/installer/__tests__/terminal-install.test.ts` |

**integration: assemble actual complete foundation payload only after all entrypoints exist**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | assemble actual complete foundation payload only after all entrypoints exist | `src/installer/__tests__/foundation-payload.test.ts` |

**integration: successor upgrade replaces its owned launcher and preserves ready selection**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | successor upgrade replaces its owned launcher and preserves ready selection | `src/installer/__tests__/terminal-install.test.ts` |
| pass | saved installer selects candidate control runtime and exact post-install retry | `src/installer/__tests__/terminal-install.test.ts` |

**smoke: canonical POSIX terminal script preserves I O and fixture TUI handoff and PowerShell source preserves invocation contract**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | POSIX script preserves real terminal I O through private runtime fixture TUI handoff | `src/installer/__tests__/bootstrap.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/installer/__tests__/bootstrap.test.ts` | 0 | 5 | 21.8 s |  |
| `src/installer/__tests__/foundation-payload.test.ts` | 0 | 1 | 341.5 s |  |
| `src/installer/__tests__/terminal-install.test.ts` | 0 | 9 | 3.7 s |  |
| `src/shared/__tests__/installation-home.test.ts` | 0 | 1 | 0.5 s |  |
