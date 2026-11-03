<!-- insrc:artifact LLD-9d8b55429378a3be-S001 -->

# LLD: E202611029d8b5542:S001

## Summary

**Epic:** `resolve-sql-table-view-references-across`
**HLD base run:** `wf-1793602732740-c6z5wd`
**HLD effective hash:** `9d8b55429378...`

A SQL view or table that names a table or view defined in another .sql file of the repository now gets its REFERENCES edge, written by the cross-file pass with evidence 'inferred'. Before this, the edge stayed pending forever. Names match as SQL compares unquoted names: case-insensitively, a qualified name only its own schema's definition, and a bare name any definition with that last segment. Several candidates stay ambiguous and are never guessed. Saving the file that defines a table also resolves the references that were waiting on it, without waiting for a full index.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `PASS2_KINDS`

```typescript
const PASS2_KINDS: ReadonlySet<RelationKind>
```

**Returns:** `ReadonlySet<RelationKind>` — The pending kinds Pass 2 resolves by name: CALLS, INHERITS, IMPLEMENTS and now REFERENCES.

**Postconditions:**
- Contains REFERENCES, so classifyUnattempted no longer classes a pending REFERENCES row 'not-attempted'; Pass 2 classes it instead.

### 2.2 `runPass2`

```typescript
function runPass2(opts: CrossFileResolveOpts, mode: CrossFileMode, index: EntityIndex): Promise<{ resolved: number; ambiguous: number; stillUnresolved: number }>
```

**Parameters:**
- `opts: CrossFileResolveOpts` — The repository, db and (settle) committed files.
- `mode: CrossFileMode` — full | settle | repository.
- `index: EntityIndex` — The repository's entities, now with the SQL name index.

**Returns:** `Promise<{ resolved: number; ambiguous: number; stillUnresolved: number }>` — Counts now include REFERENCES rows.

**Preconditions:**
- A REFERENCES row is attempted only when its from-entity's language is 'sql'; any other REFERENCES row is skipped as today.

**Postconditions:**
- A sql REFERENCES row goes to a new resolveSqlReference(row, index): ResolveIntent, a sibling of resolveCall and resolveInheritance. The per-row dispatch at src/indexer/cross-file-resolver.ts:560-562 becomes three-way: CALLS to resolveCall, REFERENCES to resolveSqlReference, INHERITS/IMPLEMENTS to resolveInheritance. A REFERENCES row whose from-entity is not language 'sql' returns UNRESOLVED without a class change.
- Exactly one candidate: the row is promoted through promoteResolvedBatch with evidence 'inferred'.
- Several candidates: the row is classed 'ambiguous' with meta.candidates (the ids); no edge is written.
- No candidate: the row is classed 'no-candidate' with reason 'no-match'.
- The from-entity itself is never a candidate.
- In settle mode, after rowsInScope returns the committed files' own rows, runPass2 also takes the repository's pending sql REFERENCES rows whose name could match a table or view that a committed file defines (read with listUnresolvedRelations for the repository, filtered by kind, language and name; each row at most once). When no committed file defines a table or view, settle mode reads exactly what it reads today. rowsInScope itself is unchanged, so its three callers (classifyFileTargets at src/indexer/cross-file-resolver.ts:244, runPass1b at :447 and runPass2 at :524) keep their behaviour.

### 2.3 `buildEntityIndex`

```typescript
function buildEntityIndex(entities: readonly Entity[]): EntityIndex
```

**Parameters:**
- `entities: readonly Entity[]` — The repository's entities.

**Returns:** `EntityIndex` — Gains sqlByName: Map<string, Entity[]> over sql table/view entities. Each is keyed by its lower-cased full name, and also by its lower-cased last segment when the name is qualified (marked so a bare reference can match it).

**Postconditions:**
- The existing maps are unchanged.

## 3. Data model changes

### 3.1 `REFERENCES edge between SQL tables/views across files` — invariant-change

Endpoints and direction: from a table or view entity (language 'sql') to the table or view it names, now also when the target is defined in another file of the same repository. Cardinality: many-to-one per name; one REFERENCES per distinct name per from-entity, as the reader writes it. Ownership: the reader writes it pending, and the cross-file pass promotes it. Evidence: 'inferred' for a cross-file match ('extracted' for a same-file one, unchanged). Compatibility: no new kind, byte or schema version; a pending row that was classed 'no-candidate'/'not-attempted' is re-attempted at the next full, repository or (by name) settle pass. Matching: unquoted names compare case-insensitively. A qualified reference 'app.users' matches only a definition named 'app.users'. A bare reference 'users' matches a definition named 'users', or any qualified definition whose last segment is 'users'.

