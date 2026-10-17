# Story s1 acceptance evidence

Validation used temporary LMDB stores and Unix sockets, synthetic identities and answers, and a separately killed test writer. No live learner record or cloud model was used.

- `npm run build`: passed after final integration fixes. Log: `/tmp/insrc-understanding-final-build.log`.
- New understanding tests plus affected graph-store, server registry, shutdown, role taxonomy and core-floor suites: **74 passed, 0 failed/skipped**. Log: `/tmp/insrc-understanding-final-affected.log`.
- CLI rendering, extension/daemon role-setting agreement, and extended crash/association acceptance: **24 passed, 0 failed/skipped**. Log: `/tmp/insrc-understanding-final-integration-fixes.log`.
- Crash acceptance proves acknowledged original/assisted answers, confidence and many-to-many learner proposals survive SIGKILL/reopen; real workflow DEF/PLAN/BUILD artifact bytes and the real delivery-handler snapshot stay unchanged; interrupted work and missing authorizers never yield a pass or receipt. Existing service tests supply CAS/rollback/delete-race evidence, and real-socket tests supply reconnect/terminal-frame evidence.

The first final full sweep found two role-integration regressions: newly prepended roles displaced the CLI's existing visible override, and five corresponding extension setting declarations were missing. The roles now append to the existing order; the extension declares all five critical/core settings and is versioned 0.5.16. The targeted 24-test rerun above proves both corrections.

The full sweep completed: **5,820 tests, 5,687 passed, 5 failed, 125 skipped and 3 todo**, in 234 seconds. Log: `/tmp/insrc-understanding-final-full.log`. The five failures comprise the three baseline failures and the two role-integration failures corrected and rerun above. This was not a clean full-suite pass. The three pre-existing failures remain accepted baseline evidence in `T001-build-evidence.md`; they are not counted as passed or fixed.

Consumer fixtures and sibling seams are documented in `consumer-contract.md` and `consumer-fixtures-v1.json`. Scoring, guidance, authorizing receipts, Git enforcement, explicit overrides and the editor pane remain their approved sibling stories. Production preparation deliberately returns unavailable until trusted scope/policy capture is installed.

The role taxonomy ordering and extension declarations correct regressions caused by t7, discovered during t8’s required regression sweep. They are necessary to satisfy “Build and affected … regression suites pass” and the build instruction to finish callers/tests broken by the change; they do not implement an additional feature.
