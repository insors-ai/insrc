# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-01T05:52:21.539Z  ·  **Updated:** 2026-10-01T06:19:06.662Z

## Scope

Fix ISSUE-b1c7c1bc57962e97: msgRow (render-registry.ts renderRegistryWebviewSource) collapses on isLong(raw) regardless of role, so long assistant (LLM) answers render as a 3-line preview. Make the ASSISTANT row exempt from default collapsing so it always renders in full; the user row keeps collapsing when long (deliberate narrowing, recorded in the ISSUE). Do NOT weaken host.collapsible — tool-command, tool-result and caption rows must keep their default-collapsed behaviour. Rewrite the vacuous ac3 test at render-registry.test.ts:472 so it renders a message isLong() actually classifies as long (>3 newlines or >240 chars) and asserts no collapse wrapper; add a companion assertion that a long TOOL row still collapses, so the carve-out cannot silently disable the affordance. Presentation-only: no markup, protocol, view-model or persistence change.

## Triage rationale

bugfix / small. One role guard in one function plus the test that should have caught it. The test change is the substantive part — the original passed on a 16-char message for which the collapse branch was unreachable.

## Tasks validated

- ✗ `S001`

## Changes

- `.insrc/artifacts/BUILD-bd2d6b6a98f48dc6-S001.json` — **insrc-build** (2026-10-01T06:19:06.662Z)
