<!-- insrc:artifact LLD-ad0d45c9d690f8c1-s3 -->

# LLD: E20260922ad0d45c9:S003

**Epic:** `build-insrc-vs-code-extension-v1`
**HLD base run:** `wf-1790009331473-c5to0q`
**HLD effective hash:** `1e2038ef7232...`

## HLD context

**Framework:** The insrc VS Code extension is a thin orchestrator that owns no reasoning: a new top-level vscode-plugin/ TypeScript package (sibling to jetbrains-plugin/, its own package.json + build + Marketplace metadata) whose whole job is to wire insrc into stock VS Code at lifecycle moments (activate, first workspace open, uninstall). It re-expresses the shipped jetbrains-plugin/ thin-config-orchestrator in TS over VS Code primitives, reaching the daemon ONLY through a NEW in-repo src/shared/ipc-client module that generalizes the existing src/cli/client.ts `rpc` fn + its IPC request/reply types + the socket path — giving exactly one socket-client code path shared by the CLI and the extension (k5), with no daemon internals, indexer, or storage in the extension bundle, and no cloud path opened by the extension (k2). The extension is decomposed into small per-capability seams, each with an injectable boundary so its load-bearing logic is unit-testable off the VS Code API, and every invasive action (install the daemon, wire a host, register the workspace) is consent-gated and exposed as a durable first-class command.
**Rollout phase:** Phase B — Capability seams (lifecycle, host wiring, registration)
**Owns:** `sc5` (AiHostAdapter)
**Consumes:** `sc3` (CommandRegistry), `sc4` (ConsentGate), `sc5` (AiHostAdapter)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The VS Code activation entrypoint, the extension-bundle packaging (its build over src/shared/ipc-client), and the daemon-reachability probe implementation stay private to s1. Only the four type-level contracts (sc1–sc4) are exposed. — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s2`: The bundled installer asset + the exact daemon-ctl.sh subcommand invocation/parsing + streamed lifecycle progress are private to s2. Only the sc6 lifecycle contract is exposed; the install/lifecycle commands are registered into sc3 and gated by sc4. — owns `sc6`
- `s4`: The workspace-root resolution + the already-registered check stay private to s4. Only the sc7 registrar contract is exposed; enrolment goes exclusively through repo.add over sc1. — owns `sc7`
- `s5`: The first-run flow sequencing (coalescing install → register → wire), the persisted 'already onboarded' state, and the uninstall hook that drives sc5.unwire across wired hosts are private to s5. It composes the branch owners' contracts and pushes resulting state through sc2.
- `s6`: The vscode-plugin/package.json manifest, the Marketplace listing assets, the .vsix packaging, and the manually-triggered Marketplace-only publish path stay entirely private to s6.

## Contract details

**Surface level:** internal-shared

### `AiHostAdapter.detectPresent`

```typescript
detectPresent(): Promise<boolean>
```

**Returns:** `Promise<boolean>` — true iff this host is present per its descriptor.detection: 'by-extension-id' ⇒ injected HostEnv.getExtension(id) is defined; 'by-editor-env' ⇒ the running editor matches (appName/uriScheme). Never throws — an indeterminable host resolves false (logged).

**Errors:**
- `(never throws)` when a detection failure is treated as not-present (false), so AiHostRegistry.detectPresent yields only safely-wireable hosts.

**Preconditions:**
- Reads only the injected HostEnv; opens no cloud path (k2).

**Postconditions:**
- Drives the combined-consent prompt (only present adapters are named + wired).

### `AiHostAdapter.wire`

```typescript
wire(): Promise<void>
```

**Returns:** `Promise<void>` — Writes BOTH the insrc registration into the host's own config, reversibly: the mcpServers.insrc key-merge (McpConfigWriter) + the tracked-workflow steering marker block (SteeringWriter), each preserving surrounding content (ac2/lc2/k4).

**Errors:**
- `HostFileAccessError` when the host's config file cannot be read/written (permissions, read-only, missing parent) — SURFACED, not swallowed, and only after the file is left exactly as it was (no partial write), so the combined wire can continue for the other hosts.

**Preconditions:**
- The CALLER (the wire command) obtained sc4 'accepted' before any adapter.wire() runs (k4).
- The composed mcp entry is a LOCAL stdio `{ command:'node', args:[~/.insrc/daemon/out/bin/insrc-mcp.js] }` — no cloud/REST, no baked env, no argv (k2); fail-safe skip (logged) when the launch target is absent.

**Postconditions:**
- The host config carries mcpServers.insrc + the marker-delimited steering; idempotent on re-run; every other key/user content preserved verbatim.

### `AiHostAdapter.unwire`

```typescript
unwire(): Promise<void>
```

**Returns:** `Promise<void>` — Removes EXACTLY the insrc region — deletes the mcpServers.insrc key (McpConfigWriter.removeInsrcServer) + removes the steering marker block (SteeringWriter.remove) — restoring the host config to its pre-insrc content; a no-op when absent. Consumed by s5's uninstall reversal (ac3).

**Errors:**
- `HostFileAccessError` when the config file cannot be read/written — surfaced, no partial write.

**Preconditions:**
- Exposed for s5 to call on uninstall; s3 does not own the uninstall driver.

**Postconditions:**
- The host config is byte-restored to its content before insrc wiring (surrounding user content untouched).

### `AiHostRegistry.adapters`

```typescript
adapters(): readonly AiHostAdapter[]
```

**Returns:** `readonly AiHostAdapter[]` — Every registered adapter (one per known HostSpec), regardless of presence — the pluggable set. Adding a host = adding one HostSpec, not touching this list's construction (ac3).

**Preconditions:**
- Built from the static HostSpec list fed to the shared createHostAdapter factory.

**Postconditions:**
- s5 iterates this for the uninstall unwire sweep.

### `AiHostRegistry.detectPresent`

```typescript
detectPresent(): Promise<readonly AiHostAdapter[]>
```

**Returns:** `Promise<readonly AiHostAdapter[]>` — The subset of adapters whose detectPresent() resolved true — the hosts named in the combined prompt + wired on accept. Any adapter whose detection throws is omitted (never-throws).

**Preconditions:**
- Runs each adapter's detectPresent over the injected HostEnv; opens no cloud path.

**Postconditions:**
- Feeds ac1's single combined prompt (displayNames) and ac2's wire loop.

### `createHostAdapter`

```typescript
createHostAdapter(spec: HostSpec, deps: { env: HostEnv; fs: HostFileSystem; launchTarget: () => string | undefined }): AiHostAdapter
```

**Parameters:**
- `spec: HostSpec` — the data-only per-host unit: { descriptor: HostDescriptor; detect(env): boolean; resolveConfig(): { mcpConfigPath: string; steeringPath: string } }.
- `deps: { env: HostEnv; fs: HostFileSystem; launchTarget }` — injected seams: HostEnv (getExtension/appName/uriScheme), HostFileSystem (read/write/exists), and the insrc-mcp launch-target resolver.

**Returns:** `AiHostAdapter` — An sc5 adapter whose wire/unwire delegate to the shared McpConfigWriter + SteeringWriter over deps.fs, and whose detectPresent runs spec.detect over deps.env. This is the factory that makes ac3 a data-only add.

**Preconditions:**
- The two shared writers + composeMcpEntry are s3-internal seams reused by every adapter (the JetBrains JsonMcpConfigWriter/MarkerSection/InsrcMcpRegistration split).

**Postconditions:**
- A new host plugs in by adding a HostSpec to the registry's list — no existing adapter changes.

### `composeMcpEntry`

```typescript
composeMcpEntry(launchTargetPath: string | undefined): object | undefined
```

**Parameters:**
- `launchTargetPath: string | undefined` — absolute path to the built insrc-mcp stdio entry (~/.insrc/daemon/out/bin/insrc-mcp.js), or undefined when unresolved.

**Returns:** `object | undefined` — The value written under mcpServers.insrc = { command: 'node', args: [launchTargetPath] }, or undefined (fail-safe skip, logged) when the target is absent. LOCAL stdio only — no cloud, no baked INSRC_REPO env, no --repo argv (k2), mirroring InsrcMcpRegistration.composeServerEntry.

**Preconditions:**
- The launch target is the same daemon-home entry the installer clones (S002).

**Postconditions:**
- Fed to McpConfigWriter.writeInsrcServer during wire().

### `McpConfigWriter.writeInsrcServer`

```typescript
writeInsrcServer(mcpConfigPath: string, serverEntry: object): void
```

**Parameters:**
- `mcpConfigPath: string` — the host's mcp JSON config path.
- `serverEntry: object` — the composeMcpEntry value to set under mcpServers.insrc.

**Returns:** `void` — JSON KEY-MERGE: parse the existing config (or {}), set mcpServers.insrc, re-serialise preserving every OTHER key/server; idempotent re-run. removeInsrcServer deletes just that key. Mirrors JsonMcpConfigWriter.

**Errors:**
- `HostFileAccessError` when the file cannot be read/written, OR a present-but-non-object `mcpServers` is found (never clobber a malformed shape) — surfaced, no partial write.

**Preconditions:**
- Goes through the injected HostFileSystem seam so it is unit-testable off a real fs.

**Postconditions:**
- mcpServers.insrc set; all other content preserved verbatim (ac2/lc2).

### `SteeringWriter.upsert`

```typescript
upsert(steeringPath: string, block: { beginMarker: string; endMarker: string; body: string }): void
```

**Parameters:**
- `steeringPath: string` — the host's Markdown steering/rules file path.
- `block: { beginMarker; endMarker; body }` — the marker-delimited insrc steering block.

**Returns:** `void` — Pure marker-delimited upsert: no markers → append preserving prior content; markers present → replace between; malformed/duplicate markers → leave untouched (never guess/clobber); idempotent no-op. `remove` deletes the block. Mirrors MarkerSection.

**Errors:**
- `HostFileAccessError` when the file cannot be read/written — surfaced, no partial write.

**Preconditions:**
- Goes through the injected HostFileSystem seam.

**Postconditions:**
- The steering block is present exactly once; surrounding user content preserved verbatim (ac2/lc2).

### `registerHostCommands`

```typescript
registerHostCommands(deps: { commands: CommandRegistry; consent: ConsentGate; status: StatusSurface; registry: AiHostRegistry }): void
```

**Parameters:**
- `deps: { commands: CommandRegistry; consent: ConsentGate; status: StatusSurface; registry: AiHostRegistry }` — the s1 surfaces (sc3/sc4/sc2) + the sc5 registry the wiring composes.

**Returns:** `void` — Registers the durable insrc.hosts.wire command into sc3: detect present adapters, present ONE combined sc4 prompt with items = their displayNames, and wire each ONLY on 'accepted' (k4/ac1); reflects the outcome via sc2. Mirrors S002's registerDaemonCommands.

**Errors:**
- `Error` when propagates a duplicate-InsrcCommandId programming error from CommandRegistry.register (build-time guard).

**Preconditions:**
- s3 owns the wire capability + command; the install→register→wire coalescing + the uninstall unwire driver are s5's boundary.

**Postconditions:**
- A dismissed wire prompt stays reachable via the durable insrc.hosts.wire command (k6); nothing wires without sc4 'accepted'.

## Data model changes

### `vscode-plugin/src/hosts/ (new module dir)` — new

New sc5 home mirroring vscode-plugin/src/daemon/: the AiHostAdapter/AiHostRegistry types + HostDescriptor/HostDetection, the createHostAdapter factory, the HostSpec list, the shared McpConfigWriter (JSON key-merge) + SteeringWriter (marker block) + composeMcpEntry, and the registerHostCommands wiring. Concrete per-host config locations live inside each HostSpec.resolveConfig (private to s3). No daemon internals/indexer/storage imported (k5).

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/JsonMcpConfigWriter.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/MarkerSection.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/InsrcMcpRegistration.kt`

