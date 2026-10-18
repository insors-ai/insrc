<!-- insrc:artifact ISSUE-dced43851723554f -->

# Keep document summaries across a full index, and restore the ones a rebuild deleted

## Reproduction

Ship Story s1 of Epic c2ba6fa6 (the daemon at 8e3fe543, 2026-10-18) and start the daemon: start-up queues a full index of every registered repository, and each full index first deletes all of that repository's rows. Observed: this repository held 11,412 document summaries before the reindex (read with the daemon stopped); after it, none. All six registered repositories were reindexed and lost their summaries. The doc-summarise-repo job then regenerates them on the local model: 256 summaries in 9,072 s (about 35 s each), against 15,341 documents in this repository alone, so about 6 days before this repository's documents are summarised again and longer for the others. Expected: a summary whose document is unchanged survives a full index, so only changed or new documents are summarised; and the summaries already lost are restored where the document did not change.

## Root cause

The full index (src/indexer/index.ts:617) deletes the repository with deleteEntitiesForRepo. Its per-entity cascade, detachDeleteEntitiesInTxn, removes each entity's summary (src/db/entities.ts:1139, deleteDocSummaryInTxn at src/db/doc-summaries.ts:263), and the repository delete then removes every remaining summary of the repository (src/db/entities.ts:601-602, deleteDocSummariesForRepo at src/db/doc-summaries.ts:290). Summary rows are keyed by the entity's internal number (src/db/doc-summaries.ts:264), which the rebuild assigns afresh, so nothing survives. Nothing in a summary depends on the rebuild: the summariser treats a summary as current when its contentHash and modelId match the document and the configured model (src/analyze/summariser/driver.ts:196-202), and entity ids are deterministic, so the same document after the rebuild has the same id and the same content hash.

## Fix intent

1. A full index keeps every document summary whose document is still stored after the rebuild with the same body (the same content hash), so the summary sweep only summarises changed or new documents; a summary whose document is gone or changed is not kept. 2. A one-time restore puts back, for each registered repository, the summaries held by the schema-v4 backup of 2026-10-16 (/Users/subhagho/.insrc/backup/graph.lmdb.schema-v4.2026-10-16T16-59-39-955Z: 22,216 summaries, 11,144 written by the current summariser model and 11,072 by the previous one) for every document whose current body has the same content hash. It is written by the daemon, which owns the store, and summaries by the previous model are restored as they are, so the summariser's own model rule replaces them in time while readers have one meanwhile.

## Citations

- **[[c1]]** `code` `src/indexer/index.ts:617` — "const { returnedToPending } = await deleteEntitiesForRepo(this.db, repoPath, { returnIncomingToPending: true });"
- **[[c2]]** `code` `src/db/entities.ts:1139` — "deleteDocSummaryInTxn(s, u64);"
- **[[c3]]** `code` `src/db/entities.ts:601-602` — "const { deleteDocSummariesForRepo } = await import('./doc-summaries.js'); await deleteDocSummariesForRepo(null as unknown as DbClient, repo);"
- **[[c4]]** `code` `src/db/doc-summaries.ts:263-266` — "export function deleteDocSummaryInTxn(store: GraphStore, u64: bigint): void { const primaryKey = encodeEntityKey(u64); if (store.docSummary.get(primaryKey) === undefined) return; store.docSummary.remo"
- **[[c5]]** `code` `src/analyze/summariser/driver.ts:196-202` — "// Skip-if-unchanged: same body + same model = same summary. ... existing.contentHash === contentHash && existing.modelId === modelId && existing.errorCode === undefined"
- **[[c6]]** `prior-artifact` `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/smoke.md` — "Document summaries: 11412 ... The rebuild deleted this repository's 11412 document summaries"
- **[[c7]]** `stakeholder` `stakeholder decision 2026-10-18` — "A: one bugfix ISSUE covering both parts (keep summaries across a full index; one-time restore from the 2026-10-16 backup)"
