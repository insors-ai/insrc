<!-- insrc:artifact PLAN-484fcef7efaf229e-s5 -->

# Plan: E20261029484fcef7:S005

## Summary

**Epic:** `manage-saved-temporary-data-connections`
**LLD run:** `wf-1793280871734-66co5i`
**LLD effective hash:** `dc1a3f91a768...`

Build native connection managers for the VS Code extension and JetBrains plugin, with separate workbench/project session owners and one common wire/state fixture corpus. Add strict protocol consumers, safe forms and recovery effects, then wire native Settings/actions and verify actual two-client UI, lifecycle, privacy and source preservation. Run only relevant tests per task; after all implementation, freeze the source and run the full Node/backend, extension and Gradle checks, preserving failures and pending release evidence. Deprecated insrc-ide work is excluded.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define versioned cross-client wire and state fixtures | M | — | unit: CM-S5-SYNC-FIXTURES: common JSON corpus version/digest, valid and malformed wire/state transcripts and live-evidence coverage index | [[c1]] [[c2]] |
| 2 | **`t2`** Implement TypeScript strict v2 reply decoders | M | `t1` | unit: CM-S5-WIRE-TS: bounded strict TypeScript v2 reply decoding and descriptor refusal | [[c1]] [[c2]] |
| 3 | **`t3`** Implement Kotlin typed v2 protocol decoders | M | `t1` | unit: CM-S5-WIRE-KT: Kotlin v2 DTO decoding matches common corpus and preserves legacy gateway types | [[c1]] [[c3]] |
| 4 | **`t4`** Extend shared TypeScript IPC with persistent lanes | M | `t2` | integration: CM-S5-TRANSPORT-TS: actual persistent socket framing, multiplexing, write-outcome, overflow, timeout/cancel/close and one-shot compatibility | [[c1]] [[c2]] |
| 5 | **`t5`** Add Kotlin persistent socket lane at existing boundary | M | `t3` | integration: CM-S5-TRANSPORT-KT: actual Kotlin socket UTF8 framing, partial writes, multiplexing, bounded limits, disposal and one-shot compatibility | [[c1]] [[c3]] |
| 6 | **`t6`** Implement pure TypeScript sc7 manager model | M | `t1`, `t2` | unit: CM-S5-STATE-TS: all list states, full-key selection, root/view/epoch guards, counts/filters/search and committed reveal | [[c1]] [[c2]] |
| 7 | **`t7`** Implement native Kotlin sc7 manager model | M | `t1`, `t3` | unit: CM-S5-STATE-KT: Kotlin sc7 model matches common state/effect transcripts without platform I/O | [[c1]] [[c3]] |
| 8 | **`t8`** Implement VS Code workbench session owner | M | `t4`, `t6` | integration: CM-S5-OWNER-TS: real workbench control/data/Saved lanes, heartbeat/resume/epoch, root retention and disposal | [[c1]] [[c2]] [[c4]] |
| 9 | **`t9`** Implement JetBrains project-owned session service | M | `t5`, `t7` | integration: CM-S5-OWNER-KT: actual PROJECT Disposable owner independent from APP gateway and manager views | [[c1]] [[c3]] [[c4]] |
| 10 | **`t10`** Implement TypeScript safe descriptor draft and dirty guards | M | `t2`, `t6` | unit: CM-S5-FORM-TS: every descriptor, safe credential intents, pinned/read-only edits and dirty zero-effect Cancel | [[c1]] [[c2]] |
| 11 | **`t11`** Implement Kotlin safe descriptor draft and dirty guards | M | `t3`, `t7` | unit: CM-S5-FORM-KT: Kotlin descriptor/credential serialization and dirty navigation parity without Settings persistence | [[c1]] [[c3]] |
| 12 | **`t12`** Implement TypeScript signed mutation and recovery effects | M | `t4`, `t8`, `t10` | integration: CM-S5-OUTCOME-TS: immutable signed attempts, lost-reply same-ticket status/replay, expiry and independent activation/refresh recovery | [[c1]] [[c2]] [[c4]] |
| 13 | **`t13`** Implement Kotlin signed mutation and recovery effects | M | `t5`, `t9`, `t11` | integration: CM-S5-OUTCOME-KT: project-memory unknown-operation retention and scope-lane recovery with no repeated create | [[c1]] [[c3]] [[c4]] |
| 14 | **`t14`** Implement TypeScript transient draft testing | M | `t8`, `t10`, `t12` | integration: CM-S5-TEST-TS: identical Test/Save input, optional Test, repeated clicks, exact stale-result identity and cancel/drain behavior | [[c1]] [[c2]] [[c4]] |
| 15 | **`t15`** Implement Kotlin transient draft testing | M | `t9`, `t11`, `t13` | integration: CM-S5-TEST-KT: Kotlin test identity/cancel parity, disposed-view and EDT delivery guards | [[c1]] [[c3]] [[c4]] |
| 16 | **`t16`** Implement TypeScript Delete and Discard presentation | M | `t8`, `t10`, `t12` | integration: CM-S5-REMOVE-TS: exact selection confirmation, zero-effect Cancel, busy/conflict/unknown and independent ticket-only cleanup | [[c1]] [[c2]] [[c4]] |
| 17 | **`t17`** Implement Kotlin Delete and Discard presentation | M | `t9`, `t11`, `t13` | integration: CM-S5-REMOVE-KT: S004 snapshots plus actual Kotlin effect paths preserve old-generation cleanup and source-data guarantee | [[c1]] [[c3]] [[c4]] |
| 18 | **`t18`** Build VS Code themed manager renderer and view host | M | `t6`, `t10`, `t12`, `t14`, `t16` | integration: CM-S5-RENDER-TS: injected webview host, strict messages/CSP/escaping, all states, masked input and view-only close | [[c1]] [[c2]] [[c5]] |
| 19 | **`t19`** Build JetBrains native manager panel | M | `t7`, `t11`, `t13`, `t15`, `t17` | integration: CM-S5-RENDER-KT: native Swing manager event wiring, EDT/disposal guards, labels/password controls and immediate-action separation | [[c1]] [[c3]] [[c5]] |
| 20 | **`t20`** Wire VS Code Settings and command entry points | M | `t8`, `t18` | integration: CM-S5-ENTRY-TS: manifest Settings discovery and palette/editor route equivalence with explicit registered roots | [[c1]] [[c2]] [[c5]] |
| 21 | **`t21`** Wire JetBrains Settings and Manage Connections action | M | `t9`, `t19` | integration: CM-S5-ENTRY-KT: native Settings and AnAction actual Project selection, chooser cancel/no-project and global Apply/reset independence | [[c1]] [[c3]] [[c5]] |
| 22 | **`t22`** Prove actual two-owner scoped transport isolation | M | `t8`, `t9`, `t20`, `t21` | integration: CM-S5-WINDOW: two real workbench/project owners, same roots/IDs, overlapping RPC IDs and isolated replies/disposal | [[c1]] [[c4]] [[c6]] |
| 23 | **`t23`** Run cross-language parity and recovery matrix | M | `t12`, `t13`, `t14`, `t15`, `t16`, `t17`, `t22` | integration: CM-S5-SYNC: TypeScript and Kotlin execute identical wire/sc7 recovery transcripts and divergent-consumer negative controls | [[c1]] [[c2]] [[c3]] [[c4]] |
| 24 | **`t24`** Prove client privacy and temporary no-persistence | M | `t18`, `t19`, `t22`, `t23` | integration: CM-S5-PRIVACY: actual client adapters poison/count persistence/log/telemetry/artifact sinks and verify zero temporary leakage | [[c1]] [[c6]] |
| 25 | **`t25`** Verify mixed-version and legacy compatibility | M | `t20`, `t21`, `t23` | integration: CM-S5-COMPAT: both clients old/missing/malformed capability refusal, no legacy mutation fallback and unchanged legacy projections | [[c1]] [[c2]] [[c3]] [[c4]] |
| 26 | **`t26`** Execute real VS Code UI and keyboard acceptance | M | `t20`, `t23`, `t24`, `t25` | live: CM-S5-UI-VSCODE: actual extension host light/dark/highcontrast, keyboard, Settings/routes and all manager state flows against isolated daemon | [[c1]] [[c5]] [[c6]] |
| 27 | **`t27`** Execute real JetBrains UI and keyboard acceptance | M | `t21`, `t23`, `t24`, `t25` | live: CM-S5-UI-JETBRAINS: actual native sandbox Settings/action/project chooser, themes, keyboard and view/owner lifecycle | [[c1]] [[c3]] [[c5]] [[c6]] |
| 28 | **`t28`** Verify both-client temporary lifecycle end to end | M | `t22`, `t26`, `t27` | live: CM-S5-LIFETIME: both actual clients before-add copy, panel/root retention, resume/disposal/90s expiry/restart and complete owned drain | [[c1]] [[c4]] [[c6]] |
| 29 | **`t29`** Verify real SQL KV and file source preservation through both clients | M | `t26`, `t27`, `t28` | live: CM-S5-SOURCE: actual both-client SQL/KV/native-converted file flows preserve seeded data/source bytes and close owned handles; unavailable SQL Server pending | [[c1]] [[c4]] [[c6]] |
| 30 | **`t30`** Align artifacts and preserve current release prerequisites | M | `t23`, `t24`, `t25`, `t28`, `t29` | integration: CM-S5-GATE: current consumer evidence/inventory negative controls preserve producer ownership and fail-closed shipped admission; smoke: CM-S5-ARTIFACTS: final structured UX/interaction definitions and regenerated companions agree with implementation and honest acceptance limits | [[c1]] [[c5]] [[c6]] |
| 31 | **`t31`** Validate targeted packaging and runtime smoke | M | `t20`, `t21`, `t30` | smoke: CM-S5-PACKAGING: fresh targeted Node22 typecheck/bundle/runtime and JDK21 compile/assemble smoke; no early full suite | [[c1]] [[c2]] [[c3]] [[c6]] |
| 32 | **`t32`** Run final frozen builds full sweeps and acceptance matrix | M | `t31` | smoke: CM-S5-SWEEP: after all implementation freeze commit/tree/test manifests; fresh Node22 builds plus full backend and explicit extension suites, JDK21 Gradle test/build and applicable verifyPlugin; retain original results and20subject acceptance matrix | [[c1]] [[c6]] |

