<!-- insrc:artifact LLD-ad0d45c9d690f8c1-s6 -->

# LLD: E20260922ad0d45c9:S006

**Epic:** `build-insrc-vs-code-extension-v1`
**HLD base run:** `wf-1790009331473-c5to0q`
**HLD effective hash:** `1e2038ef7232...`

## HLD context

**Framework:** The insrc VS Code extension is a thin orchestrator that owns no reasoning: a new top-level vscode-plugin/ TypeScript package (sibling to jetbrains-plugin/, its own package.json + build + Marketplace metadata) whose whole job is to wire insrc into stock VS Code at lifecycle moments (activate, first workspace open, uninstall). It re-expresses the shipped jetbrains-plugin/ thin-config-orchestrator in TS over VS Code primitives, reaching the daemon ONLY through a NEW in-repo src/shared/ipc-client module that generalizes the existing src/cli/client.ts `rpc` fn + its IPC request/reply types + the socket path — giving exactly one socket-client code path shared by the CLI and the extension (k5), with no daemon internals, indexer, or storage in the extension bundle, and no cloud path opened by the extension (k2). The extension is decomposed into small per-capability seams, each with an injectable boundary so its load-bearing logic is unit-testable off the VS Code API, and every invasive action (install the daemon, wire a host, register the workspace) is consent-gated and exposed as a durable first-class command.
**Rollout phase:** Phase D — Marketplace publish scaffolding

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The VS Code activation entrypoint, the extension-bundle packaging (its build over src/shared/ipc-client), and the daemon-reachability probe implementation stay private to s1. How the status-bar item is created and rendered, and the concrete extraction of src/cli/client.ts into a re-export over src/shared/ipc-client (without regressing the CLI/TUI), are internal detail — only the four type-level contracts (sc1–sc4) are exposed. — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s2`: The bundled installer asset (which installer script ships and how it is invoked over scripts/insrc-daemon-install.sh), the exact daemon-ctl.sh subcommand invocation and output parsing, and streamed lifecycle progress are private to s2. Only the sc6 lifecycle contract is exposed; the install/lifecycle commands are registered into sc3 and gated by sc4. — owns `sc6`
- `s3`: The concrete per-host config locations and shapes (extension-ID hosts like Copilot/Claude Code/Continue/Cline vs editor-environment hosts like Cursor/Windsurf/VSCodium via .vscode/mcp.json or the host's own file), the marker-delimited JSON-merge and steering writers, and the detection mechanics stay private to each adapter behind sc5. Only the sc5 interface + registry is exposed; the wire command is registered into sc3 and the combined consent uses sc4. — owns `sc5`
- `s4`: The workspace-root resolution from the open VS Code workspace folders and the already-registered check semantics stay private to s4. Only the sc7 registrar contract is exposed; enrolment goes exclusively through the daemon's repo.add over sc1, the register command is registered into sc3, and the one-time prompt uses sc4. — owns `sc7`
- `s5`: The first-run flow sequencing (the order and coalescing of the install → register → wire consent prompts into one coherent flow rather than scattered pop-ups), the persisted 'already onboarded' state, and the uninstall hook that drives sc5.unwire across wired hosts are private to s5. It owns no new shared contract — it composes the branch owners' contracts and pushes resulting state through sc2.

## Contract details

**Surface level:** internal

### `npm run bundle (esbuild)`

```typescript
scripts.bundle: 'esbuild src/extension.ts src/uninstall.ts --bundle --platform=node --format=cjs --external:vscode --outdir=out'
```

**Parameters:**
- `entryPoints: ['src/extension.ts', 'src/uninstall.ts']` — The two bundle entries: the extension main + the vscode:uninstall hook body.
- `external: ['vscode']` — Marks the vscode module external (the VS Code host provides it at runtime), so the compile-only src/vscode.d.ts shim suffices and @types/vscode is not needed.

**Returns:** `out/extension.js + out/uninstall.js (CJS, self-contained)` — Two bundled CJS files with the cross-package '../../src/shared/ipc-client.js' INLINED, so the .vsix is self-contained (no ../../src, no node_modules). Makes S001's `main` + S005's `vscode:uninstall` finally resolve at runtime (closes the deferred end-to-end ac3).

**Errors:**
- `(build failure)` when esbuild fails on an unresolved import or a missing entry — surfaced as a non-zero build exit; a broken bundle never reaches packaging (the tsc --noEmit typecheck gate runs first).

**Preconditions:**
- esbuild is already available in the repo (no new bundler dep).
- sync-assets has copied the bundled installer + steering-block.md into assets/ before packaging.

**Postconditions:**
- out/ carries the runnable extension + uninstall entry; the ipc-client import graph (node:net + pure types + paths) is inlined — no daemon internals (k5).

### `vscode-plugin/package.json (Marketplace manifest)`

```typescript
package.json += { publisher, repository, license, icon, keywords, categories } ; private removed ; scripts += { bundle, package, vscode:prepublish }
```

**Parameters:**
- `publisher: string` — The Marketplace publisher id (a maintainer-supplied input) — required by vsce to package/publish.
- `icon: 'icon.png' (128x128)` — The listing icon shipped in the .vsix.
- `repository/license/keywords/categories: manifest fields` — Marketplace listing metadata (ac1).

**Returns:** `a complete Marketplace manifest` — The vscode-plugin/package.json carries every field vsce requires to package + list on the VS Code Marketplace as a single installable package (ac1). `private:true` is removed so vsce can publish; the 7 contributes.commands + engines.vscode + activationEvents from S001-S005 are unchanged.

**Errors:**
- `(vsce validation error)` when vsce rejects a manifest missing publisher / a valid icon / repository — surfaced when packaging; the manifest test asserts the required fields are present before publish.

**Preconditions:**
- The publisher id + the icon/README content are maintainer-listing inputs (called-out; the publisher id is not invented).

**Postconditions:**
- ac1: the built extension carries the metadata + listing assets required to publish a single .vsix.

### `.vscodeignore`

```typescript
vscode-plugin/.vscodeignore (glob exclusion list)
```

**Returns:** `.vsix content boundary` — Ships ONLY package.json + out/ (the bundle) + assets/ + README.md + icon.png + LICENSE; EXCLUDES src/, **/__tests__/**, *.test.ts, tsconfig.json, .github, and the raw repo src — keeping daemon internals out of the package (k5) and the .vsix minimal.

**Preconditions:**
- The extension is BUNDLED (esbuild), so node_modules + src need not ship.

**Postconditions:**
- The .vsix contains only the runtime bits + listing assets; no source, no tests, no daemon internals (k5).

### `.github/workflows/vscode-plugin.yml (publish)`

```typescript
on: workflow_dispatch  # ONLY — no push/pull_request
```

**Parameters:**
- `trigger: workflow_dispatch` — Manual-only publish (never per-push), mirroring the shipped jetbrains-plugin.yml (k7/lc2).
- `secrets.VSCE_PAT: GitHub secret` — The maintainer's VS Code Marketplace Personal Access Token — never stored in-repo (k2).

**Returns:** `a published Marketplace release` — The job runs `npx @vscode/vsce@<pinned> package` (single .vsix, ac1) then `npx @vscode/vsce@<pinned> publish` targeting the VS Code Marketplace ONLY (lc1: no ovsx/Open VSX), gated on VSCE_PAT (ac2). No test job runs on GitHub (repo convention: avoid CI minutes).

**Errors:**
- `(publish failure)` when vsce publish fails on a missing/expired VSCE_PAT or a manifest/version error — surfaced in the manual run; nothing is published on failure.

**Preconditions:**
- The maintainer sets the VSCE_PAT repo secret + triggers the workflow deliberately.

**Postconditions:**
- ac2: publishing is a deliberate manual action targeting the Marketplace only, never automatic on push.

### `Marketplace listing assets (README.md + icon.png + LICENSE)`

```typescript
vscode-plugin/{README.md, icon.png, LICENSE}
```

**Returns:** `listing content shipped in the .vsix` — The Marketplace listing page content (README), the 128x128 icon, and the license file — the human-facing listing assets (ac1).

**Preconditions:**
- README/icon content is maintainer-supplied; a repo LICENSE may be reused.

**Postconditions:**
- The listing renders on the Marketplace with a description, icon, and license.

## Data model changes

### `vscode-plugin/package.json (manifest completion)` — field-add

Add the Marketplace-required fields (publisher, repository, license, icon, keywords, a real categories set), remove private:true, and add scripts { bundle (esbuild), package (vsce package), vscode:prepublish (typecheck + bundle) }. The S001-S005 fields (name/displayName/description/version/engines.vscode/activationEvents/main/contributes.commands/sync-assets/build/test/vscode:uninstall) are preserved.

**Call sites:**
- `vscode-plugin/package.json`
- `vscode-plugin/tsconfig.json`

### `vscode-plugin/esbuild bundle + out/ (new)` — new

A bundle step (esbuild, already available) producing out/extension.js + out/uninstall.js (CJS, vscode external) with the cross-package src/shared/ipc-client inlined — the emit S001's main + S005's vscode:uninstall depend on. tsc --noEmit stays the typecheck gate.

**Call sites:**
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/uninstall.ts`
- `src/shared/ipc-client.ts`

