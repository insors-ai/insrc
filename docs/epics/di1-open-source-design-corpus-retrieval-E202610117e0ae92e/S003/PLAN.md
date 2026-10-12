<!-- insrc:artifact PLAN-7e0ae92e8f3d3c3e-s3 -->

# Plan: E202610127e0ae92e:S003

## Summary

**Epic:** `di1-open-source-design-corpus-retrieval`
**LLD run:** `wf-1791786529879-oye9s2`
**LLD effective hash:** `a20e4da9408d...`

Build the pure coverage and editorial-validation layer, then author and evaluate a seed across Web, iOS and Android with concrete declarative examples. Human approval of the exact seed content is a separate required milestone before bundling. Finalization reuses existing eligibility and hash contracts; installation and retrieval remain later-story work.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define coverage contracts and fixed rubric | S | — | unit: coverage-schema preserves sc4 and rejects malformed duplicate or unsupported inputs | [[c1]] [[c2]] |
| 2 | **`t2`** Validate safe declarative specimens | M | `t1` | unit: specimen-safety rejects executable remote malformed and unbounded content | [[c3]] |
| 3 | **`t3`** Evaluate content-bound local cases | M | `t1`, `t2` | unit: evaluation-binding rejects stale definitions records specimens and fabricated results | [[c4]] |
| 4 | **`t4`** Bind explicit human editorial decisions | M | `t1`, `t3` | unit: editorial-binding requires explicit matching human decisions and preserves inferred authorship | [[c5]] |
| 5 | **`t5`** Assess complete domain and platform coverage | M | `t1`, `t2`, `t3`, `t4` | unit: coverage-matrix rejects missing gap duplicate or inapplicable domain-platform cells; unit: coverage-determinism preserves canonical identities and stable diagnostics | [[c1]] [[c2]] [[c4]] [[c5]] [[c6]] |
| 6 | **`t6`** Finalize candidates without hash cycles | M | `t5` | integration: candidate-coverage finalizes without hash cycles and rejects stale assessments; integration: candidate-coverage withholds draft rejected or relabelled inferred guidance | [[c6]] [[c7]] |
| 7 | **`t7`** Author visual foundation drafts and examples | M | `t2`, `t3` | integration: draft-visual-seed contains applicable visual foundations and examples without review stamps | [[c8]] |
| 8 | **`t8`** Author interaction and feedback drafts | M | `t7` | integration: draft-interaction-seed covers platform behavior and state examples without fabricated review | [[c3]] [[c4]] [[c8]] |
| 9 | **`t9`** Complete inclusive adaptation and style recipes | M | `t8` | integration: draft-seed-roster covers all domains and coherent style recipes while remaining unapproved | [[c2]] [[c5]] [[c8]] |
| 10 | **`t10`** Review the actual seed and record human decisions | M | `t4`, `t6`, `t9` | integration: seed-coverage proves all domain-platform cells and mandatory cross-platform cases | [[c5]] [[c8]] [[c9]] |
| 11 | **`t11`** Bundle only the reviewed immutable seed | M | `t10` | smoke: seed-bundle ships only reviewed eligible immutable content with complete notices; integration: seed-reader rejects unsafe local packages and preserves copied asset bytes | [[c7]] [[c9]] |
| 12 | **`t12`** Verify pure boundaries and complete the handoff | S | `t11` | smoke: coverage-isolation compiles pure modules and assesses candidates with I/O forbidden; smoke: strict-build compiles coverage and passes the full corpus regression suite | [[c6]] [[c7]] [[c9]] [[c10]] |

### 1.1 E202610127e0ae92e:S003:T001 — Define coverage contracts and fixed rubric

Define coverage contracts and fixed rubric within the approved S003 boundary.

**Acceptance checks:**
- Exact closed sc4 CoverageReport/Cell schemas reuse S001 domain/UI/identity types and preserve all HLD fields; add closed internal specimen, evaluation and editorial dossier schemas without coercion/defaults/unknown fields.
- Detached bounded snapshots reject malformed/adversarial inputs using existing issue codes; enforce 30 exact cells and the six named v1 cross-platform definitions, unique references and deterministic ordering.
- This task implements structural decode/rubric definitions only, from LLD §§2.1 and 3.1–3.5; semantic specimen, case, human-decision and coverage checks remain t2–t5.

### 1.2 E202610127e0ae92e:S003:T002 — Validate safe declarative specimens

Validate safe declarative specimens within the approved S003 boundary.

