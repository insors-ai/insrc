<!-- insrc:artifact PLAN-c2ba6fa62a148ed1-s10 -->

# Plan: E20261104c2ba6fa6:S010

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**LLD run:** `wf-1793734261118-907e8o`
**LLD effective hash:** `85da4a2df479...`

Building s10 adds a deterministic link reader to markdown indexing and the storage, reads and status around it, then a mid-tier model pass on the summary lane whose proposals stay in their own table and are only used behind a measured switch. The store gains two tables and one migration; the indexer gains a link reader and a pre-commit target check; the daemon gains two summary-lane jobs, two requests and a status field shown in the CLI and both plugins; the analyzer attaches document links at read so caches never serve stale model links. The Story ends with a live measurement against the approved hand-checked set, an installed-daemon smoke and one full test sweep.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Store: proposal and quality sub-dbs, migration 9, carry across a full index | M | — | integration: s10 t1: migration 9 creates empty doc-relation sub-dbs and changes no other row; integration: s10 t1: a full index clears and carries proposal rows; restore keeps only unchanged documents; integration: s10 t1: removeRepo deletes proposal, carry and quality rows; integration: s10 t1: session-memory reads the new handles and is refused writes | [[c10]] [[c11]] [[c17]] |
| 2 | **`t2`** Markdown link reader in ArtifactParser | M | — | unit: s10 t2: link destinations resolve against the document's directory and mentions against the repository root; unit: s10 t2: preamble and skipped-section links attribute to the file entity; fenced code, URLs and mailto are not read; unit: s10 t2: one REFERENCES per (source, target) with evidence 'extracted'; no self links; unit: s10 t2: a bare file name yields a pending name reference | [[c1]] [[c9]] |
| 3 | **`t3`** Indexer boundary for document links and their lifecycle | M | `t2` | integration: s10 t3: two linked documents store an extracted REFERENCES with zero provider calls; integration: s10 t3: links to missing, ignored and unselected targets are no-candidate pending rows; repository complete; integration: s10 t3: a target created later is promoted by Pass 0 on settle; integration: s10 t3: removing a target re-reads the citing document; integration: s10 t3: Pass 2, the SQL re-check and the SQL by-name return leave doc-link rows alone | [[c2]] [[c14]] [[c15]] |
| 4 | **`t4`** Mid-tier role, provider selection and failure classification | S | — | unit: s10 t4: role taxonomy has indexer.docRelations as peripheral mid; integration: s10 t4: a cheap-tier override is refused with and without a routing context; unit: s10 t4: a CLI family with no listed model is refused before any call; unit: s10 t4: provider-failure classification across CLI error shapes | [[c3]] [[c13]] [[c15]] |
| 5 | **`t5`** documentRelations read API, the switch, and search.doc_relations | M | `t1`, `t3`, `t4` | unit: s10 t5: switchOf on only at the bar with matching model and set hash; integration: s10 t5: name references resolve across full-index order and stop on a second same-named file; integration: s10 t5: proposals read as 'model' only while on and eligible; older generations counted as stale; integration: s10 t5: search.doc_relations registered, session-class, refused while indexing; integration: s10 t5: callers, callees and closure are unchanged by proposals | [[c8]] [[c11]] [[c14]] |
| 6 | **`t6`** Job plumbing for the two new summary-lane jobs | M | `t1` | integration: s10 t6: doc-relations jobs route to the summary lane and the summary worker; integration: s10 t6: runQueuedJob lifecycle: second pass, failed-pass retry, abandoned reply; integration: s10 t6: carried rows restored after a full index before the pass; stop disposes timers | [[c4]] [[c10]] |
| 7 | **`t7`** The doc-relations pass | M | `t3`, `t4`, `t6` | integration: s10 t7: serial calls; only changed documents; reindex of an unchanged repository sends none; integration: s10 t7: stale-hash guard and superseded by a full index; integration: s10 t7: unavailable provider (resolution, not signed in) writes status and the retry recovers; unit: s10 t7: proposal validation, resolution and dedupe against extracted links | [[c4]] [[c10]] [[c15]] |
| 8 | **`t8`** Measurement against the hand-checked set | M | `t5`, `t7` | unit: s10 t8: set validation and proposal normalisation; unit: s10 t8: quality computation over admitted and implied links; integration: s10 t8: docRelations.measure records figures over a 100+ link fixture; below the bar reads exclude proposals; integration: s10 t8: measurement provider failure creates or keeps the row with extraction unavailable | [[c7]] [[c11]] [[c12]] |
| 9 | **`t9`** Analyzer consumers and cache freshness | M | `t5`, `t8` | unit: s10 t9: evidenceOrigin document noun and unchanged default wording; integration: s10 t9: attachDocRelations on fresh, executePlanWithContext and stepPlanWithContext hits; integration: s10 t9: resume of a paused step recomputes related links; integration: s10 t9: bundle cache stale by docRelationsRevision | [[c6]] [[c8]] |
| 10 | **`t10`** Status surfaces: repo.stats, status board, CLI and both plugins | M | `t7`, `t8` | integration: s10 t10: repo.stats and the status board read the persisted docRelations status; unit: s10 t10: CLI ReposPane renders docRelations states; unit: s10 t10: VS Code repositoryList renders docRelations states; unit: s10 t10: JetBrains RepoStatusDialog renders docRelations states | [[c5]] |
| 11 | **`t11`** Live measurement, installed-daemon smoke and full sweep | M | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7`, `t8`, `t9`, `t10` | live: s10 t11: measurement on this repository against the hand-checked set; smoke: s10 t11: installed daemon returns extracted document links and docRelations status | [[c12]] [[c16]] |

### 1.1 E20261104c2ba6fa6:S010:T001 — Store: proposal and quality sub-dbs, migration 9, carry across a full index

Declare doc_relation_proposals (+ its carry area) and doc_relation_quality in src/db/graph/store.ts with codecs in src/db/graph/codec.ts; migration step 9 (SCHEMA_VERSION 8 -> 9) in src/db/graph/migrations.ts; add both handles to structuralTables; read/write helpers in a new src/db/doc-relations.ts; deleteEntitiesForRepo clears and (with carryDocSummaries) carries proposal rows; a restore helper writes back rows whose document file-entity hash is unchanged; removeRepo deletes rows and carry area. Update the store-namespace count test and the inventory fixtures.

**Acceptance checks:**
- A store at version 8 opens and migrates to 9 with both sub-dbs empty and no other row changed
- deleteEntitiesForRepo with carryDocSummaries leaves no readable proposal row; restore writes back only rows whose document hash is unchanged
- removeRepo deletes the repository's proposal, carry and quality rows
- A session-memory execution can read both handles and is refused any write

### 1.2 E20261104c2ba6fa6:S010:T002 — Markdown link reader in ArtifactParser

Extend ArtifactParser.parse (src/indexer/parser/artifact.ts) to emit REFERENCES with evidence 'extracted': link destinations resolved against the document's directory (leading / = repository root), path mentions with a slash resolved against the repository root (./ ../ against the directory), bare file-name mentions as pending name-reference relations; skip fenced/indented code, URLs with a scheme, mailto, pure anchors; strip anchors and trailing punctuation; require a parser-handled file name; attribute to the containing retained section, the whole-file document, or the file entity (preamble, skipped sections); dedupe per (source, target); no self links.

**Acceptance checks:**
- In docs/guide/a.md, 'b.md', 'docs/b.md' and '/docs/b.md' link destinations resolve to docs/guide/b.md, docs/guide/docs/b.md and docs/b.md; the mentions `docs/b.md` and `./b.md` to docs/b.md and docs/guide/b.md
- A preamble link is attributed to the file entity; links in fenced code, http(s) and mailto are not read
- A bare 'README.md' yields a pending name-reference relation with meta.nameRef and no awaitsId
- The parser touches neither the file system nor a model

### 1.3 E20261104c2ba6fa6:S010:T003 — Indexer boundary for document links and their lifecycle

In IndexerService.indexFile (src/indexer/index.ts), before commitFile: path-reference targets that are stored become { stored: id }, absent ones pending rows with meta { file, repo, awaitsId, docLink, class 'no-candidate', reason 'doc-link-target-absent' }; name references become pending rows with file/repo and class 'no-candidate', reason 'doc-name-ref'. Guard Pass 2 and the SQL re-check in src/indexer/cross-file-resolver.ts to skip meta.docLink rows. On removal of a target file, re-read each markdown document holding a returned pending REFERENCES (s1's lookup by awaited id).

**Acceptance checks:**
- Links to missing, ignored and unselected files are stored as 'no-candidate' pending rows with file and repo; unwritable stays 0 and the repository reads complete
- Creating a missing target later promotes its row on the next settle via Pass 0 with evidence 'extracted', without re-reading the citing document
- Removing a target re-reads the citing document and the repository reads complete again
- Pass 2 and the SQL re-check leave doc-link rows untouched; the SQL by-name return leaves document links as plain rows

### 1.4 E20261104c2ba6fa6:S010:T004 — Mid-tier role, provider selection and failure classification

Add { id: 'indexer.docRelations', criticality: 'peripheral', defaultTier: 'mid' } to src/config/role-taxonomy.ts; a selector that runs resolveRole('indexer.docRelations', cfg, repoPath), refuses any tier other than mid, requires a CLI family with a listed model, and builds the provider from that resolution (or checks the router's ResolvedProvider under a routing context), returning the validated model id; a classifier that treats every error thrown by the provider call as a provider failure (message chain kept) and only a wrong-shape returned value as DocRelationsOutputInvalid.

**Acceptance checks:**
- An override to the cheap tier (per-repo or global) is refused with a reason naming the tier, with and without a routing context
- A CLI family with no listed model is refused before any call
- Codex error/turn.failed, Claude is_error, Vibe wrapped, CliExitError, CliStallError and ModelCallFailedError errors classify as provider failures

### 1.5 E20261104c2ba6fa6:S010:T005 — documentRelations read API, the switch, and search.doc_relations

documentRelations(entityId, direction) in src/db/doc-relations.ts: stored REFERENCES via outNeighbors/inNeighbors (kindFilter REFERENCES, withEvidence), name references resolved at read through the name index (exactly one file of that name), and, while the switch is on, eligible proposals (hash, model, live endpoints) with evidence 'model' and computedAtGeneration; returns { rows, generation, staleProposals }. The pure switchOf(qualityRow, validatedModelId, setHash) lives here. New session-class request search.doc_relations in src/daemon/handler-runtime.ts behind guardSearchRequest, classified in src/daemon/threads/method-class.ts.

**Acceptance checks:**
- A name reference resolves only while exactly one file has the name, independent of indexing order
- switchOf is on only with checked >= 100, precision >= 0.95, recall >= 0.60 and matching model and set hash; 'not-measured' without figures
- Ineligible proposals (changed hash, other model, missing endpoint) are not returned; older-generation proposals are counted in staleProposals
- search.doc_relations about a repository being indexed is refused with the named error and progress; findCallers / findCallees and closure traversal are unchanged

### 1.6 E20261104c2ba6fa6:S010:T006 — Job plumbing for the two new summary-lane jobs

New IndexJob kinds 'doc-relations' and 'doc-relations-measure' (src/shared/types.ts); both isSummaryJob classifiers (src/daemon/queue.ts, src/daemon/threads/summary-link.ts); processJob dispatch and the runQueuedJob lifecycle for 'doc-relations' (src/indexer/index.ts); a second SubsystemScheduler instance requested on the subsystem pass's triggers and disposed on stop; enqueue de-duplication; after a full index, restore carried proposal rows before requesting the pass.

**Acceptance checks:**
- Both job kinds are routed to the summary lane and handed to the summary worker, never the index lane
- A second pass runs after the first; a failed or abandoned run (undefined outcome) re-arms the retry
- Carried rows are restored after a full index before the pass is requested; stop disposes the scheduler's timers

### 1.7 E20261104c2ba6fa6:S010:T007 — The doc-relations pass

New src/indexer/doc-relations-pass.ts: starts only on graphComplete; selects documents whose hash or validated model differs; one model call at a time through the t4 provider; validates each returned value; drops proposals with unknown source or unstored target and those duplicating extracted links; publishes rows with the content-hash and generation guard ('superseded' on a full index); prunes rows of removed documents and vanished endpoints without a model call; writes the extraction status; returns a non-outcome result when the provider is unavailable.

**Acceptance checks:**
- Model calls are serial (max concurrency 1)
- After one pass, changing one document sends only that document; repo.reindex of an unchanged repository sends none
- An unavailable provider writes extraction 'unavailable' with the cause and arms the retry; restoring the provider lets the retry run without a file event
- A value with two valid proposals and one with an unknown source publishes the two and counts one; a wrong-shape value leaves the earlier row and retries the document

### 1.8 E20261104c2ba6fa6:S010:T008 — Measurement against the hand-checked set

Validator for .insrc/doc-relations-checked.json (schema, canonical identity, duplicates, conflicting labels, >= 100 distinct implied links); docRelations.measure request (handler-runtime + method class 'indexing') that validates and queues 'doc-relations-measure'; the job normalises admitted proposals (after extracted-link de-duplication) and computes precision over admitted, recall over implied, extractedRecovery for information; writes figures, or on provider failure keeps figures and sets extraction 'unavailable' (creating the row).

**Acceptance checks:**
- Duplicate and conflicting pairs, and fewer than 100 distinct implied links, are rejected with DocRelationsSetInvalid naming the cause
- 100 duplicates of extracted links plus 5 wrong proposals measure precision 0/5 and the switch reads off
- A provider failure before any quality row creates the row with no figures and extraction 'unavailable'; with figures it keeps them

### 1.9 E20261104c2ba6fa6:S010:T009 — Analyzer consumers and cache freshness

evidenceOrigin gains an optional noun (src/analyze/explore/usage-example.ts), default wording byte-identical; doc.mention stores outputs without 'related'; attachDocRelations adds 'related' and the staleness line after every fresh run, every executor cache hit (executePlanWithContext, stepPlanWithContext, third path) and every restored output on resume (outputsById and results); context bundles that include doc.mention carry docRelationsRevision (generation, quality row, latest publication, validated model, set hash) and are stale when it differs. Ordered after the measurement task so its cache tests can switch proposals on and off through a real quality row.

**Acceptance checks:**
- A cached doc.mention result read after proposals are switched off returns no model link through both executor paths and after resume
- A warm bundle is rebuilt after a measurement, a publication, an endpoint deletion or a second same-named file
- evidenceOrigin with the document noun produces the document sentence; without it the existing sentence is unchanged

### 1.10 E20261104c2ba6fa6:S010:T010 — Status surfaces: repo.stats, status board, CLI and both plugins

repo.stats (src/daemon/repo-stats.ts) and withCompleteness (src/daemon/repo-completeness.ts) add docRelations { switch, figures?, extraction } read from the quality row; the CLI ReposPane, VS Code daemon-gateway + detail-renderers, and JetBrains DaemonGateway + RepoStatusDialog render one line with the switch, figures and the extraction reason.

**Acceptance checks:**
- repo.stats and the status board store slot show 'unavailable' with its cause written by the pass on the summary worker
- Each display shows 'on (P / R); new documents not examined: <cause>' and 'not-measured'
- completeness is unchanged by any docRelations state

### 1.11 E20261104c2ba6fa6:S010:T011 — Live measurement, installed-daemon smoke and full sweep

Run the measurement on this repository against .insrc/doc-relations-checked.json with the real mid-tier CLI provider (INSRC_LIVE_TESTS=1) and record the figures and the switch state; smoke on the installed daemon after update: extracted REFERENCES read with evidence 'extracted' and repo.stats docRelations state and reason; then the full test sweep once.

**Acceptance checks:**
- Measured precision, recall, implied count and extractedRecovery are recorded in the BUILD evidence with the switch state they produce; below the bar the capability stays off and the figures are recorded (lc1), which is a valid outcome
- The installed daemon returns extracted document links and reports docRelations state and reason
- The full sweep passes, or every failure is shown to pre-exist this Story

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/indexer/parser/artifact.ts link reader | `t2` |
| proposal resolution and dedupe against extracted links | `t7` |
| quality computation and the on/off switch rule | `t5`, `t8` |
| role taxonomy entry indexer.docRelations | `t4` |
| evidenceOrigin with the document noun (complete sentence) and unchanged default wording | `t9` |
| hand-checked set validation (duplicates, conflicting labels, distinct count) and proposal normalisation | `t8` |
| src/indexer/index.ts | `t3`, `t6` |
| src/db/entities.ts commitFile | `t3` |
| doc-relations pass and its scheduler | `t6`, `t7` |
| doc_relation_proposals / doc_relation_quality sub-dbs and migration step | `t1` |
| repo.stats docRelations field | `t10` |
| traversal reads and analyzer lookup merge | `t5`, `t9` |
| queue routing: a doc-relations job lands on the summary lane (src/daemon/queue.ts) and is handed to the summary worker (src/daemon/threads/summary-link.ts) | `t6` |
| docRelations.measure and search.doc_relations registration and method classes | `t5`, `t8` |
| proposal eligibility at read and across a full index | `t1`, `t5` |
| runQueuedJob lifecycle for doc-relations: second pass, failed-pass retry, abandoned worker reply | `t6` |
| target created after its citing document; target removed | `t3` |
| SQL by-name return does not apply to document links | `t3` |
| session-memory analyzer read of the new handles | `t1` |
| docRelations status persistence and its two read sites (repo.stats, status board) | `t10` |
| mid-tier enforcement under role overrides | `t4` |
| attachDocRelations on every executor path (fresh, executePlanWithContext hit, stepPlanWithContext hit) | `t9` |
| name-reference resolution through the name index | `t5` |
| name references across full-index order and a second same-named file | `t5` |
| resume of a paused analyze step; bundle cache staleness by docRelationsRevision | `t9` |
| CLI ReposPane, VS Code repositoryList and JetBrains RepoStatusDialog rendering of docRelations | `t10` |
| Pass 2 and the SQL re-check skip doc-link rows | `t3` |
| measurement daemon request | `t11` |
| installed daemon | `t11` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s10 contract ArtifactParser.parse`
- **[[c2]]** `prior-artifact` `LLD s10 contract commitFile`
- **[[c3]]** `prior-artifact` `LLD s10 contract resolveRoleProvider`
- **[[c4]]** `prior-artifact` `LLD s10 contract IndexerService.docSummariseRepo (job inventory)`
- **[[c5]]** `prior-artifact` `LLD s10 contract completenessOf (docRelations status and display sites)`
- **[[c6]]** `prior-artifact` `LLD s10 contract evidenceOrigin`
- **[[c7]]** `prior-artifact` `LLD s10 contract docRelations.measure`
- **[[c8]]** `prior-artifact` `LLD s10 contract documentRelations`
- **[[c9]]** `prior-artifact` `LLD s10 data model REFERENCES relationship from a document section`
- **[[c10]]** `prior-artifact` `LLD s10 data model doc_relation_proposals`
- **[[c11]]** `prior-artifact` `LLD s10 data model doc_relation_quality`
- **[[c12]]** `prior-artifact` `LLD s10 data model hand-checked set`
- **[[c13]]** `prior-artifact` `LLD s10 data model role indexer.docRelations`
- **[[c14]]** `prior-artifact` `LLD s10 interactionWithShared sc1 sc2 sc3`
- **[[c15]]** `prior-artifact` `LLD s10 errorPaths`
- **[[c16]]** `prior-artifact` `LLD s10 testStrategy`
- **[[c17]]** `prior-artifact` `LLD s10 migration`
