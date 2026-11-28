<!-- insrc:artifact ISSUE-446ae69566d352dd -->

# Complete the shared external Node runtime foundation

## Reproduction

On branch installer, inspect the installed manager and TUI/retry launchers: they select <release>/tools/node, and the manager rejects execution under a different path (c2,c3). Prepare a bundle or dev candidate containing application files only, with the pinned Node distribution installed separately under the installation home: bundle/dev validation still requires embedded tools/node and the bundle descriptor also requires runtime archive bytes (c4–c7). The publisher likewise adds both the expanded runtime and its archive to the application payload (c8). This conflicts with HLD7's live separate Node acquisition and blocks S4 task #298 from consuming a real verified external-runtime resolver (c9,c10). These are source-grounded failure conditions; no fresh host installation or native platform qualification is claimed.

## Root cause

The runtime policy provides official archive identity and a privateRuntimePaths constructor, but the constructor does not acquire or verify an installed runtime and has no callers found by the bounded analyzer or supplemental text search (c1,c11). Installed consumers, bundle inventory/archive validation, dev payload validation and publisher probes instead retain release-local tools/node assumptions (c2–c8). The completed S1/S2 implementation therefore does not provide the shared external-runtime foundation required by the updated HLD. The analyzer reports incomplete graph coverage (31 ignored relationships); direct source reads supplement the named findings and no complete call graph is asserted (c11).

## Fix intent

Implement one shared external Node foundation for bundle and dev delivery: acquire the pinned official runtime live, safely publish and verify its private immutable installation, reuse matching verified runtimes, and make installed manager/daemon/TUI/retry and publisher/dev consumers resolve that identity consistently. Remove Node/Ollama distributions and archive bytes from application and IDE payloads. Adapt private receipt/descriptor compatibility explicitly while preserving public RuntimeIdentity/ReleaseManifest and IPC contracts, pinned Node/npm/header/target/digest checks, one manager controller, terminal-owned installation and same-terminal TUI (c9,c10). Missing, corrupt or unqualified runtimes must fail closed without PATH or release-local fallback; avoid repeated full application/Ollama payload hashing. Preserve S3 consent, retained Ollama and install-only Retry behavior. S4 continues to own boot/control/lease/wrapper and S5 hook execution; the separate action-specific manager peer-gating gap is excluded (c9,c10). Validate surrounding tests per task and final scoped regression after all tasks; real platform qualification remains separate. Do not modify the current installed host daemon. Keep completed S1/S2 ledger content intact; their attempted design back-flow was refused because the S1 artifact is completed (c12).

## Citations

- **[[c1]]** `code` `src/installer/runtime-policy.ts`
- **[[c2]]** `code` `src/installer/manager-entry.ts`
- **[[c3]]** `code` `src/installer/installed-launcher.ts`
- **[[c4]]** `code` `src/installer/bundle.ts`
- **[[c5]]** `code` `src/installer/safe-zip.ts`
- **[[c6]]** `code` `src/installer/dev-payload.ts`
- **[[c7]]** `code` `src/installer/dev-worker.ts`
- **[[c8]]** `code` `scripts/package-installer.mjs`
- **[[c9]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md`
- **[[c10]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S004/PLAN.md`
- **[[c11]]** `analyze-bundle` `Completed bounded installer foundation analyzer run, 2026-11-26` — "Existing runtime-policy exposes official archive metadata and pure privateRuntimePaths, not a verified installed-runtime resolver."
- **[[c12]]** `step-output` `S1 design.story synthesize refusal, 2026-11-26` — "the content of a completed artifact cannot change; reopen it first"