### 1.1 E20261029484fcef7:S005:T001 — Define versioned cross-client wire and state fixtures

Create the language-neutral sc7 protocol/event/effect corpus and digest/version contract; no client source mirroring. [[c1]] [[c2]]

**Acceptance checks:**
- Create a coverage index for all20LLD subjects and common wire/model transcripts; fixture presence is never native/live acceptance. [[c1]][[c2]]
- Canonical keys/root/revision/epoch and unknown/cleanup phases are explicit; no real configuration, secrets or capabilities in fixtures. [[c1]]
- Node and JUnit load the identical corpus from repository/packaged test resources and detect version/digest drift. [[c1]]

### 1.2 E20261029484fcef7:S005:T002 — Implement TypeScript strict v2 reply decoders

Add proposed pure src/shared/connection-manager/wire.ts validators using current backend contracts. [[c1]] [[c2]]

**Acceptance checks:**
- Validate capabilities/descriptors/safe reads/lists/tickets/outcomes/status/test/removal as bounded exact discriminated data. [[c1]]
- Reject unknown required descriptor schema shapes, unsafe prototype/accessor/oversized data and target/epoch mismatch before use. [[c1]]
- Fixed safe failures; no daemon/storage/provider runtime imports or raw exception output. [[c1]]

### 1.3 E20261029484fcef7:S005:T003 — Implement Kotlin typed v2 protocol decoders

