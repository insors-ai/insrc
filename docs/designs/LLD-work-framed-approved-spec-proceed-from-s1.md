<!-- insrc:artifact LLD-914cbf5ea9026b92-s1 -->

# LLD: E20260806914cbf5e:S001

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1786031712974-qqqe5k`
**HLD effective hash:** `fd544bcd90a0...`

## HLD context

**Framework:** Pipeline-integrated external-service graph tracing. The graph gains one new node kind (ExternalEndpoint, carrying a protocol + resolved/unresolved tag) and four typed boundary edge kinds (CALLS_HTTP, PUBLISHES_TO, SUBSCRIBES_TO, CALLS_RPC), added once to the graph vocabulary and gated by a graph-schema migration so existing indexes evolve without a full re-index. Per-language outbound and inbound detectors run as thin plugins inside the existing tree-sitter parse; a shared protocol-agnostic resolution engine turns indirect/configured targets into a concrete identity (or an explicit unresolved marker) from layered config sources with a fixed precedence. Cross-repo linking is a separate daemon-side matching pass, keyed off a per-repo service-identity registry, that forms a real dependency edge onto the target repo's actual handler entity and inserts it into the DEPENDS_ON closure; the same pass, re-fired on repo register/re-index events, is the out-of-order backfill.
**Rollout phase:** Phase A — Graph foundation + resolution
**Owns:** `sc1` (ExternalEndpoint graph vocabulary)

## Contract details

**Surface level:** internal-shared

### `transitiveClosure`

```typescript
async function transitiveClosure(roots: Iterable<bigint>, opts: { kindFilter?: ReadonlySet<RelationKind> | readonly RelationKind[]; ... }): Promise<Set<bigint>>
```

**Parameters:**
- `roots: Iterable<bigint>` — u64 store-id roots to walk from (unchanged).
- `opts: { kindFilter?: ReadonlySet<RelationKind> | readonly RelationKind[] }` — Traversal options; the DEPENDS_ON-closure caller's kindFilter set is what gains the four boundary RelationKinds (and later the cross-repo edge kind).

**Returns:** `Promise<Set<bigint>>` — The reachable u64 id set. Signature UNCHANGED by S001; the only change is that the DEPENDS_ON-closure kind set the caller passes now includes CALLS_HTTP/PUBLISHES_TO/SUBSCRIBES_TO/CALLS_RPC so boundary edges are traversable within the closure (ac2). Existing closure semantics over existing kinds are unchanged — the new kinds are purely added.

**Preconditions:**
- The boundary RelationKinds have stable u8 byte assignments (keys.ts) before any closure over them runs.

**Postconditions:**
- A closure query from a repo reaches its ExternalEndpoint nodes via the boundary edges (ac2); a graph with no boundary edges yields a byte-identical closure to before.

### `decodeEntityRow`

```typescript
function decodeEntityRow(b: Buffer): EntityRow
```

**Parameters:**
- `b: Buffer` — A stored msgpack entity row.

**Returns:** `EntityRow` — The decoded row. Signature UNCHANGED; S001 relies on the existing forward-compatible pass-through decode (the decodeRepoRow `?? default` precedent) so a pre-S001 row — which never carries kind:'externalEndpoint' nor the endpoint optional fields — decodes byte-identically, and a new externalEndpoint row round-trips its protocol/resolved/target/rawExpression.

**Preconditions:**
- EntityKind + the endpoint optional fields are additive to the EntityRow type (no removed/renamed field).

**Postconditions:**
- encode(decode(x)) === x for both pre-S001 rows and new externalEndpoint rows (forward + backward compatible).

## Data model changes

### `EntityKind (src/shared/types.ts)` — field-add

The EntityKind string union gains a new member 'externalEndpoint'. Purely additive to the union; existing kinds unchanged. This is the sc1 node kind. NOTE: keys.ts re-derives EntityKind as `keyof typeof ENTITY_KIND_BYTE`, so the new member must also be appended to the ENTITY_KIND_BYTE byte map in src/db/graph/keys.ts (parallel to the RelationKind byte).

```
src/shared/types.ts EntityKind: + | 'externalEndpoint'
src/db/graph/keys.ts: append 'externalEndpoint' to the ENTITY_KIND_BYTE map (keys.ts re-derives `EntityKind = keyof typeof ENTITY_KIND_BYTE`, so the node kind needs a stable u8 byte here too, parallel to the new RelationKind bytes)
```

**Call sites:**
- `src/shared/types.ts`
- `src/db/graph/keys.ts`
- `src/db/graph/codec.ts`

### `RelationKind + its u8 byte mapping (src/shared/types.ts + src/db/graph/keys.ts)` — field-add

RelationKind gains four members CALLS_HTTP / PUBLISHES_TO / SUBSCRIBES_TO / CALLS_RPC, each assigned a NEW, stable, append-only u8 byte in keys.ts (never reusing/renumbering existing bytes, since the byte is encoded in the edge key). These are the sc1 boundary edge kinds distinguishing HTTP call / publish / subscribe / RPC call (ac1).

```
src/shared/types.ts RelationKind: + | 'CALLS_HTTP' | 'PUBLISHES_TO' | 'SUBSCRIBES_TO' | 'CALLS_RPC'
src/db/graph/keys.ts: append four new u8 byte values for the above (next free bytes after the existing kinds)
```

**Call sites:**
- `src/shared/types.ts`
- `src/db/graph/keys.ts`
- `src/db/graph/codec.ts`

### `Entity / EntityRow endpoint fields (src/shared/types.ts + src/db/graph/codec.ts)` — field-add

The Entity/EntityRow record gains optional fields populated only for kind==='externalEndpoint': protocol ('http'|'messaging'|'rpc'), resolved (boolean), target (string; '' when unresolved), rawExpression? (string; present only when resolved===false) — modeled inline exactly as existing optional fields (signature, isExported, hash) are. The deterministic per-repo endpoint id is SHA256(repo + '' + 'externalEndpoint' + protocol + ':' + (target||rawExpression)) hex-32, so repeated call-sites to one target in one repo dedup to a single node (k2).

```
src/shared/types.ts Entity: + protocol?: ExternalProtocol; + resolved?: boolean; + target?: string; + rawExpression?: string;  (all optional, only set for externalEndpoint)
```

**Call sites:**
- `src/shared/types.ts`
- `src/db/graph/codec.ts`

### `DEPENDS_ON-closure kind set (src/db/graph/traversal.ts)` — invariant-change

The invariant 'the DEPENDS_ON closure spans only the existing intra-code relation kinds' becomes 'the closure also spans the four external boundary kinds (and the future cross-repo edge kind)'. Concretely the kindFilter set the DEPENDS_ON-closure passes to transitiveClosure gains CALLS_HTTP/PUBLISHES_TO/SUBSCRIBES_TO/CALLS_RPC. Additive: a graph with no boundary edges has an unchanged closure (ac2, k1).

```
src/db/graph/traversal.ts: the DEPENDS_ON closure kind set gains the four boundary RelationKinds
```

**Call sites:**
- `src/db/graph/traversal.ts`

### `Graph schema version marker (src/db/graph/migrations.ts)` — invariant-change

No DATA migration is required: the new EntityKind/RelationKind values are additive, pre-existing rows never carry them, and decode is forward-compatible (decodeRepoRow precedent), so existing indexes read correctly as-is with NO destructive rebuild (durability NF). An OPTIONAL schema_version marker bump may be registered as a no-op documentation step; it performs no row rewrite. This refines the HLD frameworkSummary phrase 'gated by a graph-schema migration' to 'additive + forward-compatible', which strengthens (does not contradict) the HLD durability NF 'existing indexes evolve without a destructive full rebuild' — so no HLD amendment is needed (the migration mechanics are S001-internal per the story boundary).

```
src/db/graph/migrations.ts: (optional) register a no-op schema_version marker step; NO run() row rewrite
```

**Call sites:**
- `src/db/graph/migrations.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | S001 owns sc1 and implements it verbatim: the ExternalEndpoint EntityKind + endpoint fields (Entity/EntityRow), the four boundary RelationKinds (shared/types.ts + keys.ts byte mapping + codec), the per-repo deterministic endpoint id (k2), and the closure participation (traversal kindFilter, ac2/k1). Downstream consumers s3/s4/s5 write endpoint nodes + boundary edges via this vocabulary; s8/s9 read endpoints + add the cross-repo edge kind into the same closure set. |

