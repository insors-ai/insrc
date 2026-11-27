<!-- insrc:artifact LLD-639cd2159a87aedb-s5 -->

# LLD: STORY-639cd2159a87aedb-s5 — The Vibe model family advertises exactly what the new launch path honors

## Summary

**Epic:** `unify-vibe-one-plain-cli-adapter`
**HLD base run:** `wf-1795535373279-l4wumn`
**HLD effective hash:** `67d59677de6a...`
**Tracker:** [insors-ai/insrc#322](https://github.com/insors-ai/insrc/issues/322)

This round renames the shipped catalog's mid-tier model id from 'mistral-vibe-cli-latest' to 'mistral-medium-latest' -- the id the installed binary's own export.json actually reports and treats as canonical -- keeping the old id and the existing display alias as declared aliases, so the active-model matcher this Story builds has a real, passing case for the exact model the prior review round tested. It also corrects the effort classifier: an effort that was never actually probed (budget exhausted, unreachable, or no usable evidence at all) now reports 'rejected', reusing the exact meaning the daemon's existing claude-check procedure already gives that verdict, so the existing approval gate genuinely refuses it rather than merely being asked to.

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

s1's BUILD changed the shared Vibe execution adapter and backend/plugin chat dispatch surfaces, none of which read or depend on the cli-vibe catalog's specific model id spellings -- s1's own dispatch path (dispatchVibeTurn) forwards whatever canonical id resolveTier/tierModelOf hands it, so renaming the catalog's mid-tier id from 'mistral-vibe-cli-latest' to 'mistral-medium-latest' (with both the old id and the existing alias retained as declared aliases) changes nothing about how s1's adapter constructs or dispatches a turn -- confirmed via s1's own build record describing no dependency on specific model id strings.

**Sources:**
- .insrc/artifacts/BUILD-639cd2159a87aedb-s1.json

## 2. HLD context

> See **HLD-639cd2159a87aedb** § 2. Framework summary

**Rollout phase:** Phase B — Adapter consumers
**Consumes:** `sc1` (Vibe execution adapter interface)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Everything behind the adapter interface: argv construction from the qualified 3.1.4 flag surface, the adapter-construction execution context with the DUAL process-group policy and per-turn cancellation, transient-error classification and the bounded retry semantics, the local schema-validation loop for structured-output requests, the tool-result output normalization, the type-level resumed-session selection rule, and the deletion of src/shared/vibe-session.ts plus the rewiring of the backend provider paths and structured-output.ts onto the adapter. — owns `sc1`, `sc2`
- `s2`: The narrow-authorization design itself: the live qualification suite against the real installed binary, the adapter-owned ReadOnlyCapability wiring, the unavailable-state reporting when qualification fails, and the adapter's read-only mode enablement. — owns `sc3`
- `s3`: The chat surface migration: the vibe mapper and job runner become consumers of the adapter, while the transcript rendering, streaming event mapping, worker lifecycle, resume handles and attachments keep their existing behavior. Also internal: the live verifications whose outcomes s6 records.
- `s4`: The reader's internals: parse-for-understanding via the existing smol-toml dependency, the surgical byte-preserving edit engine, the refusal path for configs that cannot be changed safely, and the rewiring of the daemon's registration checks and cleanup and the plugin's config writer onto it. — owns `sc4`
- `s6`: The reconciliation work itself: verifying the chat prompt-transport fix, the approval parity cases, the tool-result output parity, the resume-selection behavior and the worker cleanup parity live with s3's evidence, checking catalog coverage, closing the implemented issues, stamping the review-dependent deferrals, and attaching evidence to every closure.

## 3. Contract details

**Surface level:** internal-shared

### 3.1 `checkVibe`

```typescript
async function checkVibe(ctx: Context, claimed: readonly EffortLevel[]): Promise<Procedure>
```

**Parameters:**
- `ctx: Context` — The check's CLI binary, family, modelId, run() seam, timeout and cwd (unchanged shape).
- `claimed: readonly EffortLevel[]` — The effort/thinking levels the user claims the model supports.

**Returns:** `Promise<Procedure>` — cliVersion, whether the model ran (active_model-confirmed), and a per-claimed-effort EffortCheck verdict: 'rejected' for any case with no usable completion evidence at all (never attempted or probe failure), 'recognised-unconfirmed' only for a genuinely completed, model-confirmed run whose specific effort remains unverifiable, and never 'accepted' (no effective-thinking evidence exists anywhere in the installed tool).

**Postconditions:**
- The model-liveness probe counts as runs:true ONLY when readVibeExportEvidence reports a success-class outcome with no error AND vibeActiveModelMatches(ctx.modelId, evidence.activeModel, registry) is true; this round's catalog rename gives the matcher a real passing case for the shipped 'mid' tier model
- If the model-liveness probe does not satisfy both conditions, no effort probes run; every claimed effort is reported via the existing notChecked-style wording with verdict 'rejected' ('not checked: the CLI could not be reached' or naming the active_model mismatch) -- unchanged from the shared convention every CLI-kind procedure already uses
- Otherwise, each claimed effort is classified by a REVISED ordered table: (1) deterministic refusal (stderr downgrade warning, or export outcome/error naming the effort) -> 'rejected'; (2) no usable run for THIS effort at all -- never probed because the shared deadline was exhausted before its turn, OR its own probe was unreachable/timed out/returned a malformed export with no completion evidence whatsoever -> 'rejected', evidence naming which of the two applies, reusing the exact 'no affirmative basis' meaning checkClaude's own undefined-names branch already gives this verdict (not an invented new semantics); (3) a run that DID complete, with the model positively confirmed, and no refusal signal, but no effective-thinking evidence for the specific value -> 'recognised-unconfirmed', evidence stating the model was confirmed but the effort's effective application is unverifiable
- approveCheck's existing, unchanged block-only-on-'rejected' rule now genuinely refuses an effort from case (2), closing the admission gap rather than merely documenting it

### 3.2 `readVibeExportEvidence`

```typescript
async function readVibeExportEvidence(exportDir: string, readFile: (path: string) => Promise<string>): Promise<{ readonly activeModel?: string | undefined; readonly outcome?: string | undefined; readonly errorMessage?: string | undefined }>
```

**Parameters:**
- `exportDir: string` — The --output-dir path the probe was given.
- `readFile: (path: string) => Promise<string>` — Injected file-read seam.

**Returns:** `Promise<{activeModel?, outcome?, errorMessage?}>` — Unchanged from round 3: the three export.json fields both the model-liveness gate and the effort classifier consult; a missing/unreadable/unparseable export.json yields all three fields undefined, never a thrown error.

**Postconditions:**
- Unchanged; its all-undefined fallback is now explicitly one of case (2)'s 'no usable run' triggers rather than feeding a 'recognised-unconfirmed' result

### 3.3 `vibeThinkingDowngradeWarning`

```typescript
function vibeThinkingDowngradeWarning(stderr: string, effort: string): boolean
```

**Parameters:**
- `stderr: string` — The effort probe's captured stderr text.
- `effort: string` — The claimed effort value this probe requested.

**Returns:** `boolean` — Unchanged from round 3: true when stderr contains the installed CLI's own live-confirmed silent-downgrade wording naming this exact effort value.

**Postconditions:**
- Unchanged; remains one of the two deterministic-refusal signals in case (1)

### 3.4 `vibeActiveModelMatches`

```typescript
function vibeActiveModelMatches(requestedId: string, observedActiveModel: string | undefined, registry: ModelRegistry): boolean
```

**Parameters:**
- `requestedId: string` — The id or alias actually sent as --model.
- `observedActiveModel: string | undefined` — export.json's config.active_model, or undefined if absent.
- `registry: ModelRegistry` — The daemon's own registry, so equivalence is checked via the SAME resolveName-based id-or-alias lookup the daemon uses elsewhere.

**Returns:** `boolean` — Unchanged logic from round 3 (true on direct match or resolved-canonical-id match, false otherwise); this round's catalog rename is what makes the resolved-canonical-id branch actually succeed for the shipped 'mid' tier model, since its canonical id now equals the observed active_model directly.

**Postconditions:**
- Used identically by checkVibe's model-liveness gate and the live-matrix test

## 4. Data model changes

### 4.1 `cli-vibe family's 'mid' tier model entry (src/assets/models/cloud-model-catalog.json)` — field-modify

The model entry's canonical `id` is renamed from 'mistral-vibe-cli-latest' to 'mistral-medium-latest' -- the id the installed vibe 3.1.4 binary's own export.json reports as active_model and treats as canonical in its own internal alias table. 'mistral-vibe-cli-latest' and the existing 'mistral-medium-3.5' both become declared aliases (aliases: ['mistral-vibe-cli-latest', 'mistral-medium-3.5']); displayName and efforts are unchanged.

**Call sites:**
- `src/assets/models/cloud-model-catalog.json:53`
- `src/daemon/model-catalog.ts:166-168`

### 4.2 `cli-vibe family's tierDefaults.mid (src/assets/models/cloud-model-catalog.json)` — field-modify

tierDefaults.mid.model is updated from 'mistral-vibe-cli-latest' to 'mistral-medium-latest' so it keeps resolving to the same, now-renamed model definition; validateFamily's own tierDefaults.mid.model-must-resolve rule continues to enforce this at load time.

**Call sites:**
- `src/assets/models/cloud-model-catalog.json:59`

### 4.3 `model-check.ts's checkVibe effort classification` — invariant-change

Reclassifies a never-attempted or no-usable-evidence effort from 'recognised-unconfirmed' to 'rejected', reusing checkClaude's and the shared notChecked helper's own existing precedent for this exact meaning; reserves 'recognised-unconfirmed' strictly for a genuinely completed, model-confirmed run with only the specific effort's effective application unverifiable.

**Call sites:**
- `src/daemon/model-check.ts:308-335`
- `src/daemon/model-check.ts:435-457`
- `src/daemon/model-check.ts:272-283`

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Unchanged from round 3: checkVibe mirrors sc1's VibeNewSession model/thinking flag semantics via buildSelectionArgs and the verified-safe approval flag via buildApprovalArgs (round 2's still-pending additive export amendment). This round's catalog rename and classification correction touch neither sc1's shape nor this interaction. |

