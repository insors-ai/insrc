<!-- insrc:artifact LLD-f900cf34c0342d4f-s2 -->

# LLD: E20260805f900cf34:S002

**Epic:** `seed-from-approved-specartifact-spec-bfa1f6c830c53982`
**HLD base run:** `wf-1785928117126-v61buv`
**HLD effective hash:** `ddca67745f5c...`

## HLD context

**Framework:** A new Debug pane (peer *Pane.tsx in app.tsx's switcher, k6) with pane-local inner sub-tab navigation over three sections — Daemon, MCP, Logs — backed by a new debug service added to makeServices. The chosen shape (a1) keeps the daemon surface minimal: the status card reuses the existing daemon.status IPC, and the ONE genuinely new daemon contract (a read-only debug-status IPC that returns the daemon's own list of currently-attached socket clients, backed by per-connection tracking in the socket server) is built and consumed entirely inside the MCP-section story. Everything else is client-side: the POSIX orphan scan/kill keys on the managed daemon entry and OS signals (k3), and the log viewer fs.watch-tails the two rotated files on disk (k4) — so the Daemon and Logs sections keep working when the daemon is unreachable. The only cross-STORY contract is the pane's section-hosting shape + the debug-service facade that every section plugs into; it is owned by the foundational scaffold story (S001) that every section story already depends on.
**Rollout phase:** Phase B — diagnostic sections
**Consumes:** `sc1` (Debug pane section-hosting shape + DebugService facade)

## Contract details

**Surface level:** internal-shared

### `DebugService`

```typescript
export interface DebugService { readonly sections: readonly DebugSection[]; daemonStatus(): Promise<DaemonCardModel> }
```

**Returns:** `interface` — The sc1 facade (owned by s1) gains one additive read method for the Daemon section: `daemonStatus()`. Existing `sections` is unchanged. This is the sc1-prescribed extension model ('each section augments it with its own read methods').

**Postconditions:**
- Additive to sc1 — `sections` and every other member are unchanged; s1 fakes stubbing `debug` must add a daemonStatus stub.

### `daemonStatus`

```typescript
daemonStatus(): Promise<DaemonCardModel>
```

**Returns:** `Promise<DaemonCardModel>` — Resolves to the discriminated Daemon status-card view-model. Fetches the daemon-held state (uptime/repos/queue) over the existing daemon.status IPC and attaches client-known fields (socket, pid, best-effort version). On an unreachable daemon (getStatus reject) it RESOLVES to { reachable: false } — it never rejects to the view, so the section can render ac2 without try/catch.

**Preconditions:**
- Reads daemon-held state only over the daemon.status IPC (k1); socket/pid/version are client-side reads (PATHS.sockFile, PATHS.pidFile, installed daemon package.json).

**Postconditions:**
- Never throws; unreachable is the { reachable:false } variant.
- Read-only — no daemon mutation, restart, or disconnect (k5).

### `DaemonCardModel`

```typescript
export type DaemonCardModel = { reachable: true; uptimeSec: number; repoCount: number; repos: readonly { name: string; status: RegisteredRepo['status'] }[]; socket: string; pid?: number | undefined; version?: string | undefined } | { reachable: false }
```

**Returns:** `type-alias (new)` — The Daemon-section status-card view-model: a discriminated union so 'reachable' gates every running field. Structured data only (numbers/strings/enums) — no display formatting or React, keeping presentation in the component (panes-vs-services layering).

**Postconditions:**
- repos[].status reuses RegisteredRepo['status'] ('pending'|'indexing'|'ready'|'error'); only workspace repos are counted (shared-modules rows are already filtered from repo.list).

### `DaemonSection`

```typescript
export function DaemonSection(props: { services: { readonly debug: DebugService } }): ReactElement
```

**Parameters:**
- `props: { services: { readonly debug: DebugService } }` — Supplies the `debug` facade whose daemonStatus() the section reads.

