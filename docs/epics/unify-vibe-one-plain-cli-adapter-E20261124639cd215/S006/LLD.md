<!-- insrc:artifact LLD-639cd2159a87aedb-s6 -->

# LLD: STORY-639cd2159a87aedb-s6 — The Vibe issue ledger reflects reality, with evidence

## Summary

**Epic:** `unify-vibe-one-plain-cli-adapter`
**HLD base run:** `wf-1795535373279-l4wumn`
**HLD effective hash:** `67d59677de6a...`
**Tracker:** [insors-ai/insrc#324](https://github.com/insors-ai/insrc/issues/324)

This Story reconciles five open Vibe-integration issue records against the evidence this Epic's other Stories actually produce. It touches no application code: its only artifacts are the ISSUE records themselves, each updated with a specific, evidence-cited outcome -- closed with proof once its owning Story builds, reopened if a live check fails, or explicitly marked as deferred on the review rewrite rather than left as a stale open claim against machinery that no longer exists. This round also correctly files the HLD amendment for sc3's provenAgainst field (round 2's attempt used the wrong amendment type and was silently dropped by the applier; this round uses sharedContract.fieldRemove, verified against the applier's own code).

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

**Stories covered:** `s1`, `s2`, `s3`, `s4`, `s5`

Unchanged from round 2's own findings (s1 built sc1/sc2; s2/s3/s4 approved-not-built; s5 approved-not-built, its own live dispatch evidence already closes c9's catalog-coverage half). This round adds no new Epic-impact finding beyond correcting HOW the sc3 amendment gap gets tracked.

**Sources:**
- .insrc/artifacts/BUILD-639cd2159a87aedb-s1.json
- docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/S002/LLD.md
- docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/HLD.md
- src/workflow/amendments/types.ts
- src/workflow/amendments/applier.ts
- src/workflow/orchestrator.ts

## 2. HLD context

> See **HLD-639cd2159a87aedb** § 2. Framework summary

**Rollout phase:** Phase C — Ledger reconciliation
**Consumes:** `sc3` (Adapter-owned read-only authorization and its qualification evidence)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Everything behind the adapter interface. — owns `sc1`, `sc2`
- `s2`: The narrow-authorization design itself. — owns `sc3`
- `s3`: The chat surface migration.
- `s4`: The reader's internals (TOML config). — owns `sc4`
- `s5`: The model-family alignment.

## 3. Contract details

**Surface level:** internal

## 4. Data model changes

### 4.1 `ISSUE-910fce32967bc4ea (Pass Vibe chat prompts correctly in programmatic mode)` — field-modify

Closed once s3 builds, citing s3's own TESTS record confirming all five live-verification cases (new turn, resumed turn, title generation, multiline prompt, option-like-text prompt) pass against the installed binary with no backend-path regression; reopened with the specific failing case recorded if any does not pass.

**Call sites:**
- `docs/standalone/pass-vibe-chat-prompts-correctly-programmatic-E20261105910fce32/ISSUE.md`

### 4.2 `ISSUE-d3e72fe73ee775a2 (Vibe's read-only session cannot call the insrc MCP analyze tools headlessly)` — field-modify

Closed once s2 builds, citing sc3's ReadOnlyCapability.provenAgainst record using s2's CURRENT field shape -- { stableDescriptorHash, effectiveConfigFingerprint } -- not the HLD's original, now-superseded { binaryVersion, effectivePolicy } shape. This is the evidence that the --agent approval gate this issue names is now correctly qualified rather than bypassed.

**Call sites:**
- `docs/standalone/vibe-s-read-only-session-cannot-E20261124d3e72fe7/ISSUE.md`
- `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/S002/LLD.md`

### 4.3 `ISSUE-0b3114f87754959b (Read Vibe configs with a real TOML parser)` — field-modify

Closed once s4 (sc4) builds, citing s4's own validation record confirming the real-TOML parse-for-understanding engine replaces the three named heuristics and handles the three reproduction cases correctly.

**Call sites:**
- `docs/standalone/read-vibe-configs-real-toml-parser-E202611090b3114f8/ISSUE.md`

### 4.4 `ISSUE-738d62b848fd173f (Fix Claude on Ollama and Mistral Vibe streaming reviews) -- catalog-coverage sub-point only` — field-modify

