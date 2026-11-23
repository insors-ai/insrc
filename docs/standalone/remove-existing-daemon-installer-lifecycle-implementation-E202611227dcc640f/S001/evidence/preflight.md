# Removal preflight

All 278 whole-file candidates and 176 member entries match their committed source SHA-256 fingerprints. The removal ledger is `removal-accounting.json` in this directory; paths and selectors are frozen before edits. Application code is unchanged at this checkpoint.

Development runtime: `/opt/homebrew/opt/node@22/bin/node` v22.23.2. Java: Corretto OpenJDK 21.0.12.1. JetBrains Gradle wrapper exists and is executable; offline compile/focused JUnit availability is verified during final validation rather than assumed from Java presence.

Backend commands are `npm run build` and `npm run typecheck:tools`. VS Code commands are its existing `build` and `bundle` scripts after obsolete generator wiring is removed. The ledger lists initial focused retained test selectors; mixed-suite tests keep all non-lifecycle assertions. Test-harness ownership and time budgets stay in force. No live service qualification matrix is started.

Scope is repository files only. No daemon process, installed checkout/runtime, launch job, socket, trust journal or user data was changed. Existing unrelated workflow metadata modifications remain untouched.
