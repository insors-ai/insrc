# Connection-management grounding and review remediation

This is durable grounding for DEF-484fcef7efaf229e, replacing its transient scope.assess label.
The definition is a proposed delivery contract. Neither its acceptance criteria nor the mock prove production implementation.
The author has addressed the findings below; only an independent review can clear the blocking stamp.

## Current implementation observations (not desired-state guarantees)

- src/daemon/db-rpc.ts:83-110 defines listConnectionsRpc; failed reads return an empty list.
- src/daemon/db-rpc.ts:131-167 defines saved mutations: password extraction occurs before registry loading, read errors fall back to [], save upserts by ID, and activation errors are not a separate result. This does not meet the proposed safe-create/update contract.
- src/daemon/db-rpc.ts:173-218 defines removal of registration and a keychain reference; it provides no expected-revision or busy-use guard. Source data deletion is not part of that handler.
- src/daemon/db-rpc.ts:235-294 defines transient testing; it returns factory success/duration and closes a constructed driver, but does not establish the new deadline, cancellation, sanitization or draft-revision requirements.
- src/daemon/db/config.ts:40-49 derives a repository-specific registry path; src/daemon/db/config.ts:148-158 writes the file.
- src/daemon/db/pool-cache.ts:27-42 caches a pool per repository; src/daemon/db/pool.ts:151-174 registers ephemeral entries in that pool. Workbench-session isolation and expiry are delivery requirements, not verified existing guarantees.
- src/analyze/runtimes/data/discovery-connections.ts:70-89 acquires a repository pool and lists visible configs, projecting safe metadata. Session-scoped resolution must be designed and built.
- src/daemon/index.ts:1769-1788 registers the connection IPC methods.
- /Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/browser/dbDrivers/insrcDbConnectionsServiceImpl.ts:34-99 calls list/save/remove/test through daemon RPC; the list catch returns []. This verifies an integration surface, not drop-in compatibility.

## Driver inventory at inspection

Registered SQL kinds: postgres, cockroachdb, mysql, mariadb, sqlite, mssql, oracle, clickhouse.
Registered KV kinds: redis, valkey, keydb, mongodb, cassandra, nats, dynamodb, etcd, memcached.
Registered file kinds: csv, tsv, jsonl, ndjson, json, parquet, arrow, feather, avro, bson, fixed-width, xlsx.
Registration anchors: src/daemon/db/drivers/index.ts:17-39; src/daemon/db/drivers/duckdb-file.ts:130-134 and src/daemon/db/drivers/duckdb-file.ts:694-707.
Required coverage is the daemon-returned driver set at runtime, not a hard-coded UI catalog. Both saved and temporary scope must be acceptance-tested; this is not claimed to work today.

## Requirement anchors and prototype limits

- CM01: docs/connection-management-prd.html:51-58. Required future behavior; not a production capability claim.
- CM02: docs/connection-management-prd.html:60-66. Required future behavior; not a production capability claim.
- CM03: docs/connection-management-prd.html:68-78. Required future behavior; not a production capability claim.
- CM04: docs/connection-management-prd.html:80-90. Required future behavior; not a production capability claim.
- CM05: docs/connection-management-prd.html:92-104. Required future behavior; not a production capability claim.
- CM06: docs/connection-management-prd.html:106-115. Required future behavior; not a production capability claim.
- CM07: docs/connection-management-prd.html:117-130. Required future behavior; not a production capability claim.
- CM08: docs/connection-management-prd.html:132-143. Required future behavior; not a production capability claim.

- Scope and integration: docs/connection-management-prd.html:304.
- Release exclusions: docs/connection-management-prd.html:376-381.
- Secret ownership and safe mutations: docs/connection-management-prd.html:327-341.
- Prototype listing/filtering: docs/connection-management-prd.html:421.
- Prototype add-form lifetime copy: docs/connection-management-prd.html:250.
- Prototype removal confirmation: docs/connection-management-prd.html:440.
- The embedded script is a fictional interaction fixture. Busy-use enforcement, real persistence, real secret handling, session termination and analyzer integration require production build validation.

## Explicit delivery ordering