## 6. Error paths

**Error cases**

- **A claimed effort is never actually probed because the shared overall deadline is exhausted before its turn.** (recoverable)
  - Detection: Elapsed-time check against the shared budget before starting the probe.
  - Response: Verdict 'rejected', evidence naming the exhausted time budget -- now genuinely blocked from approval by approveCheck's existing rule, not merely documented as a risk.
  - User impact: A user cannot approve an effort that was never actually attempted.
- **An individual effort probe is unreachable, times out, or returns a malformed/unparseable export with no completion evidence of any kind.** (recoverable)
  - Detection: The existing unreachable()/timeout check, or readVibeExportEvidence's own read/parse failure yielding all-undefined fields with no outcome/error signal at all.
  - Response: Verdict 'rejected', evidence naming the specific probe/read failure -- reusing checkClaude's own existing 'no affirmative basis' meaning for this verdict, not an invented new semantics.
  - User impact: A tooling/environment failure can no longer be approved as if it were a genuinely-run, merely-unconfirmed effort.
- **A claimed effort's probe DOES complete, with the model positively confirmed via vibeActiveModelMatches, but neither refusal signal is present and the export carries no effective-thinking field.** (recoverable)
  - Detection: vibeThinkingDowngradeWarning returns false AND readVibeExportEvidence's outcome/errorMessage names no refusal, with a genuine success-class outcome present.
  - Response: Verdict 'recognised-unconfirmed' -- the ONLY case this verdict is now reserved for; evidence states the model was confirmed but the effort's effective application is unverifiable.
  - User impact: A user approving this verdict knows the model genuinely ran; the distinction from 'never attempted' is now real, not just a wording difference.
