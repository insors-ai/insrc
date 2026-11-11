<!-- insrc:artifact DEF-0765b3a578e43eec -->

# Epic: add-dedicated-security-reviews

## Summary

**Flavor:** new-capability

Developers can request a dedicated assessment of code and dependency vulnerabilities. Each report identifies the security model, evidence, and limits of the assessment.

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

## 4. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | Cloud inference uses the installed CLI provider. Embeddings and repository stores follow the existing local-first rules. | [[c2]] |
| `k2` | stakeholder | Use an explicitly selected security model alongside existing model selections. Keep repository access read-only and constrain advisory egress to the information required for lookup. | [[c1]] |

## 5. Stories

### 5.1 STORY-0765b3a578e43eec-s1 — Configure a dedicated security model

**User value:** `size: M`

Select and audit the reviewer model independently of core, mid, and cheap.

**Acceptance criteria:**

- **ac1:** Given a configured security model is available, when a security review starts, then it runs with that model and records its identity. If unavailable, it reports the blocker without a silent fallback.. _(operationalizes `k2`)_

### 5.2 STORY-0765b3a578e43eec-s2 — Isolate reviewer access and fetch dependency advisories

**User value:** `size: M`

Check current dependency advisories while protecting repository data and local credentials.

**Acceptance criteria:**

- **ac2:** Given a read-only review scope and resolved dependencies, when the reviewer checks public advisories, then lookups send only approved package coordinates through controlled egress, and unavailable sources or unresolved dependencies remain explicit gaps.. _(operationalizes `k2`)_

### 5.3 STORY-0765b3a578e43eec-s3 — Run and report a security-only review

**User value:** `size: M`

Request a review of vulnerabilities with actionable evidence.

**Depends on:** `s1`, `s2`

**Acceptance criteria:**

- **ac3:** Given a selected repository scope and revision, when a user requests a security review, then the report separates code findings, confirmed affected dependencies, and unverified coverage, with severity, evidence, prerequisites, and remediation.. _(operationalizes `k2`)_

## 6. References

- **[[c1]]** `stakeholder` `User request for dedicated security reviews`
- **[[c2]]** `convention` `AGENTS.md`
