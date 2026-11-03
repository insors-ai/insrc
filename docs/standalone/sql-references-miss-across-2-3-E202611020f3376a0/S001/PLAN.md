<!-- insrc:artifact PLAN-0f3376a086e3601c-S001 -->

# Plan: E202611030f3376a0:S001

## Summary

**Epic:** `sql-references-miss-across-2-3`
**LLD run:** `wf-1793697841311-bsjwgf`
**LLD effective hash:** `952fdaafbdea...`

Building this fix means adding one SQL name rule and using it everywhere names are compared: first the reader (stored names keep meaningful quoting; same-file and CTE matching by key), then the resolver's suffix matching and the store's re-pend rules, then a settle that retries only what its files can affect and consumes the re-pend marker, then the settle's re-check of same-named inferred edges, and finally a check on the installed daemon and the full sweep.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** SQL name key and the reader | M | — | unit: S001 t1: the SQL name key folds bare and backtick segments, keeps double-quoted ones exact, and never collides; unit: S001 t1: the reader keeps meaningful quoting in stored names, matches same-file references and CTEs by key, and keeps written names in rawTo and referencesIn; unit: S001 t1: names the grammar cannot read give the same entities and references as before | [[c1]] [[c2]] [[c5]] |
| 2 | **`t2`** Resolver suffix matching and the store's re-pend rules | M | `t1` | integration: S001 t2: qualified names meet by segment suffix and quoted names resolve to their own definitions; integration: S001 t2: a removed definition's references return to pending by folded-or-key match, never for a locally defined name, and carry the marker | [[c2]] [[c3]] [[c4]] |
| 3 | **`t3`** Targeted settle selection and the marker's lifecycle | M | `t2` | integration: S001 t3: a settle selects only the pending SQL rows the saved files can affect; integration: S001 t3: the re-pend marker is consumed by the next settle, so an unrelated later save does not retry the row | [[c3]] [[c6]] |
| 4 | **`t4`** Settle re-check of same-named inferred edges | M | `t3` | integration: S001 t4: a saved definition re-checks same-named inferred edges, including quote-only and segment-boundary edits; integration: S001 t4: upgrade, legacy-collision and mixed-ownership cases resolve correctly | [[c3]] [[c4]] [[c6]] |
| 5 | **`t5`** Installed-daemon smoke and the full sweep | S | `t1`, `t2`, `t3`, `t4` | smoke: S001 t5: the installed daemon resolves qualified and quoted SQL references and re-checks an inferred edge on a new definition | [[c5]] [[c7]] |

### 1.1 E202611030f3376a0:S001:T001 — SQL name key and the reader

Add the shared SQL name helper (segments from the grammar's identifiers; double-quoted exact, backtick and bare folded; collision-free JSON key; folded last segment). In src/indexer/parser/sql.ts the stored name writes each double-quoted segment whose quoting matters in double quotes; same-file references and CTE names match by key; rawTo and referencesIn keep names as written. Update the three sql.test.ts assertions that encoded the old conflation, add positive and negative quoting and collision cases, and pin the grammar limits with real-parser tests.

**Acceptance checks:**
- The key folds bare and backtick segments, keeps double-quoted segments exact, and ["a.b"] differs from ["a","b"]
- Users and "Users", a.b and "a.b", in one file are distinct entities with distinct ids, each reference linked to its own; ids of names whose quoting does not matter are unchanged
- A view's CTE and same-file references match by key; pending rawTo and referencesIn keep quotes
- [Sales.Q1], "a""b" and `a.b` give the same entities and references as before

### 1.2 E202611030f3376a0:S001:T002 — Resolver suffix matching and the store's re-pend rules

Replace sqlByName/sqlByLastSegment with one index by folded last segment; sqlCandidates filters by the segment-suffix rule (a longer reference needs a qualified definition) using keys read from stored names; resolveSqlReference unchanged. sqlByNameRows keeps a holder's name when it meets the removed target by key OR by folded text, skips names the holder's own file defines, and marks every row it writes. Integration tests for L4 and L3 resolution and for removal.

**Acceptance checks:**
- db.app.users and app.users meet both ways; audit.users does not meet a bare users; users with two qualified definitions stays ambiguous
- "Users" and users resolve to their own definitions
- A removed definition's references return to pending through the folded-or-key match, never for a name the holder's file defines, and carry the marker
- A stored definition with an unquoted name (as every definition was before the change) meets references by its folded key, as today

### 1.3 E202611030f3376a0:S001:T003 — Targeted settle selection and the marker's lifecycle

sqlReferencesAwaitingCommitted selects only pending SQL rows whose folded last segment matches a definition in a committed file, ambiguous rows whose candidates include an entity no longer stored, and marked rows; after the settle's resolution pass the marker is cleared on every selected marked row whatever the outcome (a meta-delete beside updateUnresolvedMetaBatch). Integration tests observe the selected rows directly and run a two-settle sequence.

**Acceptance checks:**
- A settle selects exactly the rows matching the saved files' names, ambiguous rows with a removed candidate, and marked rows; an unrelated pending row is not selected
- A marked row is selected by the next settle and its marker cleared whether it resolves or not; an unrelated later save does not select it

### 1.4 E202611030f3376a0:S001:T004 — Settle re-check of same-named inferred edges

Before the settle's resolution pass, for each table/view defined in a committed file, return to pending by name (sqlByNameRows rules, marked) the inbound inferred REFERENCES edges of every stored table/view with the same folded last segment, the committed definitions included, whose holder is outside the committed files; they are re-attempted in the same settle. Integration tests for a new candidate, a different name, a quote-only edit, a segment-boundary edit, the upgrade path, the legacy collision and mixed ownership.

**Acceptance checks:**
- An inferred edge becomes ambiguous when a saved file adds a same-named definition; a different name leaves it
- Quote-only and segment-boundary edits return another file's inferred edge to pending
- Upgrade and legacy-collision: re-reading only the definition file leaves the external reference linked to the right entity
- Mixed ownership: no pending row for a name the holder's file resolves locally

### 1.5 E202611030f3376a0:S001:T005 — Installed-daemon smoke and the full sweep

After the push, update and restart the installed daemon; a small SQL repository shows resolved qualified and quoted references and an inferred edge turning ambiguous after a settle that adds a same-named definition. Record as evidence, then run the full sweep per directory.

**Acceptance checks:**
- Smoke evidence file on the installed daemon
- Full sweep recorded with every failure classified

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| the SQL name key helper | `t1` |
| SqlParser.parse and SqlParser.referencesIn | `t1` |
| SQL reference resolution in full and settle modes | `t2`, `t3`, `t4`, `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 dataModelChanges SQL name key`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails.api SqlParser.parse / referencesIn`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails.api sqlCandidates / sqlReferencesAwaitingCommitted`
- **[[c4]]** `prior-artifact` `LLD S001 contractDetails.api sqlByNameRows`
- **[[c5]]** `prior-artifact` `LLD S001 testStrategy`
- **[[c6]]** `prior-artifact` `LLD S001 dataModelChanges re-pend marker and settle re-check`
- **[[c7]]** `prior-artifact` `LLD S001 migration`
