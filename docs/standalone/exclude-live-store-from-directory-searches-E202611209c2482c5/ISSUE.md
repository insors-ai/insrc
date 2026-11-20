<!-- insrc:artifact ISSUE-9c2482c594fd8df5 -->

# Exclude the live store from directory searches

## Reproduction

The live-store-file-refusal test searches a fixture .insrc directory for NEEDLE and receives graph.lmdb and lock-file content. Expected: the live store and lock file remain excluded, including containing-directory and symbolic-link access.

## Root cause

The audited directory-search result demonstrates that existing direct-file refusal is insufficient for descendants traversed by the shared grep primitive. Which backend/path-resolution checks must enforce the same boundary requires confirmation in the design; the returned fixture content is established, not hypothetical.

## Fix intent

Apply the live-store exclusion consistently to search traversal through supported backends and aliases while preserving legitimate repository matches and truthful completeness/error reporting. Acceptance: direct, directory, symlink and alternate-backend regression cases return no store or lock-file content, and allowed-file positive controls still work. Do not broaden this issue into general filesystem access policy.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `src/daemon/tools/builtins/search/grep.ts`
