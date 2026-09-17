<!-- insrc:artifact LLD-61d8c73edb68041a-s2 -->

# LLD: E2026091761d8c73e:S002

**Epic:** `integrate-insrc-framework-into-jetbrains-ide`
**HLD base run:** `wf-1789642152969-snttef`
**HLD effective hash:** `7ebd2fd85012...`

## HLD context

**Framework:** A single new IntelliJ-Platform plugin (one codebase, all four target IDEs) that owns NO reasoning: it is a thin orchestrator that binds the IDE's lifecycle moments to already-built insrc backend surfaces. On project open it detects any present AI host, ensures the backend daemon is present/current, offers explicit project registration, wires the insrc-mcp server plus the tracked-workflow steering into each detected host's own config, and on uninstall reverses those writes. All grounded reasoning continues to run through the insrc-mcp server the host assistant invokes (k1), so the plugin never opens a cloud path and gains capability parity for free. The design rests on three shared contracts: a plugin runtime + project-context surface (the active project's path is the explicit per-call repo scope, k3), a daemon gateway that fronts the backend (health probe + registration via the strict repo.add contract, k2), and an AI-host adapter that abstracts each host's config/rules file locations behind a marker-delimited, replace-only writer (k4).
**Rollout phase:** Phase B — Capability wiring & daemon lifecycle
**Owns:** `sc3` (AiHostAdapter)
**Consumes:** `sc1` (PluginRuntime & ProjectContext), `sc2` (DaemonGateway)

## Contract details

**Surface level:** internal-shared

### `AiHostAdapter.detectPresent`

```typescript
fun detectPresent(): List<AiHost>
```

**Returns:** `List<AiHost>` — The AI hosts (AI Assistant / Junie) installed and enabled in the running IDE, each with its resolved MCP-config and rules-file paths. Empty when neither is present (the no-op case S005 handles).

**Errors:**
- `(none surfaced)` when A host whose presence cannot be determined is treated as absent (omitted from the list) and logged; detection never throws to the caller.

**Postconditions:**
- Read-only: inspects host installations/config locations, mutates nothing.
- Each returned AiHost carries an absolute mcpConfigPath and rulesFilePath for that host.

### `AiHostAdapter.writeBlock`

```typescript
fun writeBlock(host: AiHost, file: HostFile, block: MarkerDelimitedBlock): Unit
```

**Parameters:**
- `host: AiHost` — A host from detectPresent() whose file is being written.
- `file: HostFile` — Which host-owned file to write into ('mcp' registration or 'rules' guidance).
- `block: MarkerDelimitedBlock` — The delimited block (begin/end markers + body) to insert or replace.

**Returns:** `Unit` — The host file now contains exactly one insrc block bounded by the markers; surrounding user content is untouched.

**Errors:**
- `HostFileAccessException` when The host file cannot be read or written (permissions, missing parent dir); surfaced, not swallowed.

**Preconditions:**
- host was returned by detectPresent().
- block.beginMarker/endMarker are the insrc markers for that file.

**Postconditions:**
- Replace-only + marker-delimited (k4): if a block with the same markers exists it is replaced; otherwise appended. All content outside the markers is preserved verbatim.
- Idempotent: re-running with the same block leaves the file byte-identical.

### `AiHostAdapter.removeBlock`

```typescript
fun removeBlock(host: AiHost, file: HostFile): Unit
```

**Parameters:**
- `host: AiHost` — The host whose file the insrc block is removed from.
- `file: HostFile` — Which host-owned file to remove the insrc block from.

**Returns:** `Unit` — The insrc block is gone and the file is restored to its pre-insrc content; a no-op if no such block is present.

**Errors:**
- `HostFileAccessException` when The host file cannot be read or written; surfaced, not swallowed.

**Postconditions:**
- Removes only the insrc marker-delimited block; surrounding user content is preserved (the reverse of writeBlock).
- Idempotent: removing when no block is present leaves the file unchanged.

## Data model changes

### `AiHostKind` — new

Closed union of the two JetBrains agentic hosts: 'ai-assistant' | 'junie'. Anticipated by the HLD sc3 sketch; S002 realises detection for both.

### `AiHost` — new

{ kind: AiHostKind, mcpConfigPath: String, rulesFilePath: String }. A detected host with its resolved host-owned file locations. Immutable; produced by detectPresent().

### `HostFile` — new

Closed union 'mcp' | 'rules' selecting which host-owned file writeBlock/removeBlock target.

### `MarkerDelimitedBlock` — new

{ beginMarker: String, endMarker: String, body: String }. The replace-only unit written into a host file (k4). S002 composes the 'mcp' block (the insrc-mcp registration); S004 composes the 'rules' block (steering).

### `InsrcMcpRegistration` — new

S002-INTERNAL (not part of sc3): the body of the 'mcp' block — an MCP-server entry whose launch command is a thin plugin-provided launcher that spawns the existing insrc-mcp stdio server and attaches the active project's root (from sc1's ProjectContext) as the explicit repo argument per call (k3, ac2). Private to S002; consumers see only sc3.

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | S002 owns and implements sc3. detectPresent() finds AI Assistant / Junie and resolves each host's mcpConfigPath + rulesFilePath (the one external, c8, dimension — isolated behind a small per-host adapter). writeBlock/removeBlock realise the marker-delimited, replace-only primitive (k4) by reusing the proven steering-refresh pattern. S002 uses writeBlock(host,'mcp',…) to register the insrc-mcp server into each present host (ac1, ac3); the 'rules' file is left for S004 and removal for S005 — S002 only publishes the primitive. |
| `sc1` | consumes | S002 consumes sc1: the plugin-provided MCP launcher reads the active ProjectContext.projectRootPath (kept current via onProjectOpened) and attaches it as the explicit repo argument on each capability call, so a shared MCP process across windows still scopes every call to its own project (k3, ac1, ac2, lc1). Only the existing stdio insrc-mcp is spawned — no new cloud path (k1, ac4). |
| `sc2` | consumes | sc2 is available to S002 per the boundary, but the MCP wiring itself needs only sc1's project path; the DaemonGateway is exercised by S003 (lifecycle) and S005 (registration), not by S002's host-wiring. Listed for completeness; S002 introduces no new use of it. |

