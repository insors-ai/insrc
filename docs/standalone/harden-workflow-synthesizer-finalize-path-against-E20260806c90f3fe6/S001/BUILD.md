# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-08-06T13:28:55.521Z

## Scope

Harden the workflow synthesizer finalize path: (1) guard safeDeriveSlug against an undefined focus (orchestrator.ts:1298); (2) deterministically rebuild storyBoundaries[].depends as the exact inverse of consumedByStories in finalizeDesignEpic before checkContractDependencyGraph, so cg3 is satisfied by construction and design.epic never aborts on depends drift. cg1/cg2 unchanged; new reconcileDependsFromConsumers helper in artifacts/hld.ts; amendment applier already consistent.

## Triage rationale

Two deterministic robustness fixes confined to src/workflow: a null-guard in safeDeriveSlug and an auto-reconcile pass in finalizeDesignEpic reusing logic the cg3 validator already computes. No schema/IPC change.
