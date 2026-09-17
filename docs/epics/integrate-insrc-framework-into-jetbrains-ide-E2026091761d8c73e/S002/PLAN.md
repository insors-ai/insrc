<!-- insrc:artifact PLAN-61d8c73edb68041a-s2 -->

# Plan: E2026091761d8c73e:S002

**Epic:** `integrate-insrc-framework-into-jetbrains-ide`
**LLD run:** `wf-1789646017020-g70hn8`
**LLD effective hash:** `7ebd2fd85012...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** sc3 data model + AiHostAdapter interface | S | — | unit: Sc3TypesTest: AiHostKind and HostFile expose exactly their two closed members; AiHost/MarkerDelimitedBlock are immutable with the declared fields | [[c1]] [[c2]] [[c3]] [[c4]] |
| 2 | **`t2`** Format-agnostic marker-delimited replace-only writer (writeBlock/removeBlock core) | M | `t1` | unit: MarkerWriterTest#writeBlock_insertsOnce_preservesSurrounding_idempotentOnRerun (temp file with surrounding user content); unit: MarkerWriterTest#writeBlock_replacesExistingSameMarkerBlockInPlace_noDuplicate; unit: MarkerWriterTest#removeBlock_stripsOnlyTheBlock_restoresPriorContent_noopWhenAbsent; unit: MarkerWriterTest#ioFailure_surfacesHostFileAccessException_noPartialWrite | [[c4]] [[c5]] |
| 3 | **`t3`** Host detection + format-safe path resolution (detectPresent) | M | `t1` | unit: DetectPresentTest#includesInstalledEnabledHostsWithResolvedPaths_excludesDisabledAndAbsent (stub host-presence inputs); unit: DetectPresentTest#unrecognisedHostFormat_failSafeSkip_omittedAndLogged_neverReachesWriter; unit: DetectPresentTest#neitherHostPresent_returnsEmpty_noThrow | [[c1]] [[c6]] [[c8]] |
| 4 | **`t4`** InsrcMcpRegistration launcher composition (per-call repo scoping, no cloud path) | M | `t1` | unit: RegistrationCompositionTest#launchCommandReferencesOnlyStdioInsrcMcp_noCloudEndpoint (ac4/k1); unit: RegistrationCompositionTest#attachesActiveProjectRootAsExplicitRepoArg_twoRootsScopeIndependently (ac2/k3); unit: RegistrationCompositionTest#missingLaunchTarget_skipsComposition_logged | [[c2]] [[c7]] |
| 5 | **`t5`** Project-open wiring: write the insrc-mcp registration into each detected host | M | `t2`, `t3`, `t4` | integration: ProjectOpenWiringTest#oneHostPresent_writesRegistrationIntoItsMcpConfig (IntelliJ Platform fixture, ac1); integration: ProjectOpenWiringTest#bothHostsPresent_eachConfigReceivesRegistration (ac3); integration: ProjectOpenWiringTest#noHostPresent_nothingWritten_noop; integration: ProjectOpenWiringTest#oneHostWriteFails_otherHostStillWired_onlyMcpFileWritten | [[c1]] [[c2]] [[c3]] |

### E2026091761d8c73e:S002:T001 — sc3 data model + AiHostAdapter interface

Introduce the sc3 shared-contract types in the jetbrains-plugin module: AiHostKind ('ai-assistant'|'junie'), HostFile ('mcp'|'rules'), AiHost (kind + absolute mcpConfigPath + rulesFilePath), MarkerDelimitedBlock (beginMarker/endMarker/body), the HostFileAccessException, and the AiHostAdapter interface (detectPresent/writeBlock/removeBlock). Types only — the public seam S004/S005 consume; no behaviour yet.

**Acceptance checks:**
- AiHostKind and HostFile are closed Kotlin enums/sealed types with exactly their two members each
- AiHost is immutable and carries absolute mcpConfigPath + rulesFilePath; MarkerDelimitedBlock carries beginMarker/endMarker/body
- AiHostAdapter declares detectPresent(): List<AiHost>, writeBlock(host,file,block), removeBlock(host,file) matching the LLD signatures
- Lives under package ai.insors.insrc.jetbrains and compiles against the existing S001 module

### E2026091761d8c73e:S002:T002 — Format-agnostic marker-delimited replace-only writer (writeBlock/removeBlock core)

Implement the k4 primitive as a STRICTLY format-agnostic read-modify-write over an already-located host file: writeBlock inserts the delimited block once and replaces an existing same-marker block in place, preserving all surrounding content byte-for-byte and idempotent on re-run; removeBlock strips only the delimited block and restores prior content, no-op when absent. Port the proven steering-inject marker mechanic (src/daemon/steering-inject.ts) into Kotlin. Surface HostFileAccessException on IO failure with no partial write. Host-format recognition is NOT here — it lives in t3; this keeps the primitive reusable by S004 for the 'rules' file.

**Acceptance checks:**
- writeBlock into a file with surrounding user content inserts exactly one block and leaves all other bytes unchanged; second identical write is byte-identical (idempotent)
- writeBlock over an existing same-marker block replaces it in place (no duplicate)
- removeBlock deletes only the delimited block and restores pre-insrc content; no-op when no block present
- an IO failure surfaces HostFileAccessException and leaves the target file exactly as it was (no partial write)
- the writer contains no host-format/shape recognition logic (format-agnostic; recognition belongs to t3) — it operates purely on markers over a given file

### E2026091761d8c73e:S002:T003 — Host detection + format-safe path resolution (detectPresent)

Implement detectPresent(): probe the running IDE for AI Assistant and Junie, returning only installed+enabled hosts with resolved absolute mcpConfigPath + rulesFilePath; exclude disabled/absent hosts; return empty when neither present. This task OWNS host-format recognition (the c8 external dimension isolated behind a small per-host resolver): a host whose config shape/version cannot be safely recognised is logged and omitted (fail-safe skip), so the format-agnostic writer (t2) is only ever handed a recognised, anchored file. Detection never throws.

**Acceptance checks:**
- detectPresent returns entries only for installed+enabled hosts, each with absolute mcpConfigPath and rulesFilePath
- a disabled or absent host is excluded from the result
- neither host present -> empty list (no throw)
- a host whose config format/shape is unrecognised is omitted + logged (fail-safe skip) so no unrecognised file ever reaches the writer, never surfaced as a partial/broken host

### E2026091761d8c73e:S002:T004 — InsrcMcpRegistration launcher composition (per-call repo scoping, no cloud path)

Compose the S002-internal 'mcp' block body: an MCP-server registration whose launch command is a thin plugin-provided launcher that spawns ONLY the existing stdio insrc-mcp (out/bin/insrc-mcp.js via buildInsrcMcpServer) and attaches the active project's root (sc1 ProjectContext.projectRootPath) as the explicit repo argument per call — reusing the resolve-repo explicit-over-INSRC_REPO contract. No cloud/REST endpoint. Skip composing when the insrc-mcp launch target cannot be resolved.

**Acceptance checks:**
- the composed registration's launch command references only the existing insrc-mcp stdio server — no cloud/REST endpoint (k1, ac4)
- the registration attaches the active project's root as the explicit repo argument; composing for two distinct roots yields two registrations each scoped to its own root (k3, ac2)
- when the insrc-mcp launch target is absent, composition is skipped (no registration pointing at a missing server) and the condition is logged
- the launcher resolves repo per call (not a fixed shared INSRC_REPO default), so a shared MCP process across windows stays correctly scoped

### E2026091761d8c73e:S002:T005 — Project-open wiring: write the insrc-mcp registration into each detected host

Wire the sc1 onProjectOpened lifecycle (S001 seam) to the adapter: on project open, for each host from detectPresent(), compose the InsrcMcpRegistration (t4) and writeBlock(host,'mcp',block) (t2); empty detection = silent no-op. Each host wired independently so one host's HostFileAccessException does not block the other. Runs off the UI/EDT thread and is bounded so project opening is never blocked. Only the 'mcp' file is written — 'rules' is left to S004, removeBlock invocation to S005.

**Acceptance checks:**
- on project open with one host present, a marker-delimited insrc-mcp registration is written into that host's mcp config (ac1)
- with both hosts present, each host's mcp config independently receives the registration (ac3)
- with no host present, nothing is written (no-op)
- a write failure on one host is surfaced/logged but the other present host is still wired; S002 writes only the 'mcp' file (no 'rules' write, no removeBlock call)
- the on-project-open wiring runs off the UI/EDT thread and does not block project opening (HLD performance invariant)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| writeBlock: replace-only + marker-delimited (inserts once, replaces an existing block in place, preserves all surrounding content, byte-identical on re-run) | `t2` |
| removeBlock: removes only the delimited block and restores prior content; no-op when absent | `t2` |
| unrecognised host-file format -> fail-safe skip (no write, no corruption) and HostFileAccessException surfaced on IO failure | `t3`, `t2` |
| InsrcMcpRegistration composition: the block body launches the existing insrc-mcp (no cloud endpoint) and attaches the active project's root as the explicit repo argument (k3, ac4) | `t4` |
| detectPresent: includes installed+enabled hosts with resolved config/rules paths; excludes disabled/absent hosts | `t3` |
| On project open with one host present, a marker-delimited insrc-mcp registration appears in that host's MCP config file (ac1) | `t5` |
| With both hosts present, each host's config receives the registration (ac3) | `t5` |
| With no host present, nothing is written (empty detectPresent, no-op) | `t5` |
| The composed registration's launch command references only the existing insrc-mcp stdio server — no cloud/REST endpoint (ac4, k1) | `t4` |
| The registration wires the repo argument to the active project's root, not a fixed shared default (ac2, k3) | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 contractDetails: AiHostAdapter (sc3) surface — detectPresent/writeBlock/removeBlock` — "sc3 AiHostAdapter: detectPresent(): List<AiHost>; writeBlock(host,file,block); removeBlock(host,file). The internal-shared seam S004/S005 consume."
- **[[c2]]** `prior-artifact` `LLD s2 dataModelChanges: InsrcMcpRegistration + interactionWithShared sc3/sc1 (the launcher that spawns the existing insrc-mcp)` — "InsrcMcpRegistration: an MCP-server entry whose launch command spawns the existing stdio insrc-mcp (buildInsrcMcpServer, src/mcp/server.ts:120 / src/bin/insrc-mcp.ts) and attaches the active project's"
- **[[c3]]** `prior-artifact` `LLD s2 hldContextSlice.boundary + nonFunctional: S002 wires on sc1 onProjectOpened, writes only the 'mcp' file, off-thread/bounded` — "S002 consumes sc1 (ProjectContext/onProjectOpened) to write the insrc-mcp registration into each detected host on project open; 'rules' left to S004, removal to S005; project-open work runs off the UI"
- **[[c4]]** `prior-artifact` `LLD s2 dataModelChanges: MarkerDelimitedBlock + contractDetails writeBlock/removeBlock postconditions (k4)` — "MarkerDelimitedBlock {beginMarker,endMarker,body}; writeBlock is replace-only + marker-delimited, idempotent, preserves surrounding content; removeBlock reverses it (k4)."
- **[[c5]]** `prior-artifact` `LLD s2 invariantsToPreserve c5 -> steering-refresh marker writer (src/daemon/steering-inject.ts, src/cli/services/maintenance.ts refreshSteering)` — "Reuse the proven marker-delimited replace-only writer (refreshSteering / steering-inject marker upsert) so every host-file write preserves surrounding user content and is fully reversible (k4)."
- **[[c6]]** `prior-artifact` `LLD s2 dataModelChanges: AiHostKind closed union {'ai-assistant','junie'} — the two JetBrains agentic hosts detectPresent covers` — "AiHostKind: closed union of the two JetBrains agentic hosts 'ai-assistant' | 'junie'; detectPresent realises detection for both."
- **[[c7]]** `prior-artifact` `LLD s2 invariantsToPreserve c7 -> no new cloud path (k1); CLAUDE.md 'No direct cloud REST'` — "No new cloud path: the MCP registration only spawns the existing stdio insrc-mcp server, so cloud reasoning stays on the host assistant's CLI-OAuth sessions (k1, ac4)."
- **[[c8]]** `prior-artifact` `LLD s2 errorPaths + contractDetails assumptions c8: the external two-host config-format dimension isolated behind a per-host resolver` — "The two AI hosts have different MCP/config formats (external c8 dimension); a host whose config shape is unrecognised is skipped fail-safe rather than written into — recognition isolated behind a smal"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-17T12:18:26.424Z

_No load-bearing premises were extracted._
