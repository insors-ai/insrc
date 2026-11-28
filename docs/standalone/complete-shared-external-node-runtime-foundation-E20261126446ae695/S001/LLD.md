<!-- insrc:artifact LLD-446ae69566d352dd-s1 -->

# LLD: STORY-446ae69566d352dd-s1 — Complete the shared external Node runtime foundation

## Summary

**Epic:** `complete-shared-external-node-runtime-foundation`
**HLD base run:** `wf-1795857414341-or9fli`
**HLD effective hash:** `e3d0af7b8c39...`

Bundle and dev installations share one independently verified Node distribution outside application releases. Existing accepted bootstrap work is retained; the remaining integrity, build isolation and consumer corrections stay in this standalone Story. The proposed POSIX protection keeps the candidate root writable for native publication, seals that root afterward under the same lock, and returns paths only after strict verification. Corrupt-entry recovery remains manual guidance with explicit risk; both recovery scope and read-only protection remain unapproved owner choices. Current macOS/Linux qualification and later installer lifecycle work remain separate gates.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [HLD context](#2-hld-context)
3. [Contract details](#3-contract-details)
4. [Data model changes](#4-data-model-changes)
5. [Diagrams](#5-diagrams)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. Epic impact analysis

**Does not apply**: Standalone foundation correction; no sibling approved build in this unit.

## 2. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 3. Contract details

**Surface level:** internal-shared

### 3.1 `runtimeArchive`

```typescript
runtimeArchive(target: Pick<Target, 'os' | 'arch'>): { url: string; sha256: string; root: string }
```

**Parameters:**
- `target: Pick<Target, 'os' | 'arch'>` — Select the exact pinned official archive; enablement still requires native qualification.

**Returns:** `{ url: string; sha256: string; root: string }` — Unchanged official archive identity, never a runtime path or proof of installation.

**Errors:**
- `InstallerError('runtime-invalid')` when Missing or inconsistent target/version/header policy.

**Preconditions:**
- Use fixed release-owned policy, not user URL/hash overrides.
- Grounding and proposed correction are traced by c1,c2,c7; public/behavioral constraints by c4,c6,c8.

**Postconditions:**
- Archive URL/hash/root retain their existing meaning. Distribution integrity metadata extends private policy, not public RuntimeIdentity.

### 3.2 `privateRuntimePaths`

```typescript
privateRuntimePaths(location: InstallationLocation, identity: RuntimeIdentity, options?: { signal?: AbortSignal | undefined }): Promise<ResolvedPrivateRuntime>
```

**Parameters:**
- `location: InstallationLocation` — Explicit installation-home trust boundary; no global PATHS import or ambient home selection.
- `identity: RuntimeIdentity` — Exact manifest identity, including target/baseline, pinned archive digest and relative executable.
- `options: { signal?: AbortSignal | undefined }` _(optional)_ — Bounded cancellable read-only integrity verification.

**Returns:** `Promise<ResolvedPrivateRuntime>` — Frozen exact-identity result: identity, directory, node, npmCli, headers and inventorySha256; Windows nodeLib included when qualified. This existing unused path-constructor export becomes the single verified read-only resolver.

**Errors:**
- `InstallerError('runtime-invalid')` when Wrong policy, executable/target/baseline/npm/header identity, missing/corrupt completion or inventory, changed/missing/extra runtime files.
- `InstallerError('path-invalid'|'permissions-invalid'|'target-unsupported')` when Noncanonical/linked/reparse/network/unsafe root or unqualified target.

**Preconditions:**
- A complete runtime store entry already exists. The resolver never downloads, extracts, repairs, creates directories, acquires controller ownership, changes release selection or opens application stores.
- Use only Node builtins and installer-only schemas/policy/lazy native path checks. No src/shared/paths.ts, application entry, DB, provider or source-builder imports.
- No arbitrary trusted runtimeDirectory string from a request/receipt is accepted. Exact full Target identity is validated; path segments use validated safe tokens.
- Grounding and proposed correction are traced by c1,c2,c7; public/behavioral constraints by c4,c6,c8.

**Postconditions:**
- Absolute node/npm/header paths are contained in the exact verified distribution; no PATH, tools/node, legacy layout or process.execPath fallback.
- Verify bounded receipt/inventory against release-owned pinned distribution inventory digest; verify each selected file's digest/size/mode and exact tree membership once per resolution. No application/Ollama payload traversal. Consumer may pass this result within the same launch operation, never persist a JS capability as a wire flag.
- The change has no known production callers of the former helper; add real consumers in this correction, with S4 consuming it later.
- Process-local verified results may be reused only for the same explicit location/full identity within one operation. No global cache or persisted trust flag; each new worker/process independently verifies its runtime before admission.
- POSIX canonical launch requires the strict published form: entry root and every descendant directory0500, metadata0400, distribution files exactly pinnedmode&~0222 with no remaining write bits. Launch never changes permissions or accepts source-stage/transition flags. The existing controller may finish only the verified root-writable publication window described in §4.3. Older unsealed development homes are rebuilt, not automatically converted. (c21,c22)

### 3.3 `readInstalledReceipt`

```typescript
readInstalledReceipt(directory: string, target: Target): Promise<InstalledReceipt>
```

**Parameters:**
- `directory: string` — Canonical installed immutable application release directory.
- `target: Target` — Qualified exact target for descriptor/receipt validation.

**Returns:** `Promise<InstalledReceipt>` — Strict bundle-format2 or dev-format2 application receipt and unchanged manifest; runtime identity is metadata only.

**Errors:**
- `InstallerError('candidate-conflict'|'manifest-invalid'|'runtime-invalid')` when Ambiguous/unsafe/noncanonical receipt, mismatched release/target or old embedded-runtime format.

**Preconditions:**
- Keep bounded private regular receipt checks and canonical byte equality. Receipt loading does not run source tools or acquire runtime.
- Grounding and proposed correction are traced by c1,c2,c7; public/behavioral constraints by c4,c6,c8.

**Postconditions:**
- Installed consumer separately calls privateRuntimePaths(location, manifest.runtime). Receipt metadata alone is not runtime readiness.
- Reject descriptor1/dev receipt1 with actionable legacy-runtime-format diagnostic, never silently reinterpret or migrate them.

### 3.4 `renderInstallerBootstrap`

```typescript
renderInstallerBootstrap(platform: 'posix' | 'powershell', assets: QualifiedBootstrapAssets): string
```

**Parameters:**
- `platform: 'posix' | 'powershell'` — Render shared manual/IDE terminal script from the same template.
- `assets: QualifiedBootstrapAssets` — Digest-bound control assets and pinned distribution metadata derived from official archives; never ambient runtime overrides.

**Returns:** `string` — Shared bootstrap script with exact runtime/control identities and foreground install-to-TUI handoff.

**Errors:**
- `Error` when Unknown/unqualified target, mismatched fixed policy or missing digest-bound control assets.

**Preconditions:**
- Before using any Node executable, script hashes it against the release-owned nodeSha256 for the pinned distribution profile. Fresh archive digest is verified before extraction/execution.
- Cached canonical runtime reuse first verifies that exact node executable with OS hashing, then runs only trusted embedded verifier/control bytes after their digest checks; no receipt-supplied code is executed.
- Grounding and proposed correction are traced by c1,c2,c7; public/behavioral constraints by c4,c6,c8.
- The target including baseline is required; no implicit baseline. Normalize repeated/trailing home separators before creating stages. Immediately before final handoff, OS-hash canonical Node, bootstrap and native control assets again.

**Postconditions:**
- No host Node needed. Valid matching runtime/control may be reused offline; missing runtime requires live official download, and missing uncached control assets fail offline.
- Fresh bootstrap runtime publication helper holds the same native operation.lock used by managers and exits before final canonical-node manager acquires a fresh lock; the shell/PowerShell waits for that exact child, not PID/kill/file age.
- Final manager revalidates controller state and ordinary admission; bootstrap does not transfer an OS handle, manager session or selection authority.
- Windows publication never renames/moves the currently executing staged node.exe or loaded native DLL: helper executes from one owned stage and publishes a separate verified copy with native directory publication. Retain the execution stage until exact helper exit.
- INT/TERM/HUP during foreground publication are recorded; after observing the exact child's exit, clear active-child state, clean only owned closed stages and return the signal exit status. If exact exit cannot be confirmed retain evidence. A residual same-user race between path hashing and path execution, including ancestor replacement, is accepted; no claim of fd-bound execution.
- A SIGTERM/SIGHUP sent only to the shell PID, including a signal between helper_active=1 and child creation, is recorded and is not forwarded. The shell waits for exact helper exit before cleanup; cancellation can take the remaining helper publication bounded by its existing deadlines. Prompt cancellation is supported for foreground-group signals, not promised for shell-only delivery. No background forwarding/kill redesign is introduced. Linux qualification must run real group-signal cancellation under dash as well as preserve the macOS shell evidence. (c19)

### 3.5 `verifyRuntimeEntry`

```typescript
verifyRuntimeEntry(root: string, identityInput: RuntimeIdentity, external?: AbortSignal, protection?: 'published' | 'source-stage' | 'permission-transition'): Promise<void>
```

**Parameters:**
- `root: string` — Exact local owned runtime entry or owned source-stage root; no launch authority is returned.
- `identityInput: RuntimeIdentity` — Pinned official full identity and independent inventory.
- `external: AbortSignal | undefined` _(optional)_ — Existing bounded cancellable verification.
- `protection: 'published' | 'source-stage' | 'permission-transition'` _(optional)_ — Internal content/mode lane: defaultpublished; source-stage for owned extraction, permission-transition for protected descendants with only root0700 or0500. It returns no launch authority and grants no mutation capability; never a wire/receipt override.

**Returns:** `Promise<void>` — Content/tree/ownership/mode verification only; never path allocation, sealing, repair or a resolved launch capability.

**Errors:**
- `InstallerError('runtime-invalid')` when Pinned content, identity, exact membership, execute intent or lane-specific permissions differ.
- `InstallerError('resource-close-uncertain')` when An owned verifier resource cannot positively close.

**Preconditions:**
- Existing analyzer-located API; add only the internal lane discriminator, keeping the existingfirst3arguments. (c19,c20)
- Read-only canonical resolver always uses published. Controller source-stage/permission-transition checks require its original ownership proof and cannot be reused as a launch result.

**Postconditions:**
- Original official inventory JSON retains pinned0644/0755 modes and its independent hash. On POSIX published files must equal pinnedmode&~0222 and have zero write bits; preserving execute intent is mandatory. Published root/subdirectories0500, metadata0400. Source-stage requires original pinned file modes,0700directories/0600metadata. (c21)
- Permission-transition accepts only root0700 or0500, with every descendant directory0500, metadata0400 and all files already protected. It covers the prepublication form and the exact interrupted published-root window, not arbitrary mixed/writable subtrees, old development homes or corrupt bytes. Verification alone cannot rename/chmod/return paths; original controller ownership is separately required. Windows remains deferred/unqualified.

## 4. Data model changes

### 4.1 `Private runtime policy and ResolvedPrivateRuntime` — invariant-change

Public RuntimeIdentity remains {version,target,sha256,relativeExecutable}; ReleaseManifest stays schemaVersion1. Extend private src/installer/runtime-policy.json with a versioned deterministic distribution profile and per os/arch archive-derived nodeSha256/inventorySha256, calculated from the verified official archive without executing target bytes. The profile selects node, complete npm subtree and required include/node headers, excludes command aliases/symlinks; Windows includes the official matching arch/node.lib, acquiring a separately pinned official header/library asset if the ZIP lacks it. Pin any such extra asset URL/hash in the same policy and bind it in the profile inventory; do not fake header availability. Policy records are checked into release-owned source and changing their generated values requires qualification review, not an install-time override. archive metadata presence alone never enables a target. The result type is a frozen process-local value, not a serializable authority token. Proposed runtime-only source files src/installer/runtime-store.ts and src/installer/runtime-acquire.ts separate read-only verification from acquisition; src/installer/runtime-policy.ts exposes the existing helper name as the resolver. Pin archive byte counts alongside hashes for exact-size bounded downloads, plus independently verified extra header/library assets where required. (c1,c2,c7)

**Call sites:**
- `src/installer/runtime-policy.ts`
- `src/installer/contracts.ts`
- `src/installer/production-peers.ts`
- `src/installer/dev-toolchain.ts`
- `scripts/package-installer.mjs`

### 4.2 `RuntimeStoreEntry and RuntimeCompletion` — new

Canonical root remains <home>/runtimes/22.22.1/<os>-<arch>-<baseline>/<archiveSha256>/. Each entry owns one exact distribution plus canonical inventory/completion; each application release references one RuntimeIdentity, and0..Nreleases share an entry without deletion ownership. Official archive bytes, inventory JSON/original0644/0755mode fields, independent inventory digest, profile version and completion format remain unchanged. POSIX strict published form is root/subdirectories0500, metadata0400, original0644files0444 and0755files0555; verifier requires exact protected mode, not an equal masked comparison that still permits writes. No links/reparse/hardlinks/special files/foreign owner/unsafe roots are admitted. Protection reduces ordinary accidental writes; owner chmod/ancestor replacement/pre-opened writable handles remain outside the same-user security boundary. Writable SDK copies retain the original mode intent only inside the positively owned build workspace. The sole publication transition is root0700 with all descendants/files/metadata protected; launch rejects that state until the original controller-owned finalization described next. No application cleanup removes or unseals shared entries. Limits remain completion64KiB, inventory16MiB,32768entries,128MiB/file,1GiBexpanded,256MiBcompressed asset, ordinary network600s/verification120s independent of ambient qualification env; only explicit trusted qualifier context selects bounded slow-VM policy. No full app/Ollama traversal in runtime resolution. (c1,c2,c7,c19,c21)

**Call sites:**
- `src/installer/runtime-policy.ts`
- `src/installer/installed-receipt.ts`
- `src/installer/installed-launcher.ts`
- `src/installer/manager-entry.ts`

### 4.3 `Runtime acquisition and bootstrap handoff` — new

Use the existing ControllerStore/PreparationLease native operation.lock and original owner capability; no public action, lock transfer, PID/kill controller or second simultaneous controller. Missing runtime: bounded live official HTTPS/status/redirect/size/hash-checked download, deterministic safe source extraction and original-profile verification in its owned private stage. Staged Node/control execution remains separate from the tree being published; Windows execution/DLL movement constraints are retained but native Windows is deferred. (c1,c2,c7)

POSIX fresh publication order is mandatory: (1) with the same lock held, verify exact original source content/modes/ownership and closed writers; (2) protect every file, metadata and descendant directory, but KEEP THE CANDIDATE ROOT0700 because native cross-parent rename needs it writable; fsync changed metadata and verify permission-transition form; (3) assert original owner and use actual native no-replace publishDirectory from install/runtime-stage-X/candidate into the identity-derived runtime destination; (4) while STILL holding that lock, chmod ONLY the published root0500, fsync the root and relevant source/destination parents, and strict-verify the published form; (5) only after successful durability/resource closure may return verified launch paths or report success. No root0500cross-parent publication, and no return/success during the root0700window. MacOS native binding uses renamex_np(RENAME_EXCL), Linux renameat2(RENAME_NOREPLACE); a small real macOS probe confirms this ordering, not full runtime/VM qualification. (c21,c24)

Crash/error handling is specific: after native publish and before final root sealing, the only expected canonical transitional state is root0700 with EVERY descendant/file/metadata already protected and all identity/content/tree hashes exact. Ordinary launch rejects it. A later existing-controller operation may reverify that exact form and original owner/closure requirements, then remove rootwrite, fsync and strict-verify; no network, byte rewrite, subtree repair or entry replacement. Any other partial/mixed mode, corrupt content, unsafe owner, unconfirmed actor/resource state or ambiguous publication is retained and fails with the existing coded uncertainty/manual guidance. Postpublication chmod/fsync/verification/close failure returns resource-close-uncertain with retained canonical/staging evidence and never falls back to deleting or overwriting. Before publish, positively closed owned protected stages may restore ownerwrite to their directories for discard under the original stage capability, with bounded nofollow/identity checks; uncertain stages/canonical entries never enter this discard path. (c21)

Old unpublished unsealed development/test/qualification homes are rebuilt in new isolated homes; remove the previous broad permission-transition conversion of arbitrary intact writable entries. Read-only GitHub release audit observed only legacydaemon-v0.2.0/systemNode source installer, no shared-store reader in its release tree or current defaultmain tree. Thus no officially published shared-store reader population is established by the audited release inventory. This is not a guarantee about deleted releases or unknown custom-branch/manual deployments; unsupported custom builds are retained for operator handling. No field mixed-version migration promise or hostv2 update is introduced. Keep the release-audit timestamp/source hashes. (c22)

Corrupt-entry recovery is documentation only, not an implemented recovery command, lock holder, consumer shutdown proof or enforcement fixture. Use InstallerError runtime-invalid with EXACT message template: Shared Node runtime verification failed at "<runtime-entry>": <reason>. This runtime is shared by all releases; no repair was attempted. Manual recovery only: stop all Insrc consumers of "<home>". Do not delete anything. If the runtime-entry root is not owner-writable, first restore owner write on that root only: chmod u+w <shell-quoted-runtime-entry>. Preserve and move the entire entry outside the runtime store, then rerun the authenticated installer. This procedure is not protected by operation.lock; Insrc cannot confirm that every consumer has stopped. If unsure, leave the entry unchanged and request operator assistance. Substitute derived canonical entry/home and reason. Render <shell-quoted-runtime-entry> using safe POSIX single-argument quoting, including embedded apostrophes; tests cover spaces/Unicode/apostrophes. Nothing is deleted and only root ownerwrite is advised, so sealed descendants can be preserved and moved without recursive chmod. Product code neither performs that manual chmod/move nor prevents an operator action. Concurrent-use risk requires human acceptance. Add a deferred recovery-command follow-up to the existing issue/release-readiness record for reassessment before general release; it is not implementation or a newly approved scope. (c19,c21)

For the exact root-only publication window, use runtime-invalid with: Shared Node runtime publication is unfinished at "<runtime-entry>". Re-run the authenticated installer to verify and finish protecting the entry; no bytes will be replaced. For older unsealed development layouts use: Shared Node runtime protection layout is unsupported at "<runtime-entry>". This unpublished development home must be rebuilt in a new isolated home; no conversion or repair was attempted. Keep corruption guidance distinct. Bootstrap still authenticates Node/control bytes before execution, observes exact helper exit before fresh manager ownership, preserves same-terminal I/O, and retains uncertain execution stages. (c21)

**Call sites:**
- `scripts/render-installer-bootstrap.mjs`
- `scripts/bootstrap-publish.cjs`
- `src/installer/terminal-entry.ts`
- `src/installer/production-peers.ts`
- `src/installer/bundle.ts`
- `src/installer/dev-worker.ts`
- `src/installer/runtime-store.ts`
- `src/installer/runtime-acquire.ts`
- `src/installer/controller-store.ts`
- `src/installer/durability.ts`
- `src/installer/native/control.c`

### 4.4 `Application-only bundle descriptor and dev receipt` — field-modify

Private ReleaseDescriptor schemaVersion2 removes runtimeArchive entirely; manifest.runtime retains exact official identity. PayloadInventory schemaVersion1 is now application-only for descriptor2. Private DevReleaseReceipt advances to schemaVersion2 and its recipeVersion advances for application-only inventory; old receipts/offers remain distinguishable and incompatible, not silently rewritten. All canonical hashing/offer persistence/readers are updated together. App inventory includes runtime native dependencies (e.g. .node modules), bootstrap/manager/TUI and production closure, but no Node/Ollama executable/distribution/archive contributions. Publisher collects the out tree and resolved production dependency closure independently from runtime build/probe inputs. Its actual guarantee is source containment in allowed roots (or exact generated files), rejection of explicit excluded runtime/download roots even after destination renaming, blocked runtime/Ollama paths/basenames, and rejection of known independently pinned archive/executable/header-archive/node.lib digests. It is not a positive executable/package allowlist or proof of the origin of arbitrary bytes. Unknown-version binaries, recompressed archives, copied unpinned npm/header/Ollama library files can evade known-content checks; trusted release source/dependency review remains required. Do not blindly deny per-file common license/vendor JS hashes, which can legitimately occur in application dependencies. Collector opens every regular file through captured traversal identity with no-follow/identity recheck, including single-link files; no late path-only read. Runtime archives may be transient publisher/download/test inputs outside app/IDE payloads. Native qualification, inventory limits, exact source/target/offer hashes and unsafe archive checks remain. Reject old embedded-runtime formats diagnostically; no automatic adoption, migration, uninstall or modification of host v2. (c1,c2,c7)

**Call sites:**
- `src/installer/release-descriptor.ts`
- `src/installer/bundle.ts`
- `src/installer/safe-zip.ts`
- `src/installer/dev-payload.ts`
- `src/installer/dev-worker.ts`
- `src/installer/installed-receipt.ts`
- `scripts/package-installer.mjs`

### 4.5 `Installed launch and preparation binding` — invariant-change

manager-entry and terminal-entry resolve explicit location plus receipt/policy identity and compare realpath process.execPath to resolved node before control work. Installed manager, daemon launch selection, TUI, Retry, bootstrap and publisher probes all consume the same foundation; no release tools/node selection remains. productionPeers receives the verified result for dependency/toolchain use; S3 runtime readiness uses verified external paths rather than a directory guess. Both bundle and dev preparation resolve/acquire the candidate manifest identity under original manager ownership before destructive lifecycle work and use absolute verified npm/header/node paths; dev payload/publisher omit runtime bytes. No source checkout/npm/compiler is used for installed start/status or receipt resolution. Existing S2 closed-worker/source proof, S3 consent/Retry/retained Ollama and same-terminal TUI behavior remain. This batch does not supply fake lifecycle/migration peers or change manager action gates; S4 T3/T11 consume the runtime resolver after this batch passes. (c1,c2,c7) Current-build execution coverage applies to existing owned bundle/dev, manager/terminal, TUI/Retry, bootstrap and publisher consumers. Main-epic S7 owns the future Windows bridge transport process and its runtime-selection/execution tests; this foundation exposes the resolver for that owner and does not implement or claim to test an absent bridge process. (c13,c14,c15) Full application integrity is a distinct activation/recovery boundary: fresh preparation verifies/extracts every inventory member and yields an operation-local identity-bound proof; manager repeated verify calls reuse that proof only within the same operation. Recovered/newly reopened candidates require one full inventory file hash/exact-tree verification before quiesce, migrations or activation, then reuse it for subsequent checks in that operation. Start/status/readiness/TUI control opening stays bounded and never traverses full application/Ollama payloads. Proofs are neither serialized nor accepted from wire flags or receipts; failed/cancelled or new operations cannot inherit them. Dev and bundle paths follow the same rule; tests truncate non-control modules/addons after preparation then simulate a new recovery operation. Within-process runtime results are likewise passed through when identity/home matches, avoiding redundant resolution; Ollama runtime resolution/binding happens before admission/frame creation/readiness deadline, and a new worker verifies before control work. Bootstrap work is normalized once into a canonical absolute value before parent containment, leaf extraction or any filesystem/transport use; every downstream use takes that value. The foreign archive fixture is described as pinned-size rejection, not target-binding proof; renderer identity and pinned target digests retain target-binding coverage. These are remaining existing-bootstrap-owner corrections after LLD/PLAN approval. (c19)

**Call sites:**
- `src/installer/installed-launcher.ts`
- `src/installer/manager-entry.ts`
- `src/installer/production-peers.ts`
- `src/installer/terminal-entry.ts`
- `src/installer/dev-toolchain.ts`
- `src/installer/dev-worker.ts`
- `src/installer/bundle.ts`
- `scripts/package-installer.mjs`

### 4.6 `External installer epic compatibility constraints` — invariant-change

This ISSUE is standalone and has no formal parent shared-contract entries. External epic c3d71313f34bce71 HLD7 sc1–sc7 are compatibility references only: preserve its public runtime/manifest/manager/dependency/IPC/terminal shapes, keep S4 daemon lifecycle and S5 hook execution owned by their existing stories, and leave action-specific manager gating outside this batch. No shared contract is re-owned or redefined. Local acceptance ac1–ac6 are derived from this approved issue, not new epic FRs. See cited prior ISSUE/HLD/S004 PLAN (c4,c6,c8). (c1,c2,c7) S7 also retains its Windows bridge process implementation and runtime-selection/execution coverage. Its existing approved ownership is not moved into this standalone correction. (c13,c14) Release-owned target execution/publication gating explicitly excludes Windows while deferred, independently of self-declared NativeQualification input. Policy metadata extraction may still inspect foreign archives without execution; qualified-target enabling needs a separate reviewed release-owned change. CI Windows qualification is absent or explicit opt-in default-false; never run it in this macOS/Linux scope.

**Call sites:**
- `src/installer/contracts.ts`

### 4.7 `Owned sealed-runtime fixture home (test only)` — new

Propose one shared helper at src/installer/__tests__/_owned-runtime-home.ts. It creates/captures one isolated mkdtemp root with original dev/inode/currentUID and owns0..Nruntime entries and test assets inside it; it does not accept arbitrary/global/shared home paths or production imports. It waits for all retained children/groups and file/network/server/controller resources to positively close before cleanup, then restores ownerwrite on directories only within that exact retained root using bounded lstat/nofollow identity checks. It never chmods through a symlink; a fixture-created link may be unlinked inside the root without visiting its target. Recheck root identity/owner and refuse unsafe/uncertain cleanup, retaining the root and diagnostics. Do not touch shared SDK caches, host~/.insrc, unrelated fixture roots or blocked isolates. All fixtures that can contain published/sealed runtimes—including bootstrap, runtime-store/acquire/install, dev, bundle/installed/manager/dependency/terminal and qualification wrappers—use this helper at both allocation-failure and after/finally cleanup paths. Existing callers must be inventoried with rg plus actual publication/copy call sites; no blind rmSync(force) escape remains for protected fixtures. Keep resource-close fault fixtures explicit: only a positively closed retained handle may permit test-owned disposal, never a claim that production uncertainty vanished. This is test housekeeping, not a production corruption-recovery API. (c21,c23)

**Call sites:**
- `src/installer/__tests__/bootstrap.test.ts`
- `src/installer/__tests__/runtime-install.test.ts`
- `src/installer/__tests__/runtime-acquire.test.ts`
- `src/installer/__tests__/runtime-store.test.ts`
- `src/installer/__tests__/_runtime-fixture.ts`
- `src/installer/__tests__/_manager-fixture.ts`
- `src/installer/__tests__/_installed-control-fixture.ts`

## 5. Diagrams

- [ER model](./er-model.html)
- [Sequence diagram](./sequence-diagram.html)
- [Component dependencies](./component-dependency.html)

## 6. Error paths

**Error cases**

- **Missing or corrupt external runtime** (recoverable)
  - Detection: Resolver requires exact policy/full identity, canonical completion and inventory; pinned expected inventory digest plus exact file set/digests/modes/npm/header checks detect absent or changed bytes, including rewritten self-consistent local metadata.
  - Response: Retain the corrupt entry unchanged and return InstallerError('runtime-invalid') with the exact recovery message in §4.3. Recovery is operator documentation only: code does not hold operation.lock for the manual move, verify all-consumer shutdown, prevent an operator move or promise safe concurrent recovery. The user must explicitly accept that risk. Test the diagnostic and nonmutation, not nonexistent closure enforcement. (c19)
  - User impact: A shared runtime failure blocks dependent releases; manual recovery is uncoordinated and concurrent-use failure/data risks are disclosed. If unsure the operator leaves the entry unchanged.
- **Invalid official runtime download or unsafe archive** (recoverable)
  - Detection: HTTPS/status/redirect/size/deadline/hash checks run before extraction; bounded parser validates entry paths/types/collisions/links and deterministic profile before executing any target binary.
  - Response: Abort, close download/parser handles and clean only the positively owned closed stage; no runtime completion or release selection is published.
  - User impact: Install/upgrade fails safely; existing runtime/release stays selected.
- **Bootstrap cached executable or control helper is tampered** (recoverable)
  - Detection: OS hashing compares exact node bytes and cached control/native assets to independent release-owned expected digests before their execution; receipt cannot supply these expectations.
  - Response: Do not execute suspect cached code. Missing entry can be acquired live; conflicting canonical entry fails with diagnostic rather than overwrite. No elevation or unsigned legacy adoption.
  - User impact: Offline use succeeds only with verified cached prerequisites; missing/corrupt cache yields explicit failure.
- **Controller is busy/lost or bootstrap child closure is uncertain** (recoverable)
  - Detection: Native operation.lock acquisition/held checks and original owner assertions bracket publication; outer launcher observes the actual child process exit status, never a PID/file-age heuristic.
  - Response: No publish/selection with missing ownership; final manager never starts while publication helper may still own the lock. Retain uncertain stage evidence; do not send kill or infer lock release from close(void).
  - User impact: Concurrent installation reports busy or uncertain completion; no duplicate controller writer.
- **Windows publishing attempts to move an executing runtime or DLL** (recoverable)
  - Detection: Bootstrap contract separates execution-stage paths from publication-stage paths; tests trap accidental equality and native Windows fixture observes directory publication with loaded control DLL outside destination.
  - Response: Use the separately verified owned publication tree; native publication failure leaves existing entry untouched and no completion claim.
  - User impact: No successful Windows install claim without actual native evidence.
- **Receipt/offer from embedded-runtime format1** (recoverable)
  - Detection: Private descriptor/dev-receipt schemaVersion and dev recipe discriminator distinguish old semantics before inventory opening or runtime selection.
  - Response: Reject with legacy-runtime-format diagnosis. Never reinterpret old receipt, rewrite completed ledger, auto-migrate host v2 or resolve its release-local runtime.
  - User impact: Old rewrite-test fixtures must be rebuilt in isolated homes; real legacy migration remains S5-owned.
- **Unqualified target or missing exact dev header/library provenance** (recoverable)
  - Detection: Full target/baseline native qualification gate plus fixed policy profiles require official pinned Node/npm/header/library files and source metadata.
  - Response: Block publication/preparation explicitly. Cross-target inventory extraction may compute metadata without executing target bytes but cannot qualify the target.
  - User impact: Unsupported routes remain unavailable until genuine platform qualification.
- **Known runtime contribution contaminates application payload** (recoverable)
  - Detection: Allowed real source roots/exact generated files, explicitly excluded runtime/download inputs, blocked inventory paths and known independently pinned digests. These checks catch exact known contributions even when destination keys are renamed. They cannot infer arbitrary byte provenance.
  - Response: Reject the known or source-excluded contribution. Do not claim unknown-version/recompressed/copied unpinned SDK content is detected or silently stripped; dependency/source review is still required.
  - User impact: Release assembly enforces its documented known-content/source boundary, not universal distribution identification.
- **Non-control application member corrupted before recovery/activation** (recoverable)
  - Detection: New/recovered install/upgrade operation lacks fresh process-local preparation proof, so verify complete inventory/tree and every member before destructive lifecycle steps. Truncated modules/addons must fail.
  - Response: Stop before quiesce/migration/activation. Retain candidate/evidence under existing recovery semantics. Reuse successful fresh proof only within the same operation; no serialized trust marker and no repeated full scans on status/readiness.
  - User impact: Corruption cannot be activated simply because bounded control files still pass.
- **Runtime publication succeeds but parent directory flush fails** (recoverable)
  - Detection: Distinguish publication completion from later durability/close steps; wrap unexpected canonical-entry lstat errors in InstallerError.
  - Response: Use resource-close-uncertain for postpublication durability/closure uncertainty, retain canonical entry and owned evidence, never overwrite/retry by inference. Classify inaccessible entry as permissions-invalid or runtime-invalid with cause.
  - User impact: Actionable coded failure identifies uncertain publication and retained evidence.
- **Previous launcher release cannot resolve** (recoverable)
  - Detection: Distinguish changed/unowned launcher bytes from recognized owner whose predecessor is legacy, missing or corrupt.
  - Response: Return a specific legacy-runtime-format or launcher-predecessor-unresolvable diagnostic with recovery guidance; do not falsely classify known owned launcher as unrelated, overwrite unknown bytes or claim TUI handoff succeeded.
  - User impact: Post-install failure explains the actual predecessor condition instead of repeating generic ownership conflict.
- **Ordinary process inherits invalid qualification selector** (recoverable)
  - Detection: Production runtime/download modules use fixed constants; they do not import env-selected qualification budgets.
  - Response: Ignore INSRC_QUALIFICATION_PROFILE in ordinary control. Only trusted qualifier entrypoint validates/installs explicit bounded context before module import, with typed qualifier error there.
  - User impact: Stray normal/slow-vm/invalid values cannot change ordinary deadlines or break module loading.
- **Unfinished root-only protected publication** (recoverable)
  - Detection: Canonical root0700with exact independently verified content/tree/metadata and all descendant/file modes already protected. Any additional writable descendant, unsafe identity or corruption is a different failure, not a resumable transition.
  - Response: Read-only launch refuses with the exact unfinished-publication message. Existing controller may verify the exact tuple and original lock/closure conditions, seal only root0500, fsync root/namespace and strict-verify before returning. Never rewrite bytes, rename/replace the entry, add descendant write bits or use network. Postpublication failure retains evidence/resource-close-uncertain; uncertain actors are not inferred dead.
  - User impact: Crash-window recovery finishes a permission-only publication under the existing owner contract; the unfinished entry cannot launch.
- **Attempted accidental write to protected canonical runtime** (recoverable)
  - Detection: Ordinary write/create/unlink is denied by actual POSIX file/directory permissions; strict verifier separately rejects restored write bits or changed bytes.
  - Response: Keep canonical data unchanged; build tooling writes only to its owned writable SDK copy. Same-user chmod, ancestor replacement and previously opened writable descriptors remain outside this protection, explicitly accepted rather than called immutable security.
  - User impact: Known build writes work in isolation; accidental canonical writes fail instead of poisoning every release.
- **Sealed candidate root presented for cross-parent publication** (recoverable)
  - Detection: Controller prepublication form requires candidate root0700and protected descendants; actual native rename refuses a root0500moved between parents. The recorded macOS native probe reproduces this.
  - Response: Protect only descendants before publication. Assert root0700before the real no-replace rename, then root0500/fsync/strict verify after it. A fixture must exercise actual native publication, not mock it or merely compare mode bits.
  - User impact: Fresh acquisition can publish instead of failing after full download/extraction.
- **Unsealed old development/qualification runtime layout** (recoverable)
  - Detection: Profile/content may match but writable descendants or other mode mixtures differ from the single root-only transitional form.
  - Response: Retain unchanged and return the exact unsupported-development-layout guidance from §4.3. Rebuild old unpublished isolated homes; do not add automatic broad permission conversion or mixed-version field migration. The official-release audit establishes no observed published store reader, with custom/manual install limits retained.
  - User impact: A clear development-only boundary replaces an unnecessary field rollout promise; hostv2 stays untouched.
- **Protected runtime fixture cannot be removed by plain rm(force)** (recoverable)
  - Detection: Directories0500deny ordinary unlink/create. Shared helper owns the original isolated root and knows whether every retained child/group/resource has positively closed.
  - Response: After positive closure restore ownerwrite only to directories inside that same captured root via bounded nofollow checks, then remove it. Unlink a known fixture symlink without visiting its target. If identity/owner/closure is uncertain retain the root; never chmod shared/global/production/blocked roots.
  - User impact: after/finally hooks clean their own protected trees without leaks or permission errors, while uncertainty remains visible.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Matching verified runtime used by multiple bundle/dev releases, including offline reuse | One identity-derived entry reused, no copy into releases and no network if needed runtime and control assets are verified cached; no per-release pointer state. |
| Two bootstraps have staged the same official runtime | Only one holds operation.lock at a time; later holder verifies matching complete entry and reuses it. Neither overwrites a conflicting entry nor transfers a lock to final manager. |
| Paths with spaces, apostrophes or Unicode and custom installation homes | Preserve exact quoted argv and explicit home identity in POSIX/PowerShell; no shell-interpolated wire path and canonical local containment enforced. |
| Dev builds invoking npm/npx and native header/library tools | Exact resolved private Node/npm/header paths and existing owned aliases/environment remain; CUDA skip default only if unset, user value preserved; no ambient npm/node/toolchain fallback. |
| Cancellation before/after durable runtime publication | Before publish remove only owned closed stage; after atomic publication preserve verified reusable runtime while ordinary install result may be cancelled. No TUI launch after failed/cancelled install. |
| Status/readiness and repeated grant checks | No acquisition, source build or full application/Ollama payload rehash; runtime integrity is bounded and verified at process/launch trust boundary, not rescanned by each status/control message. |
| The user explicitly defers Windows and asks to continue macOS/Linux acceptance. | Require actual macOS/Linux foundation proofs and current scoped regression for this handoff. Keep the Windows native subject deferred under ISSUE-cab5701fbefab736, never pass it from an availability diagnostic or POSIX result, and leave Windows enablement disabled. |
| Same-user process changes a runtime or swaps an ancestor between hash and exec | POSIX read-only modes reduce ordinary accidental writes; they do not stop owner chmod, ancestor replacement or pre-existing writable handles. Exact verification rejects later corruption. Hash-to-exec/ancestor races remain accepted within the same-user boundary; no claim of universal OS immutability. |
| Ordinary npm/native build writes next to tooling or headers | Writable npm/node-gyp/header/library inputs are isolated copies under the positively owned build workspace and cleaned only after actor closure. Executing Node remains canonical; copies are checked against the verified source at setup and not treated as a new persistent runtime. |
| TERM/HUP delivered only to the shell PID, or any group signal before the helper is forked | Record the signal without forwarding and wait for exact helper exit. Cancellation can take all remaining helper work, bounded by helper operation deadlines; cleanup remains safe. Prompt abort is tested only when the actual running helper receives the foreground-group signal. No low-latency promise for the shell-only/pre-fork case. |
| Operator considers moving a corrupt runtime while consumers may still be active | Documentation advises stopping every consumer and leaving the entry unchanged if unsure. Product code neither proves shutdown nor holds the native lock for that manual move; it cannot prevent the operator action. No test may claim otherwise. Concurrent-use risk is accepted only through human approval of this design. |
| Cancellation/failure after source-stage permission protection, before successful publication | Before publication, only descendants are protected and candidate root remains0700. Positively closed owned-stage discard restores directory ownerwrite only within its original capability; uncertain stages stay retained. After publication never discard/unseal canonical entry: a root0700-only window is verified/finalized under the controller or otherwise retained. |
| Operator must preserve/move a corrupt sealed entry | Exact manual diagnostic says stop consumers, delete nothing, restore ownerwrite on the entry root ONLY with safely quoted chmod guidance, then preserve/move it. Descendants remain protected. Product does not perform/enforce the move or prove consumer closure; manual concurrent-use risk remains for owner acceptance. |

**Invariants to preserve**

- RuntimeIdentity and ReleaseManifest public fields/schema remain unchanged; pinned Node22.22.1, matching npm10.9.4, headers22.22.1 and full target must agree. [[c1]]
- Strict canonical installed receipt bytes, bounded metadata, exact release-id/target and no source-tool execution during receipt loading remain. [[c2]]
- Controller mutation needs the existing live OS operation.lock; bootstrap publication never adds a simultaneous controller or substitutes PID/kill ownership. [[c3]]
- Shared terminal script owns install and same-terminal TUI handoff; S3 Ollama consent/retention, install-only Retry and agent recommendations remain. [[c4]]
- S2 retains actual worker/source closure proof and absolute verified private npm/header execution; qualification cannot be replaced by fixture-only evidence. [[c5]]
- S4 owns daemon boot/admission/data lease/shutdown/wrapper; S5 hooks and action-specific manager gating are outside this correction. [[c6]]
- Fresh full application preparation proof may be reused only within its operation; new/recovered operation revalidates once, while launch/status remains bounded. No same-user OS immutability or universal publisher provenance claim. [[c17]]
- Manual recovery is guidance with a precise diagnostic and accepted uncoordinated-move risk, not a product-enforced lock/closure mechanism. Read-only POSIX permissions prevent ordinary accidental writes without changing official hashes or asserting a hostile same-user boundary. [[c19]]
- Candidate root stays0700through actual native cross-parent publication; published root becomes0500and is fsynced/strict-verified under the same lock before any success. Only the root-write interruption is resumable; old development layouts are rebuilt and fixture disposal is isolated/positively closed. [[c21]]

## 7. Test strategy

**Test framework:** `Existing node:test TypeScript suites run by the repository's canonical npm test coordinator under Node22.22.1 with tsx; extend src/installer/__tests__/bootstrap.test.ts, src/installer/__tests__/bundle.test.ts, src/installer/__tests__/publisher.test.ts and the named dev/terminal surrounding suites. Per user instruction run only surrounding tests per task, then the full scoped installer regression after every task is built. Native qualifications are recorded separately with exact platform/runtime/actor cleanup evidence; do not claim unavailable Windows/VM evidence. Local ac1–ac6 respectively name the approved issue's runtime-integrity, external-delivery, consumer-binding, safe-publication/reuse, preserved-behavior and native-evidence groups (the issue-* ids scored in s3). The current consumer integration subject covers existing owned consumers only. Execute the actual publisher probe and real Retry entry, including truthful missing-production-peer failures; do not fabricate successful lifecycle or bridge evidence. Main-epic S7 owns the future Windows bridge process and its runtime-selection/execution tests, as already defined by S001 LLD section3.9 and S007 LLD section3.4. Its eventual implementation must consume the same shared resolver; the Windows native subject is retained as deferred work and is required before future Windows enablement, outside the current macOS/Linux foundation completion gate. User direction on 2026-11-28 limits current ac6 and T10 completion to macOS/Linux live subjects plus unavailable-target exclusion. The original subject native-Windows-first-install-reuse-named-path-ACL-header-library-and-loaded-DLL-safe-publication is deferred under ISSUE-cab5701fbefab736, not passed or deleted from future Windows qualification. Retain the prior24 subjects and add8 review-specific subjects (32 current plus1 deferred Windows subject). Existing T1–T9 ownership/work is retained, but affected findings return to their owners for rework and current validation. Reuse retained native/regression proof only when exact relevant production/build-input equivalence and closure/source pins are established; otherwise rerun affected qualification. Controller-only review changes require their affected checks and accurate historical source labelling. Review findings1–17 andT1–T6 must each carry an explicit disposition/evidence entry; no broad negative assertion, fixture-only production-branch claim or unknown-URL network fallback. Existing ten task IDs/dependencies remain; revised PLAN maps added/strengthened subjects to their existing owners. Do not ask for per-task human approval; final Story BUILD approval follows all task validation, scoped regression and current affected macOS/Linux native evidence. Round2 R2-1–R2-5 remain separately traceable. The renamed manual-guidance subject supersedes the unimplementable enforced-offline-recovery subject; it tests exact runtime-invalid/protection diagnostics and no mutation, with no manual move fixture. Read-only protection adds2subjects under existing verifier/publication owners; no new task IDs or recovery command. R2-3 is documentation of bounded cancellation latency; R2-4/R2-5 remain existingT5 code/test corrections after revised LLD and PLAN approval. All6accepted prior fixes remain accepted; no new test run or current native proof is inferred from this design. Round3 corrections are conditional design work until owner choice/LLD/PLAN approval: real sealed-descendant native publication fixture and root-only crash checks; exact recovery-root-write/no-delete text; shared unit/integration/VM fixture disposal helper. Official-release population audit narrows older control compatibility to known unpublished dev/test/qualification homes for rebuild, without claiming knowledge of unknown custom builds. Preserve original test source pins; the small macOS actual-binding probe is not a registered task gate, full official runtime fixture, Linux test or VM qualification.`

**Test levels**

- **contract** — Verify unchanged public wire types and strict new private runtime/application formats.
  - Subjects: `runtime-policy-exact-identity-target-baseline-profile-and-pinned-inventory`, `descriptor2-and-dev-receipt2-application-only-with-public-manifest1-unchanged`, `legacy-embedded-runtime-formats-rejected-without-adoption`, `resolver-import-boundary-excludes-application-paths-storage-provider-and-source-build`
  - Fixtures: `Existing bootstrap, bundle, publisher and dev receipt fixtures adapted to application-only semantics; explicit old-format rejection fixtures.`
- **unit** — Exercise bounded read-only resolution and integrity failures without application startup.
  - Subjects: `resolver-returns-canonical-node-npm-headers-and-win-library-from-exact-identity`, `resolver-rejects-missing-corrupt-extra-files-wrong-mode-target-digest-npm-headers-inventory-receipt`, `rewritten-self-consistent-local-runtime-metadata-cannot-replace-policy-inventory-digest`, `resolver-does-no-mkdir-download-lock-selection-db-or-provider-work`, `runtime-caps-and-cancellation-are-finite-and-do-not-trigger-app-or-Ollama-hashing`, `runtime-rejection-matrix-proves-positive-baseline-and-exact-diagnostic-for-each-mutation`, `ordinary-runtime-deadlines-ignore-qualification-env-and-trusted-qualifier-remains-bounded`, `posix-runtime-protection-preserves-pinned-inventory-and-rejects-write-bits-or-execute-drift`
  - Fixtures: `Protected isolated runtime stores, independent pinned profile expectations and FS/network/DB traps.`, `Fresh or positively restored runtime fixture before every negative case, exact code/message matchers, positive resolution after restoration; ordinary module import with unset/normal/slow-vm/invalid selector; explicit trusted qualifier-context propagation.`
- **integration** — Prove actual bootstrap/publication ordering, reuse and existing owned installed consumer paths; the unbuilt S7 bridge process and its execution coverage remain with S7. Manual-review cases include actual production publication branch, real INT/TERM/HUP group signals after deterministic readiness, path aliases and cached/final canonical asset tampering. Verify worker runtime before admission; reuse process-local resolved runtime and place Ollama readiness window after resolution. Reject Windows execution/publication despite self-declared evidence; CI is opt-in or absent. Check exact postpublication/legacy/predecessor diagnostics. Collector must identity-check all file opens; excluded-source fixture lives inside a collected tree. All fixture transports refuse unknown URLs. Round2 test corrections: label the foreign-archive row as pinned-size rejection without claiming target proof; normalize work once and prove aliases are consistently used. Recovery checks assert exact diagnostics and preservation only, never operator-move enforcement.
  - Subjects: `bootstrap-no-host-node-verifies-archive-and-executable-before-execution`, `verified-runtime-and-control-reuse-offline-across-bundle-and-dev`, `bootstrap-native-operation-lock-exclusive-publication-exact-helper-exit-then-fresh-manager-lock`, `bootstrap-publication-stage-distinct-from-running-node-and-loaded-native-library`, `runtime-stage-cancellation-conflict-and-uncertain-closure-retain-safe-state`, `bundle-dev-manager-terminal-TUI-Retry-and-publisher-probes-use-shared-resolver`, `private-dev-node-npm-headers-native-env-and-worker-source-closure-preserved`, `publisher-app-and-IDE-inventory-exclude-Node-Ollama-distributions-and-archives-including-renamed-contributions`, `application-integrity-once-per-operation-and-full-recovery-before-activation`, `writable-dev-SDK-isolation-and-manual-runtime-recovery-guidance`, `posix-runtime-root-only-interrupted-publication-recovery-and-closed-stage-discard`, `native-runtime-publication-keeps-root-writable-until-rename-and-finishes-root-seal`, `shared-runtime-fixture-cleanup-restores-owned-directory-write-after-positive-closure`
  - Fixtures: `Trap host node/npm binaries; actual helper/controller subprocesses and native lock; closed actor evidence; isolated homes with spaces/Unicode; bounded deterministic HTTPS transport fixture.`, `Fresh preparation proof reused through repeated checks; recovery in a new operation after truncating a non-control module/addon must fail before destructive peers. Counter/trap confirms only one full payload scan per operation. Isolated writable SDK gets lifecycle writes while canonical runtime remains exact; corrupt store fails with the exact documented diagnostic and remains unchanged. No fixture claims to enforce operator shutdown, locking or a manual move. Qualifier compares publication path with actual helper staged executable, not orchestrator.`, `Ordinary non-root POSIX fixtures attempt overwrite/create/unlink in protected runtime and receive EACCES or EPERM; writable SDK copies accept legitimate writes. Verify original inventory bytes/hash unchanged, exact0444/0555 file modes,0500directories/0400metadata, execute-intent drift rejected, and restored write bits rejected. Only the exact root0700/otherwise-protected interrupted-publication form is completed under the original controller with same inode/bytes and zero network. Old writable/mixed development homes are rejected/rebuilt, never broadly converted. Corrupt/linked/unowned entries remain untouched; interruption and discard of positively closed sealed stages cannot unseal/delete canonical or uncertain entries. A read-only verifier never accepts the incomplete root window; retry only after controller finalization closes.`, `Real native publishDirectory under actual operation.lock must move an independently verified/protected runtime stage across install/ and runtimes/ parents with root0700; observe unchanged inode, protected descendants, then root0500/fsync/strict verification before any resolved paths. Inject interruption immediately after rename and after rootchmod/beforefsync; preserve canonical entry, refuse launch, and complete only exact root-only state after required closure. Reject extra writable descendants/corrupt bytes and prove no network/overwrite. Low-level host probe is supporting design evidence only; full official-profile fixtures on macOS and Linux remain required.`, `One proposed shared _owned-runtime-home.ts helper is adopted by every fixture that can publish/copy sealed runtime entries, including allocation failure and after/finally paths, wrappers and native qualification homes. Prove closed-root removal, actor/resource uncertainty retention, stale root/symlink/foreign/global path refusal and no target chmod through links. Known fixture symlinks may be unlinked in-place. Exact manual diagnostic tests cover root-only chmod, no deletion, safe POSIX path quoting and no product manual-move enforcement.`
- **smoke** — Preserve surrounding installer behavior and avoid repeating the prior expensive reconciliation.
  - Subjects: `S3-Ollama-consent-retention-agent-recommendations-and-install-only-Retry-preserved`, `terminal-install-success-ready-lock-release-same-terminal-TUI-and-failure-no-TUI-preserved`, `status-readiness-and-control-checks-do-not-scan-full-app-Ollama-payload`, `final-scoped-installer-publisher-bootstrap-dev-dependencies-terminal-regression`
  - Fixtures: `Existing S2/S3/terminal fixtures updated to external runtime; real surrounding test selectors, no fake lifecycle/migration production peers.`
- **live** — Require actual macOS/Linux native qualification for current foundation acceptance and S4 handoff; retain explicit unqualified-target guards. Windows native execution is deferred, never credited.
  - Subjects: `UTM-macOS-fresh-live-acquisition-offline-reuse-and-isolated-installed-consumer-smoke`, `OrbStack-Linux-fresh-live-acquisition-native-build-and-offline-reuse-smoke`, `unsupported-or-unavailable-target-is-not-enabled-by-cross-archive-metadata-or-foreign-tests`
  - Fixtures: `Isolated UTM macOS and OrbStack Linux VM homes, ordinary users, verified Node22.22.1 and exact source/actor records. Preserve host v2 daemon/Ollama. Windows remains deferred and unqualified under ISSUE-cab5701fbefab736; genuine Windows evidence is required before future Windows enablement.`, `Actual OrbStack Ubuntu/Linux dash must execute the real running-helper group SIGINT/SIGTERM/SIGHUP cleanup fixture at the current source; inherited macOS bash-in-POSIX-mode proof does not substitute. Both native homes test ordinary non-root read-only denial, strict protected offline reuse/root-only interrupted-publication completion and positively closed test cleanup. No shell-PID-only prompt cancellation guarantee or Windows execution.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `runtime-policy-exact-identity-target-baseline-profile-and-pinned-inventory`, `resolver-returns-canonical-node-npm-headers-and-win-library-from-exact-identity`, `resolver-rejects-missing-corrupt-extra-files-wrong-mode-target-digest-npm-headers-inventory-receipt`, `rewritten-self-consistent-local-runtime-metadata-cannot-replace-policy-inventory-digest`, `runtime-rejection-matrix-proves-positive-baseline-and-exact-diagnostic-for-each-mutation`, `ordinary-runtime-deadlines-ignore-qualification-env-and-trusted-qualifier-remains-bounded`, `posix-runtime-protection-preserves-pinned-inventory-and-rejects-write-bits-or-execute-drift` |
| `ac2` | `descriptor2-and-dev-receipt2-application-only-with-public-manifest1-unchanged`, `publisher-app-and-IDE-inventory-exclude-Node-Ollama-distributions-and-archives-including-renamed-contributions`, `verified-runtime-and-control-reuse-offline-across-bundle-and-dev` |
| `ac3` | `bundle-dev-manager-terminal-TUI-Retry-and-publisher-probes-use-shared-resolver`, `resolver-import-boundary-excludes-application-paths-storage-provider-and-source-build`, `private-dev-node-npm-headers-native-env-and-worker-source-closure-preserved`, `writable-dev-SDK-isolation-and-manual-runtime-recovery-guidance` |
| `ac4` | `bootstrap-no-host-node-verifies-archive-and-executable-before-execution`, `bootstrap-native-operation-lock-exclusive-publication-exact-helper-exit-then-fresh-manager-lock`, `bootstrap-publication-stage-distinct-from-running-node-and-loaded-native-library`, `runtime-stage-cancellation-conflict-and-uncertain-closure-retain-safe-state`, `resolver-does-no-mkdir-download-lock-selection-db-or-provider-work`, `application-integrity-once-per-operation-and-full-recovery-before-activation`, `posix-runtime-root-only-interrupted-publication-recovery-and-closed-stage-discard`, `native-runtime-publication-keeps-root-writable-until-rename-and-finishes-root-seal` |
| `ac5` | `legacy-embedded-runtime-formats-rejected-without-adoption`, `S3-Ollama-consent-retention-agent-recommendations-and-install-only-Retry-preserved`, `terminal-install-success-ready-lock-release-same-terminal-TUI-and-failure-no-TUI-preserved`, `status-readiness-and-control-checks-do-not-scan-full-app-Ollama-payload`, `final-scoped-installer-publisher-bootstrap-dev-dependencies-terminal-regression`, `shared-runtime-fixture-cleanup-restores-owned-directory-write-after-positive-closure` |
| `ac6` | `UTM-macOS-fresh-live-acquisition-offline-reuse-and-isolated-installed-consumer-smoke`, `OrbStack-Linux-fresh-live-acquisition-native-build-and-offline-reuse-smoke`, `unsupported-or-unavailable-target-is-not-enabled-by-cross-archive-metadata-or-foreign-tests` |

## 8. Migration

**State before:** At81dd67a04, LLD7 has no implementation changes and both owner questions remain unanswered. Round3 accepts manual-recovery/shell-signal design corrections but identifies a root0500cross-parent rename failure, incomplete manual chmod guidance and unit fixture cleanup gaps. Direct C/source review and a small actual macOS binding probe confirm the publication ordering issue. Official-release audit finds no observed published shared-store reader; unknown custom installs are outside that conclusion.

**State after:** After explicit owner selection and LLD/PLAN approval, new macOS/Linux runtime entries may use descendant protection, native publication with root0700, then same-lock root0500/fsync/strict verification before launch. Only exact root-write crash windows are resumable; old unpublished test/development homes are rebuilt. Manual recovery advises root-write restoration/preservation/no deletion with no product lock/closure enforcement. Public identity/manifest/IPC and official bytes/inventory remain unchanged. No hostv2 migration, new lifecycle action or Windows enablement.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Publish the pinned deterministic runtime profile metadata, shared resolver/acquisition and bootstrap contracts together with focused tests; preserve existing completed epic records and current host daemon. — ↩ rollbackable
2. Update all new application bundle/dev publisher, receipt/offer validators and installed consumers as one format transition; rebuild isolated test artifacts under the new format rather than editing existing immutable receipts. — ↩ rollbackable
3. Validate fresh isolated runtime acquisition, shared cross-mode reuse, consumer binding and real available native qualification. Enable/publish only qualified targets; reject old embedded formats with actionable diagnostic. Preserve incumbent host installation and runtime entries. — ↩ rollbackable
4. After corrective build validation and human approval, S4 resumes consumption of the verified runtime foundation. Any real legacy installation or application-data migration remains a separately approved S5 hook concern; no host migration or release selection is performed by this correction. — ↩ rollbackable
5. After owner decisions and human LLD/PLAN approval, return remaining corrections to existing task owners. Implement root0700native publication then same-lock root0500/fsync/strict verification, exact root-only crash finalization, manual root-write/no-delete diagnostic, and one shared positively closed isolated-fixture cleanup helper. Rebuild old unpublished dev/test/qualification homes instead of converting mixed permissions. Retain R2-4/R2-5 and all prior open work. Run task-local checks, full scoped regression and actual macOS/Linux qualification including native publication/cleanup/dash cancellation. Keep hostv2/Ollama, unknown custom installs and blocked isolates untouched. — ↩ rollbackable

**Backward compat:** Public RuntimeIdentity, ReleaseManifest schemaVersion1, manager/IPC and terminal shapes stay unchanged; official runtime/inventory/completion bytes and hashes are unchanged. Internal verifier lanes change only proposed POSIX protection semantics. Published strict form and root-only transition do not support arbitrary old writable/mixed layouts. Audited official GitHub release/default source has no new shared-store reader; known earlier consumers belong to unpublished dev/test/qualification homes and are rebuilt from current controls. No mixed-version field migration is promised. Unknown custom-branch/manual populations are not disproved by the audit and receive explicit unsupported/manual guidance rather than silent conversion. The current hostv2 installation is left unchanged and outside this transition. Windows remains deferred.

## 9. Alternatives considered

### 9.1 a1: Manual guidance with publish-then-root-seal protection — **CHOSEN**

Keep manual recovery honest and prevent accidental writes, with a writable candidate root until native publication.

For new POSIX entries, validate mutable source profile; protect files/metadata/descendants while keeping only candidate root0700; verify prepublication form; perform actual native cross-parent no-replace publication; then chmod root0500, fsync namespace/root and strict-verify under the same original lock before returning paths. The only resumable published transition is root0700 with every descendant already protected and exact pinned content. Old unpublished development homes are rebuilt rather than broadly converted. Manual recovery text restores ownerwrite on entry root only before preservation/move and says delete nothing, with no product locking/all-consumer proof. One fixture-owned cleanup helper restores directory write only inside its positively closed isolated root, with nofollow bounds; production/shared/uncertain roots are excluded.

### 9.2 a2: Manual guidance with SDK isolation only

Keep canonical writable modes and explicitly accept accidental-write risk outside the SDK copy.

Remove false recovery enforcement claims and specify exact manual guidance, but retain current runtime modes/verifier semantics and writable SDK isolation as the sole mitigation. No sealing/transition/readonly-cleanup work is introduced; root chmod guidance is relevant only if an operator independently changed permissions.

**Rejected because:** Valid smaller owner option, but leaves accidental canonical writes as an explicitly accepted risk beyond SDK isolation.

### 9.3 a3: Separate control-owned recovery design

Design a real recovery command and consumer-closure mechanism only if the owner requests that scope.

Introduce a separately approved authenticated control-owned recovery action with an actual native lock and independently provable consumer closure, entry preservation/reacquisition and tests. Do not call a manual procedure equivalent to this mechanism or infer scope from reviewer advice.

**Rejected because:** Needs separately chosen recovery/lifetime scope; reviewer advice is not user authorization.

## 10. References

- **[[c1]]** `analyze-bundle` `src/installer/runtime-policy.ts` — "Completed bounded installer foundation analyzer: official archive metadata/path constructor; incomplete graph supplemented by source and rg."
- **[[c2]]** `analyze-bundle` `src/installer/installed-receipt.ts` — "Completed bounded bootstrap/runtime analyzer: exact receipt signature and managerMain caller; graph flags31 ignored relationships, with direct source supplements."
- **[[c3]]** `code` `src/installer/controller-store.ts` — "Original ControllerStore retains native operation.lock capability and checks held ownership before publication. This is direct source evidence, not a claim of complete analyzer call coverage."
- **[[c4]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md` — "External installer epic HLD7 compatibility constraints; not the formal parent HLD for this standalone issue."
- **[[c5]]** `analyze-bundle` `src/installer/dev-toolchain.ts` — "Supplemental analyzer anchors existing private Node/npm/header toolchain; direct source reads ground owned aliases, environment and worker proof behavior."
- **[[c6]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S004/LLD.md` — "S4 lifecycle ownership and dependency-minimal real runtime prerequisite remain unchanged."
- **[[c7]]** `step-output` `s4` — "Proposed runtime-store/runtime-acquire types, canonical external store, pinned distribution inventory, private format2 and all-consumer binding; no claim these new sources already exist."
- **[[c8]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/ISSUE.md` — "Approved coherent runtime correction scope; no host v2 daemon mutation or action-specific gating work."
- **[[c9]]** `convention` `AGENTS.md` — "Node22 canonical test coordinator, surrounding tests per task and full scoped regression after all tasks per user's instruction; human artifact gates retained."
- **[[c10]]** `code` `scripts/bootstrap-publish.cjs` — "Current helper executes only after archive verification but currently performs whole-tree comparison and direct rename; proposed correction replaces publication behavior, including loaded Windows bina"
- **[[c11]]** `step-output` `s6` — "ac1–ac6 are local issue acceptance groups; test strategies are planned subjects, not evidence of executed tests/native qualification."
- **[[c12]]** `code` `scripts/render-installer-bootstrap.mjs` — "Existing renderInstallerBootstrap uses fixed official runtime policy and digest-bound control assets; source templates are scripts/install.sh and scripts/install.ps1."
- **[[c13]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/LLD.md#3-data-model-changes` — "Section3.9: s1 defines schemas; s7 implements Windows transport. Existing bridge implementation ownership is external to this standalone correction."
- **[[c14]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S007/LLD.md#3-data-model-changes` — "Section3.4 owns the Windows bridge transport process and its runtime launch, handshake and correlated IPC behavior."
- **[[c15]]** `doc` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t8.md#registered-gate-and-execution-coverage-correction` — "T8 implementation checks and mapped cases pass, but required bridge execution is absent because the process belongs to unbuilt S7. Actual publisher probe and Retry entry execute; no successful product"
- **[[c16]]** `stakeholder` `User instruction in chat, 2026-11-28` — "keep widnows aside for now, focus on macos/linux. continue"
- **[[c17]]** `doc` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/manual-review-20261128/REVIEW-FEEDBACK.md` — "Findings4–6 need either a fix or an explicit design decision recorded in the LLD; the review also requests production/qualification separation, reliable fixtures and documentation of the same-user pat"
- **[[c18]]** `analyze-bundle` `In-session insrc_analyze_step completed foundation integrity pass, 2026-11-28; source pin4ec83d006f7b plus T5 rework` — "Six function anchors and one inferred prepareBundle caller,24 qualification selector hits. No retrieved rule text; usage graph incomplete36ignoredrelationships. Supplementary direct source reads/rg us"
- **[[c19]]** `doc` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/manual-review-20261128/REVIEW-FEEDBACK-ROUND2.md` — "The code fixes are accepted. LLD6 is acceptable after one correction (R2-1). The operator recovery mechanism is undefined."
- **[[c20]]** `analyze-bundle` `In-session insrc_analyze_step round2 runtime-foundation context, 2026-11-28` — "Nine existing runtime/store/publication/bootstrap/dev function/method anchors; incomplete verifier usage graph with36ignoredrelationships. Controller verifier caller supplemented by rg; no existing en"
- **[[c21]]** `doc` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/manual-review-20261128/REVIEW-FEEDBACK-ROUND3.md` — "Seal everything except the candidate root while it is in the stage, publish, and only then chmod0500the published root under the same lock; manual guidance needs rootwrite and no deletion; use one sha"
- **[[c22]]** `doc` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/manual-review-20261128/round3/release-audit/summary.json` — "Observed one published GitHubrelease daemon-v0.2.0 with legacy source installer/systemNode, no new shared-store readers in complete release/defaultmain trees. No universal guarantee about unknown cust"
- **[[c23]]** `analyze-bundle` `In-session insrc_analyze_step round3 publication/stage/fixture ownership context, 2026-11-28` — "Six existing API anchors, incomplete3inferred discard callers with36ignoredrelationships; nativeC/fixture source reads and rg supplement graph."
- **[[c24]]** `doc` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/manual-review-20261128/round3/native-publication-probe-result.json` — "Actual macOS ARM64 Node22.22.1 native binding refuses root0500cross-parent publication; root0700publishes unchanged inode with readonly descendants then root0500fsync. Child exits0and positively owned"

## 11. Open questions

- R2-1 owner choice: accept manual-only recovery guidance with no operation.lock or all-consumer shutdown proof/enforcement during an operator move, or request a separately designed control-owned recovery command? Proposed default is manual-only with the exact diagnostic in §4.3.
- R2-2 owner choice: use corrected POSIX read-only protection plus writable SDK isolation, or keep SDK isolation only and accept accidental canonical-write risk? Proposed default is read-only plus SDK, with candidate root0700through native rename and root0500/fsync/strict verification afterward. Observed official releases have no shared-store reader; old known unpublished development/qualification homes are rebuilt, not converted. Unknown custom installs are outside that audit guarantee; no hostv2 or field migration is authorized.

## Resolved questions

- `q14408171` — R2-1 owner choice: accept manual-only recovery guidance with no operation.lock or all-consumer shutdown proof/enforcement during an operator move, or request a separately designed control-owned recovery command? Proposed default is manual-only with the exact diagnostic in §4.3.
  - **resolved**: Manual-only recovery guidance, without enforced locking or all-consumer shutdown proof; accept the disclosed concurrency risk, use the exact root-write/no-deletion diagnostic and retain the recovery-command follow-up for consideration before general release. — User explicitly approved LLD8 with manual-only recovery guidance and corrected read-only runtime plus writable SDK isolation in this turn. _(2026-11-28T09:29:45.905Z)_

## Citations

- **[[c1]]** `analyze-bundle` `src/installer/runtime-policy.ts` — "Completed bounded installer foundation analyzer: official archive metadata/path constructor; incomplete graph supplemented by source and rg."
- **[[c2]]** `analyze-bundle` `src/installer/installed-receipt.ts` — "Completed bounded bootstrap/runtime analyzer: exact receipt signature and managerMain caller; graph flags31 ignored relationships, with direct source supplements."
- **[[c3]]** `code` `src/installer/controller-store.ts` — "Original ControllerStore retains native operation.lock capability and checks held ownership before publication. This is direct source evidence, not a claim of complete analyzer call coverage."
- **[[c4]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md` — "External installer epic HLD7 compatibility constraints; not the formal parent HLD for this standalone issue."
- **[[c5]]** `analyze-bundle` `src/installer/dev-toolchain.ts` — "Supplemental analyzer anchors existing private Node/npm/header toolchain; direct source reads ground owned aliases, environment and worker proof behavior."
- **[[c6]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S004/LLD.md` — "S4 lifecycle ownership and dependency-minimal real runtime prerequisite remain unchanged."
- **[[c7]]** `step-output` `s4` — "Proposed runtime-store/runtime-acquire types, canonical external store, pinned distribution inventory, private format2 and all-consumer binding; no claim these new sources already exist."
- **[[c8]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/ISSUE.md` — "Approved coherent runtime correction scope; no host v2 daemon mutation or action-specific gating work."
- **[[c9]]** `convention` `AGENTS.md` — "Node22 canonical test coordinator, surrounding tests per task and full scoped regression after all tasks per user's instruction; human artifact gates retained."
- **[[c10]]** `code` `scripts/bootstrap-publish.cjs` — "Current helper executes only after archive verification but currently performs whole-tree comparison and direct rename; proposed correction replaces publication behavior, including loaded Windows bina"
- **[[c11]]** `step-output` `s6` — "ac1–ac6 are local issue acceptance groups; test strategies are planned subjects, not evidence of executed tests/native qualification."
- **[[c12]]** `code` `scripts/render-installer-bootstrap.mjs` — "Existing renderInstallerBootstrap uses fixed official runtime policy and digest-bound control assets; source templates are scripts/install.sh and scripts/install.ps1."
- **[[c13]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/LLD.md#3-data-model-changes` — "Section3.9: s1 defines schemas; s7 implements Windows transport. Existing bridge implementation ownership is external to this standalone correction."
- **[[c14]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S007/LLD.md#3-data-model-changes` — "Section3.4 owns the Windows bridge transport process and its runtime launch, handshake and correlated IPC behavior."
- **[[c15]]** `doc` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t8.md#registered-gate-and-execution-coverage-correction` — "T8 implementation checks and mapped cases pass, but required bridge execution is absent because the process belongs to unbuilt S7. Actual publisher probe and Retry entry execute; no successful product"
- **[[c16]]** `stakeholder` `User instruction in chat, 2026-11-28` — "keep widnows aside for now, focus on macos/linux. continue"
- **[[c17]]** `doc` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/manual-review-20261128/REVIEW-FEEDBACK.md` — "Findings4–6 need either a fix or an explicit design decision recorded in the LLD; the review also requests production/qualification separation, reliable fixtures and documentation of the same-user pat"
- **[[c18]]** `analyze-bundle` `In-session insrc_analyze_step completed foundation integrity pass, 2026-11-28; source pin4ec83d006f7b plus T5 rework` — "Six function anchors and one inferred prepareBundle caller,24 qualification selector hits. No retrieved rule text; usage graph incomplete36ignoredrelationships. Supplementary direct source reads/rg us"
- **[[c19]]** `doc` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/manual-review-20261128/REVIEW-FEEDBACK-ROUND2.md` — "The code fixes are accepted. LLD6 is acceptable after one correction (R2-1). The operator recovery mechanism is undefined."
- **[[c20]]** `analyze-bundle` `In-session insrc_analyze_step round2 runtime-foundation context, 2026-11-28` — "Nine existing runtime/store/publication/bootstrap/dev function/method anchors; incomplete verifier usage graph with36ignoredrelationships. Controller verifier caller supplemented by rg; no existing en"
- **[[c21]]** `doc` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/manual-review-20261128/REVIEW-FEEDBACK-ROUND3.md` — "Seal everything except the candidate root while it is in the stage, publish, and only then chmod0500the published root under the same lock; manual guidance needs rootwrite and no deletion; use one sha"
- **[[c22]]** `doc` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/manual-review-20261128/round3/release-audit/summary.json` — "Observed one published GitHubrelease daemon-v0.2.0 with legacy source installer/systemNode, no new shared-store readers in complete release/defaultmain trees. No universal guarantee about unknown cust"
- **[[c23]]** `analyze-bundle` `In-session insrc_analyze_step round3 publication/stage/fixture ownership context, 2026-11-28` — "Six existing API anchors, incomplete3inferred discard callers with36ignoredrelationships; nativeC/fixture source reads and rg supplement graph."
- **[[c24]]** `doc` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/manual-review-20261128/round3/native-publication-probe-result.json` — "Actual macOS ARM64 Node22.22.1 native binding refuses root0500cross-parent publication; root0700publishes unchanged inode with readonly descendants then root0500fsync. Child exits0and positively owned"
