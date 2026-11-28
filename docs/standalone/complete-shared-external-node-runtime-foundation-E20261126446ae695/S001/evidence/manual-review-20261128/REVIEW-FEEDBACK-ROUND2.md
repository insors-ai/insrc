# Manual code review, round 2: runtime-foundation (BUILD-446ae69566d352dd-s1)

- **Change:** ISSUE-446ae69566d352dd / STORY s1, *Complete the shared external Node runtime foundation*
- **Packet:** `/tmp/.insrc/446ae69566d352dd-s1-manual-review-20261128T074829Z/`. It supersedes `…T054556Z`, whose `REVIEW-FEEDBACK.md` held the round-1 findings.
- **Range:** previous reviewed head `4ec83d006f7b` → pinned head `46f99ef5c611`.
  - `2f6bcaea7`: code and test fixes.
  - `46f99ef5c`: records and the LLD6 draft. It has no `src/` or `scripts/` change (verified with `git diff --stat`).
- **Reviewed against:** the repository at `2f6bcaea7` and `46f99ef5c`; the draft LLD6 at `context/current/.../S001/LLD.md`; the dispositions at `review/DISPOSITIONS.json`; and the bootstrap-batch evidence.
- **Reviewer:** Claude Code (controller session), 2026-11-28.
- **Not done:**
  - Tests were not re-run.
  - No VM, daemon or Ollama action was taken.
  - Nothing was changed outside this file. It is a new file, so `SHA256SUMS` is unaffected.
  - Nothing was approved.

## Verdict

**The code fixes are accepted. LLD6 is acceptable after one correction (R2-1).**

- All six findings claimed as resolved (1, 2, 3, 14, T2, T5) are verified as resolved at `2f6bcaea7`.
- The 17 open, partial or design-pending findings are tracked accurately in `DISPOSITIONS.json`. None is silently dropped.
- BUILD-446ae69566d352dd-s1 is **not ready for final approval**. The packet says the same: the remaining corrections, the PLAN realignment, the full scoped regression and the current macOS/Linux qualification are all still outstanding.

## Round-1 findings claimed as resolved

| # | Round-1 finding | Verified at `2f6bcaea7` |
|---|---|---|
| 1 | A trailing or doubled slash in `--home` breaks bootstrap | **Resolved.** <ul><li>`install.sh:29-32` collapses every `//` and strips one trailing `/` before any child path is built. Triple slashes also converge, because the loop repeats.</li><li>A leading `//`, `/./` and `/../` are still rejected earlier (`:27`).</li><li>The helper now compares `normalizeHome(dirname(work))` with `join(location.home,'install')` (`bootstrap-foundation.ts:25`). The fix is therefore on both sides, and the normalized `$home` is also what `bootstrap.mjs` receives.</li><li>The new test `bootstrap canonicalizes trailing and repeated separators…` covers `home/` and `parent//leaf`. It checks that the argv carries the canonical home and that the cached node inode is reused offline.</li></ul> |
| 2 | Signal traps leak the stage and print a false warning | **Resolved.** <ul><li>`record_signal` only records the signal while `helper_active=1`.</li><li>After the exact foreground child returns, the script clears `helper_active`, then exits with the recorded status (`:96-100`). The EXIT trap therefore removes the stage and prints no "unconfirmed" warning.</li><li>`$?` in the `else` branch is the child's status, because POSIX restores `$?` after a trap action.</li><li>The production handler gained SIGHUP (`terminal-main.ts:26`).</li><li>The test now sends a real `SIGINT`, `SIGTERM` or `SIGHUP` to the whole process group while the production helper is held in publication. It asserts all of the following: <ul><li>exit codes 130, 143 and 129;</li><li>`cancelled: Bootstrap publication interrupted`;</li><li>no "unconfirmed" text;</li><li>no canonical runtime entry;</li><li>no `bootstrap-stage.*` or `runtime-stage-*` left behind;</li><li>no manager launch.</li></ul></li></ul> |
| 3 | The fresh path runs the canonical node and control without hashing them | **Resolved.** <ul><li>`install.sh:107-109` hashes the canonical node, `bootstrap.mjs` and `control.node` immediately before `exec`.</li><li>`install.ps1:126-128` does the same, as source only, since Windows is deferred.</li><li>The test `bootstrap authenticates all canonical … after publication` tampers each of the three files in the helper's exit handler, after a successful publish. It asserts `asset digest mismatch`, no manager launch and no leftover stage.</li><li>The residual hash-to-exec race is now documented and accepted in LLD6 (finding 17).</li></ul> |
| 14 | The render baseline falls back to `native-v1` | **Resolved.** <ul><li>`render-installer-bootstrap.mjs:18-19` requires a string `asset.target.baseline` and an exact os/arch match. A missing `target` short-circuits on the `typeof` check before `asset.target.os` is read.</li><li>The only production caller (`package-installer.mjs:75-77`) passes `manifest.target`, which `parseReleaseManifest` has already validated.</li><li>A test covers a target-less asset.</li></ul> |
| T2 | The real publication branch and the real signal path were never tested | **Resolved.** <ul><li>The fixture `terminalMain` now delegates `--bootstrap-publication` to the real `out/installer/terminal-main.js`. The bootstrap/terminal split exists so the fixture can import it.</li><li>The fixture adds only observation: a hold on the first `runtime-stage-` open, an exit-event hook and post-exit tampering.</li><li>The "manager" half is still a fixture and is not claimed as lifecycle evidence. This is correct.</li></ul> |
| T5 | (cached-control tamper) | **Resolved.** <ul><li>The test `bootstrap refuses tampered cached bootstrap and native control offline` tampers each cached control file after a good first run.</li><li>It asserts `asset digest mismatch` and an unchanged event count, which proves the helper never ran.</li></ul> |
| T4 | Broad regexes | **Partly resolved, as claimed.** <ul><li>The prerequisite table now pairs each case with its exact diagnostic.</li><li>The terminal and dev-toolchain assertions remain open.</li></ul> |

