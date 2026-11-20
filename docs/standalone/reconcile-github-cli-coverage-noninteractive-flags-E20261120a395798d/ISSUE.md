<!-- insrc:artifact ISSUE-a395798d1ad21992 -->

# Reconcile GitHub CLI coverage and noninteractive flags

## Reproduction

Against gh 2.101.0, the coverage test finds unclassified discussion, PR, release and repository subcommands. Input coverage lacks auth status --active, and the prompt sweep finds gh_gist.delete does not always provide the prompt-skipping --yes flag. These failures reproduced in both audit continuations.

## Root cause

The installed CLI help has evolved beyond the explicit coverage/input tables, and the gist-delete operation does not satisfy the current noninteractive contract. Every new command must be intentionally covered or excluded; this is not a request to expose every CLI capability automatically.

## Fix intent

Classify installed commands with justified supported/excluded decisions, account for current flags and positionals, and ensure registered operations cannot unexpectedly prompt. Acceptance: installed-help coverage and input audits pass, gist-delete prompt avoidance is verified without deleting real user data, and all existing per-input approvals and tool schemas remain correct. Validate the declared CLI support range rather than pinning one workstation's help output blindly.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `src/daemon/tools/builtins/gh/coverage.ts`
