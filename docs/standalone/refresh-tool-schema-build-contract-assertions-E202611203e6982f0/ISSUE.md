<!-- insrc:artifact ISSUE-3e6982f04ac2815d -->

# Refresh tool schema and build contract assertions

## Reproduction

Git approval/schema snapshots reject existing git_diff.objectPair and git_cat_file.metadataOnly fields. The typecheck-config test expects the build string to start with tsc even though it now cleans output and builds the memory workspace first. The spawn-scan build test hardcodes three exemptions but the scanner now has a justified managed-release-staging exemption.

## Root cause

Historical literal snapshots assert old schemas and build/exemption lists instead of the currently intended contracts. These failures are distinct from GitHub CLI command/flag coverage and from output-directory races.

## Fix intent

Reconcile git tool schema, build-step ordering and spawn-exemption assertions with their authoritative current contracts, preserving validation, per-input approval checks and explicit reasons for every exemption. Acceptance: git schema/approval, build-script, typecheck-config and scanner tests pass with meaningful negative controls; an unexpected field, bypassed typecheck or unjustified exemption still fails. Do not weaken runtime validation merely to match snapshots.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `src/daemon/tools/builtins/git/diff.ts`
- **[[c3]]** `code` `scripts/clean-output.mjs`
