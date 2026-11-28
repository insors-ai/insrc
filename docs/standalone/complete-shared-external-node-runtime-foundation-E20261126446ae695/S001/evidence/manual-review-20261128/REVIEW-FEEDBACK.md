# Manual code review: runtime-foundation (BUILD-446ae69566d352dd-s1 revision21)

- **Change:** ISSUE-446ae69566d352dd, *Complete the shared external Node runtime foundation* (LLD5 / PLAN3)
- **Range:** base `1c95135be199` → head `4ec83d006f7b`. That is 45 commits; the primary scope has 186 paths, and src/scripts change by about 5.3k lines added and 0.9k removed.
- **Reviewer:** Claude Code (controller session), 2026-11-28
- **How it was reviewed:**
  - I read the core resolver, acquisition and publication code myself: `runtime-policy`, `runtime-metadata`, `runtime-store`, `runtime-acquire`, `runtime-archive`, `runtime-binding`, `runtime-install`, the `controller-store` additions, `manager-entry` and `installed-receipt`.
  - Three parallel read-only passes covered the consumer paths. Each traced the callers of every changed or removed export across `src/`, `scripts/`, `vscode-plugin/` and `jetbrains-plugin/`:
    1. bootstrap, terminal and launcher;
    2. bundle, publisher and payload;
    3. dev, manager, production peers and Ollama.
  - I re-checked each MED finding below against the source at the head commit. LOW findings marked † were reported by a consumer pass and spot-checked only.
  - This file is new. No packet file was changed, so `SHA256SUMS` still holds.
- **Not done:** no tests, builds or VM runs; no daemon actions; nothing approved.

## Verdict

**Changes requested. No HIGH findings.** The core integrity design is sound (see "Checked and found sound"). However:
- **Findings 1–3** are real defects in the POSIX bootstrap script. The first makes a valid installation home uninstallable. The second leaks a stage on every Ctrl-C and prints a false warning.
- **Findings 4–6** need either a fix or an explicit design decision recorded in the LLD. Each is a behaviour or guarantee the LLD states that the code does not fully deliver.

## Findings