- **The model-liveness probe exits cleanly but export.json's active_model is missing, absent, or a genuinely different model than requested (not the renamed canonical id or a declared alias of it).** (recoverable)
  - Detection: vibeActiveModelMatches(ctx.modelId, evidence.activeModel, registry) returns false.
  - Response: runs:false with an error naming the mismatch; no effort probes run.
  - User impact: A silent model substitution can never be mistaken for a confirmed liveness success.
- **The catalog JSON's id rename and tierDefaults.mid reference are edited inconsistently (one updated, the other left pointing at the pre-rename id).** (recoverable)
  - Detection: validateFamily's existing tierDefaults.mid.model-must-resolve check fails to resolve the stale id against the renamed models list.
  - Response: validateModelCatalog throws ModelCatalogValidationError naming the faulty entry; the daemon fails fast at boot.
  - User impact: A build-time/boot-time failure with a clear reason, never a silent dangling reference.
- **A user who read round 3's LLD or an earlier check result assumes 'recognised-unconfirmed' always means 'the model ran, only the effort is unproven' -- now additionally true by construction rather than by convention alone.** (terminal)
  - Detection: This is a design clarification, not a runtime detection -- recorded here because it changes what a consumer of a stored ApprovedProfile should infer from 'recognised-unconfirmed' going forward.
  - Response: Documented plainly in the LLD; not a behavior this Story needs to migrate existing stored profiles for, since the stored verdict STRING is unchanged ('recognised-unconfirmed' already existed) -- only which SITUATIONS map to it going forward.
  - User impact: A profile decided under the OLD (pre-round-4) classification may still carry 'recognised-unconfirmed' for what would now be classified 'rejected'; this is the exact legacy-evidence gap named in finding 3, applying prospectively only.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A requested id is the renamed canonical id 'mistral-medium-latest' itself (not an alias). | vibeActiveModelMatches's direct-equality branch matches immediately; no alias resolution needed. |
