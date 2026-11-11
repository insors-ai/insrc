<!-- insrc:artifact BUILD-de3ab23659bc21fd-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-10T18:33:26.950Z  ·  **Updated:** 2026-11-10T18:48:15.497Z

**Commit:** 61dba0cb8

## Scope

Approved ISSUE-de3ab23659bc21fd (bugfix, small): rewrite only the cli-vibe family of src/assets/models/cloud-model-catalog.json to the runtime-verified values — remove devstral-latest and mistral-small-latest; replace mistral-large-latest with { id: 'mistral-large-4-0', aliases: ['mistral-large-4-0-3', 'mistral-large-4'], displayName: 'Mistral Large 4', efforts: ['low', 'medium', 'high'] }; set mistral-vibe-cli-latest (alias mistral-medium-3.5) efforts to ['off', 'high']; keep zai-glm-5-3 (alias glm-5-3) and zai-glm-5-3-flash (alias glm-5-3-flash) with efforts ['low', 'high', 'max']; tierDefaults core -> mistral-large-4-0, mid -> mistral-vibe-cli-latest, cheap -> zai-glm-5-3-flash; summariserModel -> zai-glm-5-3-flash. No other file changes except keeping tests green.

## Triage rationale

bugfix (small) routed issue -> build with no LLD (triage route producesLld=false): single shipped JSON asset plus one pinning test; no production code changes.

## Summary

Final validate after the CR-driven test addition (61dba0cb8): cli-vibe family rewritten to runtime-verified values in 4c795020b and pinned by a new assertion in model-catalog-asset.test.ts; code review attempt 2 passed with verified coverage and no findings. 66/66 model-related tests, 371/371 chat/CLI suites, check-model-definitions gate and tsc --noEmit all pass.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/assets/models/cloud-model-catalog.json` — **insrc-build** (2026-11-10T18:48:15.497Z)
- `src/daemon/__tests__/model-catalog-asset.test.ts` — **insrc-build** (2026-11-10T18:48:15.497Z)
