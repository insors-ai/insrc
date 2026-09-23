<!-- insrc:artifact PLAN-b6c90b3e0240d36c-s2 -->

# Plan: E20260923b6c90b3e:S002

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790190641927-xrt840`
**LLD effective hash:** `0a15cb12814d...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Build the pure installed-commit reader (readInstalledCommit) over an injected exec seam | S | — | unit: readInstalledCommit: injected exec returning a sha (+ trailing newline) -> the bare trimmed sha; unit: readInstalledCommit: the injected exec is invoked with git args resolving to `-C <root> rev-parse HEAD`; unit: readInstalledCommit: an exec that THROWS (non-git / non-zero exit / ENOENT) -> '' , never throws; unit: readInstalledCommit: no root arg resolves DAEMON_ROOT = $INSRC_DAEMON_ROOT ?? ~/.insrc/daemon (via an INSRC_DAEMON_ROOT env override) | [[c1]] [[c2]] |
| 2 | **`t2`** Add the additive DaemonStatus.installedCommit field + wire the daemon.status handler | S | `t1` | unit: daemon.status status object includes installedCommit populated from the (injected/stub) reader; unit: daemon.status with a reader returning '' yields installedCommit:'' with the rest of the status intact and never throws; unit: daemon.status change leaves sc1 fields (daemon.update/updateOutcome) untouched | [[c3]] [[c4]] |

### E20260923b6c90b3e:S002:T001 — Build the pure installed-commit reader (readInstalledCommit) over an injected exec seam

New module src/daemon/installed-commit.ts exporting readInstalledCommit(root?, deps?): resolve DAEMON_ROOT ($INSRC_DAEMON_ROOT ?? ~/.insrc/daemon, its own env-var+default — NOT importing s1's update-runner) and run `git -C <root> rev-parse HEAD` via an injected exec seam (default execFileSync-based), .trim() the sha, and return '' on ANY failure (non-git/missing root, git ENOENT, non-zero exit, thrown exec) inside try/catch so it NEVER throws. Mirrors the sync execFileSync git idiom (migrate-docs-tree.ts:317) + the exact rev-parse HEAD command (maintenance.ts:101).

**Acceptance checks:**
- readInstalledCommit(root, {exec}) returns the trimmed sha for a valid HEAD (trailing newline stripped)
- the injected exec is invoked with git args resolving to `-C <root> rev-parse HEAD`
- any exec failure (throw / non-git / ENOENT) returns '' and never throws
- with no root arg it resolves DAEMON_ROOT = $INSRC_DAEMON_ROOT ?? ~/.insrc/daemon
- does NOT import src/daemon/update-runner.ts (sc2 independent of sc1); tsc clean

### E20260923b6c90b3e:S002:T002 — Add the additive DaemonStatus.installedCommit field + wire the daemon.status handler

Add installedCommit:string to the DaemonStatus interface (src/shared/types.ts, at the existing DaemonStatus — unshifted by S001) and set it in the daemon.status handler by calling readInstalledCommit(). Locate the handler BY NAME (the 'daemon.status': async () => {...} entry carrying the 'best-effort; status should never throw' fs-stat catch, now ~src/daemon/index.ts:944 after S001's line drift), NOT the stale :922 anchor. The handler needs no new try/catch — readInstalledCommit itself never throws — so daemon.status's never-throw guarantee is preserved. Additive only: no other field changes, sc1 (daemon.update/updateOutcome) untouched.

**Acceptance checks:**
- src/shared/types.ts DaemonStatus carries a required installedCommit:string field
- the daemon.status handler sets installedCommit from readInstalledCommit() and returns it on the status object
- a reader returning '' yields installedCommit:'' with the rest of the status intact (handler never throws)
- no other DaemonStatus field changed; daemon.update/updateOutcome (sc1) untouched
- tsc clean across daemon + shared

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| readInstalledCommit with an exec seam returning a sha (+ trailing newline) -> the bare trimmed sha | `t1` |
| readInstalledCommit runs `git -C <root> rev-parse HEAD` — the injected exec records the exact command+argv | `t1` |
| readInstalledCommit with an exec seam that THROWS (non-git root / non-zero exit / git ENOENT) -> '' , never throws | `t1` |
| readInstalledCommit with no root arg resolves DAEMON_ROOT = $INSRC_DAEMON_ROOT ?? ~/.insrc/daemon | `t1` |
| the status object includes installedCommit populated from the (injected) reader | `t2` |
| a reader that returns '' (undeterminable) yields installedCommit:'' with the rest of the status intact — the handler still resolves, never throws | `t2` |
| sc1 fields (daemon.update/updateOutcome) are untouched by the status change | `t2` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 dataModel: readInstalledCommit new pure module (src/daemon/installed-commit.ts) over an injected exec seam, best-effort, never throws`
- **[[c2]]** `convention` `s1 convention: sync execFileSync git idiom (src/workflow/migrate-docs-tree.ts:317) + exact `git -C <root> rev-parse HEAD` (src/cli/services/maintenance.ts:101) + DAEMON_ROOT (maintenance.ts:34)`
- **[[c3]]** `prior-artifact` `LLD s2 dataModel: DaemonStatus field-add installedCommit:string (src/shared/types.ts) + sc2 interaction`
- **[[c4]]** `analyze-bundle` `s1 sizing: daemon.status handler located by name (the 'status should never throw' block, ~src/daemon/index.ts:944 post-S001-drift) sets installedCommit; never-throw preserved`