Add proposed connections/ConnectionProtocol.kt and typed DTOs separate from the stateless legacy gateway. [[c1]] [[c3]]

**Acceptance checks:**
- Consume same wire fixtures and size/depth/discriminant rules as TypeScript. [[c1]]
- Keep existing DaemonGateway and APP service legacy return shapes and no mutable project/session fields. [[c1]]
- Reject malformed/mixed/unknown required descriptors without empty-list fallback or raw exception exposure. [[c1]]

### 1.4 E20261029484fcef7:S005:T004 — Extend shared TypeScript IPC with persistent lanes

Extend existing src/shared/ipc-client.ts boundary with persistent multiplexing; preserve one-shot rpc/createIpcClient exports. [[c1]] [[c2]]

**Acceptance checks:**
- Bound frame/buffer/pending requests; correlate IDs, reject duplicate/unsolicited malformed replies and settle exactly once. [[c1]]
- Distinguish prewrite failure from written-but-unanswered outcome; cancellation/timeout cannot imply mutation refusal. [[c1]]
- Disposal closes only owned sockets and pending requests; explicit test cancel remains available; no second extension socket stack. [[c1]]
- Publish tested frame/buffer/pending/deadline constants; overflow refuses before send, never evicts/reclassifies an already written unknown mutation. Verify split frames, cancellation/reply/disposal and ID collision/wrap races. [[c1]]

### 1.5 E20261029484fcef7:S005:T005 — Add Kotlin persistent socket lane at existing boundary

Extend UnixSocketDaemonRpc.kt transport boundary with owned persistent lanes, preserving one-shot call(). [[c1]] [[c3]]

**Acceptance checks:**
- Use bounded framing/multiplexing and complete writes; no blocking I/O on EDT. [[c1]]
- Maintain independent per-lane IDs/replies, written-unknown classification, cancellation and bounded teardown. [[c1]]
- Legacy application-wide gateway remains unclaimed/stateless and unchanged for unrelated methods. [[c1]]
- Publish tested transport constants and exercise split multi-byte UTF8 frames, partial writes, background reads, cancellation/close races and exactly-once settlements. Written unanswered mutations stay unknown, never evicted as refused. [[c1]]

### 1.6 E20261029484fcef7:S005:T006 — Implement pure TypeScript sc7 manager model

Add proposed model/controller core for root, full-key selection, list states, counts, filters and generation guards. [[c1]] [[c2]]

