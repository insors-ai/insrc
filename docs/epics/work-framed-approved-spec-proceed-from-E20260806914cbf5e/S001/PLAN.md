<!-- insrc:artifact PLAN-914cbf5ea9026b92-s1 -->

# Plan: E20260806914cbf5e:S001

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1786032756701-97jw9l`
**LLD effective hash:** `fd544bcd90a0...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the four boundary RelationKinds (bytes 13-16) + 'externalEndpoint' EntityKind (byte 13) to the graph vocabulary | S | — | unit: RelationKind->byte map exhaustive uniqueness assertion (no duplicate byte; the four boundary kinds appended at 13-16 after existing); unit: encode/decode of each of the four boundary RelationKind edge bytes (CALLS_HTTP/PUBLISHES_TO/SUBSCRIBES_TO/CALLS_RPC) round-trips via kindByteToName; unit: ENTITY_KIND_BYTE contains externalEndpoint=13 and entityKindByteToName round-trips it; ExternalBoundaryRelation + ExternalProtocol names match sc1 exactly (frozen-vocabulary fixture) | [[c1]] [[c2]] |
| 2 | **`t2`** Add optional endpoint fields to EntityRow (codec) and the domain Entity, threaded through the Entity<->EntityRow mapping | M | `t1` | unit: encodeEntityRow/decodeEntityRow round-trip of an externalEndpoint EntityRow (resolved and unresolved variants, all endpoint fields present/absent); unit: forward-compatible decode: a pre-S001 EntityRow (no endpoint fields) decodes unchanged with endpoint fields === undefined (no throw, no field loss); unit: ExternalEndpointEntity field set + protocol enum ('http'\\|'messaging'\\|'rpc') matches sc1 on the domain Entity; non-endpoint entity maps through entities.ts unchanged | [[c3]] |
| 3 | **`t3`** Deterministic per-repo endpoint-id derivation reusing the existing entity-id convention | M | `t1` | unit: deterministic endpoint id (repo + '' + 'externalEndpoint' + protocol + ':' + (target\\|\\|rawExpression)) - same inputs => same id; per-repo distinctness (k2 dedup); unit: unresolved endpoint (resolved:false, target:'') derives its id from rawExpression, distinct from a resolved same-protocol endpoint | [[c3]] [[c4]] |
| 4 | **`t4`** Canonical DEPENDS_ON-closure kind set including the four boundary kinds (export + entity-level reachability only) | M | `t1` | integration: transitiveClosure from a repo root reaches its externalEndpoint node via a boundary edge when the closure kindFilter includes the four boundary kinds (ac2); integration: closure over an existing-kinds-only graph is byte-identical to pre-S001 (additive invariant; resolveClosure repo-level DEPENDS_ON unchanged); integration: per-repo dedup: two boundary edges from two call-sites to the same resolved target+protocol resolve to a single endpoint node (k2); integration: two repos reaching the same target produce two distinct per-repo endpoint nodes | [[c5]] |
| 5 | **`t5`** Bump SCHEMA_VERSION 3->4 with a no-op additive migration step | S | `t1`, `t2` | integration: opening a v3 index advances schema_version to 4 via the no-op 3->4 step leaving every existing entity/edge row byte-identical (mirrors migration-v2-to-v3.test.ts) | [[c5]] |

### E20260806914cbf5e:S001:T001 — Add the four boundary RelationKinds (bytes 13-16) + 'externalEndpoint' EntityKind (byte 13) to the graph vocabulary

In src/db/graph/keys.ts append CALLS_HTTP=13, PUBLISHES_TO=14, SUBSCRIBES_TO=15, CALLS_RPC=16 to RELATION_KIND_BYTE and 'externalEndpoint'=13 to ENTITY_KIND_BYTE (append-only, no reorder). Mirror the additions in the domain unions in src/shared/types.ts (RelationKind gains the four boundary kinds; EntityKind gains 'externalEndpoint'). Add `type ExternalProtocol = 'http'|'messaging'|'rpc'` to shared/types.ts. The existing keyof-typeof derivations + reverse-lookup maps (kindByteToName/entityKindByteToName) pick up the new members automatically.

