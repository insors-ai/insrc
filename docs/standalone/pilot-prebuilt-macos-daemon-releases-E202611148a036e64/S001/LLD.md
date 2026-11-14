<!-- insrc:artifact LLD-8a036e6436ae82ab-s1 -->

# LLD: STORY-8a036e6436ae82ab-s1 — Pilot prebuilt macOS daemon releases

## Summary

**Epic:** `pilot-prebuilt-macos-daemon-releases`
**HLD base run:** `wf-1794639851378-gchapf`
**HLD effective hash:** `e47bf71ad6dd...`

An opt-in macOS arm64 path stages verified prebuilt bytes into the managed lifecycle. Existing source delivery remains the default. No pilot workflow runs tests on Actions. The generated HLD base run and effective hash are standalone workflow provenance, not an upstream HLD. A separately authenticated bootstrap covers clean installations; local qualification uses isolated candidate signing and the same install path as production.

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

### 2.1 `Build candidate`

```typescript
commit SHA + version → candidate run ID, artifact ID and archive digest
```

**Returns:** `result` — Success identifies the exact artifact; failure stops the operation.

**Errors:**
- `ReleaseGate` when Invalid, inconsistent or missing evidence or incompatible target.

**Preconditions:**
- Use trusted workflow on protected branch; resolve and verify exact full commit and allowed version.
- The build job has no signing or publishing credentials.

**Postconditions:**
- Package pinned Node 22, compiled entrypoints, required assets, production dependencies and native helper/supervisor binaries; record target and minimum macOS version.
- Upload exactly one archive and bounded build metadata; do not execute test suites.
- After build, a separate protected qualification-signing job verifies the exact run/artifact and archive digest, then signs the bounded candidate manifest using only the dedicated pre-release key and namespace. No Actions test commands run. The build job never accesses either signing key; qualification signing cannot publish or access the production key.

### 2.2 `Record local qualification`

```typescript
candidate identity + results → release qualification record
```

**Returns:** `result` — Success identifies the exact artifact; failure stops the operation.

**Errors:**
- `ReleaseGate` when Invalid, inconsistent or missing evidence or incompatible target.

**Preconditions:**
- Verify the run, artifact and SHA-256 before using the bundle on a dedicated test install.
- Run appropriate source tests against the same commit and exact candidate install, migration, restart and rollback checks.
- Use the independently authenticated pilot verifier in explicit qualification mode with the qualification public key and candidate signature. This mode accepts the same manifest bytes and uses the same parser, archive checks and lifecycle as production; only trust domain and state root differ. Require a disposable macOS account or VM with its own state root, LaunchAgent identity and sockets; a real checkout install and representative existing state are created within that account for migration. The qualification key is never trusted in production mode.

**Postconditions:**
- Record commit, version, platform, digest, run/artifact IDs, macOS version and pass evidence.
- Write UTF-8 qualification.v1.json in the dedicated release-control Git record: schemaVersion=1, candidate {repository,commit,version,target,runId,artifactId,archiveSha256,archiveBytes}, host {macOSVersion,arch,nodeVersion}, tests [{id,result,evidenceSha256}], and qualifiedAt. Include the evidence files in the same record; hash and verify each. Each required test ID appears once and is pass.

### 2.3 `Promote candidate`

```typescript
approved qualification record → signed manifest and GitHub prerelease
```

**Returns:** `result` — Success identifies the exact artifact; failure stops the operation.

**Errors:**
- `ReleaseGate` when Invalid, inconsistent or missing evidence or incompatible target.

