<!-- insrc:artifact PLAN-ad0d45c9d690f8c1-s3 -->

# Plan: E20260922ad0d45c9:S003

**Epic:** `build-insrc-vs-code-extension-v1`
**LLD run:** `wf-1790052456217-lgatm9`
**LLD effective hash:** `1e2038ef7232...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Shared reversible writers + composeMcpEntry over an injectable HostFileSystem | M | — | unit: McpConfigWriter.writeInsrcServer sets mcpServers.insrc preserving every other key/server; idempotent on re-run; creates {} when the file is absent; unit: McpConfigWriter throws HostFileAccessError (no write) when mcpServers is present-but-non-object (never clobber); unit: McpConfigWriter.removeInsrcServer deletes only the insrc key (other servers intact) and is a no-op when absent; unit: SteeringWriter.upsert: no-markers→append preserving prior content; markers→replace between; malformed/duplicate→leave untouched (guarded no-op); idempotent; remove deletes the block + no-op when no markers; unit: both writers leave the file byte-unchanged when HostFileSystem.write throws (no partial write); unit: composeMcpEntry(path) = { command:'node', args:[path] } and returns undefined (skip) for an undefined launch target (no cloud/env/argv) | [[c1]] |
| 2 | **`t2`** sc5 types + createHostAdapter factory + HostSpec registry over an injectable HostEnv | M | `t1` | unit: AiHostAdapter.detectPresent: 'by-extension-id'→getExtension(id) truthiness; 'by-editor-env'→appName/uriScheme match; never throws (indeterminate→false); unit: AiHostAdapter.wire writes BOTH the mcpServers.insrc entry + the steering block via the shared writers; wire() skips the mcp entry (steering only) when the launch target is absent; unit: AiHostAdapter.unwire removes exactly the insrc key + the marker block, restoring prior content (reversible); unit: AiHostRegistry.detectPresent returns only present adapters and omits an adapter whose detectPresent throws (never-throws); adapters() returns the full pluggable set; unit: createHostAdapter builds an adapter from a data-only HostSpec (ac3 pluggability: a new HostSpec needs no existing-adapter change); the starter list has ≥1 by-extension-id + ≥1 by-editor-env | [[c2]] |
| 3 | **`t3`** registerHostCommands wiring (insrc.hosts.wire, combined consent, wire-only-on-accepted, state→sc2) | M | `t2` | unit: registerHostCommands registers the insrc.hosts.wire command into the fake CommandRegistry; unit: the wire command calls ConsentGate.ask with items = every detected adapter's displayName (single combined prompt) and wires NONE until 'accepted' (k4); on declined/dismissed nothing is written; unit: on 'accepted' every detected adapter.wire() runs; a failing adapter (HostFileAccessError) does not abort the others; the outcome is pushed into StatusSurface.set; unit: no supported host present → the command sets a 'no hosts detected' status and wires nothing; unit: source-scan: vscode-plugin/src/hosts/ imports only node builtins + the s1 surfaces (+ the shared writers) — no daemon internals/indexer/storage, no cloud/HTTP (k5) | [[c3]] |
| 4 | **`t4`** Extend vscode.d.ts (extensions/env) + wire the host registry into extension.ts | S | `t2`, `t3` | unit: extension.ts constructs the AiHostRegistry (HostSpec list + real HostEnv/HostFileSystem) and calls registerHostCommands with the s1 surfaces; the activation-time wire offer is fire-and-forget + guarded (never throws/blocks) and only fires when present hosts exist (source-scan); unit: contributes.commands includes insrc.hosts.wire alongside the S002 daemon entries (palette reachability, k6); smoke: the vscode-plugin package typechecks (tsc -p tsconfig.json) with the vscode.d.ts extensions/env shim + the hosts wiring added | [[c2]] [[c3]] [[c4]] |

### E20260922ad0d45c9:S003:T001 — Shared reversible writers + composeMcpEntry over an injectable HostFileSystem

Create vscode-plugin/src/hosts/ with: HostFileSystem interface { read(path): string|undefined; write(path, content): void; exists(path): boolean } + a default node:fs impl (creates parent dirs on write); McpConfigWriter.writeInsrcServer/removeInsrcServer (JSON key-merge under mcpServers.insrc preserving every other key; throw HostFileAccessError on a present-but-non-object mcpServers — never clobber; idempotent; no partial write on fs failure); SteeringWriter.upsert/remove (pure marker-delimited block: no-markers→append preserving prior content, markers→replace between, malformed/duplicate→leave untouched); composeMcpEntry(launchTargetPath): { command:'node', args:[path] } | undefined (fail-safe skip when absent; no cloud/env/argv — k2). Mirrors JsonMcpConfigWriter/MarkerSection/InsrcMcpRegistration; the HostFileAccessError type lives here.

**Acceptance checks:**
- McpConfigWriter.writeInsrcServer sets mcpServers.insrc preserving other keys/servers; idempotent; creates {} for an absent file; removeInsrcServer deletes only the insrc key; throws HostFileAccessError (no write) on a non-object mcpServers
- SteeringWriter.upsert appends when no markers / replaces between markers / leaves malformed-or-duplicate markers untouched; remove deletes the block; both no-op idempotently
- both writers leave the file byte-unchanged when HostFileSystem.write throws (no partial write); errors surface as HostFileAccessError
- composeMcpEntry returns { command:'node', args:[path] } and undefined for an undefined launch target (no cloud/env/argv)

### E20260922ad0d45c9:S003:T002 — sc5 types + createHostAdapter factory + HostSpec registry over an injectable HostEnv

Add the sc5 contract types (HostDetection, HostDescriptor, AiHostAdapter, AiHostRegistry) + a HostEnv seam { getExtension(id): boolean; appName: string; uriScheme: string } (default over vscode.extensions/vscode.env). Add createHostAdapter(spec, deps) whose detectPresent runs spec.detect over HostEnv (never throws→false) and whose wire/unwire delegate to the t1 writers (wire writes the mcp entry via composeMcpEntry+McpConfigWriter AND the steering block via SteeringWriter; skips the mcp entry when the launch target is absent; unwire removes exactly both). Add a SMALL data-only HostSpec starter list scoped to hosts with a genuinely known/stable config location — at least one 'by-extension-id' and one 'by-editor-env' so both detection kinds + ac3 are exercised — each HostSpec.resolveConfig isolated so an evolving path is a one-line fix. Add createHostRegistry(specs, deps) implementing adapters() (all) + detectPresent() (present subset, omitting any adapter whose detectPresent throws). A new host = one HostSpec (ac3).

**Acceptance checks:**
- AiHostAdapter.detectPresent: 'by-extension-id'→HostEnv.getExtension(id); 'by-editor-env'→appName/uriScheme match; never throws (indeterminate→false)
- AiHostAdapter.wire writes BOTH the mcp entry + the steering block via the t1 writers (steering-only when the launch target is absent); unwire removes exactly both (reversible)
- AiHostRegistry.detectPresent returns only present adapters and omits an adapter whose detectPresent throws; adapters() returns the full pluggable set
- createHostAdapter builds an adapter from a data-only HostSpec — adding a HostSpec needs no change to existing adapters (ac3); the starter list has ≥1 by-extension-id + ≥1 by-editor-env with an isolated resolveConfig each

### E20260922ad0d45c9:S003:T003 — registerHostCommands wiring (insrc.hosts.wire, combined consent, wire-only-on-accepted, state→sc2)

Add registerHostCommands({ commands, consent, status, registry }): registers the durable insrc.hosts.wire command into sc3. On run: registry.detectPresent(); if none, set a 'no supported AI hosts detected' status; else present ONE combined sc4 ConsentGate prompt with items = the detected adapters' displayNames and wire each ONLY on 'accepted' (k4/ac1). A failing adapter (HostFileAccessError) does not abort the others; the aggregate outcome is pushed into sc2 (StatusSurface.set). Nothing is written on declined/dismissed. Mirrors S002 registerDaemonCommands + a shared offerHostWiring helper (reused by the activation offer).

**Acceptance checks:**
- registers the insrc.hosts.wire command into the CommandRegistry
- the wire command asks a single combined ConsentGate prompt (items = detected displayNames) and wires NONE until 'accepted'; declined/dismissed writes nothing (k4)
- on 'accepted' every detected adapter.wire() runs; one adapter throwing does not abort the others; the outcome is pushed into StatusSurface.set
- no supported host present → a 'no hosts detected' status, no prompt, no write

### E20260922ad0d45c9:S003:T004 — Extend vscode.d.ts (extensions/env) + wire the host registry into extension.ts

Extend vscode-plugin/src/vscode.d.ts with the public members the real HostEnv binds: `extensions.getExtension(id): { id: string } | undefined` and `env.appName: string` + `env.uriScheme: string`. In extension.ts (sole 'vscode' importer): construct the real HostEnv (over vscode.extensions/vscode.env) + real HostFileSystem (node:fs) + a launch-target resolver reusing the S002 DaemonPaths daemon home, build the AiHostRegistry from the HostSpec list, call registerHostCommands with the s1 surfaces, and fire a MINIMAL activation-time combined-consent wire offer when present hosts are unwired — fire-and-forget + guarded so activate() never throws / never blocks (S001 preserved). The install→register→wire coalescing stays s5's job. ADD the single insrc.hosts.wire entry to the EXISTING contributes.commands array (do not remove the S002 daemon entries) so the wire command is Command-Palette reachable (k6).

**Acceptance checks:**
- vscode.d.ts declares extensions.getExtension + env.appName/uriScheme; the package typechecks (tsc -p tsconfig.json)
- extension.ts constructs the AiHostRegistry (real HostEnv/HostFileSystem + launch-target resolver) and calls registerHostCommands with the s1 surfaces
- the activation-time combined-consent wire offer is fire-and-forget + guarded so activate() never throws / never blocks; it only fires when present hosts exist
- insrc.hosts.wire is ADDED to the existing contributes.commands array (S002 daemon entries untouched) so a dismissed offer stays Command-Palette reachable (k6)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| McpConfigWriter.writeInsrcServer sets mcpServers.insrc while preserving every other key/server; idempotent on re-run; creates {} when the file is absent | `t1` |
| McpConfigWriter throws HostFileAccessError (no write) when mcpServers is present-but-non-object (never clobber) | `t1` |
| McpConfigWriter.removeInsrcServer deletes only the insrc key (other servers intact) and is a no-op when absent | `t1` |
| SteeringWriter.upsert: no-markers→append preserving prior content; markers→replace between; malformed/duplicate→leave untouched (guarded no-op); idempotent | `t1` |
| SteeringWriter.remove deletes the marker block and is a no-op when no markers exist | `t1` |
| both writers leave the file byte-unchanged when HostFileSystem.write throws (no partial write) | `t1` |
| composeMcpEntry(path) = { command:'node', args:[path] } and returns undefined (skip) for an undefined launch target (no cloud/env/argv) | `t1` |
| AiHostAdapter.detectPresent: 'by-extension-id'→getExtension(id) truthiness; 'by-editor-env'→appName/uriScheme match; never throws (indeterminate→false) | `t2` |
| AiHostAdapter.wire writes BOTH the mcpServers.insrc entry + the steering block via the shared writers; wire() skips the mcp entry (steering only) when the launch target is absent | `t2` |
| AiHostAdapter.unwire removes exactly the insrc key + the marker block, restoring prior content (reversible) | `t2` |
| AiHostRegistry.detectPresent returns only present adapters and omits an adapter whose detectPresent throws (never-throws); adapters() returns the full pluggable set | `t2` |
| createHostAdapter builds an adapter from a data-only HostSpec (ac3 pluggability: a new HostSpec needs no existing-adapter change) | `t2` |
| registers the insrc.hosts.wire command into the fake CommandRegistry | `t3` |
| the wire command calls ConsentGate.ask with items = every detected adapter's displayName (single combined prompt) and wires NONE until 'accepted' (k4); on declined/dismissed nothing is written | `t3` |
| on 'accepted' every detected adapter.wire() runs; a failing adapter (HostFileAccessError) does not abort the others; the outcome is pushed into StatusSurface.set | `t3` |
| no supported host present → the command sets a 'no hosts detected' status and wires nothing | `t3` |
| source-scan: vscode-plugin/src/hosts/ imports only node builtins + the s1 surfaces (+ the shared writers) — no daemon internals/indexer/storage, no cloud/HTTP (k5) | `t3` |
| extension.ts constructs the AiHostRegistry (HostSpec list + real HostEnv/HostFileSystem) and calls registerHostCommands with the s1 surfaces | `t4` |
| the activation-time combined-consent wire offer is fire-and-forget + guarded so activate() never throws / never blocks; it only fires when present hosts exist | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 handoff: sc5 shared reversible writers — McpConfigWriter (JSON key-merge, never-clobber) + SteeringWriter (marker block) + composeMcpEntry over an injectable HostFileSystem; HostFileAccessError`
- **[[c2]]** `prior-artifact` `LLD s3 handoff: sc5 contract types (HostDetection/HostDescriptor/AiHostAdapter/AiHostRegistry) + createHostAdapter factory + data-only HostSpec list + createHostRegistry over an injectable HostEnv`
- **[[c3]]** `prior-artifact` `LLD s3 handoff: registerHostCommands — the insrc.hosts.wire command with a single combined sc4 consent, wire-only-on-accepted, failing adapter isolation, outcome pushed to sc2`
- **[[c4]]** `prior-artifact` `LLD s3 handoff: extension.ts activation wiring (real HostEnv/HostFileSystem + launch-target resolver, guarded fire-and-forget wire offer preserving S001 never-throws) + vscode.d.ts extensions/env shim + contributes.commands insrc.hosts.wire (k6)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-22T05:11:32.163Z

_No load-bearing premises were extracted._