**Acceptance checks:**
- Distinct loading/ready/empty-registry/empty-filter/read-error/offline/no-repository/upgrade-required; stale last-good rows non-actionable. [[c1]]
- Retain explicitly selected registered root independent of active editor; ignore old root/view/epoch reads. [[c1]]
- All/Saved/Temporary counts and matching search count correct; committed create reveal waits for authoritative refresh. [[c1]]

### 1.7 E20261029484fcef7:S005:T007 — Implement native Kotlin sc7 manager model

Add proposed ConnectionsManagerModel.kt with the same language-neutral transitions/effects. [[c1]] [[c3]]

**Acceptance checks:**
- Execute same sc7 state transcripts as TypeScript, including root/filter/count/reveal and stale results. [[c1]]
- Pure state has no IntelliJ SDK I/O, global current-project state or PersistentStateComponent. [[c1]]
- Sensitive draft and operation records are memory-only, not Settings Apply/reset state. [[c1]]

### 1.8 E20261029484fcef7:S005:T008 — Implement VS Code workbench session owner

Add host-owned controller for one workbench session and explicit control, root-data and Saved lanes. [[c1]] [[c2]] [[c4]]

**Acceptance checks:**
- One owner per extension-host workbench;30sheartbeat,actual90slease/epoch semantics,controlled same-owner resume/redelegate/attach. [[c1]]
- RootA→B→A and manager close retain same owner/overlays; actual extension disposal stops admission and best-effort ends/closes owned resources. [[c1]]
- Capabilities never reach webview, memento, settings or logs; temporary expiry clears sensitive draft/attempt and invalidates generations. [[c1]]

### 1.9 E20261029484fcef7:S005:T009 — Implement JetBrains project-owned session service

Add proposed PROJECT ConnectionsSessionService implementing Disposable; preserve APP gateway independence. [[c1]] [[c3]] [[c4]]

**Acceptance checks:**
- Actual Project object owns session/control/root-data/Saved lanes; no payload project/window ID authority. [[c1]]
- Background heartbeat/resume/end and bounded disposal; no EDT socket waits or invented close hook on PluginLifecycle. [[c1]]
- Configurable/toolwindow disposal closes view only; project disposal ends owner; separate projects with same root remain isolated. [[c1]]

### 1.10 E20261029484fcef7:S005:T010 — Implement TypeScript safe descriptor draft and dirty guards

Add descriptor-driven draft serializer, credential intent and guarded navigation for extension core. [[c1]] [[c2]]

**Acceptance checks:**
- Offer every validated daemon kind; unsupported schemas/read-only legacy shapes get explicit guidance. [[c1]]
- Edit fixes ID/kind/scope/family; public endpoint/path is safe; Keep/Replace/Clear masked/intent-specific with server-owned retained fields. [[c1]]
- Dirty root/row/filter/scope/close/remove transitions Discard/Cancel; Cancel emits zero mutation/navigation effects. [[c1]]

### 1.11 E20261029484fcef7:S005:T011 — Implement Kotlin safe descriptor draft and dirty guards

Add Kotlin draft/form model matching common scenarios, independent of global Settings edit model. [[c1]] [[c3]]

**Acceptance checks:**
- Same descriptor support and credential intent serializer as approved contract; fixed edit identity/scope/pinned family. [[c1]]
- Unsaved draft discard differs from temporary registration discard; Cancel retains form with zero destructive effects. [[c1]]
- No raw JSON/options bypass, stored-secret retrieval, persistence or application Settings Apply mutation. [[c1]]

### 1.12 E20261029484fcef7:S005:T012 — Implement TypeScript signed mutation and recovery effects

Add scope-specific manager gateway effects for ticket/mutate/status/activation/list recovery. [[c1]] [[c2]] [[c4]]

**Acceptance checks:**
- Freeze exact request/ticket before submission; double submit blocked, lost/malformed reply =>unknown and same-operation reconciliation. [[c1]]
- Not-seen allows identical same-ticket replay only under backend rules; expiry/reconciliation-required blocks replay/new mutation. [[c1]]
- Committed registration,activation,cleanup and refresh are separate; retry only failed phase; clear replacement credentials after known commit. [[c1]]

### 1.13 E20261029484fcef7:S005:T013 — Implement Kotlin signed mutation and recovery effects

Add project manager gateway matching sc2 semantics and strict decoded result handling. [[c1]] [[c3]] [[c4]]

**Acceptance checks:**
- Unknown attempted request stays in project memory across view close and reopens reconciliation before fresh target mutation. [[c1]]
- Separate actual owner-bound temporary lane and unclaimed Saved lane; no fallback by dropping session fields. [[c1]]
- Postcommit activation/refresh retry never recreates; after project loss no ticket =>reload current state only, no invented historical result. [[c1]]

### 1.14 E20261029484fcef7:S005:T014 — Implement TypeScript transient draft testing