## Error paths

### Error cases

- **A detected host's MCP-config (or rules) file cannot be written — permissions, a read-only location, or a missing parent directory.** (recoverable)
  - Detection: The marker-delimited writer's read-modify-write over the host file fails at the filesystem layer (IOException) while composing/replacing the insrc block.
  - Response: Surface HostFileAccessException to the caller (not swallowed) and make no partial write — the host file is left exactly as it was; log the failure and let the orchestrating consumer (S005) notify. Other detected hosts are still wired independently.
  - User impact: The developer is told insrc could not wire that particular host and why; the other host (if present) still works, and re-opening after fixing permissions re-attempts.
- **A detected host's config/rules file is in an unrecognised shape or version, so the adapter cannot safely locate where the insrc block goes (the external c8 assumption does not hold for that host version).** (recoverable)
  - Detection: The per-host adapter's format check fails to recognise the file structure / marker anchor when preparing the write.
  - Response: Fail safe: skip writing that host, log + notify, rather than write into a file whose shape is unrecognised (the HLD's format-drift mitigation). Never corrupt a host-owned file on an unexpected format.
  - User impact: insrc is simply not wired into that host until the adapter is updated; the developer sees a clear 'unsupported host config' notice and nothing is damaged.
- **The insrc-mcp launch target cannot be resolved when composing the registration (the daemon/insrc-mcp entrypoint the launcher must spawn is absent).** (recoverable)
  - Detection: The launcher target path the registration block would reference does not exist at registration-compose time.
  - Response: Skip writing the MCP registration for that host and log/notify; do not write a registration that points at a missing server. Once the daemon-lifecycle policy (S003) provisions the backend, a subsequent project-open re-composes and registers.
  - User impact: Tools do not appear until the backing service is set up; the developer sees the setup path rather than a broken registration.

### Edge cases

| Input | Expected |
| :--- | :--- |
| Neither AI Assistant nor Junie is installed/enabled when the project opens. | detectPresent() returns an empty list and S002 writes nothing (the no-op case; the re-check on later opens is S005's concern). |
| Both AI Assistant and Junie are installed and enabled. | S002 writes the insrc-mcp registration into each present host's MCP config (ac3); each host gets an independent, marker-delimited block. |
| A host already carries the insrc MCP block from a prior project-open. | writeBlock replaces the existing block in place (replace-only); the file is byte-identical to a fresh write — no duplicate registration (idempotent). |
| A host is installed but disabled. | detectPresent() excludes it (treated as not present); nothing is written into a disabled host. |
| The same project is re-opened, or opened in a second window while another window is open. | Registration is idempotent per host (replace-only), and the launcher attaches each window's own active project root per call, so no cross-window mis-scoping (k3, ac2). |

### Invariants to preserve

- Every write into a host-owned config or rules file stays marker-delimited and replace-only, preserving all surrounding user-authored content and fully reversible on removal (k4). [[c5]]
- No new cloud path: the MCP registration only spawns the existing stdio insrc-mcp server, so cloud reasoning stays on the host assistant's CLI-OAuth sessions (k1, ac4). [[c7]]

## Test strategy

**Test framework:** `JUnit (Kotlin) with the IntelliJ Platform Test Framework (BasePlatformTestCase / test fixtures) — the jetbrains-plugin module's established suite from S001; distinct from the TS backend's node:test (k6).`

### Test levels

- **unit** — Verify the sc3 marker-delimited writer, the MCP-registration composition, and host detection against temp files / stubbed inputs — no IDE fixture, no real host.
  - Subjects: `writeBlock: replace-only + marker-delimited (inserts once, replaces an existing block in place, preserves all surrounding content, byte-identical on re-run)`, `removeBlock: removes only the delimited block and restores prior content; no-op when absent`, `unrecognised host-file format -> fail-safe skip (no write, no corruption) and HostFileAccessException surfaced on IO failure`, `InsrcMcpRegistration composition: the block body launches the existing insrc-mcp (no cloud endpoint) and attaches the active project's root as the explicit repo argument (k3, ac4)`, `detectPresent: includes installed+enabled hosts with resolved config/rules paths; excludes disabled/absent hosts`
  - Fixtures: `Temp files standing in for a host's MCP-config and rules files (pre-populated with surrounding user content to assert preservation)`, `Stub host-presence inputs for AI Assistant / Junie (present / disabled / absent)`
- **integration** — Verify that on project open, inside the IntelliJ Platform fixture, the plugin writes the insrc-mcp registration into each detected host's config.
  - Subjects: `On project open with one host present, a marker-delimited insrc-mcp registration appears in that host's MCP config file (ac1)`, `With both hosts present, each host's config receives the registration (ac3)`, `With no host present, nothing is written (empty detectPresent, no-op)`
  - Fixtures: `IntelliJ Platform test fixture with a temp project (basePath) from S001's sc1`, `Temp directories standing in for the two hosts' config locations, injected into the adapter`
- **contract** — Verify the registration honours k1/k3 at the composed-artifact level.
  - Subjects: `The composed registration's launch command references only the existing insrc-mcp stdio server — no cloud/REST endpoint (ac4, k1)`, `The registration wires the repo argument to the active project's root, not a fixed shared default (ac2, k3)`
  - Fixtures: `The composed InsrcMcpRegistration body for a given ProjectContext`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Integration: on project open with a host present, the insrc-mcp registration is written (marker-delimited) into that host's MCP config so the tools become available with no manual setup` |
| `ac2` | `Unit: the registration/launcher composition attaches the active project's root as the explicit repo argument, and driving it with two distinct roots scopes each call to its own root (no shared default, k3)` |
| `ac3` | `Integration: with both AI Assistant and Junie present, an insrc-mcp registration is written into each host's config` |
| `ac4` | `Contract: the composed registration's launch command spawns only the existing stdio insrc-mcp (no cloud endpoint), proving reasoning stays on the CLI-OAuth path (k1)` |

## Alternatives considered

### a1: One MCP registration per host + a plugin-provided launcher that injects the active project's repo per call — **CHOSEN**

sc3 writes a single insrc-mcp registration into each detected host whose launch command is a thin plugin-owned proxy that attaches the active project's root as the explicit repo argument on every tool invocation.

For each present host, S002 writes an MCP-server registration into that host's MCP config via sc3.writeBlock(host,'mcp',block). The launch command is a small plugin-provided launcher that spawns the existing insrc-mcp stdio server and resolves the active project's root from the plugin's own context (sc1's ProjectContext), passing it as the explicit repo argument per call. Because the repo is attached per call rather than baked into a per-window env default, one shared MCP process serves several windows and each call resolves to its own project (k3, ac1, ac2). Marker-delimited replace-only (k4); both hosts get their own registration (ac3); only the existing stdio server runs (k1, ac4).

### a2: Per-project (per-window) MCP registration with INSRC_REPO baked into each registration's env

Register a distinct insrc-mcp entry per open project, each with INSRC_REPO set to that project's root, so no per-call repo argument is needed.

On each project open, sc3.writeBlock writes a project-specific registration whose env sets INSRC_REPO to that project's root; per-project scoping becomes a property of the registration rather than a per-call argument.

**Rejected because:** Violates ac2/k3 (the core scoping guarantee) by relying on a per-window env default that a shared MCP process defeats, and is partial on sc1/sc3; it also contradicts the Epic's decided per-call-repo mechanism and would need a back-flow.

### a3: One registration per host + repo attached solely by the injected steering instruction

Register the raw insrc-mcp server once per host and rely entirely on S004's steering to tell the agent to pass repo = the active project on every call.

sc3 writes a single raw-server registration per host with no plugin launcher; the per-call repo scoping is achieved indirectly by S004's steering instructing the host agent to attach the active project's repo argument on every call.

**Rejected because:** Clean on ac1/ac3/ac4/sc3 but only partial on ac2/k3 and sc1: it makes per-call scoping an advisory steering behaviour and couples S002's owned wiring responsibility to S004's steering content, weakening the k3 guarantee a1 enforces in the plugin.

## Citations

- **[[c1]]** `analyze-bundle` `capability-discovery: S002 reuse surfaces (insrc-mcp, repo-arg, steering-refresh) + external two-host dimension` — "insrc-mcp is out/bin/insrc-mcp.js (buildInsrcMcpServer); per-project scoping via $INSRC_REPO/repo-arg (resolve-repo.ts); marker-delimited replace-only steering-refresh; two AI-host formats external (c"
- **[[c2]]** `code` `src/mcp/server.ts (buildInsrcMcpServer), src/bin/insrc-mcp.ts` — "The existing insrc-mcp stdio server the registration launches; capability parity is automatic."
- **[[c3]]** `doc` `CLAUDE.md:140` — "Strict non-auto-allocating repo registry (repo.add / UnregisteredRepoError) fronted by sc2."
- **[[c4]]** `code` `src/mcp/resolve-repo.ts (ResolveRepoDeps); README.md:204` — "INSRC_REPO default with explicit per-call repo override — the per-project scoping the launcher attaches (k3)."
- **[[c5]]** `doc` `docs/standalone/daemon-update-automatically-refresh-insrc-steering-E20260801ea1b1162/S001/LLD.md` — "refreshSteering — marker-delimited replace-only writer sc3.writeBlock/removeBlock reuse (k4)."
- **[[c7]]** `doc` `CLAUDE.md (Project principles)` — "No direct cloud REST; cloud LLM access via the claude/codex CLI OAuth (k1) — the registration only spawns the stdio server."
- **[[c8]]** `prior-artifact` `SPEC-607ec3f1d0604b86` — "JetBrains ships two agentic hosts (AI Assistant / Junie) with different MCP/config formats; wire whichever is present — the external dimension sc3 isolates per host."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-17T12:04:45.959Z

_No load-bearing premises were extracted._
