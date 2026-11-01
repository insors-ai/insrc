<!-- insrc:artifact DEF-17123b6d304af2a2 -->

# Epic: share-project-memory-across-agents-applications

## Summary

**Flavor:** new-capability

Deliver a reusable shared project memory feature that keeps concise, traceable and current context available across coding agents and applications. Applications can host it directly or connect to an independent local service with equivalent behavior. Accepted submissions survive restart, and corrections and forgetting remain effective across replay.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

Project knowledge acquired in a coding conversation does not reliably survive a switch of agent, session or application. Developers repeat instructions, decisions and handoff context; verbose retained transcripts obscure the current rule, while similar or conflicting statements accumulate without clear scope, provenance or lifecycle. Acknowledged context can be lost after a crash, stale context can override corrections or deletions, and applications outside the existing background service cannot depend on a common memory capability without inheriting unrelated runtime dependencies.

## 2. Functional requirements

- **E2026110117123b6d:FR001** — Project context is available across supported agents with current scoped instructions, compact handoffs and inspectable historical evidence.
- **E2026110117123b6d:FR002** — Semantically equivalent statements share one canonical memory while distinct scope and unresolved conflicts remain explicit.
- **E2026110117123b6d:FR003** — Durably accepted submissions survive interruption and can be retried without duplicate memory effects.
- **E2026110117123b6d:FR004** — Users can inspect, correct, expand, supersede, expire and forget memory with visible asynchronous processing status.
- **E2026110117123b6d:FR005** — External applications can use the complete memory feature embedded or through an independent local IPC service without the insrc daemon.
- **E2026110117123b6d:FR006** — Privacy exclusions, project isolation and deletion boundaries hold across capture, retrieval, caches, replay and cleanup.

**s1:**

- **E2026110117123b6d:S001:FR001** — An application can use shared memory without adopting the insrc runtime.

**s2:**

- **E2026110117123b6d:S002:FR001** — An accepted submission remains available after a crash.

**s3:**

- **E2026110117123b6d:S003:FR001** — A correction or forgotten memory cannot be undone by a restart.

**s4:**

- **E2026110117123b6d:S004:FR001** — Repeated statements produce concise current memory with reliable scope.

**s5:**

- **E2026110117123b6d:S005:FR001** — A new session receives relevant instructions and handoff context without replaying a verbose transcript.

**s6:**

- **E2026110117123b6d:S006:FR001** — Applications can connect to memory without embedding its execution or running insrc.

**s7:**

- **E2026110117123b6d:S007:FR001** — Switching coding agents in insrc preserves project instructions and handoff context.

**s8:**

- **E2026110117123b6d:S008:FR001** — Native coding sessions can participate with truthful support and capture status.

**s9:**

- **E2026110117123b6d:S009:FR001** — Memory stays correct and bounded as evidence ages and processing changes.

## 3. Non-goals

- **Replace static instruction-file generation, native agent session stores, code indexing or workflow approvals.** — These remain authoritative in their existing domains; memory links to them and cannot manufacture permission.
- **Automatic cross-user synchronization, personal profiling, multimodal ingestion or unrestricted import of private histories.** — Initial scope is explicit local project memory with privacy and project binding.
- **Add daemon/indexer dependencies to the reusable package.** — Independent external applications must consume the feature without insrc startup.

## 4. Assumptions