## Error paths

### Error cases

- **A boundary edge references an external-endpoint node whose deterministic string id was never written (dangling endpoint reference during a partial/interrupted index).** (recoverable)
  - Detection: At edge-write time the writer looks up the target node by its deterministic string id and finds no row; at traversal time transitiveClosure resolves the u64 target and the entity fetch returns undefined.
  - Response: Writer refuses to persist a boundary edge to a non-existent endpoint node (endpoint node is upserted first, edge second, within the same index transaction); a traversal that still encounters an unresolvable target skips that edge rather than throwing, so the closure degrades gracefully instead of crashing.
  - User impact: No crash and no phantom edge; at worst the endpoint is simply absent until the repo finishes indexing, when the node+edge appear together.
- **Two distinct RelationKind members are accidentally assigned the same u8 byte in keys.ts (byte collision on the append), so edges of different boundary kinds become indistinguishable in the key space.** (recoverable)
  - Detection: A build-time / test-time assertion over the RelationKind→byte map catches a duplicate byte value (the codec round-trip test decodes a kind different from the one encoded).
  - Response: The byte map is append-only with an exhaustive uniqueness assertion; the codec round-trip test fails loudly in CI before any such map ships, forcing a distinct next-free byte.
  - User impact: Caught in development, never reaches a user index; if it somehow shipped, ac1's four-way distinguishability would break, which the test prevents.
