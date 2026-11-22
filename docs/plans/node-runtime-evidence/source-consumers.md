# Source release consumers — t6 implementation evidence

Story `a03e99e17a364550/s1`, approved task t6. This task is in progress; its public TUI/daemon/MCP integration cases and registered gate have not passed yet. BUILD approval remains deferred until the whole story is built and tested.

## Reuse and current wiring

The registered analyzer located `SourceInstallationStore`, `NativeSourceTransactionHost`, `resolveOwnedToolchain`, `readInstallationSelector` and `runAcknowledgedManagedUpdate`. Its `SourceInstallationStore` callers result was explicitly incomplete (five relationships to ignored files, ten awaiting targets), so direct searches supplemented it. Existing source callers were the independent verifier and source controller; TUI maintenance still had an in-place Git/npm route, CLI start still used its compiled checkout, and `scripts/insrc`/`scripts/insrc-mcp` did not consume Linux source selection. The daemon's existing Linux updater still launched an incumbent ctl restart; macOS has its separate private-channel managed owner.

The draft shared `source-routing.ts` reads bounded, private selector metadata, validates the complete source journal through its existing store, verifies compiled source and the release-owned runtime before resolving a controller, and distinguishes legacy absence from malformed/pending source state. Client code does not open daemon databases. Lifecycle calls reuse `insrc-source-control`; failures include the exact command and bounded diagnostics. This helper has typechecked but its caller integration is still pending.

## Native updater ownership boundary

A detached Node fork remains a descendant of a Linux child subreaper. Merely setting `detached: true` cannot let an updater survive the incumbent owner's full descendant shutdown. The draft native handoff asks the authenticated resident owner to create a sibling supervisor with `CLONE_PARENT`, before entry is granted. This is an explicit independent scope from birth; no descendants are excluded from either owner's `ECHILD` closure proof and no numeric PID is signaled.

| Endpoint/relationship | Direction and ownership | Lifetime and compatibility |
| --- | --- | --- |
| Incumbent native supervisor → daemon root and descendants | One retained root pidfd; the supervisor owns and reaps its complete subtree. | Existing startup grant, commit and full closure semantics remain unchanged. |
| Resident supervisor → independent updater supervisor | The resident invokes `CLONE_PARENT`; the new supervisor is its sibling, outside the incumbent subtree. A private pre-fork intent and request precede creation; a ticket precedes entry grant. | The new supervisor receives the original daemon's retained pidfd as its creator capability. No capability is reacquired from a numeric PID. |
| Updater supervisor → updater root and descendants | One new retained root pidfd and its own subreaper scope; current pinned Node/controller entry only. | Creator exit cancels an uncommitted handoff. After explicit ownership commit it outlives incumbent closure; its own full closure is independently verified. |
| Source selector → consumer launch/controller | One canonical logical installation selects at most one release. A pending transaction is never a client launch route. | Missing selector permits existing legacy behavior; malformed selector is fatal. macOS remains with its managed owner. |

The draft adds the `update` ticket role to the dedicated native actor client; it does not widen the daemon-only generic process broker or public lifecycle RPC methods. Detached updater admission checks live daemon ownership, qualified current executable paths and matching owned runtime. It records metadata before startup grant and rejects another live updater handoff.

## Checks completed

- Canonical run `cc645867-f6ab-4252-8f4c-4a9b34c663f5`: all five existing native actor cases passed on actual OrbStack arm64/x64. The new updater case passed on arm64 and failed on x64 before entry grant. Coordinator cleanup was confirmed; no public updater was wired.
- Run `088ce631-3eba-4590-a2bb-e6a1f8fcc3ad`: the focused retry reported `ENOSYS` on x64. Native detachment had required `close_range`; this is unnecessary because owner descriptors already have `CLOEXEC`, including pidfd results. The creator capability is the sole deliberate non-stdio exception. The executable is addressed by its canonical supplied binary path, avoiding dependence on emulator-specific `/proc/self/exe` identity.
- Canonical run `5a7f4f9d-e74f-496e-9c63-65f251c6b80f`: the focused independent-updater case passed on both targets after removing that optional syscall dependency. It proves blocked entry before grant, rejection of concurrent handoff, cancellation and descendant closure when the creator exits before commit, survival after committed incumbent subtree closure, reopening, and the updater's own full descendant closure. These are controlled native process tests, not production historical data/native-module qualification.

## Work still required

Public TUI/CLI/MCP routing and daemon acknowledgment/outcome wiring remain unfinished. The ownership handoff must also ensure that a committed replacement daemon outlives the updater's own closure; wrapping the updater in an independent supervisor alone does not establish that second boundary. That relationship must be implemented and tested before connecting this primitive to `daemon.update`. No detached-updater integration success or t6 completion is claimed here.
