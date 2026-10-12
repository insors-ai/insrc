<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s11 -->

# Build (plan-driven) — Story s11

**Standalone:** no  ·  **Created:** 2026-10-12T11:26:17.849Z  ·  **Updated:** 2026-10-12T11:35:47.361Z

**Commit:** dcecd4d1

## Summary

getLanceConn refuses the live ~/.insrc/lance with LanceStoreNotOwnerError before creating or connecting unless the process declared itself the owner (isLiveStoreOwnerDeclared in the graph store module); the graph store's temporary reader allowance does not open the vector store, as the design says. An audit found ten test files opening the live vector store; all now use a temporary one. Because the MCP server's in-process analysis is now refused the vector store until t9 moves it into the daemon, none of this Story is pushed before t9.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s11.json` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/config/__tests__/store-lmdb.test.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/db/__tests__/conversations-lmdb.test.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/db/__tests__/delete-entities-by-id.test.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/db/__tests__/entities-lmdb.test.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/db/__tests__/reindex-file-lmdb.test.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/db/graph/__tests__/derived-indices.test.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/db/lance/__tests__/helpers-opens-default-lance.fixture.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/db/lance/__tests__/live-vector-store-owner.test.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/db/lance/conn.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/indexer/__tests__/external-endpoints.test.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/indexer/__tests__/messaging-endpoints.test.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/shared/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-12T11:35:47.361Z)
