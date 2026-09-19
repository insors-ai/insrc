<!-- insrc:artifact PLAN-238917216d8fd532-s5 -->

# Plan: E2026091923891721:S005

**Epic:** `ide-artifact-review-panel-jetbrains-plugin`
**LLD run:** `wf-1789824442549-kui19b`
**LLD effective hash:** `c93cb4358ff4...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** ApproveResult + DaemonGateway.approve wrapper (classification) + test doubles | S | — | unit: DaemonGatewayImpl.approve over a fake DaemonRpc: approved->Approved; skipped->Withheld(reason); ok=false/DaemonUnavailable/both-empty->Unavailable; unit: approve composes the absolute artifactPath + sends overrideReview only when overrideReason is non-blank | [[c1]] [[c2]] [[c4]] |
| 2 | **`t2`** Pure ApproveDecision helpers + Approve action wired into ArtifactContentPane | M | `t1` | unit: ApproveDecision.enabled = view.approvable (true enables, false disables + blockReason shown); unit: ApproveDecision.normalizeOverride: blank/whitespace -> null (no override); non-blank -> trimmed reason | [[c2]] [[c3]] [[c5]] |
| 3 | **`t3`** Post-approve refresh wiring (ReviewPanel.onApproved -> refreshNow) | S | `t2` | unit: ApproveDecision.shouldRefresh is true only for Approved (not Withheld/Unavailable) | [[c5]] |
| 4 | **`t4`** Plugin tests (gateway approve boundary + ApproveDecision) | M | `t1`, `t2` | unit: the REAL UnixSocketDaemonRpc.parse boundary: {result:{approved}}->Approved; {result:{skipped:[{reason}]}}->Withheld(reason); {result:{error}}->Unavailable; unit: ApproveDecision full coverage (enabled/normalizeOverride/shouldRefresh) | [[c3]] [[c6]] |

### E2026091923891721:S005:T001 — ApproveResult + DaemonGateway.approve wrapper (classification) + test doubles

Add the plugin-internal ApproveResult sealed type (Approved | Withheld(reason) | Unavailable(reason)) + DaemonGateway.approve(projectRootPath, mdPath, overrideReason?) in DaemonGateway.kt (+ the DaemonGatewayService delegate): compose the ABSOLUTE artifactPath (projectRootPath + '/' + mdPath), send workflow.approve { repo, artifactPath, overrideReview? } (overrideReview omitted when overrideReason is null/blank), and classify the reply — approved[] non-empty -> Approved (covers idempotent re-approve); else skipped[] non-empty -> Withheld(skipped[0].reason); else ok=false/DaemonUnavailable/malformed/both-empty -> Unavailable (defensive default). Add the new interface-method override to EVERY gateway test double (FakeGateway/NoopGateway/AlreadyRegisteredGateway) + the DaemonGatewayService delegate + imports in the SAME task so the suite compiles.

**Acceptance checks:**
- DaemonGateway.approve maps ok+approved[]->Approved (incl. an already-approved re-approve); ok+skipped[]->Withheld(skipped[0].reason); ok=false/DaemonUnavailable/both-empty->Unavailable (defensive)
- The request composes the absolute artifactPath and sends overrideReview only when overrideReason is non-blank
- All existing gateway test doubles + the DaemonGatewayService delegate compile with the new override

### E2026091923891721:S005:T002 — Pure ApproveDecision helpers + Approve action wired into ArtifactContentPane

FIRST extract the load-bearing decisions into a standalone pure object ApproveDecision: enabled(view) = view.approvable; normalizeOverride(reason) = reason?.trim().ifEmpty(null) (blank -> no override); shouldRefresh(result) = result is Approved. THEN wire the Approve action into ArtifactContentPane: retain the current ArtifactReviewViewDto (mdPath/approvable/blockReason) as pane state on render(); an Approve button in BOTH the JCEF and native cards (Approve is not a JCEF feature) enabled per ApproveDecision.enabled with blockReason shown when false; an 'Approve anyway' override prompt (Messages.showInputDialog; normalizeOverride applied); an off-EDT gateway.approve call marshaled to the EDT (mirrors S004 submit); outcome via the existing notifyUser (S004) — on Approved notify + invoke onApproved, on Withheld show the reason, on Unavailable surface the failure. Guard: no mdPath / no project.basePath -> Approve disabled/no-op. The Swing button + dialog + EDT wiring is the manual/backstopped residual.

**Acceptance checks:**
- ApproveDecision is a standalone pure object (enabled=approvable, normalizeOverride blank->null, shouldRefresh=Approved) — unit-testable headlessly
- Approve is enabled only when approvable is true (blockReason shown otherwise) and available in both the JCEF and native views
- 'Approve anyway' sends overrideReview via normalizeOverride; a blank reason is treated as no override
- On Approved the panel notifies + invokes onApproved; on Withheld/Unavailable it surfaces the reason and does not refresh; no mdPath/repo -> disabled/no-op

### E2026091923891721:S005:T003 — Post-approve refresh wiring (ReviewPanel.onApproved -> refreshNow)

ReviewPanel passes an onApproved: () -> Unit callback into ArtifactContentPane that invokes the EXISTING ReviewPanel.refreshNow() (ReviewToolWindow.kt:124) so the just-approved artifact drops off the pending list. No new poll machinery (k7); reuses the generation-guarded poll unchanged.

**Acceptance checks:**
- On Approved the pane invokes onApproved, which calls the existing ReviewPanel.refreshNow()
- No new poll/scheduler is introduced (the S001 poll is reused unchanged)

### E2026091923891721:S005:T004 — Plugin tests (gateway approve boundary + ApproveDecision)

Add plugin JUnit tests mirroring ArtifactContentTest/ResolveCommentTest: DaemonGatewayImpl.approve over a fake DaemonRpc (approved->Approved incl. idempotent re-approve; skipped->Withheld(reason); ok=false/DaemonUnavailable/both-empty->Unavailable; asserts method 'workflow.approve' + composed absolute artifactPath + overrideReview presence/absence) AND the real UnixSocketDaemonRpc.parse across the framing boundary ({result:{approved}}->Approved; {result:{skipped:[{reason}]}}->Withheld; {result:{error}}->Unavailable); plus the pure ApproveDecision (enabled, normalizeOverride blank->null, shouldRefresh=Approved). Verify via ./gradlew test JDK21.

**Acceptance checks:**
- Gateway tests classify approved/skipped/error/both-empty correctly INCLUDING across the real parse boundary, and assert the composed artifactPath + overrideReview presence
- ApproveDecision is unit-tested (enabled-iff-approvable, normalizeOverride blank->null, shouldRefresh only on Approved)
- ./gradlew test green on JDK21

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| approve over a fake DaemonRpc: ok with approved[] non-empty -> Approved; ok with skipped[] non-empty -> Withheld(skipped[0].reason) (NOT a success); ok=false -> Unavailable; DaemonUnavailable -> Unavailable; ok=true but approved+skipped both empty -> Unavailable (never a false Approved) | `t1`, `t4` |
| the request composes the ABSOLUTE artifactPath from projectRootPath + mdPath and sends method 'workflow.approve' with { repo, artifactPath }; overrideReason non-null -> overrideReview present; null/blank -> overrideReview absent | `t1`, `t4` |
| the REAL UnixSocketDaemonRpc.parse across the boundary: {result:{approved:[...],skipped:[]}} -> Approved; {result:{approved:[],skipped:[{reason}]}} -> Withheld(reason); {result:{error}} -> ok=false -> Unavailable | `t4` |
| the Approve-enable decision: normal Approve enabled iff the S002 view.approvable is true; blocked -> disabled + blockReason shown | `t2`, `t4` |
| an empty/blank override reason is treated as NO override (a normal approve), a non-empty reason bypasses the block | `t2`, `t4` |
| the post-approve refresh decision: refresh (drop-off) triggered iff the result is Approved (not on Withheld/Unavailable) | `t3`, `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s5 contractDetails.api workflow.approve (existing IPC reused unchanged: params + WorkflowApproveResult approved/skipped shape + block gate)`
- **[[c2]]** `prior-artifact` `LLD s5 contractDetails.api DaemonGateway.approve (the three-state ApproveResult classification wrapper)`
- **[[c3]]** `prior-artifact` `LLD s5 errorPaths (Unavailable on unreachable/missing/both-empty; Withheld on skipped[]; empty-override normalization; no-path guard)`
- **[[c4]]** `prior-artifact` `LLD s5 dataModelChanges (the new plugin-internal ApproveResult sealed type)`
- **[[c5]]** `prior-artifact` `LLD s5 migration (the Approve action wiring into ArtifactContentPane + the onApproved->ReviewPanel.refreshNow() post-approve refresh)`
- **[[c6]]** `prior-artifact` `LLD s5 testStrategy (gateway classification + real parse boundary + the pure decision helpers; JUnit5/JDK21)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-19T13:59:36.021Z

_No load-bearing premises were extracted._
