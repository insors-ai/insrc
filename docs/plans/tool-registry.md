# One tool registry for git, gh and Jira — decisions and verified facts

Epic: `one-tool-registry-git-gh-jira` (DEF-b7a68147dcf72034, docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/). Spec: SPEC-0b8e02355ad3f578 (docs/standalone/one-tool-registry-git-gh-jira-E202610230b8e0235/SPEC.md), approved 2026-10-23. Triage: epic, route define.

## Decisions (brainstorm, 2026-10-23)

1. The daemon's tool registry is the single layer; the workflow library calls it through the executor. No separate typed library.
2. Cross-cutting rules are executor-level post-execution hooks keyed by tool name; synchronous; a hook failure is non-fatal and reported with the tool result.
3. Coverage is a curated, typed tool per operation family (no per-subcommand mirroring, no raw passthrough, no generation from help text or OpenAPI).
4. Jira: tools wrapping Atlassian's acli only; auth stays with the user's CLI session; no REST, no stored tokens.
5. Full cutover in one change: runGit, commitAndPushArtifacts, the github.ts wrappers and the existing git_* tools; no shims.
6. Each tool declares an output schema; the executor validates; a typed call helper gives workflow code typed results. Where a CLI gives no structured output the cheap model converts the text to the schema; schema validation is the safety net; deterministic parsing stays preferred where the CLI is structured (gh --json, git porcelain, acli JSON).
7. Destructive operations: an approval request over IPC to whichever client is attached, every time; denied if nobody answers within the timeout; no global opt-in.
8. The plugin's own git runner (vscode-plugin) is outside the backend and is a non-goal.

## Facts verified in the code (2026-10-23)

- `executeTool(toolId, input, deps)` (src/daemon/tools/executor.ts:23) is the only function that runs a registry tool; its only production caller is `src/agent/read-only-tool-loop.ts:78`, which also accepts an injectable `args.execute` that bypasses it, and reads `getTool(name)` at line 90.
- The executor computes `needsGate` for `requiresApproval === true` and for a predicate, and on every gated call logs "the gate dispatcher is gone; auto-approving" and runs the tool (executor.ts:41-48). It is not a fallback branch.
- `registerExternalGate` appears only in a comment (executor.ts:10); no approval exchange over IPC exists, so the Epic builds it.
- `git_push` and `git_reset` declare `requiresApproval: true` for every call (push.ts:45, reset.ts:41), not only force or hard; the DESTRUCTIVE and PROTECTED REF text is only in the approval title. Marking which operations are destructive is new work.
- Tool ids are mixed: `git_*` and `gh_*`, plus `git:cherry-pick` and `gh:project:*`.
- `ToolResult` (src/daemon/tools/types.ts:33) is `{ output, format, success, error?, data?: unknown }`; there is a second `ToolResult` at src/shared/types.ts:46.
- Direct git and gh call sites in the backend: 22 production `runGit` calls in 6 files under src/workflow/team; 5 `commitAndPushArtifacts` callers (src/workflow/questions.ts:470, src/workflow/resolve-comment.ts:218, src/workflow/team/signoff.ts:385, src/cli/services/workflow.ts:139 and :174); the github.ts wrappers are imported by src/workflow/bugfix/tracker.ts, src/workflow/config/github.ts and src/workflow/tracker-auto.ts.

## Open

- Which values the cheap-model conversion cross-checks against the raw CLI text, and what happens when its retries run out.
- Which gh operations are text-only (for example `gh pr diff`, `gh run view --log`) and need the conversion path.
- The team-signoff Epic's s9 Story (tracker refresh after a pull or push) is parked on this Epic and is updated after it is done.

## acli probe (2026-10-23, acli 1.3.39-stable, signed in via OAuth to insors.atlassian.net)

- Top level: `admin auth confluence guard jira rovodev config`. `acli jira`: `auth board dashboard field filter project sprint workitem`.
- `workitem`: archive, assign, attachment, clone, comment (create, delete, list, update, visibility), create, create-bulk, delete, edit, link, list-watchers, search, transition, unarchive, view, watcher.
- `transition --key K1,K2 | --jql | --filter --status "<name>" [--yes] [--json] [--ignore-errors]`: the target is a status name, not a transition id.
- `assign --key | --jql | --filter | --from-file --assignee <email|accountId|@me|default> | --remove-assignee [--yes] [--json]`.
- `view KEY [--json] [--fields ...]`; `search --jql ... [--limit N | --paginate | --count] [--json | --csv]`; `project list|view|create|update|archive|restore|delete`.
- `--json` exists on view, search, transition, assign and `project list` (a JSON array of REST-shaped objects with `key`); comment commands not probed yet.
- Mutating commands prompt unless `--yes` is passed, so tool calls must always pass it.
- Some reads refuse to run unbounded: `project list` needs one of `--recent|--limit|--paginate`; `workitem search` rejects a JQL with no restriction ("Unbounded JQL queries are not allowed").
- Failure modes (all exit 1 except missing install):
  - not installed: shell exit 127, "command not found" (detect with a PATH lookup, not by output);
  - signed out: `acli jira auth status` prints "unauthorized: use 'acli jira auth login' to authenticate", exit 1; other commands only say e.g. "failed to list projects", exit 1, so sign-in must be checked with `auth status` first, not inferred from the failing command;
  - bad key or no permission: "Issue does not exist or you do not have permission to see it.", exit 1 (not told apart from each other).
