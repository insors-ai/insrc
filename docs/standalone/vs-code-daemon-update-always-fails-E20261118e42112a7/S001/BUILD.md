<!-- insrc:artifact BUILD-e42112a7ce3173af-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-18T04:54:17.437Z

**Commit:** 3c860246e

## Scope

Bugfix (ISSUE-e42112a7ce3173af, magnitude small): fix vscode-plugin/src/daemon/controller.ts's run('update') so an unmanaged checkout whose daemon entry/ctl script already exists drives daemon-ctl.sh update directly, instead of falling back to install(true)'s bundled signed-installer bridge (which always fails with 'production source release signing key is not provisioned' because the extension's bundled asset never gets the real signing key baked in). Bring this in line with the JetBrains plugin's existing correct policy (UPDATE always via daemon-ctl.sh update; bundled installer reserved for fresh INSTALL only). No change to scripts/insrc-daemon-install.sh's signed-bridge gate itself.

## Triage rationale

Grounded via insrc_analyze_step: createDaemonLifecycleController has exactly one production caller (extension.ts:activate) plus its test file, so the fix is confined to controller.ts. JetBrains' lifecycle module already implements and documents the correct UPDATE policy and never references the signing env var -- cross-plugin precedent resolves the fix shape; small/trivial, not design-worthy.
