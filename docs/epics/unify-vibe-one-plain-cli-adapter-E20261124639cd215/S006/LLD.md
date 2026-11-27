<!-- insrc:artifact LLD-639cd2159a87aedb-s6 -->

# LLD: STORY-639cd2159a87aedb-s6 — The Vibe issue ledger reflects reality, with evidence

## Summary

**Epic:** `unify-vibe-one-plain-cli-adapter`
**HLD base run:** `wf-1795535373279-l4wumn`
**HLD effective hash:** `67d59677de6a...`
**Tracker:** [insors-ai/insrc#324](https://github.com/insors-ai/insrc/issues/324)

This Story reconciles five open Vibe-integration issue records against the evidence this Epic's other Stories actually produce. It touches no application code: its only artifacts are the ISSUE records themselves, each updated with a specific, evidence-cited outcome -- closed with proof once its owning Story builds, reopened if a live check fails, or explicitly marked as deferred on the review rewrite rather than left as a stale open claim against machinery that no longer exists. This round also formally raises the HLD amendment for sc3's field rename that s2's own LLD proposed but never got tracked as an AMD artifact.

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

Unchanged from the prior round's epicImpact except for one addition: s2's LLD (still only approved, not yet built) amends sc3's provenAgainst shape to { stableDescriptorHash, effectiveConfigFingerprint }, but the HLD.md document was never updated to match, and no AMD artifact was ever filed despite s2's own migration step claiming one would be. This round's dataModelChanges entry for ISSUE-d3e72fe7... (closed via s2's evidence) must cite s2's actual, current field names, not the HLD's stale ones -- otherwise s6 would misdescribe the very evidence it depends on. s1's BUILD still shows t7 FAILED and 25 changed files, unchanged from the prior round's own review; s3/s4/s5 remain unbuilt, unchanged.

**Sources:**
- .insrc/artifacts/BUILD-639cd2159a87aedb-s1.json
- docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/S002/LLD.md
- docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/HLD.md

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

Closed once s2 builds, citing sc3's ReadOnlyCapability.provenAgainst record using s2's CURRENT field shape -- { stableDescriptorHash, effectiveConfigFingerprint } -- not the HLD's original, now-superseded { binaryVersion, effectivePolicy } shape. stableDescriptorHash is the binary identity + launch-profile fingerprint excluding the per-turn outputDir; effectiveConfigFingerprint is extracted from the qualification probe's own export.json self-report. This is the evidence that the --agent approval gate this issue names is now correctly qualified rather than bypassed.

**Call sites:**
- `docs/standalone/vibe-s-read-only-session-cannot-E20261124d3e72fe7/ISSUE.md`
- `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/S002/LLD.md`

### 4.3 `ISSUE-0b3114f87754959b (Read Vibe configs with a real TOML parser)` — field-modify

Closed once s4 (sc4) builds, citing s4's own validation record confirming the real-TOML parse-for-understanding engine replaces the three named heuristics (toml-mcp-writer.ts, mcp-register.ts, toml-inline-list.ts) and handles the three reproduction cases (quoted/dotted-key sections, inline-list registration, text-inside-a-multiline-string) correctly.

**Call sites:**
- `docs/standalone/read-vibe-configs-real-toml-parser-E202611090b3114f8/ISSUE.md`

### 4.4 `ISSUE-738d62b848fd173f (Fix Claude on Ollama and Mistral Vibe streaming reviews) -- catalog-coverage sub-point only` — field-modify

