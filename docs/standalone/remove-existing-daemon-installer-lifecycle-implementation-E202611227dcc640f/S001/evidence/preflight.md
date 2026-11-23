# Removal preflight

All 278 whole-file candidates and 176 member entries match their committed source SHA-256 fingerprints. The removal ledger is `removal-accounting.json` in this directory; paths and selectors are frozen before edits. Application code is unchanged at this checkpoint.

Development runtime: `/opt/homebrew/opt/node@22/bin/node` v22.23.2. Java: Corretto OpenJDK 21.0.12.1. JetBrains Gradle wrapper exists and is executable; offline compile/focused JUnit availability is verified during final validation rather than assumed from Java presence.

Backend commands are `npm run build` and `npm run typecheck:tools`. VS Code commands are its existing `build` and `bundle` scripts after obsolete generator wiring is removed. The ledger lists initial focused retained test selectors; mixed-suite tests keep all non-lifecycle assertions. Test-harness ownership and time budgets stay in force. No live service qualification matrix is started.

Scope is repository files only. No daemon process, installed checkout/runtime, launch job, socket, trust journal or user data was changed. Existing unrelated workflow metadata modifications remain untouched.

## Recorded verification results

`preflight-checks.json` contains 454 individual passing results: 278 exact expected/observed whole-file SHA-256 pairs and 176 member results with source SHA-256, actual current anchor text, valid range boundaries, selector and preservation obligation. `removal-accounting.json` now embeds each whole-file expected/observed hash and each member's verified anchor. No source deletion or stale-range application occurred.

JetBrains availability was checked, not deferred: `jetbrains-preflight.json` records exit 0 from `./gradlew --offline --no-daemon compileKotlin --console=plain` (8.31 seconds). `jetbrains-test-preflight.json` records successful offline admission/configuration of the existing test task via `test --dry-run`. This proves local compile/test-task tooling is available; it does not claim post-removal compilation or actual JUnit execution has passed.
