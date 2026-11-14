<!-- insrc:artifact LLD-4adebe9eb17a3ef2-s1 -->

# LLD: STORY-4adebe9eb17a3ef2-s1 — Separate daemon development and release build lanes

## Summary

**Epic:** `separate-daemon-development-release-build-lanes`
**HLD base run:** `wf-1794663683617-c2huez`
**HLD effective hash:** `b1d6f6a0370a...`

Use v2 for unpublished development builds and protected main for production release candidates. Tests still run locally, and only the archive built and qualified from main can be published.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `Build candidate`

```typescript
branch ref + exact commit SHA + version → lane, run, artifact and SHA-256
```

**Returns:** `result` — Verified lane and exact candidate identity or refusal.

**Errors:**
- `ReleaseGate` when Branch, provenance, or protection does not match the lane.

**Preconditions:**
- Derive lane from actual dispatch ref; admit only main and v2. Require GitHub branch protection on main. The v2 build job has read-only permissions and no signing or release environment.
- For both lanes dispatch SHA must equal requested SHA; reject all other refs.
- Release lane readiness is an explicit repository variable INSRC_DAEMON_MAIN_RELEASE_READY with the only enabling value 'true'. Missing or any other value blocks the main build job before macOS runner allocation and blocks both main signing workflows before a secret-bearing job can start. It does not affect read-only v2 development builds. Do not expose a dispatch input that can override readiness.
- Use the repository variable as an early scheduling gate, not a durable authorization. For main-only privileged jobs, consult live repository readiness by its exact repository-variable API endpoint, rather than relying on the workflow vars snapshot or an organization variable of the same name.

**Postconditions:**
- Upload unpublished artifact with lane-distinct name and branch/lane in candidate metadata. Run no Actions tests.
- Build artifact name is daemon-candidate-<lane>-<commit>-<attempt> and candidate.json records lane, origin branch, commit, run ID, run attempt and the inner archive size and SHA-256. The immutable upload supplies the artifact ID; the run summary records the complete identity.

### 2.2 `Qualify candidates`

```typescript
main build run + artifact + exact commit → qualification signature, then local evidence
```

**Returns:** `result` — Verified lane and exact candidate identity or refusal.

**Errors:**
- `ReleaseGate` when Branch, provenance, or protection does not match the lane.

**Preconditions:**
- Run the release qualification-signing workflow from protected main and accept only successful candidate runs originating at main. Verify branch and commit on run and artifact metadata, repository/workflow identity, lane and digest.
- Use v2 candidates for local packaging and smoke checks only; never give a v2 job production or qualification signing credentials.
- Both GitHub signing environments (daemon-pilot-qualification and daemon-pilot-production) use selected deployment refs with exactly one branch rule main, zero tag rules, designated reviewers, prevention of self-approval, and no administrator bypass where supported. Configure and verify actual environment protection independently of workflow YAML; fail closed before signing if any policy is missing or cannot be verified. Store each signer only in its own environment secrets, never repository or organization secrets. A v2 or tag workflow requesting either environment directly must be denied by GitHub.
- Resolve the exact successful GitHub run attempt, not the latest run conclusion. Require run ID, attempt number, main branch, repository/head repository, exact commit, dispatch event and trusted workflow identity to agree with GitHub's attempt record. Require the immutable artifact ID to belong to that run and match the expected lane/commit/attempt artifact name, with GitHub artifact repository, branch and SHA matching and no expiration. Check candidate.json identity and inner archive digest after download. A later successful rerun cannot authorize an artifact from a failed attempt.
- After GitHub environment approval and immediately before each signing operation, fetch live readiness and recheck the relevant main protection and environment policy. A missing, non-true, unavailable or unverifiable setting aborts. Keep qualification credentials environment-scoped.

**Postconditions:**
- Before testing, the isolated qualification signer fetches and verifies the exact main artifact and signs its manifest using only the qualification key. This signature authenticates a test input; it does not attest to passing tests or authorize publication.
- The operator downloads the same archive and signed manifest; the disposable Apple Silicon installer verifies the qualification signature before execution. The operator then records the passing checks in the protected release-control record, binding repository, main commit, run ID, artifact ID, manifest SHA-256 and archive SHA-256.
- The reviewed local evidence names the run attempt in addition to run and artifact IDs. Reject old qualification records that omit it.
- Place a required candidateOrigin object inside the signed manifest: repository (canonical GitHub repository ID), branch (main), lane (release), commit SHA, run ID, run attempt and artifact ID. The manifest's signed archive SHA-256 and size bind that origin to the archive. Populate candidateOrigin only after independently verifying GitHub's exact attempt and artifact, never from unsigned operator evidence alone. Require strict schema parsing; older manifests without candidateOrigin are ineligible for production promotion.