| # | Severity | Location (head) | Finding and failure scenario | Proposed correction |
|---|---|---|---|---|
| 1 | MED | `scripts/install.sh:27`, `src/installer/bootstrap-foundation.ts:25` | **A trailing or doubled `/` in `--home` makes bootstrap fail.** The shell only rejects a *leading* `//`. So `--home /Users/x/.insrc/` (tab completion adds the slash) or `/Users//x/.insrc` gets through. The shell then builds `stage=$home/install/bootstrap-stage.X` = `/Users/x/.insrc//install/…`. The helper compares `dirname(work)`, which keeps the `//` (I checked: Node prints `/Users/x/.insrc//install`), against `join(normalizeHome(home),'install')`, which is `/Users/x/.insrc/install`. They never match. The helper throws `path-invalid` and the user sees `bootstrap publication failed` for a valid home. | Normalize in the shell: strip trailing slashes and collapse repeated `/` before using `$home`. Or compare `posix.normalize(dirname(work))` in the helper. Add a test with trailing-slash and doubled-slash homes. |
| 2 | MED | `scripts/install.sh:34-41`, `:80-85` | **A signal during publication always retains the stage, and the warning is false.** `sh` delays running the `INT`/`TERM`/`HUP` traps until the foreground helper exits. The trap's `exit` then runs `cleanup` before `then helper_active=0` has executed. So `cleanup` sees `helper_active=1`, prints "publication child exit unconfirmed; retained …" even though the exit *was* observed, and leaves the stage behind (the runtime archive of about 50 MB plus the extracted node). The consumer pass confirmed this ordering with a scratch script. Nothing in `src/` or `scripts/` ever removes `install/bootstrap-stage.*`, so one stage accumulates per Ctrl-C. | Have the traps only record the signal (`trap 'sig=130' INT` and so on). Clear `helper_active` right after the `if` returns, then `exit "$sig"` when a signal was recorded. Test it with a real signal sent to the shell, not only to the helper (see T2). |
| 3 | MED | `scripts/install.sh:88-92` | **On the fresh path, the shell runs the canonical node and control files without hashing them first.** This deviates from LLD 3.4: "Before using any Node executable, script hashes it against the release-owned nodeSha256". On a fresh install the shell hashes only `$stage/execution/…/bin/node` and `$stage/control/*`. After the helper publishes, it runs `exec "$canonical_node" "$control/bootstrap.mjs"`, and neither file has had an OS-level hash check. The helper's verification under the lock narrows the gap, but the script contract in the LLD is not met. | Run `verify "$canonical_node" "$node_sha"` and `verify` on both `$control/bootstrap.mjs` and `$control/native/control.node` immediately before `exec`. Apply the same fix to `install.ps1`. |
| 4 | MED | `src/installer/bundle-delivery.ts:26-28`; `openPreparedBundle` in `bundle.ts`; `installed-control.ts:19-37`; callers at `manager.ts:214`, `:529`, `:566-573` | **Verification before recovery and activation no longer re-hashes the application payload.** At base, `openPreparedBundle` called `verifyPublishedPayload` (base `bundle.ts:115`), which re-hashed every inventory file. Now `open` and `verify` call `resolveInstalledControl`, which checks only the receipt, the inventory digest and the bounded control entries. `DeliveryPort.verify` backs the manager's `#verify`, and that runs before migration and before activation, including on the crash-recovery branch (`:529`), which never calls `prepareBundle` again. Scenario: the process crashes after preparation, then a non-control file under `releases/<id>/` (an `out/**` module or a `.node` addon) is truncated. Recovery now activates the release, where base failed with `archive-unsafe`. The ISSUE's "avoid repeated full payload hashing" and LLD §6 support skipping the re-hash for *status/readiness*, not for the check before activation or recovery. | Keep the bounded check for launch and status. Run `verifyPublishedPayload` again on the recovery and pre-activation path; once per operation is enough. Alternatively, record in the LLD that recovery and activation trust the payload published at preparation time. |
| 5 | MED | `runtime-install.ts:20-23`; `runtime-store.ts:68`; `runtime-archive.ts:70,82`; `dev-toolchain.ts:64-70` | **The shared runtime is only verified, never protected, and once it is corrupted nothing in the product can repair it.** Published files are 0644/0755 inside 0700 directories, so they stay owner-writable. `dev` builds run `npm ci --ignore-scripts=false` with `npm_config_nodedir` and the npm/node-gyp tree pointing into the store. Fix c4ab5088 only sets `PYTHONDONTWRITEBYTECODE`; any lifecycle script that rebuilds its environment, or writes next to npm or the headers, still adds files to the store. The next `privateRuntimePaths` call then fails its exact-tree check. That entry is shared by every bundle and dev release, so the installed manager, TUI, Retry, the Ollama worker and terminal start all fail with `runtime-invalid`. `ensurePrivateRuntime` deliberately refuses to download again over an existing entry, so the user has no supported recovery. LLD 4.2 says "Entries are immutable". | Make the published distribution read-only: 0555 directories and 0444/0555 files, with modes in the pinned profile. Or build against a copied nodedir. Also provide an explicit recovery path owned by the controller: quarantine the corrupt entry, never delete it by inference, and acquire it again. At minimum, record the risk and the operator recovery in the LLD. |
| 6 | MED (design claim) | `application-payload.ts:7-8`; `distribution-artifacts.ts:9-13`; `scripts/package-installer.mjs:90-112,190` | **The publisher's distribution exclusion is a list of blocked names and hashes, not provenance.** What it actually checks:<br>• the contribution's realpath must be under the repo root and outside two excluded inputs;<br>• the inventory path must not match `^(tools/(node\|ollama)\|runtime\|ollama)/` or a basename of `node`/`ollama`;<br>• the content hash must not equal a pinned archive, executable, header or `node.lib` hash (Ollama: one tarball only).<br>A renamed node or Ollama binary of any other build, a re-compressed archive, the npm subtree, individual header files, or extracted Ollama libraries inside `out/` or the production dependencies would all pass. LLD 4.4 and the §6 contamination row claim more than this. | Add the runtime profile's per-file hashes and the extracted Ollama `requiredFiles` hashes to the denylist. Better, add a positive allowlist of which `out/` subtrees and production packages may contain executables. Narrow the LLD wording to what the check actually does. |
| 7 | LOW-MED | `src/installer/terminal-entry.ts:39-47` | **The `--ollama-service-worker` branch lost its runtime check.** Base called `controlRuntimeDirectory(target)`; the replacement does not call `resolveControlRuntime` or `assertRuntimeBinding`. The worker puts `dirname(process.execPath)` on the service PATH (`ollama-service-worker.ts:59`). The production spawner does pass the verified `runtime.node` (`ollama-service.ts:115-119`), so this is defence in depth. It still contradicts LLD 4.5's process-binding rule. | Call `resolveControlRuntime(location, privateRuntimeIdentity(target))` before doing control work in that branch. |
| 8 | LOW | `runtime-metadata.ts:13-14`, `download.ts:9,45-48`, `qualification-time-budgets.mjs:3-7` | **Production deadlines depend on a test environment variable.** `RUNTIME_LIMITS.networkMs`/`verificationMs` and the payload download deadline read `INSRC_QUALIFICATION_PROFILE` when the module is imported. A stray `slow-vm` silently quadruples them, to 40 minutes for acquisition and 8 for verification. Any other value throws a plain `Error`, with no `InstallerError` code, when the manager, terminal or resolver modules load. The LLD says the 600 s and 120 s budgets are fixed. The cause is shared with the approved budget story; the coupling is introduced by the foundation. | Use fixed production constants. Or read the profile only in qualification and harness entry points, ignoring the variable without throwing elsewhere. |
| 9 | LOW | `runtime-store.ts:135-160`, its callers, `ollama-service.ts:114-115` | **The full runtime tree is hashed many times.** Every resolution re-hashes the whole distribution: the node binary (on the order of 100 MB) plus 4,972 profile files. One dev install or upgrade does this about 10 times (toolchain, predecessor, worker, assemble, final stage ×2, open, manager `#verify` ×2), and every manager CLI process does it once. In `ollama-service`, it happens after admission is written and inside the 30 s readiness window, and the supervisor hashes the tree again. On a slow disk that can turn a healthy start into `unverified`, and a corrupt runtime becomes an admitted attempt marked `not-started` instead of being refused up front. | Pass the `ResolvedPrivateRuntime` along within a process, as LLD 3.2 allows. In `ollama-service`, resolve before writing the frame and admission. |
| 10 | LOW † | `src/installer/installed-launcher.ts:100` | **Checking the old launcher now requires the previous release to resolve completely.** If that release is legacy format 1, or its runtime is missing or corrupt, the check reports `launcher-conflict` "not owned by this installation". Publishing the launcher then fails as `post-install-tui-error` after an otherwise successful install, and again on every later install. | Emit a distinct legacy or unresolvable-predecessor diagnostic. |
| 11 | LOW | `controller-store.ts:209-212`, `runtime-install.ts:17-18,26-27` | **Two error paths are misreported.** If `flushParents` or `flushDirectory` throws after `publishDirectory`, the error is not `resource-close-uncertain`. The runtime is published, but its `runtime-stage-*` work directory is never cleaned up and the install reports failure. Separately, `lstat` errors other than ENOENT, such as EACCES, escape `ensurePrivateRuntime` as a raw error with no `InstallerError` code. | Classify failures after publication separately, and keep or clean the stage accordingly. Wrap non-ENOENT `lstat` errors as `runtime-invalid` or `permissions-invalid`. |
| 12 | LOW † | `runtime-policy.ts:19-38`, `runtime-acquire.ts:89`, `render-installer-bootstrap.mjs:13`, `package-installer.mjs:170-198`, `native-qualification.ts:10-17` | **Windows is deferred only by procedure.** Every layer accepts win32 targets. The only gate is a self-declared qualification-evidence object in the publisher configuration. | Add an explicit target allowlist that excludes win32 until ISSUE-cab5701fbefab736 closes. |
| 13 | LOW | `release-descriptor.ts:42`, `dev.ts:79-100` | **The legacy-format errors have no distinct code.** Format 1 is rejected correctly, but with the generic `manifest-invalid` / `source-incompatible`. LLD §6 and §3.3 specify a "legacy-runtime-format" diagnosis, and callers can only tell it apart by message text. | Add a dedicated error code. Otherwise, align the LLD wording with the codes actually used. |
| 14 | LOW † | `scripts/render-installer-bootstrap.mjs:18` | **The baseline has a silent fallback.** `asset.target?.baseline ?? 'native-v1'`: a caller that omits `target` renders a runtime path that does not exist, and the script then runs it. Production always passes `target`. | Make `target` required. |
| 15 | LOW † | `.github/workflows/ci.yml:65-68` | **The workflow gains an expensive Windows job for a deferred target.** It is a manual-dispatch `windows-2025` job with a 240/360-minute limit; at the 2x Windows rate, one dispatch can cost about 12 billable hours. Only a comment discourages running it. The existing build-and-test checks are not weakened. | Remove the job until Windows is in scope, or add an input that must be set before it runs. |
| 16 | LOW † | `scripts/installer-payload.mjs:52-65` | **The publisher collector reads files late.** Files are read only after the whole traversal, and files with a single link are read by path without checking their identity again. The window for a symlink swap is wider than at base. This is a tool run on a developer's machine. | Read each file with the identity check from the traversal, as hardlinked files already are. |
| 17 | LOW | `install.sh:57,66,92` | **Residual race (record only).** The hash and the exec both go through the path, and `verify` checks only the final path component for a symlink. Exploiting it needs another process running as the same user. | Accept it and record it. Finding 3 narrows the gap. |