### `HostFileSystem + HostEnv (injectable seams)` — new

HostFileSystem { read/write/exists } + HostEnv { getExtension/appName/uriScheme } — injected boundaries so detection + both writers are unit-testable off a real fs + off VS Code (the S002 SubprocessRunner/DaemonPaths pattern).

**Call sites:**
- `vscode-plugin/src/daemon/subprocess.ts`
- `vscode-plugin/src/daemon/paths.ts`

### `vscode-plugin/src/extension.ts (activation wiring)` — invariant-change

extension.ts constructs the AiHostRegistry (real HostEnv/HostFileSystem + the S002 launch-target resolver) and calls registerHostCommands with the s1 surfaces + a minimal activation-time combined-consent wire offer; the S001 never-throws/off-UI contract is preserved.

**Call sites:**
- `vscode-plugin/src/extension.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | s3 owns sc5: AiHostAdapter + AiHostRegistry built by createHostAdapter over data-only HostSpecs, wire/unwire delegating to the shared reversible writers. |
| `sc3` | consumes | registerHostCommands registers the existing insrc.hosts.wire command (k6). |
| `sc4` | consumes | The wire command asks a single combined ConsentGate prompt (items = detected host displayNames) and wires only on 'accepted' (k4/ac1). |
| `sc2` | consumes | registerHostCommands pushes the wire outcome into StatusSurface.set (not re-designed). |

## Error paths

### Error cases

- **A host's mcp config file exists but its `mcpServers` key is present-but-not-an-object (a string/array/number the user or another tool wrote).** (recoverable)
  - Detection: McpConfigWriter.writeInsrcServer parses the JSON and finds `mcpServers` is not a JSON object.
  - Response: It throws HostFileAccessError WITHOUT writing (never clobber a malformed shape); the wire loop surfaces it for that host and continues wiring the other detected hosts.
  - User impact: That one host is left exactly as it was with a clear error; the developer's other hosts still get wired.
- **A host's config file cannot be written (read-only location, missing parent dir, permissions).** (recoverable)
  - Detection: HostFileSystem.write throws (EACCES/ENOENT/EROFS) and McpConfigWriter/SteeringWriter wrap it as HostFileAccessError only AFTER the file was left byte-unchanged (no partial write).
  - Response: wire()/unwire() reject with HostFileAccessError for that host; the combined wire loop records the failure and proceeds with the remaining hosts.
  - User impact: The failed host is reported; nothing half-written; the developer can fix permissions and re-run the durable wire command.
- **The insrc-mcp launch target (~/.insrc/daemon/out/bin/insrc-mcp.js) cannot be resolved (daemon not installed / not built yet).** (recoverable)
  - Detection: composeMcpEntry(launchTargetPath) receives undefined (the resolver found no built entry).
  - Response: It returns undefined (fail-safe skip, logged); wire() writes the steering block but SKIPS the mcp registration for that host rather than writing a broken `node undefined` entry (k2).
  - User impact: No broken MCP entry is written; once the daemon is installed (S002), re-running wire completes the mcp registration.
- **A host's steering file already contains malformed/duplicate insrc markers (open-without-close, or two begin markers).** (recoverable)
  - Detection: SteeringWriter.upsert counts the begin/end markers and finds an ambiguous/duplicate arrangement.
  - Response: It leaves the file untouched (never guess/clobber) and returns a guarded no-op (logged), mirroring MarkerSection's duplicate-marker guard.
  - User impact: The developer's file is never corrupted by an ambiguous edit; the situation is logged so it can be resolved manually.
- **The developer declines or dismisses the combined wiring consent prompt.** (recoverable)
  - Detection: ConsentGate.ask returns 'declined' or 'dismissed' (not 'accepted').
  - Response: NO adapter.wire() runs — nothing is written to any host (k4); the durable insrc.hosts.wire command stays available to wire later.
  - User impact: No host config is touched behind their back; they can wire later from the command palette.
- **One adapter's detectPresent() throws (an unexpected HostEnv/env probe failure).** (recoverable)
  - Detection: AiHostRegistry.detectPresent wraps each adapter's detectPresent in a catch.
  - Response: That adapter is omitted from the present set (logged); detection never throws, so the combined prompt + wire proceed with the safely-detected hosts.
  - User impact: A flaky probe never blocks wiring the other hosts; the un-detected host simply isn't offered this run.

### Edge cases

| Input | Expected |
| :--- | :--- |
| No supported host is present (none installed, stock VS Code with no AI extension). | AiHostRegistry.detectPresent() returns []; the wire command shows a 'no supported AI hosts detected' status and the activation-time offer does not fire (nothing to wire) — no prompt, no write. |
| wire() is run twice for the same host (already wired). | Idempotent: McpConfigWriter re-sets the same mcpServers.insrc value and SteeringWriter replaces the identical marker block — the resulting files are byte-identical to the first wire; no duplication. |
| unwire() is run for a host that was never wired. | A no-op: removeInsrcServer finds no insrc key (or absent file) and SteeringWriter.remove finds no markers — the file is left exactly as it was, no error. |
| A host is detected 'by-editor-env' AND its extension-id variant is also installed (e.g. a Cursor build with a Copilot extension), so two adapters resolve the SAME config file. | Each adapter writes its own host's resolved config path; if two adapters truly resolve the same file, the second write is an idempotent re-set of mcpServers.insrc (key-merge) — no clobber, no duplicate server entry. |
| The mcp config file does not exist yet for a present host. | McpConfigWriter starts from {} and creates the file (via HostFileSystem.write) with just mcpServers.insrc — creating a parent dir only through the injected fs seam; no pre-existing user content to preserve. |

### Invariants to preserve

- Every write into a host-owned file is marker-delimited/replace-only (steering) or a JSON key-merge under mcpServers.insrc (mcp) — surrounding user content + every other server/key is preserved verbatim, and the insrc region is fully removable (lc2/k4). A malformed target is left untouched (never clobbered), and a failed write leaves the file byte-unchanged (no partial write). [[c5]]
- The composed mcp registration is a LOCAL stdio server only (node <~/.insrc/daemon/out/bin/insrc-mcp.js>), with no cloud/REST endpoint, no baked INSRC_REPO env, and no --repo argv — the extension opens no cloud path (k2), mirroring InsrcMcpRegistration. [[c5]]
- The S001 activation contract is preserved: the sc5 wiring added to extension.ts must not make activate() throw or block the editor — detection + the combined-consent offer + the wire command run off the activation critical path, mirroring the S001/S002 never-throws/off-UI pattern. [[c1]]

## Test strategy

**Test framework:** `node:test (tsx --test) — the same runner S001/S002 used for vscode-plugin/ (over injected fakes, no VS Code host); the sc5 unit tests inject a fake HostFileSystem + HostEnv so the JSON key-merge / marker-block writers + detection are unit-testable off a real fs and off VS Code, plus a source-scan test for the k5 boundary (mirroring the JetBrains off-platform unit + source-scan split).`

### Test levels

- **unit** — Prove the two reversible writers (McpConfigWriter JSON key-merge + SteeringWriter marker block) preserve surrounding content, never-clobber, and are fully reversible — over an injected fake HostFileSystem (no real fs).
  - Subjects: `McpConfigWriter.writeInsrcServer sets mcpServers.insrc while preserving every other key/server; idempotent on re-run; creates {} when the file is absent`, `McpConfigWriter throws HostFileAccessError (no write) when mcpServers is present-but-non-object (never clobber)`, `McpConfigWriter.removeInsrcServer deletes only the insrc key (other servers intact) and is a no-op when absent`, `SteeringWriter.upsert: no-markers→append preserving prior content; markers→replace between; malformed/duplicate→leave untouched (guarded no-op); idempotent`, `SteeringWriter.remove deletes the marker block and is a no-op when no markers exist`, `both writers leave the file byte-unchanged when HostFileSystem.write throws (no partial write)`
  - Fixtures: `a fake HostFileSystem (in-memory map of path→content; read/write/exists; a write that can be scripted to throw)`, `sample host configs (empty, with other servers, with a non-object mcpServers, with existing insrc markers)`
- **unit** — Prove sc5 detection + adapter wire/unwire + composeMcpEntry over injected HostEnv + fake fs — off VS Code.
  - Subjects: `composeMcpEntry(path) = { command:'node', args:[path] } and returns undefined (skip) for an undefined launch target (no cloud/env/argv)`, `AiHostAdapter.detectPresent: 'by-extension-id'→getExtension(id) truthiness; 'by-editor-env'→appName/uriScheme match; never throws (indeterminate→false)`, `AiHostAdapter.wire writes BOTH the mcpServers.insrc entry + the steering block via the shared writers; wire() skips the mcp entry (steering only) when the launch target is absent`, `AiHostAdapter.unwire removes exactly the insrc key + the marker block, restoring prior content (reversible)`, `AiHostRegistry.detectPresent returns only present adapters and omits an adapter whose detectPresent throws (never-throws); adapters() returns the full pluggable set`, `createHostAdapter builds an adapter from a data-only HostSpec (ac3 pluggability: a new HostSpec needs no existing-adapter change)`
  - Fixtures: `a fake HostEnv (scripted getExtension set + appName/uriScheme)`, `the fake HostFileSystem`, `a couple of test HostSpecs (one by-extension-id, one by-editor-env)`
- **unit** — Prove the registerHostCommands wiring: combined consent, wire-only-on-accepted, and the k5 boundary — with fake sc2/sc3/sc4 + a fake registry.
  - Subjects: `registers the insrc.hosts.wire command into the fake CommandRegistry`, `the wire command calls ConsentGate.ask with items = every detected adapter's displayName (single combined prompt) and wires NONE until 'accepted' (k4); on declined/dismissed nothing is written`, `on 'accepted' every detected adapter.wire() runs; a failing adapter (HostFileAccessError) does not abort the others; the outcome is pushed into StatusSurface.set`, `no supported host present → the command sets a 'no hosts detected' status and wires nothing`, `source-scan: vscode-plugin/src/hosts/ imports only node builtins + the s1 surfaces (+ the shared writers) — no daemon internals/indexer/storage, no cloud/HTTP (k5)`
  - Fixtures: `fake CommandRegistry/ConsentGate/StatusSurface (S002 pattern)`, `a fake AiHostRegistry returning scripted present adapters (some wire-ok, one wire-throws)`