**Preconditions:**
- Separate protected workflow; fetch exact artifact by run and artifact ID, recompute SHA-256 and verify it against approved qualification.
- Fail if required publish protection unavailable; no fallback to branch head, latest candidate or rebuild.
- Promotion accepts the exact full SHA of a release-control commit on a protected branch with mandatory designated-owner review and stale-review dismissal. It checks ancestry from protected ref, reads the record from that commit only, requires matching repository/workflow/run/head SHA and archive ID, recomputes all evidence and archive digests, and obtains release environment approval for this run covering the displayed input SHA and candidate SHA-256. If protections cannot be enforced, fail without signing or publishing.
- Compare the qualified manifest SHA-256 against the candidate manifest and verify the qualification signature. Sign the same manifest bytes under the production key and namespace; production promotion must not change release identity, sequence, compatibility, or archive bytes. Include manifest SHA-256 in the qualification record and release-control approval.

**Postconditions:**
- Sign canonical manifest and publish the exact qualified bytes as a prerelease. Fail closed on existing conflicting tag/version/assets.

### 2.4 `Stage prebuilt release`

```typescript
opt-in version + trusted manifest and archive → managed candidate
```

**Returns:** `result` — Success identifies the exact artifact; failure stops the operation.

**Errors:**
- `ReleaseGate` when Invalid, inconsistent or missing evidence or incompatible target.

**Preconditions:**
- Verify project signature with pinned public trust before parsing trusted claims; verify version, platform, compatibility and archive digest before extraction.
- Reject unsafe entries; stage in a private directory on same volume, with no writes to live state until existing lifecycle gates pass.
- Preflight bounded entry count, total unpacked bytes and individual sizes. Allow directories, regular files and only relative in-tree symbolic links to declared regular payload files, created after file extraction with no-follow parent walking. Reject absolute/traversal names or targets, duplicates, case-fold collisions, hard links, special files, setuid/setgid, and invalid ownership/modes; require a private user-owned same-volume stage with no pre-existing entries.
- Bootstrap trust: the pilot operator receives the bootstrap package checksum through a separately authenticated project announcement, pinned to a specific release of the bootstrap tools. Verify it using macOS shasum before executing any bootstrap code; downloading a checksum next to the untrusted package is insufficient. This package pins the production verification key and contains its own verifier/runtime. Production mode enforces the production namespace and key; qualification mode uses a separate test key, namespace, and disposable installation. Neither path executes code from the daemon archive before verifying signature, target, archive size and digest and staging it safely. No host Git, npm or compiler is needed for clean install. Fail closed if the trust pin is unavailable or mismatched.
- After bounded signature verification, strict v1 parsing rejects unknown fields, invalid channel/version and unsupported OS or CPU. Admission explicitly branches under the mutation lock: a genuinely fresh root has no activation selector, previous state, running daemon, or unfinished journal and uses fresh managed activation without a predecessor; ambiguous ownership fails closed. An existing install must use the upgrade path, identify its exact source or bundle predecessor, and require the signed, exact predecessor/candidate compatibility pair and crash-safe reopening before drain. A dirty or unresolved legacy checkout stays untouched. Fresh activation does not require a signed predecessor pair.
- Replay: application-owned, user-private durable state stores a separate floor for each trust domain and release channel, keyed independently of active selector, with highest sequence and accepted identity (signed manifest SHA-256 and archive SHA-256). No floor means first admission in that channel, after trust/target/compatibility and staged-byte verification. Before drain/cutover, under the existing installation mutation lock, durably write the accepted floor and prepared transaction before any live mutation; flush files and parent directories. Persist floor before exposing the journal as prepared so a crash between them can only require retrying the same or a newer manifest, never allow downgrade. Reject a lower sequence or an equal sequence with different identity; allow exact identity retry. Recovery may restore only the transaction's already pinned predecessor offline and must never lower the floor. Corrupt or unreadable floors fail closed; a missing floor is valid only when no prior prebuilt trust state for that channel was initialized.

