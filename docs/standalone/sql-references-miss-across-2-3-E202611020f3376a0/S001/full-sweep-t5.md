## Full sweep (ISSUE-0f3376a0 S001 t5), 2026-11-03

Per-directory sweep (`npx tsx --test --test-force-exit "src/<dir>/**/__tests__/*.test.ts"`, Node 22, alarm 1800 s each):

```
head e68162aa7 docs(workflow): ISSUE-0f3376a0 S001 t2-t4 build gates passed
__tests__ rc=0 tests=1 pass=1 fail=0 secs=1
agent rc=0 tests=154 pass=140 fail=0 secs=41
analyze rc=0 tests=1254 pass=1158 fail=0 secs=33
artifact-theme rc=0 tests=23 pass=23 fail=0 secs=1
cli rc=0 tests=229 pass=229 fail=0 secs=10
config rc=0 tests=157 pass=157 fail=0 secs=6
daemon rc=1 tests=1839 pass=1802 fail=18 secs=623
db rc=0 tests=658 pass=658 fail=0 secs=90
design rc=0 tests=58 pass=58 fail=0 secs=5
docgen rc=0 tests=118 pass=115 fail=0 secs=1
indexer rc=0 tests=451 pass=451 fail=0 secs=330
mcp rc=1 tests=127 pass=125 fail=2 secs=19
shared rc=1 tests=126 pass=111 fail=15 secs=496
understanding rc=0 tests=17 pass=17 fail=0 secs=3
workflow rc=0 tests=2134 pass=2128 fail=0 secs=51
DONE
```

Totals: 7346 tests, 35 failures, all in daemon / mcp / shared. None is in indexer, db or any SQL suite (indexer 451/451, db 658/658).

### Failure classification

Compared with the sweeps of ISSUE-ad68 (836dfa40e) and ISSUE-ca9883ca (af6e3161e), failures present there too are pre-existing. The rest:

- **SIGTERM during an indexing pass** (src/daemon/threads/__tests__/threads-boot.test.ts): load flake. It indexes .ts files only, and every SQL settle change returns early without a committed .sql file. Re-run: HEAD passed 3 of 4 runs; the pre-change commit 49b1d78f1 (a separate worktree) also failed a test of the same file once in 5 runs. Load average 5-9 during the runs.
- **the steering block ... tell the controller to call insrc_present** (src/mcp/__tests__/present-steering.test.ts): from commit 84fca26a7 (another session's steering rewrite; the expected phrase 'steering-only for now' is gone). Not in this Story's files.
- **CM-S2-A4 Oracle, CM-S5-* Kotlin/JUnit parity, CM-S5-PRIVACY** : connection-management Stories of another session (Kotlin/JUnit/Oracle environment). Not in this Story's files.
- **search.* / entity.* request tests** (search-filter, search-request-contract), already failing in the earlier sweeps: the test daemon (temporary HOME) does not start because connection-management boot opens a macOS Keychain prompt (SecurityAgent observed during the run) and waits for it.
- **import graph (ac4)** (pre-existing in the earlier sweeps): edges into src/analyze connection files from another session's work.
