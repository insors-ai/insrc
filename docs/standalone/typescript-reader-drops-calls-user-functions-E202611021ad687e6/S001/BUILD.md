<!-- insrc:artifact BUILD-1ad687e69c9218de-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-03T08:06:43.031Z  ·  **Updated:** 2026-11-03T09:18:02.279Z

**Commit:** 3b63278e4

## Summary

The resolution integration test shows a bare imported parse, a namespace-import call, a new-initialised field call and a this-call each resolving to the user definition, and items.find() creating no edge to a same-file find; it fails with the reader from before this Story and with the method filter removed. Installed daemon at ca8b54c8 shows callers of user parse and Store.find after index and after repo.reindex. Full sweep per directory: 7337 tests, 29 failures, all classified, none in the TypeScript reader.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/indexer/__tests__/builtin-named-calls-resolution.test.ts` — **insrc-build** (2026-11-03T08:53:08.139Z)
- `docs/standalone/typescript-reader-drops-calls-user-functions-E202611021ad687e6/S001/full-sweep-t3.txt` — **insrc-build** (2026-11-03T08:53:08.139Z)
- `docs/standalone/typescript-reader-drops-calls-user-functions-E202611021ad687e6/S001/smoke-t3.md` — **insrc-build** (2026-11-03T08:53:08.139Z)
- `src/indexer/parser/__tests__/typescript-builtin-named-calls.test.ts` — **insrc-build** (2026-11-03T09:18:02.279Z)
- `src/indexer/parser/typescript.ts` — **insrc-build** (2026-11-03T09:18:02.279Z)