- **unit** — Prove the extension.ts activation wiring keeps the S001 never-throws/off-UI contract with the sc5 wiring added (source-scan + fake-VS-Code, mirroring S001/S002).
  - Subjects: `extension.ts constructs the AiHostRegistry (HostSpec list + real HostEnv/HostFileSystem) and calls registerHostCommands with the s1 surfaces`, `the activation-time combined-consent wire offer is fire-and-forget + guarded so activate() never throws / never blocks; it only fires when present hosts exist`
  - Fixtures: `source read of vscode-plugin/src/extension.ts`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `the wire command calls ConsentGate.ask with items = detected host displayNames in ONE combined prompt and wires none until 'accepted' (registerHostCommands unit test) — proves the single combined prompt naming every detected host`, `AiHostRegistry.detectPresent returns only present adapters (detection unit test) — proves 'one or more supported hosts detected by extension-id/editor-env'` |
| `ac2` | `AiHostAdapter.wire writes mcpServers.insrc + the steering block via the shared writers preserving surrounding content (adapter unit test) — proves 'each host's own config gains the registration + steering'`, `McpConfigWriter preserves other keys / never-clobbers + SteeringWriter preserves surrounding content, and unwire() reverses both (writer + adapter unit tests) — proves 'written reversibly, preserving the developer's surrounding content'`, `composeMcpEntry is a local stdio node <insrc-mcp.js> with no cloud/env/argv (compose unit test) — proves k2` |
| `ac3` | `createHostAdapter builds a working adapter from a data-only HostSpec, and adding a HostSpec to the registry needs no change to existing adapters (registry/factory unit test) — proves 'a new host plugs into the same flow without reworking existing adapters'` |

