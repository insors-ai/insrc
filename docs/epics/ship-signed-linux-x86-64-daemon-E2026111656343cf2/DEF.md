<!-- insrc:artifact DEF-56343cf2a9c3b509 -->

# Epic: ship-signed-linux-x86-64-daemon

## Summary

**Flavor:** enhancement
**Tracker:** [insors-ai/insrc#186](https://github.com/insors-ai/insrc/issues/186)

Add signed daemon builds for Linux x86-64 on the existing development and release channels. Linux x86-64 users can verify, install, update, and restart the exact artifact approved for their channel. Linux ARM continues to use source sync.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

Linux x86-64 daemon users currently install and update by fetching source and compiling it locally. They cannot install a prebuilt daemon with authenticated provenance or use such an artifact to update while retaining their existing state. Existing signed bundle releases target macOS. [[c1]] [[c2]] [[c3]]

## 2. Functional requirements

- **E2026111656343cf2:FR001** — A Linux x86-64 daemon artifact identifies its exact source revision, target, version, trust domain, payload digest, and runtime requirements.
- **E2026111656343cf2:FR002** — The trusted install and update routes authenticate the exact artifact before launching it and preserve the incumbent when acceptance fails.
- **E2026111656343cf2:FR003** — The source-sync developer path continues to work on Linux ARM, with the existing development and production branch policies retained.

**s1:**

- **E2026111656343cf2:S001:FR001** — Build jobs emit a Linux x86-64 archive whose bundled native components match the target.
- **E2026111656343cf2:S001:FR002** — Release signing binds the exact source revision, artifact bytes and target to the selected development or production trust domain.
- **E2026111656343cf2:S001:FR003** — Candidates carry the documented Ubuntu 24.04 amd64 runtime baseline and an independently retrievable target identity.

**s2:**

- **E2026111656343cf2:S002:FR001** — A signed installation provides the usual daemon and MCP entry points on a supported Linux x86-64 host.
- **E2026111656343cf2:S002:FR002** — Updates keep the current installation recoverable until the verified candidate is ready and compatible.
- **E2026111656343cf2:S002:FR003** — A clean host can establish trust independently, and an enrolled host rejects replays even after recovering an already admitted predecessor.
- **E2026111656343cf2:S002:FR004** — Signed lifecycle and update commands retain the verified delivery mode and recover both runtime and durable state after interrupted or failed cutover.

**s3:**

- **E2026111656343cf2:S003:FR001** — The release owner can bind local x86-64 qualification results to the candidate bytes before authorizing promotion.
- **E2026111656343cf2:S003:FR002** — The existing Linux ARM developer source workflow stays available.
- **E2026111656343cf2:S003:FR003** — Qualification and publication bind evidence to exact target-specific bytes, and both platforms remain independently discoverable.

## 3. Non-goals

- **Signed Linux ARM builds in this rollout** — Linux ARM stays on the existing source-sync path at the user's direction. [[c1]]
- **Changes to the existing macOS release formats, activation contract, or default release branch policy** — The requested new target is Linux x86-64. Existing release lanes may share reusable signing tools and tests. [[c2]] [[c3]]

## 4. Assumptions

- `high` Linux x86 denotes 64-bit amd64. [[c1]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | Linux x86-64 only for new signed artifacts. Preserve Linux ARM source checkout and code sync. | [[c1]] |
| `k2` | contract | Development signing uses configured allowed refs and a distinct trust domain. Production promotion retains protected release-branch and independent qualification controls. | [[c2]] |
| `k3` | stakeholder | Qualify exact artifact bytes locally. Hosted workflows may build, sign and promote under existing release policy. | [[c4]] |
| `k4` | invariant | Linux lifecycle must retain existing process identity and safe shutdown guarantees, including protection from PID reuse. | [[c5]] |
| `k5` | contract | Initial support is Ubuntu 24.04 LTS amd64 with its stock glibc and kernel, working pidfd operations, and documented system libraries. Pin and verify the bundled Node 22.22.1 runtime for the initial build [[c14]]. Build native components for that baseline and qualify on a clean host at the baseline without host Node, Git, npm, or a compiler. Record distro, kernel architecture, user-space architecture, glibc, native dependencies, and virtualization mode. Validate lifecycle and native shutdown on an x86-64 Linux kernel with an isolated local state directory. Translated amd64 user-space evidence is admissible for the behaviors it exercises. | [[c13]] |
| `k6` | contract | Authenticate the first-install bootstrap independently of the downloaded candidate. Use pinned, separate development, qualification, and production trust. A development scope binds the configured ref so a release or another ref cannot satisfy it. Keep a durable accepted release floor per trust domain and channel, including the signed manifest and archive identity. Reject lower sequences, changed identity at the same sequence, and unreadable or missing previously initialized floors. Allow exact retry after interruption and offline recovery only to the pinned predecessor without lowering the floor. | [[c2]] |
| `k7` | invariant | Before cutover, require evidence that the exact predecessor can reopen the durable state after a failed candidate startup, including after the first durable write, or that the pre-update state can be restored safely. Reject an unqualified pair before disruption. Serialize competing mutations and recover the pinned runtime, compatible durable state, and running or stopped intent after interruption. | [[c8]] |
| `k8` | contract | Route daemon start, stop, restart, status, and update through the installed delivery mode in both the shell control and TUI wherever exposed. For signed installs, missing or corrupt required release state must fail closed. Git source actions must remain usable for Linux ARM and cannot silently switch signed installs to source. | [[c9]] |
| `k9` | contract | Bind target, channel, version, exact source, build run and attempt, artifact ID, and signed manifest and archive digests through candidate lookup, local evidence, and promotion. Keep publication and discovery collision-free across macOS and Linux for the same version. A qualification credential can authorize isolated testing only. Publication uses the same qualified manifest and archive bytes under the channel signature. | [[c12]] |

## 6. Stories

### 6.1 STORY-56343cf2a9c3b509-s1 — Build and sign Linux x86-64 daemon artifacts

**User value:** `size: M`

Release engineers can produce a verifiable artifact from an identified source revision for an authorized release channel.

**Extends:** [[c6]] [[c7]] [[c11]]

**Acceptance criteria:**

- **ac1:** Given An exact approved source revision for the Linux x86-64 target, when a candidate build completes, then the archive contains the runtime and required Linux x86-64 native components and carries provenance and artifact digests matching that revision, and all shipped executables and required native modules run on the declared Ubuntu 24.04 amd64 baseline with the bundled Node and declared system libraries. _(operationalizes `k1`, `k5`)_
- **ac2:** Given Candidates from a configured development ref and the protected production release ref with controlled signing fixtures, when the signing contracts are exercised independently of live promotion, then qualification access cannot publish or authorize an ordinary install, and the intended channel can sign only the exact verified manifest bound to the archive digest. An additional configured development ref works without a code change, and unconfigured refs and wrong trust domains are refused. _(operationalizes `k2`, `k3`, `k6`, `k9`)_
- **ac3:** Given Linux and macOS candidates share a version, when the packaging jobs record candidate identity, then the Linux artifact can be retrieved by exact target, run, attempt and artifact ID independently from the macOS artifact. _(operationalizes `k9`)_

### 6.2 STORY-56343cf2a9c3b509-s2 — Install and update the signed Linux x86-64 daemon

**User value:** `size: L`

Operators can install the verified daemon and migrate a supported existing x86-64 daemon with persistent state and recovery.

**Depends on:** `s1`

**Extends:** [[c5]] [[c2]] [[c8]] [[c9]] [[c10]]

**Acceptance criteria:**

- **ac1:** Given A clean Ubuntu 24.04 amd64 host with the documented system dependencies and no host Node, Git, npm, or compiler, when the operator verifies the independently authenticated bootstrap and installs and starts the artifact, then daemon status and MCP identify the exact signed revision and the bootstrap rejects missing trust pins or substituted bootstrap bytes before executing candidate code. _(operationalizes `k1`, `k4`, `k5`, `k6`)_
- **ac2:** Given A supported existing x86-64 source or signed installation with representative durable state, when the operator updates to a qualified successor, then state remains readable after activation and restart. Failure immediately after the candidate first mutates durable state restores the exact predecessor and its prior running or stopped intent. A pair with no safe state-reopen or state-restoration path is rejected before stopping the incumbent. _(operationalizes `k4`, `k7`)_
- **ac3:** Given An unsupported host, bad signature, tampered archive, wrong target or channel, or stale release, when the operator requests install or update, then the request is rejected before any candidate code runs or the incumbent is disturbed. Host checks cover glibc, required native libraries, and working pidfd support. _(operationalizes `k1`, `k2`, `k4`, `k5`, `k6`)_
- **ac4:** Given A signed installation reached through the shell or TUI, when the operator uses the exposed lifecycle or update controls, including with a damaged or missing required release record, then normal controls use the verified artifact. A signed enrollment remains identifiable if a required selector or release record goes missing, so corrupt or missing required state blocks mutation. Concurrent update or restart cannot bypass the admitted transaction. _(operationalizes `k4`, `k7`, `k8`)_
- **ac5:** Given A candidate was admitted and activation was interrupted before or after the runtime switch, when the operator retries or recovers with the network unavailable, then the exact admitted candidate can be retried from verified local bytes, or the recorded predecessor can be restored offline. Recovery retains the release floor and a later admission rejects a lower sequence, changed identity at the same sequence, or a missing or unreadable previously initialized floor. _(operationalizes `k6`, `k7`)_

### 6.3 STORY-56343cf2a9c3b509-s3 — Qualify and publish the Linux x86-64 release channel

**User value:** `size: M`

Release operators can prove an artifact works locally and promote its exact verified bytes under the established branch policies.

**Depends on:** `s1`, `s2`

**Extends:** [[c12]]

**Acceptance criteria:**

- **ac1:** Given A qualification-signed candidate and a disposable local host at the Ubuntu 24.04 amd64 baseline, when the release owner qualifies clean install, source migration, signed update, interrupted or failed cutover after a durable write, restart, retained state and MCP, then evidence records the exact manifest and archive digests, target, build origin, and host profile. A local lifecycle run on an x86-64 Linux kernel proves pidfd handling and native shutdown, and missing, failed or mismatched evidence prevents publication. _(operationalizes `k2`, `k3`, `k4`, `k5`, `k7`, `k9`)_
- **ac2:** Given A Linux ARM source checkout on a configured development branch, when the developer uses shell and TUI source update and restart, then the daemon builds and serves the selected Git revision and both controls work without any signed bundle or signing trust configuration. _(operationalizes `k1`, `k3`, `k8`)_
- **ac3:** Given Linux and macOS releases share a version, when the release owner tries each target’s qualified evidence against both publication paths and publishes both correctly qualified artifacts, then Linux evidence cannot authorize macOS or vice versa, each published archive and manifest is byte-identical to its qualified candidate, both targets remain independently discoverable, and publishing Linux leaves the existing macOS tag and assets intact. _(operationalizes `k2`, `k3`, `k9`)_

## 7. References

- **[[c1]]** `stakeholder` `Implement signed build for Linux x86. ARM continues with code sync.`
- **[[c2]]** `doc` `docs/standalone/pilot-prebuilt-macos-daemon-releases-E202611148a036e64/S001/LLD.md`
- **[[c3]]** `doc` `docs/standalone/install-signed-v2-daemon-development-bundles-E20261114234b9967/S001/LLD.md`
- **[[c4]]** `stakeholder` `Run release tests locally. CI can build and sign artifacts.`
- **[[c5]]** `code` `src/shared/daemon-process-client.ts`
- **[[c6]]** `analyze-bundle` `scripts/daemon-bundle-metadata.mjs`
- **[[c7]]** `analyze-bundle` `scripts/daemon-development-metadata.mjs`
- **[[c8]]** `code` `src/db/graph/store.ts`
- **[[c9]]** `code` `scripts/daemon-ctl.sh`
- **[[c10]]** `code` `src/cli/services/maintenance.ts`
- **[[c11]]** `code` `scripts/package-daemon-candidate.mjs`
- **[[c12]]** `code` `.github/workflows/daemon-promotion.yml`
- **[[c13]]** `doc` `https://releases.ubuntu.com/24.04/`
- **[[c14]]** `doc` `https://nodejs.org/en/blog/release/v22.22.1`

## Citations

- **[[c1]]** `stakeholder` `Implement signed build for Linux x86. ARM continues with code sync.`
- **[[c2]]** `doc` `docs/standalone/pilot-prebuilt-macos-daemon-releases-E202611148a036e64/S001/LLD.md`
- **[[c3]]** `doc` `docs/standalone/install-signed-v2-daemon-development-bundles-E20261114234b9967/S001/LLD.md`
- **[[c4]]** `stakeholder` `Run release tests locally. CI can build and sign artifacts.`
- **[[c5]]** `code` `src/shared/daemon-process-client.ts`
- **[[c6]]** `analyze-bundle` `scripts/daemon-bundle-metadata.mjs`
- **[[c7]]** `analyze-bundle` `scripts/daemon-development-metadata.mjs`
- **[[c8]]** `code` `src/db/graph/store.ts`
- **[[c9]]** `code` `scripts/daemon-ctl.sh`
- **[[c10]]** `code` `src/cli/services/maintenance.ts`
- **[[c11]]** `code` `scripts/package-daemon-candidate.mjs`
- **[[c12]]** `code` `.github/workflows/daemon-promotion.yml`
- **[[c13]]** `doc` `https://releases.ubuntu.com/24.04/`
- **[[c14]]** `doc` `https://nodejs.org/en/blog/release/v22.22.1`
