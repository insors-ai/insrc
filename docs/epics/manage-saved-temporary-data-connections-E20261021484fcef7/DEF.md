<!-- insrc:artifact DEF-484fcef7efaf229e -->

# Epic: manage-saved-temporary-data-connections

## Summary

**Flavor:** enhancement

Manage saved and temporary data connections from Settings without editing JSON. Required outcomes include draft tests, credential control, truthful save results, and safe removal. This is a delivery definition; acceptance checks remain pending implementation. Product scope is [[c1]], with runtime driver selection [[c9]] and an illustrative mock [[c8]].

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

Users need a discoverable way to maintain saved analysis sources and use one-off sources with an explicit lifetime. They need to know whether a change was saved and is available for analysis, retain control of credentials, and clean up registrations without deleting source data. This Epic defines those required outcomes; current implementation observations and gaps are recorded separately in its grounding evidence.

## 2. Functional requirements

- **E20261021484fcef7:FR001** — Required outcome: Users can manage all daemon-supported drivers across saved and temporary lifetimes with truthful outcomes and protected credentials.
- **E20261021484fcef7:FR002** — Required outcome: Connections remain repository scoped, and temporary connections are visible only within their originating workbench session.

**s1:**

- **E20261021484fcef7:S001:FR001** — Required outcome: Manage saved endpoints and credentials without losing configuration.

**s2:**

- **E20261021484fcef7:S002:FR001** — Required outcome: Test the current draft safely and show truthful results.

**s3:**

- **E20261021484fcef7:S003:FR001** — Required outcome: Use temporary connections within a workbench session.

**s4:**

- **E20261021484fcef7:S004:FR001** — Required outcome: Discard temporary and delete saved connections safely.

**s5:**

- **E20261021484fcef7:S005:FR001** — Required outcome: Manage and filter connections from Settings in both VS Code clients.

## 3. Non-goals

- **New drivers, automatic config discovery, ontology generation, team-shared credentials** — Required release boundary in [[c12]]: keep this release focused on connection management.

## 4. Assumptions

