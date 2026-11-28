<!-- insrc:artifact LLD-639cd2159a87aedb-s4 -->

# LLD: STORY-639cd2159a87aedb-s4 — Vibe configuration files are read with a real TOML parse and edited surgically

## Summary

**Epic:** `unify-vibe-one-plain-cli-adapter`
**HLD base run:** `wf-1795535373279-l4wumn`
**HLD effective hash:** `67d59677de6a...`
**Tracker:** [insors-ai/insrc#319](https://github.com/insors-ai/insrc/issues/319)

This revision replaces the mtime-age-based lock reclaim with a PID-liveness check (a dead process can be proven dead; a merely slow one cannot be mistaken for dead), so a lock is only ever reclaimed from a holder that genuinely no longer exists, and a holder never deletes a successor's lock on release. It also closes the one write path the lock never reached: the daemon's own registration now holds the same lock around its external `vibe mcp add` call. The field-merge rule is restated correctly as three explicit cases, and the remaining filesystem-contract gaps (the residual check-to-rename window, injecting the new IO into the existing writer, and first-time parent-directory creation) are now specified.

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

s1's BUILD changed the shared Vibe execution adapter and the backend/plugin chat dispatch surfaces, none of which touch Vibe TOML config-file parsing, locking, or the external `vibe mcp add` registration path. s4's own boundary (depends: []) and sc4 (consumedByStories: []) remain confirmed independent of s1's changes; this round's 4 fixes (PID-liveness-based lock reclaim, routing the daemon's primary registration path through the same lock, corrected field retain/set/clear semantics, and the residual-window/adapter-injection/parent-directory documentation) are all internal to s4's own module and call sites.

**Sources:**
- .insrc/artifacts/BUILD-639cd2159a87aedb-s1.json

## 2. HLD context

> See **HLD-639cd2159a87aedb** § 2. Framework summary

**Rollout phase:** Phase A — Shared foundations
**Owns:** `sc4` (Real-TOML Vibe config reader)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Everything behind the adapter interface: argv construction from the qualified 3.1.4 flag surface (headless mode selection, model and thinking pinning for NEW sessions, prompt transport through the programmatic input contract, budget-guard forwarding, the ordinary approval mapping — undefined/default→CLI defaults, manual→ask, edit-auto→accept-edits, auto→auto-approve, with the read-only request REJECTING any approval setting — exit-evidence parsing including the session's effective selection), the adapter-construction execution context with the DUAL process-group policy and per-turn cancellation (adapter-owned mode: the adapter leads a detached group and owns termination, escalation, descendant-exit confirmation and group cleanup on every exit path; supervisor-owned mode: the child inherits the caller's group, the supervisor owns escalation and sweeping, the adapter retains turn-scoped temporary-file cleanup only), transient-error classification and the bounded retry semantics shared with the claude/codex clients, the local schema-validation loop for structured-output requests, the tool-result output normalization (outputText/output, else error message, else reason — the existing chat precedence), the type-level resumed-session selection rule, and the deletion of src/shared/vibe-session.ts plus the rewiring of the backend provider paths (complete, completeStructured, runReadOnlySession's launch mechanics) and structured-output.ts onto the adapter. The read-only launch MODE exists from s1 but every 'read-only' request REFUSES before dispatch until the adapter's own qualification succeeds (s2) — the refusal reason is surfaced to the caller. — owns `sc1`, `sc2`
- `s2`: The narrow-authorization design itself: the live qualification suite against the real installed binary (custom policy/agent exploration, allowed-tool execution proof, blocked-tool proof, blanket-bypass absence proof, write-refusal check, AND the invalidation behavior — a changed binary version or effective policy returns the mode to refusing until re-qualified), the adapter-owned ReadOnlyCapability wiring (the adapter validates and exposes; callers never construct), the unavailable-state reporting when qualification fails, and the adapter's read-only mode enablement. The custom-agent/policy TOML a qualified design may need is authored with the same smol-toml dependency directly — it is not the Vibe-config reader (sc4). — owns `sc3`
- `s3`: The chat surface migration: the vibe mapper and job runner become consumers of the adapter (argv and VIBE_ACTIVE_MODEL pinning deleted from the plugin; the worker's signal threads into the adapter's per-turn cancellation; the worker keeps its supervisor-owned process group and its forced-stop sweep), while the transcript rendering, streaming event mapping over the RICH events (tool-call identity and arguments for command correlation, tool-result OUTPUT content, session identity and resume-handle delivery), worker lifecycle, resume handles and attachments keep their existing behavior (lc2). Also internal: the live verifications whose outcomes s6 records — the approval parity cases (undefined/default, manual, edit-auto, auto map to the same tool policies the private launch path used today), the tool-result output parity fixture (actual output text, not only correlation and success/failure), the worker forced-termination and descendant-cleanup parity check under the supervisor-owned group, the prompt-transport check (multiline, option-like text), the resume round-trip including that a resumed turn preserves the session's model/thinking and that the tool rejects a selection change on a resumed session before dispatch, and the general-naming check that chat tool-activity rendering and insrc_present declarations parse through sc2's general identity.
- `s5`: The model-family alignment: catalog, registry, check and definitions entries for cli-vibe rebuilt to exactly the models and thinking levels the adapter honors (verified against the installed tool's catalog), the selection-delivery semantics through the adapter — new sessions take the selection, resumed sessions inherit and report — and the fail-before-dispatch error naming supported choices. No other story consumes these records; settings and tier resolution do.
- `s6`: The reconciliation work itself: verifying the chat prompt-transport fix, the approval parity cases, the tool-result output parity, the resume-selection behavior and the worker cleanup parity live with s3's evidence, checking catalog coverage, closing the implemented issues (read-only authorization via sc3's qualification evidence incl. its provenAgainst record, TOML parsing via sc4's story validation), stamping the review-dependent deferrals with their recorded dependency on the review rewrite, and attaching evidence to every closure.

## 3. Contract details

**Surface level:** internal-shared

### 3.1 `acquireVibeConfigLock`

```typescript
function acquireVibeConfigLock(path: string, fs: VibeConfigFs): VibeConfigLockHandle | { readonly refused: true; readonly reason: string }
```

**Parameters:**
- `path: string` — The config.toml path to lock.
- `fs: VibeConfigFs` — The same injected IO upsertServer/removeServer use.

**Returns:** `VibeConfigLockHandle | { readonly refused: true; readonly reason: string }` — A handle carrying release() on success, or a busy/refused result when the lock cannot be acquired.

**Preconditions:**
- The lock file's parent directory is created first (mkdir recursive) if absent, mirroring HostFileSystem.write's own existing behavior

**Postconditions:**
- Writes {pid: process.pid, token: <random>, acquiredAt} as the lock file's content via exclusive create; on EEXIST, reads the existing lock and attempts reclaim ONLY when process.kill(recordedPid, 0) throws ESRCH (confirmed dead this round) -- age is used only as a cheap pre-filter for whether a liveness check is worth making, never as the abandonment proof itself
- A reclaim unlinks the dead holder's lock and immediately attempts its own exclusive create; if that create itself fails (another reclaimer won), refuses as busy rather than retrying a steal within the same attempt
- release() re-reads the lock file and verifies it still carries this handle's own token before unlinking; a mismatch (a successor has since reclaimed it) means release() does NOT unlink, so a holder never deletes a successor's lock

### 3.2 `VibeConfigAccess.upsertServer`

```typescript
upsertServer(entry: VibeConfigEntry): VibeConfigEditOutcome
```

**Parameters:**
- `entry: VibeConfigEntry` — The fields to apply to the named entry. For each of command/args: the key omitted from the object retains the existing value; the key present with a defined value SETS the field to that value; the key present but explicitly set to undefined CLEARS it. Any property on the object outside name/command/args is read by nothing and never errors.

**Returns:** `VibeConfigEditOutcome` — 'unchanged' when the existing entry already matches the intended state under this rule; 'written' after a verified, atomically-committed real change; 'refused' otherwise.

**Postconditions:**
- Uses acquireVibeConfigLock/release internally for its own held-lock window (unchanged in kind from round 3, now correctly specified via the shared primitive)
- Immediately before the atomic rename, lstats and re-reads the destination; this closes the gap up to that check, but the interval between the check itself and the rename syscall is an accepted, bounded residual window this Story cannot close without a locking dependency barred by lc3 -- documented, not eliminated. The comparison's guarantee is content-only: an external replacement that happens to produce byte-identical content under a different inode is accepted as unchanged; mode/identity across such a replacement is out of scope.

### 3.3 `VibeConfigAccess.removeServer`

```typescript
removeServer(name: string): VibeConfigEditOutcome
```

**Parameters:**
- `name: string` — The server name to remove.

**Returns:** `VibeConfigEditOutcome` — 'absent' | 'written' | 'refused', as round 3, now backed by the hardened PID-liveness lock.

**Postconditions:**
- Same lock, residual-window and content-only guarantees as upsertServer

### 3.4 `registerOne`

```typescript
async function registerOne(p: ClientPlan, mcpJs: string, run: (bin: string, args: readonly string[]) => Promise<CliRun>, entrypointExists: (mcpJs: string) => boolean, vibeConfigText: () => string | undefined, repoPath?: string, deps?: McpRegisterDeps): Promise<McpClientOutcome>
```

**Parameters:**
- `p: ClientPlan` — The client's registration plan (unchanged).
- `mcpJs: string` — The insrc MCP entrypoint path (unchanged).
- `run: (bin, args) => Promise<CliRun>` — Non-throwing CLI runner (unchanged).
- `entrypointExists: (mcpJs: string) => boolean` — Unchanged.
- `vibeConfigText: () => string | undefined` — Unchanged.
- `repoPath: string` _(optional)_ — Unchanged.
- `deps: McpRegisterDeps` _(optional)_ — Unchanged.

**Returns:** `Promise<McpClientOutcome>` — The per-client registration outcome, unchanged in shape.

**Postconditions:**
- For the vibe branch, the existing precheck (vibeConfigText + vibeConfigHasServer, lines ~517-521) and the external `vibe mcp add` subprocess call (line ~525) are now both performed while holding acquireVibeConfigLock(defaultVibeConfigPath(), fs) -- serializing this primary registration write against the plugin's own upsertServer/removeServer calls, even though the bytes are written by the external subprocess, not this Story's own code
- vibeConfigHasServer throwing VibeConfigParseError is already caught by registerOne's existing outer try/catch and reported as action:'failed' with the parse-error message, distinct from a genuinely absent config (text===undefined, which proceeds to add) -- carried from round 2/3's own design, now explicitly documented as the mechanism that satisfies the 'distinguish missing from unreadable before the add path' requirement

### 3.5 `defaultVibeConfigPath`

```typescript
function defaultVibeConfigPath(): string
```

**Returns:** `string` — join(VIBE_HOME ?? ~/.vibe, 'config.toml') -- the same path defaultVibeConfigText/defaultVibeHome already compute inline, now exposed as a reusable function.

**Postconditions:**
- registerOne, removeVibeProjectServer and acquireVibeConfigLock all resolve the SAME path through this one function, so there is exactly one place the path is computed

### 3.6 `createTomlMcpConfigWriter`

```typescript
function createTomlMcpConfigWriter(fs: HostFileSystem, vibeFs?: VibeConfigFs): McpConfigWriter
```

**Parameters:**
- `fs: HostFileSystem` — Injected host file access for the writer's OWN existing sc5 contract surface (unchanged).
- `vibeFs: VibeConfigFs` _(optional)_ — The IO this Story's own write path (createVibeConfigAccess) actually needs; defaults to the production node:fs-backed plugin adapter when omitted, giving callers and test fixtures an explicit injection point that round 3 never provided.

**Returns:** `McpConfigWriter` — { writeInsrcServer, removeInsrcServer }.

**Postconditions:**
- Thin callers of createVibeConfigAccess(path, vibeFs ?? defaultPluginVibeConfigFs).upsertServer/removeServer, as round 3, now with vibeFs's source made explicit and injectable

## 4. Data model changes

### 4.1 `VibeConfigAccess's lock protocol (createVibeConfigAccess / acquireVibeConfigLock)` — invariant-change

Replaces round 3's mtime-age staleness test with a PID+token lock: the lock file's content carries {pid, token, acquiredAt}; reclaim is attempted only when process.kill(recordedPid, 0) throws ESRCH (live-tested this round, no new dependency), with age used only as a cheap pre-filter; release re-reads and verifies its own token before unlinking, so a holder never deletes a successor's lock; a reclaimer that loses the post-unlink exclusive-create race refuses as busy rather than retrying a steal. The acquire/release pair is exposed as its own primitive (acquireVibeConfigLock), not bundled only inside upsertServer/removeServer, so registerOne can hold the same lock.

**Call sites:**
- `src/daemon/mcp-register.ts:259-324`
- `src/daemon/mcp-register.ts:466-538`
- `src/daemon/mcp-register.ts:110-119`
- `vscode-plugin/src/hosts/toml-mcp-writer.ts`

### 4.2 `registerOne (mcp-register.ts:466-538)` — invariant-change

The vibe branch's existing precheck and external `vibe mcp add` call are now performed while holding acquireVibeConfigLock(defaultVibeConfigPath(), fs), closing the previously-unlocked third-writer gap; the existing try/catch's parse-error/absent distinction is unchanged and is now the documented mechanism satisfying that part of the finding.

**Call sites:**
- `src/daemon/mcp-register.ts:466-538`
- `src/daemon/mcp-register.ts:375-377`

### 4.3 `defaultVibeConfigPath (new, mcp-register.ts)` — new

Exposes the path defaultVibeConfigText/defaultVibeHome already compute inline, so registerOne, removeVibeProjectServer and the lock primitive agree on one path.

**Call sites:**
- `src/daemon/mcp-register.ts:110-119`

### 4.4 `VibeConfigAccess.upsertServer's field-merge rule` — invariant-change

Corrected from round 3's backwards wording ('a present key, including explicit undefined, clears the field') to three explicit cases: key omitted retains; key present with a defined value sets it; key present but explicitly undefined clears it. Any incoming property outside name/command/args is simply never read.

**Call sites:**
- `vscode-plugin/src/hosts/toml-mcp-writer.ts`

### 4.5 `createTomlMcpConfigWriter (toml-mcp-writer.ts)` — field-add

Gains an optional second parameter vibeFs?: VibeConfigFs (defaulting to the production plugin adapter) so the IO its own internal createVibeConfigAccess call needs has an explicit, injectable source; also now documents that its lock-file creation ensures the parent directory exists first, mirroring HostFileSystem.write's own mkdir-then-write behavior for a genuinely first-ever registration.

**Call sites:**
- `vscode-plugin/src/hosts/toml-mcp-writer.ts`

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | Implements VibeConfigEntry/VibeConfigEditOutcome/VibeConfigAccess, including the additive 'unchanged' outcome already proposed, with the field-merge rule now stated correctly (set/clear/retain, not 'present means clear') and the lock protocol hardened to PID-liveness. No further contract-shape change is proposed this round; acquireVibeConfigLock and defaultVibeConfigPath are implementation primitives, not new sc4 members. |

## 6. Error paths

**Error cases**

- **A lock holder is paused (GC pause, slow disk, suspended laptop) but still alive, past any age threshold a reclaimer might otherwise use.** (recoverable)
  - Detection: process.kill(recordedPid, 0) succeeds (no ESRCH) when a reclaimer checks liveness.
  - Response: Refuse as busy; no reclaim is attempted regardless of the lock's age.
  - User impact: A merely slow operation is never preempted by a second writer believing it was abandoned.
- **A lock holder has genuinely crashed without releasing its lock.** (recoverable)
  - Detection: process.kill(recordedPid, 0) throws ESRCH.
  - Response: Reclaim: unlink the dead holder's lock, then immediately attempt an exclusive create of a new lock under this reclaimer's own pid+token.
  - User impact: A crashed prior operation does not permanently block future registrations.
- **Two reclaimers both confirm the same dead pid and both attempt to unlink+recreate the lock.** (recoverable)
  - Detection: The exclusive-create immediately after unlink fails for whichever reclaimer loses the race.
  - Response: Refuse as busy rather than retrying a steal within the same attempt; the caller may retry the whole acquisition fresh.
  - User impact: Two reclaimers never both believe they hold the lock simultaneously.
- **A holder's release() re-reads the lock file and finds its token no longer matches what it wrote at acquisition.** (recoverable)
  - Detection: The content comparison on release.
  - Response: Do NOT unlink; a mismatch means a successor has since reclaimed what this holder no longer owns, so release() is a safe no-op instead of deleting the successor's lock.
  - User impact: A slow holder's eventual release never deletes a second writer's lock out from under it.
- **registerOne's vibe branch cannot acquire the lock (another writer holds it) before its precheck and the external `vibe mcp add` call.** (recoverable)
  - Detection: acquireVibeConfigLock returns a refused/busy result.
  - Response: Report action:'failed' with a busy reason rather than proceeding to precheck or add against a file another writer may be mid-edit on.
  - User impact: The user sees a clear 'try again' registration failure instead of a race with the plugin's own writer.
- **The external `vibe mcp add` subprocess itself fails or exits nonzero while registerOne holds the lock.** (recoverable)
  - Detection: run()'s existing spawnError/exit-code handling (unchanged).
  - Response: The lock is released in a finally regardless of the subprocess outcome; the existing failure reporting (action:'failed') is unchanged.
  - User impact: A failed external add never leaves the lock held, blocking every subsequent writer.
- **A caller's incoming VibeConfigEntry has command as an own property explicitly set to undefined.** (recoverable)
  - Detection: The own-property presence check distinguishes this from an entirely absent key.
  - Response: Clear the existing command value, per the corrected three-case rule.
  - User impact: A deliberate clear request is honored, distinct from omission (which retains).
- **The lock file's parent directory does not exist yet (a genuinely first-ever registration, e.g. $VIBE_HOME has never been created).** (recoverable)
  - Detection: The initial exclusive-create attempt would otherwise fail ENOENT.
  - Response: Create the parent directory (mkdir recursive) before attempting the exclusive create, mirroring HostFileSystem.write's own existing parent-creation behavior.
  - User impact: A user's very first registration succeeds without a confusing 'directory not found' failure.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| registerOne's lock-wrapped precheck+add and the plugin's own upsertServer both attempt to acquire the lock for the same path at nearly the same time. | Whichever acquires first proceeds to completion and releases; the other either waits within its own bounded retry or refuses busy and the caller retries -- no lost update regardless of which writer the bytes ultimately come from (this Story's own code or the external `vibe mcp add` subprocess). |
| A lock file's recorded pid happens, by OS pid reuse, to match a DIFFERENT, currently-running process unrelated to the original holder. | The liveness check reports 'alive' (a correct, if coincidental, false positive on reuse), so reclaim is conservatively withheld -- consistent with 'a conservative busy refusal is an option when ownership cannot be proven'. |
| defaultVibeConfigPath() is called independently from registerOne, removeVibeProjectServer and acquireVibeConfigLock. | All three resolve to the byte-identical path string, since each calls the same one function rather than recomputing it inline. |
| upsertServer called with command/args both omitted from the incoming VibeConfigEntry, on an entry that already has both set. | Both existing values are retained unchanged; omission never implies clearing. |

**Invariants to preserve**

- registerOne's existing outer try/catch already distinguishes a config-parse failure (caught, reported as action:'failed') from a genuinely absent config (text===undefined, proceeds to add) -- this distinction predates this round and is preserved, not reimplemented. [[c1]]
- A lock is never reclaimed on the basis of age alone; abandonment is proven only by a dead-pid liveness check. [[c2]]
- Every writer against the same config path resolves that path through one shared function, never recomputing it independently. [[c3]]

## 7. Test strategy

**Test framework:** `vitest`

**Test levels**

- **unit** — Exercise the PID-liveness lock protocol, the field retain/set/clear rule, registerOne's lock-wrapped external add, and the parent-directory/injection fixes in isolation.
  - Subjects: `A paused-but-alive holder (live pid) is never reclaimed regardless of lock age`, `A genuinely dead holder (process.kill throws ESRCH) is reclaimed via unlink-then-exclusive-create`, `Two simulated reclaimers racing the post-unlink exclusive-create: the loser refuses busy, never retries a steal in the same attempt`, `release() refusing to unlink when the lock's token no longer matches what was written at acquisition`, `registerOne's vibe branch acquiring the lock before its precheck and the external add call, and releasing it in a finally regardless of the subprocess outcome`, `registerOne reporting busy/failed when the lock cannot be acquired, without attempting the precheck or the external add`, `command/args retain (key absent) vs set (key present, defined) vs clear (key present, explicit undefined) as three distinct, correctly-ordered cases`, `defaultVibeConfigPath() returning the same string from every call site`, `Lock-file creation creating its parent directory first when absent`, `createTomlMcpConfigWriter accepting an injected VibeConfigFs fixture distinct from its HostFileSystem parameter`
  - Fixtures: `A fake process.kill seam returning ESRCH for a chosen pid and succeeding for another`, `A fake VibeConfigFs exposing controllable exclusive-create race outcomes`, `A fresh, non-existent $VIBE_HOME-equivalent directory to exercise first-registration parent creation`
- **integration** — Exercise registerOne's lock-wrapped registration against a real temp-file config and a real (or faithfully simulated) external add, alongside the plugin's writer racing it.
  - Subjects: `registerOne's full vibe branch against a real temp-file config.toml, confirming the lock is held across the precheck and the simulated external add, then released`, `A real-file race between registerOne's lock-wrapped registration and the plugin's own upsertServer against the same path, confirming no lost update`, `createTomlMcpConfigWriter with its default production VibeConfigFs against a real temp-file config on a freshly-created parent directory`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: declaresServer/entries answering correctly against configs with quoted table names, inline tables, multiline strings and comments (carried from prior rounds)` |
| `ac2` | `unit: command/args retain/set/clear as three distinct cases, never clearing a caller-supplied value`, `integration: unrelated content preserved across the full lock/verification/commit protocol (carried from round 3)` |
| `ac3` | `unit: a paused-but-alive holder is never reclaimed; a genuinely dead holder is reclaimed via liveness, not age`, `unit: two racing reclaimers never both believe they hold the lock; release() never deletes a successor's lock`, `unit: registerOne refuses/fails cleanly when the lock is busy, without attempting the precheck or external add`, `integration: a real race between registerOne's lock-wrapped registration and the plugin's writer, confirming no lost update` |
| `ac4` | `unit: registerOne, removeVibeProjectServer and createTomlMcpConfigWriter all resolve the same path via defaultVibeConfigPath with no independent recomputation`, `integration: registerOne's vibe branch exercised end to end with no remaining unlocked write path` |

## 8. Migration

**State before:** Per s1's bundles: registerOne's vibe branch (bundle 1) precheck-reads config.toml then shells out to an external `vibe mcp add` subprocess as a THIRD writer round 3's lock never reached. process.kill(pid,0) (bundle 2, live-tested) is confirmed to distinguish a dead pid (ESRCH) from a live one with no new dependency. The config path (bundle 3) is computed inline in three places with no shared, reusable path function.

**State after:** The lock protocol is keyed on PID-liveness (process.kill(recordedPid,0) throwing ESRCH), not age; release re-verifies its own token before unlinking so a holder never deletes a successor's lock; a reclaim that loses the post-unlink create race refuses as busy. The acquire/release pair is exposed as acquireVibeConfigLock, which registerOne's vibe branch now holds around its existing precheck and the external `vibe mcp add` call. defaultVibeConfigPath() gives every caller the same path. upsertServer's field rule is three explicit cases (retain/set/clear). createTomlMcpConfigWriter accepts an optional VibeConfigFs for injection, and lock-file creation ensures its parent directory exists first.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add defaultVibeConfigPath(), exposing the path defaultVibeConfigText/defaultVibeHome already compute inline. — ↩ rollbackable
2. Replace the lock file's mtime-age staleness test with a PID+token content model; reclaim is attempted only when process.kill(recordedPid, 0) throws ESRCH. — ↩ rollbackable
3. Have a reclaim unlink the dead holder's lock and immediately attempt its own exclusive create; refuse as busy on a lost race rather than retrying a steal in the same attempt. — ↩ rollbackable
4. Have release() re-read and verify its own token before unlinking, never unlinking on a mismatch. — ↩ rollbackable
5. Expose the acquire/release pair as acquireVibeConfigLock, usable independently of upsertServer/removeServer. — ↩ rollbackable
6. Ensure the lock file's parent directory exists (mkdir recursive) before the first exclusive-create attempt. — ↩ rollbackable
7. Wrap registerOne's vibe-branch precheck and external `vibe mcp add` call in acquireVibeConfigLock(defaultVibeConfigPath(), fs), releasing in a finally regardless of outcome. — ↩ rollbackable
8. Correct upsertServer's field-merge rule to three explicit cases (omitted retains, defined value sets, explicit undefined clears) and specify that properties outside name/command/args are never read. — ↩ rollbackable
9. Add an optional vibeFs parameter to createTomlMcpConfigWriter, defaulting to the production plugin VibeConfigFs adapter. — ↩ rollbackable
10. Document the residual check-to-rename window as an accepted, bounded limit, and that the content comparison's guarantee is byte-content only (inode/mode identity across an external replacement is out of scope). — ↩ rollbackable

**Backward compat:** registerOne, removeVibeProjectServer and createTomlMcpConfigWriter keep their existing exported signatures (createTomlMcpConfigWriter's new parameter is optional and additive). The corrected field rule fixes a wording bug that, if ever implemented as round 3 literally described it, would have cleared caller-supplied values -- no caller today relies on that incorrect behavior since it was never built. No on-disk config format changes.

## 9. Alternatives considered

### 9.1 a1: PID+token lock with read-verify-before-unlink release + exported lock primitive wrapping registerOne's external add + corrected 3-case field semantics + documented residual window/adapter injection/parent-dir creation — **CHOSEN**

Replace mtime-age reclaim with PID-liveness-proven abandonment and token-verified release; expose the lock acquire/release itself so registerOne can hold it around its own precheck + the external `vibe mcp add` subprocess; state the field-merge rule as three distinct cases; document the unavoidable check-to-rename window and fix the adapter-injection/parent-dir gaps.

The lock file's content carries {pid, token, acquiredAt}. A reclaim attempt is made ONLY when process.kill(recordedPid, 0) throws ESRCH (confirmed dead this round, no new dependency) -- age is used only as a cheap pre-filter for whether it's worth checking liveness at all, never as the abandonment proof itself. On release, the holder re-reads the lock file and verifies its content still matches the token it wrote at acquisition before unlinking; a mismatch means a successor has since reclaimed what the holder no longer owns, so the holder does NOT unlink (never deletes a successor's lock). A reclaim that loses the exclusive-create race immediately after unlinking the dead holder's lock refuses as busy rather than retrying a steal within the same attempt. The lock acquire/release pair is exposed as its own primitive (not bundled only inside upsertServer/removeServer), so registerOne can hold the SAME lock around its existing precheck (vibeConfigText/vibeConfigHasServer) and the external `vibe mcp add` subprocess call, serializing it against the plugin's writer even though the external command, not this Story's own code, performs that particular write. A new defaultVibeConfigPath() helper (mirroring defaultVibeHome's naming) gives registerOne and the lock primitive the same path to agree on. upsertServer's field rule becomes three explicit cases per managed field: key omitted retains the existing value; key present with a defined value sets it; key present but explicitly undefined clears it; any property on the incoming object outside name/command/args is read by nothing and never errors. The residual window between the final content check and the rename syscall itself is documented as an accepted, bounded limit this Story cannot close without a locking dependency barred by lc3; the comparison's guarantee is content-only (an inode/mode change across an external byte-identical replacement is explicitly out of scope). createTomlMcpConfigWriter gains an optional second VibeConfigFs parameter (defaulting to the production plugin adapter) for fixture injection; the lock-file creation path ensures its parent directory exists first, mirroring HostFileSystem.write's own existing mkdir-then-write behavior.

### 9.2 a2: Replace registerOne's external `vibe mcp add` call with a direct upsertServer call, instead of locking around the subprocess

Stop shelling out to `vibe mcp add` for the write itself; have registerOne call createVibeConfigAccess(...).upsertServer directly, so the write goes through the SAME code path (and lock) the plugin already uses, with no external-process write left to coordinate.

Same PID+token lock and field-rule/documentation fixes as a1, but registerOne's vibe branch no longer invokes `run(p.bin, p.addArgs(mcpJs))` for the write; it calls upsertServer({name:'insrc', command:'node', args:[mcpJs]}) directly, using the SAME lock-protected path as every other writer by construction (no separate lock-wrapping needed around an external command).

**Rejected because:** Would also close ac3's third-writer gap, but by its own stated con risks silently changing what vibe registration actually does (dropping validation/defaulting `vibe mcp add` itself may apply) — a behavior change beyond this round's review scope and this Story's own verification mandate.

### 9.3 a3: Keep mtime-age reclaim; only shorten the staleness threshold and add a warning log

Reject: narrows the age-based race's window without closing it, the same category of fix the review already rejected for the atomic-commit race in an earlier round.

Same lock-file mechanism as round 3, but with a shorter staleness threshold and a logged warning on reclaim, with no PID-liveness check added.

**Rejected because:** Fails to close ac3's actual race — a shorter age threshold still misjudges a merely slow, live process as abandoned, the exact failure mode the review's finding 1 already rejected for the earlier atomic-commit race.

### 9.4 a4: Widen VibeConfigEntry itself to carry arbitrary extra fields, instead of specifying that upsertServer ignores unnamed incoming properties

Reject: changes sc4's own entry shape to solve a problem the existing merge-forward-of-EXISTING-fields behavior (from round 2/3) and a simple 'ignore unnamed incoming properties' rule already solve without touching the contract.

Change VibeConfigEntry to something like `{ name: string } & Record<string, unknown>`, so any field a caller passes through is captured structurally, requiring a further HLD amendment beyond the 'unchanged' outcome already proposed.

**Rejected because:** Solves a problem that does not require a contract change, proposing a second HLD amendment where a1's plain 'ignore unnamed incoming properties' rule already resolves the same finding without touching sc4 at all.

## 10. References

- **[[c1]]** `code` `src/daemon/mcp-register.ts:466-538`
- **[[c2]]** `code` `src/daemon/mcp-register.ts:259-324`
- **[[c3]]** `code` `src/daemon/mcp-register.ts:110-119`

## 11. Open questions

- testFramework is inferred as 'vitest' from repository convention; no convention.detect analyzeBundle was run to confirm it, across any round of this Story.

## Resolved questions

- `q9ef3306b` — testFramework is inferred as 'vitest' from repository convention; no convention.detect analyzeBundle was run to confirm it, across any round of this Story.
  - **resolved**: Confirm before planning — Already verified explicitly this Epic (Story s3's own plan round, q3377461d): grep across the repo found 1643 backend files and 144 vscode-plugin files importing from 'node:test', zero importing from 'vitest', no vitest.config.* anywhere, and both package.json test scripts (node scripts/test-harness/run.mjs, the plugin's --suite=vscode variant) drive node:test's own harness. testFramework is 'node:test', not 'vitest' -- the carried inference is wrong, same as it was for s3. _(2026-11-28T14:59:10.097Z)_

## Citations

- **[[c1]]** `code` `src/daemon/mcp-register.ts:466-538`
- **[[c2]]** `code` `src/daemon/mcp-register.ts:259-324`
- **[[c3]]** `code` `src/daemon/mcp-register.ts:110-119`
