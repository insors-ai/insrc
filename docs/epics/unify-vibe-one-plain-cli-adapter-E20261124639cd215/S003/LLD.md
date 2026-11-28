<!-- insrc:artifact LLD-639cd2159a87aedb-s3 -->

# LLD: STORY-639cd2159a87aedb-s3 — VS Code chat runs Vibe through the shared adapter with streaming preserved

## Summary

**Epic:** `unify-vibe-one-plain-cli-adapter`
**HLD base run:** `wf-1795535373279-l4wumn`
**HLD effective hash:** `67d59677de6a...`
**Tracker:** [insors-ai/insrc#317](https://github.com/insors-ai/insrc/issues/317)

This revision replaces round 3's 'did we see any row' terminal guess with the real thing: the chat's direct Vibe launch now tracks dispatch the same way the shared adapter does, allocates its own per-turn export directory so it can read Vibe's own reported stop reason, and writes that real outcome into the one durable marker every reader (live or reattaching) already consults -- so a resumed turn is classified exactly as safely as a live one, and the approval-parity rollout gets an explicit go/no-go rule instead of an open-ended live check.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [HLD context](#2-hld-context)
3. [Contract details](#3-contract-details)
4. [Data model changes](#4-data-model-changes)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. Epic impact analysis

**Stories covered:** `s1`

Epic impact: this analysis covers s1. s1's BUILD (t7 FAILED per the digest) built the shared adapter module (src/shared/vibe-adapter.ts) including the dispatchState model, buildArgv's 2-argument export-directory contract, and the backend's own dispatch/exit-evidence handling -- but s1's own scope stopped at the backend provider; it did not give the plugin chat's direct-spawn vibe branch an equivalent dispatchState/export-directory/durable-terminal-marker mechanism. Rounds 1-3 of this Story's own design progressively underestimated how much of s1's internal machinery (not just its sc1/sc2 contracts) the plugin needs to mirror to get replay-safety and completion-evidence right: round 3 invented a local 'sawRow' heuristic and an untested assumption that the follower's existing missing-result path already classified replay safety, when in fact (a) the adapter's real dispatchState transitions BEFORE the stdin write, (b) the durable record both live and follow readers actually share is session-output.ts's turn-end marker, not run()'s in-memory doneEvent, and (c) buildArgv requires a caller-owned per-turn export directory that round 3 never allocated. Round 4 corrects all three, plus adds a rollout rule for the still-open approval-parity live-verification gap.

**Sources:**
- src/shared/vibe-adapter.ts:436-490
- src/shared/vibe-adapter.ts:365-375
- src/shared/vibe-adapter.ts:573-595
- vscode-plugin/src/chat/cli-adapter.ts:1260-1285
- vscode-plugin/src/chat/cli-adapter.ts:1636-1693
- vscode-plugin/src/chat/session-output.ts:500-550
- .insrc/artifacts/BUILD-639cd2159a87aedb-s1.json

## 2. HLD context

> See **HLD-639cd2159a87aedb** § 2. Framework summary

**Rollout phase:** Phase B — Adapter consumers
**Consumes:** `sc1` (Vibe execution adapter interface), `sc2` (Qualified insrc tool naming — general identity plus the analysis allowlist)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Everything behind the adapter interface: argv construction, the execution context, process-group policy, transient-error classification, and the deletion of src/shared/vibe-session.ts plus rewiring of backend provider paths onto the adapter. — owns `sc1`, `sc2`
- `s2`: The narrow-authorization design: live qualification suite, adapter-owned ReadOnlyCapability wiring, unavailable-state reporting. — owns `sc3`
- `s4`: The TOML reader's internals: parse-for-understanding, surgical byte-preserving edits, refusal path, rewiring of mcp-register and toml-mcp-writer. — owns `sc4`
- `s5`: The model-family alignment: catalog, registry, check and definitions entries for cli-vibe.
- `s6`: The reconciliation work: verifying the chat prompt-transport fix, approval parity, tool-result output parity, resume-selection behavior and worker cleanup parity; closing implemented issues with evidence.

## 3. Contract details

**Surface level:** internal

### 3.1 `mapLine`

```typescript
function mapLine(line: string, turnId: string, state: DecoderState): TurnEvent[]
```

**Parameters:**
- `line: string` — One line of the session's durable JSONL file -- a raw native Vibe journal row or a legacy worker-bridged row.
- `turnId: string` — Correlates emitted TurnEvent entries to the active turn.
- `state: DecoderState` — Carries selectionSeq/selectionBuffer/toolCommands/editPaths/sessionId across reader restarts.

**Returns:** `TurnEvent[]` — Zero or more decoded chat transcript events for this line.

**Preconditions:**
- line is one record from the turn's durable session file

**Postconditions:**
- Carried unchanged from round 3: native reasoning/effect rows and legacy worker-bridged rows both decode through this one entry point (ac2, lc2)
- An MCP tool name resolves via VibeMcpNaming.fromStreamedName (sc2), not a second independent parser (ac4)

### 3.2 `vibeMapper.buildArgs`

```typescript
buildArgs(req: TurnRequest, outputDir?: string): string[]
```

**Parameters:**
- `req: TurnRequest` — The chat's turn request.
- `outputDir: string` _(optional)_ — This Story's new per-turn export directory, threaded to buildArgv's own required outputDir parameter.

**Returns:** `string[]` — argv for the direct-spawned vibe child process.

**Preconditions:**
- Called only after run() has allocated outputDir for a vibe turn

**Postconditions:**
- argv is built by calling the shared buildArgv(req, outputDir) -- buildArgv's REAL signature takes a required second outputDir argument, which round 3's contract wrongly omitted
- The prompt is never embedded in argv; it is written to the child's stdin separately by the spawn call site (ac5)

### 3.3 `buildArgv`

```typescript
function buildArgv(request: VibeTurnRequest, outputDir: string): readonly string[]
```

**Parameters:**
- `request: VibeTurnRequest` — sc1's shared turn-request shape.
- `outputDir: string` — A directory this Story's own code allocates (mkdtemp) and owns the lifecycle of; buildArgv embeds it as --output-dir.

**Returns:** `readonly string[]` — argv for the vibe binary, embedding --output-dir among the other flags.

**Preconditions:**
- Caller does not also call VibeExecutionAdapter.startTurn for the same request
- Caller owns outputDir's full lifecycle

**Postconditions:**
- The chat's direct-spawn argv and the backend provider's argv are constructed by the identical function (ac1)

### 3.4 `readExitEvidence`

```typescript
function readExitEvidence(exportPath: string, readFile: (path: string) => Promise<string>): Promise<VibeExitEvidence | undefined>
```

**Parameters:**
- `exportPath: string` — Path to the turn's export.json, inside this Story's own allocated outputDir.
- `readFile: (path: string) => Promise<string>` — Injected file read, matching the pattern the shared adapter already uses.

**Returns:** `Promise<VibeExitEvidence | undefined>` — The real stopReason/outcome/effectiveSelection Vibe itself reported, or undefined when missing/unreadable/malformed.

**Preconditions:**
- Currently private in src/shared/vibe-adapter.ts; this Story requires it exported, mirroring buildArgv's own export precedent

**Postconditions:**
- A clean exit with exitEvidence.stopReason === undefined is the ONLY case classified 'ok', replacing round 3's 'any row decoded' heuristic

### 3.5 `VibeMcpNaming.fromStreamedName`

```typescript
fromStreamedName(streamedName: string): VibeMcpToolIdentity | undefined
```

**Parameters:**
- `streamedName: string` — The MCP tool name exactly as the installed vibe binary streams it.

**Returns:** `VibeMcpToolIdentity | undefined` — The resolved {server, tool, streamedName}, or undefined if unrecognized.

**Preconditions:**
- Carried unchanged from round 3

**Postconditions:**
- mapLine delegates to this instead of parseVibeMcpTool's own independent parser

### 3.6 `sessionOutput.endTurn`

```typescript
endTurn(sessionId: string, turnId: string, exit: TurnExit): Promise<void>
```

**Parameters:**
- `sessionId: string` — The session whose turn is closing.
- `turnId: string` — The turn being closed.
- `exit: TurnExit` — The process exit info, now carrying two new optional vibe-specific fields.

**Returns:** `Promise<void>` — Appends the turn-end marker, now including the new optional fields when present.

**Preconditions:**
- Already called today at the existing cli-adapter.ts call site

**Postconditions:**
- A vibe turn's dispatchState/outcome are stamped onto the SAME durable turn-end marker claude/codex already rely on

### 3.7 `parseMarker`

```typescript
function parseMarker(line: string): Marker | undefined
```

**Parameters:**
- `line: string` — A line from the durable session file.

**Returns:** `Marker | undefined` — The decoded host-written marker, or undefined for an ordinary CLI line.

**Postconditions:**
- The turn-end case now also extracts code, signal, unknown, and (when present) vibeDispatchState/vibeOutcome -- today it discards every field but turnId

## 4. Data model changes

### 4.1 `vibeMapper (ProviderMapper, cli-adapter.ts) and run()'s vibe direct-spawn branch` — field-modify

Carried from round 3 (inputIsPrompt: false; buildArgs delegates to the shared builder; stdin write-and-end added) PLUS: run() allocates its own per-turn export directory (mkdtemp) before spawning a vibe child, threads it through buildArgs's new outputDir parameter, and tracks a local dispatchState mirroring vibe-adapter.ts's own model exactly.

**Call sites:**
- `vscode-plugin/src/chat/cli-adapter.ts:1021`
- `vscode-plugin/src/chat/cli-adapter.ts:1234-1245`
- `vscode-plugin/src/chat/cli-adapter.ts:1280-1324`
- `src/shared/vibe-adapter.ts:436-490`

### 4.2 `mapLine decoder (DecoderState row coverage)` — invariant-change

Carried unchanged from round 3: new top-level reasoning/effect decoding added, legacy worker-bridged branches kept.

**Call sites:**
- `vscode-plugin/src/chat/cli-adapter.ts:1037-1104`
- `src/shared/vibe-adapter.ts:260-300`

### 4.3 `parseVibeMcpTool` — invariant-change

Carried unchanged from round 3: replaced by a direct call to VibeMcpNaming.fromStreamedName.

**Call sites:**
- `vscode-plugin/src/chat/cli-adapter.ts:1003-1011`

### 4.4 `TurnExit (session-output.ts)` — field-add

Adds two new OPTIONAL fields: vibeDispatchState?: 'not-sent' | 'possibly-sent' | 'accepted' and vibeOutcome?: 'ok' | 'no-evidence' | 'replay-unsafe'. Backward-compatible: claude/codex never set them.

**Call sites:**
- `vscode-plugin/src/chat/session-output.ts:40-43`
- `vscode-plugin/src/chat/session-output.ts:183`
- `vscode-plugin/src/chat/session-output.ts:541-546`

### 4.5 `Marker's turn-end variant and parseMarker (session-output.ts)` — field-add

Adds code, signal, unknown and the two new vibe fields to BOTH the Marker type and parseMarker's extraction -- today parseMarker discards every field but turnId even though endTurn already writes code/signal to disk.

**Call sites:**
- `vscode-plugin/src/chat/session-output.ts:134-160`
- `vscode-plugin/src/chat/session-output.ts:510`

### 4.6 `Vibe direct-spawn terminal classification (replaces round 3's 'sawRow' heuristic)` — new

On a clean exit, reads export.json via readExitEvidence; vibeOutcome is 'ok' ONLY when stopReason is undefined, 'no-evidence' when export.json is missing/unreadable/malformed, and 'replay-unsafe' when a stopReason IS present or on signal/nonzero exit once dispatchState reached at least 'possibly-sent'. For a host-loss unknown:true marker on a vibe turn, outcome is always replay-unsafe.

**Call sites:**
- `vscode-plugin/src/chat/cli-adapter.ts:1045-1051`
- `vscode-plugin/src/chat/cli-adapter.ts:1264-1265`
- `vscode-plugin/src/chat/session-output.ts:510`

### 4.7 `Follower's missing-result path (cli-adapter.ts resume())` — invariant-change

For a vibe-mapped turn, reads the segment's turn-end marker's vibeOutcome/vibeDispatchState/unknown fields and surfaces replayUnsafe:true unless vibeOutcome==='ok'. claude/codex turns are unaffected.

**Call sites:**
- `vscode-plugin/src/chat/cli-adapter.ts:1684-1693`
- `vscode-plugin/src/chat/session-output.ts:602`

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | This Story mirrors sc1's own dispatchState model and its export-directory/exit-evidence pattern rather than calling VibeExecutionAdapter.startTurn a second time. readExitEvidence is additionally required to be exported from sc1's module for this Story's direct reuse, mirroring buildArgv's own existing export. |
| `sc2` | consumes | Unchanged from round 3: mapLine and the tool-activity decoding path call VibeMcpNaming.fromStreamedName directly. |

## 6. Error paths

**Error cases**

- **The stdin write/end call fails after the child process has already been spawned successfully (dispatchState already 'possibly-sent' or further).** (recoverable)
  - Detection: The stdin write/end error callback fires while dispatchState already holds 'possibly-sent' or 'accepted'.
  - Response: Classify as replay-unsafe, never as a deterministic pre-dispatch failure.
  - User impact: The user sees the turn marked unsafe-to-auto-retry rather than silently treated as safe-to-resend.
- **The spawn call itself fails before any child process is created.** (recoverable)
  - Detection: deps.spawn throws or its error event fires while dispatchState has never left 'not-sent'.
  - Response: Classify as a deterministic pre-dispatch failure, safe to replay automatically.
  - User impact: The user sees a clear launch failure and can safely resend the same turn.
- **The process exits cleanly (code 0, no signal) but export.json is missing, unreadable or malformed.** (recoverable)
  - Detection: readExitEvidence returns undefined after a clean exit.
  - Response: Classify vibeOutcome as 'no-evidence', not 'ok'.
  - User impact: The user sees the turn flagged as unverified rather than definitively successful.
- **The process exits cleanly (code 0) but export.json reports a stopReason.** (recoverable)
  - Detection: readExitEvidence returns a defined stopReason value.
  - Response: Classify vibeOutcome as 'replay-unsafe' even though the exit code was 0.
  - User impact: The user sees the turn marked unsafe-to-auto-retry despite a clean process exit.
- **The extension host exits before endTurn ever runs for a vibe turn; the next beginTurn synthesizes a conservative unknown:true turn-end marker.** (recoverable)
  - Detection: The follower decodes a turn-end marker with unknown:true and no vibeOutcome field for a vibe-mapped turn.
  - Response: Treat ANY unknown:true marker on a vibe turn as replay-unsafe unconditionally.
  - User impact: The user sees the turn reported as interrupted/unsafe on reopening.
- **This Story's own per-turn export directory cannot be created (mkdtemp fails).** (recoverable)
  - Detection: The mkdtemp call itself throws before spawn is ever attempted.
  - Response: Classify as a deterministic pre-dispatch failure; surface a clear, actionable error.
  - User impact: The user sees a clear 'could not prepare the turn' failure and can safely retry.
- **The per-turn export directory cannot be removed during cleanup.** (recoverable)
  - Detection: The best-effort rm call in the cleanup path throws or rejects.
  - Response: Log and continue; a cleanup failure never masks the turn's own already-determined real outcome.
  - User impact: No user-visible impact beyond a possible stray temp directory.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A turn reaches dispatchState 'accepted' but the user cancels it before further content streams. | The user-initiated cancellation keeps its own recognizable identity and is not misreported as replay-unsafe. |
| A resumed turn (VibeResumedSession) that produces its own export.json. | Each turn, including a resumed one, gets a fresh, independently allocated outputDir. |
| Two near-simultaneous vibe turns across different sessions, each allocating its own export directory. | mkdtemp's own uniqueness guarantee prevents any collision between the two turns' export.json files. |
| A claude or codex turn hits the follower's existing missing-result path. | Unaffected: the new marker fields are read only when mapper.id==='vibe'. |

**Invariants to preserve**

- Dispatch is already 'possibly-sent' the instant spawn succeeds, before any stdin write is attempted; a stdin write/end failure never reverts dispatchState back to 'not-sent'. [[c1]]
- The durable turn-end marker is the ONE finalization record both the live writer and any follower consult. [[c2]]
- A host-loss (unknown:true) turn-end marker for a vibe turn is always treated as replay-unsafe on read, never inferred as a success. [[c3]]
- A clean process exit is not itself completion evidence; only exitEvidence.stopReason === undefined marks a vibe turn 'ok'. [[c4]]
- The migration's removal of the old --agent approval route is gated on the live approval-parity check's outcome. [[c5]]

## 7. Test strategy

**Test framework:** `vitest`

**Test levels**

- **unit** — Exercise the mirrored dispatchState tracker, the export-evidence classification, the extended marker decode, and the follower's new branch in isolation.
  - Subjects: `dispatchState transitions: 'not-sent' before spawn, 'possibly-sent' immediately after spawn succeeds, 'accepted' once a session-identity row is decoded; a subsequent stdin write/end failure does not revert it`, `readExitEvidence-driven outcome classification: stopReason undefined -> 'ok'; stopReason present -> 'replay-unsafe'; export.json missing/malformed -> 'no-evidence'`, `parseMarker's turn-end case extracting code, signal, unknown, vibeDispatchState and vibeOutcome`, `endTurn constructing the turn-end marker with the new fields present for vibe and absent for claude/codex`, `The follower's missing-result branch for mapper.id==='vibe'`, `vibeMapper.buildArgs threading outputDir through to buildArgv`
  - Fixtures: `Sample export.json payloads`, `Sample turn-end marker lines with and without the new optional fields`
- **integration** — Exercise the real plugin spawn seam, the export-directory lifecycle, and the live-writer/follower marker hand-off end to end.
  - Subjects: `A fixture binary exiting cleanly with no stopReason -> vibeOutcome 'ok', read identically live and on reattach`, `A fixture binary exiting cleanly with a stopReason -> vibeOutcome 'replay-unsafe' despite exit code 0`, `A stdin write/end failure AFTER spawn succeeds -> 'replay-unsafe'`, `A spawn failure before any child exists -> deterministic pre-dispatch-safe`, `Detach/reattach producing identical classification`, `Host-loss simulation read as replayUnsafe`, `Export-directory lifecycle across success/signal/spawn-failure/abort paths`, `Prompt transport (carried from round 3)`
- **live** — Verify export.json's real field shape and the approval-parity rollout rule against the installed vibe binary.
  - Subjects: `export.json's real field names match readExitEvidence's expectations`, `Tool-activity naming parity (carried from round 3)`, `Approval-flag effective-equivalence comparison, gating the migration's cutover`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: vibeMapper.buildArgs delegates to buildArgv with outputDir`, `integration: single direct-spawn seam with its own export-directory lifecycle` |
| `ac2` | `unit: mapLine decoding native reasoning/effect rows`, `integration: streaming transcript rendering parity fixture` |
| `ac3` | `integration: live writer and follower produce identical classification on reattach`, `integration: host-loss simulation classified correctly`, `live: resumed session preserves model/thinking selection` |
| `ac4` | `unit: parseVibeMcpTool delegates to VibeMcpNaming.fromStreamedName`, `live: tool-activity naming parity` |
| `ac5` | `integration: prompt write-and-end sequencing`, `live: the real installed vibe binary receives the complete prompt, outcome recorded on the ledger per k7` |

## 8. Migration

**State before:** Per s1 bundles 1-5: the direct-spawn vibe branch would compute terminal/replay classification from a local 'sawRow' heuristic and treat a stdin write failure as pre-dispatch-safe -- both wrong against the shared adapter's own dispatchState model (bundle 1). The durable record a follower reads is session-output.ts's turn-end marker (bundle 2), which today carries only {turnId} after parseMarker's extraction even though code/signal are written; run()'s live classification is never persisted, so a follower hitting EOF without a terminal row gets a flat, unclassified error. Session-output.ts already synthesizes a conservative unknown:true marker for host loss (bundle 3) but nothing reads it for replay safety. buildArgv requires an outputDir argument (bundle 4) nothing allocates, and readExitEvidence is unexported. The live approval-parity verification has no stated consequence on a mismatch (bundle 5).

**State after:** The vibe direct-spawn branch mirrors the shared adapter's dispatchState model exactly, allocates and owns its own per-turn export directory, and computes a vibeOutcome from the REAL stopReason/outcome Vibe reports. That outcome and dispatchState are stamped onto the SAME durable turn-end marker every reader consults (TurnExit/Marker/parseMarker widened with backward-compatible optional fields); a host-loss unknown:true marker is always read as replay-unsafe for a vibe turn. The migration's removal of the old --agent approval route is explicitly gated on the live approval-parity check's result.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Export buildArgv from src/shared/vibe-adapter.ts (carried from round 3) -- its real signature is buildArgv(request, outputDir). — ↩ rollbackable
2. Export readExitEvidence from src/shared/vibe-adapter.ts, mirroring buildArgv's own export precedent. — ↩ rollbackable
3. Add new top-level reasoning/effect row branches to mapLine and replace parseVibeMcpTool's body with a call to VibeMcpNaming.fromStreamedName (carried from round 3). — ↩ rollbackable
4. Change vibeMapper.buildArgs to accept an optional outputDir parameter and delegate to buildArgv(req, outputDir); set inputIsPrompt to false. — ↩ rollbackable
5. In run()'s vibe direct-spawn branch, allocate a fresh per-turn export directory before spawn and track a local dispatchState mirroring vibe-adapter.ts's model. — ↩ rollbackable
6. Extend the stdin-write gate to cover mapper.id==='vibe' (carried from round 3); classify a write/end failure using whatever dispatchState already holds. — ↩ rollbackable
7. On exit, read export.json via readExitEvidence and classify vibeOutcome; remove the export directory in a finally on every exit path. — ↩ rollbackable
8. Widen TurnExit, Marker's turn-end variant, parseMarker and endTurn's marker construction with the two new optional vibe fields and the previously-discarded code/signal/unknown fields. — ↩ rollbackable
9. Pass the computed vibeDispatchState/vibeOutcome through to the existing sessionOutput.endTurn call site for a vibe turn. — ↩ rollbackable
10. Extend the follower's EOF-without-terminal path to read the new marker fields for mapper.id==='vibe' and surface replayUnsafe accordingly. — ↩ rollbackable
11. Delete the vibeCatalog branch and vibe-session-worker.ts/vibe-session-process.ts's runVibeChatJob/historyLines (carried from round 3); update esbuild.mjs and packaging.test.ts. — ↩ rollbackable
12. GATED: live-verify approval-flag effective equivalence; this outcome is a prerequisite for finalizing step 11's --agent-route removal -- proceed with --approval-policy only if parity holds, else keep --agent or record an explicit accepted deviation on the ledger before cutover. Also live-verify export.json's real field shape. — ↩ rollbackable

**Backward compat:** mapLine keeps every pre-existing branch, so a session file written before this Story's build decodes exactly as before. TurnExit, Marker's turn-end variant and parseMarker gain only OPTIONAL fields claude/codex never populate or consult. No on-disk session file is rewritten. The approval-parity gate explicitly protects against a silent behavior change before the old route is removed.

## 9. Alternatives considered

### 9.1 a1: Mirror dispatchState + own export-directory lifecycle, and widen the existing generic turn-end marker with two optional vibe-outcome fields — **CHOSEN**

One finalization protocol: the live writer computes dispatchState/outcome using its own mirrored tracker and export directory, then stamps it onto the SAME durable turn-end marker both live and follow readers already consume.

The direct-spawn vibe branch tracks its own dispatchState ('not-sent' -> 'possibly-sent' immediately after spawn succeeds, before the stdin write -> 'accepted' once a session-identity row is decoded), mirroring vibe-adapter.ts's own model exactly. It allocates its own per-turn export directory (mkdtemp) before spawn, passes it to buildArgv's outputDir parameter, and on a clean exit reads export.json for the real stopReason/outcome -- never inferring completion from merely having decoded a row. The computed outcome ('ok' | 'no-evidence' | 'replay-unsafe') and the final dispatchState are passed through the existing sessionOutput.endTurn(sessionId, turnId, exit) call site, which stamps them as two new OPTIONAL fields on the turn-end marker it already appends (session-output.ts's Marker union and parseMarker already tolerate extra fields on a recognized marker kind). The follower's existing EOF-without-terminal-row path reads these same fields off the segment's turn-end marker instead of returning a flat, unclassified error; the host-loss synthesized unknown:true marker is treated, for a vibe turn, as always replay-unsafe.

### 9.2 a2: Keep session-output.ts's marker untouched; have the vibe branch write its own second host-authored outcome line that mapLine alone decodes

Stay strictly inside this Story's own files: write a vibe-specific durable line (decoded only by mapLine, not session-output.ts's generic marker parser) carrying the same dispatchState/outcome, landing in the segment like any other CLI-written row.

Same dispatchState mirroring and export-directory lifecycle as a1 for computing the real outcome, but instead of extending the generic turn-end marker, the vibe branch appends its own line into the turn's output stream (via the same output.outPath the process's own stdout already writes to, or a comparable write the plugin already owns) using a distinct marker shape mapLine recognizes as a terminal TurnEvent, exactly as it would decode any other vibe journal row. The follower decodes it the same way it decodes any other line -- no change to session-output.ts, parseMarker, or endTurn's signature.

**Rejected because:** Functionally equivalent to a1 but introduces a second durable host-written line convention alongside session-output.ts's own marker mechanism, duplicating durability/ordering guarantees a1 reuses for free.

### 9.3 a3: Fix live dispatch/completion accuracy only; make the follower's missing-result path unconditionally replay-unsafe for any vibe turn with no decoded terminal

Smallest change: mirror dispatchState and read real export.json evidence for live accuracy, but for durability just hard-code 'no terminal row for a vibe turn always means unsafe' in the follower, with no new marker fields at all.

Same dispatchState/export-directory fixes as a1/a2 for the live path. For the follower, add one conditional keyed only on mapper.id==='vibe' to its existing EOF-without-terminal branch: always report replayUnsafe:true, with no new persisted field and no change to session-output.ts.

**Rejected because:** Fails ac2/ac3's 'exactly as before' requirement for the ordinary case: a cleanly-completed turn observed only via reattach would be unconditionally reported unsafe, and records no durable outcome for the ledger.

### 9.4 a4: Propose an HLD amendment: have sc1 itself export dispatch-tracking and export-directory helpers for direct reuse, instead of this Story reimplementing them

Ask the HLD to widen sc1's module surface (not just buildArgv) so the plugin reuses the adapter's own dispatchState tracker and export-directory lifecycle directly, rather than mirroring their logic a second time.

File an hld.amendmentProposal (sharedContract.methodAdd) asking sc1's owning Story (s1) to export its internal dispatchState tracker and export-directory helpers as first-class, reusable primitives, which this Story would then import rather than reimplement.

**Rejected because:** Depends on an HLD amendment widening sc1's deliberately-internal surface, outside this Story's own approval scope, and still would not solve the durable-finalization gap by itself.

## 10. References

- **[[c1]]** `code` `src/shared/vibe-adapter.ts:436-490`
- **[[c2]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1636-1693`
- **[[c3]]** `code` `vscode-plugin/src/chat/session-output.ts:500-550`
- **[[c4]]** `code` `src/shared/vibe-adapter.ts:365-375`
- **[[c5]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1029-1034`

## 11. Open questions

- testFramework='vitest' is carried from round 3's inference (repo convention), not re-verified by an explicit convention.detect bundle this round.
- Epic constraints (k1-k7) were scored transitively through the Story's acceptance criteria and shared contracts rather than as separate constraintScore rows per alternative.
- Widening session-output.ts's TurnExit/Marker/parseMarker touches generic chat infrastructure that no HLD sharedContract or adjacentBoundary explicitly owns -- flagged for reviewer confirmation that this is acceptable scope for this Story rather than requiring a separate story or HLD back-flow.
- The approval-flag effective-equivalence live verification is still unperformed; it now explicitly gates the migration's cutover (step 12) rather than being an open-ended check with no stated consequence.

## Resolved questions

- `q3377461d` — testFramework='vitest' is carried from round 3's inference (repo convention), not re-verified by an explicit convention.detect bundle this round.
  - **resolved**: Verify before planning — Ran an explicit convention-detect check: grep across the repo found 1643 backend files and 144 vscode-plugin files importing from 'node:test', zero importing from 'vitest', no vitest.config.* anywhere, and both package.json test scripts (`node scripts/test-harness/run.mjs`, plugin's `--suite=vscode` variant) drive node:test's own harness. testFramework is 'node:test', not 'vitest' -- round 3's carried inference was wrong. _(2026-11-28T05:16:58.948Z)_

## Citations

- **[[c1]]** `code` `src/shared/vibe-adapter.ts:436-490`
- **[[c2]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1636-1693`
- **[[c3]]** `code` `vscode-plugin/src/chat/session-output.ts:500-550`
- **[[c4]]** `code` `src/shared/vibe-adapter.ts:365-375`
- **[[c5]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1029-1034`