The versioned-model catalog-coverage sub-point ('the installed insrc Vibe catalog does not include the versioned Large 4 model that Mistral documents') is annotated as resolved NOW, citing the catalog's current, already-shipped mistral-large-4 entry and this Epic's own live dispatch evidence (s5's approved LLD) proving --model mistral-large-4 runs successfully with all three declared efforts. This annotation does not wait on s5's own build, since the catalog data closing this sub-point predates and is untouched by s5's own fix.

**Call sites:**
- `docs/standalone/preserve-ollama-routing-claude-streaming-reviews-E20261110738d62b8/ISSUE.md`
- `src/assets/models/cloud-model-catalog.json:51`

### 4.5 `ISSUE-738d62b848fd173f (Fix Claude on Ollama and Mistral Vibe streaming reviews) -- Ollama/activity-review sub-point only` — field-modify

The Ollama activity-mode preflight defect and 'the activity-mode review entry point rejects Vibe' sub-point is annotated as DEFERRED, pending the review rewrite -- the activity-mode review machinery this sub-point depends on does not currently exist in src/, so an open claim against it would describe removed machinery. Annotated in place within the SAME record as the catalog-coverage sub-point above, not split into a separate issue.

**Call sites:**
- `docs/standalone/preserve-ollama-routing-claude-streaming-reviews-E20261110738d62b8/ISSUE.md`

### 4.6 `ISSUE-30962d0f44df1e76 (Support activity-supervised reviews through Mistral Vibe CLI)` — field-modify

Annotated as DEFERRED, pending the review rewrite, for the same reason: native Vibe activity-supervised review support is new capability work predicated on the activity-review protocol this Epic does not implement and the review rewrite has not yet re-established.

**Call sites:**
- `docs/standalone/support-activity-supervised-reviews-through-mistral-E2026110430962d0f/ISSUE.md`

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | consumes | This Story's reconciliation of ISSUE-d3e72fe73ee775a2 cites sc3's provenAgainst field using s2's OWN CURRENT shape -- { stableDescriptorHash, effectiveConfigFingerprint } -- as defined in s2's approved LLD (section 4.1), not the HLD document's original { binaryVersion, effectivePolicy } shape, which s2's LLD superseded without the HLD ever being updated to match. No sc3 field or type is read, interpreted, or amended differently than s2's own LLD already defines it; this Story additionally raises the missing HLD amendment to close that sync gap formally. |

## 6. Error paths

**Error cases**

- **s3's live verification of the prompt-transport fix finds a failing case (e.g. a multiline or option-like-text prompt still reproduces the installed CLI's missing-prompt guard).** (recoverable)
  - Detection: s3's own TESTS record reports a failed case for one of the five named prompt-transport scenarios.
  - Response: ISSUE-910fce32967bc4ea is reopened (not closed) citing the specific failing case and its evidence, per ac1's explicit 'or, if the verification fails, reopened with the failure recorded'.
  - User impact: A genuinely-unfixed prompt-transport defect is never misreported as closed.
- **s2's live qualification suite fails to qualify the read-only mode (ReadOnlyCapability.status stays 'unavailable').** (recoverable)
  - Detection: sc3's own status field, read from s2's build evidence.
  - Response: ISSUE-d3e72fe73ee775a2 stays open, citing the specific qualification failure reason sc3's own 'reason' field carries -- never closed on an unqualified capability.
  - User impact: The read-only MCP-tool defect is never closed while the underlying authorization genuinely remains unavailable.
- **s4's own validation record shows one of the three TOML reproduction cases (quoted/dotted-key sections, inline-list registration, text-inside-a-multiline-string) still fails against the real parser.** (recoverable)
  - Detection: s4's validation record reports a failing case.
  - Response: ISSUE-0b3114f87754959b stays open, citing the specific failing reproduction case.
  - User impact: The TOML-parsing defect is never closed while a real reproduction case still fails.
- **A future change to the shipped catalog removes or renames the mistral-large-4 entry this Story's closure of c9's catalog-coverage sub-point relies on.** (recoverable)
  - Detection: validateModelCatalog's own existing load-time validation would surface a removed/renamed entry as a schema change, independent of this Story.
  - Response: This Story's own closure annotation is a point-in-time record of the evidence available when s6 reconciles; it is not a live assertion that re-checks itself on every future catalog change -- a later regression is a NEW defect against the catalog, not a reopening of c9's already-recorded evidence.
  - User impact: Reconciliation records a fact as of when it was checked, consistent with how every other closed issue in this ledger already behaves; it does not claim to be a standing guarantee.
