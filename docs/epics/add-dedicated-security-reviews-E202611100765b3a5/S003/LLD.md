<!-- insrc:artifact LLD-0765b3a578e43eec-s3 -->

# LLD: STORY-0765b3a578e43eec-s3 — Run and report a security-only review

## Summary

**Epic:** `add-dedicated-security-reviews`
**HLD base run:** `wf-1795324517306-yi2irl`
**HLD effective hash:** `60b05edbecc2...`
**Tracker:** [insors-ai/insrc#228](https://github.com/insors-ai/insrc/issues/228)

This revision makes no functional or contract change to s3. It carries a single HLD text correction: nonFunctional.security's sentence describing s3's dispatch access level no longer matches the capabilityPolicy fail-closed gate added by the prior pending amendment (LLD revision 6), so this amendment corrects that one sentence via a properly-shaped nonFunctional.retarget proposal.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [HLD context](#2-hld-context)
3. [Contract details](#3-contract-details)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. Epic impact analysis

**Stories covered:** `s1`, `s2`

No change from the prior amendment's own epicImpact finding: s1's SecurityModelSelection resolution and s2's dependency-advisory collection are both untouched by this purely textual HLD correction. This second amendment does not reopen, re-validate, or touch either Story's own files, tests, or BUILD records in any way -- it exists solely to carry a correctly-shaped nonFunctional.retarget proposal that the prior amendment attempt failed to express in the applier's real schema.

**Sources:**
- /home/subho/work/dev/insors/insrc/.insrc/artifacts/BUILD-0765b3a578e43eec-s1.json
- /home/subho/work/dev/insors/insrc/.insrc/artifacts/BUILD-0765b3a578e43eec-s2.json
- /home/subho/work/dev/insors/insrc/.insrc/artifacts/HLD-0765b3a578e43eec.json

## 2. HLD context

> See **HLD-0765b3a578e43eec** § 2. Framework summary

**Rollout phase:** Phase B -- run and report the security-only review
**Owns:** `sc3` (SecurityReviewEntryPoint)
**Consumes:** `sc1` (SecurityModelSelection), `sc2` (SecurityAdvisoryEvidence)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Model-tier resolution (extending src/config/role-taxonomy.ts with a security role), availability/credential checks, and the no-silent-fallback blocker-reporting logic stay private to s1; only the resolved SecurityModelSelection crosses its boundary. s1 must also specify the configuration contract for an INDEPENDENTLY selectable security-model binding (distinct from core/mid/cheap) and its interaction with coreFloor enforcement and unavailable-model handling; this is s1's central, still-open design question. — owns `sc1`
- `s2`: pkg_audit's package-manager resolution; s2 runs with the SAME host access as the controller itself -- no network or filesystem sandboxing is attempted (explicit user direction: constraining the reviewer degrades review accuracy). s2 instead RECORDS, per manager, which destination was actually reached and what was disclosed (observability for the final report, not a basis for refusal); the documented per-manager input/mode mapping (npm/pnpm/yarn/cargo: manifest+lockfile scope; pip/pipenv/poetry: the repository's own resolved environment, never the ambient active environment pip-audit defaults to; go: the repository's own module source directly, since govulncheck performs source-level analysis, not a manifest read) is retained as a CORRECTNESS/targeting requirement, with an explicit coverage gap for any manager s2 cannot correctly target under that mapping; and the advisory-match collection that populates SecurityAdvisoryEvidence (stamped with the pinned contentIdentity, computed by hashing the complete required input set's actual bytes directly) stay private to s2. No model, tool-loop, or CLI session is involved in s2 at all. ac2's gap-reporting distinguishes a SUCCESSFUL audit that found vulnerabilities (a valid, parseable result regardless of exit code -- pkg_audit's own auditArgv already marks every supported manager nonZeroOk:true) from an EXECUTION GAP (spawn failure, unparseable output, an unsupported manager, or a manager s2's input/mode mapping cannot correctly target) -- these are never conflated. — owns `sc2`

## 3. Contract details

**Surface level:** internal-shared

### 3.1 `runSecurityReview`

```typescript
function runSecurityReview(request: SecurityReviewStepRequest): Promise<SecurityReviewStepResponse>
```

**Parameters:**
- `request: SecurityReviewStepRequest` — The insrc_security_review_step phase='start' request (targets/repo/optional epicHash+storyId, or a confirm_wait resumption with state+proceed).

**Returns:** `Promise<SecurityReviewStepResponse>` — Either a confirm_wait pause (stale index) or the terminal done response carrying the SecurityReviewReport and its markdown rendering.

**Preconditions:**
- s1's SecurityModelSelection and s2's SecurityAdvisoryEvidence are both available for the pinned contentIdentity.

**Postconditions:**
- Unchanged by this amendment: the code-vulnerability pass is dispatched through CliProvider.runReadOnlySession under the capabilityPolicy gate introduced by the prior pending amendment (LLD revision 6); this amendment makes no change to that dispatch, only to the HLD's own descriptive text.

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | Unchanged by this amendment. s3 continues to own sc3 (SecurityReviewEntryPoint) exactly as specified in the prior LLD revision; this amendment touches no part of sc3's shape or behavior. |
| `sc1` | consumes | Unchanged by this amendment. s3 continues to consume s1's SecurityModelSelection to pick the dispatch model/provider. |
| `sc2` | consumes | Unchanged by this amendment. s3 continues to consume s2's SecurityAdvisoryEvidence, verifying contentIdentity before trusting it. |

## 5. Error paths

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The prior pending amendment (LLD revision 6, capabilityPolicy) is rejected or revised before this amendment is applied. | This amendment's oldTarget is matched against the HLD's CURRENT nonFunctional.security text at apply time; if the capabilityPolicy amendment was not yet applied, this amendment's oldTarget string (which assumes the original, unamended text) still matches the HLD as it stands today, since nonFunctional.retarget amendments are applied independently and in the order they are approved -- so this amendment can be approved and applied regardless of the other amendment's outcome, as long as the HLD's nonFunctional.security text has not already diverged from oldTarget by some other change. |

## 6. Test strategy

**Test framework:** `vitest`

**Test levels**

- **contract** — Confirm the HLD nonFunctional.security amendment, once applied, no longer contradicts the LLD's own (already-built) capabilityPolicy fail-closed gate text -- a documentation-consistency check, not a code test, since this amendment makes no functional change.
  - Subjects: `HLD-0765b3a578e43eec.json body.nonFunctional.security (post-amendment)`, `LLD-0765b3a578e43eec-s3.json / S003/LLD.md (capabilityPolicy design, revision 6)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac3` | `Pre-existing: ac3 is already proven by s3's own BUILD/tests (unchanged by this amendment, which touches only the HLD's descriptive text, not s3's code or behavior).` |

## 7. Alternatives considered

### 7.1 a1: Single-sentence in-place correction — **CHOSEN**

Replace only the one sentence about s3's dispatch access level; leave every other sentence of nonFunctional.security byte-for-byte identical.

Keep the entire nonFunctional.security paragraph as-is except the sentence about s3's dispatch access level is replaced with a sentence describing the new fail-closed capabilityPolicy gate (LLD revision 6): the pinned provider must be on an explicit qualification record for strict-read-analyze before any inference starts, or the pass fails closed with a named error, never silently substituting a provider; notes this is a capability-policy admission gate, not the network/filesystem sandboxing k2 rules out, and that the generic build-validate judge session keeps its own prior write-sandboxed behavior unaffected.

### 7.2 a2: Leave the HLD text as-is; record the tension as an openQuestion instead

Don't amend the HLD at all; flag the contradiction as an open question for a future HLD revision.

Skip the nonFunctional.retarget amendment entirely and instead record an openQuestion on this LLD noting the HLD's nonFunctional.security text is now stale, to be resolved whenever the HLD is next revised.

**Rejected because:** Meets every constraint trivially, but fails the user's explicit instruction to fix the contradiction now.

### 7.3 a3: Rewrite the full nonFunctional.security paragraph

Rewrite the entire paragraph from scratch for flow, not just the one stale sentence.

Replace the whole nonFunctional.security text with a freshly composed paragraph covering the same ground in a single, newly-written narrative rather than a minimal edit.

**Rejected because:** Meets every constraint as well as a1, but at unnecessary cost of re-touching unrelated sentences.

## 8. References

- **[[c1]]** `doc` `.insrc/artifacts/HLD-0765b3a578e43eec.json#body.nonFunctional.security`
- **[[c2]]** `doc` `docs/epics/add-dedicated-security-reviews-E202611100765b3a5/S003/LLD.md`

## Citations

- **[[c1]]** `doc` `.insrc/artifacts/HLD-0765b3a578e43eec.json#body.nonFunctional.security`
- **[[c2]]** `doc` `docs/epics/add-dedicated-security-reviews-E202611100765b3a5/S003/LLD.md`