Wire Test/cancel with the same immutable draft serializer as Save. [[c1]] [[c2]] [[c4]]

**Acceptance checks:**
- Optional Test sends requestId,draftRevision,fullkey,expectedRevision and epoch-bound local view identity. [[c1]]
- One probe per transport, repeated clicks blocked; edit/navigation/close cancels; stale/late results ignored. [[c1]]
- Cancellation/timeout response does not certify drain or release another operation; fixed safe elapsed status only. [[c1]]

### 1.15 E20261029484fcef7:S005:T015 — Implement Kotlin transient draft testing

Wire Kotlin Test/cancel and EDT-safe status publication. [[c1]] [[c3]] [[c4]]

**Acceptance checks:**
- Same Test/Save materialized input fixture and stale tuple as TypeScript. [[c1]]
- Cancel on draft/root/selection/view change; real worker drain owned by daemon, no client driver construction. [[c1]]
- Background call and generation/project-disposal checks before EDT update; native view never hangs on timeout/drain. [[c1]]

### 1.16 E20261029484fcef7:S005:T016 — Implement TypeScript Delete and Discard presentation

Consume S004 confirmation/state and ticket-only cleanup retry without backend changes. [[c1]] [[c2]] [[c4]]

**Acceptance checks:**
- Resolve dirty draft first; exact root/scope/ID+revision and source-data guarantee before confirm; Cancel issues zero ticket calls. [[c1]]
- Busy/conflict keeps row/draft; fresh revision requires reconfirm; unknown cannot be inferred from absent row. [[c1]]
- Committed removal keeps separate operation card for independent credential/resource pending phases; retry only original ticket, safe with same-ID recreation. [[c1]]

### 1.17 E20261029484fcef7:S005:T017 — Implement Kotlin Delete and Discard presentation

Mirror exact S004 removal copy/behavior through native Kotlin state and gateway. [[c1]] [[c3]] [[c4]]

**Acceptance checks:**
- Reuse common20S004consumer snapshots and strict key/revision selection; no credentials/publicPatch on remove. [[c1]]
- Cancel/busy/conflict/unknown/removed-cleanup-pending/removed remain distinct and truthful. [[c1]]
- Independent phase retry sends only {ticket}; no current-ID cleanup selector or source deletion effect. [[c1]]

### 1.18 E20261029484fcef7:S005:T018 — Build VS Code themed manager renderer and view host

Add dedicated vscode-plugin/src/connections host/renderer with injected API ports. [[c1]] [[c2]] [[c5]]

**Acceptance checks:**
- Two-pane responsive list/draft layout, explicit root/scope/filter/counts and all error/empty/recovery states. [[c1]]
- Strict allowlisted webview intent messages, CSP/escaping, no raw capabilities/config/secret persistence via setState or generic RPC bridge. [[c1]]
- Accessible labels/focus-visible/status region; masked replacement fields; dirty close/hide handled without ending owner. [[c1]]

### 1.19 E20261029484fcef7:S005:T019 — Build JetBrains native manager panel

Add proposed ConnectionsManagerPanel.kt using native Swing controls over project model. [[c1]] [[c3]] [[c5]]

**Acceptance checks:**
- JBUI/theme-aware layout, label associations/JBPasswordField, keyboard focus/error/status and all sc7 states. [[c1]]
- All I/O background; EDT-only updates checked against current view/project generation. [[c1]]
- Immediate explicit connection actions separate from global Configurable Apply/reset; closing native view leaves project owner alive. [[c1]]

### 1.20 E20261029484fcef7:S005:T020 — Wire VS Code Settings and command entry points

Register Settings discovery and common manager command routing in manifest/extension activation. [[c1]] [[c2]] [[c5]]

**Acceptance checks:**
- Searching insrc connections exposes Manage Connections; command links and palette actions open same retained manager state. [[c1]]
- No/multiple registered roots explicit, actual workbench selected; command args only selection hints validated against fresh daemon state. [[c1]]
- Only extension.ts imports vscode; dedicated connections types instead of unrelated panels/types.ts; preserve live registered command IDs. [[c1]]

### 1.21 E20261029484fcef7:S005:T021 — Wire JetBrains Settings and Manage Connections action

Register ConnectionsConfigurable and ManageConnectionsAction through plugin.xml. [[c1]] [[c3]] [[c5]]

**Acceptance checks:**
- Native Settings search/category opens manager; app Settings explicitly picks an actual live Project, then registered root/service. [[c1]]
- No open project =>no-repository guidance and no temporary owner; context action uses actual Project object and same guarded manager. [[c1]]
- Existing global Settings and ShowOrRegisterRepoAction remain compatible; closing/apply/reset global Settings never ends or mutates connection session. [[c1]]

### 1.22 E20261029484fcef7:S005:T022 — Prove actual two-owner scoped transport isolation