- Errors are plain text on the output, not JSON, even with `--json`; so error classification is by text and exit code, and the conversion path is needed there.
- Not probed: comment create/list JSON, `workitem create --json`, link and watcher output.

## HLD review round 1 facts (2026-10-23)

- Approval-flagged builtins today: git has `requiresApproval: true` on amend, checkout, cherry-pick, commit, merge, pull, push, rebase, reset, revert and stage, and an input-dependent predicate on branch, remote, stash, tag and worktree; it is false on blame, diff, fetch, log, show and status. gh has true on 27 operations (actions 3, issue 5, project 4, pr 7, release 4, repo 4). Other families (file, cloud, k8s, ...) carry the flag too. So once the gate is real, commit, stage and pull would also ask until the family Stories narrow the marker.
- Production files that import src/workflow/tracker/github.ts: 11 (src/cli/services/workflow.ts, src/workflow/bugfix/tracker.ts, src/workflow/config/github.ts, src/workflow/questions.ts, src/workflow/resolve-comment.ts, src/workflow/team/signoff.ts, src/workflow/tracker-auto.ts, src/workflow/tracker/attach.ts, src/workflow/tracker/github-adapter.ts, src/workflow/tracker/setup.ts, src/workflow/tracker/sync.ts); the file has 45 exports, about 30 of them shell-out wrappers. With the runGit users under src/workflow/team (anchor-finder, handoff, policy-reader, policy-refresh, sighting-store, signoff, and git.ts itself) the cutover touches about 17 production files, plus tests (31 test files import a github.js module).
- About 110 builtins have no output schema; `ToolResult.output` is a string, so `outputSchema` has to be optional.

## Direct git / gh spawn inventory (2026-10-23, HLD review round 2)