- **A reader of ISSUE-738d62b848fd173f sees only one annotation (either the catalog-coverage closure or the Ollama/activity-review deferral) and assumes it applies to the WHOLE record.** (recoverable)
  - Detection: This is a documentation-clarity risk, not a runtime detection -- recorded here because the single ISSUE.md record now carries two independent, differently-resolved sub-points.
  - Response: Each annotation explicitly names which sub-point it addresses (by quoting the specific reproduction-case text it resolves), so neither annotation can be read as covering the other.
  - User impact: A reader cannot mistake a partial resolution for the record's full state.
- **A reader of this Story's own LLD cites sc3's provenAgainst via the HLD.md document instead of s2's LLD, and reproduces the exact stale-citation drift this round's correction fixes, because the HLD amendment this round raises has not yet been applied.** (recoverable)
  - Detection: The HLD context slice re-bundled into this round's own steps still shows the original, unamended { binaryVersion, effectivePolicy } shape -- confirming the amendment is proposed, not yet applied.
  - Response: This Story's own dataModelChanges and interactionWithShared entries cite s2's LLD directly (the authoritative, current source) rather than the HLD context slice, and the amendment proposed in this round is the durable fix once applied; until then, this openQuestion is carried forward explicitly rather than silently relied upon.
  - User impact: No reader of THIS Story's LLD is misled, even though the HLD document itself remains stale pending the amendment's application.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| c8 and c9's Ollama/activity-review sub-point are both deferred for the SAME underlying reason (the review rewrite). | Each record carries its own deferred-dependency annotation independently; a reader checking either record in isolation sees the full, correct reason without needing to cross-reference the other. |
| A Story this reconciliation depends on (s2, s3, s4) is built but its own BUILD record shows a FAILED task unrelated to the specific evidence s6 cites (e.g. a different task in the same Story fails). | s6's reconciliation cites only the SPECIFIC task/test evidence relevant to the record being closed, not the Story's overall pass/fail status -- an unrelated task failure in the same Story does not by itself block a closure whose own cited evidence is clean. |
| The catalog-coverage sub-point's closure is checked AFTER s5 also builds its own, unrelated catalog change (the mid-tier id rename). | s5's own build does not touch mistral-large-4 at all; the closure's cited evidence (the mistral-large-4 entry and its live dispatch proof) remains valid and unaffected by s5's unrelated change. |
| s2's build eventually lands and someone re-derives the HLD context slice for a future Story before this round's amendment proposal has been approved and applied. | That future Story's own context.assemble step would still see the unamended HLD shape and must independently re-derive the current shape from s2's LLD, exactly as this round's s1 step had to -- the amendment's approval, not this LLD alone, is what finally removes that recurring burden. |

**Invariants to preserve**

- A record closes only with the specific evidence that actually supports it; no record closes on a verdict broader than, or disconnected from, its own cited proof. [[c1]]
- A catalog-coverage concern already resolved by data present in the repo today must be recorded as fixed on that evidence now, not artificially held open pending an unrelated Story's build. [[c2]]
- A record whose fix intent depends on review machinery the project's own steering confirms does not currently exist must carry an explicit deferred dependency on the review rewrite, never an open claim implying that machinery still exists. [[c3]]
- s6 cannot itself re-verify a fix live; every closure it records must cite the OWNING Story's own build/test evidence, never a claim s6 fabricates or re-runs independently. [[c4]]
- Reconciliation targets the specific evidence cited for each record, not a Story's overall build pass/fail status; an unrelated task failure within the same Story does not itself block a closure whose own cited evidence is clean. [[c5]]
- When a shared contract's HLD-documented shape and its owning Story's approved LLD shape diverge, a downstream consumer cites the owning Story's own artifact, not the stale HLD slice, until the amendment that reconciles them is applied. [[c6]]