### Test findings

| # | Severity | Location | Finding | Correction |
|---|---|---|---|---|
| T1 | MED | `__tests__/runtime-store.test.ts:75-108` | The 20+ rejection cases call `assert.rejects(…)` **without an error matcher**, and they mutate one shared fixture in sequence. There is **no successful resolution between mutations or at the end**. If a restore step leaves the fixture broken, every later case passes without testing anything, and a case can also pass for the wrong reason. | Assert the expected message or code for each case, and resolve successfully before each mutation (or use a fresh fixture per case). |
| T2 | MED † | `__tests__/bootstrap.test.ts:28-42`, `:134-138` | No test runs the real `terminalMain --bootstrap-publication` branch (`terminal-entry.ts:25-38`: SIGINT wiring, exit codes); the tests substitute a fixture `terminalMain`. The "cancellation closes its publication child before cleanup" case fires `process.emit('SIGINT')` inside the child, so the shell traps are never involved and finding 2 is invisible. It also never asserts the state of the stage directories, and its 20 ms timer may fire before publication starts. | Run the rendered script with a real signal sent to the shell's process group, then assert the stage was removed and the exit code. |
| T3 | LOW † | `__tests__/publisher.test.ts:82-83,91`; `scripts/qualify-runtime-foundation.mjs:77` | Three checks cannot fail:<br>• The renamed-input case puts its input in `downloads/`, which collection never visits, so its assertion cannot fail.<br>• `collectProductionPayload(root, root)` still uses the old signature and passes only because an earlier check throws first.<br>• The qualification script's "publication stage must not contain running Node" compares against the orchestrator's `execPath`, which can never be inside a fresh home. | Put the excluded input inside `out/`, update the stale call, and compare against the helper's actual staged executable. |
| T4 | LOW † | `bootstrap.test.ts:88`, `terminal-install.test.ts:257,265`, `dev-toolchain.test.ts` corrupt cases | Several assertions accept too much:<br>• Five failure modes share one alternation regex.<br>• One `assert.rejects` has no matcher.<br>• One branch is dead code.<br>• The dev-toolchain corrupt cases accept a broad regex. | Check each case's own diagnostic. |
| T5 | LOW † | `bootstrap.test.ts` | No test tampers with *cached* control assets; only the fresh download is corrupted. | Add a case that tampers with a cached `bootstrap.mjs` and `control.node`. |
| T6 | LOW † | `bundle.test.ts:51-52` | Setup falls back to the real `httpsDownloadTransport`, which makes network calls, for any URL other than the archive. | Make the fixture transport fail closed for unknown URLs. |