### 2.3 `Publish main release`

```typescript
approved evidence commit + archive SHA-256 → immutable-identity prerelease
```

**Returns:** `result` — Verified lane and exact candidate identity or refusal.

**Errors:**
- `ReleaseGate` when Branch, provenance, or protection does not match the lane.

**Preconditions:**
- Promotion executes only on protected main and behind the production environment approval. Independently require the exact candidate origin branch to be main even when run IDs and digests are valid; validate the approved evidence and qualification signature.
- Do not reuse a v2 archive after merging its source to main. A main candidate must be built and locally qualified separately.
- Promotion happens after local qualification and review of that immutable release-control revision. Recheck the recorded evidence and its digests, the qualification signature, GitHub main run/artifact provenance, and exact manifest/archive bytes before granting the production signing step.
- Independently repeat the same attempt-specific run/artifact checks and environment policy/readiness checks before production signing; do not rely on the qualification workflow's conclusions. The production approval reference includes the approved release-control commit and selected archive SHA-256.
- Require exact equality of every signed candidateOrigin field and signed archive identity against both the approved qualification record and the independently fetched GitHub attempt/artifact. A different successful attempt or artifact is rejected even when the commit and archive SHA-256 match.
- After GitHub environment approval and immediately before each signing operation, fetch live readiness and recheck the relevant main protection and environment policy. Before each externally visible publication mutation (tag creation, draft creation, asset upload, and draft publication), repeat the live checks. A missing, non-true, unavailable or unverifiable setting aborts; discard unpublished signatures on failure. Keep signing credentials environment-scoped; any read-only policy credential cannot sign or publish. An API check and a following GitHub write are not atomic; do not promise that toggling readiness alone cancels an already admitted write.

**Postconditions:**
- Production signs the unchanged manifest bytes and publishes the unchanged locally qualified main archive. The qualification workflow never needs local evidence; only production promotion consumes the approved evidence.

## 3. Data model changes

### 3.1 `Candidate provenance` — field-add

Build metadata records origin branch and lane. GitHub's repository, workflow run and artifact metadata are authoritative for origin; archive metadata is cross-checked, never used alone to decide eligibility. Promotion and qualification signing are fixed to main rather than taking an expected branch from workflow inputs. The qualification record binds (repository, main, release lane, commit, run ID, run attempt, artifact ID, manifest SHA-256, archive SHA-256). Candidate metadata and artifact name carry the attempt, and the exact attempt endpoint must report success. The manifest signature binds candidateOrigin to signed archive bytes, independently of the evidence record; both the qualification and production signature cover the same manifest bytes.

**Call sites:**
- `scripts/daemon-release-artifact.sh`
- `.github/workflows/daemon-candidate.yml`
- `.github/workflows/daemon-promotion.yml`
- `.github/workflows/daemon-qualification-sign.yml`

## 4. Diagrams