- `high` First delivery targets local single-user projects and supported coding agents; native capture capabilities differ by agent and must be qualified. [[c1]]
- `med` Provider and IPC implementations offer adapter candidates, not proof that they can be imported unchanged by an independent package. [[c2]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | Deliver one self-contained Node/TypeScript module with embedded and standalone IPC modes, public versioned interfaces, injected host dependencies and independent build/test consumption; insrc daemon is an adapter host. | [[c1]] |
| `k2` | invariant | Sessions only submit to a separate durable file queue; one context-builder worker owns every memory-store mutation, receipt and maintenance operation per configured directory. Acknowledge only after durable append; size rotates segments, never discards pending events. | [[c1]] |
| `k3` | contract | Memory authority and vectors use a dedicated LanceDB directory separate from index storage. Replay is at least once with idempotent committed effects and no resurrection after forgetting. | [[c1]] |
| `k4` | invariant | Normalize, deduplicate and compress without losing scope, polarity, conditions, authority or provenance. Support expansion, supersession, conflict, expiry and deletion; similarity alone cannot establish equivalence. | [[c1]] |
| `k5` | convention | Inject inference and local embedding interfaces; insrc adapters enforce existing role policy, serial model execution and cloud access only through installed CLI providers. No direct cloud REST from the core. | [[c1]] |
| `k6` | contract | Host validates project/session identity and privacy eligibility before durable capture. insrc binds to registered repos; external applications supply explicit binding. Embedded/IPC parity includes lifecycle, readiness, ownership, errors, retries and operation barriers. | [[c1]] |

## 6. Stories

### 6.1 E2026110117123b6d:S001 — Host memory inside an external application

**User value:** `size: L`

An application can use shared memory without adopting the insrc runtime.

**Acceptance criteria:**

- **ac1:** Given an external application supplies project identity, providers, policy and isolated storage paths, when it imports and opens the memory module, then import has no side effects, readiness is explicit and the application can use the public memory service without starting insrc. _(operationalizes `k1`, `k6`)_
- **ac2:** Given two hosts target the same memory directory, when the second tries to open a writer, then it is refused; distinct directories operate independently and closing memory preserves host-owned provider resources. _(operationalizes `k1`, `k6`)_

### 6.2 E2026110117123b6d:S002 — Accept project memory durably and recover interrupted ingestion

**User value:** `size: L`

An accepted submission remains available after a crash.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given eligible submissions arrive from concurrent sessions, when the service acknowledges acceptance and then terminates unexpectedly, then each accepted complete event is recoverable with stable identity and ordering; a retry cannot create duplicate logical events. _(operationalizes `k2`, `k6`)_
- **ac2:** Given pending events exhaust the configured disk budget, when new submissions arrive or queue files reach their size threshold, then files rotate safely, pending work is retained and admission applies visible backpressure; truncated tails and corruption yield explicit recovery outcomes. _(operationalizes `k2`, `k6`)_

### 6.3 E2026110117123b6d:S003 — Keep current memory and processing outcomes consistent through replay

**User value:** `size: L`

A correction or forgotten memory cannot be undone by a restart.

**Depends on:** `s2`

**Acceptance criteria:**

- **ac1:** Given an event changes canonical memory and processing status, when execution fails before or after the durable commit boundary, then recovery exposes either the prior state or the complete committed result and retries do not repeat committed effects. _(operationalizes `k2`, `k3`, `k4`)_
- **ac2:** Given an existing record is corrected, superseded, expired or forgotten, when old events replay or concurrent clients submit stale revisions, then revision and deletion boundaries hold, lineage remains inspectable as allowed by retention, and operation status distinguishes pending, committed, failed and cleanup-pending. _(operationalizes `k2`, `k3`, `k4`)_
- **ac3:** Given memory and code indexes use separate directories, when either subsystem is reset or rebuilt, then the other subsystem and pending memory submissions remain intact. _(operationalizes `k2`, `k3`, `k4`)_

### 6.4 E2026110117123b6d:S004 — Normalize and compress shared context without losing meaning

**User value:** `size: XL`

Repeated statements produce concise current memory with reliable scope.

**Depends on:** `s3`

**Acceptance criteria:**

- **ac1:** Given equivalent directives and supporting evidence arrive from different agents, when normalization processes them, then one canonical instruction is active with deduplicated supporting evidence, while conditions, negation, scope, identifiers and source authority are preserved. _(operationalizes `k4`, `k5`, `k6`)_
- **ac2:** Given a new statement expands, contradicts or explicitly overrides prior context, when reconciliation runs, then it distinguishes expansion, conflict and authorized supersession; unresolved ambiguity is visible and similarity alone cannot merge or override. _(operationalizes `k4`, `k5`, `k6`)_
- **ac3:** Given inference fails or its proposed compression loses material meaning, when the worker processes the event, then it retries or exposes a qualified failure without activating the lossy result, and all model work respects provider policy. _(operationalizes `k4`, `k5`, `k6`)_

### 6.5 E2026110117123b6d:S005 — Recall compact current context and explain its sources

**User value:** `size: L`

A new session receives relevant instructions and handoff context without replaying a verbose transcript.

**Depends on:** `s4`

**Acceptance criteria:**

- **ac1:** Given a project has directives, handoff facts and bounded historical evidence, when a client asks for context or searches for an exact identifier or paraphrase, then results are scoped, compact and source-traceable; mandatory directives are not silently omitted and overflow or degraded retrieval is explicit. _(operationalizes `k3`, `k4`, `k6`)_
- **ac2:** Given a correction or forget operation has committed, when a reader requests context using an operation barrier or previously cached view, then the result reflects the committed generation, excludes invalidated memory and does not persist read-side effects outside the command path. _(operationalizes `k3`, `k4`, `k6`)_
- **ac3:** Given a user inspects an item, when they request its provenance or correction status, then source spans, lineage, authority, conflicts and actual operation state are visible without exposing prohibited source material. _(operationalizes `k3`, `k4`, `k6`)_

### 6.6 E2026110117123b6d:S006 — Use the same memory feature through an independent local service

**User value:** `size: L`

Applications can connect to memory without embedding its execution or running insrc.

**Depends on:** `s5`

**Acceptance criteria:**

- **ac1:** Given the insrc daemon is stopped, when a standalone memory process starts and an external IPC client connects, then capture, context/search, inspection, correction, forgetting and status behave equivalently to embedded mode. _(operationalizes `k1`, `k2`, `k6`)_
- **ac2:** Given a connection drops after submission or protocol versions differ, when the client reconnects and retries or sends an incompatible request, then event identity and commit barriers are preserved, unsupported contracts fail explicitly, and endpoint access and request validation remain enforced. _(operationalizes `k1`, `k2`, `k6`)_
- **ac3:** Given accepted work exists when shutdown or forced termination occurs, when the service stops and restarts, then readiness, drain and shutdown outcomes are explicit, resources release safely and accepted unfinished work remains recoverable. _(operationalizes `k1`, `k2`, `k6`)_

### 6.7 E2026110117123b6d:S007 — Carry shared memory between insrc-managed agents

**User value:** `size: L`

Switching coding agents in insrc preserves project instructions and handoff context.

**Depends on:** `s6`

**Acceptance criteria:**

- **ac1:** Given a registered project runs managed Claude, Codex, Vibe or Ollama sessions, when a session submits eligible attributed context and another provider begins work, then the shared instruction and compact handoff are delivered through the common feature without partitioning by agent identity or opening storage in clients. _(operationalizes `k1`, `k5`, `k6`)_
- **ac2:** Given a temporary/private execution, ambiguous project or detached client is encountered, when capture or delivery is attempted, then privacy eligibility is enforced before durable persistence, missing binding is explicit and no hook reports acceptance or context delivery without evidence. _(operationalizes `k1`, `k5`, `k6`)_
- **ac3:** Given the host is VS Code, JetBrains or CLI/MCP, when it inspects or changes memory through its supported integration, then payload meaning and operation states agree; the deprecated insrc-ide fork is excluded. _(operationalizes `k1`, `k5`, `k6`)_

### 6.8 E2026110117123b6d:S008 — Share memory with independently running coding CLIs

**User value:** `size: XL`

Native coding sessions can participate with truthful support and capture status.

**Depends on:** `s7`

**Acceptance criteria:**

- **ac1:** Given a supported installed CLI version has qualified hook or MCP capabilities, when an independent Claude, Codex or Vibe session starts, resumes, compacts, interrupts or completes, then eligible deltas and context delivery use the qualified adapter, have stable source identities and do not duplicate managed capture. _(operationalizes `k1`, `k5`, `k6`)_
- **ac2:** Given required hook support or ingress is unavailable, when native integration attempts capture or mandatory context delivery, then capability limitations and not-captured/not-delivered states are visible; any fallback is explicitly durable and does not claim universal automatic per-turn support. _(operationalizes `k1`, `k5`, `k6`)_

### 6.9 E2026110117123b6d:S009 — Maintain and evaluate memory without weakening deletion or authority

**User value:** `size: L`

Memory stays correct and bounded as evidence ages and processing changes.

**Depends on:** `s8`

**Acceptance criteria:**

- **ac1:** Given retention, expiry, migration, re-embedding or physical forgetting is requested, when maintenance executes or restarts after interruption, then the sole writer preserves receipts, replay and tombstone boundaries; logical deletion and physical purge are separately reported including backup limitations. _(operationalizes `k2`, `k3`, `k4`, `k5`, `k6`)_
- **ac2:** Given candidate lessons or duplicate consolidation arise, when maintenance proposes active memory, then evidence remains source-qualified, uncertain lessons do not gain directive authority and meaningful qualifiers survive. _(operationalizes `k2`, `k3`, `k4`, `k5`, `k6`)_
- **ac3:** Given the full feature is ready for release, when the behavioral, crash and quality evaluation suites run, then embedded/IPC parity, privacy, isolation, exact and semantic recall, false-merge resistance and compression fidelity have recorded evidence with unresolved limitations explicit. _(operationalizes `k2`, `k3`, `k4`, `k5`, `k6`)_

## 7. References

- **[[c1]]** `doc` `docs/reqs/shared-project-memory.html` — "The same core MUST run embedded in a host process or in an independent process accessed through IPC."
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles` — "Lance imports local config, paths, logging and connection persistence (70 incoming/28 outgoing graph edges)."

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — define (define)

**1 HIGH · 4 MED · 4 LOW** · model `cli-claude:claude-sonnet-5` · reviewed 2026-11-01T12:02:05.859Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| all-constraints-cite-c1 | cross-artifact | HIGH | manual | All six constraints (k1-k6) and both assumptions in sections 4 and 5 cite [[c1]] as their sole source, and no constraint or assumption cites a source reference outside the two entries ([[c1]], [[c2]]) listed in section 7 References. | DEF.md:20-23 shows FOUR assumption-style lines (not two), citing [[c1]], [[c2]], [[c3]], [[c2]] respectively — not uniformly [[c1]]. DEF.md:29-34 shows the six constraints k1-k6 citing [[c4]] (k1), [[c5]] (k2), [[c5]] (k3), [[c5]] (k4), [[c4]] (k5), [[c2]] (k6) — NONE of the six cite [[c1]]; zero overlap with the premise's claim. DEF.md:125-131 References section lists SEVEN entries ([[c1]] through [[c7]]), not the two ([[c1]], [[c2]]) the premise asserts, and c3/c4/c5/c6/c7 are each cited elsewhere in the document (lines 22, 29, 31-34, 44, 72, 82, 106). | Correct the premise to reflect the real citation pattern: section 4 has four assumption entries (not two) citing c1/c2/c3/c2; section 5's six constraints cite c2, c4, and c5 (not c1 at all); and section 7 References lists seven entries (c1-c7), not two. Any downstream task relying on 'uniform sole-source c1 citation' or 'only two references exist' must be re-derived from the actual citation graph. |
| c2-quote-resolves | citation | MED | manual | The analyze-bundle reference [[c2]] (s1.analyzeBundles) accurately reports that Lance's module has 70 incoming / 28 outgoing graph edges driven by imports of local config, paths, logging and connection persistence, i.e. the src/db/lance module imports from config, paths, logging and a connection/persistence module. | All four grep passes (`from ['"].*config/`, `.*paths/`, `.*logger/`, `.*connection/`) were capped at 50 matches each and TRUNCATED before reaching any path under src/db/lance — the results are sorted path-order and cut off within src/daemon/db/__tests__ or src/config/src/analyze ranges, i.e. alphabetically before 'src/db/lance' is even reached. Not a single matched line in any of the four grep outputs is from src/db/lance/*.ts. The evidence gathered therefore contains zero direct confirmation that src/db/lance imports config, paths, logger, or a connection/persistence module, and says nothing about the claimed 70 incoming / 28 outgoing edge counts. | Re-run the four import greps scoped specifically to `src/db/lance/**` (not the whole repo) so the cap doesn't truncate before reaching the target module, and separately re-derive the incoming/outgoing edge counts (70/28) from the graph tool rather than asserting them uncited. Until then, treat the citation's specific numbers and the import claim as unconfirmed. |
| stories-form-linear-chain | ordering | MED | manual | The nine stories S001-S009 declared in section 6 form a strictly linear dependency chain (S002 depends on S001, S003 on S002, S004 on S003, S005 on S004, S006 on S005, S007 on S006, S008 on S007, S009 on S008) with no skipped or out-of-order links and S001 having no dependency. | The grep evidence returned 50 'Depends on:' matches, but every single one comes from OTHER epics' DEF.md files (bugfix-triage, build-workflow, code-review-stage, module-test-health-analyzer, plan-workflow, build-deployment-design-framework, vs-code-extension, vs-code-plugin-ui-integration, chunked-review-pipeline, c2ba6fa6, deploy-daemon-shared-server). None of the matches are from the actual artifact under review (the share-project-memory-across-agents-applications epic, E2026110117123b6d, whose anchors #6.1-#6.9 this premise cites). No path/line for that epic's own S001-S009 dependency declarations appears anywhere in the gathered evidence. | Re-run the dependency grep scoped specifically to docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/DEF.md (or its stories file) and read the actual 'Depends on:' lines for S001-S009 before accepting or rejecting the strict-linear-chain claim. |
| constraint-inventory-exactly-six | inventory | MED | assisted | The epic defines exactly six constraints, k1 through k6, in the section 5 table, and every acceptance criterion's "operationalizes" annotation across all nine stories references only ids drawn from this closed set {k1,k2,k3,k4,k5,k6}. | The k-table grep confirms exactly six constraint rows k1-k6 for docs/epics/add-bugfix-triage-category-insrc-framework-E202609181703991c/DEF.md:29-34, and every operationalizes annotation found in that same file (lines 48,49,61,62,76,77,78,94,95,96,110,111,112 -- ids k1,k2,k3,k4,k6 only, never k7+) stays inside {k1..k6}, so the closed-set claim holds against all evidence gathered. However the evidence shows only FIVE distinct acceptance-criteria groups carrying operationalizes tags in this file (around lines 48-49, 61-62, 76-78, 94-96, 110-112), not nine, and the grep hits no further matches for this file before moving alphabetically to the next epic's DEF.md -- so the premise's 'across all nine stories' count is not supported by the gathered evidence; either the epic has fewer tagged stories than claimed or some stories carry no operationalizes annotation at all. | Verify the epic's actual story count (and whether every story's ACs carry an operationalizes tag) directly against the epic's Stories section/table rather than relying on the grep's operationalizes hits alone; correct 'nine stories' to the true count if it differs, while the closed-set-to-k1..k6 claim itself needs no change. |
| every-constraint-referenced | closed-union | MED | manual | Each of the six constraints k1-k6 defined in section 5 is referenced by at least one acceptance criterion's "operationalizes" clause somewhere in section 6, i.e. no constraint is orphaned (defined but never operationalized). | All 300 cited matches (50 per k1..k6, each truncated at the cap) come exclusively from OTHER epics' DEF.md files — e.g. add-bugfix-triage-category-insrc-framework-E202609181703991c/DEF.md, add-build-workflow-insrc-5th-stage-E20260717185807ba/DEF.md, add-daemon-driven-code-review-stage-E20260803761a43a6/DEF.md, complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md, etc. Not one match is from the artifact this premise's anchors (#5-constraints, #6-stories) actually concern — there is no occurrence of docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/DEF.md anywhere in the gathered evidence. | Re-run the operationalizes grep scoped to the specific target document (e.g. `rg "operationalizes \\`k[1-6]\\`" docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/DEF.md`) and re-judge the orphan-constraint premise against those in-document matches only; the repo-wide, cap-truncated search cannot support or refute this premise since `k1`..`k6` are reused as local identifiers across every epic's DEF.md. |
| c1-quote-resolves | citation | LOW | manual | docs/reqs/shared-project-memory.html contains the verbatim sentence "The same core MUST run embedded in a host process or in an independent process accessed through IPC." cited by [[c1]] and used to support constraints k1-k6 and both assumptions. | Grep confirms the exact sentence appears verbatim at docs/reqs/shared-project-memory.html:57 ("...The same core MUST run embedded in a host process or in an independent process accessed through IPC. The insrc daemon is one integration host..."), and DEF.md:217 shows [[c1]] citing this same file with this same quoted sentence, matching the premise's citation text. | none — verified sound |
| fr-inventory-exactly-six | inventory | LOW | manual | The epic defines exactly six epic-level functional requirements, E2026110117123b6d:FR001 through FR006, and no others, in section 2. | grep for E2026110117123b6d:FR00[0-9]+ returns exactly 6 matches, all in docs/epics/.../DEF.md lines 27-32, numbered FR001 through FR006 consecutively with no gaps or extras, matching the premise's claim of exactly six epic-level FRs in section 2. | none — verified sound |
| nongoal-k1-consistency | semantic | LOW | manual | Non-goal 3 ("Add daemon/indexer dependencies to the reusable package") is semantically consistent with, not contradicted by, constraint k1's requirement of "independent build/test consumption" with "insrc daemon is an adapter host" — i.e. the reusable module must build/test without the daemon while the daemon only adapts to it. | DEF.md:74 states non-goal 3: "Add daemon/indexer dependencies to the reusable package. — Independent external applications must consume the feature without insrc startup." DEF.md:85 states k1: "Deliver one self-contained Node/TypeScript module with embedded and standalone IPC modes, public versioned interfaces, injected host dependencies and independent build/test consumption; insrc daemon is an adapter host." The non-goal's rationale (consume without insrc startup) and k1's requirements (independent build/test consumption, daemon as adapter host, injected host dependencies) both point the same direction: the reusable module must not depend on daemon/indexer internals, and the daemon only adapts to the module rather than the module depending on it. No wording in either anchor contradicts the other. | none — verified sound |
| story-fr-id-format-consistency | cross-artifact | LOW | manual | Each story's per-story functional requirement id (e.g. E2026110117123b6d:S00N:FR001) is correctly namespaced under the same epic root id E2026110117123b6d used for the epic-level FR001-FR006 ids in section 2, for all nine stories S001-S009. | grep for /E2026110117123b6d:S00[0-9]:FR001/ returns exactly 9 matches, one per story S001–S009, each in docs/epics/.../DEF.md: S001:FR001 (line 36), S002:FR001 (40), S003:FR001 (44), S004:FR001 (48), S005:FR001 (52), S006:FR001 (56), S007:FR001 (60), S008:FR001 (64), S009:FR001 (68). Every per-story FR001 id is namespaced under the same epic root E2026110117123b6d used for the epic-level FR001-FR006 ids, and the S00N segment correctly increments 001 through 009 with no gaps or collisions. | none — verified sound |

#### Proposed fixes

- **all-constraints-cite-c1** (manual) — The premise is wrong on three independent, structural facts (assumption count, constraint citation source, reference-list size) rather than one mechanical value, so no single find/replace safely captures the correction without re-authoring the whole claim.
  - option: Rewrite the premise to state the real pattern: assumptions cite c1/c2/c3 (not solely c1), constraints cite c2/c4/c5 (not c1), and 7 references exist (c1-c7)
  - option: Drop this cross-artifact premise entirely since its core claim (uniform c1 sourcing, only 2 references) does not hold
  - option: Re-scope the premise to only the parts that might have been true (e.g. verify a narrower sub-claim) and drop the universal 'all six' / 'both' / 'only two' quantifiers

- **c2-quote-resolves** (manual) — No safe mechanical edit exists because the gathered evidence contains no actual src/db/lance import lines or edge-count data to substitute in — the probe itself needs to be re-scoped and re-run before any correction can be grounded.
  - option: Re-run import probes scoped to src/db/lance/** and the graph edge-count tool for that module, then update the citation with the confirmed data
  - option: Mark the citation as unverified pending a scoped re-probe and strip the specific 70/28 figures until confirmed
  - option: Accept the premise as-is on the grounds that config/paths/logger imports are near-universal in this codebase (seen in dozens of other modules), while flagging the connection-persistence and edge-count parts as unverified

- **stories-form-linear-chain** (manual) — The evidence gathered is entirely off-target (wrong epics), so there is no verified fact from which to derive a mechanical text correction; a human or a re-scoped probe must supply the real S001-S009 dependency lines before any edit to the artifact can be justified.
  - option: Re-run the probe scoped to the target epic's own DEF/stories file and re-judge the premise against those real lines
  - option: Treat the premise as unverified and flag it to the author for manual confirmation of the S001-S009 chain
  - option: If the author can confirm from the source artifact directly, accept the premise as-is with a note that automated verification did not cover it

- **constraint-inventory-exactly-six** (assisted) — The closed-set-membership part of the premise is confirmed by evidence and needs no edit; only the 'nine stories' figure is unverified/possibly wrong, and the evidence given isn't enough to derive the correct number mechanically.
  - option: Re-check the epic's Stories table/section for the true story count and amend 'nine' if it differs
  - option: Leave as-is if a separate check (not shown in this evidence) confirms nine stories exist, some simply without operationalizes-tagged ACs
  - option: Soften the premise to 'every operationalizes annotation found across the epic's stories' without asserting a specific story count

- **every-constraint-referenced** (manual) — The defect is in how evidence was gathered (unscoped, cross-epic grep), not in the artifact's prose, so there is no safe mechanical text edit to the artifact itself. The orphan-constraint check needs to be regathered scoped to the target DEF.md before any verdict (LOW/HIGH) can be assigned.
  - option: Re-run grep scoped to the target epic's DEF.md and re-judge with real in-document evidence
  - option: Mark this premise could-not-verify in the review record pending a rescoped probe
  - option: Have the author manually enumerate each k1-k6's operationalizes citations within section 6 of this DEF and attach them as the grounding
