<!-- insrc:artifact DEF-639cd2159a87aedb -->

# Epic: unify-vibe-one-plain-cli-adapter

## Summary

**Flavor:** enhancement
**Seeded from:** `SPEC-74e8a0cf59d3f57d`
**Tracker:** [insors-ai/insrc#274](https://github.com/insors-ai/insrc/issues/274)

This Epic makes Mistral Vibe a fully-supported model client, equal to the claude and codex clients: one launch path serves both the backend and the VS Code chat, model selection works through the tool's own supported interface, and the redundant session machinery goes away. Read-only sessions either gain the ability to run insrc's analysis tools with everything else provably blocked, or honestly report that analysis is unavailable — they never trade safety for capability. Configuration files are read with a real parser so users' unrelated settings survive every edit, the tool naming is established once against the installed tool, and the issue ledger is brought back in line with reality: what is fixed is closed, what is deferred says so.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)
8. [Open questions](#8-open-questions)

## 1. Problem

Mistral Vibe is wired into the system through three mechanisms that disagree with each other. Backend model requests take one path for the default model but switch to a separate session-based transport whenever a model or thinking level is chosen — a split that no longer reflects the installed tool's capabilities — while the VS Code chat launches the same tool a third way and pins models through an environment variable. The mechanisms disagree on safety: a read-only session can read files but cannot call the insrc analysis tools at all, because the tool allowlist it relies on does not govern the tool's separate approval gate, so the sessions cannot do the analysis work they exist for. They disagree on tool naming, with the backend and the plugin assuming two different spellings for the same tools. Configuration files are read through hand-written approximations of TOML that have repeatedly misread valid user settings — most recently forcing nine rounds of validation hardening on a single cleanup function — and the integration's issue ledger has drifted: one record appears fixed by other work, and two more are predicated on review machinery that has since been removed from the codebase. The net effect is an integration that is over-complex where the claude and codex clients need one mechanism, unsafe where it matters most, and untrustworthy in its configuration handling and its own records.

## 2. Functional requirements

- **E20261124639cd215:FR001** — Every backend Vibe request and every VS Code chat Vibe turn executes through one shared plain-CLI launch path, and the session-based transport no longer exists in the codebase. _(Removes the three-mechanism split and its double maintenance; the claude and codex clients already work this way. [[c4]] [[c3]])_
- **E20261124639cd215:FR002** — Explicit model and thinking-level selection for Vibe rides the plain headless invocation and is honored exactly as the installed CLI's real catalog defines it, with selection failures reported before any model call. _(Restores parity with the other CLI clients, whose model selection rides the same one-shot invocation. [[c13]])_
- **E20261124639cd215:FR003** — A read-only Vibe session either runs exactly the allowed insrc analysis tools with every other tool provably blocked, or reports analysis as unavailable — never enables tools by approving everything. _(The current allowlist cannot call the analysis tools at all; the invariant forbids buying them back with a blanket bypass. [[c5]] [[c4]])_
- **E20261124639cd215:FR004** — Vibe configuration files are read through a real TOML parse, and registration or cleanup edits preserve every unrelated server, setting and comment the file already had. _(Hand-written readers have repeatedly misread valid user settings across three sites. [[c6]])_
- **E20261124639cd215:FR005** — The exact MCP tool naming for Vibe is established once against the installed CLI and used identically by the backend and the plugin. _(The backend and the plugin currently assume two different spellings for the same tools; at most one matches the installed CLI. [[c10]] [[c3]])_
- **E20261124639cd215:FR006** — The Vibe issue ledger is reconciled with evidence: verified fixes are closed, remaining gaps are recorded, and review-dependent items carry an explicit deferred dependency on the review rewrite. _(The issue ledger for this integration contains stale, fixed-by-other-work and removed-machinery records that misrepresent the current state. [[c7]] [[c8]] [[c9]])_
- **E20261124639cd215:FR007** — Vibe's model-family records remain coherent with the new launch path — the models and thinking levels advertised to users and settings are exactly those the plain-CLI path honors. _(The model family is woven through 77 references; the launch-path change must not leave advertised models or efforts that the new path will not honor. [[c1]])_

**s1:**

- **E20261124639cd215:S001:FR001** — Every backend Vibe request — plain completion, structured output and read-only session alike — executes through one plain-CLI launch path. _(One launch path for every backend request; the session transport is deleted, not demoted. [[c4]])_
- **E20261124639cd215:S001:FR002** — Explicit model and thinking-level selection rides the plain invocation, with selection failures reported before any model call. _(The split existed only because the older tool could not select models headlessly; the installed tool can. [[c13]])_
- **E20261124639cd215:S001:FR003** — Structured-output requests are validated locally against the requested schema with bounded retry. _(Schema-in-prompt with local validation and bounded retry is the tool-accurate equivalent of the other clients' native schema flags. [[c13]])_

**s2:**

- **E20261124639cd215:S002:FR001** — Read-only analysis is enabled only by an authorization proven live to allow exactly the analysis tools and block everything else. _(The allowlist alone does not govern the tool's approval gate; the qualification must prove both directions live. [[c5]])_
- **E20261124639cd215:S002:FR002** — When the narrow authorization cannot be established without a blanket bypass, read-only sessions report analysis unavailable instead. _(The safety invariant is not negotiable; an honest 'unavailable' beats a dangerous 'enabled'. [[c4]])_

**s3:**

- **E20261124639cd215:S003:FR001** — Chat Vibe turns launch through the same shared plain-CLI adapter as backend requests, with model selection carried by the adapter. _(One adapter, two consumers; the chat keeps its UX surface but loses its private launch mechanism. [[c4]])_
- **E20261124639cd215:S003:FR002** — Streaming output, resume behavior and attachments are preserved unchanged in behavior through the shared adapter. _(The migration must be invisible to the chat user except where it fixes real defects. [[c4]])_
- **E20261124639cd215:S003:FR003** — The chat and the backend use one MCP tool-naming convention, established against the installed tool. _(Two spellings for the same tools cannot both be right; one qualification settles it. [[c10]])_

**s4:**

- **E20261124639cd215:S004:FR001** — All Vibe configuration reading goes through one real TOML parse shared by the daemon and the plugin. _(Three sites currently approximate the grammar and have each misread valid files. [[c6]])_
- **E20261124639cd215:S004:FR002** — Registration and cleanup edits preserve every unrelated server, setting and comment byte-for-byte, and refuse rather than touch a file they cannot change safely. _(Users' unrelated settings are not ours to reformat or lose. [[c6]])_

**s5:**

- **E20261124639cd215:S005:FR001** — The Vibe model family's advertised models and thinking levels are exactly those the plain-CLI launch path honors, verified against the installed catalog. _(The launch-path change must not leave advertised records the path will not honor; settings must not lie. [[c13]])_

**s6:**

- **E20261124639cd215:S006:FR001** — Every open Vibe-integration record is closed, fixed, or explicitly deferred with a recorded dependency — none left silently stale. _(A ledger that misstates reality is worse than no ledger; reconciliation is evidence-driven. [[c4]])_

## 3. Non-goals

- **Retain the session-based transport as a backend transport, a fallback, or a verification layer in any form.** — Settled decision: the plain CLI path now covers what the session transport existed for; keeping it in any role preserves the split and its maintenance. [[c4]]
- **Allow a blanket permission bypass to enable read-only analysis tools.** — The read-only safety invariant is absolute; enabling analysis by approving everything is the exact failure mode the qualification gate exists to prevent. [[c4]] [[c5]]
- **Restore or rebuild the removed review-activity or streaming-review machinery, or wire Vibe into reviews in this Epic.** — The review machinery was removed from the codebase and is being rewritten; Vibe review support awaits the replacement and is recorded as a deferred dependency instead. [[c12]] [[c8]] [[c9]]
- **Split the launch path per surface — backend-only alignment, or plugin chat keeping its own launch mechanism.** — Settled decision; the plugin chat worker and mapper become consumers of the shared adapter while keeping their UX surface. [[c4]]
- **Replace TOML parsing only where the adapter needs it, or defer the parser replacement to separate work.** — Settled decision: partial parser replacement leaves the known misreading class in place wherever it remains. [[c6]]
- **Reconcile only the directly implemented issues, or merely document how the others relate without closing or deferring them.** — Settled decision: the ledger must reflect reality after this Epic, with closures backed by evidence. [[c4]]

## 4. Assumptions

- `high` The installed Vibe 3.1.4 headless flag surface (model alias selection, thinking level, approval policy, custom agents, tool enable/disable lists, prompt and system-prompt files, budget guards, and structured exit evidence) is sufficient to serve every backend request type the current session transport serves, so a shared plain-CLI adapter can replace it. [[c13]]
- `low` A custom policy or agent can authorize exactly the insrc analysis tools while leaving every other tool blocked, without a blanket approval bypass — unproven, which is why the Epic carries a fail-closed qualification gate rather than assuming success. [[c5]]
- `med` The plugin chat's streaming UX, resume handles and attachments survive being routed through the shared adapter unchanged in behavior. [[c4]]
- `med` The chat prompt-transport defect recorded in the ledger is already fixed by the current explicit prompt binding and needs verification and closure, not rework. [[c7]]
- `high` A real TOML parser is already a project dependency and its parse covers the grammar needs of all three hand-written Vibe config readers, so adoption is a replacement, not new machinery. [[c6]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | Read-only analysis authorization ships only on successful live qualification that proves every non-allowed tool stays blocked without a blanket permission bypass; on failure the session fails closed and analysis stays unavailable. | [[c4]] |
| `k2` | stakeholder | One shared plain-CLI execution adapter serves both the backend provider and the plugin chat; the session-based transport is not retained in any form — not as a fallback, not as a verification layer. | [[c4]] |
| `k3` | contract | Model, effort, prompt transport, safety handling and the exact MCP tool naming are qualified against the installed CLI and aligned by construction across both surfaces. | [[c13]] |
| `k4` | contract | Vibe configuration files are parsed with a real TOML parser for understanding, and edits are surgical: unrelated user settings survive registration and cleanup byte-for-byte; a config that cannot be changed safely is left untouched with the failure reported. | [[c6]] |
| `k5` | stakeholder | Review integration is out of scope until the review rewrite establishes its replacement; the review-dependent issues are recorded as deferred dependencies on it, not closed. | [[c12]] |
| `k6` | convention | All model work happens through the locally-installed CLI binary's own session (auth, quota, subprocess); no direct cloud REST is introduced. | [[c14]] |
| `k7` | invariant | Issues close only with supporting evidence; no speculative closures. | [[c4]] |

## 6. Stories

### 6.1 STORY-639cd2159a87aedb-s1 — One shared plain-CLI launch path serves every backend Vibe request

**User value:** `size: L`

Model work served by Vibe behaves exactly like the claude and codex clients — one launch path, explicit model selection that works, and no hidden second runtime to maintain or mistrust.

**Extends:** [[c13]] [[c2]]

**Acceptance criteria:**

- **ac1:** Given a backend Vibe request with no explicit model selection, when the request is issued, then it executes through the same plain-CLI invocation path as every other backend Vibe request, with the prompt delivered through the tool's programmatic input contract. _(operationalizes `k2`, `k3`)_
- **ac2:** Given a backend Vibe request with an explicit model and thinking level, when the request is issued, then the selection rides the same plain invocation and is honored exactly as the installed tool's real catalog defines it — an unknown model or level fails before any model call, reporting the supported choices. _(operationalizes `k3`, `k6`)_
- **ac3:** Given the codebase after this Story, when any backend Vibe request executes, then no session-based Vibe transport is reachable, referenced or importable anywhere in production code. _(operationalizes `k2`)_
- **ac4:** Given a structured-output Vibe request, when the answer returns, then the answer is validated locally against the requested schema and retried on invalid output, since the tool enforces no native schema flag. _(operationalizes `k3`)_
- **ac5:** Given a Vibe request that fails with a transient upstream error mid-response, when the provider handles the failure, then it is retried with the same bounded semantics as the claude and codex clients — a fresh invocation, bounded attempts, deterministic failures re-thrown at once. _(operationalizes `k3`)_

### 6.2 STORY-639cd2159a87aedb-s2 — Read-only Vibe sessions run the insrc analysis tools, or honestly report them unavailable

**User value:** `size: M`

Read-only Vibe sessions become genuinely useful for grounded analysis — they can drill into the repository through insrc's analyzer without ever trading away the guarantee that nothing else can run.

**Depends on:** `s1`

**Extends:** [[c5]] [[c13]]

**Acceptance criteria:**

- **ac1:** Given a live-qualified narrow authorization that allows exactly the insrc analysis tools, when a read-only session calls an allowed analysis tool, then the call executes and its result reaches the session's answer. _(operationalizes `k1`)_
- **ac2:** Given a read-only session running under the narrow authorization, when any tool outside the allowed set is attempted, then it is denied or unavailable — and no mode that approves every tool is enabled anywhere in the session. _(operationalizes `k1`)_
- **ac3:** Given qualification that cannot establish the narrow authorization without a blanket bypass, when a read-only session requests analysis, then analysis is reported unavailable with a clear reason, and the session still refuses the bypass. _(operationalizes `k1`)_
- **ac4:** Given a completed read-only session, verified live against the installed tool, when its effects are checked, then no file write, command execution or other mutating capability has run. _(operationalizes `k1`)_

**Local constraints:**

- `lc1` (invariant) The narrow-authorization qualification runs against the real installed binary through the gated live suites; mock-based qualification is not sufficient to enable analysis. [[c13]]

### 6.3 STORY-639cd2159a87aedb-s3 — VS Code chat runs Vibe through the shared adapter with streaming preserved

**User value:** `size: L`

Chat users keep the Vibe experience they know — streaming, resume, attachments — while the chat and the backend finally agree on how Vibe is launched and what its tools are called.

**Depends on:** `s1`

**Extends:** [[c10]] [[c1]]

**Acceptance criteria:**

- **ac1:** Given a user sends a Vibe chat turn with a selected model and thinking level, when the turn executes, then it launches through the shared adapter — no separate plugin launch path and no environment-variable model pinning remain. _(operationalizes `k2`, `k3`)_
- **ac2:** Given a streaming Vibe chat turn, when output events arrive during the turn, then the transcript renders streaming assistant text, tool activity and completion exactly as before the change. _(operationalizes `k3`)_
- **ac3:** Given an earlier Vibe chat session, when the user resumes it and sends a follow-up, then the resumed turn runs through the shared adapter with the session's context intact. _(operationalizes `k3`)_
- **ac4:** Given the MCP tool naming established once against the installed tool, when the chat surfaces insrc tool activity, then the names the chat parses are exactly the names the backend allowlist uses — one spelling everywhere. _(operationalizes `k3`)_
- **ac5:** Given a prompt with multiline text or text that looks like a command-line option, verified live against the installed tool, when the chat sends it, then the tool receives the complete prompt through its programmatic contract, and the verification outcome is recorded on the ledger. _(operationalizes `k3`, `k7`)_

**Local constraints:**

- `lc2` (stakeholder) The chat's transcript rendering, worker lifecycle and attachment surface keep their existing behavior; only the launch path and tool naming change. [[c10]]

### 6.4 STORY-639cd2159a87aedb-s4 — Vibe configuration files are read with a real TOML parse and edited surgically

**User value:** `size: M`

Users' Vibe configurations stop being corrupted or misread: insrc understands the file as written and touches only its own entry.

**Extends:** [[c11]] [[c6]]

**Acceptance criteria:**

- **ac1:** Given a Vibe configuration holding quoted table names, inline tables, multiline strings or comments, when any config question is answered (does it declare the insrc server, what entries exist), then every reader answers from the same real parse — what the file actually says — not from line or bracket heuristics. _(operationalizes `k4`)_
- **ac2:** Given a configuration holding unrelated servers, settings and comments, when insrc registers its server or removes a legacy entry, then every unrelated server, setting and comment survives byte-for-byte. _(operationalizes `k4`)_
- **ac3:** Given a configuration that cannot be changed safely, when a registration or cleanup write is attempted, then the file is left untouched and the failure is reported with the reason. _(operationalizes `k4`)_
- **ac4:** Given the daemon's registration checks, the cleanup path and the plugin's config writer, when they read or edit a configuration after this Story, then no hand-written Vibe TOML reader remains in production code. _(operationalizes `k4`)_

**Local constraints:**

- `lc3` (convention) The real TOML parser is one already in the project's dependency tree; no new dependency is introduced for this Story. [[c6]]

### 6.5 STORY-639cd2159a87aedb-s5 — The Vibe model family advertises exactly what the new launch path honors

**User value:** `size: M`

Settings tell the truth: what a user picks for Vibe is what runs, and what is offered is what works.

**Depends on:** `s1`

**Extends:** [[c13]]

**Acceptance criteria:**

- **ac1:** Given the shared plain-CLI launch path from s1, when the Vibe model-family records are built, then every advertised model and thinking level is one the launch path actually honors, verified against the installed tool's catalog. _(operationalizes `k3`)_
- **ac2:** Given a user selecting a Vibe model and thinking level in settings, when the daemon runs a tier's work on it, then the selection is delivered through the plain invocation and honored — never silently ignored or substituted. _(operationalizes `k3`, `k6`)_
- **ac3:** Given a selection the launch path cannot honor, when the selection is made, then it fails before dispatch with an error naming the supported models and levels. _(operationalizes `k3`)_

### 6.6 STORY-639cd2159a87aedb-s6 — The Vibe issue ledger reflects reality, with evidence

**User value:** `size: S`

Anyone reading the Vibe integration's records can trust them: what is fixed is closed with proof, what is deferred says so, and nothing describes machinery that no longer exists.

**Depends on:** `s2`, `s3`, `s4`

**Extends:** [[c7]] [[c8]]

**Acceptance criteria:**

- **ac1:** Given the chat prompt-transport record, when its fix is verified live against the installed tool as part of s3, then the record is closed referencing the live verification evidence — or, if the verification fails, reopened with the failure recorded. _(operationalizes `k7`)_
- **ac2:** Given the surviving versioned-model catalog-coverage concern, when the installed catalog is checked against the family records, then any gap between the advertised records and the installed catalog is fixed or recorded, with evidence. _(operationalizes `k7`)_
- **ac3:** Given the two review-dependent records, when the reconciliation completes, then each carries an explicit deferred dependency on the review rewrite instead of an open claim against machinery that no longer exists. _(operationalizes `k5`, `k7`)_
- **ac4:** Given the read-only authorization and TOML-parsing records, implemented by this Epic, when those stories complete, then they close referencing the built evidence and their stories' validation records. _(operationalizes `k7`)_

## 7. References

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `code` `src/shared/vibe-session.ts` — "the session transport consumed by both the backend provider and the plugin chat worker (runVerifiedVibeTurn callers)"
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:354` — "BOUNDED_CLI_ADAPTERS — Vibe sits beside claude/codex in the provider but with a divergent transport"
- **[[c4]]** `prior-artifact` `docs/standalone/unify-vibe-one-plain-cli-execution-E2026112474e8a0cf/SPEC.md` — "SPEC-74e8a0cf59d3f57d — five settled decisions incl. one shared execution adapter and fail-closed read-only authorization"
- **[[c5]]** `prior-artifact` `docs/standalone/vibe-s-read-only-session-cannot-E20261124d3e72fe7/ISSUE.md` — "--enabled-tools does not bypass vibe's separate agent-approval gate; read-only sessions cannot call the insrc analyze tools headlessly"
- **[[c6]]** `prior-artifact` `docs/standalone/read-vibe-configs-real-toml-parser-E202611090b3114f8/ISSUE.md` — "Read Vibe configs with a real TOML parser — three heuristic parsing areas; nine validation rounds hardening a hand-written lexer"
- **[[c7]]** `prior-artifact` `docs/standalone/pass-vibe-chat-prompts-correctly-programmatic-E20261105910fce32/ISSUE.md` — "Pass Vibe chat prompts correctly in programmatic mode — appears already fixed by the explicit prompt binding"
- **[[c8]]** `prior-artifact` `docs/standalone/support-activity-supervised-reviews-through-mistral-E2026110430962d0f/ISSUE.md` — "activity-supervised reviews through the Vibe CLI — predicated on removed review machinery"
- **[[c9]]** `prior-artifact` `docs/standalone/preserve-ollama-routing-claude-streaming-reviews-E20261110738d62b8/ISSUE.md` — "streaming reviews — review portion depends on removed machinery; the versioned-model catalog-coverage sub-point survives"
- **[[c10]]** `code` `vscode-plugin/src/chat/cli-adapter.ts` — "plugin chat vibe mapper: explicit prompt binding, environment-variable model pinning, and an MCP tool-name parser that disagrees with the backend allowlist"
- **[[c11]]** `code` `src/daemon/mcp-register.ts` — "registration checks read the config file with hand-rolled [[-split and name-regex heuristics"
- **[[c12]]** `prior-artifact` `docs/standalone/remove-design-code-review-implementations-while-E20261116dae67bfc/S001/BUILD.md` — "the review-implementation removal — the review machinery the two review-dependent issues cite no longer exists in src/"
- **[[c13]]** `analyze-bundle` `s1` — "live qualification 2026-11-24: headless model-alias selection honored (bogus alias fails fast listing the real catalog); approval policies, custom agents, tool lists, prompt files, budget guards and s"
- **[[c14]]** `convention` `CLAUDE.md` — "No direct cloud REST calls from our process — cloud access through the locally-installed CLI binaries; accuracy is primary"

## 8. Open questions

- Item a2: the low-confidence assumption that a custom policy or agent can authorize exactly the insrc analysis tools without a blanket bypass has no open-question record (the s2 schema carries none); it is carried structurally by constraint k1 and the s2 qualification story — the design stage should confirm the fail-closed gate is the agreed resolution or raise the question explicitly.

## Resolved questions

- `q2ec31c0d` — Item a2: the low-confidence assumption that a custom policy or agent can authorize exactly the insrc analysis tools without a blanket bypass has no open-question record (the s2 schema carries none); it is carried structurally by constraint k1 and the s2 qualification story — the design stage should confirm the fail-closed gate is the agreed resolution or raise the question explicitly.
  - **resolved**: Resolve: the fail-closed qualification gate is the agreed resolution — brainstorm decision 2 (qualify narrow authorization; fail closed) settled that the low-confidence narrow-authorization assumption is never relied on; constraint k1 and story s2 carry it structurally — Settled in the approved brainstorm (SPEC-74e8a0cf59d3f57d decision 2): the unproven narrow-authorization assumption is gated, not relied on — live qualification with fail-closed behavior. Confirmed by the user in chat. _(2026-11-24T12:56:08.607Z)_

## Citations

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `code` `src/shared/vibe-session.ts` — "the session transport consumed by both the backend provider and the plugin chat worker (runVerifiedVibeTurn callers)"
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:354` — "BOUNDED_CLI_ADAPTERS — Vibe sits beside claude/codex in the provider but with a divergent transport"
- **[[c4]]** `prior-artifact` `docs/standalone/unify-vibe-one-plain-cli-execution-E2026112474e8a0cf/SPEC.md` — "SPEC-74e8a0cf59d3f57d — five settled decisions incl. one shared execution adapter and fail-closed read-only authorization"
- **[[c5]]** `prior-artifact` `docs/standalone/vibe-s-read-only-session-cannot-E20261124d3e72fe7/ISSUE.md` — "--enabled-tools does not bypass vibe's separate agent-approval gate; read-only sessions cannot call the insrc analyze tools headlessly"
- **[[c6]]** `prior-artifact` `docs/standalone/read-vibe-configs-real-toml-parser-E202611090b3114f8/ISSUE.md` — "Read Vibe configs with a real TOML parser — three heuristic parsing areas; nine validation rounds hardening a hand-written lexer"
- **[[c7]]** `prior-artifact` `docs/standalone/pass-vibe-chat-prompts-correctly-programmatic-E20261105910fce32/ISSUE.md` — "Pass Vibe chat prompts correctly in programmatic mode — appears already fixed by the explicit prompt binding"
- **[[c8]]** `prior-artifact` `docs/standalone/support-activity-supervised-reviews-through-mistral-E2026110430962d0f/ISSUE.md` — "activity-supervised reviews through the Vibe CLI — predicated on removed review machinery"
- **[[c9]]** `prior-artifact` `docs/standalone/preserve-ollama-routing-claude-streaming-reviews-E20261110738d62b8/ISSUE.md` — "streaming reviews — review portion depends on removed machinery; the versioned-model catalog-coverage sub-point survives"
- **[[c10]]** `code` `vscode-plugin/src/chat/cli-adapter.ts` — "plugin chat vibe mapper: explicit prompt binding, environment-variable model pinning, and an MCP tool-name parser that disagrees with the backend allowlist"
- **[[c11]]** `code` `src/daemon/mcp-register.ts` — "registration checks read the config file with hand-rolled [[-split and name-regex heuristics"
- **[[c12]]** `prior-artifact` `docs/standalone/remove-design-code-review-implementations-while-E20261116dae67bfc/S001/BUILD.md` — "the review-implementation removal — the review machinery the two review-dependent issues cite no longer exists in src/"
- **[[c13]]** `analyze-bundle` `s1` — "live qualification 2026-11-24: headless model-alias selection honored (bogus alias fails fast listing the real catalog); approval policies, custom agents, tool lists, prompt files, budget guards and s"
- **[[c14]]** `convention` `CLAUDE.md` — "No direct cloud REST calls from our process — cloud access through the locally-installed CLI binaries; accuracy is primary"
