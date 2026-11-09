<!-- insrc:artifact BUILD-501607b3d54fdfe2-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-09T09:01:52.044Z  ·  **Updated:** 2026-11-09T09:04:08.379Z

**Commit:** 35c9f815f

## Scope

Normalize SMTP recipient results to preserve string response fields

Using the current dependencies on Node 22, run `node node_modules/typescript/bin/tsc --noEmit` from the repository root. Compilation reports TS2322 at `src/daemon/tools/builtins/notify/index.ts:558` and `src/daemon/tools/builtins/notify/index.ts:559`: `(string | Address)[]` is not assignable to `readonly string[]`. Expected: the global build passes and email_send continues returning mailbox-address strings in accepted/rejected. This currently blocks validation of review-worker isolation Task `e4af63128c7cbec2/s1/t3`. Evidence is captured in `/tmp/review-worker-t3-typecheck.log`. [[c1]] [[c2]]

The email tool assigns `info.accepted` and `info.rejected` directly to the string-array fields of EmailSendData. The installed SMTP transport declarations permit each result entry to be either a string or a Nodemailer Mail.Address object, so these assignments no longer satisfy the established response contract. The mismatch is in provider-result adaptation; no mail delivery failure is required to reproduce it. [[c1]] [[c2]]

Normalize provider recipient results to their actual mailbox-address strings before constructing EmailSendData. Preserve the existing accepted/rejected response shape and partial-delivery success semantics. Cover mixed string/object entries and empty results with deterministic tests, retain existing SMTP integration coverage, and restore the global typecheck. Do not widen the public output contract, hide the problem with a cast, change delivery/authentication, or send real email. [[c1]] [[c2]]

## Summary

Normalized mixed SMTP string/Address accepted/rejected entries to mailbox strings, preserving public response and partial-delivery behavior. Mixed/empty/absent result and transport cleanup test plus existing local authenticated STARTTLS/attachment/rejection integration test pass; global Node 22 typecheck passes.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-501607b3d54fdfe2.json` — **insrc-build** (2026-11-09T09:04:08.379Z)
- `.insrc/artifacts/ISSUE-501607b3d54fdfe2.log.jsonl` — **insrc-build** (2026-11-09T09:04:08.379Z)
- `src/daemon/tools/builtins/notify/__tests__/recipient-results.test.ts` — **insrc-build** (2026-11-09T09:04:08.379Z)
- `src/daemon/tools/builtins/notify/index.ts` — **insrc-build** (2026-11-09T09:04:08.379Z)