| A requested id is one of the two declared aliases ('mistral-vibe-cli-latest' or 'mistral-medium-3.5'). | registry.find resolves either alias to the renamed model, whose canonical id now equals the observed active_model -- the matcher's resolved-canonical-id branch now genuinely passes for the exact shipped case the review tested. |
| A requested id is NOT a catalog-declared alias of the model actually observed running (a real, unexpected substitution). | vibeActiveModelMatches returns false; the live-matrix assertion FAILS -- never silently passes a substitution the catalog does not itself declare. |
| A persisted tier setting or approved-model-store entry already references the OLD id 'mistral-vibe-cli-latest' before this round ships. | resolveName still matches it as a declared alias after the rename (it is retained, not dropped), so an existing reference keeps resolving to the same model unchanged. |

**Invariants to preserve**

- A positive model-level claim requires the observed active_model to equal the requested id's resolved canonical id (directly or via a declared alias); the catalog's own canonical naming must agree with what the installed binary itself reports as canonical for any such claim to ever be checkable. [[c1]]
- checkVibe's effort verdict 'rejected' must mean 'no affirmative basis to believe this effort is supported' -- including a genuine no-usable-run failure -- exactly as checkClaude's own existing procedure already uses it, not only 'the CLI actively refused it at runtime'. [[c2]]
- The shared notChecked helper's existing convention (every claimed effort reported 'rejected' when the model-level CLI call is unreachable) must be the model this Story's own effort-level no-usable-run cases follow, not a separate, inconsistent convention. [[c3]]
- approveCheck's existing, unchanged rule (block only on a literal 'rejected' verdict) is the mechanism this Story's classification must route a no-usable-run effort through to achieve genuine admission control, since widening the rule itself is outside this Story's scope. [[c4]]
- ApprovedProfile's cliVersion/decidedAt fields cannot distinguish which check-procedure version produced a profile; this Story's positive-evidence guarantee is prospective only, an accepted limitation of the other Epic's own contract shape. [[c5]]

## 7. Test strategy

**Test framework:** `vitest`

**Test levels**

- **unit** — Verify the renamed catalog's alias resolution, and checkVibe's revised classification table in isolation.
  - Subjects: `validateModelCatalog loads the renamed catalog without throwing; tierDefaults.mid resolves to the model now canonically named 'mistral-medium-latest'`, `resolveName matches BOTH 'mistral-vibe-cli-latest' and 'mistral-medium-3.5' as aliases of the renamed model`, `vibeActiveModelMatches returns true when requestedId is 'mistral-vibe-cli-latest' and observedActiveModel is 'mistral-medium-latest' -- the exact shipped case the review's finding 2 demonstrated as failing`, `An effort never probed (deadline exhausted before its turn) is classified 'rejected' with evidence naming the exhausted budget`, `An effort probe that is unreachable, times out, or returns a malformed export with no completion evidence is classified 'rejected'`, `A claimed effort whose probe completes with the model confirmed and neither refusal signal present is classified 'recognised-unconfirmed' -- and ONLY this case produces that verdict`, `A deliberately-broken tierDefaults.mid (pointing at a non-resolving id) throws ModelCatalogValidationError (regression guard for an inconsistent rename edit)`
  - Fixtures: `A temp models-asset directory (via _setModelCatalogDirForTests) holding the renamed catalog JSON plus a deliberately-broken variant for the regression guard`, `A fake Run seam (ModelCheckDeps.run) returning scripted ProcessGroupResult + export.json content per call`, `A test ModelRegistry fixture exercising vibeActiveModelMatches's alias-equivalence path against the real catalog's renamed entry`
