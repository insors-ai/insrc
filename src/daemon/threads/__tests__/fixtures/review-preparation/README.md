# Retained review preparation workload

`history.json.gz` is the exact byte snapshot of the stopped four-attempt review,
compressed deterministically. `manifest.json` binds its SHA-256 and size, final
171-file/40-commit selection, source revision and original profiling evidence.
This is historical test data, never an execution, approval or native-clearance
credential. In particular, its retained resource fence must not be applied to or
cleared on the real daemon by a test.

The test decodes all four attempts and checks the exact final selection. For
native measurements it clones the repository's committed object history into a
disposable directory without alternates, creates an isolated registered-project
set, and uses the existing native host/worker transport, process leases, typed
Git adapter and full checkpoint writer. Only the copied fixture's operational
guards are reset; the original checkpoint is never read or modified at test time.
Pinned Git objects must remain available in this repository's history. Missing
objects are a failure, never a HEAD substitution or skipped test.

The normal test runs a three-query managed sample, including a duplicate, to
measure native intent/write amplification cheaply. The original 13,031-query
profile is labelled direct-source evidence outside worker durability. Neither
measurement substitutes for the full cold/warm/history-growth qualification in
task t14. That qualification must reuse the entire retained workload.

Initial managed sample on Node 22.22.1, Linux, Ryzen 9 8940HX:
3 native commands, 6 full checkpoint writes, 12,496,680 serialized bytes,
431.7 ms sample elapsed, host load 3.32/2.25/2.37, no provider invocation.
These timings are observations, not portable test thresholds. The test emits
fresh host/load/timing/count diagnostics on every run.

A separate production-worker readiness case installs the existing deterministic
reviewer fixture, blocks real source preparation, and measures zero provider
invocations. It then releases preparation, holds the first actual provider call,
and verifies that qualification was durably saved before that call. This uses
an isolated registered project/socket and no hosted model. Publication is outside
this readiness test; the fixture's durable result is observed directly.

Run with the supported Node runtime:

```sh
INSRC_LOG_LEVEL=error node --import tsx --test src/daemon/threads/__tests__/review-preparation-baseline.test.ts
```
