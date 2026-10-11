<!-- insrc:artifact DEF-b452bdbfc94c0a8f -->

# Epic: di3-guideline-creation-revision-agent-reuse

## Summary

**Flavor:** new-capability

Let users create and revise reusable guidelines for selected project UI types in a guided conversation. Agents then apply the approved guidelines across pages without repeating design exploration.

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

Users who want a consistent project design language must repeatedly restate their intent, compare disconnected choices and carry decisions between conversations themselves. Adding a mobile platform risks losing established brand choices, while routine page work can reopen settled design questions. There is no coherent user journey for creating, reviewing and deliberately revising reusable project guidelines while keeping ordinary consumption separate from authoring.

## 2. Functional requirements

- **E20261011b452bdbf:FR001** — Users create, resume and revise project guidelines for selected UI types through one guided conversation.
- **E20261011b452bdbf:FR002** — Agents apply approved guidelines repeatedly without generating new design artifacts or approval requests.

**s1:**

- **E20261011b452bdbf:S001:FR001** — Request project guidelines for selected UI types

**s2:**

- **E20261011b452bdbf:S002:FR001** — Compare directions and draft coherent reusable guidelines

**s3:**

- **E20261011b452bdbf:S003:FR001** — Review approve and resume guideline work deliberately

**s4:**

- **E20261011b452bdbf:S004:FR001** — Add platforms and revise guidelines without changing other sets

**s5:**

- **E20261011b452bdbf:S005:FR001** — Apply active guidelines to page work without restarting design

**s6:**

- **E20261011b452bdbf:S006:FR001** — Inspect guideline examples and verify cross-platform reuse

## 3. Non-goals

- **Per-page design exercises, production screen mockups or framework generation** — This workflow creates project guidelines, not individual page designs.
- **Reimplement corpus ingestion or project lifecycle** — DI1 and DI2 own those dependencies.

## 4. Assumptions