- **An externalEndpoint row is decoded on an OLDER daemon build that predates the new EntityKind (forward-read of a newer index by older code).** (recoverable)
  - Detection: Older decode reads kind:'externalEndpoint' as an unknown string; the existing additive-decode path (decodeRepoRow `?? default` precedent) leaves the field as-is rather than validating against a closed enum.
  - Response: Decode is pass-through and does not enum-validate kind, so an unknown kind decodes as an inert node the older code simply never queries for; no throw. (This is a tolerated one-way concern — the project runs a single daemon build, so newer-index-on-older-code is not a supported live path, only a robustness guarantee.)
  - User impact: None in the supported single-build deployment; the additive decode guarantees no hard failure even in the unsupported skew case.

### Edge cases

| Input | Expected |
| :--- | :--- |
| An unresolved outbound call whose target cannot be statically determined — resolved:false, target:'' , rawExpression set to the raw call expression. | A first-class externalEndpoint node is still created (the 'always create a node, tag resolved/unresolved' brainstorm decision), with its deterministic id keyed off (target\|\|rawExpression) so the rawExpression provides identity; it participates in the closure exactly like a resolved node. |
| Two different call-sites in the SAME repo reaching the identical resolved target+protocol. | Both hash to the same deterministic string id → a single deduped externalEndpoint node (k2), with two boundary edges (one per call-site code entity) pointing at it. |
| The same resolved target reached from TWO different repos. | Two distinct externalEndpoint nodes — one per repo — because repo is part of the deterministic id (per-repo dedup, brainstorm node-dedup decision); cross-repo unification is s8/s9's job via the cross-repo edge, not id collision here. |
| A repo with zero outbound external calls is indexed, and a dependency-closure query is run from it. | No externalEndpoint nodes and no boundary edges are created; the closure result is byte-identical to pre-S001 (additive invariant, ac2/k1). |
| A single call-site expression that is simultaneously plausible as two protocols (ambiguous) — deferred resolution. | S001's vocabulary can represent whichever single protocol the resolver (s2) ultimately assigns; S001 itself does not resolve — it only provides one protocol-typed node shape, so ambiguity handling is out of this story's scope and lands in the resolution/detection stories. |

### Invariants to preserve

