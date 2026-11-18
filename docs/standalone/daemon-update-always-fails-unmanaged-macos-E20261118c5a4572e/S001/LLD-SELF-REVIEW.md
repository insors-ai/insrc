# LLD Self-Review — c5a4572e3949359a/s1

Recorded controller self-review (automated design review is unavailable; the
retained `insrc_review_step` endpoint fails immediately while it is being
rewritten). Per the user's standing instruction to do self-reviews at each
step in its absence.

## Scope of review

`docs/standalone/daemon-update-always-fails-unmanaged-macos-E20261118c5a4572e/S001/LLD.md`
(LLD-c5a4572e3949359a-s1), against the approved ISSUE-c5a4572e3949359a.

## Checks performed

1. **Citation accuracy** — re-read every cited line range in the live repo
   (`scripts/daemon-ctl.sh:396-416`, `:368-394`, `:330-345`) and confirmed each
   matches the LLD's description exactly: `cmd_update`'s Darwin branch still
   re-execs `insrc-daemon-install.sh --target ... -y` unconditionally for the
   unmanaged case; `cmd_start`'s unmanaged fallback and `supervised_lifecycle`'s
   `rc=10` contract are as described. No stale citations.
2. **Scope boundary** — no implementation code, no diff, no task list anywhere
   in the contract/data-model/migration sections; every entry describes a
   behavioral outcome ("falls through to...", "drops the pre-emption...").
   Standalone Story, no adjacent boundaries to violate.
3. **Alternatives** — 4 genuine alternatives scored against 3 self-defined
   constraints (unmanaged-no-signing / managed-unchanged / single-source-of-
   truth); the chosen a2 is the only one satisfying all three, with the
   rejection rationale for a1/a3/a4 traceable to real code facts (e.g. a3
   rejected because both plugins already pre-empt `daemon-ctl.sh` and never
   reach the fixed code path).
4. **Completeness of blast radius** — the design explicitly covers all three
   codebases this story touches (`scripts/daemon-ctl.sh`, `vscode-plugin`,
   `jetbrains-plugin`) and names all 5 affected test files, including the
   cross-client integration test (`macos-upgrade-routing.test.ts`) discovered
   mid-design — the single most consequential test in this Story, since it is
   the authoritative "spec" that currently codifies the broken behavior as
   correct across all four surfaces.
5. **Backward compatibility** — confirmed no persisted-data or public-API
   signature changes; only internal routing for one case (`update` on an
   unmanaged install) changes, strictly from "always fails" to "succeeds like
   the sibling verbs already do."
6. **Companion diagram** — `sequence-diagram.html` generated from the
   `sequenceDefinition`; narrative and per-participant/message descriptions
   present, matching the "relevant design artifacts" rule (this is a genuine
   cross-component interaction change worth a visual).

## Findings

None. No open HIGH/MED issues.

## Minor, non-blocking notes (not findings)

- `cd1` in the design.story checklist (s8) was graded `partial`: the LLD's
  `ScriptDaemonProvisioner.run` signature is grounded in a direct source read
  this session rather than a formal `symbol.locate` graph hit (the analyzer's
  fuzzy test/symbol lookups in this area returned low-precision noise). The
  signature itself is verified accurate against the live file.
- `ep3` was graded `partial` for the same reason: `invariantsToPreserve`'s
  `c1`/`c2`/`c3` labels are informal (the `context.assemble` step's own output
  schema carries `pathsCited`, not a numbered citation list), but the
  underlying claims are all real and independently verified.
- Build should re-verify the exact current line numbers in `controller.ts`
  and `ScriptDaemonProvisioner.kt` before editing, in case anything shifted
  between this review and build (nothing should have — no other changes are
  pending in this tree for these files).
