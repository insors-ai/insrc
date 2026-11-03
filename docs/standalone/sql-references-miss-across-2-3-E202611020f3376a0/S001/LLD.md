<!-- insrc:artifact LLD-0f3376a086e3601c-S001 -->

# LLD: E202611030f3376a0:S001

## Summary

**Epic:** `sql-references-miss-across-2-3`
**HLD base run:** `wf-1793697841311-bsjwgf`
**HLD effective hash:** `952fdaafbdea...`

SQL table and view references resolve the way SQL compares names. One shared name rule decides equality everywhere: a double-quoted part keeps its exact case, any other part compares case-insensitively. A reference meets a definition when one name ends with the other's parts (db.app.users and app.users), several fits stay ambiguous, and a longer reference meets a shorter definition only if that definition is qualified. When a saved file adds a definition, inferred links to other definitions of the same name are checked again, and a settle re-tries only the pending references the saved files can affect.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `SqlParser.parse`

```typescript
parse(filePath: string, source: string, repo: string, repoId: number): ParseResult
```

**Parameters:**
- `filePath: string` — unchanged
- `source: string` — unchanged
- `repo: string` — unchanged
- `repoId: number` — unchanged

**Returns:** `ParseResult` — Unchanged shape.

**Postconditions:**
- A table/view entity's stored name writes each double-quoted segment whose quoting matters (not all lower-case, or holding a dot or a space) in double quotes with its exact text; other segments are written as today. So ids are unchanged for definitions whose stored name does not change, and distinct definitions under the name rule ("Users" vs Users, "a.b" vs a.b) get distinct ids and are all kept. Names the grammar cannot read (brackets, escaped quotes, backticks with a dot) keep today's behaviour.
- Same-file references and a view's CTE names are matched by the collision-free key, so a quoted single-segment name "a.b" never answers a qualified reference a.b.
- A pending REFERENCES row's rawTo is the reference as written (quotes kept).

### 2.2 `SqlParser.referencesIn`

```typescript
referencesIn(statement: string): string[] | undefined
```

**Parameters:**
- `statement: string` — unchanged

**Returns:** `string[] | undefined` — The statement's references as written (quotes kept).

**Postconditions:**
- Names returned keep their quotes so the store compares them by key.

### 2.3 `sqlCandidates`

```typescript
function sqlCandidates(name: string, index: EntityIndex): Entity[]
```

**Parameters:**
- `name: string` — the reference as written
- `index: EntityIndex` — the pass's entity index

**Returns:** `Entity[]` — Every table/view whose name key segments match the reference's from the last segment back over the shorter length, excluding a shorter definition that is unqualified when the reference is qualified.

**Preconditions:**
- The index holds SQL tables/views by the key of their last segment.

**Postconditions:**
- users meets app.users and db.app.users; app.users meets app.users, db.app.users and (qualified) app.users only; db.app.users meets app.users and db.app.users; audit.users does not meet a bare users; "Users" meets only definitions whose last segment key is Users.

### 2.4 `resolveSqlReference`

```typescript
function resolveSqlReference(row: UnresolvedRelation, index: EntityIndex): ResolveIntent
```

**Parameters:**
- `row: UnresolvedRelation` — unchanged
- `index: EntityIndex` — unchanged

**Returns:** `ResolveIntent` — Unchanged rule over the new candidates: one resolves ('inferred'), several ambiguous with candidate ids, none unresolved.

### 2.5 `sqlReferencesAwaitingCommitted`

```typescript
async function sqlReferencesAwaitingCommitted(opts: CrossFileResolveOpts, inScope: readonly UnresolvedRelation[]): Promise<UnresolvedRelation[]>
```

**Parameters:**
- `opts: CrossFileResolveOpts` — settle options with committedFiles
- `inScope: readonly UnresolvedRelation[]` — rows already in scope

**Returns:** `Promise<UnresolvedRelation[]>` — Only the pending SQL REFERENCES rows the saved files can affect.

**Preconditions:**
- Runs only when a committed file is .sql (unchanged).

**Postconditions:**
- Returns a pending SQL REFERENCES row (not in scope, not awaiting an id) when its last-segment key equals the last-segment key of a table/view now defined in a committed file, or it is ambiguous and a candidate id in its meta is no longer stored, or the commit returned it to pending by name (it carries the marker the re-pend writes).
- After the settle's resolution pass, the re-pend marker is cleared on every row it selected because of the marker, whether the row resolved, stayed ambiguous or no-candidate, or kept its class.

