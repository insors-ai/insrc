<!-- insrc:artifact CR-599a9b506f22b896-s3 -->

# Code review: 599a9b506f22b896:s3

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 5 · model `client`

**Changed files:** 2

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/migrate-docs-tree.ts:60 | The migration encodes the six retired FLAT dir names (FLAT_DIRS) — the inverse of the S002-retired *ArtifactPaths naming. This is intentional and correct (the migration is the ONLY remaining reader of the legacy layout, and it's a throwaway one-shot), consuming sc1/sc2 for the destination side per the LLD. Noted for traceability, not a defect. |
| LOW | src/workflow/migrate-docs-tree.ts:1 | The migration was RUN on this repo (t5): 224 artifacts relocated with git history preserved, JSON store byte-unchanged (0 .insrc/artifacts in the 48 commits), the DEF→SPEC cross-artifact link rewritten + post-move-validated, 0 unmappable. A re-run is a clean 0-move no-op (idempotent). Empirically confirms ac1/ac2/ac3 + lc1 on the real data. |

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/migrate-docs-tree.ts:216 | Matches the codebase conventions: node:fs/child_process shell-out for git (no wrapper lib exists), getLogger, .js import extensions, exactOptionalPropertyTypes-safe conditional spreads + guarded index access. The bin mirrors the existing src/bin/insrc-mcp.ts entry shape and is registered in package.json bin. |

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/__tests__/migrate-docs-tree.test.ts:1 | 10 tests cover the LLD strategy: both locate paths (slug-marker + hash-filename), DEF-anchored no-split, standalone routing, idempotent skip, fail-loud unmappable, non-artifact-never-enumerated, git-mv history, unmappable-refusal, git-mv-failure rollback, AND the whole-run-atomic rollback (commit failing on a later chunk restores to the pinned pre-run SHA). The relative-form-link edge (cold-review #3) is not directly tested — not present in this repo's writers (all repo-relative docs/ links) but a latent gap noted below. |

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/migrate-docs-tree.ts:398 | FIXED via independent cold review (recorded): (1) applyMigration's rollback now resets to a PINNED pre-run SHA (startSha) instead of HEAD, so a commit failing on a later per-epic chunk undoes already-landed chunks — no partial mix (regression test added); (2) planMigration now prefers a member's stamped meta.epicCreatedAt (the anchor the S002 live writer keys the folder on) over a reconstructed def.createdAt, so migrated + future-written members coincide even if a DEF is absent. Two latent LOWs left as noted: relative-form (../x.md) cross-doc links are neither rewritten nor validated (not emitted by this repo's writers), and the duplicate-`to` detector doesn't consider an already-nested skipped destination (a real collision would abort the git mv non-destructively rather than surface as unmappable). |