The versioned-model catalog-coverage sub-point is annotated as resolved NOW, citing the catalog's current, already-shipped mistral-large-4 entry and this Epic's own live dispatch evidence (s5's approved LLD) proving --model mistral-large-4 runs successfully with all three declared efforts. This annotation does not wait on s5's own build.

**Call sites:**
- `docs/standalone/preserve-ollama-routing-claude-streaming-reviews-E20261110738d62b8/ISSUE.md`
- `src/assets/models/cloud-model-catalog.json:51`

### 4.5 `ISSUE-738d62b848fd173f (Fix Claude on Ollama and Mistral Vibe streaming reviews) -- Ollama/activity-review sub-point only` — field-modify

The Ollama activity-mode preflight defect and activity-mode review sub-point is annotated as DEFERRED, pending the review rewrite -- the activity-mode review machinery this sub-point depends on does not currently exist in src/. Annotated in place within the SAME record as the catalog-coverage sub-point above, not split into a separate issue.

**Call sites:**
- `docs/standalone/preserve-ollama-routing-claude-streaming-reviews-E20261110738d62b8/ISSUE.md`

### 4.6 `ISSUE-30962d0f44df1e76 (Support activity-supervised reviews through Mistral Vibe CLI)` — field-modify

Annotated as DEFERRED, pending the review rewrite, for the same reason: native Vibe activity-supervised review support is new capability work predicated on the activity-review protocol this Epic does not implement and the review rewrite has not yet re-established.

**Call sites:**
- `docs/standalone/support-activity-supervised-reviews-through-mistral-E2026110430962d0f/ISSUE.md`

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | consumes | This Story's reconciliation of ISSUE-d3e72fe73ee775a2 cites sc3's provenAgainst field using s2's OWN CURRENT shape -- { stableDescriptorHash, effectiveConfigFingerprint } -- as defined in s2's approved LLD (section 4.1). This Story files the missing HLD amendment (below), correctly typed this round, to close that sync gap formally. |

## 6. Error paths

**Error cases**

- **s3's live verification of the prompt-transport fix finds a failing case.** (recoverable)
  - Detection: s3's own TESTS record reports a failed case for one of the five named prompt-transport scenarios.
  - Response: ISSUE-910fce32967bc4ea is reopened citing the specific failing case and its evidence.
  - User impact: A genuinely-unfixed prompt-transport defect is never misreported as closed.
- **s2's live qualification suite fails to qualify the read-only mode.** (recoverable)
  - Detection: sc3's own status field, read from s2's build evidence.
  - Response: ISSUE-d3e72fe73ee775a2 stays open, citing the specific qualification failure reason.
  - User impact: The read-only MCP-tool defect is never closed while unavailable.
- **s4's own validation record shows one of the three TOML reproduction cases still fails.** (recoverable)
  - Detection: s4's validation record reports a failing case.
  - Response: ISSUE-0b3114f87754959b stays open, citing the specific failing reproduction case.
  - User impact: The TOML-parsing defect is never closed while a real reproduction case still fails.
- **A future change to the shipped catalog removes or renames the mistral-large-4 entry.** (recoverable)
  - Detection: validateModelCatalog's own existing load-time validation would surface a removed/renamed entry.
  - Response: Reconciliation is a point-in-time record; a later regression is a NEW defect, not a reopening.
  - User impact: Reconciliation records a fact as of when it was checked.
- **A reader of ISSUE-738d62b848fd173f sees only one annotation and assumes it applies to the WHOLE record.** (recoverable)
  - Detection: Documentation-clarity risk, not a runtime detection.
  - Response: Each annotation explicitly names which sub-point it addresses.
  - User impact: A reader cannot mistake a partial resolution for the record's full state.
- **An HLD amendment proposal is raised with a type/shape the applier's dry-run rejects, and the orchestrator's catch-and-warn behavior drops it silently without surfacing the failure to the author.** (recoverable)
  - Detection: Direct re-verification this round: listing .insrc/artifacts/AMD-* after round 2's own synthesis confirmed no artifact was written, despite the step response having been accepted; cross-referencing orchestrator.ts's dry-run try/catch (which logs a warning and continues) and applyRename's actual field requirements explained why.
  - Response: This round re-verifies the amendment's exact shape against the applier's own code BEFORE resubmitting, rather than trusting that step-level acceptance implies successful filing.
  - User impact: The amendment this Story depends on (ac4) is actually tracked this time, not silently dropped a second time.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| c8 and c9's Ollama/activity-review sub-point are both deferred for the SAME underlying reason. | Each record carries its own deferred-dependency annotation independently. |
| A Story this reconciliation depends on is built but its own BUILD record shows a FAILED task unrelated to the specific evidence s6 cites. | s6's reconciliation cites only the SPECIFIC task/test evidence relevant to the record being closed. |
| The catalog-coverage sub-point's closure is checked AFTER s5 also builds its own, unrelated catalog change. | s5's own build does not touch mistral-large-4 at all; the closure's cited evidence remains valid and unaffected. |
| A future Story's own context.assemble step re-derives the HLD context slice for sc3 before this round's amendment has been formally decided, seeing the marker this round's fieldRemove appends alongside the still-present original field text. | The interfaceSketch after a fieldRemove amendment is APPLIED carries both the original line and a trailing removal marker citing this amendment's id and migrationCue -- a reader sees the removal is intentional and documented. |

**Invariants to preserve**

- A record closes only with the specific evidence that actually supports it. [[c1]]
- A catalog-coverage concern already resolved by data present in the repo today must be recorded as fixed on that evidence now. [[c2]]
- A record whose fix intent depends on review machinery that does not currently exist must carry an explicit deferred dependency on the review rewrite. [[c3]]
- s6 cannot itself re-verify a fix live; every closure it records must cite the OWNING Story's own build/test evidence. [[c4]]
- Reconciliation targets the specific evidence cited for each record, not a Story's overall build pass/fail status. [[c5]]
- When a shared contract's HLD-documented shape and its owning Story's approved LLD shape diverge, a downstream consumer cites the owning Story's own artifact until the amendment that reconciles them is applied -- and an amendment proposal's acceptance into an LLD body is NOT itself proof it was validly filed; verify its shape against the applier's own code. [[c6]]

## 7. Test strategy

**Test framework:** `node:test`

**Test levels**

- **contract** — Verify each reconciled ISSUE.md's final annotation is backed by exactly the evidence it cites.
  - Subjects: `ISSUE-910fce32967bc4ea's closure (or reopening) cites s3's actual TESTS record and names the specific case(s) it checked`, `ISSUE-d3e72fe73ee775a2's closure cites sc3's actual ReadOnlyCapability.provenAgainst value from s2's build USING s2's current field names (stableDescriptorHash, effectiveConfigFingerprint), not the stale HLD ones`, `ISSUE-0b3114f87754959b's closure cites s4's actual validation record and names which of the three reproduction cases it covers`, `ISSUE-738d62b848fd173f's two independent annotations (catalog-coverage closure; Ollama/activity-review deferral) each name exactly the sub-point text they address, with neither annotation omitted or merged`, `ISSUE-30962d0f44df1e76's deferral annotation names the review rewrite as the explicit blocking dependency, not a vague 'future work' note`
  - Fixtures: `Direct comparison of each ISSUE.md's final text against the specific BUILD/TESTS artifact path it cites, performed when s6 itself is validated`
- **smoke** — Confirm, at the point s6 is itself validated, that every cited upstream artifact actually exists, AND that this round's HLD amendment was actually persisted (not silently dropped, as round 2's was).
  - Subjects: `s3's TESTS record exists and reports the five named prompt-transport cases before ISSUE-910fce32967bc4ea is closed on it`, `s2's BUILD record exists and sc3's ReadOnlyCapability.status is 'qualified' before ISSUE-d3e72fe73ee775a2 is closed on it`, `s4's BUILD/validation record exists before ISSUE-0b3114f87754959b is closed on it`, `The catalog's mistral-large-4 entry and this Epic's own live-dispatch evidence are present before ISSUE-738d62b848fd173f's catalog-coverage sub-point is closed`, `the filed amendment exists as a tracked AMD-* artifact for sc3's provenAgainst rename and is readable via the workflow's own amendment listing`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `contract: ISSUE-910fce32967bc4ea's closure/reopening cites s3's actual TESTS record content, naming any failing case explicitly if verification fails` |
