<!-- insrc:artifact BUILD-0e1265ed8581e188-s1 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-16T06:40:42.435Z  ·  **Updated:** 2026-10-16T06:49:29.234Z

**Commit:** cb91914f

## Summary

When the activation probe finds an installed daemon stopped, the extension re-checks reachability and then starts it once as a plain start (the controller's run gains a plain option adding --skip-sync --skip-install --skip-build, so nothing is pulled, installed or built); a failed start, or a success that leaves the daemon unreachable, shows as errored with the reason. ActivationDeps gains an optional controller and an onSettled callback; the settings pull from the daemon, the update check and the first-run onboarding now wait for activation to settle, so they find the daemon the start brought up. The live checks were run by the user after installing the rebuilt vsix.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `Auditing_AI_Coding_Agents_with_HTTPS_Inspection_Proxy.md` — **insrc-build** (2026-10-16T06:49:29.234Z)