## Impact analysis

**Changed or removed exports.** All production callers are updated.
- `privateRuntimePaths` changed from a synchronous path constructor to an async verified resolver. Its callers: `installed-receipt.ts:49`, `dev-payload.ts:94`, `dev-toolchain.ts:36`, `dev-worker.ts:310`, `ollama-service.ts:115`, `runtime-install.ts`, `runtime-binding.ts`, `scripts/package-installer.mjs:148` and `scripts/qualify-runtime-foundation.mjs`.
- `controlRuntimeDirectory` is removed and has no callers left.
- `productionPeers(target, location, runtime)` has its three callers updated.
- `retryCommand` and `publishInstalledLauncher` are now async, and every caller awaits them.
- These signatures changed, and every caller is updated:
  - `verifyDevPayload(dir, target, location)`
  - `createDevPreparationWork(…, {predecessor})`
  - `openPreparedDev` (three arguments)
  - `collectProductionPayload` (no `runtimeDirectory`)
- The only stale call is the test call in T3.
- There are no production references left to `tools/node`, `verifyPayloadRuntime`, `extractOfficialRuntime` or `dev-v1` (other than the rejection itself).

**Consumers of the resolver.**
- manager-entry: `resolveInstalledControl` then `assertRuntimeBinding`, which requires `realpath(execPath) === runtime.node` and the exact `process.version`.
- terminal-entry install and `--launch-tui`: `resolveControlRuntime`.
- TUI and Retry launch with `runtime.node`.
- Dev worker: launched with the candidate's `runtime.node` and checks its own execPath.
- Ollama service: spawns its worker with `runtime.node`, and the worker binds again.
- Bundle and dev preparation: call `store.ensureRuntime` through the manager's lease (`manager.ts:223`), before quiesce or shutdown (`:519-525`, `:555-559`).
- The one consumer without process binding is the Ollama worker branch (finding 7).