| `ac2` | `contract: ISSUE-738d62b848fd173f's catalog-coverage sub-point closes citing the shipped mistral-large-4 entry and this Epic's live dispatch evidence, independent of any unrelated Story's build` |
| `ac3` | `contract: ISSUE-30962d0f44df1e76 and ISSUE-738d62b848fd173f's Ollama/activity-review sub-point both carry an explicit review-rewrite deferral annotation, never an open claim implying removed machinery still exists` |
| `ac4` | `contract: ISSUE-d3e72fe73ee775a2 closes citing sc3's actual provenAgainst evidence from s2's build, using s2's current field names`, `contract: ISSUE-0b3114f87754959b closes citing s4's actual validation record`, `smoke: the filed amendment exists as a tracked AMD-* artifact for sc3's provenAgainst rename and is readable via the workflow's own amendment listing` |

## 8. Migration

**State before:** Per this round's bundles: five open ISSUE records exist, each describing a Vibe-integration defect or capability gap, none yet carrying evidence-cited closure/defer annotations. Separately, s2's own approved LLD already amends sc3's provenAgainst shape from the HLD's original { binaryVersion, effectivePolicy } to { stableDescriptorHash, effectiveConfigFingerprint }, but round 2 of this Story's own attempt to raise this as a tracked HLD amendment used the wrong type (sharedContract.rename, which renames a contract's own display name, not a field inside its interfaceSketch) and was silently dropped by the orchestrator's dry-run against the applier (confirmed this round by direct re-read of src/workflow/amendments/applier.ts and orchestrator.ts) -- no AMD-* artifact exists on disk for this Epic despite that round's step having been accepted.