**Refactor check:** `terminal-main.ts` is a byte-for-byte move of the old `terminalMain` body, with the SIGHUP listener as its only addition. `terminal-entry.ts` re-exports it, so existing importers are unaffected. The `--ollama-service-worker` branch is moved unchanged, so finding 7 is still open, as recorded.

## New findings

| # | Severity | Location | Finding and consequence | Proposed correction |
|---|---|---|---|---|
| R2-1 | MED (design) | LLD6 §6, "Missing or corrupt external runtime"; §8 step 5; test subject `writable-dev-SDK-isolated-from-shared-runtime-and-explicit-offline-recovery` | **The operator recovery mechanism is undefined.** <ul><li>Recovery from a corrupt canonical runtime entry requires "positive consumer/worker shutdown and original operation.lock ownership using authenticated external control". It also says "uncertain closure forbids the move".</li><li>The planned fixture even expects "uncertain closure prevents any operator move".</li><li>Yet the same LLD says the rework adds "no automation", "no new lifecycle actions" and "no automatic runtime replacement".</li><li>A hand-run procedure cannot hold the native `operation.lock` or prove that consumers have closed. Something in code has to do that, and the LLD names no entrypoint, command, owner or task.</li><li>The "explicit recovery guidance" in the `runtime-invalid` diagnostic isn't specified either.</li><li>Because every release shares one entry, and acquisition deliberately refuses to overwrite it, this is the user's only way out of the failure. As written, it can't be implemented or tested as specified.</li></ul> | Pick one of these before approving LLD6:<ol><li>Name a bounded, control-owned recovery entrypoint (for example a control-bootstrap subcommand that acquires the existing `operation.lock` and checks positive closure), its owning task and its test. Also state why that entrypoint doesn't count as a "new lifecycle action".</li><li>Downgrade recovery to documented manual guidance and drop the enforcement claim and its test fixture. Then the manual step can't positively hold the lock, so the LLD must say plainly that this risk is accepted.</li></ol>In both cases, specify the exact text the user sees in the diagnostic. |
| R2-2 | LOW-MED (advisory, owner decision) | LLD6 §9.2 (rejected a2) | **Read-only modes were rejected on a weak argument.** <ul><li>a2 is rejected partly because "owner modes cannot prevent same-user mutation". That is true for a deliberate writer.</li><li>But the failure mode behind finding 5 is accidental writes: dev lifecycle scripts, node-gyp and tools resolving `nodedir`. Removing write bits after publication stops almost all of those, since they fail with EACCES.</li><li>The isolated SDK copy (a1) only protects the inputs the build workspace knows about. Any process can still write into the canonical store by absolute path, for example a dependency's postinstall script.</li><li>Combined with fail-closed behavior and manual-only recovery, one stray write still disables every release.</li></ul> | Consider a narrower option than a2: remove the write bits on files and directories after publication, and have the verifier compare inventory modes with the write bits masked. This leaves the archive bytes unchanged and needs no consumer-lifetime protocol, although it does change verifier semantics. Otherwise, record in §9 that accidental writes are accepted and that a1's copy is the only mitigation. |
| R2-3 | LOW | `install.sh:92-100` | **Cancellation can be delayed by a whole publication.** <ul><li>A signal is always deferred until the helper exits. That works for a terminal Ctrl-C or hangup, which reaches the whole foreground process group, and that is the case the tests cover.</li><li>A `SIGTERM` or `SIGHUP` sent only to the shell's PID (for example `kill <pid>` or a supervisor), or a signal landing between `helper_active=1` and the fork, is recorded but never forwarded.</li><li>The helper then finishes its entire publication before the shell exits with 143 or 129.</li><li>This is safe, since nothing is left uncertain, and it matches "wait for exact exit". The cost is that cancellation latency is bounded only by the helper's own deadlines.</li></ul> | Document this in LLD §3.4. It needs no code change, unless prompt cancellation for a signal to the shell's PID alone is a requirement. In that case, run the helper in the background, forward the signal and `wait`. |
| R2-4 | LOW (test) | `bootstrap.test.ts:98` | **The `wrongTarget` row doesn't test the target.** <ul><li>The row now expects `asset size mismatch`, the same diagnostic as `corruptArchive`.</li><li>The case fails on the archive size before anything target-specific runs, so it proves nothing about target binding.</li><li>Target binding is covered elsewhere, through renderer identity and the pinned per-target digest. This row adds no coverage beyond the size check.</li></ul> | Either rename the row honestly (for example "foreign archive rejected by pinned size"), or build a fixture whose size matches but whose digest differs, so the digest check is reached. |
| R2-5 | LOW (nit) | `bootstrap-foundation.ts:25` | **The helper checks a normalized path but uses the raw one.** <ul><li>The containment check uses `normalizeHome(dirname(work))`, but the leaf slice and every later use of `work` take the raw string.</li><li>This is harmless now that the script canonicalizes its paths.</li><li>Still, the helper accepts a broader spelling than the one it operates on.</li></ul> | Normalize `work` once, then use that value for the check, the leaf name and everything downstream. |