**Returns:** `ReactElement` — The Daemon-section component the sc1 DebugPane mounts for section id 'daemon' (replacing s1's placeholder). Drives debug.daemonStatus() via a small once/poll effect (pollMs=0 in tests) and renders inside a Box: reachable → running + formatUptime(uptimeSec) + version/socket/pid + repo-count with each repo's index state; unreachable → a single 'stopped / unreachable' line. Read-only — no keys (k5).

**Preconditions:**
- Mounted only while the Debug pane's active section is 'daemon'.

**Postconditions:**
- ac1: running card with uptime/version/socket/repo-count+index-state, sourced over IPC.
- ac2: unreachable renders a stopped line, never stale/blank running fields.

### `getStatus`

```typescript
getStatus(): Promise<DaemonStatus>
```

**Returns:** `Promise<DaemonStatus>` — The existing daemon-status read (src/cli/services/daemon.ts:50, `rpc<DaemonStatus>('daemon.status')`) that the debug service's daemonStatus() delegates to for the daemon-held fields (uptime/repos). Rejects when the socket is absent — the debug service catches that and returns { reachable:false }.

**Errors:**
- `Error` when The daemon socket is absent/unreachable ('daemon is not running') — caught by daemonStatus() and mapped to { reachable:false }.

## Data model changes

### `DebugService (src/cli/services/debug-types.ts + debug.ts + index.ts)` — field-add

Add the `daemonStatus(): Promise<DaemonCardModel>` method to the DebugService interface (debug-types.ts) and its implementation in the debug service module (debug.ts) — delegating to the existing getStatus() rpc for daemon-held fields and attaching client-known socket/pid/version, catching a reject into { reachable:false }. makeServices() already returns the `debug` facade (s1); the impl is bound there. Additive: `sections` and sibling facades unchanged.

```
interface DebugService { readonly sections: readonly DebugSection[]; + daemonStatus(): Promise<DaemonCardModel> }
```

**Call sites:**
- `src/cli/services/debug.ts`
- `src/cli/services/index.ts`
- `src/cli/panes/DebugPane.tsx`

### `DaemonCardModel (src/cli/services/debug-types.ts)` — new

New discriminated-union view-model type colocated with the sc1 types; the daemonStatus() return + the DaemonSection prop. Structured data only.

```
+ export type DaemonCardModel = { reachable: true; uptimeSec; repoCount; repos[]; socket; pid?; version? } | { reachable: false }
```

**Call sites:**
- `src/cli/services/debug-types.ts`
- `src/cli/services/debug.ts`
- `src/cli/panes/DebugPane.tsx`

### `DebugPane id→component map (src/cli/panes/DebugPane.tsx)` — field-modify

Swap the s1 'daemon' placeholder in the DebugPane's SECTION_VIEWS map for the real DaemonSection component (passed the `debug` facade). The 'mcp'/'logs' placeholders are untouched (s4/s5). No change to the section-hosting shape or navigation.

```
SECTION_VIEWS.daemon = () => <DaemonSection services={{ debug }} />
```

**Call sites:**
- `src/cli/panes/DebugPane.tsx`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | s2 consumes sc1 (HLD boundary: s2 depends=[sc1]) and extends it per sc1's stated model: it augments the DebugService facade with the additive `daemonStatus()` read method (recorded via the sharedContract.methodAdd amendment above) and swaps the DebugPane's 'daemon' placeholder for the DaemonSection component that renders daemonStatus()'s view-model. It does NOT change the section-hosting shape, DebugSectionId, or navigation (all owned by s1). All daemon-held state flows over the daemon.status IPC through the facade (k1); the section is read-only (k5). |

## Error paths

### Error cases

- **The daemon is not running / the socket is absent when the Daemon section loads.** (recoverable)
  - Detection: daemonStatus() awaits the getStatus() rpc, which REJECTS with the 'daemon is not running' error; daemonStatus() catches that reject.
  - Response: Resolve to the { reachable: false } variant (never re-throw). The DaemonSection renders a single 'stopped / unreachable' line with no running fields.
  - User impact: The operator sees an unambiguous stopped state instead of a crash or stale/blank fields (ac2).
- **The daemon is up but the status rpc rejects transiently (e.g. socket present but the request errors mid-flight).** (recoverable)
  - Detection: The awaited getStatus() promise rejects for a reason other than absence; daemonStatus()'s single catch handles any reject uniformly.
  - Response: Treated identically to unreachable — resolve to { reachable: false }; a later refetch (poll tick / nonce) recovers to the running card once the rpc succeeds.
  - User impact: A brief 'stopped / unreachable' flash that self-heals on the next fetch; no stale running fields are shown.
- **The client-known version cannot be resolved (no installed daemon package.json, or read fails).** (recoverable)
  - Detection: The best-effort version read returns nothing / throws and is caught locally when assembling the reachable model.
  - Response: Leave version undefined in DaemonCardModel; the DaemonSection omits the version line (or shows 'version: unknown') and still renders every IPC-sourced field.
  - User impact: The card is fully usable minus the version line — graceful degradation, no error surfaced.
- **The managed pid file is absent (daemon reachable but pidfile not written / cleaned).** (recoverable)
  - Detection: existsSync(PATHS.pidFile) is false (or the read yields a non-numeric value) when assembling the reachable model.
  - Response: Leave pid undefined; the card omits the pid line. Reachability is decided by the rpc, not the pidfile, so a missing pidfile never contradicts a running daemon.
  - User impact: Card shows running state without a pid line; no error.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The daemon is running but has zero registered repos. | The card shows repo-count 0 and an empty repo list (no per-repo rows), not an error or blank card — still the reachable variant. |
| A registered repo is mid-index (status 'indexing') or errored (status 'error' with errorMsg). | The per-repo row reflects that exact RegisteredRepo['status'] value; the card renders the live index state verbatim rather than collapsing all repos to 'ready'. |
| The registry contains synthetic 'shared-modules' rows alongside workspace repos. | Only workspace repos are counted/listed — shared-modules rows are already filtered from repo.list, so repoCount matches the user-facing set (consistent with the rest of the TUI). |
| The operator opens the Daemon section, leaves to another section, and returns. | The section re-mounts and re-fetches daemonStatus() fresh (pane-local, not persisted) — it shows current state, never a stale cached card from the prior visit. |

### Invariants to preserve

- Daemon-held state (uptime, repos + per-repo index state, queue) is obtained EXCLUSIVELY over the daemon.status IPC via getStatus(); the section never opens the daemon's stores or socket internals directly. Client-known fields (socket/pid/version) are local reads, not daemon state. [[c2]]
- Unreachable is inferred from a FAILED status call exactly as the existing DaemonState does (getStatus reject => running:false); the card must show a stopped/unreachable state with no stale or blank running fields, never a thrown error to the view. [[c2]]
- The Daemon section is READ-ONLY: it exposes no maintenance controls (start/stop/restart/backup/compact live in DaemonPane) and never mutates, restarts, or disconnects the daemon. [[c3]]
- The section consumes only the sc1 `debug` facade shape (via DebugPaneProps) and the pane's id->component hosting; it does not alter DebugSectionId, the section registry, or navigation owned by s1. [[c1]]

## Test strategy

**Test framework:** `node:test (via `npx tsx --test`) with ink-testing-library for the section-component render + fake `{ debug }` facade / getStatus stubs through ServicesContext, matching the s1 DebugPane test harness and the existing tui.test.ts running-vs-daemon-down stubs`

### Test levels

- **unit** — Prove daemonStatus() maps the daemon.status rpc + client-known fields into the discriminated DaemonCardModel, and folds any getStatus reject into { reachable:false } without throwing.
  - Subjects: `debug.daemonStatus(): a resolving getStatus stub yields { reachable:true } with uptimeSec/repoCount/repos[]/socket (+pid/version when available)`, `debug.daemonStatus(): a rejecting getStatus stub yields { reachable:false } and never throws`, `debug.daemonStatus(): unresolvable version / absent pidfile leave version/pid undefined but keep the reachable variant`, `debug.daemonStatus(): only workspace repos are counted (shared-modules rows excluded)`
  - Fixtures: `A fake getStatus that resolves a DaemonStatus (with repos of mixed status) or rejects with a 'daemon is not running' error`, `A stubbed PATHS/pidfile + version reader to exercise the missing-field degradations`
- **unit** — Prove the DaemonSection component renders the running card (ac1) and the stopped/unreachable line (ac2) from an injected daemonStatus() result, with no stale fields.
  - Subjects: `DaemonSection: reachable model renders running + formatUptime(uptimeSec) + socket + version/pid (when present) + repo-count with each repo's index state`, `DaemonSection: { reachable:false } renders a single 'stopped / unreachable' line and NONE of the running fields`, `DaemonSection: zero-repo reachable model renders repo-count 0 with no per-repo rows`, `DaemonSection: a repo with status 'indexing'/'error' renders that exact index state (not collapsed to ready)`
  - Fixtures: `A fake `{ debug }` facade whose daemonStatus() resolves the reachable or unreachable model, injected via the DebugPaneProps-shaped prop`, `ink-testing-library render + settle (pollMs=0 once-fetch)`
- **integration** — Prove the Debug pane's Daemon section (mounted via the sc1 id->component map) shows the real card end-to-end when the section is selected.
  - Subjects: `DebugPane: selecting the Daemon section renders DaemonSection's running card (not the s1 placeholder) from the injected debug facade`, `DebugPane: with an unreachable daemonStatus() the Daemon section shows the stopped/unreachable line`
  - Fixtures: `A fake `{ debug }` facade (sections + daemonStatus) injected through the DebugPane, reusing the s1 DebugPane test harness`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: DaemonSection reachable model renders running + uptime + socket + version/pid + repo-count with each repo's index state`, `unit: debug.daemonStatus() maps a resolving getStatus into { reachable:true } with the IPC-sourced fields`, `integration: selecting the Daemon section renders the running card from the debug facade` |
| `ac2` | `unit: DaemonSection renders 'stopped / unreachable' with no running fields for { reachable:false }`, `unit: debug.daemonStatus() folds a rejecting getStatus into { reachable:false } without throwing`, `integration: the Daemon section shows the stopped/unreachable line when daemonStatus() is unreachable` |

## Migration

**State before:** After s1, the Debug pane's Daemon section is a placeholder Text ('Daemon diagnostics — coming soon.') mounted via the DebugPane's SECTION_VIEWS['daemon'] entry. The DebugService facade (src/cli/services/debug-types.ts + debug.ts) exposes only `sections`. Daemon status is available elsewhere: the existing daemon.status rpc via src/cli/services/daemon.ts:50 getStatus(), and the App-level useDaemonStatus hook feeds only the DaemonPane (props.daemon) and the App header — nothing surfaces it inside the Debug pane. [grounded on the s1 DaemonStatus/getStatus and useDaemonStatus/DaemonPane analyze bundles]

**State after:** The DebugService facade gains an additive `daemonStatus(): Promise<DaemonCardModel>` method (impl in debug.ts, bound through the existing makeServices() debug entry) that delegates to getStatus() for daemon-held fields, attaches client-known socket/pid/version, and folds any reject into { reachable:false }. A new DaemonCardModel discriminated-union type is colocated with the sc1 types. A new DaemonSection component renders that model (running card / stopped line) and replaces the 'daemon' placeholder in the DebugPane SECTION_VIEWS map. The s1 test fakes that stub `debug` gain a daemonStatus stub. No daemon-side change; no change to sc1's section-hosting shape, DebugSectionId, or navigation.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the DaemonCardModel discriminated-union type to the sc1 types module (additive type surface, referenced by nothing yet). — ↩ rollbackable
2. Add the `daemonStatus(): Promise<DaemonCardModel>` method to the DebugService interface and implement it in the debug service module — delegate to the existing getStatus() rpc, attach client-known socket (PATHS.sockFile) / pid (pidfile, existsSync-guarded) / best-effort version, and catch any reject into { reachable:false }. Bind it on the existing makeServices() debug entry. Additive; existing `sections` unchanged. — ↩ rollbackable
3. Add the DaemonSection component that reads debug.daemonStatus() via a once/poll effect and renders the reachable running card (formatUptime + socket + version/pid + repo-count-with-index-state) or the { reachable:false } stopped/unreachable line. Read-only, no keys. — ↩ rollbackable
4. Swap the DebugPane SECTION_VIEWS['daemon'] placeholder for the DaemonSection (passed the debug facade). The 'mcp'/'logs' placeholders and the section-hosting shape stay unchanged. This is the single user-visible behaviour change (the Daemon section now shows a real card). — ↩ rollbackable
5. Update the in-repo Services test fakes that stub the `debug` facade (tui.test.ts, command.test.ts, and any s1 DebugPane fixtures) to add a conformant daemonStatus stub so the suites compile against the widened DebugService. — ↩ rollbackable

**Backward compat:** The DebugService change is additive (one new `daemonStatus` method); `sections` and every sibling facade are unchanged, so s1's DebugPane and all existing panes compile and behave as before. In-repo callers that construct a `debug` facade literal — the test fakes injected via ServicesContext / DebugPaneProps — must add a daemonStatus stub to stay interface-conformant; this is an internal (non-published) contract, so the break is contained to this repo's own test doubles and caught at compile time (same shape as the s1/t5 additive-fake update). The daemon.status IPC, the DaemonStatus type, DaemonPane, useDaemonStatus, the socket path, and the IDE-fork IPC contract are all untouched — s2 only READS the existing rpc. No on-disk or persisted shape changes.

## Alternatives considered

### a1: DebugService.daemonStatus() facade method + view-model — **CHOSEN**

Augment DebugService (per sc1's stated extension model) with a `daemonStatus()` read method that fetches daemon.status over IPC, attaches the client-known fields (socket, pid, best-effort version), and returns a discriminated DaemonCardModel ({reachable:true, ...} | {reachable:false}); the Daemon-section component renders it via a small poll hook.

s2 adds one method to the DebugService interface: `daemonStatus(): Promise<DaemonCardModel>` where DaemonCardModel is `{ reachable: true; uptimeSec; repoCount; repos: {name; status}[]; socket; pid?; version? } | { reachable: false }`. The debug service impl calls the SAME daemon.status rpc used today (via the existing getStatus), and on reject resolves to `{reachable:false}` (never throws to the view). Client-known fields (socket=PATHS.sockFile, pid=read PATHS.pidFile if present, version=best-effort read of the installed daemon package.json) are attached client-side. The Daemon-section component receives the `debug` facade through DebugPaneProps and drives `daemonStatus()` with a tiny poll/once hook (pollMs=0 in tests). This matches sc1 verbatim ('each section story augments it [DebugService] with its own read methods (status card fields...)') and keeps ALL daemon-held state behind the facade (k1), read-only (k5).

### a2: Section reuses useServices() + useDaemonStatus directly (no facade method)

The Daemon-section component ignores the `debug` facade for status and instead reaches the full Services via useServices() + reuses the existing useDaemonStatus hook, attaching client-known fields locally in the component.

The section component calls `useDaemonStatus(pollMs, nonce)` (which internally uses useServices().daemon.getStatus) to get DaemonState {status, running, ...} — reusing the App's exact reachable/unreachable inference with zero new inference code — and reads the client-known socket/pid/version inline. No change to the DebugService interface at all. DebugPaneProps still narrows to `{ debug }`, but the section, like every other pane, freely pulls the broader ServicesContext via useServices().

**Rejected because:** Best reuse + smallest diff (ac1/ac2 satisfied by the existing hook with zero new inference), but sc1=partial: it does not extend the facade, diverging from the sketch's stated section-data model. a1 captures the same k1/reachability guarantees while keeping the data on the facade.

### a3: Structured DebugService.daemonCard() returning a fully-formatted card model incl. display strings

Like a1 but the facade method returns an already-formatted, display-ready card (uptime as '1h 2m', repo lines as strings), so the component is a near-dumb renderer.

DebugService gains `daemonCard(): Promise<{ reachable: boolean; lines: readonly string[] }>` (or a richer pre-formatted record) where the debug service does the formatting (formatUptime, per-repo 'name — ready' lines, socket/pid/version) and the component just prints `lines`. Reachable/unreachable is a boolean plus the lines. All daemon reads stay behind the facade (k1).

**Rejected because:** Satisfies ac1/ac2/k1/k5 but sc1=partial for the wrong reason: it drags formatting/colour into the data layer (the inversion s1 explicitly avoided) and hands s3/s4/s5 a brittle pre-formatted-lines precedent that hides the structure tests want to assert on.

## Citations

- **[[c1]]** `prior-artifact` `HLD sc1 (Debug pane section-hosting shape + DebugService facade), boundary s2 depends=[sc1]; interfaceSketch comment 'each section story augments it with its own read methods (status card fields...)' + DebugPane SECTION_VIEWS hosting from s1`
- **[[c2]]** `analyze-bundle` `s2 symbol.locate/usage.example — daemon.status DaemonStatus (src/shared/types.ts:809), getStatus() rpc (src/cli/services/daemon.ts:50, rejects when socket absent), useDaemonStatus reachable/unreachable inference (src/cli/hooks/useDaemonStatus.ts), PATHS.sockFile/pidFile (src/shared/paths.ts:18-19); daemon.status omits version/socket/pid`
- **[[c3]]** `analyze-bundle` `s2 usage.example — DaemonPane health-render idiom + formatUptime/formatBytes (src/cli/panes/DaemonPane.tsx, src/cli/ui/format.ts); maintenance (start/stop/restart/backup/compact) lives in DaemonPane, so the read-only Debug section carries none of it (k5)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-08-05T13:06:24.832Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| getStatus/c2 | citation | LOW | manual | getStatus() is defined in src/cli/services/daemon.ts around line 50 as `rpc<DaemonStatus>('daemon.status')` and rejects when the daemon socket is absent. | read src/cli/services/daemon.ts:50 = "return rpc<DaemonStatus>('daemon.status');" and grep found `export function getStatus(): Promise<DaemonStatus>` at daemon.ts:49 — getStatus is exactly as cited. | none — verified sound |
| c2 | citation | LOW | manual | DaemonStatus (src/shared/types.ts:809) carries uptime/repos/queueDepth/embeddingsPending and does NOT include version, socket, or pid fields. | read src/shared/types.ts:809 = "export interface DaemonStatus {" — the interface is at the cited line; its members (uptime/repos/queueDepth/embeddingsPending) omit version/socket/pid as the premise states. | none — verified sound |
| DaemonCardModel/c2 | citation | LOW | manual | RegisteredRepo carries a `status: 'pending'\|'indexing'\|'ready'\|'error'` field, which DaemonCardModel.repos[].status reuses. | grep matched src/shared/types.ts:639 `status: 'pending' \| 'indexing' \| 'ready' \| 'error';` — RegisteredRepo['status'] is exactly this union, which DaemonCardModel.repos[].status reuses. | none — verified sound |
| c2 | citation | LOW | manual | PATHS provides sockFile (~/.insrc/daemon.sock) and pidFile (~/.insrc/daemon.pid) in src/shared/paths.ts (lines ~18-19), the client-known status-card fields. | read src/shared/paths.ts:18 = "pidFile: join(INSRC_DIR, 'daemon.pid')," and grep matched paths.ts:19 `sockFile: join(INSRC_DIR, 'daemon.sock')` — both client-known fields at the cited lines. | none — verified sound |
| c2 | citation | LOW | manual | useDaemonStatus (src/cli/hooks/useDaemonStatus.ts) sets running:false on a failed getStatus call — the reachable/unreachable inference the card mirrors. | grep matched src/cli/hooks/useDaemonStatus.ts:35 setting `running: false` in the getStatus catch, and :24 the exported hook — the reachable/unreachable inference the card mirrors is real. | none — verified sound |
| c3 | citation | LOW | manual | formatUptime is exported from src/cli/ui/format.ts (the formatter the card uses for uptimeSec). | grep matched src/cli/ui/format.ts:18 `export function formatUptime(seconds: number): string` — the formatter the card uses is exported as cited. | none — verified sound |
| sc1 | cross-artifact | LOW | manual | The DebugService facade + DebugPane SECTION_VIEWS id->component map exist from s1 (the sc1 scaffold) for s2 to augment/modify. | grep matched src/cli/services/debug-types.ts:33 `export interface DebugService {` and src/cli/panes/DebugPane.tsx:28 `const SECTION_VIEWS: Partial<Record<string, () => ReactElement>>` + :51 `SECTION_VIEWS[active]` — the s1 sc1 facade + id->component map exist for s2 to augment. | none — verified sound |
| daemonStatus | semantic | LOW | manual | daemonStatus() resolves a discriminated DaemonCardModel and never rejects to the view (a getStatus reject is folded into { reachable:false }). | No source probe (this is a design intention for the NEW daemonStatus method, not an existing-symbol citation). Internally consistent: the artifact's daemonStatus postconditions state 'Never throws; unreachable is the { reachable:false } variant', and DaemonCardModel is authored as a discriminated union — the build + code-review will verify the implementation. | none — design intention, verified internally consistent; enforced at build/code-review |
| interactionWithShared | cross-artifact | LOW | manual | The HLD assigns sc1 ownership to s1; s2 depends on (consumes) sc1 and adds daemonStatus() via an additive sharedContract.methodAdd amendment, not by owning sc1. | Corroborated by the cl7 grep: the HLD (HLD-...:40) + s1 LLD (`DebugService { readonly sections }`) define sc1's base owned by s1, and the s2 LLD (:22) adds daemonStatus() — s2 augments (consumes) rather than redefines sc1. The interactionWithShared role=consumes matches the HLD boundary. | none — cross-artifact trace consistent |