### `vscode-plugin/.vscodeignore + README.md + icon.png + LICENSE (new)` — new

The .vsix content boundary + listing assets: .vscodeignore excludes src/__tests__/tsconfig/.github/raw-src; README.md/icon.png/LICENSE are the listing content. Ships only package.json + out/ + assets/ + listing files.

**Call sites:**
- `vscode-plugin/assets`
- `vscode-plugin/package.json`

### `.github/workflows/vscode-plugin.yml (new)` — new

A NEW workflow_dispatch-ONLY GitHub workflow mirroring jetbrains-plugin.yml: npx vsce package + publish to the Marketplace only, gated on VSCE_PAT. No push/pull_request trigger; no test job (repo convention avoids CI minutes).

**Call sites:**
- `.github/workflows/jetbrains-plugin.yml`

## Error paths

### Error cases

- **The esbuild bundle silently drops the extension into a broken module format so the VS Code host cannot load main at activation.** (recoverable)
  - Detection: A packaging-preflight check: out/extension.js must be a require()-loadable CommonJS module (format=cjs) with 'vscode' left as an external require, and out/uninstall.js runnable by `node`. The build step fails non-zero if esbuild errors; a smoke check requires the two out/ files to exist + be CJS.
  - Response: The bundle is produced with --format=cjs --platform=node --external:vscode (not ESM); the build fails before packaging if either entry is missing or esbuild errors, so a broken bundle never reaches vsce package.
  - User impact: The published extension actually activates in VS Code (a CJS-external-vscode bundle is what the require-based extension host loads) rather than failing with an ESM/module-not-found error.