**Semantic changes callers inherit.**
- Verification before recovery and activation is now bounded (finding 4).
- TUI selection checks only the control entries, not the full payload. That is consistent with LLD §6, and `delivery` there is now computed only to check that a capability exists.
- Every launch re-hashes the full runtime (finding 9).
- One corrupt shared entry now stops every release, not just one (finding 5). Before, each release embedded its own copy of Node.

**IDE plugins.** Neither `vscode-plugin/` nor `jetbrains-plugin/` references `tools/node`, `runtimeArchive`, the release receipts or the launcher. `sync-client-runtime-assets.mjs` stages only `install.sh`, `install.ps1` and `installer-assets.json`, so the plugins pick up bootstrap fixes 1–3 automatically.

**Interleaved non-scope changes.** The `src/mcp`/`src/workflow` diffs in the same range (present-dispatch, pending, chain, steering-block) are not in the primary scope's `FILES.tsv` and were not reviewed here.

**Evidence equivalence.** I checked this with `git diff`.
- macOS UTM source `2fca011a` → head: the only src/scripts differences are the two controller-maintenance test files from the separately reviewed correction.
- Linux source `0938af2d` → head: src/scripts are identical.
- So reusing the native evidence is justified for the production code as it stands. That conclusion changes once findings 1–5 are fixed.

## Checked and found sound