### 2.6 `sqlByNameRows`

```typescript
function sqlByNameRows(s: GraphStore, awaiting: UnresolvedRow, fromU64: bigint, toU64: bigint): UnresolvedRow[] | undefined
```

**Parameters:**
- `s: GraphStore` — unchanged
- `awaiting: UnresolvedRow` — unchanged
- `fromU64: bigint` — unchanged
- `toU64: bigint` — unchanged

**Returns:** `UnresolvedRow[] | undefined` — By-name rows for the holder's written names that could mean the removed target, each carrying the re-pend marker.

**Postconditions:**
- A written name of the holder is kept when it meets the target under the sqlCandidates suffix rule by the new key, OR when its folded text (today's lower-cased comparison) meets the target's folded name -- the wider of the two, so a definition stored before the change under a lossy name ("Users" stored as Users) still returns its references to pending when its file is re-read and its id changes; resolution then decides by the key. Re-pending is only a trigger to re-attempt, so the wider match never creates an edge.
- A written name is skipped when it matches (by key) a table/view defined in the holder's own file: the reader resolved it there (evidence extracted), and re-pending it would create a false pending row beside the kept local edge.

## 3. Data model changes

### 3.1 `SQL name key (shared helper used by the reader, the resolver and the store)` — new

A pure function from a written SQL name, as the grammar gives it, to its segments and its comparison key. Segments: the object_reference's identifier children (the grammar already splits at dots outside double quotes); a double-quoted segment keeps its inner text exactly, a backticked segment is unquoted and lower-cased, a bare segment is lower-cased. The equality key is the JSON encoding of the folded segment array (e.g. ["app","users"] vs ["a.b"]), so the quoted single segment "a.b" and the qualified name a.b never collide; suffix matching compares the segment arrays, and the index keys by the folded last segment. ANSI/PostgreSQL folding. Grammar limits (the installed @derekstride/tree-sitter-sql, probed 2026-11-03): it has no bracketed identifier (CREATE TABLE [Sales.Q1] parses as identifiers Sales and Q1 with the brackets as ERROR nodes, and REFERENCES [x] is skipped), no escaped double quote ("a""b" parses as "a" plus an ERROR), and a backtick identifier holding a dot (`a.b`) parses as a broken identifier plus an ERROR. This Story does not recover text the grammar loses: such names keep exactly today's behaviour (the reader reads what the grammar gives), stated as a limitation and pinned by real-parser tests so the change cannot make them worse. Supported delimiters are double quotes (any text but an escaped quote, dots included) and backticks without a dot. Lives beside the SQL reader so the store and resolver import it without loading the grammar.

**Call sites:**
- `src/indexer/parser/sql.ts:18-22`
- `src/indexer/parser/sql.ts:150-156`
- `src/indexer/cross-file-resolver.ts:798-801`
- `src/db/relations.ts:645-661`

### 3.2 `table/view entity name (and so its id) and pending REFERENCES rawTo` — field-modify

The entity name carries every segment boundary and the quoting that changes meaning, so distinct definitions under the name rule get distinct ids and a stored name reads back to the same key as the reference that wrote it. Each segment is written as today (its unquoted text) unless it needs quoting: a double-quoted segment needs it when its text is not all lower-case or holds a character a bare identifier cannot (a dot, a space); it is then written in double quotes with its exact text. A backticked segment never needs it (backticks fold; a backtick name with a dot is a grammar limit, see the name key). So Users and "Users" are two entities (Users, "Users"); a.b and "a.b" are two (a.b, "a.b"); users, "users" and `users` stay users. Ids are unchanged for every definition whose stored name does not change; a definition whose stored name changes (meaningful quoting added, removed or changed by an edit) gets a new id, so commitFile removes the old entity and the existing removal path returns its incoming edges to pending by name -- no new commit-boundary logic. The resolver and the store read a definition's key from its stored name with the name rule. signature stays `${kind} ${name}`. A pending row's rawTo is the reference as written (quotes kept); its id changes for quoted references on the next read of the file. Legacy rows: a definition stored before the change under a lossy name keeps resolving as today until its file is read again; when it is, the old entity's incoming edges return to pending by name through the wider folded-or-key match of sqlByNameRows, and are re-resolved by key. A holder whose own pending rows were written before the change keeps unquoted rawTo until its file is read again; repo.reindex makes the whole repository consistent at once, and is the recommended step after the update.

**Call sites:**
- `src/indexer/parser/sql.ts:18-22`
- `src/indexer/parser/sql.ts:136-156`
- `src/indexer/cross-file-resolver.ts:1007-1049`
- `src/db/relations.ts:645-661`

### 3.3 `entity index SQL maps` — field-modify

sqlByName and sqlByLastSegment are replaced by one map from last-segment key to table/view entities (qualified or not); sqlCandidates filters it by the suffix rule.

**Call sites:**
- `src/indexer/cross-file-resolver.ts:1007-1049`
- `src/indexer/cross-file-resolver.ts:798-801`

### 3.4 `inferred SQL REFERENCES edges on a settle that adds definitions` — invariant-change

Before the settle's resolution pass, for each table/view defined in a committed file, the inbound inferred REFERENCES edges of EVERY stored table/view whose folded last segment (case-insensitive, quotes ignored) equals that definition's -- the committed definitions themselves included -- whose holder is not in a committed file are returned to pending by name (the same by-name rows sqlByNameRows writes, with the re-pend marker), then re-attempted in the same settle by key: one candidate re-resolves (inferred), several become ambiguous. Grouping by the folded last segment, and including the committed definitions, covers every case where a definition's meaning changes while its id survives: a quote-only edit, and a legacy file whose Users and "Users" were stored as one entity Users -- when re-read it keeps Users and adds "Users", and the edge an external "Users" reference had to Users is re-checked and re-resolves to "Users". The re-pend uses sqlByNameRows' rules: only the holder's names that could mean that target, never a name the holder's own file defines (resolved locally by the reader). Edges the reader resolved in its own file (evidence extracted) are never touched.

**Call sites:**
- `src/indexer/cross-file-resolver.ts:526`
- `src/db/relations.ts:645-661`
- `src/db/graph/edges.ts:111-113`

### 3.5 `re-pend marker on pending SQL REFERENCES rows` — new

A meta flag set on every by-name row written by sqlByNameRows (a removed target) and by the settle's re-pend of inferred edges. Lifecycle: the next settle's sqlReferencesAwaitingCommitted selects a marked row, and after that settle's resolution pass the marker is cleared on every selected row whatever the outcome -- resolved rows leave the pending table; rows that stay ambiguous, no-candidate or unchanged in class get a metadata update that deletes the flag (a new change site beside updatePendingMetaInTxn / updateUnresolvedMetaBatch, which today only merge fields). So a marked row is retried exactly once, by the settle after the commit that marked it, and an unrelated later save does not select it again. A full index ignores and clears the flag.

**Call sites:**
- `src/db/relations.ts:586`
- `src/db/relations.ts:645-661`
- `src/indexer/cross-file-resolver.ts:526`
- `src/indexer/cross-file-resolver.ts:819-830`

## 4. Error paths

**Error cases**

- **A written name the key function cannot split (unbalanced quote, e.g. `"Users`)** (recoverable)
  - Detection: The segment splitter reaches the end inside an open quote
  - Response: The whole text is one unquoted segment, lower-cased (today's behaviour)
  - User impact: Compares as today; never crashes
- **The SQL reader is not registered on the thread doing a removal (no grammar)** (recoverable)
  - Detection: sqlReferenceReader is undefined (unchanged check)
  - Response: The reference awaits the id, as today
  - User impact: No by-name re-pend; unchanged
- **A re-pend of inferred edges fails part-way in a settle** (recoverable)
  - Detection: The store write throws inside its transaction
  - Response: The transaction does not commit; the settle reports the failure as other settle steps do, and the edges stay as they were
  - User impact: The stale edge stays until the next settle of that name; no data lost

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Definition app.users in a.sql; view in b.sql selects from db.app.users | Resolved to app.users (inferred) |
| Definition db.app.users; reference app.users | Resolved to db.app.users |
| Definition users (unqualified); reference audit.users | Unresolved: a qualified reference does not meet an unqualified definition |
| Definitions app.users and audit.users; reference users | Ambiguous with both candidates (unchanged) |
| Definitions "Users" and users; reference "Users" | Resolved to "Users" only; reference users resolves to users only; reference "users" resolves to users |
| A view's CTE named "Recent" and a FROM recent | recent is not the CTE (key differs) and is a reference; FROM "Recent" is the CTE |
| View v in b.sql resolved (inferred) to users in a.sql; then c.sql adding users is saved | The edge returns to pending and becomes ambiguous with both candidates |
| Same, but c.sql adds orders | The edge to users is not touched |
| A pending reference to sales.orders while a.sql (defining only users) is saved | Not re-attempted by that settle |
| An ambiguous reference to users whose candidate in a.sql is removed by saving a.sql | Re-attempted: resolves to the remaining definition |
| CREATE TABLE "a.b" (...) and a view in the same file selecting from a.b | Not linked: ["a.b"] and ["a","b"] are different keys; a.b stays a pending reference |
| A by-name row re-pended when users.sql removed users; the next settle re-attempts it and it stays no-candidate; later orders.sql is saved | The row is not re-attempted by the orders.sql settle: its marker was cleared by the first settle |
| One file with CREATE TABLE Users, CREATE TABLE "Users", a view selecting from users and one from "Users" | Two table entities (Users, "Users"); the first view links to Users, the second to "Users" |
| One file with CREATE TABLE a.b and CREATE TABLE "a.b", views selecting from each | Two entities (a.b, "a.b"), each view linked to its own |
| users.sql edited from CREATE TABLE Users to CREATE TABLE "Users"; another file's view selects from users and was linked (inferred) | The entity id changes; the old entity's incoming edge returns to pending by name and, with no definition matching users any more, stays no-candidate |
| a.sql edited from CREATE TABLE a.b to CREATE TABLE "a.b"; another view selects from a.b | Same: the edge returns to pending; a.b no longer meets "a.b" |
| Entities stored before the change | Unquoted and lower-case-quoted definitions keep their names and ids; a definition whose quoting matters gets its quoted name (new id) when its file is read again or on repo.reindex |
| Upgrade: a.sql stored before the change with CREATE TABLE "Users" (stored name Users); b.sql's view selects from "Users" and is linked; only a.sql is read again | The definition's id changes (name "Users"); b.sql's edge returns to pending by name through the folded match and re-resolves to "Users" by key |
| A view in b.sql joins users (defined in b.sql, linked locally) and app.users (linked inferred to a.sql); then c.sql adds audit.users | Only the app.users reference is re-pended (it stays resolved to app.users: audit.users does not meet app.users); no pending users row is created for the locally linked users |
| Upgrade: legacy a.sql declares CREATE TABLE Users and CREATE TABLE "Users" (stored as one entity Users); b.sql's view selects from "Users" and is linked to Users; only a.sql is read again | a.sql now has Users (same id) and "Users" (new); the settle re-checks Users' inbound inferred edge and b.sql's reference re-resolves to "Users" |
| Backticked `Users` definition | Folds like unquoted: meets users |
| CREATE TABLE [Sales.Q1], CREATE TABLE "a""b", CREATE TABLE `a.b` (grammar limits) | Exactly today's entities and references for these inputs (whatever the grammar yields); no crash, no new edge |

**Invariants to preserve**

- Ambiguity is never guessed: several candidates stay ambiguous with candidate ids. [[c2]]
- The from-entity is never its own target. [[c2]]
- Same-file references are resolved by the reader (evidence extracted) and are never re-pended by the settle. [[c1]]
- A removed target's references return pending by name only when the reader is registered. [[c4]]
- A table/view entity id is unchanged unless its stored name changes; a stored name changes only when the definition's meaningful quoting changes, and then the normal removal path returns its incoming edges to pending by name. [[c1]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict via tsx, as in src/indexer/parser/__tests__/ and src/indexer/__tests__/`

**Test levels**

- **unit** — The SQL name key and segment split: double-quoted exact, bare/backtick/bracket folded, dots inside quotes kept, unbalanced quotes degrade to one folded segment; the suffix rule.
  - Subjects: `the SQL name key helper`
- **unit** — The reader keeps raw names in signature and rawTo, matches same-file references and CTE names by key, and referencesIn returns names as written. Existing reader assertions that encode today's conflation are updated, not kept: in src/indexer/parser/__tests__/sql.test.ts the unquoted `orders` no longer links to CREATE TABLE "Orders" (it becomes a pending reference), FROM Totals is a reference when the CTE is WITH "Totals", and pending names keep their delimiters ("Sales", app."Ledger"); positive counterparts are added (FROM "Orders" links, FROM "Totals" is the CTE). A quoted dotted identifier must not answer a qualified reference. Same-file regressions hold both members of each collision pair (Users / "Users", a.b / "a.b") with a reference to each, and assert two entities with distinct ids and each reference linked to its own. Grammar-limit regressions with the real parser: the entities and references produced for [Sales.Q1], "a""b" and `a.b` (definitions, a view's FROM, REFERENCES, referencesIn) are the same before and after the change.
  - Subjects: `SqlParser.parse and SqlParser.referencesIn`
- **integration** — Over a temporary store with real .sql files and the cross-file resolver: 2-/3-part suffix resolution, the qualified-vs-unqualified rule, quoted vs unquoted, ambiguity kept; a settle that adds a same-named definition makes an inferred edge ambiguous and leaves other names alone; a settle re-attempts only rows the saved files can affect (unrelated pending rows untouched, an ambiguous row whose candidate was removed re-resolves). The selection is observed directly (the rows sqlReferencesAwaitingCommitted returns), not inferred from outcomes; a two-settle sequence proves a re-pended row's marker is consumed by the first settle and an unrelated later save does not retry it. Update regressions: a quote-only edit (Users -> "Users") and a segment-boundary edit (a.b -> "a.b") of a definition return another file's inferred edge to pending. Upgrade regression: a store written with today's reader (lossy names), then only the definition file re-read with the new reader, keeps the other file's reference linked to the definition. Mixed-ownership regression: a holder with one locally resolved and one inferred reference, then a same-last-segment definition added, creates no pending row for the local name. Legacy-collision regression: a store written with today's reader from one file declaring both Users and "Users", then only that file re-read with the new reader, leaves an unchanged external "Users" reference linked to the "Users" entity.
  - Subjects: `SQL reference resolution in full and settle modes`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: db.app.users meets app.users and app.users meets db.app.users; audit.users does not meet bare users; users with two qualified definitions stays ambiguous` |
| `ac2` | `unit: name key folding and quoting`, `integration: "Users" and users resolve to their own definitions`, `unit: a quoted single-segment "a.b" does not answer a qualified a.b (key collision)`, `unit: Users and "Users", and a.b and "a.b", in one file are two entities with distinct ids, each reference linked to its own`, `unit (real parser): [Sales.Q1], "a""b" and `a.b` produce the same entities and references as before the change` |
| `ac3` | `integration: a settle adding a same-named definition turns an inferred edge ambiguous; a different name leaves it`, `integration: a quote-only edit and a segment-boundary edit of a definition return another file's inferred edge to pending`, `integration: upgrade -- re-reading only the definition file keeps another file's reference linked`, `integration: mixed ownership -- re-pend never creates a pending row for a name the holder's file resolves locally`, `integration: legacy collision -- re-reading only the definition file moves an external "Users" reference to the new "Users" entity` |
| `ac4` | `integration: the rows selected by a settle are exactly those matching the saved files' names, ambiguous rows with a removed candidate, and marked rows`, `integration: two settles -- the marker is cleared by the first, so an unrelated second save does not select the row` |
| `ac5` | `unit: the reader keeps raw names and matches by key; the sql.test.ts assertions that encoded conflation (orders -> "Orders", Totals vs "Totals" CTE, unquoted pending names) are updated with positive and negative quoted cases`, `integration: the other existing cross-file-sql-references.test.ts cases still pass unchanged` |

## 6. Migration

**State before:** SQL names are unquoted and compared lower-cased everywhere, qualified references meet only identical names, inferred edges are never re-checked, and any .sql save re-attempts every pending SQL reference (s1 bundles 1-4).

**State after:** One name key with ANSI quoting decides equality in the reader, resolver and store; qualified names meet by segment suffix; a settle that adds definitions re-checks same-named inferred edges; a settle re-attempts only rows its files can affect.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Ship the change; no schema or codec change. — ↩ rollbackable
2. Definitions whose quoting does not change meaning keep their names and ids; definitions with meaningful quoting (rare) get a quoted name and a new id when their file is read again, their old rows removed by the normal commit; quoted references' pending rows get new ids the same way. — ↩ rollbackable
3. Run repo.reindex once after the update so every definition and reference is read under the new rule at the same time (recommended). Without it the change is still safe: when a definition file is read again, the settle re-checks the inferred incoming edges of every same-named definition (its own included), and a removed one's edges return to pending through the wider folded-or-key match; a holder written before the change compares as unquoted, today's behaviour, until its file is read again. — ↩ rollbackable

**Backward compat:** No API, IPC or storage format change. Visible differences: more resolved SQL references (qualified names), quoted names no longer conflated, stale inferred edges become ambiguous when a second definition appears.

## 7. Alternatives considered

### 7.1 a1: One SQL name key + suffix matching + re-pend on a new candidate + targeted settle — **CHOSEN**

A shared name key (ANSI quoting) used by the reader, the resolver and the store; qualified names meet by segment suffix; a new definition returns same-named inferred edges to pending; a settle re-attempts only rows the saved files can affect.

A shared SQL name module defines the comparison key: names split into segments at dots outside quotes; a double-quoted segment keeps its exact text, any other segment (bare, backticked, bracketed) is lower-cased (ANSI / PostgreSQL folding). The reader keeps the raw declared name in each table/view entity's signature and in each pending row's rawTo, and matches same-file references and CTE names by key. The resolver indexes definitions by the key of their last segment and accepts a candidate whose segments match the reference's from the end over the shorter length, where a reference longer than the definition needs the definition to be qualified (db.app.users meets app.users; audit.users does not meet a bare users); several candidates stay ambiguous. The store's removal re-pend compares by key too. When a settle commits definitions, inferred REFERENCES edges into other definitions with the same last-segment key are returned to pending by name (the removal path's by-name rows) and re-attempted in the same settle, so a second candidate makes them ambiguous. The settle re-attempts only pending SQL rows whose last-segment key matches a definition in a committed file, ambiguous rows whose candidates include an entity no longer stored, and rows the commit returned to pending.

### 7.2 a2: Fix L4 and L3 only; leave edges and settle as they are

Name key and suffix matching; no re-check of inferred edges and no narrower settle.

The name key and suffix matching from a1, without the re-pend of inferred edges on a new candidate and without narrowing the settle re-scan.

**Rejected because:** Violates fi-L1 and fi-L2.

### 7.3 a3: Store canonical keys in new entity and row fields

Add a nameKey field to table/view entities and pending rows instead of keeping raw names in signature and rawTo.

Extend the Entity and UnresolvedRelation records with a stored key computed at read time; the resolver and store compare keys without re-deriving them.

**Rejected because:** Same outcome as a1 with a storage migration it does not need.

## 8. References

- **[[c1]]** `code` `src/indexer/parser/sql.ts:150-156` — "byName.set(objName.toLowerCase(), id);"
- **[[c2]]** `code` `src/indexer/cross-file-resolver.ts:809-813` — "function resolveSqlReference(row: UnresolvedRelation, index: EntityIndex): ResolveIntent {"
- **[[c3]]** `code` `src/indexer/cross-file-resolver.ts:819-830` — "if (!(opts.committedFiles ?? []).some(f => f.toLowerCase().endsWith('.sql'))) return [];"
- **[[c4]]** `code` `src/db/relations.ts:645-661` — "function sqlByNameRows(s: GraphStore, awaiting: UnresolvedRow, fromU64: bigint, toU64: bigint): UnresolvedRow[] | undefined {"
- **[[c5]]** `code` `src/indexer/cross-file-resolver.ts:798-801` — "const key = name.toLowerCase();"
- **[[c6]]** `code` `src/indexer/parser/sql.ts:18-22` — "const unquote = (text: string): string =>"
- **[[c7]]** `prior-artifact` `docs/standalone/sql-references-miss-across-2-3-E202611020f3376a0/ISSUE.md`
- **[[c8]]** `code` `src/db/relations.ts:586` — "export async function updateUnresolvedMetaBatch("

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 6 hold** · template `design-issue` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-11-03T10:05:25.542Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
