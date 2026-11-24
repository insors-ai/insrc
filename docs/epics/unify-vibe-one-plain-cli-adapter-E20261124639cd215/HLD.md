<!-- insrc:artifact HLD-639cd2159a87aedb -->

# HLD: unify-vibe-one-plain-cli-adapter

## Summary

**Tracker:** [insors-ai/insrc#274](https://github.com/insors-ai/insrc/issues/274)

One shared plain-CLI adapter module becomes the only way a Vibe turn launches — the backend provider and the chat worker both call it, the session transport is deleted, and the read-only gate plus the tool naming live inside it so they cannot be bypassed or drift. The launch contract carries everything chat needs to stay unchanged: the existing per-turn approval mapping (rejected for read-only turns), tool-result output content with the current normalization, a dual process-group policy that preserves the chat worker's own group ownership, rich events with session identity, and a type-level rule that a resumed turn cannot carry a changed model. A real-TOML reader (smol-toml, parse-for-understanding, surgical edits) replaces every hand-written Vibe config reader, and the model-family records are rebuilt to advertise exactly what the new launch path honors. Contracts are owned to fit the story graph: the adapter interface and the tool naming at s1 (every consumer is downstream), the read-only capability and its qualification evidence at s2, the config reader at s4.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. Problem context

> See **DEF-639cd2159a87aedb** § 1. Problem

## 2. Framework summary

One shared plain-CLI Vibe execution adapter module owns the whole launch contract — argv construction, model/thinking pinning for new sessions with explicit resumed-session selection semantics (qualify or reject before dispatch, never silent substitution), prompt transport, budget guards, the execution context (cwd, environment, dual process-group policy with defined escalation and cleanup ownership per mode, abort signal, host deadline), the ordinary-session approval input with the existing chat mapping, rich turn events with session identity and tool-result output content, the qualified MCP tool naming split into general identity parsing and the analysis allowlist, and the fail-closed read-only mode whose qualification the ADAPTER owns and validates. The backend provider and the VS Code plugin chat both import and call it directly; the session-based app-server transport is deleted, not demoted. A sibling shared real-TOML config module (smol-toml, parse-for-understanding with surgical, byte-preserving edits) replaces every hand-written Vibe TOML reader. This is alternative a1, revised per the design reviews of 2026-11-24: the only shape that satisfies all seven Epic constraints, with k1/k2/k3 satisfied structurally — the safety gate, its qualification, the approval mapping, the process-group policy and the naming convention live inside the one module both surfaces must call.

## 3. Architecture shape

A new shared plain-CLI Vibe execution adapter module in src/shared — owned by story s1 — holds the entire launch contract against the installed tool: argv construction from the qualified 3.1.4 flag surface (headless mode, model and thinking pinning for NEW sessions, prompt transport through the programmatic input contract, budget guards, exit-evidence capture), the execution context (working directory, environment, and a DUAL process-group policy at construction — adapter-owned or supervisor-owned — with abort signal and host deadline per turn), the ordinary-session approval input with the existing chat mapping (undefined→CLI defaults, manual→ask, edit-auto→accept-edits, auto→auto-approve; rejected for read-only requests), the qualified insrc MCP tool naming split into general identity parsing and the restricted analysis allowlist, and the read-only launch mode whose qualification the ADAPTER owns and validates itself (added by s2 behind its live-qualification gate; the mode refuses from s1 onward until it succeeds). Process-group ownership is explicit in each policy: adapter-owned — the adapter spawns the child leading a detached group and owns termination, escalation, descendant-exit confirmation and cleanup; supervisor-owned — the child inherits the caller's (the chat worker's) group, the SUPERVISOR owns escalation and sweeping, and the adapter retains turn-scoped temporary-file cleanup only — so the existing worker-owned group and its forced-stop sweep are preserved unchanged. Turn events are rich enough for chat: tool-call identity and arguments, tool-result OUTPUT content with a documented normalization, result status, session identity and newly-created resume handles. The backend CliProvider's vibe paths (complete, structured, read-only session) become thin consumers; the session transport src/shared/vibe-session.ts and its app-server dependencies are deleted outright. The VS Code plugin chat (s3) keeps its worker, transcript rendering and streaming lifecycle but its mapper and job runner become consumers of the same adapter — the VIBE_ACTIVE_MODEL env pinning and the private argv builder go away, and the chat's tool-activity parser uses the shared naming convention (general MCP identity, including insrc_present) instead of its own spelling. A sibling shared real-TOML Vibe config module (s4) — built on the existing smol-toml dependency, following the codex project-config guard's parse-for-understanding, refuse-don't-rewrite precedent — serves the daemon's registration checks and cleanup and the plugin's config writer, replacing all three hand-written readers (toml-inline-list.ts is deleted). The cli-vibe model-family records (catalog/registry/check/definitions, s5) are aligned to exactly what the adapter honors. Story s6 closes the ledger with evidence. Module topology: the adapter is imported by src/agent/providers/cli-provider.ts, src/agent/providers/structured-output.ts, vscode-plugin/src/chat/vibe-session-process.ts and vscode-plugin/src/chat/cli-adapter.ts — the same import seam the deleted transport used (in-degree 8 proven by the s1 bundle), so no new packaging mechanism is needed; the plugin already bundles shared modules today.

## 4. Diagrams

- [Component dependencies](./component-dependency.html)

## 5. Shared contracts

