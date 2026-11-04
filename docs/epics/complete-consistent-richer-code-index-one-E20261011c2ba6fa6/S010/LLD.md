<!-- insrc:artifact LLD-c2ba6fa62a148ed1-s10 -->

# LLD: E20261103c2ba6fa6:S010

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**HLD base run:** `wf-1791697214822-7bombm`
**HLD effective hash:** `85da4a2df479...`

Documents now point at each other and at code in the index. Links and file paths written in a document are stored when it is indexed, with no model involved. A mid-tier model can also propose links a document implies but does not write; those proposals are kept apart, used only after a measurement on at least 100 hand-checked links shows at least 95% are right and at least 60% are found, and always marked as proposed by a model. With no CLI provider, indexing still completes and the status says why no proposals were made.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. HLD context

> See **HLD-c2ba6fa62a148ed1** § 2. Framework summary

**Rollout phase:** Phase E — subsystems and document relationships
**Consumes:** `sc1` (IndexState), `sc2` (FileCommit), `sc3` (RelationEvidence)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The rule that a relationship with an absent target becomes pending instead of being skipped, at each of the six places in src/db/relations.ts where one is lost today (the resolved write's skip on a missing endpoint and its skip on a kind with no byte, promoteToResolved, promoteResolvedBatch, and the pending write's discard of a row without its file or repository and of a row whose repository is not registered), each either kept as pending or counted as unwritable with a reason; the set of files whose parse or commit failed in a full index, persisted with their paths until they next commit; which fields of the state are recounted on open and which are persisted and carried over; the classification of a pending relationship as awaiting-target, ambiguous or no-candidate, with the external-service rows classed apart and the two endpoint passes counted in when a full index is finished; the class is stored on the pending row itself, in its existing free-form record, so no stored form changes, a row the cross-file pass has not yet attempted counts as awaiting-target, and the recount on open reads the stored class and does not run resolution again; the extension of the cross-file pass to complete relationships awaiting a target by id, for imports and the other code-symbol kinds as well as calls and inheritance, and to follow a re-exporting file to the function it re-exports; the lookup of pending rows by the id they await, with its migration step, and the pass after a file event visiting the rows that await an entity of the files just committed; the change of the reindex request so that it deletes the repository's rows in the graph store and the vector store and builds them again from every file, in place of today's skip of unchanged files, with no separate repair request, returning to pending the relationships that other repositories hold into the deleted entities, and its queuing by the migration for every repository indexed before this change, which starts as not complete; the storing of the repository entity so that the manifest step's dependency relationships are written; the measurement on this repository, before and after a repair, of the awaiting-target, ambiguous, no-candidate and unwritable counts, with unwritable expected to be zero; the IndexState row, its migration step, its recount on open, and the derivation of repository status from it, as a completeness field returned beside the unchanged status by the daemon's status and stats requests and shown in the CLI's repository pane and in both editor plugins; and the analyzer's read of it: an analyzer lookup that reads relationships of a repository that is not complete says so in its result, with the counts, so that an answer over an incomplete graph is not returned as a plain fact. The choice, in this Story's design, of the function reached only through a re-exporting file that the repair is measured on, since the issue's own example (pickScope) has been removed from the source. Raising the log level of a refused relationship from debug is internal. Until Story s2 lands, s1 applies its rule inside the existing separate writes. — owns `sc1`
- `s2`: The extension of the existing whole-file replacement into the file commit (relationships and pending rows in the same transaction as entities; outgoing relationships of surviving entities replaced, not only those of entities that disappeared; incoming relationships of a removed entity returned to pending), the move of the indexer's refresh and delete paths and of the clean-up pass's removal of a stored file onto it, and the retirement of the separate delete-then-upsert sequence in the indexer. The handling of vectors after the commit: writing the entity row with its embedding marker empty and setting it in a second transaction only after the vector write succeeds, counting an entity with an empty marker in IndexState, comparing entity ids with the vector table on open in both directions, so that a vector left behind by a failed removal is deleted before a plain insert can meet it, and the extension of the existing reembed job to run on daemon start and after an index, with a vector write for an entity whose marker is empty made an upsert, except for an entity first allocated in the same commit, which keeps the plain insert. Three things in that job change with it: it applies the embed step's own selection instead of forcing every entity, so empty-body entities (external endpoints, module stubs) stay unselected and uncounted; its update of an embedding writes the vector first and sets the marker in a second transaction, where today it sets the marker first; and the marker carries the model of the backend that is active, not one fixed name. Which entities count as unembedded (those the embed step selects) and the separate recorded reason when the embedding backend is unavailable. The count of a file whose commit fails on a file event. The queue rule that index jobs go ahead of other jobs and that a long job yields between its units, so that a commit is not held behind a model pass. How a reader sees the old or the new set during a commit is the store's ordinary transaction isolation and needs no new mechanism. — owns `sc2`
- `s3`: The by-file and by-repository index of entity rows, its migration step that builds it for an existing store, and its upkeep. No single entity-row write exists today: there are seven raw put and remove sites across src/db/entities.ts and src/db/graph/migrations.ts, and the existing name index is kept in step by a helper each site must remember to call. This Story introduces one put and one remove function for entity rows that maintain the name index and the new index together, routes every raw site through them, and adds a test that fails when a raw put or remove appears outside them. Upkeep therefore sits beneath every caller, so that neither today's writers nor the file commit need to know of it and this Story does not depend on s2. The two reads (findEntitiesByFile, listEntitiesForRepo) keep their results and their callers; a new existence check answers whether a repository holds any entity, and the analyzer's scope check uses it.
- `s4`: The cause, which ISSUE-0d577569 records as not known, was reproduced on 2026-10-11 and is not the system's semaphore limit, which the library's message names, but the loss of the daemon's own file lock on the store's lock file, after which another process that opens and closes the store removes the store's semaphores; the daemon's next write then fails with the library's message about the limit, and its exit hangs in the library's close. What in the daemon closes a second descriptor on the lock file is not yet identified. First, therefore, the remedy that does not depend on finding it: the live store is opened by the daemon alone, and any other process is refused it. Second, a bound on the whole shutdown including the store's close, so that a close that hangs ends in an exit. Third, recording a store failure of this kind and stating it in the daemon's status. None of this is consumed by another Story.
- `s5`: The refusal, with a named error and its own code, of a search or analyze request about a repository whose status is indexing, at the analyzer's scope check and at the daemon's search requests, carrying the status and how far the run has got (files done of files selected, and when it began), read from the indexer's running job; the tools that rest on the analyzer (the workflow steps, triage, code review) pass that error on as it is. The order of the analyzer's run: the refusal of a scope the index does not hold comes before a size is announced, or the announcement says the size could not be counted. The named cause and error code for a failed read of the last-indexed time and for a failed lookup, and the three other defects of ISSUE-e2bcadd9 (the wrong provider named, the scope resolved before the cache, and failure text matched inside echoed output). This Story does not read IndexState: it works with the checks the analyzer has today, so that it stays independent of s1.
- `s6`: The in-process matcher of the gitignore grammar over nested ignore files and its conformance test against git; the move onto the one filter of every site that reads the list today in src/indexer/index.ts (the full walk, the start-up scan for changed files, the file event, the clean-up pass, and the two places that seed the list when a repository is registered), of the watcher, and of the analyzer's reader, its two exploration walkers and its infra walker (src/analyze/runtimes/infra/_shared.ts), each of which has its own list of names today, and of the indexer's source-root detection (src/indexer/source-roots.ts), whose own list would otherwise hide a package in a directory the filter includes; a search of the source for such lists found five more, in the daemon's four file-search tools (glob, grep, list-dir, recent under src/daemon/tools/builtins/search) and in the review probe (src/workflow/review/probe.ts), which search the working tree as text, do not decide what the index holds, and are deliberately left as they are; the filter keeps answering for a directory that holds an included file, as the analyzer's reader does now; the retirement of the bare-name list and of the ignore entry in the repository's .insrc config; the two built-in exclusions (generated or minified files, the .insrc directory) applied inside the filter so that the full walk and the file event no longer differ on them; the handling of a change to an ignore file as an event that removes and adds files, and the comparison by content hash of the clone's exclude file and the global ignore file, which the watcher cannot see, whenever the filter is used; the queued step that proposes a root ignore file with the cheap-tier model when a repository is added without one, its fallback, and the rule that an existing file is never written. Two points were decided by the stakeholder: the filter honours all three of git's ignore sources (the .gitignore files, the clone's exclude file, the user's global ignore file), and a file git tracks is indexed even when a rule matches it, so the filter takes git's list of tracked files as an input and a plain folder is filtered by the rules alone. — owns `sc4`
- `s7`: The one-byte encoding of evidence as the value of a relationship row; the points in the per-file resolver and the cross-file pass that decide 'extracted' or 'inferred' ('chosen' is reserved and not written, since an ambiguous relationship stays pending with its candidates); the passing of evidence as an argument to the store's resolved write and promote operations, so that the two endpoint passes write 'inferred' and the manifest step writes 'extracted' and no relationship written after this change reads 'unknown'; the carrying of evidence through the store's traversal reads and the daemon's caller and callee requests; the marking of inferred and chosen relationships in the analyzer's lookups and answers. No migration rewrites existing rows, since an empty value reads as 'unknown'. — owns `sc3`
- `s8`: The grouping of a complete repository's code entities into subsystems, its determinism, the tables for membership, connections and summaries and their migration step; the queued pass and its trigger on a new generation; the cheap-tier summary of a subsystem whose membership changed; the daemon request that returns subsystems; the addition of subsystem context to the analyzer's context builder; the statement that groups rest on an incomplete or older graph. Which relationships count toward grouping, and with what weight by evidence, is decided here.
- `s9`: One reader per added language (Rust, C#, C, C++) in the existing parser registry with a guarded load, as the Kotlin reader has; the structured reading of SQL in place of the whole-file document, keeping the document entity for retrieval; any entity kinds this needs, appended to the fixed byte table without renumbering; the additions to the Language union; the daemon request that lists the languages read and why any was skipped. Each language can be delivered on its own.
- `s11`: Private implementation of s11: The step tools run inside the daemon, and the MCP server opens no store
- `s12`: Private implementation of s12: Every supported parser records the calls its code makes, and calls resolve within a package
- `s13`: Private implementation of s13: Settling file changes does work proportional to the changed files, never a scan of the repository or the store

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ArtifactParser.parse`

```typescript
parse(filePath: string, source: string, repo: string, repoId: number): ParseResult
```

**Parameters:**
- `filePath: string` — absolute path of the document
- `source: string` — the document text
- `repo: string` — registered repository root
- `repoId: number` — repository id

**Returns:** `ParseResult` — as today, plus REFERENCES relations read deterministically, outside fenced and indented code blocks, in two forms. (1) Path references, with two resolution rules. (1a) Link destinations -- of an inline link or a reference-style link definition, whatever their shape -- follow Markdown's own rule: relative to the citing document's directory, or to the repository root when they start with /. In docs/a.md: 'b.md' -> docs/b.md, 'docs/b.md' -> docs/docs/b.md, '/docs/b.md' -> docs/b.md, '../src/y.ts' -> src/y.ts. (1b) Path mentions -- a backticked or bare token in running text containing a slash -- are written the way this repository's documents write paths: relative to the repository root ('src/db/relations.ts' -> src/db/relations.ts from any document), except a token starting ./ or ../, which is relative to the document's directory. A result outside the repository is not read. to = makeEntityId(repo, targetFile, 'file', targetFile). (2) Name references -- a backticked or bare token with no slash that is a file name with an extension a parser handles (e.g. 'README.md', `queue.ts`): the parser emits it as a PENDING relation with meta { docLink: true, nameRef: <the name>, class: 'no-candidate', reason: 'doc-name-ref' } and no awaitsId and no target id; it is resolved at read, never at commit (see documentRelations). In both forms the name must be one a parser handles (getParser / basenameParser.handles -- a pure name check), trailing punctuation (.,;:)!?) and a #anchor are stripped, URLs with a scheme and mailto are not read, and each distinct (containing entity, target) pair is emitted once with evidence 'extracted'; path references carry meta { awaitsId: true, docLink: true } and no meta.targetFile, so classifyFileTargets (src/indexer/cross-file-resolver.ts), which only classes rows carrying targetFile, never re-classes it

**Preconditions:**
- markdown only; other artifact languages unchanged
- links inside fenced code blocks, URLs with a scheme, mailto and pure #anchor links are not read; a #anchor suffix is dropped and the target is the file

**Postconditions:**
- no file system or model access in the parser
- the relation's source is the retained section whose line range holds the link, or the whole-file document when the file has no sections; a link on any line outside every retained section -- the preamble before the first heading, or a skipped tiny section -- is attributed to the file entity, so every link has a source

### 2.2 `commitFile`

```typescript
commitFile(commit: FileCommit): Promise<FileCommitResult>
```

**Parameters:**
- `commit: FileCommit` — the document's entities and relations, now including its REFERENCES writes with target { stored: makeEntityId(repo, targetFile, 'file', targetFile) } and evidence 'extracted'

**Returns:** `FileCommitResult` — unchanged (sc2)

**Preconditions:**
- before the commit, the indexer checks each document REFERENCES target id against the store (entityU64ForId, a store read with no file system access): a stored target is written as { stored: id }; an absent one as { pending: { to: id, meta: { file: <the citing document's absolute path>, repo: <the registered repository root>, awaitsId: true, docLink: true, class: 'no-candidate', reason: 'doc-link-target-absent' } } } -- file and repo are set at the indexer boundary because upsertUnresolvedRelationsInTxn (src/db/relations.ts) refuses a pending row without them as 'pending-without-file' (unwritable); the resolver does not add file for this path. 'no-candidate' is not a completeness cause, so a link to a missing, excluded or unselected file never keeps the repository incomplete; no stat or selectFile probe is made, so no probe exception can stop the document's commit
- name references are NOT resolved at commit -- the commit order of a full index (one file after another, after deleting the repository's rows) would make any commit-time answer depend on which files happen to be stored yet. They are stored as pending rows (with meta.file and meta.repo, class 'no-candidate', so they never affect completeness) and resolved at read by documentRelations against the file population at that moment. The cross-file pass leaves them alone: REFERENCES is a Pass 2 kind (PASS2_KINDS in src/indexer/cross-file-resolver.ts), so Pass 2 and the SQL re-check (recheckSqlReferences / sqlReferencesForSettle) skip any row with meta.docLink -- a guard added there for s10's own rows

**Postconditions:**
- recovery when the target appears: the target's commit is followed by the settle, whose Pass 0 (runPass0 in src/indexer/cross-file-resolver.ts) promotes every pending row awaiting an entity of the committed files whatever its class, carrying the row's 'extracted' evidence; in a full index, Pass 0's repository mode promotes every awaitsId row whose target is now stored. So a target created, or newly included, later regains its incoming links without the citing document being re-read
- re-committing the document replaces its REFERENCES and its pending rows (sc2)
- when a target file is removed, sc2 returns its incoming REFERENCES to pending (returnEdgeToPendingInTxn, which for REFERENCES first tries the SQL by-name rows; sqlByNameRows applies only between SQL entities, so a document's link falls back to the plain awaiting row); the indexer then re-reads each markdown document holding such a row (found by the s1 lookup of pending rows by awaited id) so it is re-written as 'no-candidate' and the repository returns to complete

### 2.3 `resolveRoleProvider`

```typescript
resolveRoleProvider(role: 'indexer.docRelations', cfg: AnalyzeConfig, legacyFallback?: () => LLMProvider, execution?: ConnectionExecutionContext): LLMProvider
```

**Parameters:**
- `role: RoleId` — the new peripheral role, defaultTier 'mid'
- `cfg: AnalyzeConfig` — tier config (tiers.mid)
- `legacyFallback: () => LLMProvider` _(optional)_ — a builder strictly from tiers.mid, used on the indexing worker where no routing context is set
- `execution: ConnectionExecutionContext` _(optional)_ — unchanged

**Returns:** `LLMProvider` — the mid-tier provider; the pass refuses one whose family is not a CLI family (ac4, k3)

**Errors:**
- `ModelNotSupportedError` when an Ollama-hosted mid tier names a model it does not declare; a provider failure
- `provider failure (any error thrown by the provider call)` when classification rule: every error thrown by provider.completeStructured, whatever its shape -- CliExitError, CliStallError, ModelCallFailedError, a spawn error (ENOENT/EACCES), the plain Error runCodex raises for an error / turn.failed event, the Error from a Claude is_error envelope, the plain Error withStructuredRetry throws with the original failure as cause (Vibe) -- is a PROVIDER failure: the pass stops, the extraction state becomes 'unavailable' with the message chain (err.message plus each cause's message), and the scheduler retries. Validation of a value the provider DID return has two disjoint cases: the value as a whole does not match the proposal schema (not an object with a proposals array of { from, to, rationale } strings) -> DocRelationsOutputInvalid, a per-document failure (the row is not rewritten, the document is retried); the value matches but an individual proposal names a source that is not an entity of the document or a target that is not stored -> only that proposal is dropped and counted (unresolvedProposals) and the row is published with the remaining proposals

**Postconditions:**
- resolved on each pass, so a tier change applies without restart
- the pass does not rely on resolution throwing, and it enforces the mid tier in both paths without changing the router's precedence: it first computes the effective assignment with the pure resolveRole('indexer.docRelations', cfg, repoPath) (src/analyze/context/role-router.ts), which applies the per-repo and global roleTiers precedence, and requires resolution.tier === 'mid' -- an override to another tier is refused, never followed; then, under a routing context, it takes the router's ResolvedProvider and checks its resolution is the same mid assignment; outside one (the summary worker, src/daemon/threads/summary-worker.ts) it builds from that resolution's runner and model (the mid tier's), not from an unchecked record. In both it then requires a family with a CLI kind in the model registry and a model the registry lists for that family. Any refusal records the extraction state 'unavailable' with the reason (e.g. 'indexer.docRelations is assigned to tier cheap; this capability runs only on the mid tier') and makes no call. The validated model id is the modelId stamped on rows and quality figures

### 2.4 `IndexerService.docSummariseRepo`

```typescript
private docSummariseRepo(repoPath: string): Promise<void>
```

**Parameters:**
- `repoPath: string` — repository whose documents the summary lane visits

**Returns:** `Promise<void>` — unchanged; the doc-relations work is two new IndexJob kinds on the same lane, driven the same way (one document at a time, yields to code work, stops on shutdown)

**Postconditions:**
- no behaviour change to summaries
- change inventory for the new job kinds { kind: 'doc-relations'; repoPath } and { kind: 'doc-relations-measure'; repoPath; setHash }: the IndexJob union in src/shared/types.ts; isSummaryJob in src/daemon/queue.ts (summary lane) and the separate isSummaryJob in src/daemon/threads/summary-link.ts (hand-over to the summary worker); the job-kind switch in IndexerService.processJob in src/indexer/index.ts; IndexerService.runQueuedJob, which today returns early for every kind but 'subsystems', gains the same lifecycle for 'doc-relations' (scheduler.started before run, scheduler.finished with asSubsystemsOutcome(result) in a finally, so a failed run or an abandoned worker reply finishes with undefined and counts as a failed pass that re-arms the retry); enqueue de-duplication (one queued doc-relations job per repository); a second SubsystemScheduler instance (src/indexer/subsystem-scheduler.ts, reused unchanged) owned by the queue-owning IndexerService, requested on the same triggers as the subsystem pass, disposed on stop; its outcome rides the summary-job reply as SubsystemsOutcome { summariesFailed: failed documents, stopped, startedAt, grouped:false when the graph was incomplete or the pass was superseded }; a pass refused because the provider is unavailable (validation or the first CliExitError) persists its reason in the status and returns { unavailable: true, reason } -- not a SubsystemsOutcome, so asSubsystemsOutcome yields undefined and SubsystemScheduler.finished counts a failed pass and arms the back-off retry without a misreported failed-document count; the retry re-validates the provider, so restoring it needs no file event

### 2.5 `completenessOf`

```typescript
completenessOf(state: IndexState | undefined): RepoCompleteness
```

**Parameters:**
- `state: IndexState | undefined` — unchanged

**Returns:** `RepoCompleteness` — unchanged: the document-relations line is NOT a completeness reason, so a repository without proposals still reads complete (ac6)

**Postconditions:**
- the docRelations status has two independent parts, persisted in the repository's doc_relation_quality row: switch ('on' | 'off' | 'not-measured', derived at read from the figures and the current validated model -- it alone decides whether eligible proposals are read) and extraction ({ state: 'ok' | 'unavailable', reason, examined, failed, computedAtGeneration?, updatedAt }, written by the pass on the summary worker in the transaction that publishes its rows, or on its own when it makes no call). Precedence: an 'unavailable' extraction never hides proposals that are on and eligible -- they were measured and still match their document's text -- it means new or changed documents are not examined; it is reported beside the switch (e.g. 'on; new documents not examined: <cause>'). The first pass whose model call succeeds sets extraction back to 'ok'. With no figures (never measured) nothing is read, whatever the extraction state
- read sites: collectRepoStats / buildRepoStats (src/daemon/repo-stats.ts) add the field docRelations to repo.stats; withCompleteness (src/daemon/repo-completeness.ts), which publishStore in src/daemon/threads/indexing-worker.ts uses for the status board's store slot, adds docRelations beside completeness on each repository row (src/daemon/threads/status-board.ts carries it unchanged); both read the persisted row, so no transfer from the summary worker's own IndexerService is needed; display sites, each of which maps fields explicitly today and so must be changed: the CLI's repository pane (src/cli/panes/ReposPane.tsx, RepoRow) shows one 'documents' line -- the switch, the figures when measured, and the extraction reason when unavailable (e.g. 'document links: on (P 0.97 / R 0.64); new documents not examined: claude is not signed in'); the VS Code plugin carries docRelations through registeredRepos (vscode-plugin/src/panels/daemon-gateway.ts) and renders the same line in repositoryList (vscode-plugin/src/panels/detail-renderers.ts); the JetBrains plugin adds the field to its repo-stats DTO in parseRepoStats (jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt) and a row in RepoStatusDialog (jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/actions/RepoStatusDialog.kt)
- completeness itself is unchanged: docRelations is never a completeness reason (ac6)

### 2.6 `evidenceOrigin`

```typescript
evidenceOrigin(evidence: readonly RelationEvidence[], noun?: { readonly one: string; readonly many: string }): EvidenceOrigin
```

**Parameters:**
- `evidence: readonly RelationEvidence[]` — evidence of the relationships an answer rests on
- `noun: { readonly one: string; readonly many: string }` _(optional)_ — what the relationships are called in the sentence; defaults to the existing caller wording, so current callers are unchanged

**Returns:** `EvidenceOrigin` — the existing sentence with the noun substituted; doc.mention passes { one: 'related document link', many: 'related document links' }, giving e.g. '2 of 5 related document links proposed by a model' and 'No related document links are listed.'

**Postconditions:**
- existing usage-example output is byte-identical (tested)

### 2.7 `docRelations.measure (daemon request)`

```typescript
(params: { repoPath: string }) => Promise<{ queued: true; setHash: string; checked: number }>
```

**Parameters:**
- `repoPath: string` — registered repository whose .insrc/doc-relations-checked.json is measured

**Returns:** `{ queued: true; setHash: string; checked: number }` — the set was valid and a doc-relations-measure job is queued on the summary lane; the figures appear in repo.stats docRelations when it finishes

**Errors:**
- `DocRelationsSetInvalid` when the set file is missing or fails its schema check; a link appears twice; one link carries both real:true and real:false; or it holds fewer than 100 distinct IMPLIED real links (real links that are not already extracted links of their document); the response names which
- `UnregisteredRepoError` when repoPath is not registered

**Preconditions:**
- registered in buildHandlerRuntime (src/daemon/handler-runtime.ts) and classified ['docRelations.measure', 'indexing', false] in src/daemon/threads/method-class.ts, so it runs on the queue-owning indexing thread

**Postconditions:**
- the set is exhaustive for each document it lists: every real link of a listed document is in it (real:false entries are optional, recorded negatives)
- link identity is canonical: (from = repository-relative document path, to = repository-relative file path, or path#symbol for a code symbol), paths normalised (no ./ or ..; #anchors on documents dropped)
- the job runs the model over every listed document with the current validated mid-tier model, one at a time on the summary lane, and measures exactly the population readers admit: each proposal is normalised to the same identity (from -> the document's path, to -> the target file entity's path or the symbol's file#name), duplicates collapse, and proposals that duplicate an extracted link of the document are removed, as the pass removes them before storing
- the set's real links are split into extracted (also read from the text) and implied (all others); precision = |admitted and real| / |admitted|, where an admitted pair absent from the set counts as wrong since the set is exhaustive; recall = |admitted and implied| / |implied|; the switch needs >= 100 implied links, precision >= 0.95 and recall >= 0.60. Example: 100 proposals duplicating extracted links plus 5 wrong ones admit 5 proposals, precision 0/5 -> off. The extracted-link recovery (|extracted read| / |extracted in set|) is recorded beside the figures for information and does not switch anything. One doc_relation_quality row is written; no proposal rows are written
- validation happens before queuing; a provider failure during the job writes no new measurement figures (existing figures are kept unchanged) and, in one transaction, creates the repository's doc_relation_quality row if it does not exist and sets its extraction to { state: 'unavailable', reason: <the message chain>, updatedAt }, so repo.stats and the status board read the cause

### 2.8 `documentRelations`

```typescript
documentRelations(entityId: string, direction: 'out' | 'in'): Promise<{ readonly rows: readonly { readonly from: string; readonly to: string; readonly kind: 'REFERENCES'; readonly evidence: RelationEvidence; readonly computedAtGeneration?: number }[]; readonly generation: number; readonly staleProposals: number }>
```

**Parameters:**
- `entityId: string` — a document, section, file or code entity
- `direction: 'out' | 'in'` — relationships the entity makes, or that point at it

**Returns:** `{ rows, generation, staleProposals }` — rows: the stored REFERENCES rows touching the entity, then the entity's name references resolved now (outgoing: each pending doc-name-ref row of the entity whose name matches exactly one 'file' entity of the repository through the name index, returned with evidence 'extracted'; none or several -> not returned; incoming, for a file entity: the pending doc-name-ref rows whose nameRef equals its name, kept only when it is the only file of that name), so a target indexed later, or a second file of the same name, changes the answer at once without any re-read (outNeighbors / inNeighbors with kindFilter REFERENCES and withEvidence, src/db/graph/edges.ts), then, only while the switch is on, its eligible proposals with evidence 'model' and the computedAtGeneration of the row they came from; generation: the repository's current IndexState generation; staleProposals: how many returned proposals were computed at an older generation. Eligibility (hash, model, live endpoints) keeps the hash-based cache reuse; staleness is disclosed, not filtered

**Preconditions:**
- a proposal row is eligible only when: its contentHash equals the document's current file-entity hash; its modelId equals the current mid-tier model; and each proposal's from and to entities are stored now. Ineligible rows and proposals are skipped at read and pruned by the next pass without a model call when only an endpoint vanished
- store read policy: the new handles docRelationProposals and docRelationQuality are added to structuralTables in src/db/graph/store.ts, so session-memory analyzer executions may read them (guardGraphHandles denies reads only for handles outside that set) while every mutator stays denied (graphMutators) -- the same policy as subsystem and subsystemByFile

**Postconditions:**
- consumers: the doc.mention exploration (src/analyze/explore/doc-mention.ts) adds, AT READ, to each DocMentionHit (src/analyze/explore/types.ts) a 'related' list of { entityId, file, evidence, computedAtGeneration? }, its answer states the origin with evidenceOrigin(evidence, { one: 'related document link', many: 'related document links' }) (ac3), and when staleProposals > 0 it adds the line 'N model-proposed links were computed from an older index (generation G; the index is now at generation C)' as the HLD requires of a reader that finds an older generation; and a new session-class daemon request search.doc_relations { entityId, direction } (registered in handler-runtime.ts, classified 'session' in method-class.ts) whose handler first calls await guardSearchRequest({ entityIds: [entityId] }) (src/daemon/search-guard.ts) exactly as search.callers and search.callees do, so a request about a repository being indexed, or whose index did not finish, is refused with the named error and progress figures; otherwise it returns the same { rows, generation, staleProposals }
- unchanged by design: findCallers / findCallees stay CALLS-only; outNeighbors / inNeighbors, the closure traversal (src/db/graph/traversal.ts) and graph_query return stored rows only -- proposals never enter multi-hop traversal, because those reads return entities without evidence and a proposal there could not be marked as proposed by a model
- cache: the 'related' lists are never cached. doc.mention is cacheable and the executor serves a cache hit without running the runner (src/analyze/explore/executor.ts: executePlanWithContext and stepPlanWithContext, and the third hit path), and the exploration-cache key (src/db/exploration-cache.ts: repoId, lastIndexedAt, param hash) carries no proposal, quality, set or model revision. So the runner's output is stored WITHOUT 'related' and without the staleness line, and a single function attachDocRelations(output) is applied to every doc.mention output after it is obtained -- fresh or from any of the executor's hit paths -- computing 'related' and the staleness line from documentRelations at that moment. A measurement that switches proposals off, a new proposal row, a model or role change, or a set change therefore takes effect on the next read, with no cache invalidation. Rows already in the cache have the stored shape unchanged (no 'related'), so they need no version bump and are served with 'related' attached. Two further paths serve doc.mention outputs without the runner and are covered too: (a) stepPlanWithContext restores earlier outputs from resumeState into outputsById and results and skips them ('if (outputsById.has(originalExp.id)) continue'); attachDocRelations is applied to every restored doc.mention output, in both maps, when a paused run resumes (src/analyze/explore/executor.ts, src/analyze/session-reuse.ts); (b) a synthesized context bundle cached by buildShaperBundle (src/analyze/context/driver.ts, src/analyze/context/cache.ts) is fresh only while the repository's docRelationsRevision equals the one stamped in its meta, beside the existing isStaleByIndexer check; docRelationsRevision(repo) is a hash of the repository's IndexState generation (advanced by every file commit, so an endpoint removed, a second file of the same name, or any file event changes it -- lastIndexedAt alone does not move on a file event), the quality row (figures and their updatedAt), the latest proposal-publication stamp, the current validated mid-tier model id and the current set hash. It is captured once, when the bundle's inputs are gathered, stamped into the bundle's meta, and compared through the shared cache front door (the same place servedFromCache / isStaleByIndexer decide reuse in src/analyze/context/driver.ts), for every bundle whose explorations include doc.mention; a bundle without document relations keeps today's rule. A measurement, a publication, a model or role change, a set change or any commit therefore makes such a cached bundle stale before attachDocRelations could be skipped

## 3. Data model changes

### 3.1 `REFERENCES relationship from a document section (extracted)` — invariant-change

Endpoints: from a 'section' or 'document' entity, or the 'file' entity for a link in a skipped tiny section, of a markdown file; to the 'file' entity of the target file (a document or a code file), named by a path (link destination, including a sibling name, or a token with a slash). A reference by bare file name is stored as a pending row (class 'no-candidate', reason 'doc-name-ref', meta.nameRef) and resolved at read to the only file of that name, if there is exactly one. Direction: the citing document -> the cited file. Cardinality: a source entity has zero or more; a target file is cited by zero or more; at most one row per (source entity, target file). Ownership: the source document's file commit, as a stored row when the target is stored and otherwise as a pending row { awaitsId, docLink, class 'no-candidate', reason 'doc-link-target-absent' } that Pass 0 promotes when the target commits; replaced wholesale when it is re-read. Evidence 'extracted' (sc3). Compatibility: uses the existing REFERENCES kind byte; no key or kind byte changes; existing stores gain rows only when a document is next read (a full reindex fills them). Current invariant it might break: today no REFERENCES row leaves a document, so any reader that follows out-edges of document entities (outNeighbors without kindFilter, closure) now meets them; callers/callees are unaffected (CALLS-only).

**Call sites:**
- `src/indexer/parser/artifact.ts`
- `src/db/entities.ts`
- `src/db/file-commit.ts`
- `src/db/relations.ts`

### 3.2 `doc_relation_proposals (new sub-db)` — new

Key: repoId(u32) ++ document file path (repository-relative). Value: { contentHash: the document's file-entity hash when examined, modelId, computedAtGeneration (DerivedStamp, sc1), proposals: [{ from, to, rationale <= 200 chars }] }. One row per document the pass examined. Lifetime, following the HLD (the added tables are cleared with the repository's rows): deleteEntitiesForRepo clears the repository's rows; when it is called with carryDocSummaries (the full index and repo.reindex, src/indexer/index.ts), the same transaction copies them to a carry area, exactly as carryDocSummariesInTxn does for summaries (src/db/doc-summaries.ts), so no row is readable during the rebuild; after the rebuild a restore step, beside restoreCarriedDocSummaries and before the doc-relations pass is requested, writes back each carried row whose document's current file-entity hash equals its contentHash and drops the rest. So the pass re-sends only documents whose hash or model differs (ac5). removeRepo deletes the rows and the carry area. The pass deletes a row whose document no longer exists and prunes proposals whose endpoints vanished without a model call. A failed re-examination leaves the earlier row in place but ineligible (hash differs). Proposals that duplicate an extracted REFERENCES are not stored. Added by migration step 9 (SCHEMA_VERSION 8 -> 9), which also creates the carry area; derived, so it can be dropped and recomputed.

```
+ sub-db doc_relation_proposals: repoId++path -> DocRelationRow
```

**Call sites:**
- `src/db/graph/store.ts`
- `src/db/graph/codec.ts`
- `src/db/graph/migrations.ts`
- `src/db/entities.ts`
- `src/db/doc-summaries.ts`
- `src/indexer/subsystem-pass.ts`
- `src/indexer/index.ts`

### 3.3 `doc_relation_quality (new row per repository)` — new

Key: repoId. Value: { figures?: QualityFigures { checked (distinct implied real links), proposed, right, found, precision, recall, extractedRecovery, modelId, measuredAt, setHash }, extraction: { state: 'ok' | 'unavailable', reason, examined, failed, computedAtGeneration?, updatedAt } }. figures are written only by a successful measurement job; extraction by the doc-relations pass and by the measurement job's failure path (which keeps the figures and creates the row if absent). The switch is derived at read: 'on' iff figures exist with checked >= 100, precision >= 0.95, recall >= 0.60, modelId equal to the current validated mid-tier model and setHash equal to the current set; 'off' with figures otherwise; 'not-measured' without figures. The extraction state never changes the switch (see completenessOf). Read by repo.stats and the status board.

```
+ sub-db doc_relation_quality: repoId -> QualityFigures
```

**Call sites:**
- `src/db/graph/store.ts`
- `src/daemon/repo-stats.ts`
- `src/daemon/repo-completeness.ts`
- `src/daemon/threads/indexing-worker.ts`

### 3.4 `hand-checked set (file in the repository)` — new

.insrc/doc-relations-checked.json: { links: [{ from: repository-relative document path, to: repository-relative file path or path#symbol, real: boolean }] }. Exhaustive for each listed document. Identity is the normalised (from, to) pair; a duplicate pair or a pair labelled both ways is rejected. At least 100 DISTINCT real:true pairs are required. Built by the user (or drafted by a subagent and then hand-checked by the user) -- open question.


### 3.5 `role indexer.docRelations` — field-add

{ id: 'indexer.docRelations', criticality: 'peripheral', defaultTier: 'mid' } appended to the role taxonomy.

**Call sites:**
- `src/config/role-taxonomy.ts`

## 4. Diagrams

- [ER model](docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S010/er-model.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | The doc-relations job is queued only when IndexState.graphComplete, through a scheduler shaped like the subsystem scheduler (pacing on actual start, retry with back-off); every proposal row carries computedAtGeneration; reads do not filter proposals by generation (the content-hash cache stays reusable) but disclose it: documentRelations returns the current generation and how many proposals are older, and its consumers state it, as the HLD requires of a reader that finds an older generation; the status line reports the generation the last pass ran at. The document-relations status is a sibling field of RepoCompleteness and never a completeness reason. The two new handles join the structural read set in src/db/graph/store.ts so session-memory analyzer reads are allowed and writes stay denied. |
| `sc2` | consumes | Extracted REFERENCES are ordinary relations in the document's FileCommit, evidence 'extracted': { stored: id } when the target file entity is stored, otherwise a pending row awaiting that id with class 'no-candidate' (reason 'doc-link-target-absent'), which is not a completeness cause and which the s1 Pass 0 promotes when the target commits -- so a target created or included later regains its links without a re-read. When a target file is removed, sc2 returns the incoming REFERENCES to pending; the indexer re-reads each citing markdown document (found by the s1 lookup of pending rows by awaited id), which re-writes the link as 'no-candidate'. |
| `sc3` | consumes | Extracted rows carry 'extracted' and are read by every existing relationship read with that evidence. Proposals are never written as graph rows; they are read only through documentRelations, which appends eligible proposals with evidence 'model' while the switch is on, and through its two consumers (doc.mention hits and search.doc_relations), each of which carries the evidence into its output (ac3). Multi-hop traversal and caller/callee reads are unchanged. |

## 6. Error paths

**Error cases**

- **No CLI provider is available: the mid tier names a non-CLI family or no model, or a CLI family resolves but its session is not signed in** (recoverable)
  - Detection: before any call: resolveRole gives an effective tier other than mid, or the family has no CLI kind / no listed model; during a pass: ANY error thrown by the provider call (CliExitError, CliStallError, ModelCallFailedError, spawn errors, the plain Errors from Codex error/turn.failed events, Claude is_error envelopes and Vibe's wrapped retry failure) -- classified as a provider failure by origin, not by shape
  - Response: The pass stops, persists extraction 'unavailable' with the message chain, writes no rows, and returns a non-outcome result so the scheduler counts a failed pass and retries with its back-off (re-validating each time). Proposals already on and eligible stay readable; never-measured repositories read nothing; extracted links are unaffected; the first successful call sets extraction back to 'ok'
  - User impact: Status says model-proposed document relationships are not being extracted and why (ac6); answers use extracted links, plus earlier proposals only if the switch is on and they are still eligible
- **The provider returns a value that does not match the proposal schema as a whole for one document** (recoverable)
  - Detection: the pass checks the returned value's shape (an object with a proposals array of { from, to, rationale } strings) and raises DocRelationsOutputInvalid; an error thrown by the provider call itself is a provider failure, and a well-formed value with individual bad proposals is the next case
  - Response: That document's row is not rewritten; an earlier row stays only as inactive cache (its hash no longer matches, so documentRelations skips it); the failure is counted in the outcome, the pass continues with the next document; a pass with failures re-queues with back-off
  - User impact: The document is re-examined later; nothing wrong is stored
- **A well-formed value contains individual proposals whose source is not an entity of the document or whose target is not a stored entity** (recoverable)
  - Detection: each proposal's target path/symbol is resolved against the store (file entity id by deterministic id; symbol by name within the named file) and its source against the document's entities
  - Response: Only those proposals are dropped and counted (unresolvedProposals) in the pass log; the row is published with the remaining proposals; nothing invalid is stored or pending
  - User impact: None; no invented relationship reaches a read
- **A full index or a commit to the document happens while the pass is examining it** (recoverable)
  - Detection: before writing a row the pass re-reads the document's current content hash and the IndexState generation guard as the subsystem pass does
  - Response: A row whose content hash no longer matches is not written (the next pass examines the new text); a pass superseded by a full index publishes nothing (reason 'superseded')
  - User impact: No stale proposal for changed text
- **The hand-checked set is missing, malformed, or has fewer than 100 real links** (recoverable)
  - Detection: the measurement request parses .insrc/doc-relations-checked.json with a schema check and counts real:true entries
  - Response: The request returns a named error (DocRelationsSetInvalid with the reason); no quality row is written; the capability stays off with state 'not-measured' or the previous figures
  - User impact: The user is told what the set lacks
- **The measurement runs but falls below the bar** (recoverable)
  - Detection: precision < 0.95 or recall < 0.60 computed over the set
  - Response: The quality row is written with the figures; the switch reads off; proposals are still computed and stored (so a later measurement or a better model can turn them on) but never merged into reads
  - User impact: Status shows 'off' with the measured figures (lc1)
- **A store write of a proposal row fails** (recoverable)
  - Detection: withWriteTxn throws
  - Response: The transaction aborts, the failure is logged at warn and counted as a failed document; the scheduler retries
  - User impact: None beyond a delayed proposal
- **A proposal's endpoint disappears while its document is unchanged (a section heading moves, a target file or symbol is removed)** (recoverable)
  - Detection: documentRelations checks each proposal's from and to entities exist at read; the pass checks the same for every stored row of an unchanged document
  - Response: The proposal is skipped at read and pruned from its row by the next pass without a model call
  - User impact: No relationship to a removed entity is shown

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A link to a missing file, an ignore-excluded file, or a file the full index does not commit | Written as a pending row with class 'no-candidate' (reason 'doc-link-target-absent'); the repository's completeness is unaffected; no file system probe is made |
| A link inside a fenced code block, an http(s)/mailto URL, or a pure #anchor link | Not read |
| In docs/a.md: links [x](../src/x.ts#L10), [b](b.md#section) and [d](docs/b.md), and the mention `src/db/relations.ts` | Link destinations resolve against docs/: src/x.ts, docs/b.md and docs/docs/b.md (the last only if it exists in the repository; otherwise a 'no-candidate' pending row); the mention resolves against the repository root: src/db/relations.ts; anchors dropped |
| The same target linked three times in one section | One REFERENCES row from that section |
| A document links to itself | Not written |
| A markdown file with no headings | Links are attributed to its whole-file document entity |
| A link in a tiny section the parser skips | Attributed to the file entity of the document |
| A backticked bare word such as `config` that is also a directory or a file name without a slash | Only tokens containing a slash or a file extension and resolving to an existing included file are read; bare words are left to the model pass |
| A target file is deleted after documents link to it | sc2 returns the incoming REFERENCES to pending; the indexer re-reads each citing document, which re-writes the link as 'no-candidate', and the repository returns to complete |
| The mid-tier model changes in config | Every document's row is stale by modelId and is re-examined; the quality row no longer matches the model, so the capability reads off until re-measured |
| A model proposal duplicates an extracted link | Not stored in the proposal table; the extracted row is the one read |
| A repository with no markdown documents | The pass examines nothing and status reads 'not-measured' (or 'unavailable' when no provider) |
| repo.reindex of a repository whose documents are unchanged | The proposal rows are cleared with the repository's rows and carried; after the rebuild the restore writes back every row whose document hash is unchanged, so no document is re-sent to the model |
| A document links to a file that does not exist yet; the file is created later | The pending 'no-candidate' row is promoted by the settle's Pass 0 when the new file commits; the link reads as stored with evidence 'extracted' and the citing document is not re-read |
| A link to an image or another name no parser handles (.png) | Not read (the parser's name check), so no row is written |
| A hand-checked set that lists one real link 100 times, or a link both real and not real | Rejected with DocRelationsSetInvalid naming the duplicate or conflicting pair |
| A link in the preamble before the first heading of a sectioned document | Attributed to the file entity of the document |
| indexer.docRelations assigned to the cheap tier by a per-repo or global role override | Refused before any call; docRelations reads 'unavailable' naming the assigned tier; no proposal is made |
| Proposals computed at generation 40 read when the index is at generation 43 | Returned (still eligible by hash, model and endpoints) with staleProposals counted; doc.mention states they were computed from an older index |
| Proposals that only restate links already written in the documents | Removed before storing and before measuring; they neither inflate the figures nor reach a read |
| 'See docs/b.md, and src/x.ts.' in running text | Two extracted REFERENCES (trailing punctuation stripped), with no model call |
| The CLI session expires after the switch is on | Extraction reads 'unavailable' with the cause; the eligible proposals stay readable; new documents wait for the retry |
| [workflow.md](workflow.md) in docs/daemon.md | A link destination without a slash is read relative to the document's directory: REFERENCES to docs/workflow.md, evidence 'extracted', no model call |
| 'see README.md' in running text, with exactly one README.md in the repository | Stored as a pending name-reference row; documentRelations returns it as an extracted link to that file while it is the only README.md, whatever order the files were indexed in |
| '`index.ts`' with several index.ts files in the repository | Stored as a pending name-reference row; not returned while several files share the name; returned if all but one are removed |
| A doc.mention result cached while proposals were on, read after a measurement switched them off | The cached output has no 'related'; attachDocRelations computes it at read with the switch off, so no model link is returned |
| A full index commits docs/a.md (naming 'b.md') before docs/b.md | The name reference is stored pending at a.md's commit and resolves at read once b.md is stored; nothing is lost to commit order |
| A second README.md is added after a document's name reference resolved to the first | The next read finds two candidates and stops returning the link |
| A paused analyze step resumes after a measurement switched proposals off | attachDocRelations recomputes 'related' on the restored doc.mention outputs; no model link is returned |
| A cached context bundle read after a measurement or a proposal publication | docRelationsRevision differs from the bundle's stamp, so it is rebuilt |
| A warm context bundle read right after a proposal's endpoint is removed, or a second README.md is added, before any derived pass runs | The commit advanced the generation, so docRelationsRevision differs and the bundle is rebuilt |

**Invariants to preserve**

- Accuracy over cost: only relationships read verbatim from the text are 'extracted'; model proposals are admitted to reads only above the measured bar [[c6]]
- Only the daemon opens the stores; the measurement and status are daemon requests [[c7]]
- The model is reached only through a CLI provider via the role router; no direct REST [[c8]]
- Model calls are made one after another, one document at a time on the summary lane [[c9]]
- The two new sub-dbs arrive as a migration step applied on open; no existing key or kind byte changes; REFERENCES keeps its byte [[c10]]
- The capability stays off and the figures are recorded when the measurement is below 95% precision or 60% recall on at least 100 hand-checked links [[c11]]
- Model extraction runs only for new or changed documents and indexing completes without a CLI provider [[c19]]

## 7. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test), node:assert/strict; tests under __tests__ beside the module`

**Test levels**

- **unit** — The link reader: which tokens are read, attribution to sections, path resolution, dedupe, exclusions
  - Subjects: `src/indexer/parser/artifact.ts link reader`, `proposal resolution and dedupe against extracted links`, `quality computation and the on/off switch rule`, `role taxonomy entry indexer.docRelations`, `evidenceOrigin with the document noun (complete sentence) and unchanged default wording`, `hand-checked set validation (duplicates, conflicting labels, distinct count) and proposal normalisation`
  - Fixtures: `markdown strings with inline, reference-style, backticked-path, fenced, URL, anchor and self links`
- **integration** — Real IndexerService over a temp repository: extracted REFERENCES in the commit with evidence 'extracted'; links to missing, excluded or unselected targets stored as 'no-candidate' pending rows with completeness unaffected; target deletion re-reads the citing document; the doc-relations pass with a fake CLI-family provider (call recorder) -- serial calls, only changed documents, stale-hash guard, superseded by full index, unavailable provider status; reads merge proposals as 'model' only while on
  - Subjects: `src/indexer/index.ts`, `src/db/entities.ts commitFile`, `doc-relations pass and its scheduler`, `doc_relation_proposals / doc_relation_quality sub-dbs and migration step`, `repo.stats docRelations field`, `traversal reads and analyzer lookup merge`, `queue routing: a doc-relations job lands on the summary lane (src/daemon/queue.ts) and is handed to the summary worker (src/daemon/threads/summary-link.ts)`, `docRelations.measure and search.doc_relations registration and method classes`, `proposal eligibility at read and across a full index`, `runQueuedJob lifecycle for doc-relations: second pass, failed-pass retry, abandoned worker reply`, `target created after its citing document; target removed`, `SQL by-name return does not apply to document links`, `session-memory analyzer read of the new handles`, `docRelations status persistence and its two read sites (repo.stats, status board)`, `mid-tier enforcement under role overrides`, `attachDocRelations on every executor path (fresh, executePlanWithContext hit, stepPlanWithContext hit)`, `name-reference resolution through the name index`, `name references across full-index order and a second same-named file`, `resume of a paused analyze step; bundle cache staleness by docRelationsRevision`, `CLI ReposPane, VS Code repositoryList and JetBrains RepoStatusDialog rendering of docRelations`, `Pass 2 and the SQL re-check skip doc-link rows`
  - Fixtures: `temp repo with docs/a.md, docs/b.md, src/x.ts; temp graph store; fake provider recording calls and max concurrency`, `a 100+ link hand-checked set fixture for the measurement test`, `a fake CLI-family provider that resolves and rejects its first completion with CliExitError (not signed in)`, `link targets: a .png, package-lock.json, an oversized JSON, a directory and an ignored file`
- **live** — Run the measurement on this repository with the real mid-tier CLI provider against the user's hand-checked set and record the figures (gated INSRC_LIVE_TESTS=1)
  - Subjects: `measurement daemon request`
  - Fixtures: `.insrc/doc-relations-checked.json for this repository (>=100 real links)`
- **smoke** — On the installed daemon: index this repository, read a document's REFERENCES with evidence 'extracted', and read repo.stats docRelations state and reason
  - Subjects: `installed daemon`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: in a nested document docs/guide/a.md, link destinations 'b.md', 'docs/b.md' and '/docs/b.md' resolve to docs/guide/b.md, docs/guide/docs/b.md and docs/b.md, and the mentions `docs/b.md` and `./b.md` to docs/b.md and docs/guide/b.md`, `unit: the link reader emits one REFERENCES per (section, target) with evidence 'extracted'`, `integration: [workflow.md](workflow.md) in docs/daemon.md stores a REFERENCES with evidence 'extracted' and zero provider calls; in a full index where the document naming 'README.md' commits before README.md, documentRelations returns the extracted link afterwards; adding a second README.md makes it stop returning it; '`index.ts`' with two candidates returns nothing`, `integration: a document saying 'See docs/b.md.' in plain text stores a REFERENCES to docs/b.md with evidence 'extracted' and the provider recorder shows zero calls`, `integration: two indexed documents where one links to the other store a REFERENCES with evidence 'extracted' and the provider recorder shows zero calls`, `integration: links to a missing, an ignored and an unselected file write 'no-candidate' pending rows and the repository reads complete; creating the missing target later promotes its row on the next settle with evidence 'extracted' without re-reading the citing document`, `integration: removing a target re-reads the citing document and the repository reads complete again; the SQL by-name return leaves document links as plain rows`, `unit: a link in the preamble of a sectioned document is attributed to the file entity`, `integration: an absent-target link is stored as a pending row with file and repo, the unwritable count stays 0, and Pass 0 promotes it when the target commits`, `integration: Pass 2 and the SQL re-check leave doc-link rows untouched` |
| `ac2` | `unit: the switch is on only with checked>=100, precision>=0.95, recall>=0.60, matching model and set hash`, `unit: 100 proposals duplicating extracted links plus 5 wrong ones measure precision 0/5 and leave the switch off; the implied-link count, not the raw real count, must reach 100`, `unit: the set validator rejects duplicate and conflicting pairs and counts distinct real pairs; proposals normalise to (document path, file path | path#symbol)`, `integration: the measurement over a 100+ link fixture records precision/recall in the quality row; below the bar the figures are recorded and reads exclude proposals`, `live: the measurement on this repository records its figures`, `integration: a measurement whose provider fails before any quality row exists creates the row with no figures and extraction 'unavailable' with the cause; with existing figures it keeps them unchanged` |
| `ac3` | `integration: while on, documentRelations and search.doc_relations return eligible proposals with evidence 'model' and doc.mention words them as proposed by a model; while off, after the document changes, or after an endpoint is removed, they are absent`, `integration: findCallers / findCallees results are unchanged by proposals`, `unit: evidenceOrigin with the document noun yields the full document sentence, and with no noun the existing caller sentence byte-for-byte`, `integration: a session-memory analyzer execution reads documentRelations without a persistence error`, `integration: proposals from an older generation are returned with staleProposals > 0 and doc.mention states the generations`, `integration: search.doc_relations about a repository being reindexed, or whose index did not finish, is refused by guardSearchRequest with progress figures`, `integration: warm the real exploration cache with a doc.mention result while proposals are on, then switch them off (new measurement), change the model, and change the set: through executePlanWithContext and stepPlanWithContext each cached read returns no model link; switching back on returns them without clearing the cache`, `integration: pause an analyze step after doc.mention, switch proposals off, resume: the restored outputs carry no model link; a cached context bundle built while on is rebuilt after the measurement`, `integration: a warm context bundle is rebuilt when read immediately after a proposal endpoint is deleted and after a second same-named file is added, before any derived pass runs` |
| `ac4` | `integration: the pass resolves role indexer.docRelations to the mid tier, refuses a non-CLI family, and the recorder's maximum concurrency is 1`, `integration: a doc-relations job is routed to the summary lane and the summary worker, never the index lane`, `integration: a second doc-relations pass runs after the first finishes, a failed pass re-arms the retry, and an abandoned worker reply counts as failed`, `integration: with indexer.docRelations overridden to the cheap tier (per-repo and global), both under a routing context and on the summary worker without one, resolveRole refuses it, the pass makes no call and extraction reads 'unavailable' naming the tier`, `integration: with indexer.docRelations overridden to the cheap tier (per-repo and global), under a routing context and without one, the pass makes no call and reads 'unavailable' naming the tier`, `unit: a value with two valid proposals and one with an unknown source publishes the two and counts one unresolved; a value that fails the schema as a whole leaves the earlier row and retries the document` |
| `ac5` | `integration: after one pass, changing one document and running again sends only that document to the provider; a model change re-sends all`, `integration: repo.reindex clears the proposal rows (none readable during the rebuild), restores those whose document hash is unchanged, and the next pass sends no unchanged document to the provider` |
| `ac6` | `integration: with no CLI provider resolvable, a full index completes, completeness reads complete, extracted REFERENCES are stored, and repo.stats docRelations reads 'unavailable' with the cause`, `integration: with a CLI-family provider that resolves but rejects its first completion with CliExitError (not signed in), indexing completes, extracted links are stored, docRelations reads 'unavailable' with the CLI's cause, and no proposal is merged`, `smoke: the installed daemon reports the docRelations state and reason`, `integration: the 'unavailable' status written by the pass on the summary worker is read by repo.stats and by the status board's store slot (withCompleteness) on the indexing worker`, `integration: an unavailable provider arms the scheduler's retry; making the provider available again, with no file event, lets the retry run the pass`, `unit: the provider-failure classification marks as unavailable a Codex error/turn.failed Error, a Claude is_error envelope Error, a Vibe withStructuredRetry Error with a cause, CliExitError, CliStallError and ModelCallFailedError, and only DocRelationsOutputInvalid as a per-document failure`, `integration: a repository with the switch on and cached proposals loses its provider: extraction reads 'unavailable', eligible proposals stay readable, and a later successful pass sets extraction back to 'ok'`, `unit: the CLI repository pane, VS Code repositoryList and JetBrains RepoStatusDialog show 'unavailable' with its reason and 'on; new documents not examined: <cause>'` |

## 8. Migration

**State before:** Markdown is split into section/document entities joined to their file only by DEFINES (src/indexer/parser/artifact.ts); no document-to-document or document-to-code relationship is stored. Evidence bytes exist (src/db/graph/codec.ts) and the analyzer words 'model' evidence (src/analyze/explore/usage-example.ts), but nothing writes REFERENCES from documents. The only indexing model role is indexer.summarise on the cheap tier (src/config/role-taxonomy.ts).

**State after:** Each markdown document's commit carries REFERENCES with evidence 'extracted' to the files it links or names by path. Two derived sub-dbs exist: doc_relation_proposals (per-document mid-tier proposals stamped with generation, content hash and model) and doc_relation_quality (per-repository measured figures). Reads merge proposals as evidence 'model' only while the measured switch is on. repo.stats carries a docRelations field with state and reason.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the role indexer.docRelations (peripheral, mid) to the role taxonomy; config reconcile carries existing config forward unchanged — ↩ rollbackable
2. Add migration step 9 (SCHEMA_VERSION 8 -> 9) on the existing chain that creates the empty doc_relation_proposals and doc_relation_quality sub-dbs; no existing row is read or rewritten. Not rollbackable in place: an older daemon refuses a store whose schema_version exceeds its own (LmdbStoreSchemaVersionMismatch in src/db/graph/store.ts) — ✕ non-rollbackable
3. Ship the link reader; existing stores gain extracted REFERENCES as each document is next committed; a repo.reindex fills every document at once (recommended once after the update, not required) — ↩ rollbackable
4. Ship the doc-relations pass and scheduler; it starts after the first complete graph and examines every document once (no rows yet), then only new or changed ones; with no hand-checked set the capability reads 'not-measured' and nothing merges into reads — ↩ rollbackable
5. Build the hand-checked set for this repository and run the measurement request; the switch turns on only if the figures meet the bar — ↩ rollbackable

**Backward compat:** No existing key, kind byte or relationship row changes; REFERENCES keeps its byte. The store's schema_version advances to 9, and an older daemon refuses to open it (LmdbStoreSchemaVersionMismatch): downgrading the daemon binary requires deleting the graph store (~/.insrc graph.lmdb) and re-indexing, as for every earlier schema step; there is no in-place downgrade. repo.stats and the status board gain an optional docRelations field; an older client ignores it (it maps fields explicitly), and this Story changes the CLI repository pane and both plugins to show it. Document entities gain outgoing REFERENCES rows (extracted only), each with its evidence; callers/callees stay CALLS-only and proposals appear only through documentRelations and its consumers.

## 9. Alternatives considered

### 9.1 a1: Extracted links in the commit; model proposals in their own stamped table, merged at read behind a measured switch — **CHOSEN**

The markdown reader emits REFERENCES (evidence 'extracted') for links and path mentions in the file commit; a queued mid-tier pass over new or changed documents writes proposals to its own generation-stamped table, which reads merge as evidence 'model' only while the recorded quality record says the capability is on.

Reading: src/indexer/parser/artifact.ts gains a link reader. For each markdown link destination (sibling names included), reference-style link, and backticked or bare token in running text that names a repository path or an unambiguous file name, it emits a RelationWrite of kind REFERENCES from the section (or the whole-file document) that contains it to the target file's 'file' entity, whose id is deterministic (makeEntityId(repo, file, 'file', file)), so the target is { stored: id }; a target not stored becomes a pending row of class 'no-candidate' awaiting its id, completed by the s1 Pass 0 when the target commits. Anchors and URLs outside the repository are not read. Evidence is 'extracted' and the write goes through the ordinary file commit (sc2), so no model call happens (ac1). Model pass: a new peripheral role 'indexer.docRelations' with defaultTier 'mid' in role-taxonomy; a 'doc-relations' job on the document-summary lane, queued like the subsystem pass only when IndexState.graphComplete, which visits the documents whose content hash or model id differs from the stored row (ac5) one at a time through the mid-tier CLI provider (ac4), and writes its own table (repoId++file -> { contentHash, modelId, computedAtGeneration, proposals: [{ from, to, rationale }] }) with a migration step. Quality: a hand-checked set stored in the repository (.insrc/doc-relations-checked.json, at least 100 links), a daemon request that runs the pass over the set's documents and records { checked, proposed, right, found, precision, recall, measuredAt, modelId } in a quality row; the capability is on only when checked >= 100, precision >= 0.95 and recall >= 0.60 for the model in use, otherwise it stays off and the figures stay recorded (ac2, lc1). Reads: proposals are read only through documentRelations, which appends eligible proposals with evidence 'model' while the switch is on, and its two consumers (doc.mention hits and search.doc_relations); caller/callee reads, outNeighbors/inNeighbors, closure traversal and graph_query are unchanged and never carry proposals (ac3). Status: completeness/status carries a document-relations line: on, off with the figures, not measured, or not extracted because no CLI provider resolves for the mid tier, while indexing completes (ac6, lc2).

### 9.2 a2: Model proposals written into the graph as REFERENCES rows with evidence 'model'

As a1 for extraction, but the mid-tier pass writes its proposals through the store's resolved write with evidence 'model', so readers need no merge.

The link reader is as in a1. The doc-relations pass, when the capability is on, writes each proposal as a resolved REFERENCES relationship with evidence 'model' through upsertResolvedRelationsInTxn, and removes a document's earlier model rows when the document is re-examined or the capability turns off. The quality record and the status line are as in a1.

**Rejected because:** Simpler reads, but the next commit of a document deletes its model rows (sc2 replaces outgoing relationships), and graph rows carry no generation stamp, contrary to the HLD's layer 3.

### 9.3 a3: One model call per document for both summary and relationships

Extend the existing document summariser's prompt to also return proposed relationships, stored beside the summary.

The link reader is as in a1. The summariser driver (src/analyze/summariser/driver.ts) asks for a summary plus proposed relationships in one structured call per changed document, reusing its content-hash skip, and stores the proposals beside the summary; the quality gate and status line are as in a1.

**Rejected because:** Fails ac4: the summariser is on the cheap tier, and it is not gated on a complete graph nor stamped.

## 10. References

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `step-output` `s2`
- **[[c3]]** `step-output` `s3`
- **[[c4]]** `step-output` `s4`
- **[[c5]]** `step-output` `s5`
- **[[c6]]** `stakeholder` `DEF-c2ba6fa62a148ed1 c6` — "Accuracy is chosen over cost"
- **[[c7]]** `stakeholder` `DEF-c2ba6fa62a148ed1 c7` — "Only the daemon opens the stores"
- **[[c8]]** `stakeholder` `DEF-c2ba6fa62a148ed1 c8` — "No direct cloud REST calls"
- **[[c9]]** `convention` `DEF-c2ba6fa62a148ed1 c9` — "Calls that reach a model provider are made one after another"
- **[[c10]]** `stakeholder` `DEF-c2ba6fa62a148ed1 c10` — "a change to what is stored comes with a migration"
- **[[c11]]** `stakeholder` `DEF-c2ba6fa62a148ed1 c11` — "at least 95% ... at least 60% ... at least 100 hand-checked links"
- **[[c12]]** `step-output` `s6`
- **[[c13]]** `step-output` `s7`
- **[[c14]]** `step-output` `s8`
- **[[c15]]** `code` `src/indexer/parser/artifact.ts`
- **[[c16]]** `code` `src/db/graph/codec.ts`
- **[[c17]]** `code` `src/indexer/subsystem-pass.ts`
- **[[c18]]** `code` `src/config/role-taxonomy.ts`
- **[[c19]]** `stakeholder` `DEF-c2ba6fa62a148ed1 c19` — "Model extraction spends the user's CLI session quota"

## 11. Open questions

- Who builds the hand-checked set of at least 100 real document links for this repository (.insrc/doc-relations-checked.json): the user by hand, or a subagent drafting candidates that the user then checks? Until it exists the model capability stays off ('not-measured').
- dm1 (partial): the new sub-dbs are declared in src/db/graph/store.ts, which the s1 bundles did not cite; it is the existing home of every sub-db.
- ep3 (partial): invariants cite DEF constraint ids; the bundles that show them are the s1 summary-lane and store bundles.

## Resolved questions

- `q34308808` — Who builds the hand-checked set of at least 100 real document links for this repository (.insrc/doc-relations-checked.json): the user by hand, or a subagent drafting candidates that the user then checks? Until it exists the model capability stays off ('not-measured').
  - **resolved**: Subagent drafts; user checks — User decision 2026-11-04: a subagent drafted candidates; the user reviewed and approved them; committed as .insrc/doc-relations-checked.json @bbb17eab8 (27 documents, 1140 links). _(2026-11-04T05:10:19.325Z)_

## Citations

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `step-output` `s2`
- **[[c3]]** `step-output` `s3`
- **[[c4]]** `step-output` `s4`
- **[[c5]]** `step-output` `s5`
- **[[c6]]** `stakeholder` `DEF-c2ba6fa62a148ed1 c6` — "Accuracy is chosen over cost"
- **[[c7]]** `stakeholder` `DEF-c2ba6fa62a148ed1 c7` — "Only the daemon opens the stores"
- **[[c8]]** `stakeholder` `DEF-c2ba6fa62a148ed1 c8` — "No direct cloud REST calls"
- **[[c9]]** `convention` `DEF-c2ba6fa62a148ed1 c9` — "Calls that reach a model provider are made one after another"
- **[[c10]]** `stakeholder` `DEF-c2ba6fa62a148ed1 c10` — "a change to what is stored comes with a migration"
- **[[c11]]** `stakeholder` `DEF-c2ba6fa62a148ed1 c11` — "at least 95% ... at least 60% ... at least 100 hand-checked links"
- **[[c12]]** `step-output` `s6`
- **[[c13]]** `step-output` `s7`
- **[[c14]]** `step-output` `s8`
- **[[c15]]** `code` `src/indexer/parser/artifact.ts`
- **[[c16]]** `code` `src/db/graph/codec.ts`
- **[[c17]]** `code` `src/indexer/subsystem-pass.ts`
- **[[c18]]** `code` `src/config/role-taxonomy.ts`
- **[[c19]]** `stakeholder` `DEF-c2ba6fa62a148ed1 c19` — "Model extraction spends the user's CLI session quota"
