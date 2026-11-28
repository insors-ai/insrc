# Manual review, round 3: runtime-foundation (LLD7 checkpoint)

- **Change:** ISSUE-446ae69566d352dd / STORY s1, *Complete the shared external Node runtime foundation*
- **Packet:** `/tmp/.insrc/446ae69566d352dd-s1-manual-review-20261128T090252Z/`
- **Range:** round-2 reviewed head `46f99ef5c611` → pinned head `81dd67a04670`, a single commit, `81dd67a04`.
- **Delta:** design and records only.
  - `git diff --stat 46f99ef5c 81dd67a04 -- src scripts vscode-plugin jetbrains-plugin package.json` is empty.
  - The commit changes the LLD (`.md` and `.json`), its three generated diagrams, the round-2 feedback copy, `ROUND2-STATUS.md`, `disposition-status.json` and `round2-design-audit.json`.
- **Reviewed against:**
  - the LLD7 draft at `81dd67a04`;
  - `review/DECISIONS-NEEDED.md` and `review/OWNER-QUESTIONS.json`;
  - the code at `81dd67a04`: `controller-store.ts:184-216` (`publishRuntime`) and `runtime-acquire.ts:81-100` (stage creation).
- **Reviewer:** Claude Code (controller session), 2026-11-28.
- **Not done:**
  - Tests were not re-run.
  - Nothing was changed outside this file. It is a new file, so `SHA256SUMS` is unaffected; `shasum -c` reports 0 mismatches.
  - Nothing was approved, and neither owner question was answered.

## Verdict

**LLD7 handles R2-1 and R2-3 correctly, but its read-only protection design (the R2-2 option) is not implementable as specified (R3-1).**

- No code has changed since round 2, so the six accepted bootstrap fixes stand.
- R2-4 and R2-5 are now planned in LLD7 §7/§8 but not yet implemented, as the packet says.
- Fix R3-1 in the LLD before approving it if you choose read-only protection. If you choose SDK-only (a1-narrow), R3-1 and R3-3 fall away.

## Round-2 findings

| # | LLD7 change | Assessment |
|---|---|---|
| R2-1 | <ul><li>Recovery is now explicitly manual guidance. There is no command, lock holder, closure proof or enforcement fixture.</li><li>The exact `runtime-invalid` message is given in §4.3.</li><li>The concurrent-use risk is disclosed for human acceptance.</li><li>The enforced-recovery alternative is recorded in §9.</li></ul> | **Resolved as a design**, pending owner question q14408171. The contradiction is gone: no test now claims enforcement. One gap remains in the guidance text (R3-2). |
| R2-2 | <ul><li>Proposed: POSIX write-bit removal. Files get `pinned & ~0222`, directories `0500`, metadata `0400`.</li><li>The official inventory and its hash are unchanged.</li><li>There are three verifier lanes: `published`, `source-stage` and `permission-transition`.</li><li>Intact writable entries are sealed by the controller, and SDK isolation is kept.</li><li>The SDK-only option stays as a valid alternative.</li></ul> | **The direction is right, but the publication ordering is broken (R3-1).** <ul><li>Comparing strict equality to `pinned & ~0222` is correct and stronger than my round-2 "masked compare" suggestion.</li><li>Keeping inventory bytes unchanged is correct.</li></ul> |
| R2-3 | <ul><li>Cancellation latency is documented for a signal sent only to the shell's PID, or arriving before the fork.</li><li>Linux qualification must run the real dash group-signal fixture.</li></ul> | **Resolved.** |
| R2-4 / R2-5 | Planned: relabel the foreign-archive row, and normalize `work` once. | **Planned, not implemented.** This is consistent with the packet. |

## New findings

