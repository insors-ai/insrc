<!-- insrc:artifact PLAN-c2ba6fa62a148ed1-s7 -->

# Plan: E20261101c2ba6fa6:S007

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**LLD run:** `wf-1793558505905-jvv7zr`
**LLD effective hash:** `85da4a2df479...`

Building s7 means giving the relationship row's empty value a meaning: a codec for one evidence byte, the two edge writers and the pending rows carrying it, every place that decides a relationship stamping it ('extracted' in the file's own resolution and the manifest step, 'inferred' in the cross-file and endpoint passes), and the reads that return relationships handing it back, up to the daemon's requests and the analyzer's caller, inheritance and import lookups. No stored form or schema version changes; rows written before read 'unknown'.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the five evidence values, RelationRead, Relation.evidence and the byte codec | S | — | unit: evidence codec round-trip and unknown decoding | [[c1]] [[c9]] |
| 2 | **`t2`** Write the evidence byte at both edge writers and carry it through pending | M | `t1` | integration: upsertResolvedRelationsInTxn evidence on both rows; integration: promoteResolvedBatch evidence and carried meta.evidence; integration: returnEdgeToPendingInTxn keeps evidence | [[c2]] [[c3]] [[c9]] |
| 3 | **`t3`** Stamp 'extracted' at the per-file decisions and carry it through the file commit | S | `t2` | integration: resolveRelations evidence 'extracted' through the file commit; integration: manifest DEPENDS_ON evidence | [[c4]] [[c3]] |
| 4 | **`t4`** Stamp 'inferred' in the cross-file and endpoint passes; Pass 0 keeps the carried value | M | `t2` | integration: cross-file passes evidence 'inferred'; Pass 0 keeps the carried value; integration: ambiguous call stays pending; no 'chosen' | [[c5]] [[c3]] |
| 5 | **`t5`** Return evidence from the single-kind reads and the opt-in neighbour form | M | `t1`, `t2` | integration: findCallers/findCallees evidence; integration: pre-change store reads 'unknown'; integration: outNeighbors withEvidence | [[c6]] [[c11]] |
| 6 | **`t6`** Carry evidence through the daemon's caller/callee requests and the graph tools | S | `t5` | integration: search.callers / search.callees / search.callers_nhop evidence; integration: graph tools evidence | [[c7]] [[c11]] |
| 7 | **`t7`** Mark evidence in the analyzer's caller, inheritance and import lookups | M | `t5` | integration: usage.example evidence and counts; integration: class-hierarchy and import-graph evidence | [[c8]] |
| 8 | **`t8`** Ship and smoke on the installed daemon | S | `t3`, `t4`, `t6`, `t7` | smoke: installed daemon: evidence after re-index; untouched relationship 'unknown' | [[c10]] [[c11]] |

### 1.1 E20261101c2ba6fa6:S007:T001 — Add the five evidence values, RelationRead, Relation.evidence and the byte codec

RelationEvidence widens to 'unknown' | 'extracted' | 'inferred' | 'chosen' | 'model' and RelationRead is exported (src/shared/types.ts); the writers' Relation gains an optional evidence; src/db/graph/codec.ts gets the encoding (empty/0x00 unknown, 0x01-0x04) and decoding (empty, 0x00 and any unrecognised byte read 'unknown'); an evidence string with no byte encodes empty and is reported so the caller can log it.

**Acceptance checks:**
- the five values and RelationRead are exported and typecheck
- every value round-trips through the codec; empty, 0x00 and 0xFF decode to 'unknown'
- an invalid string encodes to the empty value

### 1.2 E20261101c2ba6fa6:S007:T002 — Write the evidence byte at both edge writers and carry it through pending

upsertResolvedRelationsInTxn writes the relation's byte to both out_edge and in_edge; promoteResolvedBatch takes items[].evidence, else the pending row's meta.evidence, else empty, and promoteToResolved passes it through; a relationship kept awaiting stores its evidence in the row's meta.evidence; returnEdgeToPendingInTxn decodes the edge's byte into the awaiting row it writes; an invalid evidence value is stored empty and logged at warn, never refused.

**Acceptance checks:**
- both rows of every written edge hold the same byte
- a resolved relationship kept awaiting carries meta.evidence and its later promotion without an explicit evidence stores that value
- an edge returned to pending and promoted again keeps its evidence
- an invalid evidence value stores the edge with an empty value and a warn log; the relationship is not refused
- rewriting an existing edge with a different evidence leaves the new byte on both rows

### 1.3 E20261101c2ba6fa6:S007:T003 — Stamp 'extracted' at the per-file decisions and carry it through the file commit

resolveRelations marks every relation it returns resolved (parser-resolved, same-file CALLS, relative IMPORTS to a file) 'extracted'; the manifest step's DEPENDS_ON is written 'extracted'; writeOfRelation sets RelationWrite.evidence from the relation and relationOfWrite carries it to the commit's writers instead of dropping it.

**Acceptance checks:**
- a same-file call indexed through the file commit is stored 'extracted'
- a relative import awaiting its not-yet-stored file is stored 'extracted' when the file arrives (Pass 0)
- the repository's DEPENDS_ON edges are 'extracted'
- no relation resolveRelations returns as resolved lacks evidence

### 1.4 E20261101c2ba6fa6:S007:T004 — Stamp 'inferred' in the cross-file and endpoint passes; Pass 0 keeps the carried value

Pass 1 (IMPORTS rewire), Pass 1b (re-exports) and Pass 2 (name resolution) pass 'inferred'; both endpoint passes pass 'inferred'; Pass 0 passes none so the row's carried evidence is stored; an ambiguous call stays pending with its candidates and no edge.