## Alternatives considered

### a1: Spec-driven adapters over shared reversible writers + injected FS/HostEnv seams (JetBrains mirror) — **CHOSEN**

sc5 AiHostAdapter/AiHostRegistry implemented as small spec-driven adapters: each host is a HostSpec (descriptor + detect predicate + config-path resolver) turned into an AiHostAdapter by a shared factory whose wire()/unwire() call s3-internal reversible writers — a JSON key-merge for mcpServers.insrc + a marker-block upsert/remove for the steering file + a compose-mcp-entry — all over an injected FileSystem + HostEnv seam.

Define sc5 verbatim (HostDescriptor, AiHostAdapter, AiHostRegistry). Internally a HostSpec = { descriptor; detect(env): boolean; resolveConfig(): { mcpConfigPath; steeringPath } }. A shared createHostAdapter(spec, deps) yields an AiHostAdapter: detectPresent() runs spec.detect over an injected HostEnv (getExtension(id) for 'by-extension-id'; appName/uriScheme for 'by-editor-env'); wire() composes the mcpServers.insrc entry (node <insrc-mcp.js>, no cloud/env/argv — k2) and writes it via the s3-internal McpConfigWriter (JSON key-merge, never-clobber) AND writes the tracked-workflow steering via the s3-internal SteeringWriter (pure marker-block upsert); unwire() removes exactly the mcpServers.insrc key + the marker block. Both writers go through an injected FileSystem seam so they are unit-testable off a real fs + off VS Code. A new host = add ONE HostSpec (ac3). Mirrors jetbrains-plugin host/ 1:1.