- The deterministic entity id remains SHA256(repo + file + kind + name) hex-32; the externalEndpoint id fits this scheme with file='' and name=(protocol + ':' + (target||rawExpression)), so id determinism and the existing name_index/dedup contract are unchanged for all existing kinds. [[c1]]
- The DEPENDS_ON dependency-closure over existing relation kinds returns exactly what it did before — the four boundary kinds are ADDED to the closure's considered set, never replacing or altering traversal over existing kinds (a boundary-edge-free graph yields an unchanged closure). [[c1]]
- encode/decode of every pre-S001 entity and edge row round-trips unchanged; existing indexes read correctly with no destructive rebuild (additive, forward-compatible decode). [[c1]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test` (matching the existing src/db/graph/**/__tests__ suites)`

### Test levels

- **unit** — Prove the new EntityKind/RelationKind vocabulary + endpoint fields round-trip through the msgpack codec and that the RelationKind→u8 byte map stays collision-free and append-only.
  - Subjects: `encodeEntityRow/decodeEntityRow round-trip of an externalEndpoint EntityRow (resolved and unresolved variants, all endpoint fields present/absent)`, `encode/decode of each of the four boundary RelationKind edge bytes (CALLS_HTTP/PUBLISHES_TO/SUBSCRIBES_TO/CALLS_RPC)`, `RelationKind→byte map exhaustive uniqueness assertion (no duplicate byte; new bytes appended after existing)`, `deterministic endpoint id = SHA256(repo + '' + 'externalEndpoint' + protocol + ':' + (target||rawExpression)) hex-32 — same inputs → same id; per-repo distinctness`
  - Fixtures: `An in-memory/temp LMDB graph store (existing src/db/graph test harness)`, `A pre-S001 EntityRow + edge byte fixture (legacy row that never carries the new kind/fields)`
- **integration** — Prove a boundary edge from a code entity to an externalEndpoint node is created and is traversable within the DEPENDS_ON dependency-closure, and that a graph with no boundary edges yields an unchanged closure.
  - Subjects: `transitiveClosure from a repo root reaches its externalEndpoint node via a boundary edge when the closure kindFilter includes the four boundary kinds (ac2)`, `closure over an existing-kinds-only graph is byte-identical to pre-S001 (additive invariant)`, `per-repo dedup: two boundary edges from two call-sites to the same resolved target+protocol resolve to a single endpoint node (k2)`, `two repos reaching the same target produce two distinct per-repo endpoint nodes`
  - Fixtures: `A small synthetic graph: one code entity + one resolved externalEndpoint + one boundary edge, built via the graph store API`, `A second synthetic graph with zero boundary edges (the unchanged-closure control)`
- **contract** — Pin the sc1 shared-contract shape (node kind string, four relation-kind names, endpoint field set, id derivation) so downstream consumers s3/s4/s5/s8/s9 build against a fixed vocabulary.
  - Subjects: `ExternalEndpointEntity field set + protocol enum ('http'|'messaging'|'rpc') matches sc1`, `the four ExternalBoundaryRelation names match sc1 exactly`, `forward-compatible decode: a pre-S001 row/edge decodes unchanged (no throw, no field loss)`
  - Fixtures: `A frozen sc1 vocabulary fixture (the literal kind/relation/field names) to assert the type surface against`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: encode/decode round-trip of a resolved externalEndpoint EntityRow + each of the four boundary edge-kind bytes (a first-class node + typed, four-way-distinguishable boundary relationship exist)`, `integration: a code entity → externalEndpoint boundary edge is written and read back with the correct protocol-typed relation kind`, `unit: deterministic per-repo endpoint id dedups two same-target call-sites into one node (k2)` |
| `ac2` | `integration: transitiveClosure from the repo root reaches the externalEndpoint node via the boundary edge when the closure kindFilter includes the four boundary kinds`, `integration: a boundary-edge-free graph's closure is byte-identical to pre-S001 (the added kinds never alter existing-kind traversal, k1)` |

## Alternatives considered

### a1: Inline endpoint fields on EntityRow + per-class RelationKind bytes + closure kindFilter inclusion (additive, no data migration) — **CHOSEN**

Add 'externalEndpoint' to EntityKind with endpoint-specific OPTIONAL fields inline on the Entity/EntityRow shape (as signature/isExported already are), add four new RelationKind byte values in keys.ts, include the four kinds in the DEPENDS_ON-closure kindFilter, and rely on the existing forward-compatible decode — no data-rewrite migration.



### a2: Endpoint props in a separate side-table keyed by entity id

Add the 'externalEndpoint' EntityKind + four RelationKinds, but store protocol/resolved/target/rawExpression in a dedicated endpoint-props sub-DB keyed by the entity id rather than inline on EntityRow.



**Rejected because:** Functionally reaches ac1/ac2 but weakens sc1/k2: it splits an endpoint's identity across EntityRow + a side-row so the deterministic-id/dedup invariant must hold across two stores, and adds a new sub-DB + codec + join for a niche node kind — diverging from the inline-optional-field pattern existing entity fields already use. (s3: partial on sc1 and k2.)

### a3: Materialize a parallel DEPENDS_ON edge per boundary edge (leave traversal untouched)

Same node + four boundary RelationKinds as a1, but achieve closure participation by ALSO writing a real DEPENDS_ON edge alongside each boundary edge, so the existing closure kindFilter is unchanged.



**Rejected because:** Avoids touching traversal but doubles edges per call-site and introduces a desync integrity hazard (a boundary edge missing its shadow, or vice versa), and conflates the semantic DEPENDS_ON kind with boundary kinds so 'real code dep vs external boundary' is no longer readable from the edge kind alone — more storage + risk for no benefit over a1's kindFilter change. (s3: partial on k1 and sc1.)

## Citations

- **[[c1]]** `analyze-bundle` `s1 data-model.trace — src/shared/types.ts EntityKind:515 / RelationKind:529 / Entity:539` — "EntityKind is a code-only string union; RelationKind is intra-code; the Entity record carries id (deterministic SHA256(repo+file+kind+name) hex-32) + optional fields. S001 adds one EntityKind + four R"
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — src/db/graph/ids.ts (u64 store id vs deterministic string id)` — "The per-repo ExternalEndpoint dedup keys off the DETERMINISTIC STRING id — SHA256(repo + '' + 'externalEndpoint' + protocol + ':' + (target||rawExpression)) — so two call-sites to the same target in o"
- **[[c3]]** `analyze-bundle` `s1 usage.example — src/db/graph/codec.ts + keys.ts (additive-decode precedent)` — "decodeRepoRow shows the additive-decode pattern (kind: raw.kind ?? 'workspace'); adding a new EntityKind string + new RelationKind byte values is additive to the codec."
- **[[c4]]** `analyze-bundle` `s1 usage.example — src/db/graph/traversal.ts transitiveClosure:134 (kindFilter)` — "For ac2 the four ExternalBoundaryRelation kinds must be INCLUDED in whichever kindFilter the closure uses; the change is additive."
- **[[c5]]** `analyze-bundle` `s1 data-model.trace — src/db/graph/migrations.ts (no data migration for additive kinds)` — "The new EntityKind/RelationKind values are purely ADDITIVE — no data-rewrite migration is required; a schema_version bump is optional (a marker)."
- **[[c6]]** `prior-artifact` `HLD 914cbf5ea9026b92 — sc1 ExternalEndpoint graph vocabulary (ownedByStory s1)` — "The first-class node kind + four typed boundary edge kinds, the per-repo deterministic endpoint id, and their participation in the DEPENDS_ON closure."
- **[[c7]]** `step-output` `s3 alternatives.judge — winner a1 over a2/a3` — "a1 is the only alternative scoring satisfies on sc1 + k1 + k2 together with the smallest additive surface."

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**0 HIGH · 1 MED · 9 LOW** · model `client` · reviewed 2026-08-06T16:59:09.659Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| data-model/keys | citation | MED | assisted | src/db/graph/keys.ts maps each RelationKind to a u8 byte used in the edge key, where S001 appends four new bytes. | keys.ts owns BOTH byte maps: RELATION_KIND_BYTE (keys.ts:37) AND ENTITY_KIND_BYTE (keys.ts:77), each with `export type <Kind> = keyof typeof <MAP>`. The LLD's EntityKind data-model change lists call sites `src/shared/types.ts` + `src/db/graph/codec.ts` but OMITS `src/db/graph/keys.ts` — yet because EntityKind is re-derived as `keyof typeof ENTITY_KIND_BYTE`, adding the 'externalEndpoint' node kind REQUIRES appending it to ENTITY_KIND_BYTE in keys.ts too (exactly parallel to how the LLD already handles the new RelationKind byte). Left unstated, the build could add the member to shared/types.ts only and diverge the two EntityKind unions / miss the entity-kind byte. | Add src/db/graph/keys.ts (ENTITY_KIND_BYTE append) to the EntityKind data-model change's call sites + schemaDiff, mirroring the RelationKind entry. |
| data-model/EntityKind | citation | LOW | auto | EntityKind is a string union declared in src/shared/types.ts (cited around line 515) to which S001 adds 'externalEndpoint'. | Confirmed: src/shared/types.ts:515 `export type EntityKind =`. NOTE the evidence also shows a SECOND declaration at src/db/graph/keys.ts:77 `export type EntityKind = keyof typeof ENTITY_KIND_BYTE;` — keys.ts re-derives EntityKind from a byte map. The citation itself is accurate; the dual-declaration is the subject of cl3-adjacent finding below. | None — citation verified. |
| data-model/RelationKind | citation | LOW | auto | RelationKind is an intra-code string union declared in src/shared/types.ts (cited around line 529) to which S001 adds CALLS_HTTP/PUBLISHES_TO/SUBSCRIBES_TO/CALLS_RPC. | Confirmed: src/shared/types.ts:529 `export type RelationKind =` and src/db/graph/keys.ts:37 `export type RelationKind = keyof typeof RELATION_KIND_BYTE;`. The LLD correctly cites keys.ts for the RelationKind byte mapping. | None — citation verified. |
| data-model/Entity | citation | LOW | auto | The Entity record is declared in src/shared/types.ts (cited around line 539) carrying id/kind/name and optional fields (signature, isExported), which S001 extends with optional endpoint fields inline. | Confirmed: src/shared/types.ts:539 `export interface Entity`, codec.ts:132 `export interface EntityRow`, and src/shared/types.ts:565 `isExported?: boolean;` — the inline-optional-field pattern the LLD mirrors is real. | None — citation verified. |
| contract/transitiveClosure | citation | LOW | auto | transitiveClosure is defined in src/db/graph/traversal.ts (cited around line 134) and accepts a kindFilter over RelationKind used by the DEPENDS_ON closure. | Confirmed: transitiveClosure is exported from src/db/graph/traversal.js (imported in traversal.test.ts:23) and kindFilter is a real traversal option (outNeighbors/inNeighbors { kindFilter: [...] } across analyze/explore/*). Signature-level claim holds. | None — citation verified. |
| contract/decodeEntityRow | citation | LOW | auto | The graph codec src/db/graph/codec.ts defines encodeEntityRow/decodeEntityRow (EntityRow around line 133) as pass-through msgpack, and decodeRepoRow (around line 113) uses the additive-decode `?? default` precedent S001 relies on. | Confirmed: encodeEntityRow/decodeEntityRow exported from src/db/graph/codec.ts (codec.test.ts round-trips them), and the additive-decode precedent is real at src/db/graph/codec.ts:117 `kind: raw.kind ?? 'workspace'` (the LLD cited ~113; the pattern is at 117 — within the same decodeRepoRow block). | None — citation verified (line ~113 vs actual 117 is immaterial). |
| data-model/ids | citation | LOW | auto | src/db/graph/ids.ts allocates internal u64 store ids (allocateEntityId/allocateEntityIdInTxn), distinct from the deterministic SHA256 string Entity.id used for endpoint dedup. | Confirmed: src/db/graph/ids.ts exports allocateEntityId / allocateEntityIdInTxn (ids.test.ts + db/entities.ts:47 import). The u64-vs-deterministic-string-id duality the LLD relies on is real. | None — citation verified. |
| data-model/migrations | citation | LOW | auto | src/db/graph/migrations.ts is a forward-migration runner with a Migration registry and a schema_version meta key; S001 requires no data-rewrite migration. | Partially confirmed: the `schema_version` meta key + a forward-migration seam are real (migration-v2-to-v3.test.ts, derived-indices 'v1->v2 migration on env open'). The literal `Migration` type / `run(` method names did not grep in src, so the exact runner shape should be confirmed at build — but the load-bearing claim (an additive schema_version marker seam exists; no data-rewrite migration needed) holds. | Confirm the migration-runner type name at build time; no design change. |
| closed-union/boundary-kinds | closed-union | LOW | auto | The four boundary relation kinds CALLS_HTTP, PUBLISHES_TO, SUBSCRIBES_TO, CALLS_RPC are the complete set added, one per protocol boundary class. | Confirmed absent by design: CALLS_HTTP/PUBLISHES_TO/SUBSCRIBES_TO/CALLS_RPC do not yet exist in src — they are the NEW vocabulary this LLD introduces. Not a defect; the closed set of four is intentional (one per boundary class). | None — new symbols expected to be absent pre-build. |
| cross-artifact/sc1 | cross-artifact | LOW | auto | The HLD (914cbf5ea9026b92) owns sc1 ExternalEndpoint graph vocabulary with ownedByStory s1, which this LLD implements verbatim. | The src-only grep could not read the HLD artifact (evidence engine scoped to src/), so the cross-artifact trace is unverified by this pass. The HLD (docs/designs/HLD-work-framed-approved-spec-proceed-from.md, committed) does declare sc1 ownedByStory s1 — authored + reviewed this session. Low risk. | None — trace holds per the committed HLD. |

#### Proposed fixes

- **data-model/keys** (assisted) — keys.ts:77 shows EntityKind = keyof typeof ENTITY_KIND_BYTE, so a new node kind needs a byte in ENTITY_KIND_BYTE, not just a member in the shared/types.ts union. Make the EntityKind change symmetric with the RelationKind change (which already cites keys.ts).
  - edit: `src/shared/types.ts EntityKind: + | 'externalEndpoint'` → `src/shared/types.ts EntityKind: + | 'externalEndpoint' src/db/graph/keys.ts: append 'externalEndpoint' to the ENTITY_KIND_BYTE map (keys.ts re-derives `EntityKind = keyof typeof ENTITY_KIND_BYTE`, so the node kind needs a stable u8 byte here too, parallel to the new RelationKind bytes)`
