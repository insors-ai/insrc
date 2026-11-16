<!-- insrc:artifact LLD-56343cf2a9c3b509-s1 -->

# LLD: STORY-56343cf2a9c3b509-s1 — Build and sign Linux x86-64 daemon artifacts

## Summary

**Epic:** `ship-signed-linux-x86-64-daemon`
**HLD base run:** `wf-1794820231282-r7vnd2`
**HLD effective hash:** `0bb14a0963d8...`
**Tracker:** [insors-ai/insrc#187](https://github.com/insors-ai/insrc/issues/187)

This story packages the existing daemon and its native dependencies for Ubuntu 24.04 amd64. It defines the manifest and verification rules that allow qualification and release signing to authenticate the same bytes. Existing Darwin artifacts keep their formats.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. HLD context

> See **HLD-56343cf2a9c3b509** § 2. Framework summary

**Rollout phase:** A — Build and sign candidates
**Owns:** `sc1` (Linux artifact identity and trust), `sc3` (Target-bound release qualification)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: User-scoped bootstrap and stable dispatcher, host admission, immutable local releases, enrollment, locking, durable recovery, state-compatibility checks and daemon readiness. Local fixtures exercise source and signed predecessors. — owns `sc2`
- `s3`: Local exact-asset qualification harness and evidence attestation, publication and discovery wiring, cross-target checks, and source-mode ARM regression. S3 consumes S1 signing and S2 lifecycle contracts.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `stageRuntime`

```typescript
stageRuntime(source: string, stage: string, runtime: string, target?: 'linux-x64'): Promise<void>
```

**Parameters:**
- `source: string` — Clean pinned checkout containing built output and pruned runtime dependencies
- `stage: string` — New private staging path
- `runtime: string` — Exact verified Node binary
- `target: 'linux-x64'` _(optional)_ — Select Linux runtime inventory; omitted argument keeps the existing Darwin behavior

**Returns:** `Promise<void>` — Populated staging tree

**Errors:**
- `PackageError` when Wrong build target, missing executable or dependency, unsafe link, source mismatch, or ABI mismatch

**Preconditions:**
- Run Linux packaging on native amd64 Ubuntu 24.04 with the pinned Node archive and a clean checkout of the requested commit.

**Postconditions:**
- Package daemon, MCP and CLI entrypoints, Linux process broker and bundled watchdog, production dependencies, built workspace packages and licenses. Use target-specific entrypoint inventory. The existing Linux native build provides the broker, with no Darwin observer requirement. Check ELF class, ISA and dynamic dependencies for shipped runtime binaries and native modules. Resolve production dependencies from the lockfile and omit unused cross-platform native payloads.

### 2.2 `LinuxReleaseIdentity`

```typescript
type LinuxReleaseIdentity = Readonly<{ target: 'linux-x64'; channel: string; version: string; sequence: number; origin: CandidateOrigin; manifestSha256: string; archiveSha256: string; archiveBytes: number; runtimeFingerprint: string }>
```

**Parameters:**
- `manifestBytes: Uint8Array` — Exact bounded immutable payload used by qualification and final signing
- `signature: Uint8Array` — Detached Ed25519 grant for the independently selected role
- `expected: TrustedReleaseContext` — Externally pinned key role, repository, scope and selected channel

**Returns:** `LinuxReleaseIdentity` — Authenticated identity with computed manifest digest

**Errors:**
- `ReleaseTrustError` when Manifest, signature, key, role, target, channel or origin differs from the expected trust context

**Preconditions:**
- Verifier selects mode and trusted keys before parsing release claims. A qualification root can authorize only isolated testing.

**Postconditions:**
- Signature contexts are distinct per role and Linux target. The archive remains unexecuted. Retain exact manifest bytes and compute the digest outside the signed payload.

### 2.3 `QualificationEvidenceRef`

```typescript
type QualificationEvidenceRef = Readonly<{ subject: QualificationSubject; deviceProfileDigest: string; testEvidenceDigests: readonly string[]; predecessorEvidenceId?: string }>
```

**Parameters:**
- `subject: QualificationSubject` — Exact repository, ref, commit, run, attempt, artifact, target, channel and manifest and archive digests
- `evidence: Uint8Array` — Bounded independently authenticated qualification record
- `signature: Uint8Array` — Detached evidence-domain signature pinned by protected control

**Returns:** `QualificationEvidenceRef` — Validated identity and evidence hashes usable by guarded signing

**Errors:**
- `QualificationError` when Missing, failed, duplicate, unexpected or mismatched tests, evidence source, subject, host or applicable predecessor

**Preconditions:**
- Expected subject comes from trusted artifact retrieval and current protected release control. Trusted signing initiates from protected code with role-separated credentials.
- The exact manifest and its qualification-only grant come from trusted signing output. The final signer verifies that grant with the independently pinned qualification key and compares it with the qualification receipt and immutable archive before admitting the final signature.

**Postconditions:**
- A candidate or build token cannot approve its own evidence. Final signing repeats protected branch/ref authorization and checks exact bytes and all evidence requirements before signing the unchanged manifest.
- Under protected serialization, durably bind the release sequence to the exact manifest digest before the final signature is made available. An identical retry may reuse that binding. A lower sequence or a different digest at an already allocated sequence cannot be signed.

## 3. Data model changes

### 3.1 `Linux candidate build` — new

One exact checkout, run attempt and target produces one archive, one bounded build record and one uploaded artifact. The build record declares full ref, version, target, archive basename, digest and bytes, and staged runtime fingerprint. The upload result binds artifact ID to an exact job and attempt. The protected fetch verifies workflow ID, repository and head repository, event, successful run and attempt, ref, commit, target-qualified name, artifact ID, expiry and transport digest or protected archive digest. Reject duplicate or unexpected outer members before streaming only bounded named entries. Records supplied by the candidate never establish authorization.

```
Linux candidates use daemon-candidate-linux-x64-<lane>-<commit>-<attempt> and insrc-daemon-<version>-linux-x64.tar.gz. Versions and IDs are strictly bounded. Run and artifact IDs are canonical decimal strings. The build job receives no release keys or write token.
```

**Call sites:**
- `scripts/package-daemon-candidate.mjs`
- `scripts/package-daemon-development.mjs`
- `scripts/prepare-daemon-qualification.mjs`

### 3.2 `Linux manifest v1 and detached roles` — new

One candidate produces one strict versioned UTF-8 Linux manifest with one final lane, channel and sequence. It binds origin, target, candidate archive name, size, digest, runtime fingerprint and host contract. The host baseline carries Ubuntu 24.04 LTS amd64, glibc requirements, verified Node 22.22.1, runtime system library allowlist and pidfd requirement. Qualification and final grants sign the identical raw manifest with role-specific namespace and keys. Development enrollment binds an exact configured full branch ref and repo, using an unambiguous per-ref channel identity. Production lane uses the protected release ref. Mutable download locators supply candidates only. Protected signing maintains one durable sequence ledger per repository, target, final lane and channel scope. Qualification proposes the sequence and never allocates a final release slot. Final authorization commits the sequence binding with immutable compare-and-set semantics. Serializing within a runner is insufficient across jobs, reruns or ref changes.

```
Manifest max 32 KiB with strict UTF-8, strict fields, duplicate-key rejection and safe positive sequence. SHA-256 is canonical lower hex. Signature is exactly 64 bytes. Archive has bounded verified size and SHA-256. Raw bytes are immutable between qualification and final signing. Compatibility declarations identify the target state and eligible predecessor fingerprints. Only a proved pair can later upgrade.
```

**Call sites:**
- `scripts/daemon-bundle-metadata.mjs`
- `scripts/daemon-development-metadata.mjs`
- `scripts/stage-daemon-bundle.mjs`
- `scripts/sign-daemon-development.mjs`

### 3.3 `Target-bound qualification proof` — new

One candidate may have multiple qualification attempts. Promotion selects one independently attested complete run or evidence record that maps each required case to its positive result, host profile and evidence digest. Predecessor compatibility proof is a detached section of this record, outside the manifest. It binds candidate and predecessor identities and state contract so the digest of a final manifest never depends on evidence collected by installing that same manifest. The owner proves selected target, subject and predecessor by exact digests. S1 implements parsing and authorization with fixtures. S3 produces the real record. The attestation is an independently signed detached proof for the exact artifact. Production and development consume the same proof format under their respective policy and namespace. S2 reads the applicable proof from authenticated release inputs, independently of the mutable release locator.

```
QualificationSubject binds the raw manifest digest, archive digest, exact origin, target and channel. Evidence binds unique required case IDs and outcomes, ABI/host profile digest and optional required predecessor proof. The verifier chooses required case IDs from trusted policy.
```

**Call sites:**
- `scripts/promote-daemon-candidate.mjs`
- `scripts/qualify-daemon-development.mjs`
- `scripts/prepare-daemon-qualification.mjs`

## 4. Diagrams

- [Sequence diagram](docs/epics/ship-signed-linux-x86-64-daemon-E2026111656343cf2/S001/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Produce and validate one Linux archive and strict authenticated manifest with a pinned host baseline and separate signature roles. Reuse bounded byte verification and safe USTAR staging without relaxing Darwin gates. |
| `sc3` | implements | Validate protected origin and independently signed qualification evidence against exact immutable candidate and predecessor identities. Live test execution and publication are S3 responsibilities. |

## 6. Error paths

**Error cases**

- **Wrong platform or native ABI** (recoverable)
  - Detection: Read uname and ELF headers and compare native imports and versioned dependencies to the approved build baseline.
  - Response: Refuse before packaging or upload.
  - User impact: Builder must rebuild on the supported baseline.
- **Wrong ref, run attempt or substituted upload** (recoverable)
  - Detection: Compare exact protected run metadata and repository IDs, artifact identity and digest, expected member names, and all candidate fields.
  - Response: Refuse protected signing.
  - User impact: Operator supplies the precise candidate origin.
- **Untrusted signature or context** (recoverable)
  - Detection: Verify role-qualified namespace against independently pinned key, then parse strict payload and compare target, lane, branch and channel.
  - Response: Refuse grant without staging or executing bytes.
  - User impact: Operator selects the proper signed channel or restores trusted inputs.
- **Unsafe archive or archive mutation** (recoverable)
  - Detection: Verify name, size and digest from a private snapshot and apply bounded USTAR staging and runtime fingerprint checks.
  - Response: Reject archive and discard staging.
  - User impact: Operator retrieves the immutable approved asset.
- **Incomplete or incompatible qualification** (recoverable)
  - Detection: Compare signed receipt with required case set, per-case result and exact host, subject and predecessor requirements.
  - Response: Block final signing and preserve isolated candidate for inspection.
  - User impact: Release owner reruns the failed local cases.
- **Final signing sequence collision** (recoverable)
  - Detection: Compare the protected channel sequence head and existing binding while committing the requested allocation.
  - Response: Refuse changed or lower release identities. Permit an exact retry with the existing binding.
  - User impact: The release owner must qualify a new manifest if the sequence was already bound to another release.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Linux and Darwin candidates share a display version and commit | Separate workflow and target-qualified artifact identity matters across build, fetch and evidence. |
| Different allowed branch scopes resemble each other after filename encoding | Full refs remain distinct in channel identity and authorization. |
| Same raw manifest enters isolated qualification and final signing | Different signature grants authenticate identical bytes. Crossing trust modes is rejected. |
| First install has no predecessor | Fresh-install evidence is accepted only in that profile. An upgrade requires exact compatible predecessor evidence. |

**Invariants to preserve**

- Existing production and development Darwin v1 shape and signature allowlists remain unchanged. [[c1]]
- Safe staging accepts only a bounded archive and an exact digest supplied from verified metadata. The stage stays private and cannot escape its parent. [[c2]]

## 7. Test strategy

**Test framework:** `Node.js node:test via the repository's existing TypeScript test loader for scripts/__tests__. Run packaging and ABI smoke tests locally on Ubuntu 24.04 amd64. Use controlled fixture keys and protected-run fixtures without production credentials.`

**Test levels**

- **unit** — Validate metadata, trust envelopes, and archive limits
  - Subjects: `Strict manifest fields and branch/channel derivation`, `Detached grant namespaces`, `Unknown, duplicate and malformed inputs`
- **contract** — Validate build provenance and protected final authorization
  - Subjects: `Exact GitHub origin response fixtures`, `Wrong run attempt or asset target`, `Required evidence, role separation and separate Darwin coordinates`
- **smoke** — Demonstrate the locally built archive matches the minimum runtime baseline
  - Subjects: `Relocated native binary and addon loading`, `Signed manifest and verified staged fingerprint`, `Required daemon, CLI and MCP entrypoints`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Build from a clean Ubuntu 24.04 amd64 checkout, verify runtime provenance, unpack at a different root with the shared verifier, and load required native modules with the bundled Node.`, `Verify the Linux broker and shutdown watchdog are packaged and smoke their runtime entry points. Reject foreign ELF objects, excess ABI requirements and missing native dependencies.` |
| `ac2` | `Verify both allowed development refs with one configuration-only allowlist change and reject unconfigured or protected-role crossovers.`, `Prove identical manifest bytes across isolated and final grants. Reject alternate role or key, altered archive, malformed manifest, missing evidence, repeated test IDs, and foreign predecessor or host evidence.`, `Race final authorization from two runs for the same channel sequence. Verify only one distinct manifest can be signed and its exact retry remains valid after interruption.` |
| `ac3` | `Record Darwin and Linux builds with the same version and verify independent artifact lookup by target, workflow/run/attempt and ID.`, `Reject wrong-GitHub-attempt, wrong artifact ID, candidate from another repo, swapped target, and ambiguous archive ZIP members. Run existing Darwin metadata, candidate and staging regression tests.` |

## 8. Migration

**State before:** The analyzer located independent Darwin release and development manifests and consumers of shared bounded staging. Both legacy manifest readers enforce darwin-arm64. [[c1]] [[c2]]

**State after:** A Linux x86-64 candidate and signed manifest can be produced and independently qualified using the added target contract. Existing Darwin artifacts continue using their previous verification path, and Linux ARM retains source sync.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the Linux-only metadata and signer input contract alongside existing Darwin versions. — ↩ rollbackable
2. Add an isolated Linux x86-64 build and exact-origin verification entry point. Keep production artifact publication gated by S3. — ↩ rollbackable
3. Exercise the new target with local signed fixtures and retain existing Darwin regression coverage. — ↩ rollbackable

**Backward compat:** No existing asset format, tag, signature, Darwin workflow contract or Linux source entry point changes. The Linux candidate workflow can be disabled without changing existing installations.

## 9. Alternatives considered

### 9.1 a1: Dedicated Linux v1 manifest and role-separated signatures — **CHOSEN**

Use one Linux target format while retaining existing Darwin metadata and local staging.

Add a narrow Linux contract for the exact staged runtime and host baseline. Role-separated Ed25519 signatures authenticate the same manifest bytes for isolated qualification and final use, with origin, role and channel enforced out of band by the trusted verifier.

### 9.2 a2: Separate Linux formats for each channel

Define one Linux development schema and one Linux production schema.

Use target-specific manifests for both channels, with independent strict parsers and signatures. Keep the shared qualification subject explicit and attach a separate common evidence record to each format.

**Rejected because:** Separate payload formats duplicate the same validation and complicate exact-byte qualification.

## 10. References

- **[[c1]]** `analyze-bundle` `scripts/daemon-bundle-metadata.mjs`
- **[[c2]]** `analyze-bundle` `scripts/stage-daemon-bundle.mjs`
- **[[c3]]** `analyze-bundle` `scripts/daemon-development-metadata.mjs`
- **[[c4]]** `analyze-bundle` `scripts/package-daemon-candidate.mjs`
- **[[c5]]** `analyze-bundle` `scripts/package-daemon-development.mjs`
- **[[c6]]** `analyze-bundle` `scripts/verify-daemon-bundle.mjs`
- **[[c7]]** `analyze-bundle` `scripts/promote-daemon-candidate.mjs`
- **[[c8]]** `analyze-bundle` `scripts/prepare-daemon-qualification.mjs`
- **[[c9]]** `analyze-bundle` `scripts/sign-daemon-development.mjs`
- **[[c10]]** `analyze-bundle` `scripts/qualify-daemon-development.mjs`

## Citations

- **[[c1]]** `analyze-bundle` `scripts/daemon-bundle-metadata.mjs`
- **[[c2]]** `analyze-bundle` `scripts/stage-daemon-bundle.mjs`
- **[[c3]]** `analyze-bundle` `scripts/daemon-development-metadata.mjs`
- **[[c4]]** `analyze-bundle` `scripts/package-daemon-candidate.mjs`
- **[[c5]]** `analyze-bundle` `scripts/package-daemon-development.mjs`
- **[[c6]]** `analyze-bundle` `scripts/verify-daemon-bundle.mjs`
- **[[c7]]** `analyze-bundle` `scripts/promote-daemon-candidate.mjs`
- **[[c8]]** `analyze-bundle` `scripts/prepare-daemon-qualification.mjs`
- **[[c9]]** `analyze-bundle` `scripts/sign-daemon-development.mjs`
- **[[c10]]** `analyze-bundle` `scripts/qualify-daemon-development.mjs`