- **integration** — Exercise checkModel->approveCheck end to end, proving a never-attempted effort cannot enter a dispatchable (approved) profile under the EXISTING approveCheck contract.
  - Subjects: `checkModel for a never-probed effort (budget exhaustion) returns verdict 'rejected'; approveCheck REFUSES to approve it (invalid-efforts) -- the integration test the review explicitly asked for, proving the fix structurally, not just by documentation`, `checkModel for a probe-failure effort (unreachable/malformed export) likewise returns 'rejected' and is likewise refused by approveCheck`, `approveCheck still accepts an effort whose verdict is 'recognised-unconfirmed' from a genuinely completed, model-confirmed run -- confirming the narrowed case is still approvable exactly as claude/codex's existing informed-consent pattern already allows`, `checkModel's existing invalid-params guard for an already-listed modelId is unaffected by the rename or the classification change`
- **live** — Record real, alias-aware acceptance evidence across the whole shipped cli-vibe family against the installed binary, now exercising the renamed catalog entry.
  - Subjects: `Every shipped cli-vibe model id (including the renamed 'mistral-medium-latest' and its retained aliases 'mistral-vibe-cli-latest'/'mistral-medium-3.5') dispatches successfully with vibeActiveModelMatches confirming the observed active_model`, `Every shipped model's full declared efforts list runs without a stderr downgrade match or an export.json backend rejection`, `The tier defaults (core/mid/cheap) and the summariser model each resolve to a model this sweep confirms via vibeActiveModelMatches, including the renamed mid-tier default`
  - Fixtures: `Gated behind INSRC_LIVE_TESTS=1, matching the project's existing live-service test convention`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: vibeActiveModelMatches returns true for the exact shipped mistral-vibe-cli-latest/mistral-medium-latest pair the review demonstrated as failing`, `live: every shipped cli-vibe model x its full declared efforts list dispatches successfully, with vibeActiveModelMatches confirming the effective model including the renamed mid-tier default` |
| `ac2` | `unit: an effort whose probe genuinely completes with the model confirmed is classified 'recognised-unconfirmed', never 'accepted' -- the evidence text accurately reflects what was and was not verified`, `integration: approveCheck persists a genuinely-run, model-confirmed effort exactly as its evidence describes` |
| `ac3` | `integration: a never-attempted or probe-failed effort is classified 'rejected' and approveCheck REFUSES to approve it -- an unattempted effort cannot enter a dispatchable profile, closing the review's finding 1 with a structural integration test, not documentation alone`, `unit: a stderr downgrade match or an export.json backend rejection yields verdict 'rejected' for a genuinely-probed effort` |

## 8. Migration

**State before:** Per this round's bundles: the shipped catalog's mid-tier entry has canonical id 'mistral-vibe-cli-latest' with alias 'mistral-medium-3.5' (bundle 1); vibeActiveModelMatches (round 3) resolves this id to itself via resolveName, never to the real binary's reported active_model 'mistral-medium-latest', so the matcher cannot pass for the shipped case. checkClaude's existing procedure (bundle 2) and the shared notChecked helper (bundle 3) already use verdict 'rejected' for a no-affirmative-basis/unreachable case; round 2/3's checkVibe inconsistently used 'recognised-unconfirmed' for an effort-level no-usable-run case instead. approveCheck (bundle 4) blocks only 'rejected'. ApprovedProfile (bundle 5) has no procedure-version field.

