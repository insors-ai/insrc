<!-- insrc:artifact ISSUE-1b3caadf04023d33 -->

# Steering does not make an impact analysis of what the Epic has already built the first activity of a later Story

## Reproduction

Take an Epic with more than one Story whose first Story is already built and approved (its BUILD and TESTS records and commits exist). Start the next Story's design.story, then its plan, then its build, following the steering exactly as given. Observed: nothing in the steering or in the first step of any of those stages tells the controller to analyse what the earlier Stories actually built (the code and contracts they changed, the tests they added, the deviations their BUILD records disclose) before doing anything else; the stage reads the Story's own brief and the design's view of its siblings and goes on. Expected: the first activity of every later Story stage is a complete impact analysis of what the Epic has already built, so the Story is designed, planned and built against the real current state and not against the original design.

## Root cause

The steering is one canonical block, src/prompts/steering-block.md, injected into each host agent's instructions by src/daemon/steering-inject.ts and cut into per-workflow guide sections by src/daemon/guide-sections.ts; none of those texts has a first activity for a later Story of an Epic. The stage prompts that do the grounding are written for the Story alone: the design.story context.assemble step (src/workflow/runners/design-story/index.ts) tells the controller to locate the APIs of the HLD's shared contracts the Story owns or consumes and to trace its own entities, and the Story's context slice carries only the sibling Stories' declared scope (adjacentBoundaries), which is design intent, not built state. A standalone Story carries no sibling information at all (src/workflow/runners/design-story/standalone.ts). The plan stage's context.assemble reads the approved LLD handoff of its own Story (src/workflow/runners/plan/index.ts), and the build stage's implement prompt points at the Story's own LLD, HLD and plan. So the built state of the earlier Stories (their approved BUILD and TESTS records, commits, changed code, contracts and tests, and the deviations those records disclose) is read by no stage, and a later Story can contradict or duplicate what an earlier one changed without any step asking about it.

## Fix intent

Make an impact analysis of what the Epic has already built the first activity of every later Story stage. In the steering (the canonical block and the design.story, plan and build guide sections) state the rule: before design.story, plan or build of a Story that is not the Epic's first, the controller first produces a complete impact analysis of the Epic's already-built Stories (from their approved BUILD and TESTS records, commits, changed code, contracts and tests, including disclosed deviations and failing-test baselines) and relates it to the Story at hand. In the stage's own first step (context.assemble for design.story and plan, the implement prompt for build) make that analysis the first thing asked for and have its result carried into the Story's artifact so a reviewer can see it. The design decides what the analysis reads, how it is bounded for a large Epic, and where it is recorded; this issue does not prescribe the implementation.

## Citations

- **[[c1]]** `code` `src/prompts/steering-block.md`
- **[[c2]]** `code` `src/daemon/steering-inject.ts`
- **[[c3]]** `code` `src/daemon/guide-sections.ts`
- **[[c4]]** `code` `src/workflow/runners/design-story/index.ts:136-160`
- **[[c5]]** `code` `src/workflow/runners/design-story/standalone.ts:66-67`
- **[[c6]]** `code` `src/workflow/runners/plan/index.ts:83`
