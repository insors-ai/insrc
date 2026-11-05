<!-- insrc:artifact BUILD-43e0b651654e0757-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-05T11:35:38.156Z

**Commit:** 6d4d09062

## Scope

Fix approved ISSUE-3fdb2b75703e6f09: preserve per-session provider/model/effort on history switches and ensure new-session selectors open and work. Diagnose runtime webview failure, preserve legacy defaults, and add executable restoration/selector regression tests.

## Triage rationale

Small bugfix routed issue → build; existing per-session configuration and IPC contracts reused.
