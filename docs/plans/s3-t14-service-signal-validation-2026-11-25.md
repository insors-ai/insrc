# S3 t14 — finite signal drain and retained-service evidence

Task `c3d71313f34bce71/s3/t14` / #290, approved LLD revision 6 and PLAN revision 3.

The shared terminal routes EOF, SIGINT, SIGHUP and SIGTERM into the same cooperative finite cancellation/drain. Install handlers are detached before TUI handoff. No production signal/PID termination of a daemon or service was added.

Read-only reconciliation can consume validated retained admission/running/exit facts without rewriting an unclosed finite handoff marker. Health remains availability, with endpoint ownership explicitly unproven. Preparation keeps its strict closure census. Explicit install Retry, under the anchored qualified non-inherited actor lock, can close dead finite handoffs and journal disposal of their exact temporary writes; legacy preparation closure alone cannot authorize unknown handoff disposal. Services, their payloads, models and logs are preserved.

Supervisor logs are opened before launch admission. Known pre-spawn validation, logging and spawn failures produce bound not-started outcomes and bounded canonical diagnostics; ambiguous launches never receive invented exit receipts. Entrypoint link checks are shared before/after admission, and the worker validates the native CLI header/link state. Nested resource-close uncertainty retains its native actor handle. Readiness uses min(overall deadline, readiness deadline), with distinct owner-loss, cancellation and deadline reports. Manager cancellation after a ready dependency result retains the accepted-service notice.

## Observed validation

- Canonical Node 22.22.1 build/typechecks passed in each coordinator run.
- Existing service/integration/recovery/terminal regressions passed in `30d93b65-1129-4029-95e9-38bd6f1e5c58`.
- Signal/service/integration additions passed in `241a4328-ed7a-4d8c-b038-c47981a19946`.
- Production dispatch, link-boundary and distinct supervisor-death cases: 3/3 passed in `3205b465-e0ea-4f73-8d20-5c8706392a17`.
- Final signal/recovery/composition/terminal-handler run: 24/24 passed in `f1570c65-4d49-4b2f-9672-fe00e1fa1ff2` (before the final async spawn-error and legacy-handoff additions).
- Current focused service/recovery run: 28/28 passed, zero fail/skip/cancel, in `99ac5372-c9d5-4111-bcd8-9d3b60df9ced`.
- Coordinators confirmed owned-group closure. Exact TAP logs and admission/close/disposal journals remain in `.insrc/tmp/test-harness/runs/<run-id>/`.

The signal case sends actual SIGHUP/SIGTERM/SIGINT/SIGKILL, plus actual stdin EOF, to captured isolated actors during preparation and handoff on this macOS host. Cooperative signals positively close finite work; SIGKILL leaves evidence for explicit Retry. The handoff/supervisor fixtures run the real worker function with a trusted launch bridge, while the owning test holds the actual service ChildProcess and asserts its positive close independently of supervisor death. After supervisor death, ready availability does not cause replay; after the captured service closes, no supervisor exit receipt is fabricated.

The production dispatch case uses the actual detached launcher and published target bootstrap with space/Unicode paths. A real private Node binary acts as a controlled native CLI running a fixture `serve` script. It verifies argv, sanitized environment with seeded harmless credentials/NODE_OPTIONS/NODE_PATH, readiness and positive supervisor/service close. This is not native Ollama qualification, macOS target enablement or full real S4/S5 installation. Windows signal/platform qualification remains separate. No installed host daemon or host Ollama changed.

## Test-fixture follow-up

The initial compressed large native fixture exposed the ZIP reader's rejection of a coalesced output chunk larger than 64 KiB. Stored ZIP members allow the worker-specific qualification to exercise its intended boundary. The streaming edge case is retained for the already approved t15 archive-hardening batch; it is not claimed fixed here. Earlier worker runs also exposed test ownership mistakes (joining an intentionally unref'ed child and passing a production child to spawnFixture cleanup); the successful test now refs only its captured test worker, observes its real close and preserves production detached behavior.

The registered task gate follows this commit. No full backend suite or final story approval has been performed.

## First tracked verdict follow-up

The registered gate passed all mapped tests and typecheck but found two missing failure-ordering paths. Known not-started outcomes and their bound diagnostics are now written before cancellation/owner checks; failure immediately after durable admission also writes both records. Cancellation cannot turn a confirmed failed spawn into unverified. Unknown invoked launches still receive no invented exit.

The regression covers cancellation, callback failure and owner loss immediately after admission, plus cancellation/owner loss accompanying a positively failed launch. Current canonical focused run `4130f938-3623-4e18-9ccd-4040014898e5`: 10/10 service tests passed, zero failed/skipped/cancelled with confirmed owned-group closure. Tracked revalidation follows.

The second registered validation returned passed=true against `be434767d`: all six acceptance checks, all nine mapped test subjects and typecheck passed. The compact verdict is `docs/plans/s3-t14-build-gate-2026-11-26.json`; the workflow wrote the authoritative BUILD/TESTS ledger. T15–T18 and final story approval remain pending.