### 5.1 sc1: Vibe execution adapter interface

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s5`

**Purpose:** The one launch contract every Vibe turn goes through. It carries: an explicit launch mode on every request (default | read-only) with an ordinary-session approval input mapped as chat maps it today (undefined/default→CLI defaults, manual→ask, edit-auto→accept-edits, auto→auto-approve — with parity cases) that is REJECTED for read-only requests; an adapter-construction context carrying cwd, environment and a DUAL process-group policy — adapter-owned (adapter leads a detached group; owns termination, escalation, descendant-exit confirmation and cleanup) or supervisor-owned (child inherits the caller's group; the supervisor owns escalation and sweeping; adapter keeps turn-scoped temp cleanup) — with per-turn abort signal and host deadline; rich turn events whose tool-result variant carries the normalized OUTPUT content, not only identity and status; and the resumed-session selection semantics expressed IN THE TYPE — a resumed turn has no selection fields, the session's effective selection is read back from exit evidence and reported, and a caller wanting a different selection starts a new session. Silent substitution is unrepresentable. Owning it in s1 makes k2 true by construction.

**Interface sketch (type-level):**

```
/** The single Vibe launch contract. Construction fixes the execution context; each turn carries its own cancellation and approval choice. */
interface VibeAdapterContext {
	/** Working directory: project config, repository context and resume scope. */
	readonly cwd: string;
	readonly env?: Readonly<Record<string, string>> | undefined;
	/** Process-group policy (r2 finding 3). adapter-owned: the child leads a detached
	 *  group; the adapter owns termination, escalation, descendant-exit confirmation
	 *  and cleanup. supervisor-owned: the child inherits the caller's (worker's)
	 *  group; the SUPERVISOR owns escalation and sweeping; the adapter retains
	 *  turn-scoped temporary-file cleanup only. */
	readonly processGroup: 'adapter-owned' | 'supervisor-owned';
}
interface VibeNewSession {
	readonly kind: 'new';
	readonly model?: string | undefined;
	readonly thinking?: string | undefined;
}
interface VibeResumedSession {
	readonly kind: 'resume';
	readonly resumeHandle: string;
	/** A resumed turn carries NO model/thinking selection: the flags are new-session-only in the installed tool. The session's effective selection is reported in the result; changing selection requires a new session. */
	readonly selection?: undefined;
}
type VibeSessionRequest = VibeNewSession | VibeResumedSession;
/** Ordinary-session approval choice (r2 finding 1) — the existing chat mapping:
 *  'default'/undefined → no flag, CLI defaults; 'manual' → agent 'ask';
 *  'edit-auto' → agent 'accept-edits'; 'auto' → auto-approve. */
type VibeApproval = 'default' | 'manual' | 'edit-auto' | 'auto';
interface VibeTurnRequest {
	readonly prompt: string;
	readonly outputMode: 'text' | 'json' | 'streaming';
	readonly session: VibeSessionRequest;
	readonly mode: 'default' | 'read-only';
	/** Ordinary sessions only. REJECTED on a mode:'read-only' request — the read-only
	 *  authorization is the adapter's own qualified narrow policy, never a caller choice. */
	readonly approval?: VibeApproval | undefined;
	readonly readDirs?: readonly string[] | undefined;
	readonly budget?: { readonly maxTurns?: number | undefined; readonly timeLimitSeconds?: number | undefined; readonly maxPriceDollars?: number | undefined; readonly maxTokens?: number | undefined } | undefined;
	/** Host cancellation — authoritative over the tool's own budgets (a stalled bootstrap is bounded here). */
	readonly signal?: AbortSignal | undefined;
	/** Host deadline in ms from turn start. */
	readonly deadlineMs?: number | undefined;
}
type VibeTurnEvent =
	| { readonly kind: 'session'; readonly sessionId: string; readonly resumeHandle?: string | undefined }
	| { readonly kind: 'status'; readonly phase: 'starting' | 'thinking' | 'refused' }
	| { readonly kind: 'assistant-text'; readonly text: string }
	| { readonly kind: 'tool-call'; readonly toolCallId: string; readonly toolName: string; readonly arguments: Readonly<Record<string, unknown>> }
	/** The result CONTENT rides the event (r2 finding 2): output is the normalized
	 *  result text (outputText/output, else the error message, else the reason — the
	 *  existing chat precedence), preserving current transcript rendering. */
	| { readonly kind: 'tool-result'; readonly toolCallId: string; readonly ok: boolean; readonly output: string; readonly error?: string | undefined }
	| { readonly kind: 'error'; readonly message: string };
interface VibeExitEvidence {
	readonly stopReason?: string | undefined;
	readonly outcome?: string | undefined;
	/** The session's effective model/thinking, read back from the tool's export — a resumed turn reports what actually ran. */
	readonly effectiveSelection?: { readonly model?: string | undefined; readonly thinking?: string | undefined } | undefined;
}
interface VibeTurnResult {
	readonly text: string;
	readonly sessionId?: string | undefined;
	readonly resumeHandle?: string | undefined;
	readonly exitEvidence?: VibeExitEvidence | undefined;
}
interface VibeExecutionAdapter {
	/** Start a turn; a 'session' event opens it, the result carries identity + exit evidence. */
	startTurn(request: VibeTurnRequest): AsyncIterable<VibeTurnEvent> & { readonly result: Promise<VibeTurnResult> };
}
```

**Assumptions cited:** [[c13]] [[c5]]

### 5.2 sc2: Qualified insrc tool naming — general identity plus the analysis allowlist

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`

