<!-- insrc:artifact PLAN-ad0d45c9d690f8c1-s6 -->

# Plan: E20260922ad0d45c9:S006

**Epic:** `build-insrc-vs-code-extension-v1`
**LLD run:** `wf-1790061504265-ietm72`
**LLD effective hash:** `1e2038ef7232...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** esbuild bundle step + explicit esbuild devDependency | M | — | smoke: bundle-smoke: npm run bundle emits out/extension.js + out/uninstall.js as CJS with 'vscode' left external; smoke: bundle-smoke: out/extension.js requires with a fake vscode + exposes activate/deactivate (ipc-client inlined, no ../../src); smoke: bundle-smoke: out/*.js contain no daemon-internal/indexer/storage reference (k5); unit: manifest: esbuild is a declared devDependency in vscode-plugin/package.json | [[c2]] [[c3]] |
| 2 | **`t2`** Complete the Marketplace manifest in package.json | S | `t1` | unit: manifest: package.json has publisher/repository/license/icon/keywords/categories/engines.vscode/main/activationEvents + the 7 contributes.commands unchanged; unit: manifest: package.json no longer sets private:true; unit: manifest: scripts include bundle + package (vsce) + vscode:prepublish (tsc --noEmit && bundle) + preserved vscode:uninstall = 'node ./out/uninstall.js' | [[c1]] [[c2]] |
| 3 | **`t3`** Marketplace listing assets: README.md + icon.png + LICENSE | S | `t2` | unit: listing-assets: README.md + icon.png + LICENSE exist and package.json.icon resolves to the shipped icon.png | [[c1]] |
| 4 | **`t4`** .vscodeignore — the .vsix content boundary | S | `t1`, `t3` | unit: vscodeignore: excludes src/ + **/__tests__/** + *.test.ts + tsconfig.json + .github + raw repo src, but keeps assets/ and out/ | [[c1]] [[c2]] |
| 5 | **`t5`** Manual publish workflow .github/workflows/vscode-plugin.yml | M | `t2` | unit: workflow-scan: vscode-plugin.yml has ONLY on: workflow_dispatch (no push/pull_request/schedule) and no test job; unit: workflow-scan: publishes via vsce to the Marketplace only (no ovsx) + reads secrets.VSCE_PAT, never inlined | [[c1]] [[c4]] |
| 6 | **`t6`** Packaging tests — manifest + boundary + workflow + bundle smoke | M | `t1`, `t2`, `t4`, `t5` | unit: packaging: the manifest + vscodeignore + workflow-scan unit tests assemble under vscode-plugin/src/__tests__/; smoke: packaging: the esbuild bundle smoke (require out/extension.js w/ fake vscode + run out/uninstall.js under mkdtemp HOME) is authored + green; unit: packaging: the full vscode-plugin/ `npm test` sweep passes locally | [[c5]] |

### E20260922ad0d45c9:S006:T001 — esbuild bundle step + explicit esbuild devDependency

Add an esbuild bundle (esbuild.mjs or npm script) that bundles src/extension.ts + src/uninstall.ts → out/extension.js + out/uninstall.js with --bundle --platform=node --format=cjs --external:vscode --outdir=out, inlining the cross-package ../../src/shared/ipc-client.js. Add esbuild as an explicit devDependency in vscode-plugin/package.json (review LOW: do not rest on the transitive) and wire the `bundle` script. tsc --noEmit stays the typecheck gate.

**Acceptance checks:**
- `npm run bundle` in vscode-plugin/ produces out/extension.js + out/uninstall.js as CommonJS (module.exports present), with 'vscode' left as an external require (not inlined)
- out/extension.js contains the inlined ipc-client (no unresolved ../../src import) and NO daemon internals/indexer/storage references (k5)
- esbuild is listed in vscode-plugin/package.json devDependencies (not relied on transitively)

### E20260922ad0d45c9:S006:T002 — Complete the Marketplace manifest in package.json

Add publisher, repository, license, icon ('icon.png'), keywords, and a real categories set to vscode-plugin/package.json; remove private:true; add scripts { bundle, package ('npx @vscode/vsce package'), vscode:prepublish ('tsc --noEmit && npm run bundle' — the ordered typecheck-then-bundle gate so a broken typecheck/bundle never packages) }. Preserve unchanged the name/displayName/description/version/engines.vscode/activationEvents/main/the 7 contributes.commands/sync-assets/build/test/vscode:uninstall. Publisher id is a maintainer-supplied placeholder called out in the README, not invented.

**Acceptance checks:**
- package.json carries publisher, repository, license, icon, keywords, categories, engines.vscode, main, activationEvents + the 7 insrc.* contributes.commands unchanged
- package.json no longer sets private:true
- scripts include bundle + package + vscode:prepublish = 'tsc --noEmit && npm run bundle' + the preserved vscode:uninstall = 'node ./out/uninstall.js'

### E20260922ad0d45c9:S006:T003 — Marketplace listing assets: README.md + icon.png + LICENSE

Add vscode-plugin/README.md (the Marketplace listing page: what insrc is, install, the durable commands, and the maintainer publish note incl. setting the publisher id + VSCE_PAT), a 128x128 icon.png, and a LICENSE (reusing the repo license). These are the human-facing listing content the manifest references.

**Acceptance checks:**
- vscode-plugin/README.md, icon.png, and LICENSE all exist
- README documents the manual-publish flow (set publisher + VSCE_PAT, workflow_dispatch) and the durable commands
- package.json's icon field resolves to the shipped icon.png

### E20260922ad0d45c9:S006:T004 — .vscodeignore — the .vsix content boundary

Add vscode-plugin/.vscodeignore that EXCLUDES src/, **/__tests__/**, *.test.ts, tsconfig.json, .github, esbuild config, and the raw repo src, while KEEPING package.json + out/ + assets/ (the bundled installer + steering-block.md) + README.md + icon.png + LICENSE. Keeps daemon internals out of the package (k5) and the .vsix minimal.

**Acceptance checks:**
- .vscodeignore excludes src/, **/__tests__/**, *.test.ts, tsconfig.json, .github, and the raw repo src
- .vscodeignore does NOT exclude assets/ or out/
- a `npx @vscode/vsce ls` dry-run (or an equivalent content assertion) shows only package.json + out/ + assets/ + README + icon + LICENSE

### E20260922ad0d45c9:S006:T005 — Manual publish workflow .github/workflows/vscode-plugin.yml

Add a NEW GitHub workflow mirroring jetbrains-plugin.yml: `on: workflow_dispatch: {}` ONLY (no push/pull_request/schedule), permissions contents:read, working-directory vscode-plugin, steps = checkout + setup-node + npm ci + npm run bundle + `npx @vscode/vsce@<pinned> package` then `npx @vscode/vsce@<pinned> publish` to the VS Code Marketplace ONLY (no ovsx) gated on secrets.VSCE_PAT. No test job (repo convention avoids CI minutes).

**Acceptance checks:**
- .github/workflows/vscode-plugin.yml declares ONLY on: workflow_dispatch (no push/pull_request/schedule) and runs no test job
- it publishes via npx @vscode/vsce (pinned) to the VS Code Marketplace only — no ovsx/Open VSX step — and reads the PAT from secrets.VSCE_PAT (never inlined)
- it mirrors jetbrains-plugin.yml's manual-only shape (permissions contents:read, working-directory vscode-plugin)

### E20260922ad0d45c9:S006:T006 — Packaging tests — manifest + boundary + workflow + bundle smoke

Add node:test (tsx --test) tests under vscode-plugin/src/__tests__/: a manifest unit test (fields present + not private + scripts incl. vscode:prepublish chain), a .vscodeignore + workflow source-scan unit test (excludes src/tests, keeps assets/out; workflow_dispatch-only, Marketplace-only, VSCE_PAT), and an esbuild bundle smoke (run bundle into a tmp out/, require out/extension.js with a fake vscode exposing activate/deactivate, run out/uninstall.js under a temp HOME pinned via mkdtemp + restored in finally, assert no daemon-internal import in out/*.js). The uninstall smoke never touches the developer's real $HOME (mirrors the existing uninstall.test.ts HOME-pinning pattern).

**Acceptance checks:**
- a manifest unit test asserts publisher/repository/license/icon/keywords/categories present + private removed + bundle/package/prepublish/uninstall scripts
- a source-scan unit test asserts .vscodeignore boundary + workflow_dispatch-only + Marketplace-only + secrets.VSCE_PAT
- a bundle smoke test proves out/extension.js requires with a fake vscode + exposes activate/deactivate, out/uninstall.js runs under node with a mkdtemp HOME restored in finally, and no daemon-internal reference leaked into out/*.js (k5)
- the full vscode-plugin/ test sweep (`npm test`) passes locally

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| package.json has publisher, repository, license, icon, keywords, categories, engines.vscode, main, activationEvents + the 7 contributes.commands (unchanged from S001-S005) | `t2`, `t6` |
| package.json no longer sets private:true (so vsce can package/publish) | `t2`, `t6` |
| package.json scripts include bundle (esbuild) + package (vsce) + the vscode:prepublish (typecheck+bundle) + the preserved vscode:uninstall = 'node ./out/uninstall.js' | `t2`, `t6` |
| .vscodeignore excludes src/, **/__tests__/**, *.test.ts, tsconfig.json, .github, and the raw repo src — but does NOT exclude assets/ or out/ | `t4`, `t6` |
| .github/workflows/vscode-plugin.yml declares ONLY `on: workflow_dispatch` (no push/pull_request/schedule) and runs NO test job | `t5`, `t6` |
| the workflow publishes via npx @vscode/vsce (pinned) to the VS Code Marketplace ONLY — no ovsx/Open VSX step (lc1); the PAT is read from secrets.VSCE_PAT, never inlined (k2) | `t5`, `t6` |
| running the bundle produces out/extension.js + out/uninstall.js as CommonJS (module.exports), with 'vscode' left as an external require (not bundled) | `t1`, `t6` |
| requiring out/extension.js with a fake `vscode` module resolves + exposes activate/deactivate (the cross-package ../../src/shared/ipc-client is inlined — no unresolved ../../src import) | `t1`, `t6` |
| out/uninstall.js runs under node without a real fs sweep of $HOME (the argv[1] main-check + a temp HOME) and exposes runUninstall | `t1`, `t6` |
| the bundled out/*.js contain NO reference to daemon internals/indexer/storage modules (only the inlined ipc-client + node builtins) — k5 | `t1`, `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s6 — Marketplace manifest completion + listing assets + workflow_dispatch publish (contractDetails: package.json manifest, listing assets, vscode-plugin.yml; invariants k2/k7/lc1/lc2)` — "package.json += { publisher, repository, license, icon, keywords, categories } ; private removed ; scripts += { bundle, package, vscode:prepublish }"
- **[[c2]]** `analyze-bundle` `s1 manifest.current-state — vscode-plugin/package.json (private:true, noEmit:true, 7 contributes.commands, main/uninstall point at out/ nothing emits)` — "tsconfig has noEmit:true (build TYPECHECKS but emits nothing — out/ never produced) ... main + the vscode:uninstall script both point at ./out/*.js that nothing produces yet"
- **[[c3]]** `analyze-bundle` `s1 reuse.bundle-boundary — extension.ts imports ../../src/shared/ipc-client.js; esbuild resolvable but transitive; vscode external + vscode.d.ts shim` — "extension.ts imports the cross-package '../../src/shared/ipc-client.js' ... which a vscode-plugin-rooted .vsix cannot resolve unless bundled ... esbuild ... is a TRANSITIVE dep"
- **[[c4]]** `convention` `s1 convention.publish-precedent — .github/workflows/jetbrains-plugin.yml is the shipped workflow_dispatch-only manual-publish precedent (permissions contents:read, working-directory)` — ".github/workflows/jetbrains-plugin.yml is the shipped MANUAL-ONLY precedent: `on: workflow_dispatch: {}`, `permissions: contents: read`, a single ubuntu build job with `working-directory`"
- **[[c5]]** `prior-artifact` `LLD s6 — testStrategy (node:test tsx --test manifest/config source-scans + esbuild bundle smoke over out/extension.js + out/uninstall.js)` — "s6's tests are manifest/config/source-scan assertions over the packaged files ... + a real esbuild bundle smoke that runs the bundle then requires the emitted CJS out/extension.js with a fake vscode +"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-22T07:42:21.244Z

_No load-bearing premises were extracted._