## 7. Test strategy

**Test framework:** `node:test`

**Test levels**

- **contract** — Verify each reconciled ISSUE.md's final annotation is backed by exactly the evidence it cites, since this Story produces no application code -- its own build validation is a documentation/evidence-reconciliation check, not a code test.
  - Subjects: `ISSUE-910fce32967bc4ea's closure (or reopening) cites s3's actual TESTS record and names the specific case(s) it checked -- the annotation is cross-checked against that record's real content, not asserted independently`, `ISSUE-d3e72fe73ee775a2's closure cites sc3's actual ReadOnlyCapability.provenAgainst value from s2's build USING s2's current field names (stableDescriptorHash, effectiveConfigFingerprint), not the stale HLD ones`, `ISSUE-0b3114f87754959b's closure cites s4's actual validation record and names which of the three reproduction cases it covers`, `ISSUE-738d62b848fd173f's two independent annotations (catalog-coverage closure; Ollama/activity-review deferral) each name exactly the sub-point text they address, with neither annotation omitted or merged`, `ISSUE-30962d0f44df1e76's deferral annotation names the review rewrite as the explicit blocking dependency, not a vague 'future work' note`
  - Fixtures: `Direct comparison of each ISSUE.md's final text against the specific BUILD/TESTS artifact path it cites, performed when s6 itself is validated`
- **smoke** — Confirm, at the point s6 is itself validated, that every cited upstream artifact actually exists and is in the state the reconciliation assumes.
  - Subjects: `s3's TESTS record exists and reports the five named prompt-transport cases before ISSUE-910fce32967bc4ea is closed on it`, `s2's BUILD record exists and sc3's ReadOnlyCapability.status is 'qualified' before ISSUE-d3e72fe73ee775a2 is closed on it`, `s4's BUILD/validation record exists before ISSUE-0b3114f87754959b is closed on it`, `The catalog's mistral-large-4 entry and this Epic's own live-dispatch evidence are present before ISSUE-738d62b848fd173f's catalog-coverage sub-point is closed`, `The HLD amendment proposed in this round for sc3's provenAgainst field rename has either been applied (HLD.md shows the current shape) or remains an openQuestion carried into the next Story that reads it`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `contract: ISSUE-910fce32967bc4ea's closure/reopening cites s3's actual TESTS record content, naming any failing case explicitly if verification fails` |
| `ac2` | `contract: ISSUE-738d62b848fd173f's catalog-coverage sub-point closes citing the shipped mistral-large-4 entry and this Epic's live dispatch evidence, independent of any unrelated Story's build` |
| `ac3` | `contract: ISSUE-30962d0f44df1e76 and ISSUE-738d62b848fd173f's Ollama/activity-review sub-point both carry an explicit review-rewrite deferral annotation, never an open claim implying removed machinery still exists` |
| `ac4` | `contract: ISSUE-d3e72fe73ee775a2 closes citing sc3's actual provenAgainst evidence from s2's build, using s2's current field names`, `contract: ISSUE-0b3114f87754959b closes citing s4's actual validation record` |

## 8. Migration

**State before:** Per this round's bundles: five open ISSUE records exist (c5-c9 in the Epic's DEF), each describing a Vibe-integration defect or capability gap. c7's fix intent targets a file s1's own BUILD already changed, but no live verification has been recorded. c5 and c6 describe defects owned by s2 and s4, neither yet built. c9 bundles a catalog-coverage concern already resolved by data in the repo together with a review-machinery-dependent concern that is not. c8 is entirely review-machinery-dependent. None of the five records currently states a review-rewrite dependency or cites the specific evidence that would close or reopen it. Separately, s2's own approved LLD already amends sc3's provenAgainst shape from the HLD's original { binaryVersion, effectivePolicy } to { stableDescriptorHash, effectiveConfigFingerprint }, but no AMD artifact was ever filed, so the HLD.md document and s2's own LLD disagree about sc3's actual shape.