| # | Severity | Location | Finding and consequence | Proposed correction |
|---|---|---|---|---|
| R3-1 | MED (design) | LLD7 §4.3 ("For fresh owned stages … remove write bits … and verify protected modes before native no-replace publication"); §3 ("every entry directory 0500") | **A sealed stage cannot be published.** <ul><li>`publishRuntime` (`controller-store.ts:190,209`) moves `<home>/install/runtime-stage-X/candidate` to `<home>/runtimes/22.22.1/<target>/<sha>` with `publishDirectory`. That is a rename of a directory into a different parent.</li><li>POSIX refuses that rename with EACCES when the directory being moved isn't writable, because the rename has to rewrite its `..` entry.</li><li>I confirmed this on this Mac: `chmod 500 a/stage; mv a/stage b/entry` gives `Permission denied`, while a rename inside the same parent succeeds. Linux `rename(2)` documents the same EACCES case.</li><li>As specified, every fresh acquisition would therefore fail at publication, after a full download and extraction.</li><li>Only the candidate root is affected. Subdirectories move with it, and their `..` entries don't change.</li></ul> | Seal everything except the candidate root while it is in the stage, publish, and only then `chmod 0500` the published root under the same lock. Fsync it and verify the strict published form before returning. A crash between publishing and the final chmod leaves exactly one writable directory, the root. The `permission-transition` lane can then be specified as covering only that state, plus dev homes from before protection existed. Update §3, §4.3 and the edge-case table, and add a fixture that publishes a real sealed stage through the native `publishDirectory`. A fixture that only checks modes is not enough. |
| R3-2 | LOW-MED | LLD7 §4.3 manual-recovery message ("preserve and move the entire entry outside the runtime store") | **The recovery instructions fail on a sealed entry.** <ul><li>With protection on, the entry root is `0500`, so the operator's `mv` to another directory fails with the same EACCES as R3-1.</li><li>`rm -rf` on the entry would also fail.</li><li>The only guidance the product gives therefore doesn't work as written, at the moment the user most needs it.</li></ul> | If protection is chosen, the message or its documentation must say to restore owner write on the entry root first (for example `chmod u+w "<runtime-entry>"`) before moving it, and must say nothing should be deleted. Test the exact text. |
| R3-3 | LOW (scope of the rollout concern) | `review/DECISIONS-NEEDED.md` item 2; LLD7 §8 "Backward compat" | **The rollout risk may be smaller than the question states.** <ul><li>The question asks the owner to plan a rollout for "older control binaries [that] compare original writable modes".</li><li>From this packet, the external runtime store, descriptor 2 and dev receipt 2 are all introduced by this unapproved Story. Host v2 doesn't use them and stays untouched.</li><li>If no release has ever shipped a control that reads the store, the only "older" populations are dev, test and qualification homes built during this Story. Those can be rebuilt. No mixed-version field rollout exists.</li></ul> | Confirm in the LLD that no published release reads the runtime store. If it's true, record that the mixed-version case covers development homes only and needs no compatibility promise. The transition lane then only needs to handle the crash window from R3-1. This makes owner question q3f4b548f a simpler choice. |
| R3-4 | LOW (test) | LLD7 §7 fixtures; existing `f.clean()` / `fs.rmSync(..., { force: true })` in `bootstrap.test.ts`, `runtime-*.test.ts` | **Test cleanup will break on sealed trees.** <ul><li>Once entries are sealed, every unit-test fixture that publishes a runtime will fail to remove its home: unlinking inside a `0500` directory gives EACCES, and `force` doesn't help.</li><li>The result is either errors in `after`/`finally` hooks or leaked `ibt-*` and `ibc-*` trees under the temp directory.</li><li>LLD7 covers native-harness disposal only.</li></ul> | Add one shared test helper that restores owner write inside the fixture's own isolated root before removing it, and use it in every runtime-publishing fixture. Mention it in §7. |

## Recommendations on the open owner questions

These are advice only. Neither question has been answered.

- **q14408171 (recovery):** **manual guidance, with R3-2 fixed, plus a tracked follow-up.** Manual-only is proportionate while the store has no field population. The follow-up would be a control-owned recovery command, revisited before the rewrite installer is generally released.
- **q3f4b548f (protection):** **read-only protection plus SDK isolation, provided R3-1 is fixed and R3-3 is confirmed.**
  - It stops the accidental-write failure, which is the one that disables every release at once.
  - It costs no change to the inventory or hash format.
  - If R3-3 holds, there is no real mixed-version rollout to plan.
  - If the owner prefers the smaller change, SDK-only is a coherent choice. R3-1, R3-2 (in its chmod part) and R3-4 then don't apply.

## Checks performed

- **Delta:** confirmed to be documents and records only; no production or test source changed.
- **LLD7 read** for §3 invariants, §4.3 (acquisition, protection, recovery text), §6 error and edge cases, §7 test subjects, §8 migration and backward compatibility, §9 alternatives and §11 open questions.
- **Publication path:** checked against the code (`runtime-acquire.ts:81` stage under `install/`, `controller-store.ts:209` cross-parent `publishDirectory`), and reproduced the POSIX rename rule on macOS.
- **Packet integrity:** `SHA256SUMS` reports 0 mismatches, and `PACKET-VERIFICATION.json` reports pass.

## Unverified

- **Native publish:** I didn't confirm whether the native `publishDirectory` uses `renameat2`/`renamex_np` or another primitive. Every POSIX rename variant has the same write requirement on the directory being moved, so R3-1 holds either way. A real fixture (R3-1) will settle it.
- **No published release reads the store (R3-3):** inferred from the packet; the owner should confirm it.

## Process note

This is the third manual review round on this BUILD/LLD cycle. Further rounds are your call.

## Human decisions

1. Answer q14408171 and q3f4b548f.
2. If protection is chosen, correct R3-1 and R3-2 (and R3-4) in LLD7 before approving it.
3. After LLD approval: realign PLAN3, do the remaining code rework (R2-4, R2-5 and the open round-1 items), the full scoped regression, and macOS/Linux qualification including the Linux dash cancellation test.

No approval is implied. LLD-446ae69566d352dd-s1 (revision 7) and BUILD-446ae69566d352dd-s1 remain pending your explicit approval.
