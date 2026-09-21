<!-- insrc:artifact LLD-57298940cdc341bc-s1 -->

# LLD: E2026092157298940:S001

**Epic:** `expand-jetbrains-plugin-s-insrc-settings`
**HLD base run:** `wf-1789970136758-lvyg6v`
**HLD effective hash:** `7b17d6a14b2a...`

## HLD context

**Framework:** Chosen shape a1: three new child Settings pages (Daemon, Workflows, Debug) registered declaratively under the UNCHANGED parent insrc Configurable, each a thin Swing page on a shared abstract page-shell base; S001 (Phase A) delivers sc1 (nav scaffold + shell) and sc2 (rich daemonStatus() read).
**Rollout phase:** Phase A — Foundation (nav scaffold + shared status read)
**Owns:** `sc1` (NestedSettingsNavScaffold + SharedPageShell), `sc2` (DaemonStatusRead)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Daemon page body + lifecycle actions (S002-internal).
- `s3`: Workflows read-only chain reader + page (S003-internal).
- `s4`: Debug status card + orphan ProcessHandle seam; owns DebugPageHost (sc3). — owns `sc3`
- `s5`: MCP/sessions Debug section (S005-internal).
- `s6`: Log-editor Debug section (S006-internal).

## Contract details

**Surface level:** internal-shared

### `InsrcOpsConfigurable`

```typescript
abstract class InsrcOpsConfigurable : com.intellij.openapi.options.Configurable { protected abstract fun pageTitle(): String; protected abstract fun buildBody(): javax.swing.JComponent }
```

**Returns:** `abstract class (Configurable)` — sc1: the shared page-shell base. createComponent() builds a JBScrollPane over a ui/InsrcCollapsible.ScrollableColumn, runs buildBody() on executeOnPooledThread and mounts it via a disposed-guarded invokeLater; getDisplayName() delegates to pageTitle(); isModified()=false + no-op apply/reset defaults; subclasses supply only pageTitle()+buildBody().

**Errors:**
- `none (never throws to the EDT)` when buildBody() runs off the EDT; a throw renders a plain error label instead of propagating (k2).

**Preconditions:**
- Registered as an applicationConfigurable child via parentId=ai.insors.insrc.settings in plugin.xml.

**Postconditions:**
- A subclass implements one page via buildBody(); no subclass touches threading or the scroll shell.
- The parent InsrcSettingsConfigurable + its plugin.xml element are unchanged (lc1/k4).

### `DaemonConfigurable`

```typescript
class DaemonConfigurable : InsrcOpsConfigurable()
```

**Returns:** `Configurable (no-arg)` — The Daemon child page; S001 empty-but-navigable placeholder body, S002 fills it. Registered id ai.insors.insrc.daemon.

**Preconditions:**
- plugin.xml registers it under parentId=ai.insors.insrc.settings.

**Postconditions:**
- Nested child node under insrc; own page (ac1/ac2).

### `WorkflowsConfigurable`

```typescript
class WorkflowsConfigurable : InsrcOpsConfigurable()
```

**Returns:** `Configurable (no-arg)` — The Workflows child page; S001 placeholder, S003 fills it. Registered id ai.insors.insrc.workflows.

**Preconditions:**
- plugin.xml registers it under parentId=ai.insors.insrc.settings.

**Postconditions:**
- Nested child node; own page (ac1/ac2).

### `DebugConfigurable`

```typescript
class DebugConfigurable : InsrcOpsConfigurable()
```

**Returns:** `Configurable (no-arg)` — The Debug child page; S001 placeholder, S004 fills it (and owns sc3). Registered id ai.insors.insrc.debug.

**Preconditions:**
- plugin.xml registers it under parentId=ai.insors.insrc.settings.

**Postconditions:**
- Nested child node; own page (ac1/ac2).

### `DaemonGateway.daemonStatus`

```typescript
fun daemonStatus(): DaemonStatusResult
```

**Returns:** `DaemonStatusResult` — sc2: the rich daemon-status read. Loaded(DaemonStatusDto) on a decoded daemon.status reply; Stopped when the socket is unreachable; Unavailable(reason) on error/malformed. Never throws; app-scoped (no repo param); reuses METHOD_STATUS.