**Acceptance checks:**
- Implement the approved specimen shape in coverage/specimens.ts: bounded JSON, unique IDs, finite nonnegative values/order, exact role/state/unit unions and record/UI/kind/reference matching.
- Reject executable/remote fields and references; plain text stays inert and any review rendering escapes it. Validate lightweight palette, typography, state and layout evidence without claiming browser/device fidelity or accessibility certification.

### 1.3 E202610127e0ae92e:S003:T003 — Evaluate content-bound local cases

Evaluate content-bound local cases within the approved S003 boundary.

**Acceptance checks:**
- Implement pure definitions/results validation and deterministic check recomputation; resolve exact record versions and specimen bytes, role-constrained local evidence and complete observations.
- Compute acyclic definition/subject digests; fabricate no editorial pass. All six cross-platform definitions target all three UI types with positive/misuse evidence; fail unknown/missing/duplicate/stale observations, IDs or cases.

### 1.4 E202610127e0ae92e:S003:T004 — Bind explicit human editorial decisions

Bind explicit human editorial decisions within the approved S003 boundary.

**Acceptance checks:**
- Validate the separate maintainer-controlled human dossier against packaged decisions and exact record/case/cell subject digests, identities, UTC times and complete approval set.
- Missing/rejected/stale/duplicate/conflicting decisions fail; match sc1 record.review and cell reviewers; preserve inferred authorship and S002 author/rationale lineage. No generator, code review, LLD approval or synthetic fixture may stamp production human decisions.
- Document and test the record/case/cell review ordering and digest projections without dossier/report/final-release self-dependencies.

### 1.5 E202610127e0ae92e:S003:T005 — Assess complete domain and platform coverage

Assess complete domain and platform coverage within the approved S003 boundary.

**Acceptance checks:**
- Implement pure coverage assessment over complete validated candidate and separately supplied editorial dossier; require every record in every declared applicable cell and matching substantive domain/platform cases.
- Reconstruct case/approval evidence independently; reject missing/gap/duplicate/inapplicable cells, failed cross-platform cases, changed content and draft/relabelled guidance. Computable invalid candidates yield passed=false; noncomputable identities yield ValidationResult failure.
- Emit only stage=coverage bound to corrected candidateContentDigest; reuse S001/S002 without changing their schemas or replacing eligibility.

### 1.6 E202610127e0ae92e:S003:T006 — Finalize candidates without hash cycles

Finalize candidates without hash cycles within the approved S003 boundary.

**Acceptance checks:**
- Compose S002 eligible noncoverage inventory plus one declared coverage placeholder; canonicalize sc4 bytes, fill raw coverage digest, then reviewDigest and releaseId using existing S001 helpers.
- Independently re-run eligibility, validateRelease, coverage and checkPublication on final bytes; any failure returns no eligible package; include all editorial/evaluation outputs in S002 lineage and reject unused source material.
- Prove record/specimen/evidence/role/media-type mutations invalidate reviews or assessments; no installation/catalog/publication/default or project-state mutation.

### 1.7 E202610127e0ae92e:S003:T007 — Author visual foundation drafts and examples

Author visual foundation drafts and examples within the approved S003 boundary.

**Acceptance checks:**
- Create substantive draft guidance for Visual style, Layout, Color and Typography across Web/iOS/Android under design/corpus-seed/v1/, with per-platform positive/misuse examples and applicable domain payloads.
- Include concrete semantic palette pairings, typography hierarchy/expansion, layout priority/adaptation and controllable visual treatments; explicit checks/limits, tradeoffs, provenance and relations.
- Generated guidance is inferred and unreviewed; verify normative claims against primary sources during authoring or clearly scope as heuristics. No unapproved imports or draft assets under src/assets.

### 1.8 E202610127e0ae92e:S003:T008 — Author interaction and feedback drafts

Author interaction and feedback drafts within the approved S003 boundary.

**Acceptance checks:**
- Add Navigation and flows, Components and states, and Motion and feedback coverage for all three UI types, with explicit platform units/behavior and positive/misuse examples.
- Exercise navigation/context recovery, control states and meaningful motion/reduced-motion cases using the approved declarative format; maintain explicit check limits and inferred/draft provenance.
- Extend the authoring roster and local case evidence while preserving broken-reference/duplicate detection; no human approval or publication labels fabricated.

### 1.9 E202610127e0ae92e:S003:T009 — Complete inclusive adaptation and style recipes

Complete inclusive adaptation and style recipes within the approved S003 boundary.

**Acceptance checks:**
- Add Inclusive design, Platform adaptation, and Content and trust across all UI types, covering the LLD rubric and completing proposed evidence for all 30 cells and six cross-platform cases.
- Author at least three coherent style recipes with composition/typography/color/interaction, conditions/tradeoffs and platform examples; names are discovery aids, not industry stereotypes.
- Complete draft roster, provenance/lineage and review checklist for actual seed records/specimens/cases; all content stays outside bundled assets and unreviewed until explicit human decisions.