### a2: Hand-written per-host adapter classes, each owning its own wire/unwire

Each supported host is a class implementing sc5 directly, with its detection + config paths + JSON/marker writing written inline in that class.

Implement AiHostAdapter as one concrete class per host, each with its own detectPresent + wire + unwire that read/write the host's config inline. AiHostRegistry holds the list of instances. No shared writer seams — each class does its own JSON merge + marker handling.

**Rejected because:** Honors the sc5 shape but PARTIAL on ac2/ac3/k4: duplicating the reversible-write logic per adapter multiplies the never-clobber/never-partial-write surface and makes a new host a full class rather than a data-only add. No hard violation but materially riskier than a1's single-writer centralization.

### a3: Single monolithic host-wiring engine keyed by a host enum

Replace the per-host AiHostAdapter objects with one HostWirer that switches over a HostKind enum for detection, path resolution, and wiring.

A single engine exposes detectPresentHosts()/wire(kind)/unwire(kind) with an internal switch over an enum of known hosts; no per-host adapter object, no AiHostRegistry of adapters.

**Rejected because:** VIOLATES sc5 (collapses the per-adapter contract s5 iterates) and ac3 (a new host reworks the central switch). Centralized writers don't offset breaking the fixed contract; ranks last.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate: the shipped S001 contracts sc5 consumes — CommandRegistry.register with InsrcCommandId 'insrc.hosts.wire' (vscode-plugin/src/surfaces/command-registry.ts), ConsentGate.ask + ConsentRequest.items for the combined prompt (vscode-plugin/src/surfaces/consent-gate.ts), StatusSurface.set (status-surface.ts) — plus the S002 registerDaemonCommands precedent (vscode-plugin/src/daemon/commands.ts) + the S001 never-throws/off-UI activation contract (extension.ts)` — "InsrcCommandId already declaring 'insrc.hosts.wire'; ConsentRequest.items is purpose-built for the detected host names for the combined wiring prompt."
- **[[c2]]** `analyze-bundle` `s1 convention.detect: VS Code detection primitives — vscode.extensions.getExtension(id) for 'by-extension-id' hosts, vscode.env (appName/uriScheme) for 'by-editor-env' forks; the launch target ~/.insrc/daemon/out/bin/insrc-mcp.js; the k5 thin boundary (new sc5 modules under vscode-plugin/src/hosts/ with an injectable fs seam like S002's SubprocessRunner)` — "VS Code has NO PluginManager: an extension-ID host is detected via vscode.extensions.getExtension(id); an editor-ENVIRONMENT host via vscode.env (appName/uriScheme)."
- **[[c3]]** `analyze-bundle` `s1 capability.map: the JetBrains detection model (AiHostAdapter.detectPresent + AiHost + Present/Absent/Unrecognised + never-throws) + HostFileAccessException surfaced with no partial write (jetbrains-plugin/.../host/AiHostAdapter.kt, HostDetection.kt, JetBrainsHostProbes.kt)` — "detectPresent NEVER throws — a host it can't safely determine is logged + omitted; HostFileAccessException is surfaced, not swallowed, only after leaving the file exactly as it was (no partial write)."
- **[[c5]]** `analyze-bundle` `s1 capability.map: the JetBrains host write stack sc5 mirrors — InsrcMcpRegistration.composeServerEntry (mcpServers.insrc = { command:'node', args:[insrc-mcp.js] }, local stdio only, no env/argv), JsonMcpConfigWriter (JSON key-merge, non-object mcpServers throws, never clobber), MarkerSection (marker-delimited upsert/remove, malformed→untouched)` — "Two formats because HTML-comment markers are invalid in JSON — a JSON key-merge under mcpServers.insrc for the mcp config, a marker-delimited block for the Markdown steering; both reversible."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-22T04:57:57.169Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c5 | citation | LOW | manual | The JetBrains InsrcMcpRegistration composes the mcpServers.insrc value as a local stdio { command:'node', args:[insrc-mcp.js] } with no baked INSRC_REPO env / no --repo argv — the shape composeMcpEntry mirrors. | Confirmed: InsrcMcpRegistration.kt defines SERVER_KEY='insrc' and JsonMcpConfigWriter.kt:39 servers.add(InsrcMcpRegistration.SERVER_KEY, ...); the composed value is a local `node` stdio entry (command/node/args) with no cloud/env/argv — the exact shape composeMcpEntry mirrors. | none — verified sound |
| c5 | citation | LOW | manual | The JetBrains JsonMcpConfigWriter does a JSON key-merge under mcpServers.insrc preserving other keys and throws (never clobbers) when mcpServers is a present-but-non-object — the McpConfigWriter mirror. | Confirmed: JsonMcpConfigWriter.kt is the JSON key-merge under mcpServers.insrc (writeInsrcServer/removeInsrcServer, mcpServersOrThrow throws on a non-object mcpServers — never clobber); AiHostAdapterImpl.kt uses mcpWriter.writeInsrcServer. The McpConfigWriter mirror is grounded. | none — verified sound |
| c5 | citation | LOW | manual | The JetBrains MarkerSection is the pure marker-delimited upsert/removal that appends when no markers, replaces between markers, and leaves malformed/duplicate markers untouched — the SteeringWriter mirror. | Confirmed: MarkerSection.kt is the pure marker upsert/removal with the duplicate-marker UNCHANGED guard + countOccurrences (append/replace/leave-untouched). The SteeringWriter mirror is grounded. | none — verified sound |
| c1 | citation | LOW | manual | The shipped S001 CommandRegistry InsrcCommandId union already declares 'insrc.hosts.wire' — the exact command s3 registers (no new id). | Confirmed: vscode-plugin/src/surfaces/command-registry.ts:20 declares 'insrc.hosts.wire' in the InsrcCommandId union — the exact command s3 registers; no new id needed. | none — verified sound |
| c1 | citation | LOW | manual | The shipped S001 sc4 ConsentRequest has an `items?: string[]` field purpose-built for the combined wiring prompt's detected host names. | Confirmed: vscode-plugin/src/surfaces/consent-gate.ts:12 interface ConsentRequest with :17 `items?: string[] \| undefined` — the field the combined wiring prompt passes detected host displayNames in. | none — verified sound |
| c1 | citation | LOW | manual | The S002 registerDaemonCommands is the shipped command-wiring precedent s3 mirrors (register into sc3, gate an invasive action on sc4 'accepted', push state to sc2). | Confirmed: vscode-plugin/src/daemon/commands.ts is registerDaemonCommands (consent.ask + status.set + 'accepted' gate) — the shipped S002 command-wiring precedent registerHostCommands mirrors. | none — verified sound |
| c2 | external-contract | LOW | manual | VS Code provides vscode.extensions.getExtension(id) (extension-ID detection) and vscode.env.appName/uriScheme (editor-environment detection) — the two detection primitives HostEnv abstracts; the extension has no PluginManager equivalent. | External VS Code API contract (no source anchor yet, expected): vscode.extensions.getExtension(id) + vscode.env.appName/uriScheme are stable public VS Code APIs and there is no PluginManager equivalent — HostEnv abstracts exactly these. The S001/S002 vscode.d.ts shim does not yet declare them; the S003 build adds the needed shim members (window/commands/StatusBarItem etc. were added the same way for S001/S002). Non-blocking: the plan/build must extend vscode.d.ts with extensions/env. | S003 build extends vscode.d.ts with the `extensions.getExtension` + `env.appName/uriScheme` members the real HostEnv binds; verified against the public VS Code API. |
| interactionWithShared | cross-artifact | LOW | manual | s3 implements only its owned sc5 and consumes s1's sc3/sc4/sc2; it does not design s2's sc6 or s4's sc7, and it defers the uninstall-unwire driver + onboarding coalescing to s5 (exposing unwire() for s5). | Internal-consistency (no probe): the LLD's interactionWithShared shows sc5 role=implements (ownedByStory=s3) and sc3/sc4/sc2 role=consumes (owned by s1); sc6 (s2) and sc7 (s4) are never touched, and the uninstall-unwire DRIVER + onboarding coalescing are explicitly deferred to s5 (s3 only exposes unwire()). sbdry5 holds. | none — verified sound |