**Errors:**
- `DaemonStatusResult.Stopped` when rpc.call throws DaemonUnavailableException (no socket / refused).
- `DaemonStatusResult.Unavailable` when !r.ok || r.error != null, or any RuntimeException (malformed/transport fault), caught and mapped.

**Preconditions:**
- Uses the existing METHOD_STATUS='daemon.status' constant with empty params (no new method constant).

**Postconditions:**
- Mirrors repoStats()/registeredRepos() classification; Gson-Double coercion; existing probe() untouched.

## Data model changes

### `DaemonStatusDto` — new

Parsed daemon.status snapshot (sc2), realized to the true payload (src/shared/types.ts:882). Fields: running:Boolean (derived, always true in a Loaded), uptimeSec:Long (from `uptime`), queueDepth:Int, embeddingsPending:Int, modelPullStatus:String ('pulling'|'ready', default 'ready'), modelPullPct:Int? (absent→null), lmdbFileSizeMb:Int? (absent→null), repoCount:Int (=repos[].size). Gson Doubles coerced via (v as? Number)?.toInt()/toLong(). Faithful realization of the HLD type-level sc2 sketch: uptimeSec←uptime, modelPull→modelPullStatus, repoCount derived, socket dropped (S004 derives socket/version/pid locally). Sealed three-state shape + never-throws preserved. schemaDiff: + data class DaemonStatusDto(running: Boolean, uptimeSec: Long, queueDepth: Int, embeddingsPending: Int, modelPullStatus: String, modelPullPct: Int?, lmdbFileSizeMb: Int?, repoCount: Int).

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt (DaemonGatewayImpl.daemonStatus + parseDaemonStatus)`
- `consumed later by S002/S004 (out of S001 scope)`

### `DaemonStatusResult` — new

Sealed three-state outcome (sc2), verbatim from the HLD: Loaded(DaemonStatusDto) | Stopped (data object; reachable-negative) | Unavailable(reason). Distinct Stopped vs Unavailable so a consumer can offer Start vs surface an error. Mirrors RepoStatsResult/PendingQueryResult. schemaDiff: + sealed interface DaemonStatusResult { data class Loaded(val status: DaemonStatusDto); data object Stopped; data class Unavailable(val reason: String) }.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `consumed later by S002/S004 (out of S001 scope)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | S001 OWNS sc1: ships the abstract InsrcOpsConfigurable base + the three no-arg child Configurables registered under parentId=ai.insors.insrc.settings with empty-but-navigable bodies; parent untouched (lc1/k4). |
| `sc2` | implements | S001 OWNS sc2: adds daemonStatus()+DaemonStatusDto/DaemonStatusResult to DaemonGateway; consumed by S002/S004. |

## Error paths

### Error cases

- **The daemon is not running (socket absent / connection refused) when daemonStatus() is called.** (recoverable)
  - Detection: rpc.call(METHOD_STATUS, emptyMap()) throws DaemonUnavailableException, caught in daemonStatus() try/catch.
  - Response: Return DaemonStatusResult.Stopped — never rethrow, never fabricate a Loaded with zeros.
  - User impact: A consuming page (S002/S004) shows a real 'stopped' state and can offer Start; S001 guarantees the classification.
- **The daemon replies with an error, or the reply is malformed (missing/non-numeric fields, non-map payload).** (recoverable)
  - Detection: !r.ok || r.error != null after the call, or a RuntimeException in parseDaemonStatus coercion caught by the outer catch(RuntimeException).
  - Response: Return DaemonStatusResult.Unavailable(reason); numeric coercion defaults a missing/non-numeric field to 0, so only a structurally broken reply reaches Unavailable.
  - User impact: The consuming page shows a distinct 'status unavailable' line, not blank or fabricated numbers.
- **A child page's buildBody() throws on the pooled thread.** (recoverable)
  - Detection: InsrcOpsConfigurable wraps the off-EDT buildBody() call in try/catch.
  - Response: Marshal a plain error-label component back via the guarded invokeLater; the page still mounts.
  - User impact: The settings page opens with readable error text, not a broken panel or an IDE exception balloon (k2).