Exercise independent workbench/project services through real socket fixtures. [[c1]] [[c4]] [[c6]]

**Acceptance checks:**
- Two projects/workbenches with same root/ID and overlapping request IDs have independent owners/replies; forged owner hints and wrong-root/generation fail before use. [[c1]]
- Switch rootA→B→A retains original overlay; disposing one owner closes only its resources. [[c1]]
- App Kotlin gateway stays stateless/unclaimed; unsupported production execution routes refuse rather than claiming positive global Saved affinity. [[c1]]

### 1.23 E20261029484fcef7:S005:T023 — Run cross-language parity and recovery matrix

Execute common wire/sc7 transcripts in actual TypeScript and Kotlin consumer implementations. [[c1]] [[c2]] [[c3]] [[c4]]

**Acceptance checks:**
- Matching version/digest and state/effect outputs for every shared scenario; intentional consumer divergence fails. [[c1]]
- Controlled unknown/reconnect/expired operation,activation/refresh failure and same-ID cleanup recreation verify exact effects, not just snapshots. [[c1]]
- All20LLD subjects mapped to concrete consumer cases/evidence, with unavailable UI/live acceptance still pending. [[c1]]

### 1.24 E20261029484fcef7:S005:T024 — Prove client privacy and temporary no-persistence

Poison/count Settings,memento,webview state,Kotlin persistence,telemetry/log/artifact sinks in actual adapters. [[c1]] [[c6]]

**Acceptance checks:**
- Synthetic endpoint/source/config/credential/capability canaries absent from captured sinks and other-owner events. [[c1]]
- Temporary add/test/discard/end/expiry/reconnect cause zero client config/credential persistence; separate intentionally durable daemon Saved metadata is not relabeled absent. [[c1]]
- Malformed/raw SDK/transport errors yield fixed safe UI text; screenshots exclude real secrets and capabilities. [[c1]]

### 1.25 E20261029484fcef7:S005:T025 — Verify mixed-version and legacy compatibility

Exercise both current clients against missing/stale/malformed capabilities and old daemon behavior. [[c1]] [[c2]] [[c3]] [[c4]]

**Acceptance checks:**
- Unsupported features disable affected controls with upgrade-required; manager never falls back to legacy upsert/delete. [[c1]]
- Legacy shared IPC and Kotlin gateway unrelated methods retain projections/behavior; pinned/read-only records preserved. [[c1]]
- Directory-scoped saved analysis remains backend-owned and unchanged; no new client root redirect or registry migration. [[c1]]

### 1.26 E20261029484fcef7:S005:T026 — Execute real VS Code UI and keyboard acceptance

Launch actual extension-host manager and collect safe native interaction evidence. [[c1]] [[c5]] [[c6]]

**Acceptance checks:**
- Light/dark/highcontrast,focus order,labels,status/errors,masked fields and keyboard add/edit/Test/Delete/Discard verified in actual UI. [[c1]]
- Settings/palette route equality,explicit roots,counts/filters,dirty guards,read/offline/empty/upgrade states and unknown/cleanup cards demonstrated. [[c1]]
- Retain screenshots/actions/results with version/source identity; generated design mock alone never counts as UI acceptance. [[c1]]
- Exercise native positive flows only against a separately isolated real daemon fixture with reviewed test-only prerequisite injection; verify production gate refusal separately. No production override/env bypass or fixture-only release acceptance. [[c1]]

### 1.27 E20261029484fcef7:S005:T027 — Execute real JetBrains UI and keyboard acceptance

Launch sandbox IDE with native Connections manager; verify live application Settings/project action. [[c1]] [[c3]] [[c5]] [[c6]]

**Acceptance checks:**
- Explicit project chooser,no-project/multiroot retained selection,light/dark/highcontrast and keyboard paths verified natively. [[c1]]
- Native dirty/cancel,scope/filter/counts,safe forms,Test and removal/recovery status behave as common scenarios. [[c1]]
- Show Settings closing/Apply/reset does not save connections or end owner; record real sandbox evidence, unavailable IDE verification remains pending. [[c1]]
- Simultaneous Settings/views share the actual chosen project controller, not duplicate owners. Chooser cancel/project disposal before selection completes creates no session or mutation. Native positive flows use isolated daemon fixture; shipped admission remains disabled. [[c1]]

### 1.28 E20261029484fcef7:S005:T028 — Verify both-client temporary lifecycle end to end

Exercise actual client owner/control/data lanes with live isolated daemon sessions. [[c1]] [[c4]] [[c6]]

**Acceptance checks:**
- Before-add lifetime copy visible in both clients; panel/Settings close+reopen/rootswitch retains temporary entries. [[c1]]
- Sameepoch control reconnect within lease resumes; actual project/workbench disposal,90sdeadline and daemon restart invalidate old state without recreation. [[c1]]
- Probe cancellation/late delivery and all owned sockets/workers drain or remain explicit failed cleanup; no leaked client timer/listener/session. [[c1]]