**State after:** Each of the five ISSUE records carries a specific, evidence-grounded annotation using CURRENT (not stale) field names. The HLD amendment for sc3's provenAgainst field is filed using the CORRECT type (sharedContract.fieldRemove, contractId sc3, fieldName provenAgainst, breaking:true, migrationCue naming the replacement shape and citing s2's LLD) -- verified this round against applyFieldRemove's actual requirements, so it is collected, dry-run successfully, and persisted as a tracked AMD-* artifact this time.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Annotate ISSUE-738d62b848fd173f's catalog-coverage sub-point as resolved, citing the shipped mistral-large-4 entry and this Epic's live dispatch evidence. — ↩ rollbackable
2. Annotate ISSUE-738d62b848fd173f's Ollama/activity-review sub-point as deferred, citing the review rewrite as the explicit blocking dependency. — ↩ rollbackable
3. Annotate ISSUE-30962d0f44df1e76 as deferred, citing the review rewrite as the explicit blocking dependency. — ↩ rollbackable
4. Once s3 builds: annotate ISSUE-910fce32967bc4ea as closed, citing s3's own TESTS record's five prompt-transport cases -- or reopened, citing the specific failing case. — ↩ rollbackable
5. Once s2 builds: annotate ISSUE-d3e72fe73ee775a2 as closed, citing sc3's ReadOnlyCapability.provenAgainst record using s2's current field names. — ↩ rollbackable
6. Once s4 builds: annotate ISSUE-0b3114f87754959b as closed, citing s4's own validation record. — ↩ rollbackable
7. File the HLD amendment (sharedContract.fieldRemove on sc3's provenAgainst field, this round's corrected type) so the HLD document and s2's LLD no longer disagree -- superseding round 2's silently-dropped sharedContract.rename attempt. — ↩ rollbackable

**Backward compat:** This Story changes no application code, exported API, or shared contract directly -- only the prose content of five existing ISSUE.md records, plus filing one HLD amendment that formalizes a shape change s2's own LLD already made and s2's own (not yet built) code will rely on. Nothing consumes the ISSUE records as a machine-readable contract outside the insrc workflow's own ledger tooling. The HLD amendment itself is breaking (sc3's provenAgainst field is removed, with its replacement named in the migrationCue), but it only formalizes a change s2's approved LLD already carries -- no shipped BUILD ever used the old shape, so there is no runtime backward-compat break to manage.

## 9. Alternatives considered

### 9.1 a1: Evidence-cited annotation in place, with the amendment correctly filed this time — **CHOSEN**

Annotate each existing ISSUE.md in place with evidence-specific close/reopen/defer outcomes, citing s2's current (amended) sc3 field names, and raise the missing HLD amendment for that rename via the correct sharedContract.fieldRemove type.