**Postconditions:**
- Use managed pinning, activation, health checks and recovery while retaining the previous qualified installation for safe rollback.
- Persist a versioned release-proof record in the managed activation journal before drain. Source proof keeps the existing checkout identity and fingerprint. Bundle proof keeps release root, canonical runtime path, commit/release ID, trust domain, channel, manifest SHA-256, archive SHA-256, and measured relocated runtime fingerprint. Retain the exact signed manifest and detached signature in the private local release metadata store for the lifetime of the active installation and any pending rollback. Journal binds their identity and both prior/candidate pins with compatibility and launch profile. Legacy source-only journals decode under existing rules; unknown proof versions fail closed. Reverify signature, identities and runtime fingerprint from disk before switching or restoring an installation, without network or archive re-download, and dispatch source pin checks only for source roots. Recovery consults the admitted journal instead of running new release-floor admission.

## 3. Data model changes

### 3.1 `Candidate identity` — new

One Actions build produces one archive for a commit, version and target. Local qualification and the protected promotion job both consume the same run ID, artifact ID and SHA-256.


### 3.2 `Signed release manifest v1` — new

One release manifest declares archive name, exact size, SHA-256, commit, release version and sequence, channel, target/OS minimum, Node and compatibility metadata. Its detached project signature authenticates the manifest, which authenticates the one archive. Installed trust pins project keys; key recovery and rotation are explicit release operations.


### 3.3 `Local qualification record v1` — new

One protected release-control commit owns one release qualification record and evidence set, binding one candidate run, artifact ID, commit, version, target and archive digest. The promotion execution binds its separate approval to that immutable source revision and the same digest.


### 3.4 `Managed bundle release proof and channel floor` — new

One managed transaction owns one candidate pin and zero or one predecessor pin. A bundle pin references one retained signed manifest and the relocated runtime fingerprint. Older source-only records remain readable. A per-domain/channel floor persists independently of the transaction and selector; restoration uses only the transaction's pinned predecessor and never rewinds the floor.

**Call sites:**
- `src/daemon/managed-update-handoff.ts`
- `src/daemon/managed-update-recovery.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/pilot-prebuilt-macos-daemon-releases-E202611148a036e64/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Artifact was substituted, expired or lost** (recoverable)
  - Detection: Recompute digest and require the exact approved artifact ID and run ID.
  - Response: Stop; build a new candidate and qualify it locally.
  - User impact: No release is published.
- **Candidate cannot start after draining predecessor** (recoverable)
  - Detection: Managed identity and bounded readiness checks fail.
  - Response: Restore the pinned predecessor only when compatibility and current lifecycle safeguards permit; otherwise retain the journal and surface recovery instructions.
  - User impact: Controlled rollback or actionable stop.
- **Invalid manifest, unsupported target or corrupt archive** (recoverable)
  - Detection: Signature, schema, platform, sequence and digest checks precede extraction and activation.
  - Response: Fail closed before touching active installation.
  - User impact: Current installation remains usable.
- **Bootstrap hash or candidate/production signature domain mismatch** (recoverable)
  - Detection: Check bootstrap pin before execution and verify manifest against the selected namespace and key before parsing.
  - Response: Reject without daemon archive execution or changes to live state.
  - User impact: Operator needs a trusted bootstrap and matching signature.
- **Power loss between advancing floor and preparing journal** (recoverable)
  - Detection: The floor exists but no activation transaction is prepared.
  - Response: Keep current daemon and floor; resume only by staging the identical admitted manifest or a newer release.
  - User impact: Retry does not require a rebuild or downgrade.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two promotion attempts for one version | Serialize publication; identical already released bytes may be reported as already published, conflicting bytes fail. |
| Archive paths or links could leave the staging directory | Reject before writing outside the private staging boundary. |
| Migration from a dirty source checkout | Keep previous clone and existing state intact; refuse unsafe migration rather than overwriting it. |

## 6. Test strategy

**Test framework:** `Local Node test runner, shell integration checks and a documented Apple Silicon qualification run. GitHub workflows build and promote; no test jobs or test commands. Acceptance criteria: ac1 builds one unpublished macOS arm64 archive from the requested commit without hosted test suites; ac2 qualifies the exact archive locally through clean installation, clone migration preserving existing state, restart and compatible rollback; ac3 publishes the exact approved archive and rejects broken trust or compatibility before activation.`

**Test levels**

- **contract** — Verify fail-closed package trust and promotion
  - Subjects: `Local malicious-manifest, archive entry, and digest mismatch fixtures`, `Local workflow lint and protected-input/promotion tests`
- **live** — Qualify exact archive on a real Apple Silicon Mac
  - Subjects: `Fresh install, clone migration with state, supervisor restart, rollback after failed upgrade`, `Verify installed runtime needs no host Git, npm or compiler`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Local workflow lint, build metadata and no-hosted-test inspection` |
