# S3 t12 — dependency closure and cleanup validation

Task: `c3d71313f34bce71/s3/t12` / #288. Implements approved LLD revision 6 and PLAN revision 3.

New attempts persist the accepted policy and exact native lock device/inode, with the in-process/non-inherited protocol. Historical reconciliation does not substitute a changed catalog policy. Explicit cleanup requires its separately registered same-installation Retry capability, a matching anchored lock and positive closure or the qualified in-process admission. A replacement free lock, unknown/external actor, malformed policy or held actor blocks cleanup. The manager/terminal action checks and fresh install sequence are the next task (t13); this task does not start an installation.

Cleanup validates the owned tree before removal, retains bounded immutable progress, and preserves published dependencies, services, model/log directories and diagnostic history. Cancellation/deadline keeps unfinished evidence and prevents a new installation. Late finite completion records its actual outcome and runs bounded disposal while retaining the lock. Resource-close uncertainty keeps its handle until process exit. Immutable record writes use native exclusive rename and remove known closed temporary writes on failure.

## Checks performed

- Canonical Node 22.22.1 build/typechecks passed through the coordinator.
- Six surrounding files: 30/30 passed, zero skipped/cancelled/failed, confirmed owned-group closure. Run `3b0b27df-4286-433b-9feb-23d180687976` (before the final strict UTF-8 read refinement).
- Final focused prepare/recovery check: 15/15 passed, zero skipped/cancelled/failed, confirmed owned-group closure. Run `8007c019-d8fc-4cb8-a712-c20016f937a0`.
- Tests cover live/unknown/inherited-protocol rejection, replacement lock identity, repeated interrupted cleanup, cleanup cancellation/deadline, late failure outcome/disposal, policy change with published-payload preservation, malformed UTF-8, and regular-file exclusive publication with closed-temp cleanup.
- No full installer/backend sweep. No installed host daemon or host Ollama changes.

## Remaining evidence

Task gate validation follows this checkpoint and writes the authoritative BUILD/TESTS result. Process-death/production-supervisor tests belong to t14; native Linux proof and cross-platform limitations to t17; final composed regression to t18. Crash-shaped fixtures here do not claim an actual SIGKILL/native-platform qualification. Legacy incomplete attempts without matching policy or qualified actor proof remain blocked. Inspection remains read-only with its existing three-second aggregate target; installed payloads are not rehashed.

## Gate-environment and interruption follow-up

The first tracked gate failed because its host-Node runner bypassed the canonical private Node 22 environment for direct tests. Preparation/recovery tests now use the existing privateRuntimeTest wrapper, as the service/integration tests already did. No installed daemon/runtime change was made. The gate also exposed a real temporary-file unlink/completion journal gap: immutable per-file intent now precedes unlink, and interrupted absence is reconciled into a separate completion record. The stage is one exact plan target, with durable disposal admission/completion; its contained entries are safely rescanned after interruption. Tests fault every deletion boundary and the stage-removal/completion gap.

Current canonical focused run `faa6372d-7d68-4ae5-83fe-fea128cc35c9`: 18/18 passed, zero fail/skip/cancel, confirmed owned-group closure. Includes a real live exec child proving the native actor handle is not inherited, rather than only a record-field rejection. Successful regular-file first publication and refusal to replace an incumbent are both tested.

Native Linux ARM64 OrbStack smoke was run under private Node 22.22.1, uid observed as 501, glibc observed as 2.35. The current C source was freshly compiled with matching installed headers; source SHA-256 and binary SHA-256 are in `docs/plans/s3-t12-native-publication-2026-11-25.json`. The accompanying driver records successful regular-file publication/no-replace and a live exec non-inheritance check. Guest temporary-root absence was independently checked, then VM `insrc-s3-ollama-arm64` was stopped. This is primitive qualification, not a fresh full Ollama/install qualification or Windows/macOS x64 claim; t17 retains that evidence scope.

The cleanup primitive has no delivery/lifecycle/installation ports and cannot start an install. The composed manager blocked-state and cleanup-before-fresh-install assertions belong to t13; no t13 behavior is claimed by these primitive tests. Tracked gate revalidation follows.
