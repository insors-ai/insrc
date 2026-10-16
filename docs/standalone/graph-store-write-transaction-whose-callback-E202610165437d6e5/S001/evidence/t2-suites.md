# S001/t2 evidence: src/db suites

commit 2c27aa9c, 2026-10-16T12:33:01Z

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
ok 197 - removeRepo on unknown path is a silent no-op
ok 198 - listRepos on empty registry returns empty array
ok 199 - updateRepoStatus mutates only status / lastIndexed / errorMsg
ok 200 - updateRepoStatus on unknown path is a silent no-op
ok 201 - updateRepoStatus with errorMsg surfaces it on listRepos
ok 202 - all four status values round-trip
ok 203 - lastIndexed sentinel: absent when never indexed, present after first index
ok 204 - lastIndexed survives close + reopen
ok 205 - many repos round-trip without collision (linear-scan correctness)
ok 206 - addRepo updates status without losing addedAt
ok 207 - validateRepoPathShape rejects empty string
ok 208 - validateRepoPathShape rejects non-string input
ok 209 - validateRepoPathShape rejects relative paths
ok 210 - validateRepoPathShape rejects filesystem root + system / volatile dirs
ok 211 - validateRepoPathShape normalises trailing-slash + .. segments
ok 212 - validateRepoPathShape rejects normalised banned root (e.g. `/Users/.`)
ok 213 - validateRepoPath (full) accepts an existing temp directory
ok 214 - validateRepoPath (full) rejects non-existent path
ok 215 - addRepo rejects empty / banned-root paths via shape validation
ok 216 - registry codec: decodeRepoRow keeps lastRun, and a status write without lastRun keeps the stored one
ok 217 - findCallees returns 1-hop CALLS successors
ok 218 - findCallers returns 1-hop CALLS predecessors
ok 219 - findCallees with no outgoing CALLS returns []
ok 220 - findCallers with no incoming CALLS returns []
ok 221 - findCallees on unknown entity returns []
ok 222 - findCallees ignores non-CALLS edges
ok 223 - findDefinedIn returns DEFINES successors
ok 224 - findDefinedIn with mixed kinds only returns DEFINES targets
ok 225 - findImports returns IMPORTS successors
ok 226 - findImports on file with no IMPORTS returns []
ok 227 - resolveClosure includes the root even with no DEPENDS_ON edges
ok 228 - resolveClosure on unknown repo path returns just the path
ok 229 - resolveClosure walks transitive DEPENDS_ON across repos
ok 230 - resolveClosure handles cycles without infinite loop
ok 231 - resolveClosure filters out non-repo reachable entities
ok 232 - insertList creates a list with a seed transfer entry
ok 233 - insertList rejects unknown owner / source
ok 234 - insertList with parentListId validates session match
ok 235 - insertList with missing parent rejects
ok 236 - insertItem creates an item under an existing list
ok 237 - insertItem on missing list rejects
ok 238 - listItems returns items sorted by order
ok 239 - listItems supports fractional ordering for insert-between
ok 240 - insertComment + listCommentsForItem round-trip
ok 241 - listCommentsForItem returns comments sorted by createdAt
ok 242 - updateComment updates body + agentAcknowledged
ok 243 - deleteComment removes the comment
ok 244 - updateItem rejects illegal status transitions
ok 245 - updateItem -> completed sets completedAt
ok 246 - updateItem -> blocked requires non-empty blockedReason
ok 247 - updateList rejects illegal status transitions
ok 248 - transferList changes owner + appends transfer history
ok 249 - reparentList sets the parent
ok 250 - reparentList rejects cycles
ok 251 - assertParentAllowed accepts valid hierarchies
ok 252 - listListsBySession returns roots first then children
ok 253 - listListsBySession filters by includeArchived flag
ok 254 - listAllLists filters by status + source
ok 255 - deleteItem removes the item + its comments
ok 256 - deleteList cascades through items + comments
ok 257 - deleteListsBySession returns the count
ok 258 - lists + items + comments survive close + reopen
ok 259 - repo row round-trip
ok 260 - registry codec: a row with lastRun round-trips; an older row without it decodes with lastRun undefined
ok 261 - repo row round-trip -- shared-modules kind with namespace
ok 262 - entity row round-trip including all flag fields
ok 263 - entity row preserves empty-string sentinel defaults
ok 264 - edge props: empty payload encodes to zero-byte buffer
ok 265 - edge props: CALLS shape round-trips
ok 266 - edge props: READS shape round-trips
ok 267 - edge props: IMPORTS shape round-trips
ok 268 - unresolved row round-trip
ok 269 - plan row round-trip
ok 270 - plan_step row round-trip with sentinel timestamps + dependsOn
ok 271 - session row round-trip with all status / tier values
ok 272 - turn row round-trip with all enum values
ok 273 - todo_list row round-trip
ok 274 - todo_item row round-trip with tags + meta
ok 275 - todo_comment row round-trip
ok 276 - config_entry row round-trip
ok 277 - msgpack encoding is more compact than JSON for typical entity
ok 278 - large body in entity row round-trips correctly
ok 279 - compactGraphStore reclaims space after large deletes
ok 280 - compactGraphStore preserves all rows when nothing has been freed
ok 281 - compactGraphStore cleans up .bak after success
ok 282 - compactGraphStore re-opens the env so subsequent writes go through
ok 283 - compactGraphStore throws when env is not open
ok 284 - compactGraphStore pre-clears stale .compact / .bak from a prior aborted run
ok 285 - entityIdByU64 finds the string id via the reverse index
ok 286 - entityIdsByU64s bulk-resolves O(K) via point lookups
ok 287 - entity_string_by_u64 is removed when an entity is deleted
ok 288 - name_index returns ALL entities sharing (repo, kind, name)
ok 289 - name_index drops only the deleted entity from the dup set
ok 290 - findEntitiesByName respects kind filter via name_index
ok 291 - v1->v2 migration backfills entity_string_by_u64 + name_index
ok 292 - schema_version pre-flight runs the v1->v2 migration on env open
ok 293 - first entity allocation returns 1 (0 reserved as no-ID sentinel)
ok 294 - first repo allocation returns 1
ok 295 - entity allocations are monotonically increasing
ok 296 - repo allocations are monotonically increasing
ok 297 - block allocation reserves contiguous IDs without gaps
ok 298 - block allocation rejects count < 1
ok 299 - counters survive close + reopen
ok 300 - peek does not mutate the counter
ok 301 - in-txn allocator works alongside other writes
ok 302 - in-txn allocator: repo + entity counters are independent
ok 303 - concurrent allocations all return distinct IDs
ok 304 - large block allocation produces correct next value at u64 scale
ok 305 - owner check: default path with no declaration is refused and no file is created
ok 306 - owner check: after the declaration the same open succeeds, also after a close and reopen
ok 307 - owner check: a temporary path opens without a declaration
ok 308 - owner check: the live path as a relative path and through a symbolic link is refused
ok 309 - owner check: only the owner declaration opens the live path; without it, and after it is forgotten, the open is refused
ok 310 - source scan: the reader declaration's name appears nowhere under src/
ok 311 - refusal: process B is refused and never opens the lock file; process A then writes; a child of a declared process is refused
ok 312 - refusal of a third process: beside the owner, a process with no declaration is refused the live graph store and holds no descriptor
ok 313 - detection through the real wrappers: asynchronous write by probe, synchronous write at once
ok 314 - control: the same wrappers on a store that was not broken write and record nothing
ok 315 - store library after another process removed its locks
ok 316 - v2->v3: provisions all 4 reserved shared-modules rows
ok 317 - v2->v3: rewires Java module entity to jvm namespace + recomputes string ID
ok 318 - v2->v3: rewires Python module entity to python namespace (separate from jvm)
ok 319 - v2->v3: drops the phantom workspace row + its entities (cascade)
ok 320 - v2->v3: idempotent on re-run from v3
ok 321 - v2->v3: workspace row with valid path is preserved
ok 322 - production MIGRATIONS registry has the v1->v2 entry
ok 323 - production MIGRATIONS registry has the v2->v3 entry
ok 324 - runMigrations is a no-op when stored == target
ok 325 - runMigrations with empty registry but stored < target throws
ok 326 - runMigrations rejects when stored > target
ok 327 - runMigrations applies a single 1->2 step and advances meta.schema_version
ok 328 - runMigrations chains 1 -> 2 -> 3 in two steps
ok 329 - runMigrations prefers the longest jump that does not overshoot
ok 330 - runMigrations does not overshoot the target
ok 331 - runMigrations leaves intermediate version on disk after a per-step crash
ok 332 - a throwing step leaves neither its rows nor its version write; earlier steps stay committed (ISSUE-5437d6e5)
ok 333 - runMigrations throws MigrationPathError when chain is incomplete
ok 334 - runMigrations re-run from already-current version is a no-op
ok 335 - the two formerly live-store test files pass against a temporary store and create nothing at the default path
ok 336 - the review probe test, found by the same search, creates nothing at the default path either
ok 337 - three daemon request tests, found by the same search, create nothing at the default path
ok 338 - the MCP step and review tests, found by the full audit, create nothing at the default path
ok 339 - the check sees a store that IS opened at the default path
ok 340 - first boot writes schema_version
ok 341 - re-open with matching schema_version proceeds normally
ok 342 - re-open with stored > expected hard-fails with LmdbStoreSchemaVersionMismatch
ok 343 - INSRC_LMDB_MAPSIZE_GIB override is honored
ok 344 - invalid INSRC_LMDB_MAPSIZE_GIB falls back to default
ok 345 - LmdbStoreError classes are exported and constructible
ok 346 - opening a non-LMDB file at the env path surfaces a typed error
ok 347 - SCHEMA_VERSION constant is exported and stable
ok 348 - runReaderCheck returns 0 on a fresh env (no stale slots)
ok 349 - runReaderCheck is a no-op when env is closed
ok 350 - runReaderCheck is safe to call repeatedly
ok 351 - RELATION_KIND_BYTE: no duplicate byte; boundary kinds appended at 13-16
ok 352 - ENTITY_KIND_BYTE: no duplicate byte; externalEndpoint appended at 13
ok 353 - each boundary RelationKind byte round-trips via kindByteToName
ok 354 - frozen sc1 vocabulary: protocol enum + boundary names
ok 355 - externalEndpoint EntityRow round-trips (resolved variant)
ok 356 - externalEndpoint EntityRow round-trips (unresolved variant with rawExpression)
ok 357 - forward-compat: a pre-S001 row (no endpoint fields) decodes unchanged, endpoint fields undefined
ok 358 - graph closure
ok 359 - v3 -> v4 no-op migration advances schema_version leaving rows byte-identical
ok 360 - recordStoreFailureIfLockError: records both read failures once, and nothing else
ok 361 - the named error's message names another process and does not repeat the library's advice
ok 362 - health record: after locks-lost a further store call throws the named error and closeGraphStore skips the library's close
ok 363 - health record: after locks-lost getGraphStore itself rejects with the named error
ok 364 - sync wrapper: code 22 with a succeeding probe read is rethrown and leaves the record ok
ok 365 - slow healthy write: the probe runs and returns, nothing is recorded, the write completes
ok 366 - encodeEntityKey + decode round-trips u64 values including edges
ok 367 - encodeRepoKey + decode round-trips u32
ok 368 - encodeOutEdgeKey produces 17 bytes; round-trips
ok 369 - encodeInEdgeKey produces 17 bytes; round-trips
ok 370 - encodeOutEdgePrefix + prefixSuccessor bracket a single (from,kind) range
ok 371 - encodeOutEdgePrefix without kind brackets all kinds for a (from)
ok 372 - big-endian u64 key ordering matches numeric ordering
ok 373 - composite name_index key includes repo + kind + name
ok 374 - plan_step key range scans return idx-ordered steps
ok 375 - conversation_turn key orders by idx within session
ok 376 - todo_item key respects orderKey lex order
ok 377 - config_by_scope key supports hierarchical prefix scans
ok 378 - relation-kind enum byte mapping is bidirectional
ok 379 - entity-kind enum byte mapping is bidirectional
ok 380 - utf8 segment with null byte is rejected
ok 381 - all 20 sub-DBs open and accept basic put/get
ok 382 - lifecycle close + reopen preserves data
ok 383 - concurrent first-callers share the same init promise
ok 384 - write transaction is atomic
ok 385 - cursor range scan over out_edge prefix returns kind-scoped neighbors
ok 386 - bfs from a single root yields the root + transitive descendants
ok 387 - bfs visits each node exactly once even with cycles
ok 388 - bfs respects maxDepth
ok 389 - bfs respects kindFilter
ok 390 - bfs with direction=in walks reverse edges
ok 391 - bfs visitor pruning skips subtree expansion
ok 392 - bfs from multiple roots merges the closures
ok 393 - bfs deduplicates roots
ok 394 - dfs visits the same nodes as bfs (different order)
ok 395 - dfs handles cycles without infinite loop
ok 396 - dfs respects maxDepth
ok 397 - transitiveClosure returns the BFS-reachable set
ok 398 - transitiveClosure on empty roots returns empty set
ok 399 - scc: isolated nodes are singletons
ok 400 - scc: a 3-node cycle is one component of size 3
ok 401 - scc: cycle + tail reports two components
ok 402 - scc: two disjoint cycles + reachable from a single root via separate edge
ok 403 - scc respects kindFilter
ok 404 - traversal results survive close + reopen
ok 405 - unreachable: every entity outside the closure is yielded
ok 406 - unreachable respects candidateKinds (only those kinds yielded)
ok 407 - unreachable: empty roots yields every entity of the candidate kinds
ok 408 - unreachable: all roots, all reachable -> empty
ok 409 - unreachable: empty candidateKinds is a no-op
ok 410 - unreachable handles cycles in the reachable subgraph
ok 411 - unreachable respects kindFilter on the closure traversal
ok 412 - unreachable respects direction=in (reverse reachability)
ok 413 - unreachable respects maxDepth
ok 414 - a withWriteTxn callback that writes in two sub-DBs and throws rejects with its own error and leaves nothing, in-process and after a reopen
ok 415 - of two callers queued together, one throwing and one succeeding, only the successful one's writes are kept
ok 416 - an async callback is refused with "withWriteTxn callbacks must be synchronous" and keeps nothing; the type rejects it
ok 417 - upsertArtifactVec + queryArtifactVec round-trip
ok 418 - queryArtifactVec scopes by sessionId
ok 419 - queryArtifactVec scopes by intent when provided
ok 420 - getArtifactById returns the row by exact id (no ANN)
ok 421 - deleteArtifactsForSession removes all rows for a session and returns count
ok 422 - upsert: writing the same id replaces
ok 423 - returns [] for empty query / empty session / k=0
ok 424 - deleteArtifactsForSession on empty session returns 0 cleanly
ok 425 - default summary on a freshly-spilled row is empty string
ok 426 - upsertArtifactVec persists explicit summary verbatim
ok 427 - updateArtifactSummary overwrites only the summary column
ok 428 - updateArtifactSummary returns false for unknown id (soft-fail)
ok 429 - updateArtifactSummary refuses empty id + the seed sentinel
ok 430 - listArtifactsForSession returns rows newest-first
ok 431 - listArtifactsForSession scopes by session and excludes seed
ok 432 - listArtifactsForSession honours skillIdPrefix filter
ok 433 - listArtifactsForSession honours afterTimestamp lower bound (exclusive)
ok 434 - listArtifactsForSession returns [] for empty sessionId
ok 435 - listArtifactsForSession defaults summary to empty string for rows without one
ok 436 - queryArtifactVec results carry the summary field
ok 437 - deleteSessionFromLance: empty sessionId is a no-op + zero counts
ok 438 - deleteSessionFromLance: unknown sessionId returns zero counts
ok 439 - deleteSessionFromLance: removes only the targeted session across all 4 tables
ok 440 - deleteSessionFromLance: re-running on the same session is idempotent
ok 441 - deleteSessionFromLance: SQL-injection-safe (apostrophes in sessionId)
ok 442 - compactSessionVecTables: succeeds when tables exist + have tombstones
ok 443 - compactSessionVecTables: succeeds when no tables exist yet
ok 444 - compactSessionVecTables: idempotent (call twice, second is cheap)
ok 445 - writeConfigEmbedding + searchConfigVecs round-trip
ok 446 - searchConfigVecs accepts caller-supplied where filter
ok 447 - searchConfigVecs scope filter via where
ok 448 - searchConfigVecs language=all-or-specific filter
ok 449 - upsert: writing same id replaces
ok 450 - deleteConfigVec / deleteConfigVecsByIds / deleteConfigVecsForScope
ok 451 - returns [] for empty query
ok 452 - seed sentinel is excluded from search results
ok 453 - getLanceConn creates the directory + opens a connection
ok 454 - subsequent getLanceConn calls return the same instance
ok 455 - concurrent first-callers share the init promise
ok 456 - close + reopen works (data persists)
ok 457 - setLanceConnPath isolates between tests (different tmpdirs)
ok 458 - openOrCreateTable creates the table on first call
ok 459 - openOrCreateTable opens an existing table without re-seeding
ok 460 - openOrCreateTable rejects empty seed when creating
ok 461 - writeEntityEmbedding stores a single row
ok 462 - writeEntityEmbedding upsert: same id replaces row
ok 463 - writeEntityEmbeddings bulk upsert
ok 464 - writeEntityEmbeddings on empty array is a no-op
ok 465 - searchEntityVecs returns ANN hits ordered by distance
ok 466 - searchEntityVecs respects closure-repo scope
ok 467 - searchEntityVecs filter=code excludes artifacts
ok 468 - searchEntityVecs filter=artifact returns only artifacts
ok 469 - searchEntityVecs returns [] for empty query vector
ok 470 - searchEntityVecs returns [] for empty closureRepos
ok 471 - searchEntityVecs excludes the seed sentinel row
ok 472 - the vector search given an empty list of ids makes no query; given a large list it returns the nearest of them, in one query or in batches merged by distance; with no area the query is as before
ok 473 - deleteEntityVec removes a single row
ok 474 - deleteEntityVecsByIds bulk drop
ok 475 - deleteEntityVecsForRepo removes all rows for a repo
ok 476 - delete on empty input is a silent no-op
ok 477 - strings with single quotes are escaped in delete + search
ok 478 - rows survive close + reopen
ok 479 - compactEntityVecTable reduces on-disk fragment count
ok 480 - compactEntityVecTable preserves all rows + searchability
ok 481 - compactEntityVecTable on a fresh / single-fragment table is a cheap no-op
ok 482 - compactEntityVecTable result survives close + reopen
ok 483 - vector store owner rule: no declaration other than the owner's exists, and without it the live vector store is refused
ok 484 - vector store owner rule: live path refused with no declaration and nothing created; opens after declareLiveStoreOwner; a temporary path opens; relative path and symbolic link refused
ok 485 - no test opens the live vector store: each repaired test file run in a temporary home leaves no lance directory
ok 486 - the check sees a vector store that IS opened at the default path
ok 487 - upsertResponseSegmentVec + queryResponseSegmentVec round-trip
ok 488 - queryResponseSegmentVec scopes hits to a single session
ok 489 - queryResponseSegmentVec respects the k limit
ok 490 - queryResponseSegmentVec returns [] for empty query vector or empty sessionId
ok 491 - upsert is idempotent on the same id (mergeInsert overwrite)
ok 492 - deleteResponseSegmentsForSession removes all rows for a session and returns the count
ok 493 - deleteResponseSegmentsForSession on an empty session returns 0
ok 494 - deleteResponseSegmentsForTurn removes only the rows for that turn
ok 495 - seed row never appears in query results
ok 496 - writeSessionEmbedding + searchSessionVecs round-trip
ok 497 - searchSessionVecs scopes by repo
ok 498 - searchSessionVecs with notExpired drops expired sessions
ok 499 - upsert: writing the same id replaces
ok 500 - deleteSessionVec / deleteSessionVecsByIds / deleteSessionVecsForRepo
ok 501 - returns [] for empty query / empty repo
ok 502 - writeTurnEmbedding + searchTurnVecs round-trip
ok 503 - searchTurnVecs default type filter excludes summary
ok 504 - searchTurnVecs with explicit types
ok 505 - deleteTurnVec / deleteTurnVecsBySessionId / deleteTurnVecsForRepo
ok 506 - writeBullet + searchBullets: single-row round-trip
ok 507 - writeBullets: batched insert + ANN returns multiple hits ordered by distance
ok 508 - searchBullets: filters by runId -- other runs are excluded
ok 509 - searchBullets: empty runId -> [] (early return)
ok 510 - searchBullets: empty queryVec -> [] (early return)
ok 511 - deleteBulletsForRun: drops every row for the run
ok 512 - deleteBulletsForRun: empty runId -> no-op (no throw)
ok 513 - deleteBulletsForTodo: drops just the matching TODO's rows
ok 514 - escapeLanceString: doubles single quotes
ok 515 - searchBullets: runId containing a single quote does not corrupt the filter
ok 516 - writeBullets: writing the same id twice updates the row in place
# tests 518
# pass 518
# fail 0
# cancelled 0
# skipped 0
```