These are declared planning dependencies, not claims inferred from current code.
- s1 has no prerequisites: defines safe saved configuration and mutation outcomes.
- s2 depends on s1: tests must honor the same draft/credential semantics.
- s3 depends on s1: temporary connections must share duplicate and safe-configuration rules without persistence.
- s4 depends on s1 and s3: removal handles both saved and temporary ownership.
- s5 depends on s1, s2, s3 and s4: final client integration consumes their behaviors.

## Analysis provenance

The initial six-exploration analyze pass profiled db-rpc, db, extension, imports, session candidates and conventions.
Its graph coverage was incomplete (nine missing-source relations); session concept resolution had confidence 0.224.
The executed response is retained in evidence/analyze-output.json; direct reads above supplement it.
This grounding does not claim all production callers or behavior have been verified.

## Finding-by-finding disposition

All finding IDs below refer to the retained round-2 report. No author-issued approval or review override is applied.

### p02 — 4/c1
Finding: The PRD and its clickable mock define the CM01–CM08 experience on which this definition relies.
Addressed: Narrowed the baseline assumption to the PRD; labeled the mock illustrative and production acceptance pending. See CM01-CM08 anchors above.

### p03 — 3/c1
Finding: The PRD release boundary excludes new drivers, automatic configuration discovery, ontology generation, and team-shared credentials.
Addressed: Added exact PRD release/constraint anchors above and line-qualified c1. All constraints explicitly say Required delivery invariant.

### p04 — c2
Finding: src/daemon/db-rpc.ts is the cited code anchor for the existing connection IPC contract.
Addressed: Added precise handler, daemon registration and external IDE RPC anchors; compatibility remains a required design/build outcome.

### p05 — c3
Finding: The scope.assess analyzeBundles[0] artifact contains the CM01–CM08 structural grounding referenced by all five stories.
Addressed: Replaced the transient c3 label with this durable grounding file; retained the executed analysis response and explicit current gaps.

### p06 — 4/c1
Finding: Reuse of the IDE-fork connection pane requires confirmation in the separate IDE repository before integration implementation.
Addressed: Inspected the IDE RPC service; revised assumption distinguishes existing surface from future reuse and compatibility validation.

### p07 — E20261021484fcef7:FR001
Finding: Connection management must cover every driver supported by the daemon for both saved and temporary connections.
Addressed: Recorded source-backed driver inventory and runtime-set coverage acceptance; no assertion that scope support already ships.

### p08 — E20261021484fcef7:FR002
Finding: Every saved and temporary connection is scoped to a repository.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p09 — k1
Finding: The daemon owns connection persistence and secrets, and clients access connection operations exclusively through IPC.
Addressed: Added precise handler, daemon registration and external IDE RPC anchors; compatibility remains a required design/build outcome.

### p10 — k1
Finding: No client-facing connection response exposes stored secret values.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p11 — k2
Finding: Connection registry read failures and rejected stale mutations preserve both existing registry contents and credentials.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p12 — k2
Finding: An uncertain mutation response must be reconciled idempotently before another mutation is issued.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p13 — k3
Finding: A temporary connection is visible and resolvable only in its originating workbench session and repository.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p14 — k3
Finding: Temporary connection configurations and credentials are held only in memory.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p15 — k3
Finding: Workbench session termination or daemon restart expires temporary connection configurations, secrets, and resources.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p16 — k4
Finding: Deleting or discarding a connection removes its registration without deleting source files or database data.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p17 — k4
Finding: Connection removal must reject a busy connection before mutating its registration or credentials.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p18 — k5
Finding: The connection IPC evolution must explicitly preserve existing clients and synchronize the contract with the separate IDE repository.
Addressed: Added precise handler, daemon registration and external IDE RPC anchors; compatibility remains a required design/build outcome.

### p19 — s1/ac1
Finding: Adding or editing a saved connection requires a registered repository and a daemon-supported driver.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p20 — s1/ac1
Finding: Creating a saved connection rejects a duplicate ID, while editing preserves the existing connection ID and driver.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p21 — s1/ac1
Finding: Editing a saved connection populates its non-secret fields and preserves supported fields unknown to the editor.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p23 — s1/ac1
Finding: Cancelling an add or edit leaves saved configuration and credentials unchanged.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p24 — s1/ac2
Finding: A stale edit cannot overwrite a newer connection revision or recreate a deleted connection.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p25 — s1/ac2
Finding: Simultaneous create operations for the same scoped connection ID produce exactly one successful creation.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p26 — s1/ac3
Finding: Save outcomes distinguish persistence, activation, and refresh so that activation or refresh failure does not imply persistence failure.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p27 — s1/ac3
Finding: Retrying activation or refresh after a successful create does not issue another create.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p28 — s2
Finding: Story s2 depends on story s1.
Addressed: Recorded explicit proposed dependency edges and their reasons above, matching body.stories.dependsOn.