- [Sequence diagram](docs/standalone/separate-daemon-development-release-build-lanes-E202611144adebe9e/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **A v2 artifact is submitted to main qualification or production promotion** (recoverable)
  - Detection: Exact GitHub run/artifact provenance differs from fixed expected main ref.
  - Response: Reject before signing or publishing.
  - User impact: Build and qualify a new main candidate.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Byte-identical archive from v2 and main | Only main-origin run and artifact qualify for production. |
| Manual workflow missing on default branch | Add the workflow definitions through a narrow reviewed main change; keep main candidate build disabled until packaging code is present in its selected main revision. |
| Artifact from failed attempt 1 and a successful attempt 2 of the same run | Reject attempt 1 even though the current run is green; reject a substituted artifact when the requested attempt and artifact name differ. |
| v2 workflow requests the production environment directly | GitHub rejects the deployment because only branch main is permitted and no tags are allowed. |
| Workflows are present on main but the readiness variable is missing or false | v2 can build; main cannot allocate a macOS runner or start qualification signing or production promotion. |
| A different successful main attempt produces byte-identical archive bytes | Reject if its run attempt or artifact ID differs from the signed manifest, even with identical commit and digest. |
| Readiness disabled during approval, after signing, or while a publication mutation is pending | A live recheck refuses the next mutation; explicitly cancel queued and running release signing/promotion and confirm terminal status. Inspect any tag/draft/assets left by a completed or in-flight operation before retrying; do not silently overwrite or publish them. |

## 6. Test strategy

**Test framework:** `Add new local executable coverage during implementation. Existing tests cover digest and evidence checks and no rebuild; they do not currently exercise two-lane routing or mocked GitHub branch provenance. Run Node tests locally only.`

**Test levels**

- **contract** — Exercise branch routing and cross-lane failures locally
  - Subjects: `New local workflow policy fixture: main protected builds a release candidate, main unprotected refuses, v2 creates an unsigned development artifact, and all other refs refuse`, `New mocked GitHub API integration: main run plus matching artifact succeeds; v2 origin, mismatched run branch and artifact branch, wrong repository/workflow/commit/run ID or expired artifact all refuse before download or signing`, `New workflow wiring check: both qualification-sign and promotion enforce main provenance independently, dev jobs have no signing environment, and no Actions test commands are added`, `New local sequence coverage: qualification signature precedes verified test install; failed or absent local record blocks production signing; valid approved evidence admits the identical manifest/archive`, `New local GitHub policy fixtures: enforce exact main branch-only rules and reject a tag rule, extra branch rule, missing reviewers, self-approval, bypass, unavailable policy and v2 environment access`, `New mocked API test: failed attempt 1 plus successful attempt 2; reject attempt 1 and cross-attempt artifact substitution, accept only successful matching attempt`, `New local job-admission tests: missing or false readiness blocks main build before runner and both signing workflows, but v2 development still builds`, `New test: two successful main attempts with the same commit and archive bytes; substitute attempt or artifact ID and assert promotion rejects the valid signature for the wrong identity`, `New test: readiness is true at scheduling and false after approval, or becomes false after signing; deny signing or the next publish mutation, respectively. Missing/read-failed live settings also fail closed.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `To add: build workflow policy fixture exercising protected and unprotected main, v2, and an unrelated ref; ensure no hosted test commands or dev signing credentials` |
| `ac2` | `To add: mocked GitHub API success for main; replay v2 with matching digest at both production gates and assert refusal before download/signing; separately exercise mixed run/artifact identity and expired artifact` |
| `ac3` | `To add: signed qualification manifest is usable before evidence exists; promotion refuses missing/mismatched evidence and signs only the exact qualified input bytes after approval` |
| `ac4` | `Verify both signing environments block v2 and tags, deny mismatched or unavailable policy, and restrict keys to separate environment secrets. Local tests mock policy responses; separately record real GitHub configuration verification before enabling readiness.` |
| `ac5` | `Check exact successful attempt binding, including failed earlier attempt despite successful rerun and cross-attempt artifact substitution.` |
| `ac6` | `With readiness missing, false or malformed, main allocates no macOS runner and no signing job starts; v2 continues building.` |
| `ac7` | `Reject a valid qualification signature replayed for a second successful main attempt with identical archive and commit; check every origin field against both evidence and GitHub.` |
| `ac8` | `Mock disable while approval is pending and after signing; verify no signing or next publication mutation, respectively. Verify read errors stop work and document operator cancellation/reconciliation.` |

## 7. Migration

**State before:** All candidate and signing workflows currently require v2.

**State after:** v2 builds unpublished dev candidates; protected main builds, signs and promotes its own candidates.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Land workflow definitions on main via a narrow reviewed change, leaving INSRC_DAEMON_MAIN_RELEASE_READY absent (disabled). — ↩ rollbackable
2. Use unsigned v2 builds. When main contains the packaging and installer code, configure and verify protected main, both main-only environments, readiness prerequisites and independent secrets; only then set INSRC_DAEMON_MAIN_RELEASE_READY to true. Disable release lane by removing the variable; do not relax environment protections. To stop releases, first remove readiness, then cancel all queued, approval-pending and running main release workflows, confirm they are terminal, and reconcile any partial GitHub tag/draft/assets before re-enabling. An operation already accepted by GitHub may finish. — ↩ rollbackable
3. Build and qualify a fresh main candidate locally; do not promote historic v2 pilot artifacts. — ↩ rollbackable

**Backward compat:** Clone-based installer remains default; permit no prior v2 release-control evidence for production.

## 8. Alternatives considered

### 8.1 a1: Separate lanes — **CHOSEN**

Build from both refs and release only main.

Classify by the actual dispatch branch and enforce main provenance independently at production signing.

### 8.2 a2: Promote v2 candidates

Publish an existing development candidate.

Approve a v2 artifact and publish without a main build.

**Rejected because:** Production artifact would originate at v2.

## 9. References

- **[[c1]]** `code` `.github/workflows/daemon-candidate.yml`
- **[[c2]]** `code` `.github/workflows/daemon-qualification-sign.yml`
- **[[c3]]** `code` `.github/workflows/daemon-promotion.yml`
- **[[c4]]** `code` `scripts/daemon-release-artifact.sh`
- **[[c5]]** `code` `scripts/__tests__/promote-daemon-candidate.test.ts`