- **The Configurable is disposed (settings closed) before the off-EDT read completes.** (recoverable)
  - Detection: A @Volatile disposed flag set in disposeUIResources(); the guarded invokeLater checks it before mounting.
  - Response: Drop the late render (the established idiom); never touch a disposed component tree.
  - User impact: No exception or stale mutation after the user closes Settings.

### Edge cases

| Input | Expected |
| :--- | :--- |
| daemon.status omits optional modelPullPct + lmdbFileSizeMb (fresh daemon). | Those DTO fields are null; modelPullStatus defaults 'ready'; a valid Loaded is returned. |
| daemon.status has an empty repos[] array. | DaemonStatusDto.repoCount = 0; a valid Loaded (not Stopped/Unavailable). |
| Numbers arrive as Gson Double (uptime=12.0, queueDepth=3.0). | Coerced to uptimeSec=12L, queueDepth=3 — exercised against the real boundary type. |
| The user selects the parent insrc node (not a child). | The existing InsrcSettingsConfigurable page renders unchanged; the three children are additive peers (ac1/lc1). |

### Invariants to preserve

- The shipped parent InsrcSettingsConfigurable + its <applicationConfigurable id=ai.insors.insrc.settings> element are NOT modified; the three new pages are additive parentId children only. [[c8]]
- All daemon/socket I/O (daemonStatus() and each buildBody()) runs OFF the EDT via executeOnPooledThread with a disposed-guarded invokeLater render — the existing createComponent() idiom. [[c8]]
- daemonStatus() NEVER throws: unreachable→Stopped, error/malformed→Unavailable(reason), mirroring probe()/repoStats(); the existing probe() is untouched. [[c7]]

## Test strategy

**Test framework:** `JUnit 5 (org.junit.jupiter) — fake-DaemonRpc unit tests + source-scan tests, run locally via ./gradlew test buildPlugin under JDK21 (no GitHub-CI).`

### Test levels

- **unit** — Drive DaemonGatewayImpl.daemonStatus() against a fake DaemonRpc to prove three-state classification + DTO coercion against the real Gson boundary shape.
  - Subjects: `Loaded on a well-formed reply (Doubles coerced; repoCount=repos.size; optionals null; modelPullStatus default 'ready')`, `Stopped when the fake throws DaemonUnavailableException`, `Unavailable when !ok/error or malformed`, `request uses METHOD_STATUS with empty params; probe() unchanged`
  - Fixtures: `RecordingRpc(handler) fake (RepoStatsGatewayTest idiom)`, `gsonStatus() helper emitting the payload as the transport does (Double numbers)`
- **unit** — Source-scan the registration + base-shell wiring (cannot headlessly boot) to prove nested nav (ac1/ac2) + parent-untouched (lc1/k4).
  - Subjects: `plugin.xml declares three child applicationConfigurables under parentId=ai.insors.insrc.settings with the three ids + instances`, `the parent applicationConfigurable + InsrcSettingsConfigurable.kt are unchanged`, `InsrcOpsConfigurable base uses executeOnPooledThread + guarded invokeLater + disposed guard + JBScrollPane over ScrollableColumn`, `each child extends InsrcOpsConfigurable() and overrides pageTitle()/buildBody()`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Source-scan: three child applicationConfigurables (Daemon/Workflows/Debug) under parentId=ai.insors.insrc.settings`, `Source-scan: parent element + InsrcSettingsConfigurable.kt unchanged` |
| `ac2` | `Source-scan: each child has a distinct id + own instance= Configurable extending InsrcOpsConfigurable`, `Source-scan: InsrcOpsConfigurable.createComponent() builds each page's own buildBody() off the EDT` |

## Migration

**State before:** One parent applicationConfigurable (id ai.insors.insrc.settings) with no children; DaemonGateway has a stale-only probe() and no daemonStatus()/DaemonStatusDto; ui/InsrcCollapsible.kt already ships the scroll shell; daemon.status already returns the full payload (no daemon change).

