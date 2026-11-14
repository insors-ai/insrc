<!-- insrc:artifact LLD-234b9967599e56d9-s1 -->

# LLD: STORY-234b9967599e56d9-s1 — Install signed daemon development bundles from configured branches

## Summary

**Epic:** `install-signed-v2-daemon-development-bundles`
**HLD base run:** `wf-1794675127236-yn078m`
**HLD effective hash:** `766c01ae27f8...`

Build and install signed development bundles from configured branch refs on Apple Silicon. The local path works before a production release or GitHub Actions dispatch is available.

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

**Surface level:** public

### 2.1 `Build development bundle`

```typescript
configured development branch ref + exact commit + version + sequence → archive and signed development manifest
```

**Returns:** `result` — Verified development bundle or a refusal

**Errors:**
- `DevelopmentBundleRefused` when Origin, trust, target, isolation or compatibility check failed

**Preconditions:**
- Take an explicit operator-selected full refs/heads/<name> from the approved development branch list. Verify the selected ref with git check-ref-format and reject tags, pull request refs, unlisted refs and the release ref. Use the pinned build runtime and run relevant checks locally.
- Use a project-owned distinct development key offline or on an approved build host, separate from the release and qualification keys. No GitHub Release or workflow dispatch is needed.
- Pin the canonical upstream and approved development refs in project-controlled policy. Fetch the selected exact ref into a fresh bare Git directory, record the fetched tip, and require the full build OID to be reachable from it. Build in a clean detached worktree at that OID.
- Use the development candidate identity (major.minor.patch-dev.N, lowercase 40-hex commit, darwin-arm64, macOS 15.0 minimum, official Node 22.22.1) and share the production packager's runtime staging primitive. The production pilot version grammar remains unchanged.
- Allocate sequences from one durable release-operator ledger per upstream and development channel. Serialize allocation; bind a sequence to one manifest digest. The offline signer accepts records only from the authorized builder via an authenticated handoff binding source ref, tip, commit and archive digest. Compare those records with independently measured archive and extracted runtime identity prior to signing.

**Postconditions:**
- Record the selected full ref, fetched tip, commit, development version, sequence, archive size and hash, measured runtime fingerprint and any exact qualified predecessor in the signed manifest. Distribute the signed bundle and independently authenticated bootstrap through an internal channel.
- The packaging entrypoint verifies the fresh fetch and checkout itself; the signing entrypoint consumes that verified record and measures the archive and runtime inventory. It refuses Actions metadata as a substitute for verified local provenance.
- Hosted development builds are a later rollout. A reviewed workflow on the protected control ref admits a requested full branch ref and resolves its exact SHA using policy on that same protected ref. It records the repository ID, workflow identity and revision, run ID and attempt, admitted ref and SHA, and a per-attempt artifact slot before allocating a build runner. The build checks out only that SHA with read-only repository access and no deployment secrets. It may upload an unsigned output to the run, but its outputs, names, and metadata are untrusted. Branch-local runs cannot enter official admission. Until this hosted workflow is deployed, use the independently available local signed path. Protected main production release policy stays in force.
- For upgrades, qualify an exact prior/candidate pair using signed writable-format declarations, a local stateful fixture, forced interruption after candidate writes and proof the exact prior can reopen and serve the same fixture. Bind that evidence digest and the managed launch profile to both measured releases before signing. Refuse incompatible writable formats.
- Use a separate publication job on a fresh runner, defined by the protected control workflow. It must never check out or execute candidate code, run candidate actions, restore candidate caches, or extract the candidate payload. Load the admission record from the trusted admission job and query authoritative run and artifact metadata. Require the expected repository, workflow identity and control revision, exact run and attempt, successful build job, and exactly one non-expired artifact in the reserved slot for that attempt. Refuse missing or ambiguous artifacts and metadata mismatches. Resolve the immutable artifact ID, stream and hash the exact bytes with bounded size, and compare the service digest where available. Publish a control-plane receipt binding the admission record, artifact ID, size and measured digest using a publication identity available only to this job. The receipt attests admission and observed bytes. The payload remains unsigned and cannot be used as authorization by the local signer or installer. Consumers verify the receipt's protected workflow provenance and compare the artifact ID and digest before accepting it as official.

