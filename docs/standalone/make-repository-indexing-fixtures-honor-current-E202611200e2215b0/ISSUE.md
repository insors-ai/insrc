<!-- insrc:artifact ISSUE-0e2215b02b392752 -->

# Make repository and indexing fixtures honor current contracts

## Reproduction

repo-completeness expects a seeded repository to be complete but receives unembedded:4. Search-filter/guard tests wait 180 seconds without observing the expected indexing refusal. Analyze-step fixtures hardcode a deprecated insrc-ide path and then pass undefined state tokens after start fails. MCP pass-through compares /private/var/folders with /var/folders for the same repository.

## Root cause

The seeded helper writes low-level Lance vectors after empty-embedding entity upserts, bypassing the graph embedding markers now used for completeness. Other fixtures assume a particular checkout and noncanonical temporary path. The exact reason the indexing window is missed remains unverified and must be diagnosed with a deterministic fixture rather than guessed.

## Fix intent

Make repository fixtures isolated, explicitly registered, embedding-marker consistent and path-canonical across in-process and MCP use; make the indexing-state tests deterministically reach the state they claim to test. Acceptance: completeness positive controls are actually complete, indexing refusal/filter assertions run during a verified index, analyzer continuation uses a valid returned token, and MCP prompt comparisons agree without deprecated-fork dependencies. Do not relax production scoping or fabricate completeness.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `src/daemon/__tests__/helpers/seeded-daemon.ts`
- **[[c3]]** `code` `src/analyze/explore/executor.ts`