| `ac2` | `Local exact candidate lifecycle on a dedicated Mac profile`, `Use a clean Mac account without Git, npm, compiler or predecessor; reject tampered bootstrap before execution and qualify the isolated test signature with the same production parser`, `Migrate a disposable clone with representative state; interrupt at prepared, pre-selector switch, readiness, and rollback boundaries and verify offline restoration and unchanged floor` |
| `ac3` | `Reject unsigned/altered manifest, wrong signer/schema/OS/CPU, lower sequence and same sequence with changed digest`, `Reject changed archive/evidence, expired or wrong run/artifact ID, missing failed or unapproved qualification`, `Reject traversal, outward symlinks, symlink parent escape, hard links, special files and case-fold collisions`, `Reject absent/unmatched/incompatible predecessor pair before drain; verify bundle pin tampering blocks activation or recovery`, `Reject qualification signature in production mode, require identical candidate and published manifest bytes and archive, read legacy journals offline and reject unknown bundle proof versions`, `Power-loss floor/journal boundary; exact same-sequence retry succeeds, mismatched same-sequence or lower sequence fails even after restoring predecessor` |

## 7. Migration

**State before:** Existing source installs plus new opted-in hosts.

**State after:** Same daemon state and client endpoints; chosen pilot installs use a verified prebuilt release.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Authenticate bootstrap, verify and stage in isolation, then distinguish pristine fresh install from upgrade. For upgrade require a qualified predecessor and prove compatibility before preparing the journal. — ↩ rollbackable
2. Under the existing mutation lock, persist the channel floor and versioned release proofs before switching or draining. Retain and pin the source checkout when migrating. — ↩ rollbackable
3. Verify new generation via readiness and exercise restart on dedicated host; restore compatible predecessor if activation fails. — ↩ rollbackable

**Backward compat:** No state format or IPC change; supported predecessor pairs must be explicit and verified. Do not change ordinary source installs.

## 8. Alternatives considered

### 8.1 a1: Promote a qualified candidate archive — **CHOSEN**

Promote one immutable artifact by digest.

Build once in GitHub Actions, qualify the archive locally, sign the manifest and publish those exact bytes after approval.

### 8.2 a2: Bundle source and compile on install

Distribute a signed source snapshot.

Keep host compilation and replace the Git checkout with a versioned signed source archive.

**Rejected because:** Does not deliver prebuilt runtime.

## 9. References

- **[[c1]]** `code` `scripts/insrc-daemon-install.sh`
- **[[c2]]** `code` `scripts/prepare-source-release.mjs`
- **[[c3]]** `code` `src/bin/insrc-release-bootstrap.ts`
- **[[c4]]** `code` `src/daemon/managed-release-staging.ts`
- **[[c5]]** `code` `src/daemon/managed-update-preparation.ts`
- **[[c6]]** `code` `src/daemon/fresh-managed-activation.ts`
- **[[c7]]** `code` `src/daemon/managed-update-handoff.ts`
- **[[c8]]** `code` `src/daemon/managed-update-recovery.ts`
- **[[c9]]** `code` `src/daemon/__tests__/managed-release-staging.test.ts`
- **[[c10]]** `code` `.github/workflows/ci.yml`
- **[[c11]]** `stakeholder` `User request: run release qualification tests locally; use GitHub Actions for building, signing and publication.`