**State after:** The catalog's mid-tier model entry's canonical id is 'mistral-medium-latest', with 'mistral-vibe-cli-latest' and 'mistral-medium-3.5' both retained as declared aliases; tierDefaults.mid references the renamed id. vibeActiveModelMatches now has a real passing case for this model against the installed binary's own reported active_model. checkVibe's effort classification reclassifies any no-usable-run case (never attempted, unreachable, malformed export) as 'rejected', aligned with checkClaude's and notChecked's own existing convention; 'recognised-unconfirmed' is reserved strictly for a genuinely completed, model-confirmed run. approveCheck's existing rule now genuinely blocks a never-attempted effort.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Rename the cli-vibe family's mid-tier model entry's canonical id in cloud-model-catalog.json from 'mistral-vibe-cli-latest' to 'mistral-medium-latest', adding both 'mistral-vibe-cli-latest' and the existing 'mistral-medium-3.5' as declared aliases. — ↩ rollbackable
2. Update tierDefaults.mid.model to the renamed id. — ↩ rollbackable
3. Reclassify checkVibe's effort-level no-usable-run cases (never probed due to exhausted shared deadline, or probe unreachable/timed out/malformed export with no completion evidence) from 'recognised-unconfirmed' to 'rejected', aligning with checkClaude's and the shared notChecked helper's existing convention. — ↩ rollbackable
4. Narrow 'recognised-unconfirmed' to apply only when a probe genuinely completes, the model is positively confirmed via vibeActiveModelMatches, and neither refusal signal is present. — ↩ rollbackable
5. Add the integration test proving a never-attempted or probe-failed effort is now refused by approveCheck's existing, unchanged rule. — ↩ rollbackable
6. Add the LLD's explicit, prospective-only legacy-evidence statement for ApprovedProfile's cliVersion/decidedAt fields, and firm up s1's named ownership of the dispatch-time/resume-selection half of ac3. — ↩ rollbackable

**Backward compat:** No exported function signature changes anywhere; checkVibe remains internal and checkModel/approveCheck/EffortVerdict/ApprovedProfile are all untouched. The catalog rename keeps both the old id ('mistral-vibe-cli-latest') and the existing display alias ('mistral-medium-3.5') as declared aliases, so any existing persisted tier setting, UI selection or approved-model-store entry naming the old id keeps resolving unchanged via resolveName. A profile already approved under the pre-round-4 classification (which could have recorded 'recognised-unconfirmed' for what this round now classifies 'rejected') remains recorded as-is in the append-only store; this Story's stronger admission guarantee applies prospectively, to checks run after this round ships.

## 9. Alternatives considered

### 9.1 a1: Rename the catalog's canonical id to match the binary's own canonical naming, reclassify no-usable-run efforts as 'rejected' reusing existing precedent, and state the legacy-evidence/ownership boundaries explicitly — **CHOSEN**

Rename 'mistral-vibe-cli-latest' to 'mistral-medium-latest' (keeping both the old id and 'mistral-medium-3.5' as declared aliases) so vibeActiveModelMatches has a real passing path; split checkVibe's no-usable-run effort cases into verdict 'rejected' (reusing checkClaude's and notChecked's own existing precedent for this exact meaning), reserving 'recognised-unconfirmed' for a genuinely completed, model-confirmed run; state plainly that the new evidence guarantee is prospective-only and name s1's dispatch-time ownership concretely.

