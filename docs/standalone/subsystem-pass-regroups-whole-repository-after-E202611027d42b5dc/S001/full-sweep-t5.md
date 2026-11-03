## Full sweep (ISSUE-7d42b5dc S001 t5), 2026-11-03

Per-directory sweep (`npx tsx --test --test-force-exit "src/<dir>/**/__tests__/*.test.ts"`, Node 22, alarm 1800 s each) at 6e2e84f8b (t1-t4 built):

```
head 6e2e84f8b docs(workflow): ISSUE-7d42b5dc S001 t4 build gate passed
__tests__ rc=0 tests=1 pass=1 fail=0 secs=2
agent rc=0 tests=154 pass=140 fail=0 secs=40
analyze rc=0 tests=1256 pass=1160 fail=0 secs=29
artifact-theme rc=0 tests=23 pass=23 fail=0 secs=2
cli rc=1 tests=229 pass=228 fail=1 secs=10
config rc=0 tests=157 pass=157 fail=0 secs=5
daemon rc=1 tests=1868 pass=1830 fail=19 secs=244
db rc=0 tests=661 pass=661 fail=0 secs=87
design rc=0 tests=58 pass=58 fail=0 secs=3
docgen rc=0 tests=118 pass=115 fail=0 secs=2
indexer rc=0 tests=465 pass=465 fail=0 secs=397
mcp rc=1 tests=127 pass=125 fail=2 secs=17
shared rc=1 tests=126 pass=113 fail=13 secs=350
understanding rc=1 tests=17 pass=16 fail=1 secs=4
workflow rc=1 tests=2120 pass=2112 fail=2 secs=68
DONE
```

Totals: 7380 tests, 38 failures (indexer 465/465, db 661/661).

### Every failed case

All 38, each with whether it also failed in an earlier sweep (ISSUE-0f3376a0, ISSUE-ad68, ISSUE-ca9883ca) and its classification:

| Directory | Test | Failed in an earlier sweep | Classification |
|---|---|---|---|
| cli | tui-models.test.ts: Model Tiers pane cycles the fake answer's families, models and efforts and writes whole tiers; unserved model has no effort edit;  | no | timing/load flake: passes run alone (13/13, 11/11, 7/7) |
| daemon | /Users/subhagho/work/projects/insors/insrc/src/daemon/__tests__/doc-summary-restore-ipc.test.ts | yes | test daemon (temporary HOME) does not start: connection-management boot waits on a macOS Keychain prompt |
| daemon | CM-S3-DRIVER-LOGS: owner context is immutable lazy quiet and remains quiet after authority expiry | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| daemon | CM-S3-GATE: stale/missing/mixed source+compiled evidence fails closed and release stays disabled | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| daemon | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| daemon | CM-S4-GATE: reviewed removal sources include pure helpers owner boundaries and pending global affinity | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| daemon | CM-S4-SOURCE: real PostgreSQL and Redis survive both-scope removal failed close retry and same-ID recreation | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| daemon | DuckDBFileDriver -- pool path-escape guard | yes | store/pool path guard of another area; failed in earlier sweeps |
| daemon | SIGTERM during an indexing pass: workers stop, the queue drains, the main thread closes the stores after the workers exit, 'bye' is logged | yes | load flake (threads-boot; also flakes at the pre-change commit, see ISSUE-0f3376a0 full-sweep-t5.md); passed in this Story's related-suite runs |
| daemon | docSummary.restoreFromBackup restores over IPC and rejects a relative path, a missing file and the live store path | yes | test daemon (temporary HOME) does not start: connection-management boot waits on a macOS Keychain prompt |
| daemon | entity.closure / entity.unreachable with a root in a repository under index are refused | yes | test daemon (temporary HOME) does not start: connection-management boot waits on a macOS Keychain prompt |
| daemon | entity.closure, entity.unreachable, search.closure, repo.depends_on and repo.search_cross_repo from a ready repository whose closure reaches a reposit | yes | test daemon (temporary HOME) does not start: connection-management boot waits on a macOS Keychain prompt |
| daemon | file tools: each tool's own execute refuses the store file and its lock file, by direct path and through a symbolic link | yes | store/pool path guard of another area; failed in earlier sweeps |
| daemon | module-state inventory: every module-scope mutable value the session worker can load is classified (full guard over the repo) | no | CAUSED by this Story: GROUPING_KIND_BYTES unclassified -- fixed in e2ecc4b9f (guard passes 6/6) |
| daemon | repo.list, repo.stats and daemon.status carry completeness beside the unchanged status: a complete repository reads complete, one whose full index is  | yes | test daemon (temporary HOME) does not start: connection-management boot waits on a macOS Keychain prompt |
| daemon | search guard: a registry read that throws skips the guard and the request is answered as today | yes | test daemon (temporary HOME) does not start: connection-management boot waits on a macOS Keychain prompt |
| daemon | search request contract: each guarded search request accepts its existing params and answers | yes | test daemon (temporary HOME) does not start: connection-management boot waits on a macOS Keychain prompt |
| daemon | search requests: search.callers / search.callees / search.by_file / search.closure / entity.summary / repo.depends_on / locate.inferParents about a re | yes | test daemon (temporary HOME) does not start: connection-management boot waits on a macOS Keychain prompt |
| daemon | search.callers across repositories leaves out the entities of a repository under index | yes | test daemon (temporary HOME) does not start: connection-management boot waits on a macOS Keychain prompt |
| daemon | search.query while one repository is being indexed returns rows from the other repositories only | yes | test daemon (temporary HOME) does not start: connection-management boot waits on a macOS Keychain prompt |
| mcp | import graph (ac4): the MCP server reaches nothing under src/db, src/analyze or src/daemon/steps; a fixture import makes it fail | yes | edges into src/analyze connection files from another session |
| mcp | the steering block, the steering template and the guide tell the controller to call insrc_present before it asks for approval | yes | commit 84fca26a7 of another session rewrote the steering text the test expects |
| shared | CM-S5-COMPAT: both clients old/missing/malformed capability refusal, no legacy mutation fallback and unchanged legacy projections | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| shared | CM-S5-ENTRY-KT: native Settings and AnAction actual Project selection, chooser cancel/no-project and global Apply/reset independence | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| shared | CM-S5-FORM-KT: Kotlin descriptor/credential serialization and dirty navigation parity without Settings persistence | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| shared | CM-S5-GATE: default runtime policy preserves authorization and independent release-audit evidence | no | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| shared | CM-S5-OUTCOME-KT: project-memory unknown-operation retention and scope-lane recovery with no repeated create | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| shared | CM-S5-OWNER-KT: actual PROJECT Disposable owner independent from APP gateway and manager views | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| shared | CM-S5-REMOVE-KT: S004 snapshots plus actual Kotlin effect paths preserve old-generation cleanup and source-data guarantee | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| shared | CM-S5-RENDER-KT: native Swing manager event wiring, EDT/disposal guards, labels/password controls and immediate-action separation | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| shared | CM-S5-STATE-KT: Kotlin sc7 model matches common state/effect transcripts without platform I/O | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| shared | CM-S5-SYNC-FIXTURES: JUnit reads the identical packaged corpus and rejects digest/version drift | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| shared | CM-S5-TEST-KT: Kotlin test identity/cancel parity, disposed-view and EDT delivery guards | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| shared | CM-S5-TRANSPORT-KT: actual Kotlin socket UTF8 framing, partial writes, multiplexing, bounded limits, disposal and one-shot compatibility | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| shared | CM-S5-WINDOW: two real project owners, same roots/IDs, overlapping RPC IDs and isolated replies/disposal | yes | connection-management work of another session (src/shared/connection-manager, Kotlin/JUnit/Oracle/PostgreSQL environment) |
| understanding | Complete namespace inventory opens fresh and existing stores without data loss | no | CAUSED by this Story: two new store tables (39 -> 41) -- fixed in c53f2db0e (passes) |
| workflow | ISSUE-e940023a: a material of 3000 atoms is built and every atom summarised in well under the time the old code took | no | timing/load flake: passes run alone (13/13, 11/11, 7/7) |
| workflow | a 1,000-record store forming 500 work items is served within 500 ms | no | timing/load flake: passes run alone (13/13, 11/11, 7/7) |