- `high` The CM01-CM08 PRD supplies the required product outcomes. The fictional mock does not verify production acceptance. [[c1]]
- `med` External IDE integration is a delivery dependency to verify during HLD; current pane reuse and compatibility are not assumed established by this definition. [[c11]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | Required delivery invariant (not an existing implementation guarantee): Daemon owns persistence and secrets; clients use IPC and never receive stored secret values. | [[c3]] |
| `k2` | contract | Required delivery invariant (not an existing implementation guarantee): Read failures and stale mutations preserve existing registry and credentials; uncertain responses reconcile idempotently. Read-failure preservation also follows CM06 [[c10]]. | [[c4]] |
| `k3` | contract | Required delivery invariant (not an existing implementation guarantee): Temporary scope is workbench-session and repository isolated, memory-only, and expires at session end or daemon restart. | [[c5]] |
| `k4` | invariant | Required delivery invariant (not an existing implementation guarantee): Removal never deletes source files or database data and refuses busy connections. | [[c6]] |
| `k5` | contract | Required delivery invariant (not an existing implementation guarantee): Preserve existing IPC clients through an explicit compatibility strategy and synchronize the separate IDE contract. | [[c7]] |

## 6. Stories

### 6.1 E20261021484fcef7:S001 — Manage saved endpoints and credentials without losing configuration

**User value:** `size: L`

Safely maintain saved sources. These are proposed delivery acceptance criteria, to be validated by this Story’s build; they do not assert existing production support.

**Extends:** [[c13]]

**Acceptance criteria:**

- **ac1:** Given A registered repository and supported driver, when the user adds or edits a saved connection, then Required result: Create rejects duplicate IDs, edit fixes ID/driver, non-secret fields populate, unknown supported fields survive, and Keep/Replace/Clear credentials apply explicitly; cancel changes nothing. _(operationalizes `k1`, `k2`)_
- **ac2:** Given Concurrent changes or an unreadable registry, when the user saves, then Required result: Stale edits cannot overwrite or recreate deleted entries; simultaneous creates yield one success; failed reads and mutations preserve registry and credentials. _(operationalizes `k1`, `k2`)_
- **ac3:** Given A successful or uncertain save, when the user receives the outcome, then Required result: Persistence, activation and refresh are separate; failed activation/refresh retries do not repeat create; lost responses reconcile the same operation before further mutation. _(operationalizes `k1`, `k2`)_

### 6.2 E20261021484fcef7:S002 — Test the current draft safely and show truthful results

**User value:** `size: L`

Verify reachability before saving without persisting drafts. These are proposed delivery acceptance criteria, to be validated by this Story’s build; they do not assert existing production support. Proposed delivery dependency rationale: [[c19]].

**Depends on:** `s1`

**Extends:** [[c14]]

**Acceptance criteria:**

- **ac1:** Given A current draft with retained or replacement credentials, when the user tests it, then Required result: The test uses the same merged configuration as Save, writes no draft config or secrets, sanitizes errors, shows duration, and never claims schema completeness. _(operationalizes `k1`, `k2`)_
- **ac2:** Given A pending test, when the draft changes, repository switches, or form closes, then Required result: Late results are ignored; repeated tests are disabled while pending, a 10-second timeout allows retry, and transient resources are released. _(operationalizes `k1`, `k2`)_

### 6.3 E20261021484fcef7:S003 — Use temporary connections within a workbench session

**User value:** `size: L`

Analyze one-off files or other supported sources without leaving saved connections. These are proposed delivery acceptance criteria, to be validated by this Story’s build; they do not assert existing production support. Proposed delivery dependency rationale: [[c20]].

**Depends on:** `s1`

**Extends:** [[c15]]

**Acceptance criteria:**

- **ac1:** Given A repository and active workbench session, when the user selects Temporary session and adds a source, then Required result: Config and credentials stay only in memory; duplicates across visible scopes fail; analysis in this session resolves it while other sessions cannot. _(operationalizes `k1`, `k3`)_
- **ac2:** Given Temporary connections exist, when the panel closes, repository switches, workbench session ends, or daemon restarts, then Required result: Panel closure and repository switching retain them; session end or daemon restart expires configs, secrets and resources; lifetime is explained before adding. _(operationalizes `k3`)_

### 6.4 E20261021484fcef7:S004 — Discard temporary and delete saved connections safely

**User value:** `size: L`

Clean up unused registrations without deleting data. These are proposed delivery acceptance criteria, to be validated by this Story’s build; they do not assert existing production support. Proposed delivery dependency rationale: [[c21]].

**Depends on:** `s1`, `s3`

**Extends:** [[c16]]

**Acceptance criteria:**

- **ac1:** Given A saved or temporary row, when the user selects Delete or Discard, then Required result: Confirmation identifies ID and scope and protects source data; cancel preserves it; successful revision-checked removal removes only registration and owned credentials and releases idle resources. _(operationalizes `k1`, `k2`, `k3`, `k4`)_
- **ac2:** Given A connection is busy, stale, or removal fails or has an uncertain response, when the user attempts removal, then Required result: Busy/stale failures retain the row with retry guidance; uncertain outcomes reconcile idempotently and no new analysis resolves a successfully removed connection. _(operationalizes `k2`, `k4`)_

### 6.5 E20261021484fcef7:S005 — Manage and filter connections from Settings in both VS Code clients

**User value:** `size: L`

Find and maintain connections in the editor. These are proposed delivery acceptance criteria, to be validated by this Story’s build; they do not assert existing production support. Proposed delivery dependency rationale: [[c22]].

**Depends on:** `s1`, `s2`, `s3`, `s4`

**Extends:** [[c17]]

**Acceptance criteria:**

- **ac1:** Given The user searches insrc connections in Settings, when they choose Manage Connections, then Required result: The themed editor retains the selected registered repository; multi-root selection is explicit, all daemon-supported drivers are offered, and existing palette/editor entry points share behavior. _(operationalizes `k1`, `k5`)_
- **ac2:** Given A selected repository, when the user lists, filters, adds or edits connections, then Required result: All/Saved/Temporary filters show scope badges and matching counts; loading, empty registry, empty filter, failed read and offline states differ; new adds become visible and dirty form navigation offers discard/cancel. _(operationalizes `k1`, `k3`, `k5`)_
- **ac3:** Given Dark/light themes, keyboard users, or mixed client/daemon versions, when the manager is exercised, then Required result: Controls have labels and visible focus, errors retain drafts, secrets stay masked, and explicit compatibility behavior is verified in extension and IDE-fork integration. _(operationalizes `k1`, `k5`)_

## 7. References

- **[[c1]]** `doc` `docs/connection-management-prd.html:41`
- **[[c2]]** `code` `src/daemon/db-rpc.ts:131`
- **[[c3]]** `doc` `docs/connection-management-prd.html:355`
- **[[c4]]** `doc` `docs/connection-management-prd.html:357`
- **[[c5]]** `doc` `docs/connection-management-prd.html:57`
- **[[c6]]** `doc` `docs/connection-management-prd.html:58`
- **[[c7]]** `doc` `docs/connection-management-prd.html:358`
- **[[c8]]** `doc` `docs/connection-management-prd.html:63`
- **[[c9]]** `doc` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/review-anchors.md:12`
- **[[c10]]** `doc` `docs/connection-management-prd.html:56`
- **[[c11]]** `doc` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/review-anchors.md:13`
- **[[c12]]** `doc` `docs/connection-management-prd.html:289`
- **[[c13]]** `doc` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/review-anchors.md:3`
- **[[c14]]** `doc` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/review-anchors.md:4`
- **[[c19]]** `doc` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/review-anchors.md:8`
- **[[c15]]** `doc` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/review-anchors.md:5`
- **[[c20]]** `doc` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/review-anchors.md:9`
- **[[c16]]** `doc` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/review-anchors.md:6`
- **[[c21]]** `doc` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/review-anchors.md:10`
- **[[c17]]** `doc` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/review-anchors.md:7`
- **[[c22]]** `doc` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/review-anchors.md:11`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 25 LOW** · model `cli-codex:gpt-6-astra` · reviewed 2026-10-21T06:32:56.627Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | cross-artifact | LOW | manual | The PRD at docs/connection-management-prd.html:41 supplies the CM01–CM08 product outcomes used as the scope of this Epic. | docs/connection-management-prd.html:41 explicitly lists CM01–CM08 as the product baseline, covering discovery/listing through discard/delete, and states these are required outcomes rather than assertions of existing production behavior. This confirms the cited source of the Epic’s product outcomes. | none — verified sound |
| c2 | citation | LOW | manual | The otherwise unused code reference c2 resolves to source at src/daemon/db-rpc.ts:131; the artifact attaches no specific behavioral assertion to this reference. | src/daemon/db-rpc.ts:131 resolves to `export async function saveConnectionRpc(params: {`, confirming that c2 points to existing source. No behavioral assertion requires further verification. | none — verified sound |
| k1 | cross-artifact | LOW | manual | The PRD at docs/connection-management-prd.html:355 supports k1 as a delivery requirement that the daemon own persistence and secrets and clients use IPC without receiving stored secret values. | docs/connection-management-prd.html:355 explicitly states the delivery invariant: the daemon owns connection persistence and secrets, clients use IPC, and stored secret values must never be returned to clients. It identifies this as required behavior, not current implementation, confirming the premise. | none — verified sound |
| k2 | cross-artifact | LOW | manual | The PRD at docs/connection-management-prd.html:357 supports k2 as a delivery requirement that read failures and stale mutations preserve registry and credentials and uncertain mutation responses reconcile idempotently. | docs/connection-management-prd.html:357 explicitly requires failed registry reads and rejected stale mutations to preserve registry contents and stored credentials unchanged. It also requires unknown mutation responses to reconcile idempotently using the same operation ID before another mutation, with activation/refresh retries not repeating creation. This confirms the premise. | none — verified sound |
| k3 | cross-artifact | LOW | manual | The PRD at docs/connection-management-prd.html:57 supports k3 as a delivery requirement that temporary connections be isolated by workbench session and repository, remain memory-only, and expire at session end or daemon restart. | docs/connection-management-prd.html:57 (CM07) explicitly binds temporary connections to the originating workbench session and selected repository, restricts analysis visibility to that session context, stores configs and credentials only in daemon memory, and expires them when the workbench session ends or the daemon restarts. This confirms the premise. | none — verified sound |
| k4 | cross-artifact | LOW | manual | The PRD at docs/connection-management-prd.html:58 supports k4 as a delivery requirement that connection removal never delete source files or database data and refuse busy connections. | docs/connection-management-prd.html:58 (CM08) explicitly states that “source files and database data are never deleted” and that “In-use connections return a clear busy error without removal,” confirming both requirements in the premise. | none — verified sound |
| k5 | cross-artifact | LOW | manual | The PRD at docs/connection-management-prd.html:358 supports k5 as a delivery requirement for an explicit existing-client compatibility strategy and synchronization of the separate IDE IPC contract. | docs/connection-management-prd.html:358 explicitly requires an existing-client compatibility strategy and synchronization of IPC method names and payload shapes with the separate IDE fork through mirrored types. It also makes existing-client behavior a design/build validation gate, confirming the premise. | none — verified sound |
| c8 | citation | LOW | manual | The material at docs/connection-management-prd.html:63 is an illustrative fictional mock and does not establish production acceptance of the Epic. | docs/connection-management-prd.html:63 explicitly labels the content “Fictional fixtures” and states that no network, daemon, credential storage, or persistent writes are performed. This confirms the mock does not establish production acceptance. | none — verified sound |
| c9 | cross-artifact | LOW | manual | The evidence at review-anchors.md:12 supports selecting runtime drivers from daemon-supported capabilities for this Epic. | The supplied read of review-anchors.md:12 explicitly requires runtime discovery and states that connection-manager choices must follow the daemon response. It identifies listDriverKindsRpc and its sorted listRegisteredKinds response, directly supporting the premise. | none — verified sound |
| k2 | cross-artifact | LOW | manual | CM06 at docs/connection-management-prd.html:56 independently supports k2's required preservation of existing configuration on a registry read failure. | docs/connection-management-prd.html:56 identifies CM06 and explicitly states: “A registry read failure blocks all mutations, including direct RPC calls, and leaves registry bytes and credentials unchanged.” This directly supports the required preservation of existing configuration on registry read failure. | none — verified sound |
| c11 | cross-artifact | LOW | manual | The evidence at review-anchors.md:13 treats external IDE integration as a delivery dependency requiring HLD verification and does not establish current pane reuse or compatibility. | review-anchors.md:13 explicitly labels an “External IDE dependency” and requires HLD to verify the external contract and plan integration before claiming compatibility. It reports the PRD's IDE pane/service without establishing current reuse, and rejects author inspection or a local summary as independent external verification. This confirms the premise. | none — verified sound |
| c12 | cross-artifact | LOW | manual | The release boundary at docs/connection-management-prd.html:289 excludes new drivers, automatic configuration discovery, ontology generation, and team-shared credentials from this Epic. | docs/connection-management-prd.html:289 explicitly states that “automatic application-config discovery, new drivers, ontology generation, and team-shared credentials are outside this small release,” confirming the premise’s exclusions. | none — verified sound |
| s1 | cross-artifact | LOW | manual | The material identified at review-anchors.md:3 is the antecedent extended by S001's proposed management of saved endpoints and credentials without configuration loss. | review-anchors.md:3 explicitly identifies the existing saved capability for s1: saveConnectionRpc at src/daemon/db-rpc.ts:131, URL-password extraction at :148, registry-read failure treated as [] at :154, existing-ID filtering at :155, and persistence at :156. It distinguishes safe create/update, revisions, and rollback as new requirements. This supports the premise that the cited material is the antecedent being extended, without claiming existing protection against configuration loss. | none — verified sound |
| s2 | cross-artifact | LOW | manual | The material identified at review-anchors.md:4 is the antecedent extended by S002's proposed safe testing of the current connection draft with truthful results. | review-anchors.md:4 explicitly identifies the existing s2 test capability as testConnectionRpc at src/daemon/db-rpc.ts:224, describing a transient driver and duration result. It distinguishes shared Save/Test draft semantics, sanitized errors, a deadline, and late-result suppression as required build outcomes. This confirms the cited material is the antecedent S002 extends. | none — verified sound |
| s3 | cross-artifact | LOW | manual | The material identified at review-anchors.md:5 is the antecedent extended by S003's proposed use of temporary connections within a workbench session. | The supplied read of docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/review-anchors.md:5 explicitly identifies the existing temporary capability for s3: registerEphemeral(config: ConnectionConfig) at src/daemon/db/pool.ts:159 and repository-keyed CACHE at src/daemon/db/pool-cache.ts:26. It distinguishes a workbench-session-isolated overlay and expiry as new delivery requirements, confirming the stated antecedent relationship. | none — verified sound |
| s4 | cross-artifact | LOW | manual | The material identified at review-anchors.md:6 is the antecedent extended by S004's proposed safe removal of saved and temporary registrations. | The supplied read of docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/evidence/review-anchors.md:6 explicitly identifies the existing removal capability for s4 as deleteConnectionRpc at src/daemon/db-rpc.ts:179, describing registration rewriting and secret-reference deletion. It distinguishes revision checks, busy-use refusal, and operation reconciliation as new delivery requirements, confirming the stated antecedent relationship. | none — verified sound |
| s5 | cross-artifact | LOW | manual | The material identified at review-anchors.md:7 is the antecedent extended by S005's proposed connection management and filtering from Settings in both VS Code clients. | review-anchors.md:7 explicitly identifies the existing integration foundation for s5: configuration contributions in vscode-plugin/package.json and db.listConnections/db.saveConnection registrations at src/daemon/index.ts:1769/:1777. It identifies Settings management wiring and separate IDE integration as required delivery work, consistent with S005 extending that foundation rather than assuming both clients are already supported. | none — verified sound |
| s2 | ordering | LOW | manual | The proposed delivery dependency S002 → S001 is supported by the rationale at review-anchors.md:8. | review-anchors.md:8 explicitly declares “s2 dependsOn s1” and explains that draft tests must use the same accepted configuration and credential semantics as saved mutation. This supports S002 → S001 as the author's proposed delivery ordering, not an ordering inferred from current code. | none — verified sound |
| s3 | ordering | LOW | manual | The proposed delivery dependency S003 → S001 is supported by the rationale at review-anchors.md:9. | review-anchors.md:9 explicitly declares “s3 dependsOn s1” because temporary creation reuses the accepted safe-configuration and duplicate-ID rules while retaining state in memory. This confirms the proposed S003 → S001 delivery dependency and its rationale. | none — verified sound |
| s4 | ordering | LOW | manual | The proposed delivery dependency S004 → S001 is supported by the rationale at review-anchors.md:10. | review-anchors.md:10 explicitly states “s4 dependsOn s1 and s3” and explains that Delete covers saved ownership and Discard covers temporary ownership. This confirms the proposed S004 → S001 delivery dependency. | none — verified sound |
| s4 | ordering | LOW | manual | The proposed delivery dependency S004 → S003 is supported by the rationale at review-anchors.md:10. | review-anchors.md:10 explicitly states “s4 dependsOn s1 and s3” and explains that Delete covers saved ownership while Discard covers temporary ownership. This supports the stated proposed delivery dependency S004 → S003. | none — verified sound |
| s5 | ordering | LOW | manual | The proposed delivery dependency S005 → S001 is supported by the rationale at review-anchors.md:11. | review-anchors.md:11 explicitly declares “s5 dependsOn s1, s2, s3 and s4” and explains that client integration consumes saved editing, draft tests, temporary lifecycle and removal. This supports S005 depending on S001 as proposed delivery ordering. | none — verified sound |
| s5 | ordering | LOW | manual | The proposed delivery dependency S005 → S002 is supported by the rationale at review-anchors.md:11. | review-anchors.md:11 explicitly declares “s5 dependsOn s1, s2, s3 and s4” and explains that client integration consumes saved editing, draft tests, temporary lifecycle and removal. This confirms the proposed S005 dependency on S002 as delivery ordering. | none — verified sound |
| s5 | ordering | LOW | manual | The proposed delivery dependency S005 → S003 is supported by the rationale at review-anchors.md:11. | review-anchors.md:11 explicitly states “s5 dependsOn s1, s2, s3 and s4” and explains that client integration consumes saved editing, draft tests, temporary lifecycle and removal. This supports the proposed S005 dependency on S003 as delivery ordering. | none — verified sound |
| s5 | ordering | LOW | manual | The proposed delivery dependency S005 → S004 is supported by the rationale at review-anchors.md:11. | review-anchors.md:11 explicitly states “s5 dependsOn s1, s2, s3 and s4” and explains that client integration consumes saved editing, draft tests, temporary lifecycle and removal. This supports the proposed S005 → S004 dependency. | none — verified sound |