### 1.29 E20261029484fcef7:S005:T029 — Verify real SQL KV and file source preservation through both clients

Use disposable PostgreSQL/Redis and supported native/converted file fixtures via actual consumer paths. [[c1]] [[c4]] [[c6]]

**Acceptance checks:**
- Test/Save/remove data and byte hashes unchanged after actual both-scope Delete/Discard; owned handles close. [[c1]]
- Both clients render unsupported/resource-limit file refusal without disk conversion/cache fallback. [[c1]]
- SQL Server absence stays pending as user authorized; do not substitute mocks or relabel service/provider/global-affinity limitations. [[c1]]

### 1.30 E20261029484fcef7:S005:T030 — Align artifacts and preserve current release prerequisites

Update relevant structured UX/interaction definitions and source-backed client inventory/evidence after implementation. [[c1]] [[c5]] [[c6]]

**Acceptance checks:**
- Definitions and regenerated companions match final ownership/state/UI; inspect source/rendering and report limits honestly. [[c1]]
- Record genuine VSCode/JetBrains evidence without deprecated-fork work or fake positive prerequisite statuses. [[c1]]
- Shipped production admission stays fail-closed while S001/provider/positive Saved worker affinity/SQLServer or genuine client acceptance remains pending; historical S003/S004 failures preserved. [[c1]]
- Only S005 consumer inventory/evidence and artifact alignment are in scope. Existing producer prerequisites and backend gate policy are consumed unchanged; no forced positive status, new enablement switch or clearing pending S001/provider/worker/SQLServer findings. [[c1]]

### 1.31 E20261029484fcef7:S005:T031 — Validate targeted packaging and runtime smoke

Prepare production extension and JetBrains packaging after implementation without an early full sweep. [[c1]] [[c2]] [[c3]] [[c6]]

**Acceptance checks:**
- Fresh Node22 backend/extension typecheck+bundle and targeted packaged extension smoke without backend node_modules. [[c1]]
- JDK21 targeted Gradle compile/assemble and relevant packaging tests; full Gradle test/build scheduled only t32. [[c1]]
- Client bundles contain only approved pure protocol/model/transport and native UI dependencies; no daemon storage/providers/runtime drivers or persisted temporary state. [[c1]]

### 1.32 E20261029484fcef7:S005:T032 — Run final frozen builds full sweeps and acceptance matrix

After all implementation and focused validation, freeze manifest and execute complete repository+explicit extension+JetBrains checks once. [[c1]] [[c6]]

