<!-- insrc:artifact ISSUE-b5a62f289cbcdaee -->

# Keep a stored good summary when the full index writes carried summaries back

## Reproduction

1. A document summary is running in the summary lane when a full index of its repository starts (a running summary is not stopped). 2. The full index moves the repository's summaries into the carry and rebuilds the documents. 3. The running summary finishes after the rebuild has stored its document, and writes a fresh, error-free summary for it. 4. At the end of the full index the carried summaries are written back. Observed: the carried copy replaces the fresh summary; if the carried copy was an error placeholder, a good summary is replaced by a placeholder and the document is summarised again by the next sweep. The same happens to a summary written by docSummary.restoreFromBackup while a full index runs. Expected: a summary already stored without an error for the same content is kept; a stored placeholder is still replaced by a good carried summary.

## Root cause

restoreCarriedDocSummaries (src/db/doc-summaries.ts:339-362) writes each carried row with writeDocSummaryIfCurrentInTxn and no options (src/db/doc-summaries.ts:358). Without options the write only checks that the document exists and that its body hashes to the summary's contentHash (src/db/doc-summaries.ts:254-284); it does not look at a summary already stored for the document. The carry copies every stored summary as it is, error placeholders included (src/db/doc-summaries.ts:309-320). The summary lane only starts new work while the index lane is idle and does not stop a summary already running (src/daemon/queue.ts:263), so one summary can land between the rebuild and the write-back. The carry tests cover current, gone and changed documents but not a document that already has a summary at write-back time (src/db/__tests__/doc-summary-carry.test.ts:145).

## Fix intent

The write-back keeps a summary already stored for the document when it has no error and the same contentHash, the rule the summariser's placeholder write already follows (keepGoodSummary); a stored placeholder is still replaced by the carried summary. The write-back's result counts the kept rows, and the full index's log line reports them. A test covers a document with a stored good summary and one with a stored placeholder at write-back time.

## Citations

- **[[c1]]** `code` `src/db/doc-summaries.ts:339-362` — "const outcome = writeDocSummaryIfCurrentInTxn(s, k.subarray(4).toString('utf8'), decodeDocSummary(value as Buffer));"
- **[[c2]]** `code` `src/db/doc-summaries.ts:254-284` — "if (opts.keepGoodSummary === true) { const stored = decodeDocSummary(storedBuf); if (stored.errorCode === undefined && stored.contentHash === summary.contentHash) return 'kept-good'; }"
- **[[c3]]** `code` `src/db/doc-summaries.ts:309-320`
- **[[c4]]** `code` `src/daemon/queue.ts:263` — "A summary already running is not stopped."
- **[[c5]]** `code` `src/db/__tests__/doc-summary-carry.test.ts:145`
- **[[c6]]** `code` `src/indexer/index.ts:745`
- **[[c7]]** `prior-artifact` `ISSUE-ae864466e7f1f4ea` — "MED quality: restoreCarriedDocSummaries writes carried summaries without onlyIfAbsent or keepGoodSummary."