**Call sites:**
- `src/indexer/cross-file-resolver.ts:134`
- `src/indexer/cross-file-resolver.ts:516`
- `src/indexer/cross-file-resolver.ts:524`
- `src/indexer/cross-file-resolver.ts:560-562`
- `src/indexer/cross-file-resolver.ts:949`
- `src/indexer/parser/sql.ts`

## 4. Error paths

**Error cases**

- **Two files define a table of the same qualified name (for example two migrations both CREATE TABLE app.users)** (recoverable)
  - Detection: resolveSqlReference finds more than one sql table/view entity under the reference's lower-cased name
  - Response: The row is classed 'ambiguous' with meta.candidates listing both ids; no edge is written
  - User impact: The reference stays pending, with its candidates visible; nothing wrong is asserted
- **A reference names a table that no file of the repository defines (an external or system table, such as pg_catalog.pg_class)** (recoverable)
  - Detection: No entry under the name, and none under the bare last segment
  - Response: The row is classed 'no-candidate' with reason 'no-match'
  - User impact: The reference stays pending, classed so it does not count as awaiting a target
- **A REFERENCES row whose from-entity is missing from the index (deleted since the row was listed)** (recoverable)
  - Detection: resolveSqlReference looks the from-entity up as resolveCall does (src/indexer/cross-file-resolver.ts:727-729: byFile, then index.byId; undefined returns UNRESOLVED)
  - Response: Left as it is (UNRESOLVED intent with no class change); the next pass sees the deletion
  - User impact: None

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A bare reference 'users' with one definition 'app.users' in another file | Resolved to app.users, evidence 'inferred' |
| A bare reference 'users' with definitions 'app.users' and 'audit.users' | Ambiguous with both candidates |
| A bare reference 'users' with definitions 'users' and 'app.users' | Ambiguous: a bare name may mean either under the search path, so it is not guessed |
| A qualified reference 'app.users' with a bare definition 'users' only | No candidate: the qualified name says the schema, and the bare definition does not |
| A reference written 'APP.Users' to a definition 'app.users' | Resolved: unquoted names compare case-insensitively (the reader already unquoted the text) |
| A view that references itself by name (recursive view) | The from-entity is never a candidate; the reader already links a same-file reference |
| Settle after saving b.sql, which newly defines orgs; a.sql (not saved) has a pending reference to orgs | The pending row from a.sql is re-attempted in the same settle and resolved |
| A REFERENCES row from a non-sql entity | Not attempted by the SQL matcher; skipped exactly as before |

**Invariants to preserve**