**State after:** Three child applicationConfigurables under parentId=ai.insors.insrc.settings, each an empty-but-navigable InsrcOpsConfigurable subclass; DaemonGateway gains daemonStatus():DaemonStatusResult over a DaemonStatusDto parsed from daemon.status, alongside the untouched probe(); parent page byte-unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the abstract InsrcOpsConfigurable base (shared off-EDT-load + guarded-render + JBScrollPane/ScrollableColumn shell). Additive. — ↩ rollbackable
2. Add three no-arg subclasses with placeholder buildBody() bodies. — ↩ rollbackable
3. Add three child <applicationConfigurable parentId=ai.insors.insrc.settings> entries to plugin.xml; leave the parent element unchanged. — ↩ rollbackable
4. Add DaemonStatusDto + DaemonStatusResult types to DaemonGateway.kt. Additive. — ↩ rollbackable
5. Add daemonStatus() to the interface + DaemonGatewayImpl (reuse METHOD_STATUS; three-state classification; Gson-Double coercion); leave probe() unchanged. — ↩ rollbackable
6. Add the daemonStatus() override to every DaemonGateway test-fake/no-op impl; add the unit + source-scan tests. — ↩ rollbackable

**Backward compat:** Additive only. The DaemonGateway interface gains one method (daemonStatus()); every existing signature is unchanged, so callers are unaffected — the only compile impact is each concrete impl/test-fake adding the override (mirroring the earlier repoStats()/registerProject() additions). The parent InsrcSettingsConfigurable + its plugin.xml element are not modified. The daemon is untouched.

## Alternatives considered

### a1: Abstract base Configurable (template-method) + sealed daemonStatus() — **CHOSEN**

sc1 is an abstract InsrcOpsConfigurable base (subclass overrides pageTitle()/buildBody()); each of the three child pages is a thin no-arg subclass registered via parentId; sc2 is a new daemonStatus() returning the HLD's sealed Loaded/Stopped/Unavailable over a DaemonStatusDto parsed from daemon.status.

sc1: an abstract class InsrcOpsConfigurable : Configurable owns createComponent()'s shell (JBScrollPane over ui/InsrcCollapsible.ScrollableColumn + executeOnPooledThread + disposed-guarded invokeLater), exposing protected abstract pageTitle()/buildBody(). S001 ships the base + three no-arg subclasses with placeholder bodies, registered via <applicationConfigurable parentId=ai.insors.insrc.settings> (parent byte-unchanged). sc2: add daemonStatus() to DaemonGateway + DaemonGatewayImpl reusing METHOD_STATUS; Stopped on DaemonUnavailableException, Unavailable on !ok/error/RuntimeException, else parse a DaemonStatusDto (Gson-Double-coerced) into Loaded — mirroring repoStats(), never throwing.

### a2: Composition helper (no inheritance) + sealed daemonStatus()

sc1 is a standalone shell helper each child Configurable CALLS from its own createComponent, rather than a base class the pages extend; sc2 identical to a1.

sc1 ships a composition helper (object InsrcOpsPageShell { fun mount(title, loadOffEdt, render): JComponent }) encapsulating the JBScrollPane/ScrollableColumn + executeOnPooledThread + guarded invokeLater; each child Configurable calls it from createComponent(). plugin.xml registration identical. sc2 as a1.

### a3: Base class + fold Stopped into Unavailable (two-state result)

sc1 identical to a1 (abstract base), but sc2's DaemonStatusResult is two-state (Loaded | Unavailable) — a not-running daemon is just an Unavailable(reason).

sc1 is the a1 abstract base. sc2 shapes daemonStatus() as a two-state sealed result: Loaded(DaemonStatusDto) when a status decodes, else Unavailable(reason) covering both unreachable and error; the stopped-vs-unreachable distinction collapses into the reason string.

## Citations

