# s1/t1 evidence: src/db and src/indexer suites

commit 549918db, 2026-10-16T12:59:02Z. Mutations run by hand: MIGRATION_V4_TO_V5 dropped from the registry -> migration-v4-to-v5.test.ts fails 3 of 4; the index_state delete removed from removeRepo -> both removal tests fail. Both restored.

```
ok 1 - getAllTurnsWithVectorsForRepo joins Lance vectors back onto turns
ok 2 - getAllTurnsWithVectorsForRepo returns vectors only for Lance-backed turns
ok 3 - compaction reclassifies directive turns as type=directive
ok 4 - compaction promotes warm-tier turns and re-embeds the compressed text
ok 5 - compaction collapses archive sessions into a summary turn (centroid)
ok 6 - compaction dedupes near-duplicate turns within the same tier
ok 7 - compaction-deleted turns are removed from Lance turn_vec
ok 8 - compaction dryRun does not mutate state
ok 9 - compaction on empty repo is a no-op
ok 10 - saveTurn persists vector to Lance
ok 11 - saveTurn with empty vector skips Lance write
ok 12 - addCompactedTurns persists batch to Lance with type=merged tier=cold defaults
ok 13 - saveSession with vector persists summary to Lance
ok 14 - closeSession persists summary embedding to Lance
ok 15 - searchTurnsByRepo returns hydrated TurnRecord objects
ok 16 - searchTurnsByRepo returns [] on dim mismatch (legacy silent-error contract)
ok 17 - seedFromPrior returns sessions sorted by recency
ok 18 - seedFromPrior returns [] on dim mismatch
ok 19 - deleteSession cascades Lance session + turn rows
ok 20 - deleteTurnsForSession cascades only the turn Lance rows
ok 21 - deleteSessionsForRepo cascades all Lance rows for that repo
ok 22 - deleteTurnsForRepo cascades Lance turn rows but leaves sessions
ok 23 - deleteTurnsByIds cascades the corresponding Lance rows
ok 24 - saveSession + getSessionById round-trip
ok 25 - saveSession with explicit fields preserves them
ok 26 - saveSession upsert preserves single row
ok 27 - getSessionById on unknown id returns null
ok 28 - setSessionAgent updates agent + category
ok 29 - setSessionStatus mutates only the status
ok 30 - bumpSessionActivity is silent no-op for unknown id
ok 31 - closeSession upserts the row + sets status=completed
ok 32 - saveTurn + getTurnsForSession round-trip
ok 33 - getTurnsForSession returns idx-ordered turns only of type "turn"
ok 34 - saveTurn round-trips assertionRefs (G6 of memory-context design)
ok 35 - saveTurn omits assertionRefs when not provided (back-compat)
ok 36 - saveTurn upsert preserves single row by (sessionId, idx)
ok 37 - saveTurn bumps session lastActivityAt
ok 38 - addCompactedTurns sets defaults: type=merged, tier=cold
ok 39 - addCompactedTurns on empty array is a no-op
ok 40 - getAllTurnsForRepo returns only that repo's turns
ok 41 - getAllTurns returns every turn across repos
ok 42 - listSessions returns sessions in createdAt-desc order
ok 43 - listSessions filters by repo
ok 44 - listSessionRecords filters by status
ok 45 - getConversationStats counts turns + sessions
ok 46 - deleteSession removes the session + all its turns
ok 47 - deleteSession on unknown id returns 0/0
ok 48 - deleteTurnsForSession removes all turns, leaves session
ok 49 - deleteSessionRecord removes only the session row
ok 50 - deleteSessionsForRepo removes only that repo's sessions
ok 51 - deleteTurnsForRepo removes only that repo's turns
ok 52 - deleteTurnsByIds removes the specific turns
ok 53 - deleteTurnsByIds on empty list is a no-op
ok 54 - searchTurnsByRepo returns [] (Phase 3.3 wires Lance)
ok 55 - seedFromPrior returns [] (Phase 3.3 wires Lance)
ok 56 - sessions + turns survive close + reopen
ok 57 - resetTableCaches is a no-op (back-compat shim)
ok 58 - t1: deleteEntitiesById removes the entity + cascades its CALLS_HTTP in/out edges; others untouched
ok 59 - t1: deleting an absent/stale id is a no-op; a mixed batch deletes present, skips absent
ok 60 - writeDocSummary + getDocSummary round-trip
ok 61 - writeDocSummary overwrites an existing summary
ok 62 - getDocSummary returns null for unknown entity
ok 63 - getDocSummary returns null for known entity with no summary
ok 64 - writeDocSummary rejects an unknown entity
ok 65 - writeDocSummary rejects an unregistered repo
ok 66 - listDocSummariesForRepo returns every summary for the repo
ok 67 - countDocSummariesForRepo matches the list length
ok 68 - listDocSummaryEntityIdsForRepo returns the same entity ids
ok 69 - listDocSummariesForRepo returns empty for an unregistered repo
ok 70 - deleteDocSummary drops primary + secondary index
ok 71 - deleteDocSummariesForRepo scoped drop
ok 72 - deleteEntitiesForFile cascades to the summary row
ok 73 - placeholder rows persist the errorCode field
ok 74 - upsertEntities persists vectors to entity_vec when embedding is non-empty
ok 75 - upsertEntities skips Lance write when embedding is empty
ok 76 - upsertEntities re-embed (existing entity, new vector) replaces the Lance row
ok 77 - updateEmbedding persists vector to entity_vec
ok 78 - updateEmbedding on unknown entity is silent no-op
ok 79 - updateEmbedding with empty embedding only updates LMDB model field
ok 80 - searchEntities returns hydrated Entity objects via Lance ANN
ok 81 - searchEntities returns [] for empty query vector
ok 82 - searchEntities returns [] for empty closure
ok 83 - searchEntities respects closure-repo scope
ok 84 - deleteEntitiesForFile cascades Lance rows
ok 85 - deleteEntitiesForRepo cascades all Lance rows for the repo
ok 86 - reindexFile cascades Lance rows for tombstoned entities
ok 87 - upsertEntities + getEntity round-trip
ok 88 - upsertEntities preserves all flag fields
ok 89 - getEntity on unknown id returns null
ok 90 - getEntitiesByIds returns matched subset (unmatched omitted)
ok 91 - getEntitiesByIds on empty array returns []
ok 92 - upsert overwrites a non-module entity
ok 93 - module-stub upsert is ensure-exists (does not overwrite)
ok 94 - upsertEntities dedupes intra-batch duplicates (last-wins)
ok 95 - upsertEntities on empty array is a no-op
ok 96 - listEntitiesForRepo returns only the requested repo
ok 97 - listEntitiesForRepo on unknown repo returns []
ok 98 - findEntitiesByFile filters by absolute path
ok 99 - findEntitiesByName matches names + kind filter
ok 100 - findEntitiesByName respects repo filter
ok 101 - findEntitiesByName respects multi-repo `repos` filter
ok 102 - findEntitiesByName: empty `repos` array returns []
ok 103 - findEntitiesByName: `repos` with unknown paths drops them silently
ok 104 - findEntitiesByName: passing both `repo` and `repos` throws
ok 105 - findEntitiesByName respects limit
ok 106 - findEntitiesByName on empty input returns []
ok 107 - listUnembeddedEntities filters on empty embeddingModel
ok 108 - updateEmbedding sets the model name (vector goes to Lance in 3.2)
ok 109 - updateEmbedding on unknown id is a silent no-op
ok 110 - deleteEntitiesForFile removes only that file's entities
ok 111 - deleteEntitiesForFile cascades to out_edge and in_edge
ok 112 - deleteEntitiesForRepo removes all entities for that repo only
ok 113 - deleteEntitiesForRepo on unknown repo is a silent no-op
ok 114 - entities survive close + reopen
ok 115 - absolute file path -> repo-relative on write, back to absolute on read
ok 116 - repo IDs are auto-allocated on first sighting
ok 117 - the read of a repository's stored files returns each file once, only that repository's files, and no empty path
ok 118 - the removal of one repository's unresolved relations of a file leaves another repository's unresolved relations of the same path
ok 119 - an unregistered repository has no stored files and its removal of unresolved relations does nothing
ok 120 - put + get round-trip
ok 121 - get returns null on cache miss (never written)
ok 122 - same exploration params produce the same hash
ok 123 - different exploration types produce distinct hashes
ok 124 - nested params still canonicalise deterministically
ok 125 - different lastIndexedAt produces cache miss
ok 126 - repo scoping: repo A row is not visible to repo B lookup
ok 127 - deleteCachedExplorationsForRepo drops every row for the repo
ok 128 - put + get on unregistered repo is a no-op / null
ok 129 - lancedb native binding loads
ok 130 - create table + insert + count round-trip
ok 131 - vector search returns nearest first
ok 132 - vector dim 1024 is accepted (post-0.2 default)
ok 133 - table reopened from disk retains data (file-backed persistence)
ok 134 - filter columns work alongside vector search (where clause)
ok 135 - lmdb native binding loads
ok 136 - put and get round-trip with default msgpack codec
ok 137 - binary keys (Buffer) round-trip
ok 138 - cursor range scan returns sorted keys
ok 139 - sub-databases (named) are independent keyspaces
ok 140 - msgpack codec preserves nested objects
ok 141 - write transaction is atomic (all-or-nothing)
ok 142 - reopened env retains data (file-backed persistence)
ok 143 - reindexFile on empty store creates entity rows
ok 144 - reindexFile on empty parsed list with no existing is a no-op
ok 145 - reindexFile: identical re-parse is a no-op
ok 146 - reindexFile: adding an entity inserts the new + preserves existing
ok 147 - reindexFile: removing an entity tombstones it + keeps the rest
ok 148 - reindexFile: replacing all entities tombstones the original set
ok 149 - reindexFile: changed body updates the row
ok 150 - reindexFile: tombstoning a referenced entity clears incident edges
ok 151 - reindexFile preserves module stubs that already exist
ok 152 - reindexFile is idempotent: same parse twice produces the same row set
ok 153 - reindexFile: contentHash unchanged + body unchanged -> no row mutation
ok 154 - reindexFile auto-allocates a repoId on first sighting
ok 155 - reindexFile only touches entities of the specified file
ok 156 - reindexFile result survives close + reopen
ok 157 - upsertRelation writes a single resolved edge to both mirrors
ok 158 - upsertRelations bulk-writes multiple resolved edges
ok 159 - upsertRelations dedupes intra-batch duplicates by (from, to, kind)
ok 160 - upsertRelations is idempotent across calls
ok 161 - upsertRelations skips resolved edges with missing endpoints
ok 162 - upsertRelations on empty array is a no-op
ok 163 - different relation kinds coexist on the same (from, to) pair
ok 164 - upsertRelation routes unresolved to the queue
ok 165 - upsertRelations splits resolved/unresolved correctly
ok 166 - listUnresolvedRelations with file scope filters correctly
ok 167 - unresolved row missing meta.file/repo is dropped
ok 168 - promoteToResolved writes the resolved edge + removes the unresolved row
ok 169 - updateUnresolvedMeta writes the new meta + bumps attemptedAt
ok 170 - updateUnresolvedMeta on unknown id is a silent no-op
ok 171 - deleteUnresolvedForFile removes only that file's unresolved rows
ok 172 - deleteUnresolvedForRepo removes everything for that repo only
ok 173 - deleteUnresolvedForRepo on unknown repo is a silent no-op
ok 174 - promoteResolvedBatch writes all edges + removes all unresolved rows
ok 175 - updateUnresolvedMetaBatch updates each row
ok 176 - promoteResolvedBatch on empty array is a no-op
ok 177 - updateUnresolvedMetaBatch on empty array is a no-op
ok 178 - makeUnresolvedRelationId is deterministic
ok 179 - makeUnresolvedRelationId differs for different inputs
ok 180 - resolved edges + unresolved rows survive close + reopen
ok 181 - 5.2: upsertEntities throws UnregisteredRepoError for an unregistered workspace path
ok 182 - 5.2: failed upsert leaves the repo sub-DB untouched (no auto-allocation)
ok 183 - 5.2: upsertEntities succeeds once the path is pre-registered via addRepo
ok 184 - 5.2: storage layer never writes a non-shared-modules repo row outside addRepo()
ok 185 - 5.2: module entities (empty repo path) bypass strict lookup via namespace fallback
ok 186 - 5.2: UnregisteredRepoError is throwable + introspectable
ok 187 - 5.3: same module name in Java vs Python produces distinct entity IDs
ok 188 - 5.3: Java + Scala module entities share the jvm namespace row (no separate row per language)
ok 189 - 5.3: every shared-modules namespace gets its own reserved repoId (4 distinct rows)
ok 190 - 5.3: reserved shared-modules row has empty path + namespace tag in storage
ok 191 - addRepo + listRepos round-trip
ok 192 - addRepo with explicit name overrides basename derivation
ok 193 - addRepo with empty name falls back to basename
ok 194 - addRepo on existing path updates in place (same repo_id semantics)
ok 195 - addRepo with multiple paths creates multiple rows
ok 196 - removeRepo by path deletes the row
ok 197 - removeRepo deletes the repository's index_state row with its registry row (Epic c2ba6fa6 s1/t1)
ok 198 - removeRepo on unknown path is a silent no-op
ok 199 - listRepos on empty registry returns empty array
ok 200 - updateRepoStatus mutates only status / lastIndexed / errorMsg
ok 201 - updateRepoStatus on unknown path is a silent no-op
ok 202 - updateRepoStatus with errorMsg surfaces it on listRepos
ok 203 - all four status values round-trip
ok 204 - lastIndexed sentinel: absent when never indexed, present after first index
ok 205 - lastIndexed survives close + reopen
ok 206 - many repos round-trip without collision (linear-scan correctness)
ok 207 - addRepo updates status without losing addedAt
ok 208 - validateRepoPathShape rejects empty string
ok 209 - validateRepoPathShape rejects non-string input
ok 210 - validateRepoPathShape rejects relative paths
ok 211 - validateRepoPathShape rejects filesystem root + system / volatile dirs
ok 212 - validateRepoPathShape normalises trailing-slash + .. segments
ok 213 - validateRepoPathShape rejects normalised banned root (e.g. `/Users/.`)
ok 214 - validateRepoPath (full) accepts an existing temp directory
ok 215 - validateRepoPath (full) rejects non-existent path
ok 216 - addRepo rejects empty / banned-root paths via shape validation
ok 217 - registry codec: decodeRepoRow keeps lastRun, and a status write without lastRun keeps the stored one
ok 218 - findCallees returns 1-hop CALLS successors
ok 219 - findCallers returns 1-hop CALLS predecessors
ok 220 - findCallees with no outgoing CALLS returns []
ok 221 - findCallers with no incoming CALLS returns []
ok 222 - findCallees on unknown entity returns []
ok 223 - findCallees ignores non-CALLS edges
ok 224 - findDefinedIn returns DEFINES successors
ok 225 - findDefinedIn with mixed kinds only returns DEFINES targets
ok 226 - findImports returns IMPORTS successors
ok 227 - findImports on file with no IMPORTS returns []
ok 228 - resolveClosure includes the root even with no DEPENDS_ON edges
ok 229 - resolveClosure on unknown repo path returns just the path
ok 230 - resolveClosure walks transitive DEPENDS_ON across repos
ok 231 - resolveClosure handles cycles without infinite loop
ok 232 - resolveClosure filters out non-repo reachable entities
ok 233 - insertList creates a list with a seed transfer entry
ok 234 - insertList rejects unknown owner / source
ok 235 - insertList with parentListId validates session match
ok 236 - insertList with missing parent rejects
ok 237 - insertItem creates an item under an existing list
ok 238 - insertItem on missing list rejects
ok 239 - listItems returns items sorted by order
ok 240 - listItems supports fractional ordering for insert-between
ok 241 - insertComment + listCommentsForItem round-trip
ok 242 - listCommentsForItem returns comments sorted by createdAt
ok 243 - updateComment updates body + agentAcknowledged
ok 244 - deleteComment removes the comment
ok 245 - updateItem rejects illegal status transitions
ok 246 - updateItem -> completed sets completedAt
ok 247 - updateItem -> blocked requires non-empty blockedReason
ok 248 - updateList rejects illegal status transitions
ok 249 - transferList changes owner + appends transfer history
ok 250 - reparentList sets the parent
ok 251 - reparentList rejects cycles
ok 252 - assertParentAllowed accepts valid hierarchies
ok 253 - listListsBySession returns roots first then children
ok 254 - listListsBySession filters by includeArchived flag
ok 255 - listAllLists filters by status + source
ok 256 - deleteItem removes the item + its comments
ok 257 - deleteList cascades through items + comments
ok 258 - deleteListsBySession returns the count
ok 259 - lists + items + comments survive close + reopen
ok 260 - repo row round-trip
ok 261 - registry codec: a row with lastRun round-trips; an older row without it decodes with lastRun undefined
ok 262 - repo row round-trip -- shared-modules kind with namespace
ok 263 - entity row round-trip including all flag fields
ok 264 - entity row preserves empty-string sentinel defaults
ok 265 - edge props: empty payload encodes to zero-byte buffer
ok 266 - edge props: CALLS shape round-trips
ok 267 - edge props: READS shape round-trips
ok 268 - edge props: IMPORTS shape round-trips
ok 269 - unresolved row round-trip
ok 270 - plan row round-trip
ok 271 - plan_step row round-trip with sentinel timestamps + dependsOn
ok 272 - session row round-trip with all status / tier values
ok 273 - turn row round-trip with all enum values
ok 274 - todo_list row round-trip
ok 275 - todo_item row round-trip with tags + meta
ok 276 - todo_comment row round-trip
ok 277 - config_entry row round-trip
ok 278 - msgpack encoding is more compact than JSON for typical entity
ok 279 - large body in entity row round-trips correctly
ok 280 - compactGraphStore reclaims space after large deletes
ok 281 - compactGraphStore preserves all rows when nothing has been freed
ok 282 - compactGraphStore cleans up .bak after success
ok 283 - compactGraphStore re-opens the env so subsequent writes go through
ok 284 - compactGraphStore throws when env is not open
ok 285 - compactGraphStore pre-clears stale .compact / .bak from a prior aborted run
ok 286 - entityIdByU64 finds the string id via the reverse index
ok 287 - entityIdsByU64s bulk-resolves O(K) via point lookups
ok 288 - entity_string_by_u64 is removed when an entity is deleted
ok 289 - name_index returns ALL entities sharing (repo, kind, name)
ok 290 - name_index drops only the deleted entity from the dup set
ok 291 - findEntitiesByName respects kind filter via name_index
ok 292 - v1->v2 migration backfills entity_string_by_u64 + name_index
ok 293 - schema_version pre-flight runs the v1->v2 migration on env open
ok 294 - first entity allocation returns 1 (0 reserved as no-ID sentinel)
ok 295 - first repo allocation returns 1
ok 296 - entity allocations are monotonically increasing
ok 297 - repo allocations are monotonically increasing
ok 298 - block allocation reserves contiguous IDs without gaps
ok 299 - block allocation rejects count < 1
ok 300 - counters survive close + reopen
ok 301 - peek does not mutate the counter
ok 302 - in-txn allocator works alongside other writes
ok 303 - in-txn allocator: repo + entity counters are independent
ok 304 - concurrent allocations all return distinct IDs
ok 305 - large block allocation produces correct next value at u64 scale
ok 306 - owner check: default path with no declaration is refused and no file is created
ok 307 - owner check: after the declaration the same open succeeds, also after a close and reopen
ok 308 - owner check: a temporary path opens without a declaration
ok 309 - owner check: the live path as a relative path and through a symbolic link is refused
ok 310 - owner check: only the owner declaration opens the live path; without it, and after it is forgotten, the open is refused
ok 311 - source scan: the reader declaration's name appears nowhere under src/
ok 312 - refusal: process B is refused and never opens the lock file; process A then writes; a child of a declared process is refused
ok 313 - refusal of a third process: beside the owner, a process with no declaration is refused the live graph store and holds no descriptor
ok 314 - lmdb behaviour pin: after a reopen in a fresh process, root.transaction keeps a throwing callback's write, root.childTransaction and root.transactionSync discard it
ok 315 - the store opens without writemap mode, so child transactions are available
ok 316 - detection through the real wrappers: asynchronous write by probe, synchronous write at once
ok 317 - control: the same wrappers on a store that was not broken write and record nothing
ok 318 - store library after another process removed its locks
ok 319 - v2->v3: provisions all 4 reserved shared-modules rows
ok 320 - v2->v3: rewires Java module entity to jvm namespace + recomputes string ID
ok 321 - v2->v3: rewires Python module entity to python namespace (separate from jvm)
ok 322 - v2->v3: drops the phantom workspace row + its entities (cascade)
ok 323 - v2->v3: idempotent on re-run from v3
ok 324 - v2->v3: workspace row with valid path is preserved
ok 325 - a v4 store opened by this code is at version 5 with one IndexStateRow per workspace repository, not complete, its pending counts recounted from the stored rows
ok 326 - a v4 -> v5 step that throws leaves the stored version at 4 and writes no IndexStateRow
ok 327 - the registry keeps V1->V2, V2->V3 and V3->V4 in order and appends V4->V5
ok 328 - removing a repository after the migration leaves no index_state row for it
ok 329 - production MIGRATIONS registry has the v1->v2 entry
ok 330 - production MIGRATIONS registry has the v2->v3 entry
ok 331 - runMigrations is a no-op when stored == target
ok 332 - runMigrations with empty registry but stored < target throws
ok 333 - runMigrations rejects when stored > target
ok 334 - runMigrations applies a single 1->2 step and advances meta.schema_version
ok 335 - runMigrations chains 1 -> 2 -> 3 in two steps
ok 336 - runMigrations prefers the longest jump that does not overshoot
ok 337 - runMigrations does not overshoot the target
ok 338 - runMigrations leaves intermediate version on disk after a per-step crash
ok 339 - a throwing step leaves neither its rows nor its version write; earlier steps stay committed (ISSUE-5437d6e5)
ok 340 - runMigrations throws MigrationPathError when chain is incomplete
ok 341 - runMigrations re-run from already-current version is a no-op
ok 342 - the two formerly live-store test files pass against a temporary store and create nothing at the default path
ok 343 - the review probe test, found by the same search, creates nothing at the default path either
ok 344 - three daemon request tests, found by the same search, create nothing at the default path
ok 345 - the MCP step and review tests, found by the full audit, create nothing at the default path
ok 346 - the check sees a store that IS opened at the default path
ok 347 - first boot writes schema_version
ok 348 - re-open with matching schema_version proceeds normally
ok 349 - re-open with stored > expected hard-fails with LmdbStoreSchemaVersionMismatch
ok 350 - INSRC_LMDB_MAPSIZE_GIB override is honored
ok 351 - invalid INSRC_LMDB_MAPSIZE_GIB falls back to default
ok 352 - LmdbStoreError classes are exported and constructible
ok 353 - opening a non-LMDB file at the env path surfaces a typed error
ok 354 - SCHEMA_VERSION constant is exported and stable
ok 355 - runReaderCheck returns 0 on a fresh env (no stale slots)
ok 356 - runReaderCheck is a no-op when env is closed
ok 357 - runReaderCheck is safe to call repeatedly
ok 358 - RELATION_KIND_BYTE: no duplicate byte; boundary kinds appended at 13-16
ok 359 - ENTITY_KIND_BYTE: no duplicate byte; externalEndpoint appended at 13
ok 360 - each boundary RelationKind byte round-trips via kindByteToName
ok 361 - frozen sc1 vocabulary: protocol enum + boundary names
ok 362 - externalEndpoint EntityRow round-trips (resolved variant)
ok 363 - externalEndpoint EntityRow round-trips (unresolved variant with rawExpression)
ok 364 - forward-compat: a pre-S001 row (no endpoint fields) decodes unchanged, endpoint fields undefined
ok 365 - graph closure
ok 366 - v3 -> v4 no-op migration advances schema_version leaving rows byte-identical
ok 367 - recordStoreFailureIfLockError: records both read failures once, and nothing else
ok 368 - the named error's message names another process and does not repeat the library's advice
ok 369 - health record: after locks-lost a further store call throws the named error and closeGraphStore skips the library's close
ok 370 - health record: after locks-lost getGraphStore itself rejects with the named error
ok 371 - sync wrapper: code 22 with a succeeding probe read is rethrown and leaves the record ok
ok 372 - slow healthy write: the probe runs and returns, nothing is recorded, the write completes
ok 373 - encodeEntityKey + decode round-trips u64 values including edges
ok 374 - encodeRepoKey + decode round-trips u32
ok 375 - encodeOutEdgeKey produces 17 bytes; round-trips
ok 376 - encodeInEdgeKey produces 17 bytes; round-trips
ok 377 - encodeOutEdgePrefix + prefixSuccessor bracket a single (from,kind) range
ok 378 - encodeOutEdgePrefix without kind brackets all kinds for a (from)
ok 379 - big-endian u64 key ordering matches numeric ordering
ok 380 - composite name_index key includes repo + kind + name
ok 381 - plan_step key range scans return idx-ordered steps
ok 382 - conversation_turn key orders by idx within session
ok 383 - todo_item key respects orderKey lex order
ok 384 - config_by_scope key supports hierarchical prefix scans
ok 385 - relation-kind enum byte mapping is bidirectional
ok 386 - entity-kind enum byte mapping is bidirectional
ok 387 - utf8 segment with null byte is rejected
ok 388 - all 20 sub-DBs open and accept basic put/get
ok 389 - lifecycle close + reopen preserves data
ok 390 - concurrent first-callers share the same init promise
ok 391 - write transaction is atomic
ok 392 - cursor range scan over out_edge prefix returns kind-scoped neighbors
ok 393 - bfs from a single root yields the root + transitive descendants
ok 394 - bfs visits each node exactly once even with cycles
ok 395 - bfs respects maxDepth
ok 396 - bfs respects kindFilter
ok 397 - bfs with direction=in walks reverse edges
ok 398 - bfs visitor pruning skips subtree expansion
ok 399 - bfs from multiple roots merges the closures
ok 400 - bfs deduplicates roots
ok 401 - dfs visits the same nodes as bfs (different order)
ok 402 - dfs handles cycles without infinite loop
ok 403 - dfs respects maxDepth
ok 404 - transitiveClosure returns the BFS-reachable set
ok 405 - transitiveClosure on empty roots returns empty set
ok 406 - scc: isolated nodes are singletons
ok 407 - scc: a 3-node cycle is one component of size 3
ok 408 - scc: cycle + tail reports two components
ok 409 - scc: two disjoint cycles + reachable from a single root via separate edge
ok 410 - scc respects kindFilter
ok 411 - traversal results survive close + reopen
ok 412 - unreachable: every entity outside the closure is yielded
ok 413 - unreachable respects candidateKinds (only those kinds yielded)
ok 414 - unreachable: empty roots yields every entity of the candidate kinds
ok 415 - unreachable: all roots, all reachable -> empty
ok 416 - unreachable: empty candidateKinds is a no-op
ok 417 - unreachable handles cycles in the reachable subgraph
ok 418 - unreachable respects kindFilter on the closure traversal
ok 419 - unreachable respects direction=in (reverse reachability)
ok 420 - unreachable respects maxDepth
ok 421 - a withWriteTxn callback that writes in two sub-DBs and throws rejects with its own error and leaves nothing, in-process and after a reopen
ok 422 - of two callers queued together, one throwing and one succeeding, only the successful one's writes are kept
ok 423 - an async callback is refused with "withWriteTxn callbacks must be synchronous" and keeps nothing; the type rejects it
ok 424 - a refused async callback that rejects later raises no unhandled rejection
ok 425 - upsertArtifactVec + queryArtifactVec round-trip
ok 426 - queryArtifactVec scopes by sessionId
ok 427 - queryArtifactVec scopes by intent when provided
ok 428 - getArtifactById returns the row by exact id (no ANN)
ok 429 - deleteArtifactsForSession removes all rows for a session and returns count
ok 430 - upsert: writing the same id replaces
ok 431 - returns [] for empty query / empty session / k=0
ok 432 - deleteArtifactsForSession on empty session returns 0 cleanly
ok 433 - default summary on a freshly-spilled row is empty string
ok 434 - upsertArtifactVec persists explicit summary verbatim
ok 435 - updateArtifactSummary overwrites only the summary column
ok 436 - updateArtifactSummary returns false for unknown id (soft-fail)
ok 437 - updateArtifactSummary refuses empty id + the seed sentinel
ok 438 - listArtifactsForSession returns rows newest-first
ok 439 - listArtifactsForSession scopes by session and excludes seed
ok 440 - listArtifactsForSession honours skillIdPrefix filter
ok 441 - listArtifactsForSession honours afterTimestamp lower bound (exclusive)
ok 442 - listArtifactsForSession returns [] for empty sessionId
ok 443 - listArtifactsForSession defaults summary to empty string for rows without one
ok 444 - queryArtifactVec results carry the summary field
ok 445 - deleteSessionFromLance: empty sessionId is a no-op + zero counts
ok 446 - deleteSessionFromLance: unknown sessionId returns zero counts
ok 447 - deleteSessionFromLance: removes only the targeted session across all 4 tables
ok 448 - deleteSessionFromLance: re-running on the same session is idempotent
ok 449 - deleteSessionFromLance: SQL-injection-safe (apostrophes in sessionId)
ok 450 - compactSessionVecTables: succeeds when tables exist + have tombstones
ok 451 - compactSessionVecTables: succeeds when no tables exist yet
ok 452 - compactSessionVecTables: idempotent (call twice, second is cheap)
ok 453 - writeConfigEmbedding + searchConfigVecs round-trip
ok 454 - searchConfigVecs accepts caller-supplied where filter
ok 455 - searchConfigVecs scope filter via where
ok 456 - searchConfigVecs language=all-or-specific filter
ok 457 - upsert: writing same id replaces
ok 458 - deleteConfigVec / deleteConfigVecsByIds / deleteConfigVecsForScope
ok 459 - returns [] for empty query
ok 460 - seed sentinel is excluded from search results
ok 461 - getLanceConn creates the directory + opens a connection
ok 462 - subsequent getLanceConn calls return the same instance
ok 463 - concurrent first-callers share the init promise
ok 464 - close + reopen works (data persists)
ok 465 - setLanceConnPath isolates between tests (different tmpdirs)
ok 466 - openOrCreateTable creates the table on first call
ok 467 - openOrCreateTable opens an existing table without re-seeding
ok 468 - openOrCreateTable rejects empty seed when creating
ok 469 - writeEntityEmbedding stores a single row
ok 470 - writeEntityEmbedding upsert: same id replaces row
ok 471 - writeEntityEmbeddings bulk upsert
ok 472 - writeEntityEmbeddings on empty array is a no-op
ok 473 - searchEntityVecs returns ANN hits ordered by distance
ok 474 - searchEntityVecs respects closure-repo scope
ok 475 - searchEntityVecs filter=code excludes artifacts
ok 476 - searchEntityVecs filter=artifact returns only artifacts
ok 477 - searchEntityVecs returns [] for empty query vector
ok 478 - searchEntityVecs returns [] for empty closureRepos
ok 479 - searchEntityVecs excludes the seed sentinel row
ok 480 - the vector search given an empty list of ids makes no query; given a large list it returns the nearest of them, in one query or in batches merged by distance; with no area the query is as before
ok 481 - deleteEntityVec removes a single row
ok 482 - deleteEntityVecsByIds bulk drop
ok 483 - deleteEntityVecsForRepo removes all rows for a repo
ok 484 - delete on empty input is a silent no-op
ok 485 - strings with single quotes are escaped in delete + search
ok 486 - rows survive close + reopen
ok 487 - compactEntityVecTable reduces on-disk fragment count
ok 488 - compactEntityVecTable preserves all rows + searchability
ok 489 - compactEntityVecTable on a fresh / single-fragment table is a cheap no-op
ok 490 - compactEntityVecTable result survives close + reopen
ok 491 - vector store owner rule: no declaration other than the owner's exists, and without it the live vector store is refused
ok 492 - vector store owner rule: live path refused with no declaration and nothing created; opens after declareLiveStoreOwner; a temporary path opens; relative path and symbolic link refused
ok 493 - no test opens the live vector store: each repaired test file run in a temporary home leaves no lance directory
ok 494 - the check sees a vector store that IS opened at the default path
ok 495 - upsertResponseSegmentVec + queryResponseSegmentVec round-trip
ok 496 - queryResponseSegmentVec scopes hits to a single session
ok 497 - queryResponseSegmentVec respects the k limit
ok 498 - queryResponseSegmentVec returns [] for empty query vector or empty sessionId
ok 499 - upsert is idempotent on the same id (mergeInsert overwrite)
ok 500 - deleteResponseSegmentsForSession removes all rows for a session and returns the count
ok 501 - deleteResponseSegmentsForSession on an empty session returns 0
ok 502 - deleteResponseSegmentsForTurn removes only the rows for that turn
ok 503 - seed row never appears in query results
ok 504 - writeSessionEmbedding + searchSessionVecs round-trip
ok 505 - searchSessionVecs scopes by repo
ok 506 - searchSessionVecs with notExpired drops expired sessions
ok 507 - upsert: writing the same id replaces
ok 508 - deleteSessionVec / deleteSessionVecsByIds / deleteSessionVecsForRepo
ok 509 - returns [] for empty query / empty repo
ok 510 - writeTurnEmbedding + searchTurnVecs round-trip
ok 511 - searchTurnVecs default type filter excludes summary
ok 512 - searchTurnVecs with explicit types
ok 513 - deleteTurnVec / deleteTurnVecsBySessionId / deleteTurnVecsForRepo
ok 514 - writeBullet + searchBullets: single-row round-trip
ok 515 - writeBullets: batched insert + ANN returns multiple hits ordered by distance
ok 516 - searchBullets: filters by runId -- other runs are excluded
ok 517 - searchBullets: empty runId -> [] (early return)
ok 518 - searchBullets: empty queryVec -> [] (early return)
ok 519 - deleteBulletsForRun: drops every row for the run
ok 520 - deleteBulletsForRun: empty runId -> no-op (no throw)
ok 521 - deleteBulletsForTodo: drops just the matching TODO's rows
ok 522 - escapeLanceString: doubles single quotes
ok 523 - searchBullets: runId containing a single quote does not corrupt the filter
ok 524 - writeBullets: writing the same id twice updates the row in place
ok 525 - S003 t2 — code-symbol resolver excludes CALLS_HTTP
ok 526 - runCrossFileResolver (LMDB) -- INHERITS in same package
ok 527 - runCrossFileResolver (LMDB) -- module-stub IMPORTS rewiring
ok 528 - runCrossFileResolver (LMDB) -- external-dep stays as module stub
ok 529 - runCrossFileResolver (LMDB) -- CALLS resolves to exported function in imported file
ok 530 - runCrossFileResolver (LMDB) -- CALLS to non-exported target stays unresolved
ok 531 - runCrossFileResolver (LMDB) -- CALLS marks ambiguous when two imported files export same name
ok 532 - runCrossFileResolver (LMDB) -- idempotency
ok 533 - embedder.ts derives its keep_alive from the models.local.embeddingKeepAlive config
ok 534 - every ollama.embed(...) call in the indexer embedder passes keep_alive
ok 535 - t1 ac1: one externalEndpoint node per distinct resolved target, with a CALLS_HTTP edge from each caller
ok 536 - t1 ac2 dedup: three call-sites to one target => one node, three CALLS_HTTP edges
ok 537 - t1 ac2 per-repo: two repos calling the same target => two distinct nodes
ok 538 - t1 cross-language: a TS and a Python edge to the same resolved identity share ONE language-agnostic node
ok 539 - t1 resolved-vs-literal dedup: an interpolated expr resolving to the same host/path as a literal collapses to one node
ok 540 - t1 unresolved (k5): an un-pinnable URL mints an unresolved node carrying rawExpression + a CALLS_HTTP edge, never dropped
ok 541 - t1 dangling `from`: a CALLS_HTTP whose caller no longer exists is skipped (no node, no edge)
ok 542 - t1 idempotency: re-running over identical rows yields the identical node/edge set; sc2 called once per distinct expr
ok 543 - t1 no-op: a repo with no CALLS_HTTP rows produces no endpoints and leaves the graph unchanged
ok 544 - t2 edges-stat: one caller, two distinct raw exprs -> same identity => endpoints=1, edges=1 (not 2)
ok 545 - t2 GC: an orphan externalEndpoint (no in-edge) is deleted while a live one survives the pass
ok 546 - t2 GC full-clear: a repo whose HTTP calls were all removed ends with zero endpoint nodes
ok 547 - t2 idempotency: re-running on identical rows deletes nothing and yields the same node set
ok 548 - IGNORE_DIRS excludes build-output + daemon-artifact dirs
ok 549 - full index: during a run the in-process record shows began and files done of selected; at the end the registry row's lastRun is written once with outcome 'completed' or 'failed' (a forced failure mid-walk), and the record is closed; no write per file (counted)
ok 550 - reindex of a ready repository: status indexing and the running record carries the new run's figures
ok 551 - start-up re-queue: repositories left indexing without lastIndexed are still re-queued, unchanged
ok 552 - parseManifest - Maven pom.xml
ok 553 - parseManifest - Gradle (Groovy DSL)
ok 554 - parseManifest - Gradle (Kotlin DSL)
ok 555 - parseManifest - SBT
ok 556 - parseManifest - Mill
ok 557 - parseManifest - no manifest
ok 558 - ac1: publish + subscribe to the SAME topic => ONE node, TWO edges (direction on the edge)
ok 559 - ac1 dedup: three producers to one topic => one node, three PUBLISHES_TO edges; sc2 called once
ok 560 - ac2: a config-built topic resolves to an identity; an un-pinnable one still mints a resolved:false node
ok 561 - idempotency: re-running over identical rows yields the identical node set and GC deletes nothing
ok 562 - cross-protocol GC: the messaging pass GCs an orphan messaging node but NEVER an HTTP node
ok 563 - cross-protocol GC (symmetric): the HTTP pass never deletes a messaging endpoint
ok 564 - no-op: a repo with no messaging rows produces no endpoints
ok 565 - a clean-up job for a registered repository with nothing stored is processed without error
ok 566 - the clean-up removes a file that is gone and a file under an ignored directory, with their relations and unresolved relations, and leaves every other file of the repository and every file of another repository as it was
ok 567 - a file that exists and is not ignored is kept although the file listing leaves it out, an entity with no file path is kept, and a file whose name only contains an ignored name is kept
ok 568 - a repository whose directory is missing loses nothing, and a file whose presence cannot be told is kept
ok 569 - running the clean-up a second time removes nothing, and a repository with nothing stale is left as it was
ok 570 - a file whose parent directory became a file is removed as absent
ok 571 - the clean-up of a repository that ignores a directory leaves the entities a nested registered repository holds for the files under it
ok 572 - the vector rows of a removed file are gone after the clean-up and those of a kept file remain
ok 573 - a kept file's link into a removed entity is removed with it, and the kept file's other links and entities stay
ok 574 - a clean-up that removed files runs the resolver once inside the job, leaves no settle timer armed and removes the repository's cached exploration results, and one that removed nothing leaves them
ok 575 - the clean-up method called directly removes the stale files, runs no resolver and removes no cached result
ok 576 - a store failure part-way through a clean-up job still drops the cached results and runs the resolver for the files already removed, and the job fails
ok 577 - a resolver failure after a clean-up fails the job with the cached results already dropped
ok 578 - a failure on the only stale file still drops the cached results and runs the resolver, because part of the file may be gone
ok 579 - a repository whose directory is there but holds none of the stored files loses nothing, and one where only ignored files are left on disk is still cleaned
ok 580 - an ignored file is removed whatever the check of its presence says, also when it is the only thing stored
ok 581 - a clean-up failure inside a full index fails the full index and marks the repository error
ok 582 - a create or update file job for a file under an ignored directory indexes nothing, and one for a file elsewhere is indexed
ok 583 - a ready repository gets a clean-up job at daemon start, one that gets a full index at start gets no separate one, and a full index runs the clean-up before it marks the repository ready
ok 584 - detectRepoType: marker files map to types (polyglot returns all)
ok 585 - detectRepoType: empty repo → no types
ok 586 - repoTypeIgnoreDirs: java → target/build, python → __pycache__/.venv, node → node_modules/dist
ok 587 - gitignoreDirs: extracts bare dir names, skips comments/negations/globs/nested
ok 588 - gitignoreDirs: no .gitignore → empty
ok 589 - initRepoIgnore: with .gitignore → base ∪ gitignore dirs, persisted to .insrc/config.json
ok 590 - initRepoIgnore: no .gitignore → base ∪ repo-type defaults (java)
ok 591 - initRepoIgnore: idempotent — never overwrites an existing ignore
ok 592 - resolveRepoIgnore: config present → its ignore; absent → IGNORE_DIRS fallback
ok 593 - resolveRelations -- Python relative imports
ok 594 - detectSourceRoots -- Java/Maven
ok 595 - detectSourceRoots -- Java/Gradle
ok 596 - detectSourceRoots -- Scala/SBT cross-build
ok 597 - detectSourceRoots -- Python flat + nested
ok 598 - detectSourceRoots -- Python with src/ layout
ok 599 - detectSourceRoots -- Go
ok 600 - detectSourceRoots -- TypeScript tsconfig
ok 601 - detectSourceRoots -- JavaScript jsconfig
ok 602 - detectSourceRoots -- no-manifest conventions
ok 603 - endpoint id reuses the makeEntityId hex-32 convention (file="" , kind="externalEndpoint")
ok 604 - same (repo, protocol, target) => same id; differing repo => different id (per-repo dedup, k2)
ok 605 - protocol participates in identity: same target, different protocol => different id
ok 606 - unresolved endpoint (target="") derives its id from rawExpression, distinct from a resolved same-protocol endpoint
ok 607 - http-client-shapes helper — stable contract for t4/t5
ok 608 - TypeScript/JS HTTP recognizer
ok 609 - TypeScript proven-receiver dataflow recall (S001 t3)
ok 610 - Java HTTP recognizer (import-gated)
ok 611 - Scala HTTP recognizer (import-gated)
ok 612 - Python HTTP recognizer
ok 613 - Go HTTP recognizer
ok 614 - Python proven-receiver dataflow recall (S001 t4)
ok 615 - Python messaging recognizer (S004)
ok 616 - Go messaging recognizer (S004)
ok 617 - Java parser - top-level types
ok 618 - Java parser - package + imports
ok 619 - Java parser - CALLS
ok 620 - Java parser - members
ok 621 - Java parser - annotations + nesting
ok 622 - Kotlin parser - types
ok 623 - Kotlin parser - functions
ok 624 - Kotlin parser - package + imports
ok 625 - Kotlin parser - supertypes
ok 626 - Kotlin parser - calls
ok 627 - Kotlin parser - robustness
ok 628 - Kotlin parser - registry + jvm dedup
ok 629 - Kotlin parser - grammar smoke regression
ok 630 - messaging-client-shapes helper — stable contract
ok 631 - TypeScript/JS messaging recognizer
ok 632 - Scala parser - top-level types
ok 633 - Scala parser - imports
ok 634 - Scala parser - members
ok 635 - Scala parser - Scala 3 specifics
ok 636 - Scala parser - CALLS
ok 637 - t4: adapter discovers a config-entity Dockerfile AND reads repo-root .env at rest; matches the pure core
ok 638 - t4: an empty-config repo yields an empty map — literals pin, indirect exprs resolve unresolved, no throw
ok 639 - t4: resolution never executes a config source — a Dockerfile RUN / shell is inert text
ok 640 - t1: ResolvedTarget discriminates on `resolved`; ConfigSourceLayer has the four members
ok 641 - t3: a concrete literal resolves true with identity=the literal (no map lookup)
ok 642 - t3: an interpolation referencing a key present only in localConfig resolves from the default
ok 643 - t3: a two-key interpolation with one missing key => {resolved:false} (no partial pin)
ok 644 - t3: a missing key => unresolved
ok 645 - t3: a cyclic interpolation chain terminates and returns unresolved
ok 646 - t3: a deep (nested) chain that terminates resolves to the final literal
ok 647 - t3: protocol is carried through unchanged for http/messaging/rpc (no shape validation)
ok 648 - t3: precedence via resolveAgainst — k8s beats envFile beats localConfig; k8s beats docker
ok 649 - t2: .env parser — key=value, quoted, comments, export, malformed line skipped
ok 650 - t2: Dockerfile ENV parser — KEY=VALUE (multi) + legacy KEY VALUE, tagged docker
ok 651 - t2: docker-compose parser — environment map + list forms, tagged docker
ok 652 - t2: k8s manifest parser — container env + ConfigMap data (multi-doc), tagged k8s, never kubectl
ok 653 - t2: unparseable YAML is skipped without throwing
ok 654 - t2: localConfig parser — flat JSON + key=value/key: value lines, tagged localConfig
ok 655 - t2: buildConfigSourceMap — dispatch by filename + total precedence winner per key
# tests 766
# pass 766
# fail 0
# cancelled 0
# skipped 0
```