**State after:** Each of the five ISSUE records carries a specific, evidence-grounded annotation using CURRENT (not stale) field names: c7 closes or reopens citing s3's own TESTS record once s3 builds; c5 closes citing sc3's provenAgainst record using s2's current { stableDescriptorHash, effectiveConfigFingerprint } shape once s2 builds; c6 closes citing s4's validation record once s4 builds; c9's catalog-coverage sub-point closes now, citing the catalog's existing mistral-large-4 entry and this Epic's own live dispatch evidence; c9's Ollama/activity-review sub-point and c8 both carry an explicit deferred-dependency annotation naming the review rewrite. Additionally, the HLD amendment for sc3's field rename -- proposed by s2 but never tracked -- is formally raised by this round's contract.detail step, so the gap becomes a tracked proposal rather than a repeatedly-rediscovered citation drift.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Annotate ISSUE-738d62b848fd173f's catalog-coverage sub-point as resolved, citing the shipped mistral-large-4 entry and this Epic's live dispatch evidence. — ↩ rollbackable
2. Annotate ISSUE-738d62b848fd173f's Ollama/activity-review sub-point as deferred, citing the review rewrite as the explicit blocking dependency. — ↩ rollbackable
3. Annotate ISSUE-30962d0f44df1e76 as deferred, citing the review rewrite as the explicit blocking dependency. — ↩ rollbackable
4. Once s3 builds: annotate ISSUE-910fce32967bc4ea as closed, citing s3's own TESTS record's five prompt-transport cases -- or reopened, citing the specific failing case. — ↩ rollbackable
5. Once s2 builds: annotate ISSUE-d3e72fe73ee775a2 as closed, citing sc3's ReadOnlyCapability.provenAgainst record using s2's current field names. — ↩ rollbackable
6. Once s4 builds: annotate ISSUE-0b3114f87754959b as closed, citing s4's own validation record. — ↩ rollbackable
7. File the HLD amendment (proposed in this round's contract.detail step) renaming sc3's provenAgainst fields to match s2's own approved LLD shape, so the HLD document and s2's LLD no longer disagree. — ↩ rollbackable

**Backward compat:** This Story changes no application code, exported API, or shared contract directly -- only the prose content of five existing ISSUE.md records, plus proposing (not itself applying) one HLD amendment that formalizes a shape change s2's own LLD already made. Nothing consumes the ISSUE records as a machine-readable contract outside the insrc workflow's own ledger tooling. The HLD amendment itself is breaking (sc3's provenAgainst field names change), but it only formalizes a change s2's approved LLD already carries -- no shipped BUILD ever used the old shape, so there is no runtime backward-compat break to manage.

## 9. Alternatives considered

### 9.1 a1: Evidence-cited annotation in place, with a formal amendment raised for the sc3 field-rename gap — **CHOSEN**

Annotate each existing ISSUE.md in place with evidence-specific close/reopen/defer outcomes, citing s2's current (amended) sc3 field names, and raise the missing HLD amendment for that rename via this Story's own contract.detail step.

No new tracked record is created. Each of the five existing standalone ISSUE.md files gets a targeted prose annotation naming the specific upstream evidence (Story build/test record or shipped catalog data) that closes, reopens, or defers it. For the read-only-session issue, the annotation cites sc3's ReadOnlyCapability.provenAgainst using s2's own current field names (stableDescriptorHash, effectiveConfigFingerprint) rather than the stale HLD/DEF ones, since s2's approved LLD already superseded those. Because no AMD artifact exists for that rename despite s2's migration step claiming one would be filed, this round's contract.detail step raises it formally via hld.amendmentProposal, so the gap becomes a tracked proposal instead of an undocumented prose aside repeated across Stories.

### 9.2 a2: File a new tracked issue for the amendment gap instead of amending in place

Open a new standalone ISSUE for 'HLD amendments proposed but never filed' rather than raising the sc3 amendment directly from this Story.

Rather than this Story proposing the HLD amendment itself, file a new ISSUE.md describing the general defect that amendment proposals from s2/s3/s5 were never tracked as AMD artifacts, and let a future triage cycle size and route the actual fix.

**Rejected because:** Adds a tracker-restructuring action (a new issue + a future triage cycle) this Story's boundary does not mandate, and delays ac4's long-term evidentiary footing when s6 is already positioned to raise the amendment directly.

### 9.3 a3: Defer the catalog-coverage concern onto the review-rewrite dependency

Fold the versioned-model catalog-coverage sub-point into the same review-rewrite deferral as the Ollama/activity-review sub-point, rather than closing it now.

Treat ISSUE-738d62b8...'s two sub-points as a single unit and defer both on the review-machinery dependency, skipping the independent catalog-coverage closure this round's evidence already supports.

**Rejected because:** Fails ac2 directly: the catalog-coverage concern is folded into a review-dependency defer that discards the live evidence already produced for it.

### 9.4 a4: Close the review-dependent records wholesale instead of deferring them

Mark ISSUE-30962d0f... and the Ollama/activity-review sub-point of ISSUE-738d62b8... as closed, treating this Epic's adapter work as sufficient.

Declare the two review-machinery-dependent records resolved on the strength of this Epic's adapter and TOML work, without naming the review-rewrite dependency explicitly.

**Rejected because:** Fails ac3 directly: closing c9 wholesale would describe the Ollama activity-mode preflight defect and the Vibe activity-review rejection as resolved when neither is implemented by anything this Epic ships.

## 10. References

- **[[c1]]** `prior-artifact` `docs/standalone/pass-vibe-chat-prompts-correctly-programmatic-E20261105910fce32/ISSUE.md`
- **[[c2]]** `code` `src/assets/models/cloud-model-catalog.json:51`
- **[[c3]]** `prior-artifact` `docs/standalone/remove-design-code-review-implementations-while-E20261116dae67bfc/S001/BUILD.md`
- **[[c4]]** `prior-artifact` `.insrc/artifacts/BUILD-639cd2159a87aedb-s1.json`
- **[[c5]]** `prior-artifact` `.insrc/artifacts/LLD-639cd2159a87aedb-s5.json`
- **[[c6]]** `prior-artifact` `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/S002/LLD.md`

## 11. Open questions

- The HLD amendment proposed in this round's contract.detail step (renaming sc3's provenAgainst fields to match s2's own approved LLD) has been raised but its application (updating HLD.md itself) has not been confirmed -- until applied, a future Story's own context.assemble step will still see the stale shape and must independently re-derive the current one from s2's LLD.
- Two other ungoverned pending export asks exist elsewhere in this Epic (s3's dependency on vibe-adapter.ts exporting buildArgv/readExitEvidence; s5's dependency on it exporting buildApprovalArgs) -- neither is owned by s6 or touched by this Story's boundary, but neither has a tracked AMD artifact either, and the user should action them separately.

## Citations

- **[[c1]]** `prior-artifact` `docs/standalone/pass-vibe-chat-prompts-correctly-programmatic-E20261105910fce32/ISSUE.md`
- **[[c2]]** `code` `src/assets/models/cloud-model-catalog.json:51`
- **[[c3]]** `prior-artifact` `docs/standalone/remove-design-code-review-implementations-while-E20261116dae67bfc/S001/BUILD.md`
- **[[c4]]** `prior-artifact` `.insrc/artifacts/BUILD-639cd2159a87aedb-s1.json`
- **[[c5]]** `prior-artifact` `.insrc/artifacts/LLD-639cd2159a87aedb-s5.json`
- **[[c6]]** `prior-artifact` `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/S002/LLD.md`