## LLD6 decisions on the remaining round-1 findings

These are draft decisions, not implementations. I assessed only whether each decision is adequate.

| # | LLD6 decision | Assessment |
|---|---|---|
| 4 | Full application proof at preparation and recovery, before destructive steps. Process-local proof is reused only within the same operation. A new or recovered operation revalidates once. Launch and status stay bounded. | **Adequate.** It restores the protection base had (`verifyPublishedPayload`) without repeating the scan on every status check. Planned subjects cover truncation before activation and a scan counter. |
| 5 | Writable npm, node-gyp, header and library inputs are copied into the owned build workspace. The canonical store fails closed. Recovery is a manual operator action. | **Adequate for the dev write path. Recovery is blocked by R2-1, and the residual accidental-write risk is R2-2.** |
| 6 | The publisher's claim is narrowed to known content and the source boundary. Universal provenance is explicitly disclaimed. | **Adequate.** The claim now matches the code. |
| 8 | Production deadlines are constants. Only the trusted qualifier entrypoint installs bounded slow-VM context, before modules are imported. | **Adequate.** A planned subject covers an inherited invalid selector. |
| 17 | The same-user hash-to-exec race, including ancestor swaps, is accepted and documented. The final canonical checks narrow it. | **Adequate.** It is stated in §3.4 and in the edge cases. |

## Checks performed

- **Delta read in full:** `install.sh`, `install.ps1`, `render-installer-bootstrap.mjs`, `bootstrap-foundation.ts`, `terminal-entry.ts`, `terminal-main.ts`, `bootstrap.test.ts`, plus `bootstrap-publish.cjs` for how the helper is invoked.
- **Trap control flow:**
  - A signal during `fetch` or `verify`, before the helper runs, exits immediately and the stage is removed.
  - A signal while the helper runs is deferred and recorded, and the stage is removed.
  - A signal between line 98 and the trap reset exits immediately and the stage is removed.
  - After the trap reset the stage is already gone.
- **Callers:** `renderInstallerBootstrap` has one production caller, which supplies `target`. `terminalMain` importers are unaffected by the re-export.
- **Evidence:**
  - The registered TAP files show 4/4 bootstrap-control, 11/11 bootstrap and 6/6 runtime-install tests passing, with no fail, cancel or skip. The 11 bootstrap titles match the new tests.
  - Strict closure: 11 admissions, 11 results and 11 disposals, all `closed`. `cleanup.json` shows `confirmedClosed`, `owned-groups` and empty error arrays.
- **Packet integrity:** `shasum -c SHA256SUMS` reports 0 mismatches. `PACKET-VERIFICATION.json` reports pass.
- **Honesty of the record:**
  - The packet correctly treats the old macOS and Linux proofs as historical; the production bootstrap changes invalidate the earlier source-equivalence claim.
  - The packet says the MCP call timed out but the original gate run completed, and it was not duplicated. This matches the recovered BUILD22 and TESTS22 records.

## Unverified evidence

- **Linux shell:** the signal and trap tests ran on macOS, where `/bin/sh` is bash in POSIX mode. Debian and Ubuntu `/bin/sh` is dash, and the trap behavior has not been run on Linux at this head. The required Linux qualification rerun should include the cancellation test.
- **Windows:** PowerShell changes are checked by source assertions only, since Windows is deferred.
- **Tests:** not re-run by me.

## Human decisions

1. **R2-1:** choose the operator recovery mechanism, or explicitly accept manual-only recovery. Then correct LLD6 before approving it.
2. **R2-2:** keep a1 as written, or add write-bit removal to the canonical store.
3. After LLD6 is approved: realign PLAN3, then do the remaining task rework, the full scoped regression and the current macOS/Linux qualification before BUILD approval.
4. Carried over: the blocked isolate `d7a67629` (`/private/tmp/insrc-q5-pb8Jqt`) still needs an explicit operator decision.

No approval is implied by this review. LLD-446ae69566d352dd-s1 (revision 6) and BUILD-446ae69566d352dd-s1 remain pending your explicit approval.