**Resolver** (`runtime-store.ts`)
- Pinned trust anchor: the inventory bytes must hash to the release-owned `inventorySha256` before they are parsed. The completion record must equal the canonical bytes rebuilt from policy, and the node entry must equal the pinned `nodeSha256`. Local metadata rewritten to be self-consistent therefore cannot pass; the test at `:110-121` checks this with the right matchers.
- Exact tree: every file and directory must be in the inventory, case and NFC aliases are rejected, and size, mode and SHA are checked for each file.
- No links or loose permissions: symlinks, hardlinks (`nlink === 1`) and special files are refused. Every ancestor from the root up to home must be owner-private and unchanged. `assertLocalControlRoot` refuses symlinked ancestors, so `realpath(execPath)` can be compared reliably.
- Each file is read once through the same open handle and checked against the stats from before and after. The total and per-file sizes are bounded, and the deadline can be cancelled.
- The resolver only reads: no mkdir, download, lock or application imports, and its test traps all of these.

**Acquisition** (`runtime-acquire.ts`, `runtime-archive.ts`)
- The download is checked against the pinned exact size and SHA, and only HTTPS is followed on every redirect hop.
- The archive bytes are re-read through the same handle, and their digest is checked before parsing.
- The tar parser checks checksums, magic, PAX, size, terminator and padding. A selected file may not be a link, and members outside the profile are read through without being written. The ZIP parser rejects encryption, links and unsafe attributes, and compares raw and decoded names.
- The staged inventory is checked against the pin *before* the metadata is written, and checked again under the lock in `publishRuntime`.
- When the owner is uncertain, the stage is kept, not deleted.

**Publication** (`controller-store.ts`)
- `ensureRuntime` and `publishRuntime` reuse the existing `ControllerStore` handle and only ever call `assertHeld()`. There is no second controller and no lock transfer, and `close()` is unchanged.
- Publication is one native exclusive directory publish, and the parent directories are flushed before the path is returned. An existing destination is never overwritten.

**Formats**
- Descriptor format 2 has a strict schema, with `runtimeArchive` removed.
- Descriptor format 1 and dev receipt 1 / recipe `dev-v1` are rejected before schema parsing, with no adoption. Canonical hashing is consistent across the readers.
- Commit e87c5b38 does *not* reinterpret old offers. It only stops wrapping `source-incompatible` as `preparation-uncertain`.

**Dev environment**
- `NODE_OPTIONS`/`NODE_PATH` and the `npm_*` runtime keys are removed, matched case-insensitively.
- The private bin directory comes first on PATH, and npm, npx, node-gyp, the headers and nodeLib all come from the resolver.
- The CUDA `skip` default applies only when the variable is unset.

**Ollama service**
- Commit 7e410014 reads the service facts in reverse publication order, which is correct for append-only facts, and its tests distinguish both interleavings.

**Refactor**
- The `tar-primitives.ts` extraction is byte-identical to the removed helpers in `ollama-tar.ts` apart from renames and exports, so Ollama extraction behaviour is unchanged.

**Policy consistency**
- The profile fields match `runtimeProfile()` validation and `generate-runtime-profiles.mjs`.
- The entry counts are consistent: 4972 on POSIX, 4973 on Windows because of `node.lib`.
- The generator selects the same files as `included()`.
- I did not recompute the hash values themselves, because that needs the official archives.

## Open items for the owner

1. **Findings 4 and 5** are design choices. Should recovery and activation re-hash the payload, and should the runtime be made read-only with a recovery path? Fix both in this BUILD, or record them as accepted risks in the LLD with a tracked follow-up.
2. **Finding 6:** tighten the publisher check, or narrow the LLD claim.
3. **Findings 1–3 and T1/T2** are straightforward fixes. If the bootstrap scripts change, the macOS and Linux bootstrap evidence no longer matches the source and would need a rerun or an equivalence argument.
4. The interrupted isolated run `d7a67629` (`/private/tmp/insrc-q5-pb8Jqt`) is still blocked, unchanged from the earlier reviews.
5. BUILD-446ae69566d352dd-s1 revision21 still needs human approval. This review does not grant it.