**Purpose:** One spelling of the insrc MCP tool names, established once against the installed CLI — with the two concerns separated: GENERAL identity parsing recognizes every insrc MCP tool (including insrc_present) for the chat's tool-activity rendering and insrc_present document declarations, while the RESTRICTED analysis allowlist names exactly the two tools a read-only session may run. The backend allowlist and the chat parser both consume the same established spelling.

**Interface sketch (type-level):**

```
/** Tool naming, split into general MCP identity and the restricted analysis allowlist. */
interface VibeMcpToolIdentity {
	readonly server: string;
	readonly tool: string;
	readonly streamedName: string;
}
/** General MCP identity parsing: ANY insrc MCP tool as the installed CLI spells it — the chat's tool-activity parser uses this, including insrc_present. Established once by live qualification. */
interface VibeMcpNaming {
	readonly fromStreamedName: (streamedName: string) => VibeMcpToolIdentity | undefined;
}
/** The restricted analysis allowlist for read-only sessions — a fixed set, NOT the general naming. */
type VibeInsrcAnalysisToolId = 'insrc_analyze' | 'insrc_analyze_step';
```

**Assumptions cited:** [[c13]]

### 5.3 sc3: Adapter-owned read-only authorization and its qualification evidence

**Owner Story:** `s2`
**Consumed by:** `s6`

**Purpose:** The fail-closed read-only mode of the adapter: the qualification is ADAPTER-OWNED — a caller cannot supply a status or an allowedTools list; the adapter runs the live qualification against the real binary and exposes only the capability it validated, bound to the binary version and effective approval policy it was proven against (either changing invalidates it and the mode refuses until re-qualified). From s1 onward a read-only request refuses before dispatch until s2's qualification succeeds, and ordinary approval settings are excluded from read-only requests — the qualified narrow policy is the only authorization and the adapter chooses it. The qualification evidence is what s6 cites when closing the read-only issue.

**Interface sketch (type-level):**

```
/** Fail-closed read-only authorization — ADAPTER-OWNED. Callers never construct this: the adapter runs the live qualification itself and exposes only the validated result. */
interface ReadOnlyCapability {
	readonly status: 'qualified' | 'unavailable';
	readonly allowedTools: readonly VibeInsrcAnalysisToolId[];
	/** Set when unavailable: the refusal reason, surfaced to the session's answer and the ledger. */
	readonly reason?: string | undefined;
	/** What the qualification was proven against — a change in either invalidates it and the mode returns to refusing until re-qualified. */
	readonly provenAgainst: { readonly binaryVersion: string; readonly effectivePolicy: string } | undefined;
}
interface VibeExecutionAdapter {
	/** The adapter's own validated read-only capability (composed onto sc1's adapter shape). */
	readonly readOnly: ReadOnlyCapability;
	/** A mode:'read-only' turn REFUSES before dispatch while readOnly.status is 'unavailable' — from story s1 onward. A read-only turn carrying any ordinary approval setting is likewise refused before dispatch. */
}
```

**Assumptions cited:** [[c5]]

### 5.4 sc4: Real-TOML Vibe config reader

**Owner Story:** `s4`

**Purpose:** One real-parse reader for Vibe config files shared across MODULES (the daemon's registration checks and cleanup, and the plugin's MCP config writer) — both call sites live inside story s4, so no other story consumes it; it exists as a contract because the daemon and the plugin are separate codebases bundling the same shared module.

**Interface sketch (type-level):**

```
/** Shared real-TOML Vibe config handling: parse for understanding, edit surgically, refuse rather than corrupt. */
interface VibeConfigEntry {
	readonly name: string;
	readonly command?: string | undefined;
	readonly args?: readonly string[] | undefined;
}
type VibeConfigEditOutcome =
	| { readonly kind: 'written'; readonly bytePreserved: true }
	| { readonly kind: 'absent' }
	| { readonly kind: 'refused'; readonly reason: string };
interface VibeConfigAccess {
	/** Parse with a real TOML parser; answer from the parse, never from heuristics. */
	readonly declaresServer: (name: string) => boolean;
	readonly entries: readonly VibeConfigEntry[];
	/** Surgical edits: unrelated servers, settings and comments survive byte-for-byte. */
	readonly upsertServer: (entry: VibeConfigEntry) => VibeConfigEditOutcome;
	readonly removeServer: (name: string) => VibeConfigEditOutcome;
}
```

**Assumptions cited:** [[c6]]

## 6. Story boundaries

### 6.1 Story STORY-639cd2159a87aedb-s1

**Owns:** `sc1`, `sc2`

