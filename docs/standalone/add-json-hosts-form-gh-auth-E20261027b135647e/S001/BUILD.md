<!-- insrc:artifact BUILD-b135647ed951c0c1-s1 -->

# Build (standalone small) — Story s1

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-27T11:28:35.347Z  ·  **Updated:** 2026-10-27T11:28:35.347Z

**Commit:** 55d4a00c6

## Summary

gh_auth gets a fourth op, hosts (src/daemon/tools/builtins/gh/account.ts): `gh auth status --json hosts`, class none, 15 s, custom build buildAuthHosts that refuses a cut capture or output over 256 KB counted with Buffer.byteLength, non-JSON, no hosts object, or an account without string state and login, and keeps extra account fields. GH_COVERAGE row for `auth status` now lists op 'status,hosts' (no check changed). Tests: new gh-auth-hosts.test.ts (8), one new case each in gh-coverage, gh-timeouts, gh-output-schemas and gh-family-tools, a hosts case in _family-rows.ts for the family sweeps, and gh-parser.test.ts skips only gh_auth.hosts when the installed gh (2.46.0) answers 'unknown flag: --json' (that refusal is the op's failure on that gh). tsc clean; all gh suites pass. Not verified: the JSON field set a newer gh prints (only state and login are required). Commit 55d4a00c6.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/tools/builtins/gh/__tests__/_family-rows.ts` — **insrc-build** (2026-10-27T11:37:46.658Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts` — **insrc-build** (2026-10-27T11:37:46.658Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts` — **insrc-build** (2026-10-27T11:37:46.658Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-family-tools.test.ts` — **insrc-build** (2026-10-27T11:37:46.658Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-output-schemas.test.ts` — **insrc-build** (2026-10-27T11:37:46.658Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-parser.test.ts` — **insrc-build** (2026-10-27T11:37:46.658Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts` — **insrc-build** (2026-10-27T11:37:46.658Z)
- `src/daemon/tools/builtins/gh/account.ts` — **insrc-build** (2026-10-27T11:37:46.658Z)
- `src/daemon/tools/builtins/gh/coverage.ts` — **insrc-build** (2026-10-27T11:37:46.658Z)