Found by a source search of src (tests excluded, src/daemon/tools excluded) for git, gh or acli as a spawn target in any form (first argument, first array element, or a wrapper's first argument). Counts are sites per file. This replaces the earlier "about 17 files" figure; the s7 LLD rebuilds it again with the build check itself, because a text search misses indirect forms.

Spawn the CLI directly (17 files):
- src/workflow/tracker/github.ts (21; the gh and git wrappers, commitAndPushArtifacts)
- src/cli/services/maintenance.ts (17; the daemon self-update and repo sync)
- src/workflow/runners/build/story-commits.ts (3), range-base.ts (3), standalone-record.ts (1)
- src/daemon/steps/build-step/validation-checks.ts (3)
- src/understanding/identity.ts (4; git config user.email, gh identity)
- src/workflow/team/git.ts (1; runGit), src/workflow/team/git-async.ts (1)
- src/workflow/tracker/attach.ts (1; its own git helper), src/workflow/gates.ts (1), src/workflow/convert/plan.ts (1), src/workflow/artifacts/companion/header.ts (1), src/daemon/installed-commit.ts (1)
- src/design/corpus/sources/git-reader.ts (1; a hardened bounded reader with its own environment and limits)
- src/indexer/index.ts (line 91) and src/analyze/context/repo-ignore-filter.ts (line 112; git ls-files for ignore handling)

Call a wrapper (15 more files): runGit users anchor-finder.ts, handoff.ts, policy-reader.ts, policy-refresh.ts, sighting-store.ts, signoff.ts (all under src/workflow/team); importers of tracker/github.ts: src/cli/services/workflow.ts, src/workflow/bugfix/tracker.ts, src/workflow/config/github.ts, src/workflow/questions.ts, src/workflow/resolve-comment.ts, src/workflow/tracker-auto.ts, src/workflow/tracker/github-adapter.ts, src/workflow/tracker/setup.ts, src/workflow/tracker/sync.ts.

Total: about 32 production files, plus 31 test files that import a github.js module.

Open scope question for s7 (the Epic says "the workflow library, the daemon and the terminal client's approval service" for the move, and "the backend" for the build check): the indexer, the design corpus reader, the analyze ignore filter, the understanding identity and the daemon self-update (installed-commit, maintenance) are independent subsystems that read git for their own purposes. Either they move onto the registry too, or the check carries a named allowlist with a reason per entry.

## Decisions after HLD review round 2 (2026-10-23)

1. Scope of the cutover (s7): every direct git, gh and acli spawn in the backend moves onto the registry, with no allowlist. The indexer, the design corpus reader, the analyze ignore filter, the understanding identity lookup, installed-commit and the maintenance self-update are included. Inventory above (about 32 production files).
2. Approval has two classes. Common operations (tools that declare requiresApproval today and are not destructive: commit, stage, pull and the like) follow one global approval setting. Destructive operations ask every time and no setting can skip that. The global setting's default is the s3 LLD's to settle; the HLD proposes `auto` for common operations so existing behaviour holds (they run today as approved) and `ask` is an opt-in, which keeps unattended workflows running. This reads DEF s3 ac6 ("a tool that declares it needs approval asks") as "asks when the setting is ask"; confirm at approval.
3. The typed helper takes the tool definition object (callers import it), not a string id, so the result type follows from the definition.

## HLD review round 3 findings (2026-10-23): carry into the Story LLDs

Round 3 returned `block` with 0 HIGH and 7 MED after rounds 1 (5 MED) and 2 (1 HIGH, 2 MED). All seven are real and are design detail for the Story LLDs, or DEF amendments:

1. DEF amendment, s2: DEF S002:FR001/FR004 say a tool without a declared result shape cannot be registered and every tool declares one; the HLD keeps `outputSchema` optional because about 110 builtins return a string `output` and have none. Either amend FR001/FR004, or s2 designs registration to reject a tool with no schema (which means adding a schema to every builtin in this Epic).
2. s3 / sc4: `ApprovalRequest` must carry the repository (repoPath from ToolDeps) and the exact arguments, as DEF S003:FR001 requires, not only a free-text summary.
3. s3: `Tool.destructive?: boolean` already exists in src/daemon/tools/types.ts:127-128 and 8 builtins set it (az/vm.ts:238, k8s/index.ts:340, aws/s3.ts:210, gcp/compute.ts:247, aws/cloudformation.ts:235, gcp/run.ts:212, gcp/storage.ts:189, aws/ec2.ts:255); types.ts:83-145 also has ToolApprovalGate / buildApprovalGate. s3 maps `destructive: true` to the destructive class (or retires the field) and states how buildApprovalGate relates to ApprovalRequest.
4. s1/s2: `executeTool(toolId, input, deps)` takes no caller identity and `ToolDeps` (types.ts:50-81) has no caller field; sc1's `caller` needs a carrier, for example `ToolDeps.caller`, set by each path.
5. s2/s7: sc5's new failure kinds (`timed-out`, `conversion-failed`, `schema-mismatch`, `denied`) need a stated mapping onto the tracker port's `PortFailureKind` (`missing-tool | missing-signin | unreachable | rejected`, src/workflow/tracker/port.ts:23; github.ts:76 maps a timeout to `unreachable`; unit-issue.test.ts:390 iterates the four kinds), or the port type is widened and its consumers updated.
6. s3/s7: src/cli/services/maintenance.ts runs in the terminal client process, never starts the daemon, and does git checkout/merge/remote set-url when the daemon may be down; cli/services/workflow.ts calls commitAndPushArtifacts. Which process runs the executor for CLI-process callers, and what the approval gate does when no daemon is running (a destructive call would always be `no-client`), must be decided; the self-update path is the hard case.
7. s7: DEF S007:FR001 requires a registry-path test per replaced call site; the HLD says only that the existing stage tests are the check. Add to s7 that every inventoried site, including the indexer, the ignore filter and the identity lookup, gets a test through the registry or the typed helper with a recorded executor.

## Decision: output schemas are required only for tools that code calls (2026-10-23)

Resolves HLD review round 3 finding 1. A tool that workflow or daemon code calls must declare an output schema; `callTool` accepts only a tool definition that has one (a compile-time guard), so using an unschematized tool from code is a type error. A tool used only by agents needs no schema: the agent reads the text `output`, and the executor skips the check. A tool that later gets used from code gets its schema then. The roughly 110 builtins outside the git, gh and Jira families (file, cloud, k8s and so on) are not touched by this Epic.

DEF wording to amend (S002:FR001 and FR004): "Every tool that workflow or daemon code calls declares the shape of its result, and the executor checks each result against it" in place of "A tool without a declared result shape cannot be registered" and "Every tool declares the shape of its result". k2 is unchanged for any tool that declares a schema.

Still open from round 3: findings 2 to 7, and the s3 ac6 reading.

## Decisions on HLD review round 3 finding 6 (2026-10-23)

- The daemon self-update (src/cli/services/maintenance.ts, and the installed-commit check it relies on) is not a code sync for registered repos. It stays outside the registry. This is the one named exemption to "no allowlist"; the s7 build check lists it explicitly with this reason. Every other spawn moves.
- CLI-process callers (src/cli/services/workflow.ts and any other terminal-client code that runs git or gh on a registered repo) send the call to the daemon over IPC through a new tool-call request. The daemon runs the one executor, so hooks, the approval gate and the schema check are the same for every caller, and the attached TUI answers approval requests as a client. If the daemon is down the call fails with a clear message; these paths already need the daemon for workflow runs. The IPC method's shape and its `caller` value (see finding 4) are s3 and s7 design.

## Decision: the common approval class follows the chat "edits" mode (2026-10-23)

Supersedes the "global approval setting" and its `CommonApprovalMode` (auto | ask) in the HLD and in decision 2 above. There is no separate flag. The common class follows the chat's existing "edits" selector, which is per chat session and lives in the plugin (vscode-plugin/src/chat/chat-panel.ts, `PermissionMode`): Manual, Edit Automatically, Auto (the CLI adapter maps them to `--permission-prompts host`, `--permission-mode acceptEdits` and `--permission-mode bypassPermissions`, vscode-plugin/src/chat/cli-adapter.ts:531-533). Consequences to design in s3:
- The mode is a property of the calling chat session, not of the daemon, so a tool call from a chat must carry it (the same carrier as the caller identity, finding 4, for example `ToolDeps`), and the executor reads it from there.
- Reading (corrected by the user): a common call asks in Manual and in Edit Automatically, and runs without asking only in Auto (Edit Automatically covers file edits, not git, gh or Jira operations). A destructive call asks in every mode, Auto included (k5: no setting can skip it).
- Open: callers with no chat session (workflow stages, daemon code, the TUI) have no mode. Proposed: treat their common calls as not asking, as today, and ask for destructive calls through whichever client is attached.

## Decision: global flag as the default, the chat edits mode overrides it (2026-10-23)

Supersedes the previous section's "no separate flag". There is a global approval flag in the daemon's config, using the same three values as the chat selector (`manual`, `edit-auto`, `auto`). It is the default for the common class. When a call comes from a chat session, that session's edits mode overrides it for that call. The effective mode then decides: a common call asks in `manual` and `edit-auto`, and does not ask in `auto`. A destructive call asks in every mode, `auto` included (k5), and neither the flag nor the chat mode can skip it. Callers with no chat session (workflow stages, daemon code, the TUI) use the flag. Default for the flag: `auto` (confirmed by the user), which is how those tools behave today, so unattended workflows keep running. s3 designs the config key, the carrier that brings the chat mode with the call, and the mapping of the flag's value to the effective mode.

## Decision: existing `destructive: true` builtins map to the destructive class (2026-10-23)

Resolves HLD review round 3 finding 3. s3 maps the 8 builtins that set `destructive: true` today (az/vm.ts, k8s/index.ts, aws/s3.ts, gcp/compute.ts, aws/cloudformation.ts, gcp/run.ts, gcp/storage.ts, aws/ec2.ts) to the destructive class, so they ask every time, whatever the flag or chat mode. The old `Tool.destructive` field is retired in favour of the single approval field (or kept as an alias that s3 maps, its choice); s3 also states how the existing `buildApprovalGate` relates to the new approval request.

## s2 LLD review (2026-10-23): three rounds, state

LLD-b7a68147dcf72034-s2 (docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S002/LLD.md). Round 1: 1 HIGH, 4 MED. Round 2: 1 MED (incomplete ToolDeps builder inventory, fixed). Round 3: 2 MED, 0 HIGH, still open:
1. sc2 and sc3 refinements (typebox TSchema instead of JsonSchema plus a phantom type; callTool over TypedTool with a typed input; convertText takes a deps parameter) differ from the HLD sketches and no amendment is filed; only sc5 amendments exist (AMD-b7a68147dcf72034-1, -2, -3, all draft; -1 is superseded and -2 is a duplicate of -3). One amendment proposal is allowed per design.story step run (s4 and s5 can each carry one), so sc2 and sc3 need their own proposals in a new run.
2. convertText must call `LLMProvider.completeStructured` with `internalRetry: false` and `maxAttempts: 1` (src/shared/types.ts:290-291, 322-325), pass a signal that combines the per-attempt deadline and `deps.signal`, and use withStructuredRetry as the only retry loop; otherwise each "attempt" hides up to three provider attempts and breaks "at most two attempts per tier". Add a unit test that the fake provider sees exactly 2 + 2 calls.

## s2: requirements the PLAN and BUILD must carry (captured at LLD approval with override, 2026-10-23)

These two review round 3 findings are not in the s2 LLD text. They bind the s2 plan and build, and the build's code review checks them.

R1. Conversion retries (finding 2). `convertText` calls `LLMProvider.completeStructured` with `internalRetry: false` and `maxAttempts: 1` (src/shared/types.ts:290-291, 322-325). It passes a signal that combines the per-attempt deadline and `deps.signal`, and `withStructuredRetry` is the only retry loop. So "at most two attempts per tier" is exact: the cheap role gets 2 provider calls, the escalation role 2 more, 4 in all. A unit test with a fake provider asserts exactly 2 + 2 calls when every attempt fails, and exactly 1 call on first-attempt success.

R2. sc2 and sc3 refinements (finding 1). The LLD refines two HLD sketches, and consumers s4 to s7 must read the refined shapes, not the HLD sketches:
- sc2: `outputSchema` is a typebox `TSchema` (no `JsonSchema` plus phantom type); `TypedTool = Tool & { inputSchema: TSchema; outputSchema: TSchema }`; `callTool<T extends TypedTool>(tool: T, input: Static<T['inputSchema']>, deps: ToolDeps): Promise<TypedToolResult<Static<T['outputSchema']>>>`.
- sc3: `convertText<S extends TSchema>(req: ConversionRequest<S>, deps: ToolDeps): Promise<ConversionResult<Static<S>>>`; `keyValues` is required; `deps` supplies `repoPath`, `signal` and the new optional `conversion`.
The HLD amendments for these two contracts are filed in the s3 design run (a step can carry one proposal each), and are approved before the s4 LLD is written. Until then this section is the authority.

Amendment housekeeping: AMD-b7a68147dcf72034-1 (superseded) and -2 (duplicate of -3) are rejected; -3 is approved with the s3 amendments.

## s3 LLD review (2026-10-23): six rounds, approved with override

LLD-b7a68147dcf72034-s3 (docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S003/LLD.md). Cycle 1: 6 MED, then 1 HIGH + 3 MED, then 4 MED. Cycle 2: 2 MED, 1 MED, 2 MED. Every finding but the DEF ac6 one was fixed in the LLD (the last round's retire-`permissions.mode` test and fixture sites were added after the override decision).

Decisions the LLD carries: broker plus `approval.subscribe` / `approval.answer` (alternative a1); 300 second wait; `Tool.approval` replaces `requiresApproval` and `destructive` (true to common, predicate to per-input, false or absent to none); flag `tools.commonApproval` in the on-disk config catalog (default auto); `permissions.mode` retired, not migrated; `caller` and `approvalMode` fields of the tool-call IPC belong to sc4 and s7 builds the method against them; an aborted approval is denied with reason `cancelled`; the streaming method on `IpcClient` is optional.

Binding on the s3 plan and build:
- AMD-b7a68147dcf72034-4 (sc4), -5 (sc5 `cancelled`), -6 (sc2) and -7 (sc3) are approved before the s3 and s2 plans.
- DEF s3 ac6 is read as: a tool that needs approval asks when the effective mode is manual or edit-auto, and a destructive tool always asks; under the default auto a common tool runs without asking. The amendment tool is HLD-only, so this note is the record. The s3 build's code review checks the design against this reading.
- s7 builds the tool-call IPC with `caller` and optional `approvalMode`.

## s2 BUILD approved (2026-10-23): code review warn, follow-ups

s2 built t1 to t8 (commits tagged `Insrc-Story: b7a68147dcf72034/s2`); BUILD approved on a degraded-grounding code review: warn, 0 HIGH, 3 MED, 6 LOW (docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S002/CR.md). Full sweep: no new failures (the failures seen also fail on the pre-s2 baseline, except two LMDB lock tests in `db` that were not re-run on it).

Follow-ups, not yet done:
- MED, **before s7**: `callTool` must check that the registered tool under `tool.id` is the definition passed (same object or same `outputSchema`) and fail `rejected` otherwise; today unchecked data can reach the caller with a trusted type.
- MED: `convertText`'s deadline path should wait (hard cap) for the aborted provider call to settle before retrying or releasing the queue slot, or state that providers must honour the signal.
- MED: the live test 'a deliberately altered output fails the cross-check' alters nothing; add a truly altered and a truncated output case.
- LOW: `| undefined` on `Tool.outputSchema` and `TierOutcome.stop`; `convertText` returns only `retries-exhausted` (the LLD contradicts itself on returning `shape-mismatch` / `value-not-in-text`); input check runs after the approval gate (s3 should run it first); a queued conversion notices cancellation only after getting the slot; `callTool` duplicates the executor's no-data failure.
- Added beyond the plan: two `insrc.models.tasks.tools.convert*` settings in vscode-plugin/package.json (a taxonomy test requires one per role).

## s3 built (2026-10-24): what s7 and later Stories build against

s3 t1 to t10 are built and gated; t11 adds the docs and the matrix test. The facts the next Stories rely on:

- **The question is held by the daemon.** `src/daemon/approval.ts` owns the one `ApprovalBroker`; `executeTool` reaches it through `getApprovalGate()`. A caller cannot pass a gate. `src/daemon/tools/approval-policy.ts` is the pure rule (`resolveApprovalClass`, `shouldAsk`, `buildApprovalRequest`).
- **`Tool.approval`** replaced `requiresApproval` and `destructive` on all 228 builtins. s4, s5 and s6 mark an operation destructive by returning `'destructive'` from the tool's `approval` (a class or a function of the input). The mapping test `approval-class-mapping.test.ts` compares every tool of the pre-rewrite snapshot (`__tests__/fixtures/approval-snapshot.json`) and does not fail for new tools.
- **s7 builds the tool-call IPC** (CLI-process and chat callers reach the executor through the daemon). Its request MUST carry `caller` (`'agent' | 'daemon' | 'workflow'`) and an optional `approvalMode` (`'manual' | 'edit-auto' | 'auto'`), and the daemon must set `deps.caller` and `deps.approvalMode` from them. A chat sends its session's `PermissionMode` as `approvalMode` on each call. Neither field may be read for the destructive class; the matrix test pins this.
- **ToolDeps builders:** `src/analyze/context/driver.ts` and `src/agent/providers/ollama.ts` set `caller: 'agent'`. `src/workflow/code-review/grounding.ts` and `src/workflow/runners/build/changed-files.ts` call `git_diff`'s `execute` directly, so no approval step runs for them; s7 moves them onto the typed helper, which goes through the executor.
- **IPC:** `approval.subscribe` (stream, `gate` frames) and `approval.answer` (RPC) are registered in `src/daemon/index.ts`; `IpcClient.stream` is optional so test doubles compile.
- **Open follow-ups from the work:** the editor cannot dismiss a shown toast (a cancel closes it only logically); the JetBrains client has no approval prompt yet, so a JetBrains-only session denies destructive calls as `no-client`; three tests in `src/config/__tests__/acceptance-mapping-audit.test.ts` and two in `vscode-plugin/src/config/__tests__/manifest-catalog.test.ts` (keys missing from the plugin manifest: daemonUpdate.*, analyzer.dataSourceListingTimeoutMs, review.chunkTokens) failed before this Story and still do.

## s3 BUILD approved (2026-10-24)

Code review: round 1 warn (0 HIGH / 20 MED / 9 LOW, degraded); fixes in de209395 (secret masking and truncation in the displayed arguments, a matching requestId required before a tool runs, request-building failure denies the call, late answers after the 300 s expiry not accepted, prompt restored when an answer cannot be sent, a "no longer open" notice, the editor's Show details, one shared reconnect stream in `src/shared/approval-stream.ts`). Round 2 block (7 HIGH / 27 MED / 3 LOW) was reviewer evidence gaps ("the supplied evidence does not show ..."), not defects; coverage and quality had 0 findings. The 3 LOW `| undefined` items were fixed in 7652ad702. BUILD approved with an override reason on the user's yes. Not done: a toast cannot be dismissed in VS Code (documented), no JetBrains prompt.

## s1 LLD approved (2026-10-24)

LLD-b7a68147dcf72034-s1 (docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S001/LLD.md): review round 1 block (4 HIGH: alias keys, shallow freeze, unguarded failure text, signal claim), all fixed in revision 2; round 2 warn (0 blocking). Approved by the user.

Accepted refinements of sc1 (no amendment; the amendment tool is HLD-only): `ToolHookContext.caller` may be `undefined` (s3 made `ToolDeps.caller` optional); `ToolResultHookReport` is merged into `ToolResult` as the optional `hookFailures`; `TypedToolResult`'s success variant gains the same optional field (additive on s2's type); `runToolHooks(tool, input, result, deps)` is the executor-internal run point. Binding on the s1 plan and build: hooks are keyed by the canonical `tool.id`; each hook gets its own `structuredClone` of input and result; failure text is built inside its own guard; the hook stage has no cancellation bound.

## s1 built and approved (2026-10-24): what s7 builds against

s1 t1 to t5 built and gated; code review pass (0 findings, full grounding); BUILD approved. Facts for s7 and later Stories:

- **`registerToolHook({ id, toolId, run })`** (`src/daemon/tools/hooks.ts`, exported from `src/daemon/tools/index.ts`) registers a rule under the tool's canonical id; call it from daemon start-up. It throws on a duplicate (`toolId` + `id`), an empty id, or an alias of an already registered tool. A tool registered later is fine.
- **The rule's context** is `{ toolId, input, result, caller }`: per-rule `structuredClone` copies, `caller` can be `undefined`, no signal. A rule fails by throwing or rejecting.
- **The report:** a failed rule leaves the call a success and adds `hookFailures` to the result, plus one `[hook failed] <id>: <message>` line at the end of `output`. `callTool` carries `hookFailures` on the success variant. No rule runs for a failed, denied, rejected or schema-mismatch call.
- **No cancellation bound** on the stage; a rule that never settles holds the call.
- `registerToolHook` is not yet called anywhere in production; s7 registers the tracker-status refresh and similar rules.
- **Sweep:** s1 introduced no failures. 18 workflow tests and the daemon `build-start` T33 test started failing at `86fb49d2b` (the `fix(workflow)` build-bound code-review commits, outside this Story); the pre-existing failures are unchanged.

## s4 split (2026-10-24)

After nine review rounds the s4 LLD was split on the user's decision. s4 keeps the 22 existing git tools (typed outputs, per-input approval classes, typed failures, legacy compatibility) and the new tools s7 needs (reads, `git_fetch_refs`, `git_symbolic_ref`, a byte-safe `git_cat_file`, `runShellBytes`). The long tail of git (93 of the 169 commands of git 2.53.0) is Story **s8** ("Reach the rest of git through named, typed tools"), appended through the define extend path: DEF revision 2 (approved with an override for 36 MED evidence gaps, 2026-10-24 16:02 UTC), HLD amendment AMD-b7a68147dcf72034-8 (approved). s8 depends on s2, s3 and s4 (not recordable in the extend path; this note is the record) and owns the stdin-consuming commands, the destructive classes of its modes and the full coverage table.

Accepted by the user: DEF s4 ac1 ("an operation that git supports") is met by s4 and s8 together; the exclusions are commands that need a person or a GUI, mail, a server or transport role, credential helpers, and internal helpers. Still to confirm at s8: excluding commands that run an arbitrary command (for-each-repo, hook, filter-branch) as raw passthrough. Accepted behaviour changes: inputs a tool's schema forbids are now rejected (git_log limit, git_diff maxBytes and context, git_fetch depth); a failed git_show diff read is a failure.

## s4 LLD approved (2026-10-24)

LLD-b7a68147dcf72034-s4 revision 12, approved by the user with an override after 12 review rounds in 4 cycles (last round 0 HIGH, 3 MED, fixed and not re-reviewed). Scope: the 22 existing git tools (typebox input and output schemas, per-input approval classes with destructive push deletes and forced refspecs, hard reset, branch and tag delete, stash drop and clear, forced worktree remove, checkout of a path), typed failures (`failureKind`, `withFailure`, a `ShellResult`-based `fail`, a registration wrapper), precondition and secondary-lookup rules, and twelve new tools (reads plus `git_fetch_refs`, `git_symbolic_ref` get|set|delete, a byte-safe batch `git_cat_file`) on a new `runShellBytes` with stdin, isolation and independent stdout and stderr limits. Everything else of git is Story s8. s7 handoff for this family: `git-reader.ts` and its tests (git_cat_file), `policy-refresh.ts` and `maintenance.ts` (git_fetch_refs, git_symbolic_ref set), `range-base.ts` and `anchor-finder.ts` (git_path_history).

Binding on the s4 plan and build: schemas are not tightened (the snapshot of 228 ids and input schemas must match); inputs a schema forbids are rejected (git_log limit, git_diff maxBytes and context, git_fetch depth, malformed git_diff exclude and paths, empty git_stage paths); a failed git_show diff is a failure; precondition reads fail the call before any change; secondary lookups keep their placeholders and add `data.warnings`; the build's audit test enumerates every `runShell` and helper result.

## s4 build decision: failure text is not a compatibility surface (2026-10-25)

During s4 t1 the validation gate failed the check "legacy output and error text of each failing call is unchanged" four times. The user decided that MCP and agent callers do not depend on the wording of `output` or `error`, so the wording of a failure may change; what must stay compatible is the tool ids, the input schemas (DEF s4 ac4, the 228-tool snapshot) and the `success`/`error` fields being set. Consequences for the rest of s4:

- t1 stands as built (commits f8a673679 to 15aecaefc). The six calls whose text changed on purpose (`git_commit` and `git_push` when a precondition read, the current branch or the staged count, cannot run) are listed in `git-failures.test.ts` and keep their new text, as LLD 3.5 requires.
- The gate is expected to keep flagging t1 on that acceptance line and on the test-only time-limit scale in `src/daemon/tools/shell-helper.ts`; both are accepted. t5 and t9 need not preserve failure wording beyond what the LLD states.
- No production code in the repository reads the text of these tools' failures; s7 moves the callers.

## s4 t9: the fixes of the last review round, each with its implementation and its test (2026-10-25)

Cycle 4, round 3 and the fixes of the earlier unreviewed rounds were checked one by one. Each has code and a test; one gap was found and filled.

| Fix | Implemented in | Pinned by |
| --- | --- | --- |
| `noMerged` (and `merged`, `contains`, `pointsAt`) on `git_for_each_ref` | `for-each-ref.ts` (`--no-merged`) | `git-tools-integration.test.ts`: "git_for_each_ref contains, merged, pointsAt and noMerged select the right refs"; `git-failures.test.ts`: the t9 test ("... and git_for_each_ref noMerged") |
| The amend helper read (`wasPushed`): no upstream and "not an ancestor" are answers, a read that did not run is not | `amend.ts`, `helpers.ts` (`ranToExit`) | `git-failures.test.ts`: "git_amend wasPushed, git_reset willNeedForcePush and git_merge listConflicts keep their expected non-zero answers ..." and the t9 test |
| The reset helper read (`willNeedForcePush`): exit 0 true, exit 1 false, anything else stops the call | `reset.ts` | the same two tests |
| The merge helper read (`listConflicts`): a read that did not run is named in the failure | `merge.ts` | the same two tests |
| Independent `stdoutLimit` and `stderrLimit` on `runShellBytes`, `stderrOverflow` | `shell-helper.ts` | `shell-helper-bytes.test.ts`: "independently lowered stdout and stderr limits behave as the corpus reader's limits do ..."; `git-tools-integration.test.ts`: the `git_cat_file` diagnostics test |
| `git_merge_base` returns `bases` (all, none for unrelated histories) | `merge-base.ts` | `git-tools-integration.test.ts`: "git_merge_base answers all, unrelated and isAncestor cases ..." |
| `git_fetch` depth below 1 is refused | `fetch.ts` (schema `minimum: 1`) | `git-tools-integration.test.ts`: "git_fetch depth 0 and 0.5 are rejected ..." |
| The commit numstat read is an inventoried secondary read | `commit.ts` (`collectCommitData`) | `git-failures.test.ts`: "a failing git_commit numstat read after a successful commit is a success with a warning" and the inventory test |
| The coverage test has three owners | `coverage.ts` | `git-coverage.test.ts` |
| The `git_reset` and `git_push` lookups are in the inventory, and a grep test enforces it | `reset.ts`, `push.ts`; `git-failures.test.ts` (`INVENTORY`, `KNOWN`, `HELPERS`, `scanSources`) | the inventory test, and the audit in "a failing precondition read fails the call before any change ...", whose planted sources show that an unlisted lookup, an unchecked result, a swallowing helper and a typed-helper call each fail the scan |

Gap found and filled: the LLD uses the current-branch read as a precondition of `git_rebase`, `git_checkout` and `git:cherry-pick` as well as of `git_commit` and `git_push`, but only the last two stopped on a failed read. `git_rebase`, `git_checkout` and `git:cherry-pick` now read the branch before changing anything and stop when it cannot be read (their input checks still come first); the branch label of their result stays a warning. Pinned by "git_commit, git_push, git_rebase and git_checkout fail before changing anything ...".

## s4 full sweep (2026-10-25)

Run once after t9, in foreground chunks, `npx tsx --test --test-force-exit` per directory of `src` and `vscode-plugin/src`. Compared with the sweep after s1, by test name.

| Directory | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- |
| shared | 67 | 67 | 0 | 0 |
| db | 575 | 574 | 1 | 0 |
| mcp | 118 | 118 | 0 | 0 |
| design | 58 | 58 | 0 | 0 |
| docgen | 115 | 112 | 0 | 3 |
| indexer | 301 | 301 | 0 | 0 |
| understanding | 17 | 17 | 0 | 0 |
| agent | 110 | 99 | 0 | 11 |
| config | 151 | 148 | 3 | 0 |
| analyze | 1167 | 1072 | 0 | 92 |
| cli | 225 | 225 | 0 | 0 |
| daemon | 1387 | 1368 | 1 | 18 |
| workflow | 2293 | 2265 | 22 | 6 |
| vscode-plugin | 1446 | 1434 | 4 | 8 |

Every failure of the s1 sweep is still there and none of them is in a file this Story touched: the LMDB lock and library reproduction tests (db); the config acceptance-mapping tests (config); `build-start` T33 (daemon); the plugin catalog and ledger tests (vscode-plugin); `convert-repeat`, the T7 and ac1 to ac6 BUILD code-review gate tests and the `t7` hand-filled records (workflow), from the `fix(workflow)` commits before this Story.

One failure is new since the s1 sweep: `src/workflow/__tests__/artifact-write-inventory.test.ts`, "every writer file is inventoried, annotated and classified as the design says". It names `src/bin/insrc-shutdown-watchdog.ts`, `src/daemon/run-file-ownership.ts` and `src/shared/daemon-run-files.ts` (no inventory entry) and `src/daemon/lifecycle.ts` (an entry that no longer matches). Those files come from the daemon-shutdown commits made on this branch while s4 was being built (`e5468d372`, `873e425dd`, `a61dd8d11`, `77595a1ec`), not from this Story, whose commits touch only `src/daemon/tools/**`, one fixture and the docs. It needs entries in `src/workflow/artifact-write-inventory.ts` by whoever owns the shutdown work.

s4 added and changed no failing test: the git, tools, executor and approval suites all pass (git tools `__tests__`: 54 tests, daemon tools `__tests__`: 98 tests, none failing).

## s4 outcome (2026-10-25)

- **Merge:** `origin/main` was merged into `v2` (`ba438d1b3`): the daemon-threads Epic (handler tables in `handler-runtime.ts`, `IpcServer(forward, …)`, workers, shared step-state store) with v2's run-file ownership, approval IPC, team park/settle and repo conversion. The decisions are in `docs/plans/main-merge-conflicts.md`. The workflow step state now lives in the shared store with its `RunEntryMeta` beside the payload; `saveState` and `replaceState` are async and `listStates` reads the main thread's entries only.
- **Sweep after the merge:** the failures that remain are the s4 baseline ones (LMDB lock and library reproduction, the BUILD code-review gate tests T7 and ac1 to ac6, `convert-repeat`, `t7` hand-filled records, `artifact-write-inventory`) and `call-limits`, which reads the user's own `~/.insrc/config.json` (`designReview.timeLimitMs.issue` 240000 is below the 300000 it needs).
- **Worker threads on Node 24:** `search-guard` and `search-filter` crashed the spawned daemon (`free(): invalid size`, SIGABRT) during indexing. Cause: `node_modules` held `@lancedb/lancedb` 0.27.2 while `package.json` (raised by main) asks for 0.40.0; LanceDB 0.27.2 corrupts the heap inside a worker thread. After `npm install` both suites pass with worker threads on. The earlier note that the crash also happens on `origin/main` was a check against the same stale install. Reinstall after any `package.json` change. Running the daemon from source under Node 22 cannot load its workers (`Cannot find module .../src/config/store.js`); the compiled `out/` build is not affected as far as tested.
- **Code review:** daemon (codex) round 1: block, 2 HIGH, 58 MED, 25 LOW. One real finding, fixed in `dce5addca`: `git_push` refused only force flags on a protected ref, not `:main` or `+main` by refspec. Round 2: block, 4 HIGH, 59 MED, 25 LOW, all HIGH of the form "the supplied evidence shows no implementation" of behavior present in the code and tests. Cause recorded as `ISSUE-47e2b81827433589` (the adherence and functional-coverage judges get symbol summaries only).
- **BUILD approved** on 2026-10-25 with an override reason (user decision), recorded on the code-review entry.

## s5 decisions (2026-10-25, the user, in chat)

- **gh exclusions accepted (ac1).** Left out of the gh tools because they need a person, a browser or a terminal, run or fetch code, change gh itself, or print a credential: `browse`; `auth login`, `refresh`, `setup-git` and `token`; `codespace ssh`, `code`, `jupyter` and `ports forward`; `run watch`; `api` (a raw passthrough); `completion`; all of `alias`; `config set` and `clear-cache`; `extension browse`, `install`, `remove`, `upgrade`, `create` and `exec`. Included on the user's request, against the first draft: `auth logout` (destructive), `auth switch`, `codespace cp`, `codespace logs` and `codespace ports`. These rows go into GH_COVERAGE with these reasons.
- **gh time limits follow the job (retargets HLD performance, which fixed 120 s for gh).** A table keyed by tool id and op gives each job its limit, never shorter than the tool has today (pr create 90, pr merge 180, pr diff 60, issue create 60, repo clone 600, repo create and fork 120, release create 180, run logs 60, workflow run 60, default 30); new ops get a class (read 30, small write 60, transfer or long-running 300 to 600). The HLD line `nonFunctional.performance` is to be read as this table.
- **Review rounds of LLD-s5:** round 1 block (6 HIGH, 3 MED), revised once for the findings above; round 2 block (3 HIGH, 4 MED, 1 could-not-verify), revised again; round 3 is the last of the cycle.