**Acceptance checks:**
- src/db/graph/keys.ts RELATION_KIND_BYTE contains CALLS_HTTP=13, PUBLISHES_TO=14, SUBSCRIBES_TO=15, CALLS_RPC=16 and ENTITY_KIND_BYTE contains externalEndpoint=13, with no reordered or reused existing byte
- src/shared/types.ts RelationKind union includes the four boundary kinds, EntityKind union includes 'externalEndpoint', and ExternalProtocol is exported
- tsc compiles with the two EntityKind/RelationKind declarations (shared/types.ts + keys.ts keyof-typeof) in agreement

### E20260806914cbf5e:S001:T002 — Add optional endpoint fields to EntityRow (codec) and the domain Entity, threaded through the Entity<->EntityRow mapping

Add optional protocol?: ExternalProtocol, resolved?: boolean, target?: string, rawExpression?: string to EntityRow in src/db/graph/codec.ts and to the domain Entity in src/shared/types.ts (only set for kind==='externalEndpoint'; modeled like existing optional fields). encodeEntityRow/decodeEntityRow stay pure msgpack pass-throughs (absent optional keys decode as undefined => forward-compatible). Thread the new fields through the Entity->EntityRow and EntityRow->Entity conversion in src/db/entities.ts so an externalEndpoint entity round-trips its endpoint fields, and a NON-externalEndpoint entity maps through unchanged (no spurious endpoint keys).

**Acceptance checks:**
- EntityRow (codec.ts) and Entity (shared/types.ts) each carry optional protocol/resolved/target/rawExpression
- the Entity<->EntityRow mapper in src/db/entities.ts copies the endpoint fields for externalEndpoint entities and leaves non-endpoint entities byte-identical (no added endpoint keys)
- encodeEntityRow(decodeEntityRow(x)) round-trips an externalEndpoint row and a pre-S001 (no-endpoint-fields) row identically

### E20260806914cbf5e:S001:T003 — Deterministic per-repo endpoint-id derivation reusing the existing entity-id convention

Locate the canonical deterministic entity-id derivation (createHash('sha256')...digest('hex').slice(0,N) per src/indexer/index.ts / src/db/relations.ts) and derive the externalEndpoint id from (repo, file='', kind='externalEndpoint', name = protocol + ':' + (target || rawExpression)) using the SAME hash + slice length the rest of the graph uses (hex-16, not a new hex-32 scheme). Ensure repeated call-sites to one target+protocol in one repo produce one id (per-repo dedup, k2) and the same target in two repos produces two ids.

**Acceptance checks:**
- the endpoint-id helper reuses the existing entity-id hash function/slice length rather than introducing a new SHA256 length
- same (repo, protocol, target||rawExpression) inputs always yield the same id; differing repo yields a different id
- an unresolved endpoint (resolved:false, target:'') derives its id from rawExpression

### E20260806914cbf5e:S001:T004 — Canonical DEPENDS_ON-closure kind set including the four boundary kinds (export + entity-level reachability only)

Introduce ONE exported canonical constant (e.g. DEPENDS_ON_CLOSURE_KINDS = ['DEPENDS_ON','CALLS_HTTP','PUBLISHES_TO','SUBSCRIBES_TO','CALLS_RPC']) as the single source of truth for 'what counts as a dependency-closure edge'. SCOPE: export the set and prove entity-level reachability via transitiveClosure under it; LEAVE src/db/search.ts resolveClosure's repo-level ['DEPENDS_ON'] semantics UNCHANGED (that pass is repo->repo reachability; boundary edges are entity-level) so repo-scoping does not regress. Additive: with no boundary edges present, any closure using the set returns exactly what ['DEPENDS_ON'] returned.

**Acceptance checks:**
- a single exported canonical closure-kind set contains DEPENDS_ON + the four boundary kinds and is the referenced source of truth (no scattered literal boundary-kind lists)
- a transitiveClosure from a code entity under the canonical set reaches a linked externalEndpoint node via its boundary edge
- src/db/search.ts resolveClosure repo-level DEPENDS_ON reachability is unchanged, and a graph with zero boundary edges yields a closure byte-identical to the pre-S001 ['DEPENDS_ON'] result

### E20260806914cbf5e:S001:T005 — Bump SCHEMA_VERSION 3->4 with a no-op additive migration step

