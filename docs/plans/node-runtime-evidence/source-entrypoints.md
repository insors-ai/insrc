# Source installer and shell entrypoints (task t5, in progress)

ISSUE/LLD/PLAN `a03e99e17a364550`, story s1, task t5. The task has been admitted. Public installer/shell wiring and the two required end-to-end entrypoint tests are not yet complete. No BUILD approval is requested between tasks.

## Independently owned Linux actors

Historical daemon code does not know the new source journal. An explicit Node `--import` barrier lets the current owner record a real kernel-observed process identity before granting that old entrypoint permission to run. The prelude applies only to the native monitor's direct daemon child; it does not attach its channel to worker threads or forked helpers. The native helper sets the root/monitor identities and clears inherited Node IPC setup. Node injection variables are removed by the current launcher.

The Linux-only source actor helper owns its forked daemon and retains a pidfd. As a child subreaper it reaps surviving descendants, including detached children, after the daemon exits. It signals only retained pidfds for its own unreaped direct/adopted children. It writes a private fsynced closure receipt only after the kernel reports no children. It cannot claim that an externally launched historical process has the same ownership; the public host must handle that boundary separately.

Before commit, losing the controller terminates and reaps the owned subtree. After an explicit commit, the supervisor remains available independently of that controller. Later clients authenticate its Unix peer credentials and full Linux birth marker before issuing a scoped command. A fresh client binary comes from the current authenticated package, never from an arbitrary ticket path. Reopening continues through the resident supervisor's original kernel capability; it does not authorize a numeric-PID kill. Closed receipts bind the random actor token, root PID and Linux birth marker, and are checked against process identity. Missing closure evidence remains an error.

An owned, private intent record is published before any monitor/root can be forked. A complete ticket records root/monitor identity, qualified release pin, transaction id and role before startup is granted. These records are internal ownership evidence, not an alternate runtime selector. Current source authorization, runtime archive/inventory verification and parent transaction admission remain caller responsibilities.

## Primitive checks completed

- Canonical run `910f1f24-ebcb-49b6-ad99-58225882f27b`: build and initial native actor case passed on actual OrbStack Linux arm64/x64.
- Canonical run `9633f9ef-6718-419d-bce3-149a59d8d774`: build and both native actor cases passed on arm64/x64, cleanup `confirmedClosed: true`.
- Tests compile the real C source with warnings as errors and use the actual startup prelude and process broker. They prove no entry before grant, wrong supervisor incarnation refusal, worker/fork compatibility, detached descendant closure after retained root termination, uncommitted controller-exit cleanup, committed controller-exit survival and supervisor reopening. Native preflight and repeated commit are exercised. Guest TAP is retained under `.insrc/tmp/source-transaction-linux-bwNfaD` and `.insrc/tmp/source-transaction-linux-UgwuQZ`.

These checks do not yet establish public installation/upgrade behavior, production native-module/data compatibility, or a safe adoption protocol for an unmanaged historical tree. Those are pending integration/qualification, not inferred from the primitive tests.