### 2.2 `Install or update development bundle`

```typescript
authenticated dev bootstrap + signed development manifest + archive → managed dev daemon
```

**Returns:** `result` — Verified development bundle or a refusal

**Errors:**
- `DevelopmentBundleRefused` when Origin, trust, target, isolation or compatibility check failed

**Preconditions:**
- Phase one supports a dedicated Apple Silicon macOS VM only, with no source, production or qualification insrc installation in the guest. A separate user on a shared host is unsupported because runtime and controller logs use guest-wide temporary paths.
- Pin the dev public key through the trusted bootstrap. Reject cross-domain signatures, wrong origin/target, digest mismatch and replay before executing any bundle code. Restore only exact transaction predecessor, offline, from same domain.
- Add a separate install-daemon-development-bundle.mjs entrypoint packaged with its own verifier and one development public key. Bootstrap authenticity is established by comparing its SHA-256 with a fingerprint distributed independently through the project's trusted internal channel.
- Use the dedicated account's OS-resolved home and effective UID. Allow no path overrides. Use the account's ~/.insrc state and socket, its per-user LaunchAgent, and ~/.insrc-daemon-development-releases. Inspect root ownership, permissions and canonical paths, selectors, trust anchors, journal and launchd state without mutation. Reject source, qualification, production and unrelated state. Classify as pristine for a new install, authenticated installed development state for an update, or an outstanding authenticated development transaction for recovery.
- The independently authenticated development bootstrap binds the upstream repository, authorized development refs, and development public key. Check the incoming manifest against that policy. Transition from v2 to v3 by publishing updated authenticated policy and bootstrap. A policy change controls new admissions and does not revoke the exact transaction-pinned predecessor for offline recovery.
- Before extracting or running the payload, require Darwin arm64, macOS 15.0 or newer, and the authenticated bootstrap Node runtime at 22.22.1. Check the signed candidate Node version, archive identity and size; fingerprint the extracted runtime from the verified snapshot before invoking it.
- Use cleared Node loader overrides (NODE_OPTIONS and NODE_PATH), a controlled PATH, and the OS account home consistently in the bootstrap, controller and launchd job. Preserve the incumbent's running or stopped intent on upgrade.
- For recovery of a first install with no installed receipt, require the retained development public trust anchor in the private state root, matching the authenticated bootstrap, the exact active start reservation in the owned journal, a valid signed candidate proof matching that reservation, and matching account, canonical roots, archive and runtime pins, admitted floor and any recorded selector or job effects. A missing selector or job is valid only when consistent with the recorded transaction phase. Reject any unaccounted state or conflicting owner before mutation. Recovery claims an orphaned reservation under the lifecycle gate and does not stage or admit the incoming bundle. For an interrupted upgrade also verify the authenticated installed predecessor receipt.
- Consult the current approved branch list for new admission only. Recovery takes precedence over new admission and can run offline with the existing trusted bootstrap and retained public anchor. The owned journal binds the in-flight signed proof to the guest and transaction. Compare the journal with the actual staged runtime and registered service before running recovery.