### p29 — s2/ac1
Finding: Testing a draft uses the same merged configuration and retained or replacement credentials that Save would use.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p30 — s2/ac1
Finding: Testing a draft persists neither draft configuration nor draft secrets.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p31 — s2/ac1
Finding: A connection test reports reachability rather than guaranteeing schema completeness.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p32 — s2/ac1
Finding: Connection test results include elapsed duration and sanitize errors before exposing them to clients.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p33 — s2/ac2
Finding: Draft changes, repository switches, and form closure invalidate pending connection test results.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p35 — s2/ac2
Finding: Connection testing releases transient resources after completion, cancellation, or timeout.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p36 — s3
Finding: Story s3 depends on story s1.
Addressed: Recorded explicit proposed dependency edges and their reasons above, matching body.stories.dependsOn.

### p37 — s3/ac1
Finding: Temporary connection creation rejects an ID already present in any connection scope visible to the originating session and repository.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p38 — s3/ac2
Finding: Closing the connection panel or switching repositories retains temporary connections until their workbench session ends.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p39 — s3/ac2
Finding: The interface explains temporary connection lifetime before the user adds a temporary connection.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p40 — s4
Finding: Story s4 depends on both story s1 and story s3.
Addressed: Recorded explicit proposed dependency edges and their reasons above, matching body.stories.dependsOn.

### p41 — s4/ac1
Finding: Delete and Discard require confirmation identifying the connection ID and scope, and cancellation preserves the connection.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p42 — s4/ac1
Finding: Successful connection removal checks the expected revision, removes only the registration and its owned credentials, and releases idle resources.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p43 — s4/ac2
Finding: Busy or stale removal failures retain the connection row and provide retry guidance.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p44 — s4/ac2
Finding: After successful removal, new analysis operations cannot resolve the removed connection.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p45 — s5
Finding: Story s5 depends on stories s1, s2, s3, and s4.
Addressed: Recorded explicit proposed dependency edges and their reasons above, matching body.stories.dependsOn.

### p47 — s5/ac1
Finding: Searching Settings for insrc connections exposes a Manage Connections entry point.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p48 — s5/ac1
Finding: The connection editor retains the selected registered repository and requires explicit repository selection in multi-root workspaces.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p49 — s5/ac1
Finding: Existing command-palette and editor entry points share connection-management behavior with the Settings entry point.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p50 — s5/ac2
Finding: Connection list filters expose All, Saved, and Temporary views with scope badges and counts matching the selected repository and filter.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p51 — s5/ac2
Finding: The connection manager distinguishes loading, empty registry, empty filter, failed read, and offline states.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p52 — s5/ac2
Finding: A newly added connection becomes visible in the connection manager after successful creation.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p54 — s5/ac3
Finding: Both client integrations provide labeled controls and visible keyboard focus under dark and light themes.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p55 — s5/ac3
Finding: Connection-management errors retain the current draft while secret inputs remain masked.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p56 — s5/ac3
Finding: Compatibility behavior for mixed client and daemon versions must be verified in both extension and IDE-fork integration.
Addressed: Reframed as required future behavior in constraints and acceptance criteria; PRD CM01-CM08 anchors supply product authority. Current code gaps above are explicit; implementation verification remains a build acceptance gate.

### p57 — 5
Finding: The PRD citation c1 supports constraints k1, k2, k3, and k4 concerning secret ownership, mutation safety, temporary lifetime, and safe removal.
Addressed: Added exact PRD release/constraint anchors above and line-qualified c1. All constraints explicitly say Required delivery invariant.

### p58 — 6
Finding: Each story-level functional requirement maps to the corresponding numbered story, and every operationalizes reference names a constraint defined in this artifact.
Addressed: Checked every story functional requirement itemRef and operationalizes ID against the actual definition; all references resolve. This is internal consistency, not production evidence.