No new tracked record is created. Each of the five existing standalone ISSUE.md files gets a targeted prose annotation naming the specific upstream evidence (Story build/test record or shipped catalog data) that closes, reopens, or defers it. For the read-only-session issue, the annotation cites sc3's ReadOnlyCapability.provenAgainst using s2's own current field names (stableDescriptorHash, effectiveConfigFingerprint). Because round 2's amendment attempt used the wrong type (sharedContract.rename, semantically a contract-name rename, not a field-shape change) and was silently dropped by the applier's dry-run, this round raises the CORRECT type (sharedContract.fieldRemove on sc3's provenAgainst field, with a migrationCue citing the replacement shape), verified this round against the applier's own code.

### 9.2 a2: File a new tracked issue for the amendment gap instead of amending in place

Open a new standalone ISSUE for 'HLD amendments proposed but never filed' rather than raising the sc3 amendment directly from this Story.

Rather than this Story proposing the HLD amendment itself, file a new ISSUE.md describing the general defect that amendment proposals from s2/s3/s5 were never tracked as AMD artifacts, and let a future triage cycle size and route the actual fix.

**Rejected because:** Punts the amendment to a future triage cycle instead of filing it correctly now, when s6 is already positioned to.

### 9.3 a3: Defer the catalog-coverage concern onto the review-rewrite dependency

Fold the versioned-model catalog-coverage sub-point into the same review-rewrite deferral as the Ollama/activity-review sub-point, rather than closing it now.

Treat ISSUE-738d62b8...'s two sub-points as a single unit and defer both on the review-machinery dependency, skipping the independent catalog-coverage closure this round's evidence already supports.

**Rejected because:** Fails ac2 directly: discards already-available closing evidence by folding it into an unrelated deferral.

### 9.4 a4: Close the review-dependent records wholesale instead of deferring them

Mark ISSUE-30962d0f... and the Ollama/activity-review sub-point of ISSUE-738d62b8... as closed, treating this Epic's adapter work as sufficient.

Declare the two review-machinery-dependent records resolved on the strength of this Epic's adapter and TOML work, without naming the review-rewrite dependency explicitly.

**Rejected because:** Fails ac3 directly: closes records whose fix intent is not implemented by anything this Epic ships.

## 10. References

- **[[c1]]** `prior-artifact` `docs/standalone/pass-vibe-chat-prompts-correctly-programmatic-E20261105910fce32/ISSUE.md`
- **[[c2]]** `code` `src/assets/models/cloud-model-catalog.json:51`
- **[[c3]]** `prior-artifact` `docs/standalone/remove-design-code-review-implementations-while-E20261116dae67bfc/S001/BUILD.md`
- **[[c4]]** `prior-artifact` `.insrc/artifacts/BUILD-639cd2159a87aedb-s1.json`
- **[[c5]]** `prior-artifact` `.insrc/artifacts/LLD-639cd2159a87aedb-s5.json`
- **[[c6]]** `prior-artifact` `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/S002/LLD.md`
- **[[c7]]** `code` `src/workflow/amendments/applier.ts:113-130`

## 11. Open questions

- Two other ungoverned pending export asks exist elsewhere in this Epic (s3's dependency on vibe-adapter.ts exporting buildArgv/readExitEvidence; s5's dependency on it exporting buildApprovalArgs) -- neither is owned by s6 or touched by this Story's boundary, and now that the correct amendment-filing mechanism (sharedContract.methodAdd for an export, verified this round against the applier's own types) is understood, the user should action those separately using the SAME verified mechanism.

## Citations

- **[[c1]]** `prior-artifact` `docs/standalone/pass-vibe-chat-prompts-correctly-programmatic-E20261105910fce32/ISSUE.md`
- **[[c2]]** `code` `src/assets/models/cloud-model-catalog.json:51`
- **[[c3]]** `prior-artifact` `docs/standalone/remove-design-code-review-implementations-while-E20261116dae67bfc/S001/BUILD.md`
- **[[c4]]** `prior-artifact` `.insrc/artifacts/BUILD-639cd2159a87aedb-s1.json`
- **[[c5]]** `prior-artifact` `.insrc/artifacts/LLD-639cd2159a87aedb-s5.json`
- **[[c6]]** `prior-artifact` `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/S002/LLD.md`
- **[[c7]]** `code` `src/workflow/amendments/applier.ts:113-130`
