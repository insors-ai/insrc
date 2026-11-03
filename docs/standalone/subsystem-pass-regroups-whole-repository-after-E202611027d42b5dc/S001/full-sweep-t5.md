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

### Failures caused by this Story -- fixed after the sweep

- **module-state inventory: every module-scope mutable value the session worker can load is classified** (src/daemon/threads/__tests__/module-state-inventory.test.ts): the new src/db/subsystem-changes.ts#GROUPING_KIND_BYTES was unclassified. Classified per-thread in e2ecc4b9f; the guard passes (6/6).
- **Complete namespace inventory opens fresh and existing stores without data loss** (src/understanding/__tests__/storage.test.ts): counts the store's sub-databases; the two new tables move it 39 -> 41. Updated in c53f2db0e; passes.

### Not caused by this Story

Compared with the sweeps of ISSUE-0f3376a0 (e68162aa7), ISSUE-ad68 (836dfa40e) and ISSUE-ca9883ca (af6e3161e): every other failure also failed there, except:

- **CM-S5-GATE: default runtime policy preserves authorization and independent release-audit evidence** (shared): the connection-management Stories of another session (src/shared/connection-manager, recent commits bf5b6728a, b0411102b). Not in this Story's files.
- **tui-models.test.ts: Model Tiers pane ...** (cli), **ISSUE-e940023a: a material of 3000 atoms ... well under the time the old code took** and **a 1,000-record store forming 500 work items is served within 500 ms** (workflow): timing/load flakes -- each passes run alone (13/13, 11/11, 7/7).
- The rest (daemon search/entity request tests whose test daemon waits on a macOS Keychain prompt, CM-S2/S3/S4/S5 connection-management tests, the session-source inventory guard, the MCP import-graph and present-steering tests) failed in the earlier sweeps too; see docs/standalone/sql-references-miss-across-2-3-E202611020f3376a0/S001/full-sweep-t5.md for their classification. The session-source inventory guard's unclassified list gains this Story's two new modules (subsystem-changes.ts, subsystem-scheduler.ts) beside ~20 files of other work; the pinned files this Story edits were refreshed.
