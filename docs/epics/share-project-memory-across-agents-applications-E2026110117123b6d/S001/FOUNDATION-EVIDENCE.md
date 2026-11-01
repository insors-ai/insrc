# S1 foundation acceptance evidence

The independent @insrc/project-memory foundation is implemented in packages/project-memory. All ten task gates passed. The user subsequently requested implementation of the two remaining MED findings; both are implemented in b4ee0ba51. Completion remains pending fresh independent review and the approval stamp.

## Current actual results

| Check | Result | Evidence |
| --- | --- | --- |
| Combined local package suite | 20 passed; 0 failed/skipped/cancelled/todo; natural exit | [macOS TAP](evidence/macos-combined.tap) |
| Root package-first build | Exit 0; package tsc, backend tsc, model validation and asset copy preserved | [build output](evidence/root-build.txt) |
| Linux/ext4 qualification | Node 22.22.1 / ABI 127; 12 native/lifecycle and 3 packed-consumer tests passed; no skips | [run 41348966563](https://github.com/insors-ai/insrc/actions/runs/41348966563), [run identity](evidence/linux/run.json), [platform](evidence/linux/platform.log), [native TAP](evidence/linux/native-lifecycle.tap), [packed TAP](evidence/linux/packed-consumer.tap) |
| Current-source identity | The archived Linux source/workflow equals current implementation and fixtures | scripts/__tests__/project-memory-qualification.test.ts |

Commands: npm test --workspace @insrc/project-memory and npm run build, with /opt/homebrew/opt/node@22/bin first on PATH. Local host: /opt/homebrew/Cellar/node@22/22.23.2/bin/node, Node 22.23.2, ABI 127; project and temp roots both APFS statfs type 26. Existing root .npmrc targets Node 22.22.1 headers. Native dependency provenance: fs-ext 2.1.1 / nan 2.30.0. External consumers install and rebuild the declared dependency independently with CXXFLAGS=-std=c++17, without backend npm config or workspace node_modules. Linux qualified revision: 9081bbdf7bd1c440f9c54c54f5f1cad1276593c9 on an isolated S1 branch excluding parallel-stream changes.

## Final two MED findings: implemented corrections

The user requested fixes for both [cycle-1 round-3 findings](evidence/review-cycle-1-round-3.md), replacing the earlier proposal to accept them as exceptions.

1. **Ownership coordination:** acquireOwnership is now a short sequence of root preparation, descriptor acquisition, guarded layout establishment and guard transfer. lockDescriptor owns lock acquisition and failure cleanup. initializeNewLayout contains new-layout writes. establishOwnedLayout handles the read-only existing-layout path and shared final identity verification. ownershipGuard contains idempotent release. failedAcquisition shares cleanup/error mapping without closing a descriptor twice.
2. **Duplicate pre-lock classification:** host-node passes validated options to acquireOwnership, which prepares the root once and loads native support afterwards. The previous second pre-lock classifyLayout call is removed. One read-only preflight remains before acquisition, and one authoritative classification occurs while holding ownership. No preflight new/existing decision is cached across acquisition.

The new layout-state-is-decided-under-ownership-after-one-preflight regression forces a cooperating opener to initialize between another opener's preflight and lock acquisition. The first adopts the completed marker without rewriting it. It also proves that an invalid layout introduced after preflight is rejected under ownership, the failed descriptor is closed, the kernel lock is released, and an unrelated initial directory is refused without creating a lock file.

Both MEDs are implemented; no override for them is requested. A new independent review cycle follows the refreshed evidence. Approval must be stamped before any subsequent Git commit because HEAD participates in the review fingerprint.

## Acceptance mapping and module boundary

- **ac1:** contracts.test.ts verifies strict public declarations, explicit optional undefined fields, pure import and emitted local dependency boundaries. packed.test.ts installs a real tarball in an independent directory, compiles a strict TS/ESM consumer, runs open/ready/drain/close with natural exit, verifies supplied models remain usable, checks export/asset allowlisting, and proves import purity plus honest NOT_READY when the addon is unavailable. That negative test also proves invalid-root refusal precedes addon loading. The root-build evidence preserves backend steps and output paths.
- **ac2:** configuration.test.ts, ownership.test.ts, contention.test.ts and runtime.test.ts verify canonical identity, one kernel owner across copies/threads/processes, independent roots, aliases, unsafe metadata refusal, failed acquisition cleanup, host resource ownership, crash release, stopped-owner exclusion, incomplete drain, concurrent close and multi-participant cleanup. The new transition regression exercises both guarded layout paths after changing state across acquisition. Linux independently repeats real native/lifecycle checks.

The ten source modules import only package-local modules, Node built-ins and lazily loaded fs-ext. No backend src/daemon/config/shared-types/shared-paths/shared-logger/index imports are present. Public import starts no filesystem/provider/native work. The host supplies and retains models, policy, logger, limits and an explicit dedicated directory. Model dispatch serializes complete/embed; cancellation/timeout does not free the lane until the underlying provider settles.

S1 creates only layout.json and a persistent .owner.lock. Durable journal, LanceDB storage, normalization/dedupe/compression, recall, IPC executable, agent adapters and daemon integration remain later stories. All five data methods reject NOT_READY; foundation readiness does not claim data readiness. Exports are only the main contract and explicit Node host.

## Review history and qualification limits

- [Round 1](evidence/review-round-1.md): corrected native-load ordering, explicit failed-startup cleanup priority, per-call versus lane bookkeeping, attempted cleanup of every quiescent participant while retaining ownership on failure, and shared file-safety validation.
- [Round 2](evidence/review-round-2.md): clarified existing-ancestor filesystem preflight before mkdir versus freshly resolved root qualification after mkdir. Both distinct filesystem checks remain.
- [Round 3](evidence/review-cycle-1-round-3.md): the final two MEDs are now implemented as described above. They are not accepted exceptions. The new review will replace CR.md.

The initial fs-ext async callback crashed under concurrent worker isolates; synchronous nonblocking exnb flock passed macOS/Linux worker qualification, including terminated-worker recovery. FIFO metadata opens nonblocking and is refused before reading. An early Linux source-loader failure was corrected by making worker/child peers consume the built JavaScript entry. Earlier root-build/typecheck failures overlapped unfinished parallel-stream changes; the current root build passes without this story modifying those files.

Qualification covers local APFS/macOS and ext4/Linux. Linux ext-family magic alone cannot distinguish exact subtypes; the documented ext4 deployment precondition remains. External mutation of a live directory and overlapping external cleanup roots violate host preconditions. Native compilation requires the documented toolchain. Tests invoke no real LLMs or direct cloud REST. No npm publish or full repository test sweep occurred; focused package tests and root build follow the agreed story sequencing.

## Follow-up review corrections

[Cycle 2 round 1](evidence/review-cycle-2-round-1.md) did not repeat either user-requested MED. Its new findings are implemented in f82577917:

- The public factory type is a direct alias of the single types.ts contract, rather than another interface declaration. The public type/value consumer compiles in both local and isolated packed checks.
- openLockCandidate owns validation before native locking. lockDescriptor performs native acquisition and a fresh identity check afterwards. The checks serve distinct safety boundaries: reject unsafe candidates before flock; detect inode/root changes across an awaited native result. A hardlink regression proves native exclusive is never invoked for an unsafe candidate, while the existing delayed-acquisition test proves post-lock replacement detection and descriptor cleanup.
- Provider failure, caller abort and timeout now route through ModelCall.cancel as one settlement path. The additional #fail method is removed; only underlying settlement releases the dispatcher lane.

Refreshed current evidence remains 20 local package tests, 15 Linux checks, successful root build, and an exact source/workflow match to the archived run. No code-review exceptions are requested.
