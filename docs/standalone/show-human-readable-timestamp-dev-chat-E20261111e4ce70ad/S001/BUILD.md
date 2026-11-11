<!-- insrc:artifact BUILD-e4ce70ad1ae43d31-s1 -->

# Build (standalone small) — Story s1

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-11-11T13:22:59.471Z  ·  **Updated:** 2026-11-11T13:22:59.471Z

**Commit:** 91298c050

## Triage rationale

Small standalone UX change scoped to the dev-chat render registry (whoRow/msgRow/toViewModel mirrors + CSS); triaged small -> standalone design.story (LLD-e4ce70ad1ae43d31-s1, approved) -> build.

## Summary

Implemented s1: who-row time span. Both toViewModel mirrors pass at through meta (omitted when absent), delta branch stamps at render time, whoRow renders span.insrc-when at the opposite end via CSS classes (no inline styles — fake-DOM/CSP safe), format '<3-letter weekday>, dd/MM HH:mm' in local time, invalid/far-future at renders no span. Focused tests 107/107 green, tsc clean, committed 91298c050 with Insrc-Story trailer.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/standalone/show-human-readable-timestamp-dev-chat-E20261111e4ce70ad/S001/LLD-SELF-REVIEW.md` — **insrc-build** (2026-11-11T13:22:59.471Z)
- `docs/standalone/show-human-readable-timestamp-dev-chat-E20261111e4ce70ad/S001/ux-mock.html` — **insrc-build** (2026-11-11T13:22:59.471Z)
- `vscode-plugin/src/chat/__tests__/render-registry.test.ts` — **insrc-build** (2026-11-11T13:22:59.471Z)
- `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` — **insrc-build** (2026-11-11T13:22:59.471Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-11T13:22:59.471Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-11-11T13:22:59.471Z)
- `vscode-plugin/src/chat/render-registry.ts` — **insrc-build** (2026-11-11T13:22:59.471Z)
