<!-- insrc:artifact BUILD-7386983710e0c464-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-06T06:52:31.958Z  ·  **Updated:** 2026-11-06T06:55:58.859Z

**Commit:** c5a6e965b

## Scope

Implement approved ISSUE-7386983710e0c464: remove minLength/maxLength from Codex wire schemas only; retain original host validation and preserve other provider behavior. Earlier nullable experiment is separate.

## Triage rationale

Small bugfix routed issue directly to build without LLD/Plan.

## Summary

Removes minLength and maxLength from the recursive Codex wire-keyword filter while preserving original-schema host validation. Added fake-CLI regression covering nested refs/unions, original-schema immutability, both completion/reviewer paths and short/long response rejection. 72 local provider regressions, typecheck, production build and compiled equality to the successful live wire schema pass. Earlier nullable experiment is excluded from this commit.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-7386983710e0c464.json` — **insrc-build** (2026-11-06T06:55:58.859Z)
- `.insrc/artifacts/ISSUE-7386983710e0c464.log.jsonl` — **insrc-build** (2026-11-06T06:55:58.859Z)
- `docs/standalone/omit-string-length-bounds-from-codex-E2026110673869837/ISSUE.md` — **insrc-build** (2026-11-06T06:55:58.859Z)
- `src/agent/providers/__tests__/cli-codex-strict-schema.test.ts` — **insrc-build** (2026-11-06T06:55:58.859Z)
- `src/agent/providers/structured-schema.ts` — **insrc-build** (2026-11-06T06:55:58.859Z)
