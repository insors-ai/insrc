<!-- insrc:artifact LLD-61d8c73edb68041a-s4 -->

# LLD: E2026091761d8c73e:S004

**Epic:** `integrate-insrc-framework-into-jetbrains-ide`
**HLD base run:** `wf-1789642152969-snttef`
**HLD effective hash:** `7ebd2fd85012...`

## HLD context

**Framework:** A single new IntelliJ-Platform plugin (one codebase, all four target IDEs) that owns NO reasoning: it is a thin orchestrator that binds the IDE's lifecycle moments to already-built insrc backend surfaces. On project open it detects any present AI host, ensures the backend daemon is present/current, offers explicit project registration, wires the insrc-mcp server plus the tracked-workflow steering into each detected host's own config, and on uninstall reverses those writes. All grounded reasoning continues to run through the insrc-mcp server the host assistant invokes (k1), so the plugin never opens a cloud path and gains capability parity for free. The design rests on three shared contracts: a plugin runtime + project-context surface (the active project's path is the explicit per-call repo scope, k3), a daemon gateway that fronts the backend (health probe + registration via the strict repo.add contract, k2), and an AI-host adapter that abstracts each host's config/rules file locations behind a marker-delimited, replace-only writer (k4).
**Rollout phase:** Phase C — Tracked-workflow discipline
**Consumes:** `sc1` (PluginRuntime & ProjectContext), `sc3` (AiHostAdapter)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The Marketplace-published single-plugin packaging, the per-IDE activation manifest that brings the plugin up identically in IntelliJ IDEA, PyCharm, GoLand, and WebStorm, and the plugin-update delivery path are private to this Story. It exposes only the ProjectContext/lifecycle seam (sc1) and the DaemonGateway handle (sc2); how activation and packaging are realised is not consumed by any other Story. — owns `sc1`, `sc2`
- `s2`: How the insrc-mcp server registration is composed and written into each detected host, and how each capability call is configured to carry the active project's path as its explicit repo argument, are private to this Story. It publishes the AiHostAdapter (sc3) as the shared seam; the MCP-registration content and the per-call repo-scoping wiring behind it are internal. — owns `sc3`
- `s3`: The daemon staleness/consent policy (one-click consent on first provisioning, silent updates thereafter), the tiered Node runtime decision (use system Node when adequate, else provision a private runtime under the insrc home), and the delegation to the existing installer script are entirely private to this Story. It consumes the lifecycle seam (sc1) to run on project open and the gateway probe (sc2) to decide when to act, but owns no shared contract.
- `s5`: The one-click 'Enable insrc for this project' onboarding UX, the silent no-op-and-re-check behaviour when no AI host is present, and the uninstall-cleanup orchestration are private to this Story. It composes existing seams — registration via the gateway (sc2), host-write removal via the adapter (sc3), lifecycle triggers via sc1 — without introducing a new shared contract.

## Contract details

**Surface level:** internal

### `SteeringInjectionLifecycle.onProjectOpened`

```typescript
fun onProjectOpened(ctx: ProjectContext): Unit
```

**Parameters:**
- `ctx: ProjectContext` — The opened project's context (sc1). The trigger to inject steering; the steering body is project-independent, so ctx is used only as the run trigger (per-host rules files are host-owned, not per-project).

**Returns:** `Unit` — Fire-and-return. Detection + per-host rules writes run off the EDT; project opening is never blocked.

**Errors:**
- `(none surfaced)` when Per-host writes are guarded (runCatching); a HostFileAccessException on one host is logged and does not throw into the lifecycle broadcaster or block the other host.

**Preconditions:**
- Registered as a PluginLifecycle consumer of sc1's LifecycleBroadcaster.

**Postconditions:**
- Calls adapter.detectPresent(); empty -> no-op. For each present host, composes the steering rules block and calls adapter.writeRulesBlock(host, block).
- Owns no shared contract; writes ONLY the rules file; never touches the mcp registration (S002) and never invokes removeRulesBlock (S005).

### `SteeringContent.steeringBody`

```typescript
fun steeringBody(): String
```

**Returns:** `String` — The canonical tracked-workflow steering guidance — the plugin-bundled copy of src/prompts/steering-block.md (single source of truth with the daemon steering-refresh).

**Errors:**
- `IllegalStateException` when The bundled steering resource is missing or empty (a packaging error); surfaced so the caller skips writing an empty block rather than clobbering the marker region with nothing.

**Preconditions:**
- The steering block asset is bundled into the plugin resources (Gradle bundleSteeringBlock, mirroring S003's installer bundling).

**Postconditions:**
- Read-only; returns the trimmed canonical steering body. Independent of daemon install state (self-contained).

### `AiHostAdapter.detectPresent`

```typescript
fun detectPresent(): List<AiHost>
```

**Returns:** `List<AiHost>` — The installed+enabled AI hosts (sc3, from S002), each with its resolved rulesFilePath. Empty when neither is present (the no-op case).

**Postconditions:**
- Consumed unchanged from sc3; S004 never re-implements detection.

### `AiHostAdapter.writeRulesBlock`

```typescript
fun writeRulesBlock(host: AiHost, block: MarkerDelimitedBlock): Unit
```

**Parameters:**
- `host: AiHost` — A host from detectPresent() whose rules file receives the steering (its own native rulesFilePath, ac3).
- `block: MarkerDelimitedBlock` — MarkerDelimitedBlock(AiHostAdapterImpl.RULES_BEGIN, AiHostAdapterImpl.RULES_END, steeringBody) — the insrc rules section.

**Returns:** `Unit` — The host's rules file now contains exactly one insrc steering section bounded by the RULES markers; surrounding developer content is preserved verbatim (ac2).

**Errors:**
- `HostFileAccessException` when sc3 surfaces this when the rules file cannot be read/written (permissions); S004 catches per host and logs, not swallowed globally.

**Preconditions:**
- host was returned by detectPresent(); block uses the sc3 RULES markers.

**Postconditions:**
- Consumed unchanged from sc3 (the S002 MarkerFileWriter path): marker-delimited replace-only (k4/lc1), idempotent, surrounding content preserved. S004 does NOT re-implement this writer.

## Data model changes

### `SteeringContent` — new

S004-internal provider of the tracked-workflow steering body: reads the plugin-bundled canonical steering block (a Gradle copy of src/prompts/steering-block.md into plugin resources, e.g. /insrc/steering-block.md, exactly as S003 bundles the installer). One source of truth shared with the daemon steering-refresh; no re-authored guidance.

**Call sites:**
- `src/prompts/steering-block.md`
- `src/daemon/steering-inject.ts`

### `SteeringRulesBlock` — new

S004-INTERNAL composed value: MarkerDelimitedBlock(AiHostAdapterImpl.RULES_BEGIN='<!-- insrc:rules:start -->', AiHostAdapterImpl.RULES_END='<!-- insrc:rules:end -->', body=SteeringContent.steeringBody()). Reuses sc3's MarkerDelimitedBlock type + RULES markers so writeRulesBlock and S005's removeRulesBlock match; not a new shared type.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/AiHostAdapterImpl.kt:41-42`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | S004 registers a SteeringInjectionLifecycle as a PluginLifecycle consumer of sc1's LifecycleBroadcaster (InsrcAppLifecycle.appStarted, alongside McpWiringLifecycle/DaemonLifecycleService); onProjectOpened (off-EDT) is the trigger. S004 does not re-implement sc1 or the lifecycle; the steering body is project-independent so ProjectContext is only the run trigger. |
| `sc3` | consumes | S004 consumes the REAL S002 sc3 surface: adapter.detectPresent() to find AI Assistant/Junie and adapter.writeRulesBlock(host, block) to write the marker-delimited steering into each host's own rulesFilePath (ac3), replace-only preserving user content (ac2, k4/lc1). It never re-implements the marker writer (S002's MarkerFileWriter), never writes the mcp file (S002's writeMcpRegistration), and never calls removeRulesBlock (S005). NOTE: the HLD sc3 sketch shows a generic writeBlock(host,'rules',block); the shipped surface S004 consumes is writeRulesBlock(host, block) — the same k4 primitive, reshaped by S002 at build time; no amendment needed since S004 only consumes it. |

## Error paths

### Error cases

- **The bundled steering block is missing or empty in the plugin resources (a packaging error — the Gradle bundle step didn't run or the asset was renamed).** (recoverable)
  - Detection: SteeringContent.steeringBody() finds getResourceAsStream(the bundled steering path) returns null, or the read content trims to empty.
  - Response: Throw IllegalStateException from steeringBody(); the SteeringInjectionLifecycle catches it BEFORE composing/writing, logs, and writes nothing — it never hands writeRulesBlock an empty body that would replace the insrc section with nothing. No host rules file is touched.
  - User impact: Steering is simply not injected this session (a build/packaging bug, caught in CI/tests); the developer's rules files are untouched and the assistant still has the tools, just without the tracked-workflow guidance until the plugin is fixed.
- **A detected host's rules file cannot be written (permissions, read-only location, missing parent dir).** (recoverable)
  - Detection: adapter.writeRulesBlock(host, block) surfaces HostFileAccessException from the sc3 MarkerFileWriter's read-modify-write.
  - Response: The per-host runCatching in the lifecycle catches it, logs which host failed and why, and continues to the other host — not swallowed globally, not thrown into the broadcaster. The failed host's rules file is left exactly as it was (sc3 guarantees no partial write).
  - User impact: The developer is (via logs/notification) informed steering couldn't be written to that host; the other host (if present) still gets it, and a later project-open re-attempts after the permission is fixed.

### Edge cases

| Input | Expected |
| :--- | :--- |
| Neither AI Assistant nor Junie is present when the project opens. | detectPresent() returns empty and S004 writes nothing (no-op). |
| Both AI Assistant and Junie are present. | Each receives the steering in its OWN native rules file via writeRulesBlock(host,...) with host.rulesFilePath (ac3); one write per host, independent. |
| A host's rules file already contains developer-authored content but no insrc section. | The insrc steering section is APPENDED marker-delimited; all surrounding developer content is preserved verbatim (ac2, k4/lc1) — the sc3 writer's create/append path. |
| A host's rules file already carries the insrc steering section from a prior open. | writeRulesBlock replaces the same-marker section in place (replace-only) — byte-identical on an unchanged steering body, no duplicate insrc section (idempotent). |
| The same project is re-opened, or opened in a second window. | Idempotent: each host's rules file ends with exactly one insrc steering section regardless of how many times activation fires (replace-only). |
| The steering body changed between plugin versions and a host already has the older section. | writeRulesBlock replaces the old delimited section with the new body in place (replace-only), preserving surrounding content — the block is brought current without touching the developer's text. |

### Invariants to preserve

- Every write into a host-owned rules file stays marker-delimited and replace-only (sc3 RULES markers), preserving all surrounding developer-authored content and reversible on removal (k4/lc1); S004 never re-implements the writer and never overwrites the whole file. [[c5]]
- No new cloud path: S004 only writes a plugin-bundled steering string into a local host rules file (the guidance references the insrc-mcp tools S002 registered), so no direct cloud/REST endpoint is opened (k1). [[c7]]

## Test strategy

**Test framework:** `JUnit (Kotlin) with the IntelliJ Platform Test Framework (BasePlatformTestCase / test fixtures) — the jetbrains-plugin module's established suite from S001/S002/S003; distinct from the TS backend's node:test (k6).`

### Test levels

- **unit** — Verify the steering content provider + the injection lifecycle logic against injected fakes — no IDE fixture, no real host file.
  - Subjects: `SteeringContent.steeringBody: returns the bundled canonical steering body (non-empty); a missing or empty bundled resource -> IllegalStateException`, `SteeringInjectionLifecycle composes MarkerDelimitedBlock(RULES_BEGIN, RULES_END, steeringBody) and calls adapter.writeRulesBlock(host, block) once per detected host (block markers == the sc3 RULES markers, body == steeringBody)`, `empty detectPresent() -> no writeRulesBlock call (no-op)`, `a HostFileAccessException from writeRulesBlock on one host is caught (per-host runCatching) and the other present host is still written`, `a missing/empty steering resource (steeringBody throws) -> NO writeRulesBlock call on any host (never writes an empty block)`
  - Fixtures: `A fake AiHostAdapter: stub detectPresent() (present/absent/both) + a recording writeRulesBlock capturing (host, block) and optionally throwing HostFileAccessException`, `A fake/overridable steering-resource loader (present body / missing / empty)`
- **integration** — Verify, inside the IntelliJ Platform fixture, that on project open the lifecycle drives sc3 to write the steering into each present host's rules file, preserving surrounding developer content, and is reached via the sc1 broadcaster.
  - Subjects: `On project open with one host present, the steering section (RULES-delimited) is written into that host's rulesFilePath (ac1)`, `Writing into a rules file that already has developer content adds/replaces ONLY the insrc section; the surrounding content is preserved verbatim (ac2) — exercised through the real AiHostAdapterImpl rules writer over a temp file`, `With both hosts present, each host's rulesFilePath receives the steering (ac3)`, `The SteeringInjectionLifecycle is registered as a sc1 LifecycleBroadcaster consumer and its work runs off the EDT`
  - Fixtures: `IntelliJ Platform test fixture with a temp project (basePath) from S001's sc1`, `Temp files standing in for each host's rules file, some pre-populated with developer content (to assert preservation), injected via stub AiHost rulesFilePath`, `The real AiHostAdapterImpl rules-writer path (or its MarkerFileWriter) to prove end-to-end replace-only preservation`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Integration: on project open with a host present, the RULES-delimited steering section appears in that host's rulesFilePath`, `Unit: SteeringInjectionLifecycle calls writeRulesBlock(host, block) with block.body == the canonical steering body for each present host` |
| `ac2` | `Integration: writing steering into a rules file pre-populated with developer content leaves all surrounding content byte-preserved and only the insrc RULES section added/replaced (via the real sc3 replace-only writer)`, `Unit: the composed block uses the sc3 RULES markers (so the write is replace-only, never whole-file overwrite)` |
| `ac3` | `Integration/Unit: with both AI Assistant and Junie present, writeRulesBlock is invoked once per host against each host's own rulesFilePath` |

## Alternatives considered

### a1: Bundle the canonical steering block into the plugin; inject it via sc3.writeRulesBlock — **CHOSEN**

A Gradle task bundles src/prompts/steering-block.md into the plugin resources; on project open, for each detected host, S004 composes MarkerDelimitedBlock(RULES markers, bundled steering body) and calls adapter.writeRulesBlock(host, block).

S004 introduces a SteeringInjectionLifecycle (a PluginLifecycle/sc1 consumer, off-EDT, mirroring S002's McpWiringLifecycle) and a small SteeringContent provider that reads the plugin-bundled canonical steering block (the same src/prompts/steering-block.md the daemon steering-refresh uses, copied into plugin resources by a Gradle task exactly as S003 bundles insrc-daemon-install.sh). On onProjectOpened it calls adapter.detectPresent() (empty -> no-op), and for each present host composes MarkerDelimitedBlock(AiHostAdapterImpl.RULES_BEGIN, AiHostAdapterImpl.RULES_END, <bundled steering body>) and writes it via adapter.writeRulesBlock(host, block) (sc3, marker-delimited replace-only, k4/lc1), with a per-host runCatching so one host's HostFileAccessException doesn't block the other. Both hosts get the guidance in their own rules file (ac3); surrounding user content is preserved and the insrc section is add-or-replace only (ac2). Removal is S005's removeRulesBlock; S004 only writes.

### a2: Plugin-local authored steering body (Kotlin constant / plugin-only resource)

Hand-author a JetBrains-specific steering body inside the plugin and inject it via sc3.writeRulesBlock, without reusing the canonical block.

Same SteeringInjectionLifecycle + sc3.writeRulesBlock wiring, but the steering body is a plugin-local string/resource written specifically for the JetBrains hosts rather than the shared src/prompts/steering-block.md. On project open it composes the block from that local body and writes it per host.

**Rejected because:** Functionally satisfies ac1-ac3 via the same sc3/sc1 wiring, but hand-authoring a plugin-local steering body forks the tracked-workflow guidance into a second source of truth that drifts from the canonical daemon steering — against the plugin's owns-no-reasoning intent, and pure maintenance cost for no functional gain.

### a3: Read the steering block from the installed daemon home at runtime

On project open, read the steering block from the installed daemon (~/.insrc/daemon/.../prompts/steering-block.md) and inject it via sc3.writeRulesBlock.

Same lifecycle + sc3 wiring, but the steering body is read at runtime from the daemon installation's shipped prompts asset rather than bundled into the plugin. The steering always matches the exact installed daemon version.

**Rejected because:** Zero drift, but PARTIAL on ac1: with the daemon absent (S003 not yet run) there is no steering asset on disk to read, so activation would not deliver the guidance; it also couples S004 to S003's daemon-home layout (an adjacent boundary's internal).

## Citations

- **[[c1]]** `analyze-bundle` `boundary-scope: real sc3 rules-write surface (AiHostAdapter.kt:109,117; AiHostAdapterImpl.kt:31-42) — writeRulesBlock(host, MarkerDelimitedBlock)/removeRulesBlock(host), RULES markers`
- **[[c2]]** `analyze-bundle` `capability-discovery: canonical tracked-workflow steering body already shipped as src/prompts/steering-block.md (same block daemon steering-inject.ts writes)`
- **[[c3]]** `analyze-bundle` `capability-discovery: S002 McpWiringLifecycle sc1-consumer pattern S004 mirrors (McpWiringLifecycle.kt:29-40; InsrcPluginStateListener.kt)`
- **[[c4]]** `analyze-bundle` `boundary-scope: S004 owns no shared contract; consumes sc1 (onProjectOpened) + sc3 (writeRulesBlock); writes only the rules file`
- **[[c5]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/AiHostAdapterImpl.kt:41-42 — RULES_BEGIN/RULES_END markers; MarkerFileWriter replace-only (k4/lc1)`
- **[[c6]]** `convention` `jetbrains-plugin test suite: JUnit (Kotlin) + IntelliJ Platform Test Framework (BasePlatformTestCase), established S001/S002/S003 — distinct from TS backend node:test`
- **[[c7]]** `doc` `CLAUDE.md k1 — No direct cloud REST calls from our process; reasoning routes through the host assistant's insrc-mcp / CLI-OAuth sessions`
- **[[c8]]** `step-output` `s1 backFlowNotes — HLD sc3 interfaceSketch (generic writeBlock/removeBlock) is stale vs shipped writeRulesBlock/removeRulesBlock; S004 consumes the real primitive, no amendment`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-17T15:52:47.905Z

_No load-bearing premises were extracted._