**Postconditions:**
- Fresh install takes no predecessor. Upgrade accepts only a signed compatible dev predecessor pinned to the installed manifest; preserve state and verify readiness or restore it. Scope existing CLI/MCP registration to the dev environment.
- Main release and qualification reject development provenance and signatures at all gates; no production key on development hosts.
- The authenticated bootstrap verifies canonical bytes, development signature, pinned key, origin, ref, target and the sealed archive snapshot, then checks prior proof and the signed compatibility pair before invoking the staged controller. Reverify the proof in activate-development-bundle before first managed registration or update. Use the lifecycle gate to compare the sequence and admit the transaction atomically before stop, selector or service changes. After verified predecessor exit and before candidate daemon startup, inspect quiesced stores using the qualified writable-format pair.
- Implementation boundaries: extend local candidate packaging for Git provenance and reuse archive staging and the managed lifecycle under the dedicated account. Production and qualification entrypoints, verifier policies and signing gates remain separate.
- The installation and sequence floor are keyed by trust domain, upstream repository, and development channel. They are shared across approved refs. A branch switch requires a higher sequence and the same exact verified predecessor and compatibility qualification as a same-branch update. The source ref is provenance, not a separate installation identity.
- Use the existing admitted-floor rule. Atomically persist candidate proof, owner/transaction and admitted floor in reservation. New sequence must exceed the floor; an equal sequence may retry only the identical manifest and archive with no conflicting transaction. An identical bundle already installed returns success without service mutation. Qualification and isolation refusals before reservation leave the floor unchanged.
- Candidate readiness (or verified idle state for a stopped predecessor) commits the installed receipt and releases the reservation. The admission floor survives rollback. Recovery uses the exact signed transaction pins even below the floor, never re-admits the predecessor. A crash before reservation leaves staging only; recover pre-commit boot with its exact journal pins, and after a durable committed outcome reconcile the candidate receipt and release the reservation idempotently.
- Fresh activation uses prior absence as the rollback target. On a confirmed failure, stop/remove only the transaction's verified process, job and selector. If candidate startup wrote to a previously pristine state root, retain the transaction and require operator recovery in the dedicated VM unless candidate-owned writes can be verified and reconciled. Do not declare the root pristine while writes remain.

## 3. Data model changes

### 3.1 `Development bundle identity` — new

Development manifest v1 uses strict signed fields schemaVersion:1, channel:development, canonical repository URL, approved full sourceRef, fetchedTip and commit (40 lowercase hex), target:darwin-arm64, minimumMacOS:15.0, nodeVersion:22.22.1, version (major.minor.patch-dev.N), sequence (positive safe integer), archiveName (derived from version and target), archiveBytes, archiveSha256, runtimeFingerprint (existing archive runtime measurement), keyId (SHA-256 of DER Ed25519 SPKI), compatibility {graphSchema, formats {lance,repoAndIndexQueue,config,workflowAndSession}}, and predecessor (null for fresh install, otherwise {manifestSha256,commit,sequence,runtimeFingerprint,compatibility,crashConsistentReopening:true,launchProfiles:[managed],qualificationEvidenceSha256}). Sign bounded RFC 8785 canonical UTF-8 JSON bytes with Ed25519 under insrc-daemon-bundle-development-v1 followed by a zero byte. The archive proof supplies the flat size/hash fields to existing staging without re-encoding signed bytes. Add an explicit development proof variant to the controller, managed verifier and journal readers, with a floor identified by development domain, channel and repository. Carry signed manifest and signature bytes, digest, archive digest and runtime fingerprint in the proof. Bind the receipt to canonical account/state/release paths; store the pinned development trust anchor in the guest's private trust root. Validate the same signature and digest at admission, start and orphan recovery. Only the new entrypoint may admit development. Recovery revalidates the pinned proof using the retained key and repository, even if its branch is no longer on the list for new admissions. Keep production and qualification schemas, entrypoints and accepted namespaces unchanged.

**Call sites:**
- `scripts/install-daemon-bundle.mjs`
- `scripts/package-daemon-bootstrap.mjs`
- `scripts/daemon-bundle-metadata.mjs`
- `scripts/verify-daemon-bundle.mjs`
- `src/bin/insrc-daemon-control.ts`
- `.github/workflows/daemon-candidate.yml`
- `scripts/package-daemon-candidate.mjs`
- `src/daemon/managed-bundle-proof.ts`
- `src/shared/installation-mutation-gate.ts`
- `src/daemon/managed-update-preparation.ts`
- `src/daemon/release-compatibility.ts`
- `src/daemon/fresh-managed-activation.ts`
- `src/shared/paths.ts`
- `scripts/daemon-ctl.sh`

