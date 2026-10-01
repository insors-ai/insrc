# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-01T06:09:05.570Z

## Scope

Dev-chat message bubbles span the full available width and the assistant bubble loses its purple left lining. Set .insrc-bubble--user max-width 82% -> 100%, .insrc-bubble--assistant max-width 90% -> 100%, and remove border-left:2px solid var(--magenta) from the assistant rule (chat-panel.ts:356/:358). Presentation-only: no markup, renderer, view-model, event or persistence change. Update/extend the bubble tests to pin both full-width caps and the absence of the magenta rail.

## Triage rationale

Three declaration-level edits in two adjacent CSS rules in one file. No design choice left (values specified by the user). Not a bugfix — the 90% cap was delivered as specified; this is a preference change on working code.