**Acceptance checks:**
- a call resolved across files is stored 'inferred' (ac1)
- a call matching several candidates stays pending classed 'ambiguous' with its candidates and no edge; no stored edge decodes to 'chosen' (ac2)
- external-service and messaging edges are 'inferred'
- Pass 0 restores an awaiting row with its carried evidence, not 'inferred'

### 1.5 E20261101c2ba6fa6:S007:T005 — Return evidence from the single-kind reads and the opt-in neighbour form

neighborEntities reads each edge row's value, so findCallers/findCallees/findDefinedIn/findImports return each entity with its relationship's evidence; outNeighbors/inNeighbors gain the withEvidence form returning one row per stored relationship with kind and evidence; the id-only form and every traversal are unchanged.

**Acceptance checks:**
- findCallers/findCallees return evidence per entity
- edges written with an empty value (a pre-change store) read 'unknown' with no migration and SCHEMA_VERSION unchanged (ac3)
- outNeighbors({ withEvidence: true }) returns one row per relationship across kinds; the id-only form still dedupes
- bfs/transitiveClosure results are unchanged
- existing tests of these reads pass, updated only where they compare the whole entity; the inventory pins of the edited files are refreshed

### 1.6 E20261101c2ba6fa6:S007:T006 — Carry evidence through the daemon's caller/callee requests and the graph tools

search.callers, search.callees and each hop of search.callers_nhop return entities with their evidence field; the graph_callers/graph_callees tools include evidence in each short entity; no field is removed or renamed.

**Acceptance checks:**
- search.callers returns each caller with evidence
- search.callers_nhop's callers carry evidence at every hop
- graph tool results include evidence
- existing response fields are unchanged
- proved with in-process handler tests, not the seeded-daemon tests; the inventory pins are refreshed

### 1.7 E20261101c2ba6fa6:S007:T007 — Mark evidence in the analyzer's caller, inheritance and import lookups

usage.example's hits carry their relationship's evidence and its result states how many listed callers are inferred or chosen and how many of unknown origin; class-hierarchy and import-graph read through the withEvidence neighbour form and carry evidence on each parent/child and importer/importee.

**Acceptance checks:**
- a usage.example over extracted, inferred and unknown callers lists each with its evidence and states the counts (ac4)
- an all-unknown result says the origin is unknown instead of implying it was read from the source
- class-hierarchy and import-graph items carry evidence

### 1.8 E20261101c2ba6fa6:S007:T008 — Ship and smoke on the installed daemon

Full sweep once, update the installed daemon, and on this repository check that after a file is re-indexed its callers through search.callers carry 'extracted' (same file) and 'inferred' (across files), and that a relationship not rewritten since the update reads 'unknown'.

**Acceptance checks:**
- full sweep shows no failure caused by this Story
- on the installed daemon: a re-indexed file's same-file and cross-file callers read 'extracted' and 'inferred'; an untouched relationship reads 'unknown' (recorded)

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| evidence codec in src/db/graph/codec.ts | `t1` |
| upsertResolvedRelationsInTxn | `t2` |
| promoteResolvedBatch | `t2`, `t4` |
| returnEdgeToPendingInTxn | `t2` |
| findCallers | `t5` |
| findCallees | `t5` |
| outNeighbors withEvidence | `t5`, `t7` |
| resolveRelations | `t3` |
| cross-file Pass 0/1/1b/2 | `t4` |
| manifest DEPENDS_ON | `t3` |
| findCallers on a pre-change store | `t5` |
| search.callers | `t6` |
| search.callees | `t6` |
| search.callers_nhop | `t6` |
| usage.example | `t7` |
| class-hierarchy | `t7` |
| import-graph | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s7 contract: RelationEvidence (five values), RelationRead, Relation.evidence and the edge-row byte encoding (dataModel: out_edge/in_edge row value)`
- **[[c2]]** `prior-artifact` `LLD s7 contract: upsertResolvedRelationsInTxn, promoteResolvedBatch and promoteToResolved write the evidence byte`
- **[[c3]]** `prior-artifact` `LLD s7 dataModel: UnresolvedRow.meta.evidence and returnEdgeToPendingInTxn carry evidence through pending`
- **[[c4]]** `prior-artifact` `LLD s7 contract: resolveRelations, the manifest step, writeOfRelation and relationOfWrite ('extracted')`
- **[[c5]]** `prior-artifact` `LLD s7 interaction sc3: cross-file Pass 1/1b/2 and both endpoint passes write 'inferred'; Pass 0 the carried value; 'chosen' never written`
- **[[c6]]** `prior-artifact` `LLD s7 contract: findCallers/findCallees (and findDefinedIn/findImports) return evidence; outNeighbors/inNeighbors withEvidence`
- **[[c7]]** `prior-artifact` `LLD s7 contract: search.callers / search.callees / search.callers_nhop and the graph tools gain the evidence field`
- **[[c8]]** `prior-artifact` `LLD s7 dataModel: usage.example / class-hierarchy / import-graph exploration results carry evidence and counts`
- **[[c9]]** `prior-artifact` `LLD s7 errorPaths: undefined byte decodes 'unknown'; invalid string stored empty and logged, never refused (resolved q93e30dab)`
- **[[c10]]** `prior-artifact` `LLD s7 testStrategy (acceptanceMapping ac1-ac4)`
- **[[c11]]** `prior-artifact` `LLD s7 migration: no data step, SCHEMA_VERSION unchanged, additive response field (backwardCompat); walks stay id-only (resolved q7d661945, user 2026-11-02)`