Bump SCHEMA_VERSION in src/db/graph/store.ts from 3 to 4 (per the keys.ts 'bump SCHEMA_VERSION when adding' convention) and register a forward-migration step 3->4 in src/db/graph/migrations.ts whose run() is a no-op (the new EntityKind/RelationKind values are additive; existing rows never carry them and decode unchanged, so NO row rewrite). This keeps store-open version checks coherent (an index written by v4 code auto-advances a v3 index on open; newer-index-on-older-code is the tolerated, unsupported single-daemon-build skew per the LLD error case) without any destructive rebuild.

**Acceptance checks:**
- SCHEMA_VERSION is 4 in store.ts and a 3->4 migration step is registered in migrations.ts so a v3 index auto-advances to v4 on open (no manual step)
- the 3->4 step's run() performs no row rewrite (no-op), and opening a v3 index advances it to v4 leaving every existing entity/edge row byte-identical
- opening a freshly created v4 store round-trips existing entities unchanged

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| encodeEntityRow/decodeEntityRow round-trip of an externalEndpoint EntityRow (resolved and unresolved variants, all endpoint fields present/absent) | `t2` |
| encode/decode of each of the four boundary RelationKind edge bytes (CALLS_HTTP/PUBLISHES_TO/SUBSCRIBES_TO/CALLS_RPC) | `t1` |
| RelationKind→byte map exhaustive uniqueness assertion (no duplicate byte; new bytes appended after existing) | `t1` |
| deterministic endpoint id = SHA256(repo + '' + 'externalEndpoint' + protocol + ':' + (target\|\|rawExpression)) hex-32 — same inputs → same id; per-repo distinctness | `t3` |
| transitiveClosure from a repo root reaches its externalEndpoint node via a boundary edge when the closure kindFilter includes the four boundary kinds (ac2) | `t4` |
| closure over an existing-kinds-only graph is byte-identical to pre-S001 (additive invariant) | `t4` |
| per-repo dedup: two boundary edges from two call-sites to the same resolved target+protocol resolve to a single endpoint node (k2) | `t4`, `t3` |
| two repos reaching the same target produce two distinct per-repo endpoint nodes | `t4`, `t3` |
| ExternalEndpointEntity field set + protocol enum ('http'\|'messaging'\|'rpc') matches sc1 | `t2`, `t1` |
| the four ExternalBoundaryRelation names match sc1 exactly | `t1` |
| forward-compatible decode: a pre-S001 row/edge decodes unchanged (no throw, no field loss) | `t2`, `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 dataModel: EntityKind + RelationKind vocabulary (src/shared/types.ts)` — "EntityKind gains 'externalEndpoint'; RelationKind gains CALLS_HTTP/PUBLISHES_TO/SUBSCRIBES_TO/CALLS_RPC."
- **[[c2]]** `analyze-bundle` `s1 PlanContext data-model.ground: keys.ts byte maps (RELATION_KIND_BYTE 12, ENTITY_KIND_BYTE 12, append-only)` — "boundary RelationKinds take bytes 13/14/15/16; 'externalEndpoint' takes ENTITY_KIND_BYTE 13; u8 slots fixed, additive-only."
- **[[c3]]** `analyze-bundle` `s1 PlanContext data-model.ground: codec EntityRow vs domain Entity + entities.ts mapping (endpoint optional fields)` — "endpoint optional fields (protocol/resolved/target/rawExpression) added to both Entity (shared/types.ts) and EntityRow (codec.ts); mapper in entities.ts threads them; msgpack decode is forward-compati"
- **[[c4]]** `analyze-bundle` `s1 PlanContext symbol.locate: deterministic entity-id derivation (indexer/index.ts contentHash hex-16, ids.ts u64 duality)` — "reuse the existing entity-id hash function/slice length (hex-16) for the per-repo endpoint id; name=(protocol + ':' + (target||rawExpression)), file=''."
- **[[c5]]** `analyze-bundle` `s1 PlanContext symbol.locate + data-model.ground: transitiveClosure/search.ts resolveClosure + SCHEMA_VERSION seam (store.ts=3, migrations.ts runner)` — "canonical DEPENDS_ON_CLOSURE_KINDS incl. the four boundary kinds; resolveClosure repo-level DEPENDS_ON unchanged; bump SCHEMA_VERSION 3->4 with a no-op 3->4 migration (no row rewrite)."
