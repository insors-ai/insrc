<!-- insrc:artifact BUILD-a9101bff4b445e83-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-17T15:02:45.172Z  ·  **Updated:** 2026-11-17T15:45:28.650Z

**Commit:** 91d3cf154

## Scope

Bug: insrc_present (and the pending-list machinery behind it) fails to re-open an already-written, approved brainstorm SPEC artifact. `deriveMdPath` in src/workflow/pending.ts (line ~249) resolves a SPEC artifact's markdown path by checking `meta['standalone'] === true`, defaulting to the 'epic' work-item kind when that flag is absent/false — producing `docs/epics/<slug>/SPEC.md`. But a brainstorm SPEC artifact is ALWAYS written under `docs/standalone/<slug>/SPEC.md` regardless of the standalone meta flag, per the write-side special case in `pathsForWorkflow` (src/workflow/storage.ts ~line 1177-1188, workflow === 'brainstorm' always resolves 'standalone' and never stamps meta.standalone=true back). Fix: add an early special-case inside `deriveMdPath` (src/workflow/pending.ts) so that `kind === 'SPEC'` always resolves `workItemKind = 'standalone'`, mirroring the write-side special case already proven correct in `pathsForWorkflow` — rather than falling through to the generic `meta['standalone'] === true` check that SPEC artifacts never satisfy. No change to the write path, the SpecArtifact schema, or any other artifact kind's path resolution. See ISSUE-778fc07c9d84c7fb for the full reproduction/root-cause record.

## Triage rationale

A single localized fix in one function (deriveMdPath, src/workflow/pending.ts:245-257), which has exactly two in-file callers (toDescriptor, buildRecordMdPath). The write-side logic (pathsForWorkflow in storage.ts:1183-1188) already special-cases workflow==='brainstorm' as always-standalone; deriveMdPath just needs the equivalent early special-case for kind==='SPEC' so the read path agrees with the write path. No new contract, no schema/storage change, no cross-module ripple.

## Summary

Fixed deriveMdPath (src/workflow/pending.ts) to special-case kind==='SPEC' as always-standalone, matching the write-side logic in storage.ts's pathsForWorkflow brainstorm branch, so insrc_present/pending-list resolution reads the SPEC.md file at its real docs/standalone/ path instead of a nonexistent docs/epics/ path. Added a regression test in pending.test.ts.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.