### Failures caused by this Story -- fixed after the sweep

- **module-state inventory: every module-scope mutable value the session worker can load is classified** (src/daemon/threads/__tests__/module-state-inventory.test.ts): the new src/db/subsystem-changes.ts#GROUPING_KIND_BYTES was unclassified. Classified per-thread in e2ecc4b9f; the guard passes (6/6).
- **Complete namespace inventory opens fresh and existing stores without data loss** (src/understanding/__tests__/storage.test.ts): counts the store's sub-databases; the two new tables move it 39 -> 41. Updated in c53f2db0e; passes.

### Not caused by this Story

Compared with the sweeps of ISSUE-0f3376a0 (e68162aa7), ISSUE-ad68 (836dfa40e) and ISSUE-ca9883ca (af6e3161e): every other failure also failed there, except:

- **CM-S5-GATE: default runtime policy preserves authorization and independent release-audit evidence** (shared): the connection-management Stories of another session (src/shared/connection-manager, recent commits bf5b6728a, b0411102b). Not in this Story's files.
- **tui-models.test.ts: Model Tiers pane ...** (cli), **ISSUE-e940023a: a material of 3000 atoms ... well under the time the old code took** and **a 1,000-record store forming 500 work items is served within 500 ms** (workflow): timing/load flakes -- each passes run alone (13/13, 11/11, 7/7).
- The rest (daemon search/entity request tests whose test daemon waits on a macOS Keychain prompt, CM-S2/S3/S4/S5 connection-management tests, the session-source inventory guard, the MCP import-graph and present-steering tests) failed in the earlier sweeps too; see docs/standalone/sql-references-miss-across-2-3-E202611020f3376a0/S001/full-sweep-t5.md for their classification. Session-source inventory: this Story's subsystem files are now classified (src/db/subsystem-changes.ts and src/db/subsystems.ts as persistent-storage-boundary, src/indexer/subsystem-pass.ts and src/indexer/subsystem-scheduler.ts as background-indexing) and the pinned files it edits were refreshed; the guard still fails on files of other work (connection-manager, parsers, ollama-target).
