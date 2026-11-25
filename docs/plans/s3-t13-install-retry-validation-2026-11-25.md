# S3 t13 — explicit install Retry and durable bundle recovery

Task `c3d71313f34bce71/s3/t13` / #289, approved LLD revision 6 and PLAN revision 3.

The shared terminal defaults **Retry install?** to no. An affirmative response uses an internal terminal capability, verifies the original install intent/home/preparing scope, completes owned dependency cleanup, retires the old operation, then starts the ordinary installer with a new operation/attempt and current dependency consent. No manager wire action or automatic startup cleanup was added. Upgrade intent, selected releases, candidate/dev/delivery/shutdown/daemon admissions and later phases reject before cleanup writes. Unknown legacy scope remains blocked.

The real dependency adapter invokes t12's bounded cleanup using the accepted historical policy. An unadmitted scope is accepted only when it is provably empty; orphan evidence is preserved. A retained live actor prevents cleanup. Cleanup failure or cancellation cannot reach release resolution, download, candidate preparation, activation or TUI launch.

Bundle offers now carry their complete parsed descriptor in versioned private metadata. Fresh manager and fresh bundle adapter construction validate its canonical digest, target, manifest and accepted upgrade identity. Missing legacy descriptor data, tampered data and wrong targets fail closed without resolving latest. Only the private release-offer record receives the descriptor-sized bound; all other control metadata and wire limits remain unchanged. Decline creates neither dependency capability nor dependency metadata.

## Verification

- Canonical Node 22.22.1 build/typecheck and six surrounding files passed: 58 tests, zero failed/skipped/cancelled. Run `46923d01-8083-45c5-98b6-379157c9fecd`.
- Additional four-file recovery/detection/preparation run passed: 18 tests, zero failed/skipped/cancelled. Run `e2488456-50e2-4206-91f0-5d256d025298`. Includes the updated integration file and the new bundle recovery file. Initial fixture URL/policy mistakes were corrected before this successful run.
- Both coordinators confirmed owned-group closure. Logs, admissions, results and disposals are under `.insrc/tmp/test-harness/runs/<run-id>/`.
- The bundle test uses a real verified Node 22 runtime, real ZIP download/extraction/publication/verification and a fresh production bundle adapter. App entrypoints and daemon/migration peers are controlled fixtures; this does not claim full production lifecycle or native Ollama qualification.
- The real dependency integration holds an admitted actor after extraction, proves explicit Retry is blocked, releases the actor, changes the catalog policy, and completes cleanup with the stored original policy. Normal fresh-install ordering/current reconsent are separately asserted through the terminal/manager test.
- Interruption tests in this task use deterministic actor/barrier and completion gaps. Actual signal/process death and production supervisor tests remain t14. No installed host daemon or host Ollama was changed; no full backend suite was run.

The registered task validation gate follows this commit. Final story approval and the composed scoped regression remain pending until all correction tasks are complete.

## Gate follow-up: actual death during cleanup

The first tracked gate passed typecheck and all new Retry/bundle tests, but rejected the round because the detection file still ran under host Node 26 and cleanup interruption was only simulated after completion. Detection cases now use the existing private-runtime wrapper. A new captured child runs the real manager Retry and real cleanup primitive, acknowledges the temporary-unlink/completion gap, and is killed with SIGKILL by its owning test. At death one temporary item remains, cleanup completion is absent, and no new install operation exists. A fresh manager and newly constructed typed delivery peers then finish the missing real cleanup journals before ordinary fresh installation. The real dependency adapter performs this second cleanup; delivery/daemon peers remain controlled fixtures.

Canonical focused run `e92921b4-bf1c-4547-b575-2c13f915116d`: 14/14 tests passed, zero failed/skipped/cancelled, confirmed owned-group closure. The captured cleanup child is the only actor intentionally terminated; no daemon/service process or host installation was touched. Broader preparation/handoff signals and retained-supervisor death still belong to t14. Tracked revalidation follows.