## 4. Diagrams

- [Sequence diagram](sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Bootstrap authenticity failure or wrong signer/domain** (recoverable)
  - Detection: Bootstrap digest or detached signature verification
  - Response: Abort before running payload or changing installed state.
  - User impact: Obtain the authorized bootstrap and matching signed bundle.
- **Wrong origin, target, digest, predecessor or replay** (recoverable)
  - Detection: Validate pinned origin, target, exact archive and predecessor identity, and the admitted sequence floor.
  - Response: Abort before activation. If verification fails before reservation, preserve the incumbent and admission floor.
  - User impact: Retry with a matching verified bundle.
- **Existing source, production or qualification state** (recoverable)
  - Detection: Check roots, selectors, trust, journal and LaunchAgent identity
  - Response: Abort before writes or service mutation.
  - User impact: Use a dedicated development account or VM.
- **Interrupted activation or failed readiness** (recoverable)
  - Detection: Read durable journal and validate exact predecessor receipt and bytes
  - Response: Reconcile offline from the exact transaction pins. A verified rollback restores the incumbent and retains the admitted floor. On first install, restore prior absence only when transaction-owned effects can be reconciled. Retain the journal for ambiguous effects or missing proof.
  - User impact: Retry recovery with the original verified bytes.
- **Selected branch is unlisted or is the configured release ref** (recoverable)
  - Detection: Validate the actual dispatch or fetched ref against the project's approved development policy. On install validate the signed source ref against authenticated bootstrap policy.
  - Response: Reject the development operation before packaging, signing or installation mutation.
  - User impact: Select an approved development branch or obtain the updated authenticated policy.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Existing qualification or production state in same home | Fail closed before state or LaunchAgent mutation. |
| Offline rollback after interrupted dev update | Restore the exact pinned predecessor while keeping the newer admitted floor. |
| Same sequence and different manifest or archive | Reject under the lifecycle gate, including after rollback. |
| Interrupted first install with no installed receipt | Authenticate the exact pinned development transaction and reconcile only its verified effects. Preserve the admitted floor. A conflicting or unauthenticated journal leaves state untouched. |
| Branch-produced output includes a fabricated receipt or artifact identity | The protected publication job ignores candidate claims. Only the receipt issued from its trusted admission and independently verified artifact metadata and bytes is eligible. |

**Invariants to preserve**

- Development refs cannot reach production or qualification signing. [[c9]]
- A branch switch cannot reset the sequence floor or bypass the installed predecessor. [[c10]]

## 6. Test strategy

**Test framework:** `All tests local on Apple Silicon or fixtures; no hosted tests.`

**Test levels**

- **contract** — Prove development/production separation locally
  - Subjects: `Build provenance and exact archive/runtime verification`, `Dev signature accepted only in dev; release signature accepted only in correct lane`, `Existing non-dev state untouched`
- **live** — Verify actual bundle in disposable Apple Silicon environment
  - Subjects: `Fresh install, MCP/CLI connection, restart, newer dev update and forced rollback offline`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Build and sign from exact fetched development ref in clean detached tree with no main dependency`, `Reject wrong upstream, fork-only or unreachable commit, dirty or mismatched checkout, and substituted inventory. Verify detached signature and provenance without Actions environment.`, `Configure v2, v3 and feature/dev as examples. Verify coverage of an allowed branch that never appears in code, unlisted branch, tag, PR ref, mismatch between dispatch ref and checkout, and the release ref.`, `For hosted rollout, reject direct branch-local dispatch as official provenance and verify that the trusted admission stage rejects an unlisted ref before runner allocation; check the admitted SHA remains fixed if the branch moves.`, `Hosted rollout fixtures verify separate execution environments and no candidate execution by the publisher. Reject an artifact from a different attempt, wrong repository or workflow, missing/duplicate/expired slot, substituted bytes, and a forged branch-produced receipt. Verify the protected publisher binds the expected artifact ID and independently measured digest to the original admission.` |
| `ac2` | `Refuse wrong key, domain, bootstrap digest, origin, target, archive digest and stale sequence before executing bundle code. Capture hashes and launch state to prove protected state is untouched.`, `On Apple Silicon confirm fresh install, MCP/CLI readiness, restart, a compatible state-preserving update and an advanced sequence floor.`, `Force readiness failure and interrupt an update. Recover offline with the exact signed predecessor and retained candidate admission floor. Reject substituted rollback bytes and test fail-closed recovery.`, `Install on one approved ref, switch to another and confirm the exact predecessor and higher sequence are mandatory. Rotate the authorized ref list and verify offline restoration using the exact prior transaction proof.`, `Exercise development proof through activation, restart and recovery, reject production and qualification proof on the dev entrypoint and vice versa, reject OS/runtime mismatches, malformed or incompatible qualification, and shared-host deployment assumptions. Test simultaneous reservations, crash before reserve and after reserve/readiness/commit, identical retry, conflicting equal-sequence bytes, first-install prior absence and ambiguous cleanup, and stopped-daemon upgrade intent.`, `Interrupt first install before selector publication, after launchd registration and after candidate readiness but before receipt publication. Resume from authentic journal pins without an installed receipt. Reject changed proof, mismatched floor, foreign job or live owner and verify state is unchanged.` |

## 7. Migration

**State before:** The build workflow and candidate packager hardcode v2 for unsigned development artifacts. The source installer already accepts a branch option.

**State after:** Opt-in signed development bundles install and upgrade in a dedicated environment.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Seed the project-controlled approved branch list with the team's current development ref. Change branches through policy configuration. — ↩ rollbackable
2. Distribute the authenticated bootstrap and provision the dedicated Apple Silicon VM. Install from any configured development ref. — ↩ rollbackable
3. Qualify consecutive dev bundles and test offline rollback before internal use. Existing source installs may continue independently. — ↩ rollbackable
4. After deploying the trusted hosted admission workflow, enable official unsigned hosted candidates from configured refs. The local signed path is available independently. — ↩ rollbackable

**Backward compat:** No production state migration or changes to the default source installer. Migration of an existing source install into the dev bundle lane is deferred.

## 8. Alternatives considered

### 8.1 a1: Independent development bundle — **CHOSEN**

Build and sign an approved development ref locally.

Use an exact approved development ref and commit on Apple Silicon to build locally. Distribute and install under a separate development trust domain.

### 8.2 a2: Source install

Clone an operator-selected branch and compile on each Mac.

Keep --branch <name> as a source workflow with per-host package installation and compilation.

**Rejected because:** Does not deploy a prebuilt candidate.

## 9. References

- **[[c1]]** `code` `scripts/install-daemon-bundle.mjs`
- **[[c2]]** `code` `scripts/package-daemon-bootstrap.mjs`
- **[[c3]]** `code` `scripts/daemon-bundle-metadata.mjs`
- **[[c4]]** `code` `scripts/stage-daemon-bundle.mjs`
- **[[c5]]** `code` `scripts/package-daemon-candidate.mjs`
- **[[c6]]** `code` `scripts/insrc-daemon-install.sh`
- **[[c7]]** `code` `scripts/verify-daemon-bundle.mjs`
- **[[c8]]** `code` `src/bin/insrc-daemon-control.ts`
- **[[c9]]** `code` `.github/workflows/daemon-candidate.yml`
- **[[c10]]** `code` `src/shared/daemon-bundle-release-floor.ts`
- **[[c11]]** `code` `src/daemon/managed-bundle-proof.ts`
- **[[c12]]** `code` `src/shared/installation-mutation-gate.ts`
- **[[c13]]** `code` `src/daemon/managed-update-preparation.ts`
- **[[c14]]** `code` `src/daemon/release-compatibility.ts`
- **[[c15]]** `code` `src/daemon/fresh-managed-activation.ts`
- **[[c16]]** `code` `src/shared/paths.ts`
- **[[c17]]** `code` `scripts/daemon-ctl.sh`
