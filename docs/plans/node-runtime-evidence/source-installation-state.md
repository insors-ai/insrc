# Linux source installation state: task t2 evidence

Scope: approved ISSUE `a03e99e17a364550`, Story `s1`, task `t2`.

`src/shared/source-installation.ts` provides Linux source selector/journal
persistence. `source-lifecycle/journal.json` is one atomic document, separate
from the macOS managed installation schema. An absent document means legacy;
malformed or unsafe state fails closed. Source startup consumers are wired in
later tasks; this task does not activate an installation.

| Owner | Reference | Cardinality and compatibility |
| --- | --- | --- |
| Canonical state root | Logical installation root | Exactly one identity once published; another root is refused. |
| State document | Selected source release | Zero for legacy, otherwise one release pin with its source, compatibility and runtime-binding references. |
| State document | Active transaction | At most one; unfinished transactions cannot be replaced or cleared. |
| State document | Retained release pins | Multiple immutable references; updates cannot drop existing pins or a displaced selection/transaction pin. No GC is implemented. |
| State document | Retained source selections | Complete source receipts, compatibility, toolchain and binding references survive displacement or transaction cleanup, including the initial selector snapshot. A bare pin cannot replace this metadata. |
| Source selection | Runtime binding | Exactly one per release root. Version and archive digest belong to that release, independently of the current builder policy. |

Publication uses the existing short run-file guard and an expected generation.
The state root and source directory are pinned with Linux file descriptors;
operations use `/proc/self/fd` paths and do not fall back to mutable absolute
paths. Bounded files, ownership, modes, canonical references, regular-file
types and link counts are checked. Readers detect a replaced journal rather
than returning a stale snapshot.

A temporary document is flushed, atomically renamed, then both directories
are flushed. Any error at that boundary returns a publication receipt with
the expected old/new digests and generation. Reconciliation reads and flushes
the actual state and reports published/not-published, or refuses conflicting
state. It never replays the mutation callback. Uncertain staged files remain
available; release objects and runtime bindings are never rewritten/deleted.

Runtime metadata is a reference, not an alternative trust authority. Actual
archive/inventory verification remains mandatory through the release's runtime
owner before activation. The persistence fixture uses non-executed placeholder
runtime files to test references, including retention of an older version.
Every selected, candidate, initial or retained selection also requires a
matching source floor at least as new as its receipt. The exact historical
receipt remains in the full selection snapshot when that floor advances.

The independent source verifier now validates the complete Linux journal
schema when reading its signed-source sequence observations. It checks every
matching floor across both lifecycle journals, so a lower macOS observation
cannot hide a higher Linux observation.

## Validation

Initial broad run `9d7ad49d-6d60-4f01-b5f4-658518dd16c3` used development Node
22.23.2, completed the full build and passed 14 tests in five files, with no
skips or incomplete coverage. `cleanup.json` reports `confirmedClosed: true`.

- `src/shared/__tests__/source-installation.test.ts`
- `scripts/__tests__/source-upgrade-qualification-native.test.ts`
- `src/daemon/__tests__/managed-release-bootstrap.test.ts`
- `src/daemon/__tests__/release-compatibility.test.ts`
- `src/daemon/__tests__/source-release-promotion.test.ts`

The first build gate then identified incomplete receipt retention despite
passing tests. The correction adds complete retained selections and rejects
missing floors, pin-only retention, displaced selections and dropped initial
transaction snapshots. Canonical run
`3a1a4480-95c7-4ae0-b612-cb485352fce2` rebuilt the corrected code and passed all
six tests in the persistence and source-qualification files, without skips;
its cleanup also confirmed closure. The other three regression files passed
in correction run `ed284e26-204b-4e39-be0d-f34e328c5675`.

That correction run had one fixture npm-build failure with insufficient
captured output. Adding stdout/stderr diagnostics and rerunning the fixture
passed; the original failure's cause remains unverified. This is not recorded
as a diagnosed production npm failure or as end-to-end upgrade qualification.

The three persistence cases each ran on both `insrc-node-arm64` and
`insrc-node-x64`, Ubuntu 24.04.5 OrbStack fixtures, using their retained official
Node 22.22.1 objects. The x64 machine uses emulation. The macOS test driver
bundles the test into an ignored workspace and invokes the actual Linux
kernel semantics; it does not substitute macOS path operations. TAP receipts
remain under `.insrc/tmp/source-state-linux-*`. Machines that the test starts
are stopped afterward; both qualification machines were stopped at completion.

Cases cover malformed/versioned state, permissions and links, runtime-binding
consistency, retained references/floors, four ambiguous-publication boundaries,
idempotent reconciliation, parent-path replacement and four competing writer
processes. All writer children settle before fixture disposal. Fault injection
is not a host power-loss qualification.

No user daemon/database was changed. Predecessor recovery, lifecycle cutover,
launcher integration and full historical native upgrade qualification remain
in tasks t3–t12. The registered build gate separately validates the committed
task and records its named test results in the Story's `TESTS.md`.