- **[[c7]]** `analyze-bundle` `s1 external-contract + symbol.locate — src/shared/types.ts:882 (DaemonStatus payload) + daemon/DaemonGateway.kt (probe/METHOD_STATUS/sealed-result idiom)` — "interface DaemonStatus { uptime; repos[]; queueDepth; embeddingsPending; modelPullStatus?; modelPullPct?; lmdbFileSizeMb? } — probe() reuses METHOD_STATUS but reads only FIELD_STALE; daemonStatus() is"
- **[[c8]]** `convention` `s1 symbol.locate — plugin.xml:289-293 parent applicationConfigurable + settings/InsrcSettingsConfigurable.kt createComponent (off-EDT + guarded invokeLater) + ui/InsrcCollapsible.kt (collapsiblePanel/ScrollableColumn)` — "A child page nests by adding <applicationConfigurable parentId=ai.insors.insrc.settings id=... instance=.../>; the parent element is left byte-unchanged (lc1/k4); createComponent() runs the read on ex"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-09-21T06:29:25.677Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sc2 | external-contract | LOW | manual | The daemon.status IPC payload (DaemonStatus in src/shared/types.ts:882) carries uptime:number, repos:RegisteredRepo[], queueDepth, embeddingsPending, modelPullStatus?:'pulling'\|'ready', modelPullPct?, lmdbFileSizeMb? — and has NO socket/running/scalar-repoCount field, so the DTO derives running from reachability and repoCount from repos.length. | read anchor src/shared/types.ts:882 found:true = 'export interface DaemonStatus {'; grep confirms modelPullStatus + lmdbFileSizeMb are real payload fields. The DTO's derive-running / repoCount=repos.length realization is consistent with a payload that has no socket/running/scalar-count field. |  |
| sc2 | citation | LOW | manual | DaemonGateway currently has a stale-only `fun probe(): DaemonState` whose impl reuses METHOD_STATUS='daemon.status' and reads FIELD_STALE='stale'; there is no daemonStatus() yet. | read DaemonGateway.kt:552 found:true = 'override fun probe(): DaemonState'; grep confirms `const val METHOD_STATUS = "daemon.status"` (:872) and `const val FIELD_STALE = "stale"` (:883) exist; fun daemonStatus( appears only in the HLD/LLD docs, confirming it is NEW. |  |
| sc2 | semantic | LOW | manual | The DaemonGateway transport is an injectable DaemonRpc whose call() returns a DaemonResult{ok:Boolean, data:Map, error:String?, list:List?}, and repoStats() already classifies Unavailable on !ok/error and coerces Gson Doubles — the idiom daemonStatus() mirrors. | grep confirms interface DaemonRpc (:526), data class DaemonResult (:538), override fun repoStats( (:605); read DaemonGateway.kt:612 found:true shows repoStats calling rpc.call(METHOD_...) — the injectable-transport + sealed-result classification idiom daemonStatus() mirrors is real. |  |
| sc1 | citation | LOW | manual | plugin.xml registers the parent applicationConfigurable id=ai.insors.insrc.settings (instance InsrcSettingsConfigurable) under parentId=tools; child pages nest by adding more applicationConfigurable elements with parentId=ai.insors.insrc.settings without editing the parent. | read plugin.xml:289 found:true = '<applicationConfigurable'; grep confirms id=ai.insors.insrc.settings + InsrcSettingsConfigurable; child nesting via parentId=ai.insors.insrc.settings is valid and the parent is untouched. |  |
| sc1 | citation | LOW | manual | ui/InsrcCollapsible.kt exposes fun collapsiblePanel(title, body, expanded) and class ScrollableColumn(viewportHeightPx, minWidthPx) — the shared scroll shell the InsrcOpsConfigurable base composes; S001 adds no new scroll primitive. | read InsrcCollapsible.kt:31 found:true = 'fun collapsiblePanel(title: Strin...'; grep confirms class ScrollableColumn exists — the shared scroll shell the S001 base composes is real, no new primitive. |  |
| sc1 | citation | LOW | manual | InsrcSettingsConfigurable implements com.intellij.openapi.options.Configurable and createComponent() runs the read via executeOnPooledThread and renders back via invokeLater — the off-EDT/guarded-render idiom the S001 base generalizes; this shipped file is not edited by S001. | read InsrcSettingsConfigurable.kt:72 found:true = 'override fun creat...(createComponent)'; grep confirms class InsrcSettingsConfigurable + executeOnPooledThread + invokeLater — the off-EDT/guarded-render idiom the base generalizes; the file is not edited by S001. |  |
| test | citation | LOW | manual | The gateway test idiom (RepoStatsGatewayTest) drives DaemonGatewayImpl against a fake DaemonRpc (RecordingRpc) feeding Gson-Double numbers, which the daemonStatus() unit tests extend; JUnit 5 is the framework. | read RepoStatsGatewayTest.kt:20 found:true = 'private class RecordingRp...'; grep confirms class RepoStatsGatewayTest + RecordingRpc + org.junit.jupiter — JUnit 5 fake-DaemonRpc idiom the daemonStatus() unit tests extend is real. |  |