- **The .vsix accidentally ships the raw cross-package src/ (the repo's daemon internals) because .vscodeignore is missing or wrong.** (recoverable)
  - Detection: A .vscodeignore content test asserts src/, **/__tests__/**, *.test.ts, tsconfig.json, .github and the raw repo src are excluded; a `vsce ls` (dry-run listing) shows only package.json + out/ + assets/ + README + icon + LICENSE.
  - Response: Ship a .vscodeignore that excludes everything but the runtime bits; because the extension is BUNDLED (esbuild inlines only the thin shared ipc-client), the raw src is never needed in the package.
  - User impact: The Marketplace package contains no source, no tests, and no daemon internals (k5) — minimal + safe.
- **A publish is triggered but the VSCE_PAT secret is missing or expired.** (recoverable)
  - Detection: vsce publish exits non-zero with an auth error during the manual workflow_dispatch run.
  - Response: Nothing is published (the job fails); the maintainer sets/refreshes the VSCE_PAT repo secret and re-triggers. The PAT lives only as a GitHub secret — never in-repo (k2).
  - User impact: A failed publish is a clean no-op; no partial/invalid version reaches the Marketplace.
- **The bundled assets (insrc-daemon-install.sh / steering-block.md) are stale or missing in the .vsix, so S002's installer / S003's steering resolve to nothing inside the installed extension.** (recoverable)
  - Detection: The build runs `sync-assets` before bundling/packaging (already wired into `build`); a byte-fidelity test (S002/S003) asserts assets/insrc-daemon-install.sh + assets/steering-block.md match their sources, and .vscodeignore does NOT exclude assets/.
  - Response: sync-assets copies the two canonical assets into assets/ before packaging so they travel in the .vsix; the daemon paths S002 resolves (bundledInstaller = <extensionPath>/assets/insrc-daemon-install.sh) then resolve at runtime.
  - User impact: Install-from-Marketplace carries the same working installer + steering the local build has; no runtime 'asset missing' failure.
- **The publish workflow is written with a push / pull_request trigger, so it would auto-publish (or auto-run CI) on every push — violating k7/lc2 + burning Actions minutes.** (recoverable)
  - Detection: A workflow source-scan test asserts .github/workflows/vscode-plugin.yml has ONLY `on: workflow_dispatch` (no `push:` / `pull_request:` / `schedule:` keys) and runs no test job.
  - Response: The workflow declares workflow_dispatch as its sole trigger (mirroring jetbrains-plugin.yml); the source-scan test fails the build if any auto trigger is present.
  - User impact: Publishing (and any CI cost) happens only when a maintainer deliberately triggers it — never automatically (ac2/k7/lc2).

### Edge cases

| Input | Expected |
| :--- | :--- |
| A maintainer runs `vsce package` locally (not via the workflow). | The same manifest + .vscodeignore + bundle produce an identical single .vsix locally (the workflow just automates the same npx vsce steps); local packaging is a supported dry-run of the release. |
| @vscode/vsce is not installed as a dependency. | Both the workflow and local packaging invoke it via `npx @vscode/vsce@<pinned version>` — no repo devDependency is added; the pinned version keeps packaging reproducible. |
| @types/vscode is not installed. | Typecheck still passes: the esbuild bundle marks 'vscode' external and the compile-only src/vscode.d.ts shim supplies the used API surface, so @types/vscode is unnecessary; the build does not depend on it. |
| The package version is unchanged from the last published version. | vsce publish rejects a duplicate version; the maintainer bumps package.json version before re-triggering (the workflow does not auto-bump — versioning stays a deliberate maintainer act). |
| The extension is installed from the .vsix and later uninstalled. | VS Code runs the packaged scripts['vscode:uninstall'] = 'node ./out/uninstall.js' (now emitted by the bundle), which sweeps the hosts via S005's unwireAllHosts — the end-to-end ac3 the resolved open question deferred to s6, now closed by the emit. |

### Invariants to preserve

- The extension bundle contains ONLY the thin shared ipc-client boundary (node:net + pure IPC types + the socket path) inlined — no daemon internals, indexer, or storage, and the .vsix excludes the raw repo src (k5). [[c1]]
- No secret is stored in-repo: the Marketplace PAT lives only as a GitHub Actions secret (VSCE_PAT), and the extension opens no cloud path (k2). [[c4]]
- Publishing is manual-only (workflow_dispatch), targets the VS Code Marketplace only (no Open VSX / ovsx / manual-VSIX channel), and never runs automatically on push — mirroring the shipped jetbrains-plugin.yml precedent (k7/lc1/lc2). [[c1]]
- The S001-S005 runtime behavior is unchanged: s6 only adds build/emit + manifest + packaging + publish scaffolding; the contributes.commands, engines.vscode, activationEvents, and the extension's activation/onboarding/uninstall logic are preserved (s6 owns no runtime contract). [[c1]]

## Test strategy

**Test framework:** `node:test (tsx --test) — the same runner S001-S005 use for vscode-plugin/; s6's tests are manifest/config/source-scan assertions over the packaged files (package.json manifest, .vscodeignore, the workflow yaml) + a real esbuild bundle smoke that runs the bundle then requires the emitted CJS out/extension.js with a fake vscode + out/uninstall.js under node, verifying no daemon-internal import leaked.`

### Test levels

- **unit** — Prove the Marketplace manifest carries every field vsce requires for a single installable package (ac1).
  - Subjects: `package.json has publisher, repository, license, icon, keywords, categories, engines.vscode, main, activationEvents + the 7 contributes.commands (unchanged from S001-S005)`, `package.json no longer sets private:true (so vsce can package/publish)`, `package.json scripts include bundle (esbuild) + package (vsce) + the vscode:prepublish (typecheck+bundle) + the preserved vscode:uninstall = 'node ./out/uninstall.js'`
  - Fixtures: `read of vscode-plugin/package.json`, `the shipped icon.png + README.md + LICENSE present in vscode-plugin/`
- **unit** — Prove the .vsix content boundary excludes source/tests/daemon-internals and the publish workflow is manual-only (k5/k7/lc1/lc2).
  - Subjects: `.vscodeignore excludes src/, **/__tests__/**, *.test.ts, tsconfig.json, .github, and the raw repo src — but does NOT exclude assets/ or out/`, `.github/workflows/vscode-plugin.yml declares ONLY `on: workflow_dispatch` (no push/pull_request/schedule) and runs NO test job`, `the workflow publishes via npx @vscode/vsce (pinned) to the VS Code Marketplace ONLY — no ovsx/Open VSX step (lc1); the PAT is read from secrets.VSCE_PAT, never inlined (k2)`
  - Fixtures: `read of vscode-plugin/.vscodeignore`, `read of .github/workflows/vscode-plugin.yml`, `read of the shipped .github/workflows/jetbrains-plugin.yml (the mirrored precedent)`
- **smoke** — Prove the esbuild bundle actually emits a loadable, self-contained CJS extension + uninstall entry with NO daemon internals inlined (ac1 + k5 + the deferred ac3 emit).
  - Subjects: `running the bundle produces out/extension.js + out/uninstall.js as CommonJS (module.exports), with 'vscode' left as an external require (not bundled)`, `requiring out/extension.js with a fake `vscode` module resolves + exposes activate/deactivate (the cross-package ../../src/shared/ipc-client is inlined — no unresolved ../../src import)`, `out/uninstall.js runs under node without a real fs sweep of $HOME (the argv[1] main-check + a temp HOME) and exposes runUninstall`, `the bundled out/*.js contain NO reference to daemon internals/indexer/storage modules (only the inlined ipc-client + node builtins) — k5`
  - Fixtures: `esbuild (already available)`, `a fake `vscode` stub module for the require smoke`, `a temp HOME for the uninstall smoke`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `package.json carries publisher/repository/license/icon/keywords/categories + is not private (manifest unit test) — proves the metadata required to publish a single package`, `the esbuild bundle emits a loadable self-contained CJS out/extension.js (+ out/uninstall.js) with the cross-package client inlined and vscode external (bundle smoke) — proves 'a single installable package' actually builds + activates`, `.vscodeignore ships only package.json + out/ + assets/ + README + icon + LICENSE and excludes src/tests/daemon-internals (content unit test) — proves the .vsix is the minimal single package (k5)` |
| `ac2` | `.github/workflows/vscode-plugin.yml declares ONLY on: workflow_dispatch (no push/pull_request/schedule) and runs no test job (workflow source-scan) — proves manual-only, never per-push (k7/lc2)`, `the workflow publishes via vsce to the VS Code Marketplace ONLY with no ovsx step + reads the PAT from secrets.VSCE_PAT (workflow source-scan) — proves Marketplace-only (lc1) + no in-repo secret (k2)` |

## Alternatives considered

### a1: esbuild bundle (vscode external, CJS) + full manifest + .vscodeignore + a workflow_dispatch-only vsce publish — **CHOSEN**

Add an esbuild bundle step that inlines the cross-package shared client into out/extension.js + out/uninstall.js (vscode external, CJS), complete the Marketplace manifest + README + icon + .vscodeignore, and ship a NEW manual workflow_dispatch GitHub workflow that npx-vsce packages + publishes to the Marketplace only.



### a2: Plain tsc emit (no bundler) + vsce packages the whole package incl. the sibling src

Flip tsc to emit into out/ and let vsce package the vscode-plugin dir, relying on the relative ../../src import resolving from the packaged tree.



**Rejected because:** Fails ac1 (broken package: a tsc-only emit leaves the cross-package '../../src/shared/ipc-client.js' import dangling in a vscode-plugin-rooted .vsix, so the extension fails to load) and violates k5 (the only workaround ships the repo src, leaking daemon internals into the extension bundle).

### a3: esbuild bundle + publish to BOTH the VS Code Marketplace and Open VSX

Same esbuild bundle + manifest, but the publish workflow pushes to the Marketplace AND Open VSX (ovsx) for wider reach.



**Rejected because:** Violates k7/lc1 ('v1 targets the VS Code Marketplace only; Open VSX and manual-VSIX distribution are out of scope') by adding the Open VSX channel that v1 explicitly excludes, plus a second PAT/token to manage for zero v1 value.

## Citations

- **[[c1]]** `stakeholder` `Epic ad0d45c9d690f8c1 constraints k1/k5/k7 + Story s6 lc1/lc2 (Marketplace-only, manual workflow_dispatch, thin bundle boundary)` — "v1 targets the VS Code Marketplace only; Open VSX and manual-VSIX distribution are out of scope. Publishing is a manually-triggered action, not a per-push CI job."
- **[[c2]]** `analyze-bundle` `s1 gap.locate — vscode-plugin/package.json + tsconfig.json current state (private:true, noEmit:true, 7 contributes.commands, missing publisher/repository/license/icon/keywords/README/emit)` — "tsconfig sets noEmit:true — so `build` TYPECHECKS but emits NOTHING; there is no out/ dir. For the Marketplace it is MISSING: publisher, repository, license/LICENSE, icon, keywords, a README.md listin"
- **[[c3]]** `analyze-bundle` `s1 reuse.map — extension.ts:14 imports ../../src/shared/ipc-client.js (cross-package); esbuild available, vscode external, CJS bundle` — "extension.ts:14 imports '../../src/shared/ipc-client.js' — a file OUTSIDE vscode-plugin/ ... so the bundle must be BUNDLED. esbuild is already available ... The bundle must mark 'vscode' as EXTERNAL."
- **[[c4]]** `convention` `s1 convention.detect — .github/workflows/jetbrains-plugin.yml is the shipped workflow_dispatch-only manual-publish precedent; k2 no in-repo secret` — ".github/workflows/jetbrains-plugin.yml is the shipped MANUAL-only precedent: `on: workflow_dispatch` ... never per-push."
- **[[c5]]** `convention` `s1 convention.detect — .vsix content boundary via .vscodeignore ships only runtime bits + assets; sync-assets already wired into build` — "A .vsix must ship ONLY the runtime bits ... and EXCLUDE src/, __tests__, tsconfig, the raw cross-package src/. VS Code's vsce uses a .vscodeignore file for this exclusion."
- **[[c6]]** `step-output` `s3 judgments — a1 satisfies ac1/ac2/k1/k2/k5/k7 (winner); a2 violates ac1+k5; a3 violates k7/lc1` — "a1 is the only alternative that scores 'satisfies' on BOTH acceptance criteria AND every applicable Epic constraint (k1/k2/k5/k7)."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 1 LOW** · model `client` · reviewed 2026-09-22T07:29:01.567Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl7 | external-contract | LOW | assisted | esbuild is already available in the repo (a dependency), so the bundle step needs no new bundler dependency. | `require.resolve('esbuild')` succeeds (node_modules/esbuild/lib/main.js present), so the LLD's factual claim 'esbuild is already available' is accurate. BUT esbuild appears in NO package.json dependencies/devDependencies (root or vscode-plugin) — only in package-lock.json. It is a TRANSITIVE dep, so the bundle step rests on a dependency that a future `npm install`/dep-bump could drop. | In the plan/build, add esbuild as an explicit devDependency (root or vscode-plugin) so the bundle step does not silently rely on a transitive dependency. The LLD wording is fine; this is a build-time robustness note, not an artifact defect. |