### 1.10 E202610127e0ae92e:S003:T010 — Review the actual seed and record human decisions

Review the actual seed and record human decisions within the approved S003 boundary.

**Acceptance checks:**
- Present concrete actual seed records, specimens, complete case observations, exact review subjects and reviewer/maintainer identity for explicit human editorial review; prepare all evidence before asking.
- Record only actual explicit human decisions, resolve rejection/staleness and update sc1 review fields consistently; LLD/PLAN approval and daemon code review do not approve seed content.
- Run actual seed coverage proving all 30 cells and six cross-platform evaluations. Without human approval, keep this task and S003 completion pending; synthetic fixtures can test machinery but cannot satisfy this acceptance check.
- Preserve durable evidence of the human's actual decision and exact subject digests separately from test execution. Archive actual-seed coverage output; tests of synthetic approval data cannot stand in for human review.

### 1.11 E202610127e0ae92e:S003:T011 — Bundle only the reviewed immutable seed

Bundle only the reviewed immutable seed within the approved S003 boundary.

**Acceptance checks:**
- Finalize the approved actual seed and place only its eligible immutable package under src/assets/design-corpus/releases/<releaseId>/ with the approved versioned bundled descriptor.
- Add separate bounded local maintainer verification tooling; reject unsafe paths/symlinks and executable/remote specimens, and verify exact records, specimen/evaluation/editorial files, source lineage and notices.
- Verify copied out/assets bytes match reviewed source package, drafts remain outside distribution and fresh independent eligibility/coverage preflight passes. Do not add S004 catalog/install/retrieval or S005 publication behavior.
- Run named local-reader symlink/path/byte-limit rejection and built-asset byte-parity tests in this task, before the final pure-isolation sweep.

### 1.12 E202610127e0ae92e:S003:T012 — Verify pure boundaries and complete the handoff

Verify pure boundaries and complete the handoff within the approved S003 boundary.

**Acceptance checks:**
- Compile fresh pure coverage entries and execute real assessment/finalization with filesystem/network/subprocess/native access forbidden; keep local maintainer I/O separate.
- Run accumulated corpus regression suite and strict build on supported Node; preserve unabridged results and disclose unrelated broader failures. Every preceding task already runs its mapped tests at its own gate.
- Document seed review/rebuild process and S004/S005 handoff; request independent daemon code review, preserve findings, then request explicit BUILD completion approval without auto-approval.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| coverage-schema preserves sc4 and rejects malformed duplicate or unsupported inputs | `t1` |
| specimen-safety rejects executable remote malformed and unbounded content | `t2` |
| evaluation-binding rejects stale definitions records specimens and fabricated results | `t3` |
| editorial-binding requires explicit matching human decisions and preserves inferred authorship | `t4` |
| coverage-matrix rejects missing gap duplicate or inapplicable domain-platform cells | `t5` |
| coverage-determinism preserves canonical identities and stable diagnostics | `t5` |
| candidate-coverage finalizes without hash cycles and rejects stale assessments | `t6` |
| candidate-coverage withholds draft rejected or relabelled inferred guidance | `t6` |
| seed-coverage proves all domain-platform cells and mandatory cross-platform cases | `t10` |
| seed-bundle ships only reviewed eligible immutable content with complete notices | `t11` |
| coverage-isolation compiles pure modules and assesses candidates with I/O forbidden | `t12` |
| strict-build compiles coverage and passes the full corpus regression suite | `t12` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 §2.1 CoverageReport sc4`
- **[[c2]]** `prior-artifact` `LLD s3 §§3.1–3.2 Coverage schemas, pure modules and versioned rubric`
- **[[c3]]** `prior-artifact` `LLD s3 §3.3 Declarative specimen v1`
- **[[c4]]** `prior-artifact` `LLD s3 §3.4 Evaluation definitions and results`
- **[[c5]]** `prior-artifact` `LLD s3 §3.5 Human editorial decision dossier`
- **[[c6]]** `prior-artifact` `LLD s3 §2.2 StageAssessment and shared publication preflight`
- **[[c7]]** `prior-artifact` `LLD s3 §3.7 Non-cyclic assembly and bundled handoff`
- **[[c8]]** `prior-artifact` `LLD s3 §3.6 Seed content and authoring inventory`
- **[[c9]]** `prior-artifact` `LLD s3 §3.7 Human approval prerequisite, safe local verification and distribution boundary`
- **[[c10]]** `prior-artifact` `LLD s3 §7 Test strategy`
