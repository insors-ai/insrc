<!-- insrc:artifact LLD-a832f5b2560d917f-s1 -->

# LLD: STORY-a832f5b2560d917f-s1

## Summary

**Epic:** `remove-signing-keys-from-review-activation`
**HLD base run:** `wf-1793333884419-pqrofu`
**HLD effective hash:** `a832f5b2560d...`

Remove external signing and key provisioning from review activation. An approved canonical installed-probe record supplies the evidence; the daemon continues validating isolation observations, installation pins, freshness and runtime files. This change does not activate the engine or remove remaining verification gates.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

## 3. Data model changes

### 3.1 `Canonical installed-probe report` — field-modify

Existing version:1/kind/origin/evidence envelope remains; signature becomes optional deprecated inert metadata for backward compatibility, with the existing string bound if present. No key read or cryptographic signature verification. Each readiness record owns exactly one reference per source mode to an approved immutable probe revision; each probe embeds one NativeIsolationEvidence snapshot. Reference direction and cardinality unchanged. Old signed records need no rewrite; unsigned records require normal canonical approval.

**Call sites:**
- `src/daemon/review-investigation-adoption.ts`
- `src/daemon/__tests__/review-investigation-adoption.test.ts`

### 3.2 `Installed qualification authority` — invariant-change

Remove verifyInstalledProbeSignature and verifyProbe injection seam. Keep verifyInstalled callback: re-read approved evidence reference on every use; require same approved reference and evidence digest. Existing qualifyInvestigationAdapter still validates exact identity, schema, required denial observations, ACK/cancel ordering, expiry and private runtime files before issuing its WeakMap handle. No raw export/model claim/scripted fixture becomes authority automatically.

**Call sites:**
- `src/daemon/review-investigation-adoption.ts`
- `src/agent/providers/investigation-session.ts`

## 4. Error paths

**Error cases**

- **Raw unsigned export, draft, stale or edited canonical probe submitted** (recoverable)
  - Detection: readApprovedEvidence rejects missing current approval, revision/hash/history mismatch; export envelope does not match installed-probe schema
  - Response: Refuse activation with not-ready; no fallback or approval write
  - User impact: Correct or approve the actual evidence record
- **Missing denial observations, changed installation or expired evidence** (recoverable)
  - Detection: Existing qualification schema, exact identity, file pins and expiry checks
  - Response: Refuse qualification and active-use revalidation
  - User impact: Rerun affected runtime checks and approve updated record

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Valid approved probe without signature and no trust key file | Proceed to unchanged runtime evidence checks; no key IO |
| Legacy approved report contains bounded signature metadata | Accept metadata without using it as authority; all canonical/runtime checks still required |
| Approved report changes after qualification | verifyInstalled callback reloads canonical reference and refuses stale/different digest |

**Invariants to preserve**

- Exact installation, configuration, source-mode and scoped inventory validation remain required; no automatic production authority for fixture/model claims. [[c1]]
- Canonical approval and runtime WeakMap handles remain the authority boundaries; activation signoff remains separate. [[c1]]

## 5. Test strategy

**Test framework:** `node:test with tsx, as src/daemon/__tests__/review-investigation-adoption.test.ts`

**Test levels**

- **integration** — Prove canonical approval replaces crypto without weakening production refusal
  - Subjects: `Approved installed probe without signature is accepted without trust-key provisioning`, `Draft stale and tampered evidence remain refused`, `Legacy signature metadata is inert and bounded`, `Qualification still rejects incomplete isolation evidence, changed runtime pins and stale canonical authority`
  - Fixtures: `Existing adoption canonical store fixtures and native qualification fixture`
- **smoke** — Operator guidance reflects the actual activation boundary
  - Subjects: `Operator prerequisites and runbook omit signer/trust-key provisioning and preserve runtime isolation and explicit signoff`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Approved installed probe without signature is accepted without trust-key provisioning`, `Legacy signature metadata is inert and bounded` |
| `ac2` | `Draft stale and tampered evidence remain refused`, `Qualification still rejects incomplete isolation evidence, changed runtime pins and stale canonical authority` |
| `ac3` | `Operator prerequisites and runbook omit signer/trust-key provisioning and preserve runtime isolation and explicit signoff` |

## 6. Migration

**State before:** c1: adoption requires signature in approved installed-probe report plus external public key; runtime qualification independently validates isolation and files.

**State after:** Approved installed-probe report is read through existing canonical approval validation; signature is optional legacy metadata. Runtime isolation checks remain unchanged.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Deploy report parser and canonical revalidation changes plus focused regressions; update operator prerequisites/runbook. — ↩ rollbackable
2. For future evidence, approve unsigned installed-probe reports through existing workflow; no automatic record conversion, config selection or activation. — ↩ rollbackable

**Backward compat:** Existing signed version-1 reports retain their schema and approval hashes; optional bounded signature is ignored. Older daemon versions still require signed records and cannot consume newly approved unsigned reports. Rollback leaves legacy engine selected until its own prerequisites hold. No key deleted or created.

## 7. Alternatives considered

### 7.1 a1: Approved canonical record — **CHOSEN**

Use the existing approved probe record as authority; remove crypto.

Require versioned installed-probe evidence from the canonical approved record. Remove signature and key verification, retaining all identity/isolation/file checks and canonical freshness verification on every qualification use.

### 7.2 a2: Daemon private attestation database

Replace signatures with a new daemon-owned probe registry.

Persist a daemon-private authority registry mapping probe evidence digests to launch observations and consult it during production activation in addition to canonical approvals.

**Rejected because:** Meets removal but introduces an unnecessary new authority store and lifecycle.

## 8. References

- **[[c1]]** `analyze-bundle` `src/daemon/review-investigation-adoption.ts` — "Analyzer locates verifier and qualifier but omits dynamic calls; direct source confirms two signature calls in adoption evidence() and assertQualified(). Canonical readApprovedEvidence already enforce"
- **[[c2]]** `code` `src/agent/providers/investigation-session.ts`
- **[[c3]]** `stakeholder` `user:2026-10-30` — "point 1 I get, point 2 is overengineering"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 11 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-30T04:21:40.638Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
