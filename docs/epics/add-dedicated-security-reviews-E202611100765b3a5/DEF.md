<!-- insrc:artifact DEF-0765b3a578e43eec -->

# Epic: add-dedicated-security-reviews

## Summary

**Flavor:** new-capability

Developers can request a dedicated assessment of code and dependency vulnerabilities. Each report identifies the security model, evidence, and limits of the assessment. The data-model extension points this review needs -- SecurityFinding, SecurityLocator, the EvidenceProvider registry, VerificationReceipt, and their JSON Schema transformers -- are already built (standalone Story add-securityfinding-capability-family-delegates-framing, epicHash 779e9a08142cb057, s1, BUILD approved); this Epic's Stories add the model selection, isolated execution, advisory fetching, and reporting logic that populate those types, not a redesign of the types themselves.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Constraints](#4-constraints)
5. [Stories](#5-stories)
6. [References](#6-references)

## 1. Problem

Insrc's general review flow does not give developers a dedicated assessment of vulnerabilities or a separately chosen security reviewer model. It also lacks a defined way to check resolved dependencies against current advisories while keeping repository and credential access bounded, making it hard to distinguish verified findings from gaps in coverage.

## 2. Functional requirements

- **E202611100765b3a5:FR001** — Run a separate security-only review using a specified security model and record the effective model in the report.
- **E202611100765b3a5:FR002** — Assess relevant code vulnerabilities and resolve direct and transitive dependency advisory matches where exact versions are available.
- **E202611100765b3a5:FR003** — Give findings evidence, severity, exploit prerequisites, and remediation guidance. Report unresolved versions, missing evidence and unavailable advisory sources explicitly.

## 3. Non-goals

- **General code quality review and automatic remediation** — This workflow is scoped to security assessment.
- **Redesigning the SecurityFinding / SecurityLocator / EvidenceProvider / VerificationReceipt data model** — Already built as extension-point types by the standalone Story add-securityfinding-capability-family-delegates-framing (epicHash 779e9a08142cb057, s1, BUILD approved: src/workflow/review-round/security-finding.ts, security-locator.ts, evidence-provider.ts, receipt-record.ts, security-schema.ts). This Epic's Stories build on those types; an insrc_analyze_step capability-discovery run against src/workflow/review-round found zero clear-match and only data-shape partial-matches for a real security-review execution pass, confirming no execution logic exists yet to duplicate.

## 4. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | Cloud inference uses the installed CLI provider. Embeddings and repository stores follow the existing local-first rules. | [[c2]] |
| `k2` | stakeholder | Use an explicitly selected security model alongside existing model selections. The reviewer runs with the SAME host access as the controller itself -- no sandboxing or egress/filesystem restriction is imposed, since constraining the reviewer would degrade review accuracy (explicit user direction). Lookups are correctly targeted at the repository's own resolved dependencies (never an ambient/mismatched environment), and the destination and disclosure of each lookup are recorded for the final report, not restricted. | [[c1]], [[c5]] |

## 5. Stories

### 5.1 STORY-0765b3a578e43eec-s1 — Configure a dedicated security model

**User value:** `size: M`

Select and audit the reviewer model independently of core, mid, and cheap.

**Acceptance criteria:**

- **ac1:** Given a configured security model is available, when a security review starts, then it runs with that model and records its identity. If unavailable, it reports the blocker without a silent fallback.. _(operationalizes `k2`)_

### 5.2 STORY-0765b3a578e43eec-s2 — Isolate reviewer access and fetch dependency advisories

**User value:** `size: M`

Check current dependency advisories while protecting repository data and local credentials, implementing the EvidenceProvider registry's dependency-sbom category (already typed in evidence-provider.ts) by wiring the existing pkg_audit tool rather than building a new advisory fetcher.

**Acceptance criteria:**

- **ac2:** Given a read-only review scope and resolved dependencies, when the reviewer checks public advisories, then the reviewer runs with the same host access as the controller (no sandboxing); lookups are correctly targeted at the repository's own resolved dependencies, never an ambient or mismatched environment; the destination and disclosure of each lookup are recorded for the final report; and unavailable sources or unresolved dependencies remain explicit gaps, implemented as the EvidenceProvider registry's dependency-sbom category wired to the existing pkg_audit tool (src/daemon/tools/builtins/pkg/index.ts), not a new fetcher.. _(operationalizes `k2`)_

### 5.3 STORY-0765b3a578e43eec-s3 — Run and report a security-only review

**User value:** `size: M`

Request a review of vulnerabilities with actionable evidence, populating the already-typed SecurityFinding/SecurityEvidence/VerificationReceipt shapes rather than redefining them.

**Depends on:** `s1`, `s2`

**Acceptance criteria:**

- **ac3:** Given a selected repository scope and revision, when a user requests a security review, then the report separates code findings, confirmed affected dependencies, and unverified coverage, with severity, evidence, prerequisites, and remediation, populating the existing SecurityFinding (security-finding.ts) and VerificationReceipt (receipt-record.ts) shapes rather than defining new ones.. _(operationalizes `k2`)_

## 6. References

- **[[c1]]** `stakeholder` `User request for dedicated security reviews`
- **[[c2]]** `convention` `AGENTS.md`
- **[[c3]]** `prior-artifact` `BUILD-779e9a08142cb057-s1`
- **[[c4]]** `code` `src/daemon/tools/builtins/pkg/index.ts`
- **[[c5]]** `stakeholder` `User direction (security-review Epic design session): the reviewer must have the same access privileges as the controller; sandboxing or constraining it would degrade review accuracy. Applied across the Epic design.`

## Citations

- **[[c1]]** `stakeholder` `User request for dedicated security reviews`
- **[[c2]]** `convention` `AGENTS.md`
- **[[c3]]** `prior-artifact` `BUILD-779e9a08142cb057-s1`
- **[[c4]]** `code` `src/daemon/tools/builtins/pkg/index.ts`
- **[[c5]]** `stakeholder` `User direction (security-review Epic design session): the reviewer must have the same access privileges as the controller; sandboxing or constraining it would degrade review accuracy. Applied across the Epic design.`