cloud-model-catalog.json's cli-vibe mid-tier entry's canonical `id` is renamed from 'mistral-vibe-cli-latest' to 'mistral-medium-latest' -- the id the installed binary's own export.json reports as active_model and treats as canonical in its own catalog_model_aliases table -- while 'mistral-vibe-cli-latest' and the existing 'mistral-medium-3.5' both become declared aliases, and tierDefaults.mid.model is updated to the renamed id. This gives vibeActiveModelMatches's registry.find-based lookup a real model whose canonical id equals the observed active_model for the shipped case the review tested. checkVibe's effort classification keeps round 3's ordered structure but corrects cases (3)/(4): a claimed effort never probed at all (shared deadline exhausted before its turn) or whose probe never produced usable completion evidence (unreachable, timeout, malformed export) is now verdict 'rejected' -- the exact, already-established meaning checkClaude's own undefined-names branch and the shared notChecked helper already give 'rejected' ('no affirmative basis', not strictly 'actively refused at runtime') -- so approveCheck's EXISTING block-only-on-'rejected' rule now genuinely refuses it, with no widening of EffortVerdict. 'recognised-unconfirmed' is reserved strictly for case (2): a run that actually completed with the model positively confirmed, where only the specific effort's effective application remains unverifiable. The LLD states plainly that this Story's positive-evidence guarantee is PROSPECTIVE ONLY (a profile decided under a prior procedure version is not distinguishable from a new one by cliVersion/decidedAt alone, an accepted limitation of the other Epic's ApprovedProfile shape), and names s1's VibeSelectionError/resume-selection semantics, with their own existing BUILD/TESTS coverage, as the concrete, already-built owner of the HLD's dispatch-time and saved-session requirements -- unaffected by and independent of anything in this Story.

### 9.2 a2: Leave the catalog unchanged; bridge the two alias systems with a separate, hand-written mapping table inside model-check.ts

Reject: duplicates alias knowledge in a third place, risks drifting from the real binary's own alias table across a future vibe version, and leaves the catalog's own self-description (settings UI, docs) still naming an id the binary does not consider canonical.

Add a small static map (e.g. {'mistral-vibe-cli-latest': 'mistral-medium-latest'}) inside model-check.ts that vibeActiveModelMatches consults in addition to registry.find, without touching the catalog's own id/alias data.

**Rejected because:** Would close ac1's matching gap for the one known pair, but at the cost of a second, independently-maintained alias table that can silently drift from the real binary's own naming, and does not fix the catalog's own self-description for other consumers.

### 9.3 a3: Rename the catalog id as in a1, but widen EffortVerdict with a new 'not-run' value instead of reusing 'rejected'

Reject (same reasoning as round 3's rejected a2): closes finding 1 with a structural guarantee, but requires a cross-Epic contract change outside this Story's mandate.

Same catalog rename as a1, but add a fourth EffortVerdict value and have approveCheck refuse it alongside 'rejected'.

**Rejected because:** Would satisfy ac1-ac3 as fully as a1, but at the cost of a cross-Epic contract change this Story has no mandate to make -- the same anti-overreach violation already rejected in round 3.

### 9.4 a4: Fix findings 1 and 3 as in a1, but leave the catalog id unchanged and hardcode the one known mistral-vibe-cli-latest/mistral-medium-latest pair inside vibeActiveModelMatches

Reject: a hardcoded special case is a third, even more fragile alias mechanism, and the review explicitly offered the catalog rename as its preferred remedy over inventing a new relation.

Keep the catalog's id as 'mistral-vibe-cli-latest'; add a literal exception inside vibeActiveModelMatches recognizing this one pair as equivalent, alongside the registry-based lookup for every other model.

**Rejected because:** Closes ac1's immediate test case via a hardcoded exception, but is the most fragile of the rejected alternatives: a special case with no catalog signal at all if the real binary's own canonical naming ever changes.

## 10. References

- **[[c1]]** `code` `src/assets/models/cloud-model-catalog.json:45-62`
- **[[c2]]** `code` `src/daemon/model-check.ts:272-283`
- **[[c3]]** `code` `src/daemon/model-check.ts:308-335`
- **[[c4]]** `code` `src/daemon/model-check.ts:435-457`
- **[[c5]]** `code` `src/daemon/model-registry.ts:49-58`

## 11. Open questions

- testFramework is inferred as 'vitest' from repository convention; no convention.detect analyzeBundle was run to confirm it.
- approveCheck (model-check.ts:435-457, the sc4 contract of Epic ce99b72065d03b1b) blocks approval only on a literal 'rejected' verdict; this round routes every no-usable-run effort through that exact value, closing the admission gap within the existing contract. No further widening of EffortVerdict is proposed.
- ApprovedProfile's cliVersion/decidedAt fields cannot identify which check-procedure version produced a profile; this Story's stronger admission guarantee is prospective only. A procedure-provenance field is a back-flow candidate for the owning Epic (ce99b72065d03b1b), not something s5 invents.
- A staleness-comparison UI for legacy approvals belongs to the settings-consuming story per this Story's own boundary text, not to s5.

## Citations

- **[[c1]]** `code` `src/assets/models/cloud-model-catalog.json:45-62`
- **[[c2]]** `code` `src/daemon/model-check.ts:272-283`
- **[[c3]]** `code` `src/daemon/model-check.ts:308-335`
- **[[c4]]** `code` `src/daemon/model-check.ts:435-457`
- **[[c5]]** `code` `src/daemon/model-registry.ts:49-58`