**Acceptance checks:**
- Record exact commit/tree/runtime/discovered tests and zero source drift; fresh Node22 build, full backend and explicit extension test globs; JDK21 ./gradlew test build and applicable verifyPlugin. [[c1]]
- Retain every raw result/pass/fail/skip/TODO,timeout/intervention; diagnostic reruns never replace original totals or clear historical S003/S004 findings. [[c1]]
- Produce full20subject LLD matrix with proved/failed/pending and explicit release prerequisites; no automated code-review invocation. Perform manual post-build inspection, then present BUILD for explicit user completion approval. [[c1]]
- No claim of release enablement, UI/service evidence or plugin verification when unavailable. Later implementation correction requires relevant retests and justified final revalidation. [[c1]]
- A required executed suite failure keeps task tests failed; unavailable mandatory native/plugin-verifier evidence stays explicitly pending/failed. A later user completion exception never changes those results or activates release. [[c1]]

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| CM-S5-STATE: all list states distinct, retained root, full-key identity, filter/search/counts, add reveal and stale-view rejection | `t6`, `t7`, `t18`, `t19`, `t23` |
| CM-S5-DIRTY: every draft exit Discard/Cancel; editing fixed identity/scope; zero effects after Cancel; unknown mutation retains reconciliation on close | `t10`, `t11`, `t18`, `t19`, `t23`, `t26`, `t27` |
| CM-S5-FORM: descriptor subset validation, every offered driver, safe endpoint/secret-slot serialization and Keep/Replace/Clear; pinned/read-only compatibility | `t2`, `t3`, `t10`, `t11`, `t26`, `t27` |
| CM-S5-TEST: same draft serializer for Save/Test, optional testing, exact stale-result tuple, repeated click suppression and cancel | `t14`, `t15`, `t23`, `t26`, `t27` |
| CM-S5-WIRE: capabilities, descriptors, safe lists/reads, tickets, outcomes/status, test/removal replies strict/size-bounded; old/missing/malformed fails closed | `t1`, `t2`, `t3`, `t23`, `t25` |
| CM-S5-SYNC: one versioned/digested JSON wire+state/effect transcript corpus executed by TypeScript and Kotlin, divergent-field/transition negative controls; both bundles exclude daemon/storage/provider code. | `t1`, `t23`, `t31` |
| CM-S5-COMPAT: old daemon/new client upgrade UI; no legacy mutation fallback, legacy unrelated projections retained, pinned family retained | `t25`, `t31` |
| CM-S5-TRANSPORT: persistent request multiplexing, disconnect pre/postwrite, timeout/abort, request ID collisions, finite buffers, exactly-once disposal and no raw error leak | `t4`, `t5`, `t22` |
| CM-S5-OWNER: one owner per extension workbench or JetBrains Project;30sheartbeat,90sexpiry,sameepochresume/new epoch,root switches/close-reopen; no session end on Configurable disposal, no persistent capabilities. | `t8`, `t9`, `t22`, `t28` |
| CM-S5-WINDOW: two actual project-scoped services/workbench hosts, same roots/IDs and overlapping RPC IDs, forged owner hints and disposed/stale-view refusal; owner-only delivery and independent project disposal. | `t9`, `t21`, `t22` |
| CM-S5-OUTCOME: known commit vs activation/refresh failure; lostreply same-ticket recovery, expiry, no changedpayload/new operation retry; row/card independent cleanup phases | `t12`, `t13`, `t23`, `t26`, `t27` |
| CM-S5-REMOVE: exact root/scope/ID confirmation, zero-effect Cancel, busy/conflict retention, unknown status, ticket-only retry and same-ID recreation safety | `t16`, `t17`, `t23`, `t26`, `t27` |
| CM-S5-ENTRY: VSCode Settings/command and JetBrains native Settings/AnAction route each project/workbench to the same guarded manager; explicit project chooser for application Settings, no-project/multiroot/retained-root cases. | `t20`, `t21`, `t26`, `t27` |
| CM-S5-UI: actual VSCode extension and JetBrains native manager in light/dark/highcontrast, labels, focus/live status and keyboard-only add/edit/test/Delete/Discard flows. | `t18`, `t19`, `t26`, `t27` |
| CM-S5-LIFETIME: before-add temporary copy in both clients, panelclose/root switch retention, workbench disposal/reconnect/expiry/restart loss; no inferred lifecycle success from backend snapshots | `t8`, `t9`, `t28` |
| CM-S5-SOURCE: both clients supported SQL/KV/file Test/Save/discard/delete leave seeded source rows/bytes unchanged; SQL Server unavailable remains pending | `t29` |
| CM-S5-PRIVACY: synthetic endpoint/secret/config/capability canaries absent from Settings,memento,webview state,logs,telemetry,artifacts and other-window events; temporary actions cause zero persistence | `t24`, `t26`, `t27`, `t28` |
| CM-S5-BUILD: fresh Node22 backend and extension typecheck/bundle; JDK21 ./gradlew test build and applicable verifyPlugin checks; packaged runtime smoke for both live clients. | `t31`, `t32` |
| CM-S5-SWEEP: per-task relevant Node/JUnit tests, then final frozen backend+explicit extension+JetBrains suites with exact logs/counts; no forced live gates or historical failure relabeling. | `t32` |
| CM-S5-GATE: production remains fail-closed until current S001/provider/worker-affinity/SQLServer/both-client prerequisites are genuinely satisfied; test-positive evidence never enables shipped gates | `t25`, `t30`, `t32` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s5 contractDetails/dataModelChanges/errorPaths` — "Approved native VSCode+JetBrains sc7 contract; strict descriptors, full-key state, workbench/project ownership, safe draft/test/mutation/removal and explicit scope correction."
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles[1]` — "Existing shared TypeScript IPC and extension injectable host/test patterns; new dedicated connections modules, not unrelated panels/types."
- **[[c3]]** `analyze-bundle` `s1.analyzeBundles[2]` — "Actual Kotlin native Settings, APP stateless gateway, one-shot socket boundary, new project Disposable service and JUnit/Gradle conventions."
- **[[c4]]** `prior-artifact` `LLD s5 dataModelChanges sc1–sc6/sc8 consumer effects; S004 S005-HANDOFF` — "Consume existing signed receipt/status, transient probe, owner-bound session/root lanes and ticket-only independent removal cleanup; backend ownership unchanged."
- **[[c5]]** `prior-artifact` `LLD s5 uxDefinition/sequenceDefinition/componentDependencyDefinition` — "Native two-client manager layout and workbench/project lifetime boundaries, safe input/status/focus, no deprecated-fork source mirroring."
- **[[c6]]** `prior-artifact` `LLD s5 testStrategy/migration` — "Twenty exact acceptance subjects, genuine two-client UI/lifecycle/service/privacy proof, final frozen suites, pending production prerequisites and manual post-build review policy."
