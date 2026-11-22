# Existing-install upgrade bootstrap: task t1 evidence

Scope: approved ISSUE `a03e99e17a364550`, Story `s1`, task `t1`.

The source verifier now selects an explicit Linux arm64/x64 compatibility
catalog from the authenticated Git tree. Linux catalogs must name their target
and qualify the exact predecessor and Linux source launch profile. The existing
macOS catalog and managed lifecycle remain on their original route. Source
promotion requires separate historical-upgrade and migrated-update evidence
for each Linux target; the packaged verifier retains the selected target.

Qualification-only requests now check the persisted bootstrap source floor as
well as lifecycle observations. A signed stale sequence or replacement of an
accepted sequence cannot reach checkout through that request.

The portable staging entrypoint reuses the existing candidate builder and
runtime authority. It does not select a release, stop/start a daemon or open
user stores. Candidate source is authenticated before npm; prior runtime and
checkout remain separately pinned. Linux staging has its own release directory
and must match the host target.

## Checks performed

Canonical coordinator run `2f629f01-d9aa-4533-8af9-e780abafcd34` used development
Node 22.23.2, performed the full build and passed all 21 tests in six files:

- `scripts/__tests__/node-runtime-packaging.test.ts`
- `scripts/__tests__/source-upgrade-qualification-native.test.ts`
- `src/daemon/__tests__/managed-release-bootstrap.test.ts`
- `src/daemon/__tests__/managed-release-staging.test.ts`
- `src/daemon/__tests__/release-compatibility.test.ts`
- `src/daemon/__tests__/source-release-promotion.test.ts`

No cases were skipped. The run's `cleanup.json` reports
`confirmedClosed: true`, with no cancellation or evidence errors. Logs and TAP
counts are retained under `.insrc/tmp/test-harness/runs/` for that run ID.
Subsequent final edits add explicit optional-property typings and clarify a
comment; the registered build gate separately checks the committed task.

The new tests use real Git/SSH signatures with disposable fixture keys. They
reject missing/unsigned/foreign signatures, wrong channels/profiles, stale or
replaced sequences, and a missing Linux catalog despite an available macOS
catalog. Target-specific promotion evidence and packaged verifier defaults are
checked for both Linux architectures.

The staging test uses the verified official host Node 22.22.1 archive and its
actual npm 10.9.4 against a small dependency-free signed fixture. A hostile
ambient npm is never invoked. Native-build environment inheritance is checked
through real npm children for unset, empty and explicit `v12` CUDA values;
Python bytecode protection remains enabled. Incumbent source/output/runtime
are preserved. Existing installer routing tests use explicit recording
runtime-owner delegates, while this separate test exercises real Node/npm.

## Limits

This is bootstrap/staging evidence, not a historical installation's full
native upgrade qualification. The fixture smoke program does not load the
five production native dependencies. No Linux source selector/cutover has
been activated, and no user's daemon or database has been changed. The
remaining PLAN tasks own Linux transaction/recovery, entrypoint integration,
actual macOS/OrbStack upgrades, subsequent updates and final release evidence.

Fixture signing keys do not authorize production releases. Production source
promotion still requires the operator's signing material and valid recorded
qualification; this task does not create or replace that trust root. The
user's remote-machine compiler log is still unavailable, so this work does
not attribute every reported npm failure to one cause.
