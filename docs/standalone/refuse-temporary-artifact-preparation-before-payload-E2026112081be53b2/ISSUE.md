<!-- insrc:artifact ISSUE-81be53b2b0f003a7 -->

# Refuse temporary artifact preparation before payload inspection

## Reproduction

While repairing Batch04's removed writer import, call current writeArtifact(path, hostilePayload, 'content') inside runWithConnectionExecution for a real session-memory execution. The unchanged privacy assertion expects code unsupported-temporary. Observed: prepareArtifactWrite reads the payload getter and throws TEMP_SOURCE_<canary> instead. Reproduced by Node22 --import tsx --test src/daemon/steps/__tests__/task-persistence.test.ts after switching the fixture to the current API; saved artifact persistence/read-back passed earlier in the same matrix. Retained diagnostic: docs/plans/review-test-evidence-2026-11-20/t3-current-writer-failure.tap. Batch04 t3 remains non-green; no production fix has been applied.

## Root cause

writeArtifact delegates to shared prepareArtifactWrite, which inspects next.meta and prior contents before reaching writeAtomic's assertNoSessionPersistence. The policy guard therefore runs too late to prevent hostile payload inspection. The analyzer locates the existing guard and preparation reused by both the wrapper writer and artifact-core store; source and the captured stack confirm ordering. This is a shared admission-order defect, not obsolete review behavior.

## Fix intent

Reject prohibited temporary artifact preparation before inspecting payloads, prototypes, serialization, or artifact filesystem state, reusing the current trusted persistence policy. Cover direct preparation and wrapper writing, hostile getter/proxy inputs, and absence of artifact access/output. Preserve saved content/meta-only revision, lifecycle, tracker/envelope and history semantics with existing positive controls. No schema/API changes, review restoration or general storage rewrite. After this separately approved blocker is fixed, resume Batch04 without weakening its privacy assertions.

## Citations

- **[[c1]]** `code` `src/workflow/storage.ts`
- **[[c2]]** `code` `src/shared/connection-persistence.ts`
- **[[c3]]** `code` `src/workflow/artifact-core/store.ts`
- **[[c4]]** `doc` `docs/plans/review-test-evidence-2026-11-20/t3-current-writer-failure.tap`
- **[[c5]]** `prior-artifact` `docs/standalone/align-historical-tests-retired-review-contract-E2026112003bd8497/S001/PLAN.md`