- An ambiguous name writes no edge; it stays pending with its candidates, so 'chosen' is never written by Pass 2 [[c1]]
- A cross-file match is written with evidence 'inferred' through promoteResolvedBatch, and a same-file one stays 'extracted' (the reader's) [[c1]]
- Pass 2 never touches boundary kinds or rows awaiting an id; those stay with the endpoint passes and Pass 0 [[c1]]
- The entity index's existing maps (byId, byFile, fileEntities, byNameKindLang keyed by language family) are unchanged; CALLS/INHERITS/IMPLEMENTS resolution is unaffected [[c2]]
- Settle mode still reads only the committed files' rows when no committed file defines a table or view [[c3]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx (npx tsx --test), over real temporary LMDB stores (useTemporaryLance), as in src/indexer/__tests__/cross-file-c-family.test.ts`

**Test levels**

- **integration** — The real cross-file pass over a real temporary store, seeded as the SQL reader writes rows: single, ambiguous and no-candidate matches; qualified vs bare names; case; settle re-attempt by defined name; other kinds unaffected
  - Subjects: `SQL references resolved by the cross-file pass`
  - Fixtures: `a temporary graph store with a registered repository and sql table/view entities in several files`
- **integration** — Through IndexerService: SQL files indexed by a full index store cross-file REFERENCES as 'inferred', and a settle after saving the file that defines a table resolves a waiting reference in an unchanged file. This replaces the s9 assertion in src/indexer/__tests__/sql-index.test.ts:76-78 (cross-file references stay pending after a full index): after this Story the same fixture's 'org_users -> orgs' and 'org_users -> users' are stored as REFERENCES edges with evidence 'inferred', and no pending REFERENCES row remains.
  - Subjects: `SQL repository through IndexerService`
  - Fixtures: `a temporary repository with schema.sql and views.sql`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: a reference to a table or view defined in exactly one other file resolves with evidence 'inferred' (qualified and bare names, case-insensitive)` |
| `ac2` | `integration: several candidates leave the reference ambiguous with its candidates and write no edge` |
| `ac3` | `integration: a name no file defines is classed no-candidate (no-match)` |
| `ac4` | `integration: a settle after saving the file that defines a table resolves a waiting reference in an unchanged file` |
| `ac5` | `integration: SQL files indexed through IndexerService store cross-file REFERENCES as inferred` |

## 6. Migration

**State before:** The cross-file pass's Pass 2 resolves only CALLS, INHERITS and IMPLEMENTS (PASS2_KINDS, src/indexer/cross-file-resolver.ts:134; bundle c1). A pending SQL REFERENCES row to a table or view of another file is never attempted. A full index classes it 'no-candidate'/'not-attempted' (classifyUnattempted, src/indexer/cross-file-resolver.ts:262), and settle mode reads only the committed files' own rows (rowsInScope, src/indexer/cross-file-resolver.ts:503; bundle c3).

**State after:** Pass 2 also resolves a sql REFERENCES row by name among the repository's sql table/view entities: one candidate is promoted with evidence 'inferred', several are classed ambiguous, none is classed no-candidate/no-match. Settle mode also re-attempts the repository's pending sql REFERENCES rows whose name a committed file's table or view now matches.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add REFERENCES to the Pass 2 kinds, with a SQL name matcher and a SQL name index on the entity index — ↩ rollbackable
2. In settle mode, runPass2 also takes the pending sql REFERENCES rows whose name a committed file's table or view matches; rowsInScope and its other callers are unchanged — ↩ rollbackable
3. No data rewrite: rows already stored are re-attempted, and their classes updated, by the next full or repository pass, or by a settle that defines their name. Existing 'not-attempted' classes are replaced then. — ↩ rollbackable

**Backward compat:** Internal only: no request, field, kind, byte or schema version changes. An older daemon reading a store this one wrote sees ordinary REFERENCES edges, whose evidence byte is already known since s7. Rolling back leaves the promoted edges as valid edges.

## 7. Alternatives considered

### 7.1 a1: SQL REFERENCES in Pass 2, plus a settle re-attempt by defined name — **CHOSEN**

Add REFERENCES to PASS2_KINDS for language sql with a name matcher over the repository's table/view entities, and in settle mode also re-attempt pending SQL references whose name a committed file now defines.



### 7.2 a2: SQL REFERENCES in Pass 2 only (smallest)

Add REFERENCES to PASS2_KINDS with the same matcher; settle mode unchanged.



**Rejected because:** Partial on accuracy-first: a reference waits for a full index, or a save of its own file, after its target is added.

### 7.3 a3: Reader-written awaitsId rows completed by Pass 0

The SQL reader writes a cross-file reference as a row awaiting a guessed target id.



**Rejected because:** Violates never-guess: a reader sees one file, so the target's file (and id) is unknowable at parse time.

## 8. References

- **[[c1]]** `code` `src/indexer/cross-file-resolver.ts:134` — "const PASS2_KINDS: ReadonlySet<RelationKind> = new Set<RelationKind>(['CALLS', 'INHERITS', 'IMPLEMENTS']);"
- **[[c2]]** `code` `src/indexer/cross-file-resolver.ts:262` — "async function classifyUnattempted(opts: CrossFileResolveOpts): Promise<void> {"
- **[[c3]]** `code` `src/indexer/cross-file-resolver.ts:503` — "async function rowsInScope(opts: CrossFileResolveOpts, mode: CrossFileMode): Promise<UnresolvedRelation[]> {"
- **[[c4]]** `code` `src/indexer/cross-file-resolver.ts:516` — "async function runPass2("
- **[[c5]]** `code` `src/indexer/cross-file-resolver.ts:949` — "function buildEntityIndex(entities: readonly Entity[]): EntityIndex {"
- **[[c6]]** `code` `src/indexer/index.ts:957` — "private async runSettlePass(repoPath: string): Promise<void> {"
- **[[c7]]** `code` `src/db/relations.ts:81` — "export interface UnresolvedRelation {"
- **[[c8]]** `stakeholder` `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S009/LLD.md:356` — "Recorded as a pending item: teach the cross-file pass to match SQL table and view names"
- **[[c9]]** `code` `src/indexer/__tests__/sql-index.test.ts:78` — "references to tables of another file stay pending by name"
- **[[c10]]** `code` `src/indexer/cross-file-resolver.ts:729` — "if (fromEntity === undefined) return UNRESOLVED;"

## 9. Open questions

- NOTE (s8 ts1 partial): the Story arrived with no acceptanceCriteria array; the test strategy names ac1-ac5 from the Story's stated behaviour, each with a proving test.

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 9 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-11-02T07:15:13.946Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