- `high` DI1 corpus and DI2 project lifecycle contracts will be reviewed and approved before dependent workflow implementation. [[c3]]
- `low` Lightweight guideline specimens are a proposed aid; exact fidelity remains to be confirmed before its story design. [[c1]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | Create distinct guideline sets for requested Web/Mobile-iOS/Mobile-Android types from a shared project brief; page changes never trigger guideline authoring. | [[c1]] |
| `k2` | invariant | Review and explicit version-specific approval precede activation; revisions preserve current approved sets until replacement approval. | [[c1]] |
| `k3` | contract | Reuse DI1 corpus evidence and DI2 identity/lifecycle; preserve provenance and avoid silent cross-platform changes. | [[c3]] |
| `k4` | invariant | Daemon owns persistence, clients use IPC, cloud access uses CLI providers, provider calls are sequential and critical reasoning obeys the capability floor. | [[c2]] |

## 6. Stories

### 6.1 E20261011b452bdbf:S001 — Request project guidelines for selected UI types

**User value:** `size: M`

Users describe their project once and retain existing decisions.

**Acceptance criteria:**

- **ac1:** Given a request for Web and iOS project guidelines, when the conversation begins, then the project, requested types and existing sets are resolved and one shared brief is gathered. _(operationalizes `k1`, `k3`, `k4`)_
- **ac2:** Given an approved Web set already exists, when the same project/type is requested again, then existing guidance is surfaced and a revision requires explicit intent rather than a competing default. _(operationalizes `k1`, `k3`, `k4`)_

### 6.2 E20261011b452bdbf:S002 — Compare directions and draft coherent reusable guidelines

**User value:** `size: M`

Users make informed project-wide choices supported by source evidence.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a sufficient project brief, when directions are explored, then distinct coherent alternatives explain task fit, tradeoffs and corpus evidence. _(operationalizes `k1`, `k3`, `k4`)_
- **ac2:** Given a selected direction and requested UI types, when drafting completes, then each requested type has reusable rules and source lineage, with corpus gaps explicit and no framework prerequisite. _(operationalizes `k1`, `k3`, `k4`)_

### 6.3 E20261011b452bdbf:S003 — Review approve and resume guideline work deliberately

**User value:** `size: M`

Users keep control of activation without losing progress.

**Depends on:** `s2`

**Acceptance criteria:**

- **ac1:** Given separate reviewed Web and iOS drafts, when the user approves only the exact Web version, then only Web activates while iOS remains a draft. _(operationalizes `k2`, `k3`, `k4`)_
- **ac2:** Given a conversation is interrupted, when it resumes, then the brief, choices and drafts are retained without duplicate activation. _(operationalizes `k2`, `k3`, `k4`)_
- **ac3:** Given review is stale or blocking, when approval is attempted, then activation is withheld with the reason visible. _(operationalizes `k2`, `k3`, `k4`)_

### 6.4 E20261011b452bdbf:S004 — Add platforms and revise guidelines without changing other sets

**User value:** `size: M`

Users evolve a project while preserving settled choices.

**Depends on:** `s3`

**Acceptance criteria:**

- **ac1:** Given approved Web and iOS guidelines, when the user requests Android, then brand choices are reused with source-version lineage and Android-specific decisions are explicit. _(operationalizes `k1`, `k3`, `k4`)_
- **ac2:** Given an explicit Web revision, when a new draft is prepared, then current Web and mobile versions remain unchanged until the exact revision is approved. _(operationalizes `k1`, `k3`, `k4`)_

### 6.5 E20261011b452bdbf:S005 — Apply active guidelines to page work without restarting design

**User value:** `size: M`

Agents use stable rules for every page.

**Depends on:** `s3`

**Acceptance criteria:**

- **ac1:** Given multiple page tasks with one project/UI type, when agents request design context, then the same active guideline version is returned and recorded without new drafts or reapproval. _(operationalizes `k1`, `k3`, `k4`)_
- **ac2:** Given no approved set for the requested type, when an agent requests context, then missing guidance is reported and creation is offered without silent generation or substitution. _(operationalizes `k1`, `k3`, `k4`)_

### 6.6 E20261011b452bdbf:S006 — Inspect guideline examples and verify cross-platform reuse

**User value:** `size: M`

Users can understand reusable rules and assess practical consistency.

**Depends on:** `s4`, `s5`

**Acceptance criteria:**

- **ac1:** Given a guideline version and agreed lightweight specimen scope, when examples are produced, then palette, type, component states and representative layouts illustrate that version without requiring production page designs. _(operationalizes `k1`, `k3`, `k4`)_
- **ac2:** Given eight project briefs across three UI types, when guidelines are evaluated on several representative pages each, then traceability, platform fit, consistency, read-only reuse and critical violations are reported against the PRD acceptance criteria. _(operationalizes `k1`, `k3`, `k4`)_

## 7. References

- **[[c1]]** `doc` `docs/plans/design-intelligence-prd.md#project-guideline-workflow`
- **[[c2]]** `convention` `AGENTS.md`
- **[[c3]]** `doc` `plans/design-intelligence-implementation.md#di3-guideline-creation-revision-and-agent-reuse`
- **[[c4]]** `prior-artifact` `/Users/subhagho/work/projects/insors/insrc/docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/DEF.md`
- **[[c5]]** `prior-artifact` `/Users/subhagho/work/projects/insors/insrc/docs/epics/di2-project-guideline-identity-versioned-lifecycle-E202610114abafc9d/DEF.md`

## 8. Open questions

- Item a2: Confirm whether the first release includes lightweight palette/type/component/layout specimens or written guidelines only before designing story s6.

## Resolved questions

- `q1d8128b2` — Item a2: Confirm whether the first release includes lightweight palette/type/component/layout specimens or written guidelines only before designing story s6.
  - **resolved**: Include lightweight palette, typography, component-state and representative layout examples alongside written project guidelines in the first release. — Explicit user selection in chat on 11 October 2026; examples illustrate reusable guidelines, not per-page designs. _(2026-10-11T14:52:34.995Z)_

## Citations

- **[[c1]]** `doc` `docs/plans/design-intelligence-prd.md#project-guideline-workflow`
- **[[c2]]** `convention` `AGENTS.md`
- **[[c3]]** `doc` `plans/design-intelligence-implementation.md#di3-guideline-creation-revision-and-agent-reuse`
- **[[c4]]** `prior-artifact` `/Users/subhagho/work/projects/insors/insrc/docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/DEF.md`
- **[[c5]]** `prior-artifact` `/Users/subhagho/work/projects/insors/insrc/docs/epics/di2-project-guideline-identity-versioned-lifecycle-E202610114abafc9d/DEF.md`