Everything behind the adapter interface: argv construction from the qualified 3.1.4 flag surface (headless mode selection, model and thinking pinning for NEW sessions, prompt transport through the programmatic input contract, budget-guard forwarding, the ordinary approval mapping — undefined/default→CLI defaults, manual→ask, edit-auto→accept-edits, auto→auto-approve, with the read-only request REJECTING any approval setting — exit-evidence parsing including the session's effective selection), the adapter-construction execution context with the DUAL process-group policy and per-turn cancellation (adapter-owned mode: the adapter leads a detached group and owns termination, escalation, descendant-exit confirmation and group cleanup on every exit path; supervisor-owned mode: the child inherits the caller's group, the supervisor owns escalation and sweeping, the adapter retains turn-scoped temporary-file cleanup only), transient-error classification and the bounded retry semantics shared with the claude/codex clients, the local schema-validation loop for structured-output requests, the tool-result output normalization (outputText/output, else error message, else reason — the existing chat precedence), the type-level resumed-session selection rule, and the deletion of src/shared/vibe-session.ts plus the rewiring of the backend provider paths (complete, completeStructured, runReadOnlySession's launch mechanics) and structured-output.ts onto the adapter. The read-only launch MODE exists from s1 but every 'read-only' request REFUSES before dispatch until the adapter's own qualification succeeds (s2) — the refusal reason is surfaced to the caller.

### 6.2 Story STORY-639cd2159a87aedb-s2

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

The narrow-authorization design itself: the live qualification suite against the real installed binary (custom policy/agent exploration, allowed-tool execution proof, blocked-tool proof, blanket-bypass absence proof, write-refusal check, AND the invalidation behavior — a changed binary version or effective policy returns the mode to refusing until re-qualified), the adapter-owned ReadOnlyCapability wiring (the adapter validates and exposes; callers never construct), the unavailable-state reporting when qualification fails, and the adapter's read-only mode enablement. The custom-agent/policy TOML a qualified design may need is authored with the same smol-toml dependency directly — it is not the Vibe-config reader (sc4).

### 6.3 Story STORY-639cd2159a87aedb-s3

**Depends on:** `sc1`, `sc2`

The chat surface migration: the vibe mapper and job runner become consumers of the adapter (argv and VIBE_ACTIVE_MODEL pinning deleted from the plugin; the worker's signal threads into the adapter's per-turn cancellation; the worker keeps its supervisor-owned process group and its forced-stop sweep), while the transcript rendering, streaming event mapping over the RICH events (tool-call identity and arguments for command correlation, tool-result OUTPUT content, session identity and resume-handle delivery), worker lifecycle, resume handles and attachments keep their existing behavior (lc2). Also internal: the live verifications whose outcomes s6 records — the approval parity cases (undefined/default, manual, edit-auto, auto map to the same tool policies the private launch path used today), the tool-result output parity fixture (actual output text, not only correlation and success/failure), the worker forced-termination and descendant-cleanup parity check under the supervisor-owned group, the prompt-transport check (multiline, option-like text), the resume round-trip including that a resumed turn preserves the session's model/thinking and that the tool rejects a selection change on a resumed session before dispatch, and the general-naming check that chat tool-activity rendering and insrc_present declarations parse through sc2's general identity.

### 6.4 Story STORY-639cd2159a87aedb-s4

**Owns:** `sc4`

The reader's internals: parse-for-understanding via the existing smol-toml dependency following the codex project-config guard's refuse-don't-rewrite precedent, the surgical byte-preserving edit engine (upsert/remove of exactly the insrc entry, comments and unrelated tables untouched), the refusal path for configs that cannot be changed safely, and the rewiring of the daemon's registration checks and cleanup (mcp-register) and the plugin's config writer (toml-mcp-writer) onto it — with src/shared/toml-inline-list.ts deleted.

### 6.5 Story STORY-639cd2159a87aedb-s5

**Depends on:** `sc1`

The model-family alignment: catalog, registry, check and definitions entries for cli-vibe rebuilt to exactly the models and thinking levels the adapter honors (verified against the installed tool's catalog), the selection-delivery semantics through the adapter — new sessions take the selection, resumed sessions inherit and report — and the fail-before-dispatch error naming supported choices. No other story consumes these records; settings and tier resolution do.

### 6.6 Story STORY-639cd2159a87aedb-s6

**Depends on:** `sc3`

The reconciliation work itself: verifying the chat prompt-transport fix, the approval parity cases, the tool-result output parity, the resume-selection behavior and the worker cleanup parity live with s3's evidence, checking catalog coverage, closing the implemented issues (read-only authorization via sc3's qualification evidence incl. its provenAgainst record, TOML parsing via sc4's story validation), stamping the review-dependent deferrals with their recorded dependency on the review rewrite, and attaching evidence to every closure.

## 7. Non-functional targets

- **Performance:** One subprocess per turn, as the claude and codex clients already do — no persistent session to keep warm, and the deleted app-server transport removes its handshake overhead per explicit-selection request. The adapter forwards the tool's own budget guards (max turns, price, tokens, time limit) AND enforces the host-side deadline: the tool's budgets do not bound a bootstrap that stalls before the tool applies them, so the adapter's abort/deadline path is the authoritative bound. In adapter-owned mode the adapter sweeps the child group on every exit path; in supervisor-owned mode the supervisor's existing sweep is preserved unchanged. Structured-output requests keep the existing bounded retry semantics.
- **Security:** k1 is structural in the strict sense: the read-only launch mode is part of the single adapter's request shape, its narrow authorization is qualified live BY THE ADAPTER against the installed binary (a caller cannot assert a status — the adapter exposes only the capability it validated), and a change in the binary's version or the effective approval policy invalidates the qualification and the mode returns to refusing until re-qualified. Ordinary approval settings (manual, edit-auto, auto) are REJECTED for read-only requests — the qualified narrow policy is the only authorization a read-only turn may run under, and it is chosen by the adapter, never by the caller. On any qualification failure the mode reports analysis unavailable and never falls back to a blanket approval. Resumed turns cannot carry a changed model or thinking level: the request type has no selection field on a resumed turn, a session's effective selection is read back from exit evidence and reported in the result, and a caller who wants a different selection starts a new session — silent substitution is unrepresentable. All model access stays through the local CLI binary's own auth (k6) — no direct cloud REST; prompts travel via the tool's programmatic input contract, never through shell-interpolated argv.
- **Observability:** Every turn result carries the tool's structured exit evidence (stop reason, outcome) and the session identity (native session id, newly-created resume handle) so failures are attributable and resume is auditable; tool-result events carry the normalized OUTPUT content so the transcript shows what a tool actually returned, not only that it succeeded; per-turn outcomes, qualification results and refusal reasons are logged through the daemon's pino logger; the ledger reconciliation (s6) records its verification evidence on the artifacts it closes or defers.
- **Durability:** User configuration files are edited surgically with byte-for-byte preservation of unrelated content, and a config that cannot be changed safely is left untouched with the failure reported (k4); the issue ledger records closures only with evidence (k7). Temporary files the adapter creates for a turn (prompt transport, exit-evidence export) are cleaned by the adapter on every exit path — normal completion, abort, deadline and crash — in BOTH process-group policies: adapter-owned cleanup extends to the child group sweep, supervisor-owned keeps the adapter's turn-scoped temp cleanup while the supervisor sweeps the group.

## 8. Rollout

**Phase A — Shared foundations**

**Stories:** `s1`, `s4`

The two independent foundations land first and in parallel: s1 builds the shared plain-CLI execution adapter (owning sc1 the launch contract — with the execution context, the dual process-group policy, the ordinary approval mapping, the tool-result output normalization and the type-level resumed-session selection rule — and sc2 the qualified tool naming split into general identity and the analysis allowlist), rewires the backend provider paths, ships the read-only mode refusing, and deletes the session transport; s4 builds the shared real-TOML config reader (sc4) and rewires the daemon registration/cleanup and the plugin config writer onto it. Neither depends on the other, and every later story consumes their contracts.

**Backward compat:** The repo compiles at every story boundary: s1 mechanically re-points the plugin's two vibe-session imports (the catalog model type and the chat worker's turn entry) to adapter-owned equivalents without changing chat behavior — the full chat launch migration is Phase B. Read-only requests REFUSE from s1 onward (fail-closed) until s2's adapter-owned qualification succeeds, and ordinary approval settings are rejected on read-only requests from s1 onward. Daemon registration/cleanup outcomes are preserved exactly (same files written or refused, byte-for-byte).

**Phase B — Adapter consumers**

**Stories:** `s3`, `s2`, `s5`

All three consumers of the adapter land after s1 and can proceed in parallel: s3 migrates the chat surface onto the adapter (deleting the plugin's private argv builder and env-var pinning, adopting the shared general naming, and running the live verifications — prompt transport, approval parity cases for undefined/manual/edit-auto/auto, tool-result output parity, worker forced-termination/descendant-cleanup parity under the supervisor-owned group, the resume round-trip that a resumed turn preserves the session's model/thinking and a selection change on a resumed session is rejected before dispatch, and the insrc_present declaration parsing); s2 runs the adapter-owned narrow-authorization live qualification — started early in the phase so its exploration is timeboxed while the other stories proceed; s5 rebuilds the model-family records to exactly what the adapter honors, including the new-session-vs-resumed selection semantics.

**Backward compat:** Chat transcript rendering, streaming, resume handles, attachments and worker lifecycle keep their existing behavior (lc2) — only the launch path and tool naming change. The worker keeps its supervisor-owned process group and its forced-stop sweep. Read-only analysis ships disabled (fail-closed) unless and until the live qualification succeeds, so the safety posture never regresses mid-phase.

**Phase C — Ledger reconciliation**

**Stories:** `s6`

s6 runs alone, last: every closure it records cites built evidence — the prompt-transport, approval-parity, tool-result-output, worker-cleanup and resume-selection verifications from s3, the adapter-owned qualification evidence with its provenAgainst record from s2 (sc3), the TOML story validation from s4 (sc4) — and the review-dependent deferrals are stamped with their recorded dependency on the review rewrite. Nothing it changes is consumed by another story.

**Ordering rationale:** Contract owners land before consumers (s1's sc1/sc2 are consumed by s2, s3, s5; s2's sc3 is consumed by s6; s4's sc4 has no story consumers), and every phase respects the Epic's dependsOn edges: s1 and s4 are independent foundations; s2, s3 and s5 all depend only on s1 and run in parallel; s6 depends on s2, s3 and s4 and runs last because every closure it stamps cites those stories' built evidence. s3 is deliberately the first story of Phase B and immediately follows s1 because the transport deletion in s1 re-homes the plugin's two remaining vibe-session imports mechanically — the chat's real migration cannot lag or the mechanical re-pointing would accrete behavior debt.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Deleting the session transport without breaking the plugin build (s1 → s3 sequencing) | The plugin chat imports the transport module today (VibeCatalogModel in cli-adapter.ts, runVerifiedVibeTurn via runVibeChatJob in vibe-session-process.ts, plus the worker). If s1 deletes src/shared/vibe-session.ts outright while the chat still references it, the repository stops compiling between Phase A and Phase B — and ac3 requires no reference to remain. | s1's boundary includes a mechanical re-homing: the two plugin-consumed symbols (the catalog model type imported by vscode-plugin/src/chat/cli-adapter.ts and the chat worker's turn entry in vscode-plugin/src/chat/vibe-session-process.ts) move to adapter-owned equivalents and the plugin's import statements are re-pointed with no behavior change; the session machinery itself is then deleted. The chat's real launch migration follows immediately in Phase B's first story, and the repo compiles at every story boundary. The s1 LLD must enumerate the plugin's vibe-session imports exhaustively — by grep, not by the call graph (which already missed vibe-session-worker.ts once). |
| The narrow read-only authorization may not qualify, and qualification can silently go stale (k1) | Whether a custom policy or agent can authorize exactly the insrc analysis tools without a blanket bypass is unproven (the Epic's one low-confidence assumption) — and a qualification proven against one binary version or policy can silently stop holding after an upgrade or config change, which the prior design did not address. | The fail-closed outcome is a first-class deliverable: s2's ac3 specifies the honest unavailable state with its reason, and sc3's ReadOnlyCapability is adapter-OWNED — callers cannot assert a status — and bound to what it was proven against (binary version, effective approval policy); a change in either invalidates it and the mode returns to refusing until re-qualified, which the s2 qualification suite proves live alongside the authorization itself. Ordinary approval settings are rejected on read-only requests from s1 onward, so no consumer can smuggle an approval mode past the gate. The custom policy/agent exploration is timeboxed early in Phase B; on failure, ISSUE-d3e72fe73ee775a2 stays open citing the qualification evidence. |
| Chat migration: behavior regression, approval parity, tool-result content and the resumed-session selection combination (s3, r2 findings 1, 2 and 4) | s3 replaces how turns launch, how tool names parse, how results render AND how resumed sessions carry selection — the r2 review established that the ordinary approval mapping, the tool-result output content and the worker-owned process group must all be representable in the shared contract or chat would lose behavior; and the installed tool's --model/--thinking are new-session-only, so the resumed+changed-selection combination must be defined by qualification, not assumption. | Record the current chat behavior as parity fixtures BEFORE the swap (streaming event shapes, resume round-trips, attachment handling, worker lifecycle, the approval-mode argv for undefined/manual/edit-auto/auto, the tool-result output text) and assert the new path against them over the RICH event variants (tool-call identity/arguments, tool-result OUTPUT content, session identity, resume-handle delivery). The approval mapping, the tool-result output normalization and the worker forced-termination/descendant-cleanup sweep under the supervisor-owned group are qualified live in the same story: the adapter's argv for each approval mode matches what the private launch path built today, the tool-result output renders identically in the transcript, and a forced stop still sweeps every descendant. The resume-selection combination is qualified live: a resumed turn preserves the session's model/thinking and an attempted selection change on a resumed session is rejected before dispatch. The type-level rules (no selection fields on a resumed turn; approval rejected for read-only) make the loss cases unrepresentable; if a live qualification shows divergence, the story reopens the design with the evidence rather than shipping a mismatch. |

## 9. Alternatives considered

### 9.1 a1: One shared adapter module consumed directly by both surfaces — **CHOSEN**

Both the backend provider and the plugin chat import one shared plain-CLI adapter module that owns the whole launch contract, safety modes and tool-naming convention.

A single shared plain-CLI execution adapter module (argv construction, model and thinking-level pinning, prompt transport, budget guards, exit-evidence parsing, the execution context — cwd, environment, dual process-group policy with defined escalation/cleanup ownership in each mode, abort signal, host deadline — the ordinary-session approval input, rich turn events including tool-result output content, and the qualified MCP tool-naming convention) lives in the shared layer, owning the entire launch contract against the installed tool. The backend CliProvider's vibe paths and the plugin chat worker both import and call it directly; the read-only authorization is a launch MODE of the adapter, owned and validated by the adapter itself and gated behind its own live-qualification result (ordinary approval settings are rejected for read-only requests), and a sibling shared real-TOML config module (following the codex parse-for-understanding, refuse-don't-rewrite precedent) serves registration checks, cleanup and the plugin writer. The session transport is deleted outright. Story boundaries follow the DEF: s1 builds the adapter and rewires the backend (read-only mode present but refusing until qualified), s2 qualifies and enables the read-only mode, s3 migrates the chat onto it, s4 replaces the TOML readers, s5 and s6 align the model family and reconcile the ledger. This revision 3 folds the r2 review's remaining findings into the contract: the per-turn approval input with the existing mapping (undefined→CLI defaults, manual→ask, edit-auto→accept-edits, auto→auto-approve) with parity cases and read-only exclusion; tool-result output content with a documented normalization preserving current rendering; and both process-group policies — adapter-owned (the adapter leads a detached group and owns escalation, descendant-exit confirmation and cleanup) and supervisor-owned (the child inherits the caller's group; the supervisor owns escalation and sweeping while the adapter retains turn-scoped temp cleanup) — so the chat worker keeps its existing group ownership unchanged.

**Pros:**
- Exactly one implementation of the launch contract exists — k2 satisfied by construction, no drift surface between backend and chat.
- The tool-naming convention, the ordinary approval mapping and the fail-closed read-only gate live where they are enforced — the adapter owns and validates its own qualification, so k1 and k3 cannot be bypassed by one surface forgetting a rule or asserting a status.
- The existing import seam is proven: the plugin chat worker already imports shared modules (vibe-session-process.ts imports from src/shared today), so no new packaging mechanism is needed.
- Deleting the session transport is clean: both consumers migrate in their own stories against one stable adapter interface.

**Cons:**
- The plugin gains a build-time dependency on shared backend code; its bundling must keep the adapter importable from the extension host (the chat worker already imports shared code today, so the seam exists but must be kept healthy).
- One module owns several concerns (argv, safety modes, exit parsing, naming, process-group policy); without disciplined internal boundaries it can grow into a new 'vibe-session.ts' — the HLD must define its internal seams.
- The read-only authorization is decided inside the adapter, so its qualification story (s2) and the launch story (s1) share a module and must be sequenced carefully — s1 ships the mode refusing, s2 enables it.

**Cost estimate:** L

### 9.2 a2: Daemon-owned adapter with plugin chat served over IPC

The launch contract lives entirely in the daemon; the plugin requests Vibe chat turns over daemon IPC and the daemon runs them.

The daemon becomes the single owner of the Vibe launch contract: the CliProvider builds the plain-CLI adapter internally, and the VS Code plugin no longer spawns or imports anything Vibe-specific — chat turns are requested over the existing daemon IPC, the daemon runs the turn, and streaming events are relayed back to the chat surface. The launch knowledge, the read-only authorization and the tool-naming convention exist once, inside the daemon; the plugin keeps only its UX surface (transcript rendering, resume handles, attachments).

**Pros:**
- Strictly one process owns Vibe subprocess lifecycle — the strongest possible form of k2.
- Tool naming and safety cannot diverge: the plugin never constructs an argv at all.
- Chat and backend share auth, quota and budget behavior automatically, since only the daemon spawns the tool.

**Cons:**
- Violates the shape of the settled scope in one respect: chat streaming and worker lifecycle (lc2, s3's local constraint) would be rebuilt on an IPC relay rather than preserved — the current worker owns streaming locally today.
- A daemon-relay protocol for chat turns is a new cross-process contract with backpressure, cancellation and resume semantics — more machinery, not less, in the seam between surfaces.
- The daemon becomes a hard runtime dependency for interactive chat (today the chat can spawn the CLI even when daemon IPC is unavailable), changing the plugin's failure modes beyond this Epic's problem statement.
- Session continuity: chat resume handles would have to round-trip through daemon state, expanding daemon session storage scope.

**Cost estimate:** L

**Rejected because:** k1 and k6 are as strong as a1's, but k2 — the Epic's central stakeholder constraint — is only partially satisfied because the plugin stops consuming the shared adapter directly, and k3 partials because the chat streaming, worker lifecycle and worker-owned process group the settled scope (and the r2 review) require preserved would be rebuilt over an IPC relay.

### 9.3 a3: Shared pure-contract core with thin per-surface adapters

Share only pure functions (argv building, output parsing, naming) as a contract; each surface keeps a thin runtime adapter composing them.

Define a minimal shared core contract as pure, side-effect-free functions — argv construction from a turn request, output-event parsing, exit-evidence interpretation, and the qualified tool-name mapping — published from the shared layer. Each surface keeps a thin adapter that composes those pure functions into its own runtime: the backend CliProvider wraps them in its provider semantics (retry, schema validation), the plugin chat worker wraps them in its streaming lifecycle. No shared runtime process or shared state exists; the specification is shared, the execution is per-surface.

**Pros:**
- Smallest shared surface to agree on; the plugin keeps full local control of its worker and streaming lifecycle (lc2 trivially preserved).
- Pure functions are the easiest layer to exhaustively test against recorded CLI fixtures — high confidence at the contract level.
- Per-surface runtimes can evolve independently if the surfaces' needs diverge later.

**Cons:**
- Two runtimes still exist by construction, so k2's 'one shared execution adapter' is satisfied only at the specification level — the DEF's settled decision (one shared execution adapter, ruling out 'share launch rules; preserve chat UX') is weakened, not honored.
- Safety-relevant behavior (the fail-closed read-only gate) must be enforced in two wrappers; a divergence there reintroduces exactly the disagreement the Epic exists to remove — precisely what the r1 review's finding 2 demanded cannot happen.
- More total code than one adapter module: contract plus two wrappers.
- Retry semantics and transient-error classification would be duplicated across wrappers unless also moved into the pure core — eroding the thinness this alternative is named for.

**Cost estimate:** M

**Rejected because:** Still structurally the weakest against the Epic's settled decisions: k2 is violated outright (the ruled-out 'share launch rules' shape), and k1/k3 partial because the safety gate, the approval mapping and the process-group policy must be enforced or composed twice — the exact divergence both reviews demand the design preclude.

## 10. References

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `step-output` `s2`
- **[[c3]]** `step-output` `s3`
- **[[c4]]** `step-output` `s4`
- **[[c5]]** `step-output` `s5`
- **[[c6]]** `step-output` `s6`
- **[[c7]]** `code` `src/shared/vibe-session.ts` — "the session transport to be deleted — in-degree 8, four production importers (backend cli-provider.ts and structured-output.ts, plugin cli-adapter.ts and vibe-session-process.ts)"
- **[[c8]]** `code` `src/agent/providers/cli-provider.ts:55` — "the only real-TOML-parser import — the codex project-config exclusion guard's parse-for-understanding, refuse-don't-rewrite precedent"
- **[[c9]]** `code` `vscode-plugin/src/chat/cli-adapter.ts` — "plugin chat mapper: explicit prompt binding, environment-variable model pinning, MCP tool-name parser disagreeing with the backend allowlist"
- **[[c10]]** `prior-artifact` `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/DEF.md` — "the approved Epic this HLD designs — problem, constraints k1-k7, six stories with acceptance criteria"
- **[[c11]]** `analyze-bundle` `s1` — "live qualification 2026-11-24: headless --model/--thinking honored for NEW sessions; --approval-policy, custom agents, --enabled-tools, --prompt-file, budget guards and --output-dir export evidence in"
- **[[c12]]** `analyze-bundle` `s1` — "capability-discovery: smol-toml imported in exactly one place; the two hand-written Vibe readers are partial matches to replace"
- **[[c13]]** `analyze-bundle` `s1` — "the installed Vibe 3.1.4 headless flag surface (live-confirmed 2026-11-24) — grounds the sc1/sc2 assumptions that the plain CLI can carry the launch contract and that naming is established by qualific"
- **[[c14]]** `prior-artifact` `docs/standalone/vibe-s-read-only-session-cannot-E20261124d3e72fe7/ISSUE.md` — "--enabled-tools does not bypass the agent-approval gate; the narrow read-only authorization must be proven live or fail closed — grounds the sc1/sc3 assumptions"
- **[[c15]]** `prior-artifact` `docs/standalone/read-vibe-configs-real-toml-parser-E202611090b3114f8/ISSUE.md` — "Read Vibe configs with a real TOML parser — three heuristic parsing areas; grounds the sc4 assumption that a real parse is the replacement and byte-preservation is the contract"
- **[[c16]]** `code` `vscode-plugin/src/chat/vibe-session-process.ts:84-95` — "the ordinary-chat per-turn surfaces the r2 review findings rest on: the permissionMode mapping (auto→autoApprove, manual→ask, edit-auto→accept-edits), the tool-result content (outputText/output/error/"
- **[[c17]]** `stakeholder` `/tmp/.insrc/review-feedback-639cd2159a87aedb-hld.md` — "the r1 design review verdict: five findings (two HIGH, three MED) — findings 1-4 folded in revision 2; finding 5 fixed and complete as ISSUE-a3d8c9e9f195e620"
- **[[c18]]** `stakeholder` `/tmp/.insrc/review-feedback-639cd2159a87aedb-hld-r2.md` — "the r2 design review verdict: Changes required with three remaining MED gaps — the ordinary approval input (finding 1), the tool-result output content (finding 2) and the dual process-group policy (fi"

## Citations

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `step-output` `s2`
- **[[c3]]** `step-output` `s3`
- **[[c4]]** `step-output` `s4`
- **[[c5]]** `step-output` `s5`
- **[[c6]]** `step-output` `s6`
- **[[c7]]** `code` `src/shared/vibe-session.ts` — "the session transport to be deleted — in-degree 8, four production importers (backend cli-provider.ts and structured-output.ts, plugin cli-adapter.ts and vibe-session-process.ts)"
- **[[c8]]** `code` `src/agent/providers/cli-provider.ts:55` — "the only real-TOML-parser import — the codex project-config exclusion guard's parse-for-understanding, refuse-don't-rewrite precedent"
- **[[c9]]** `code` `vscode-plugin/src/chat/cli-adapter.ts` — "plugin chat mapper: explicit prompt binding, environment-variable model pinning, MCP tool-name parser disagreeing with the backend allowlist"
- **[[c10]]** `prior-artifact` `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/DEF.md` — "the approved Epic this HLD designs — problem, constraints k1-k7, six stories with acceptance criteria"
- **[[c11]]** `analyze-bundle` `s1` — "live qualification 2026-11-24: headless --model/--thinking honored for NEW sessions; --approval-policy, custom agents, --enabled-tools, --prompt-file, budget guards and --output-dir export evidence in"
- **[[c12]]** `analyze-bundle` `s1` — "capability-discovery: smol-toml imported in exactly one place; the two hand-written Vibe readers are partial matches to replace"
- **[[c13]]** `analyze-bundle` `s1` — "the installed Vibe 3.1.4 headless flag surface (live-confirmed 2026-11-24) — grounds the sc1/sc2 assumptions that the plain CLI can carry the launch contract and that naming is established by qualific"
- **[[c14]]** `prior-artifact` `docs/standalone/vibe-s-read-only-session-cannot-E20261124d3e72fe7/ISSUE.md` — "--enabled-tools does not bypass the agent-approval gate; the narrow read-only authorization must be proven live or fail closed — grounds the sc1/sc3 assumptions"
- **[[c15]]** `prior-artifact` `docs/standalone/read-vibe-configs-real-toml-parser-E202611090b3114f8/ISSUE.md` — "Read Vibe configs with a real TOML parser — three heuristic parsing areas; grounds the sc4 assumption that a real parse is the replacement and byte-preservation is the contract"
- **[[c16]]** `code` `vscode-plugin/src/chat/vibe-session-process.ts:84-95` — "the ordinary-chat per-turn surfaces the r2 review findings rest on: the permissionMode mapping (auto→autoApprove, manual→ask, edit-auto→accept-edits), the tool-result content (outputText/output/error/"
- **[[c17]]** `stakeholder` `/tmp/.insrc/review-feedback-639cd2159a87aedb-hld.md` — "the r1 design review verdict: five findings (two HIGH, three MED) — findings 1-4 folded in revision 2; finding 5 fixed and complete as ISSUE-a3d8c9e9f195e620"
- **[[c18]]** `stakeholder` `/tmp/.insrc/review-feedback-639cd2159a87aedb-hld-r2.md` — "the r2 design review verdict: Changes required with three remaining MED gaps — the ordinary approval input (finding 1), the tool-result output content (finding 2) and the dual process-group policy (fi"
