# Daemon update source (repo URL and branch)

Story `LLD-8b5693528b025a55-S001` (standalone, triaged `small`): the daemon update follows a configured git remote URL and branch, so a fork or a feature branch can be deployed. Config keys: `daemonUpdate.repoUrl` and `daemonUpdate.branch` in `~/.insrc/config.json`; empty or absent keeps today's behaviour.

## LLD approved with an override (2026-10-22)

The daemon review of the LLD blocked on round 1 (1 HIGH, 2 MED, all valid). The owner approved with an override on the choice "approve with an override and record the fixes as binding requirements". The plan and the build carry these:

1. **A branch outside the clone's refspec is fetched with an explicit refspec.** The installer clones with `--single-branch` (`scripts/insrc-daemon-install.sh:191`), so `git fetch origin <other>` writes FETCH_HEAD only and never creates `origin/<other>`; the existing `rev-parse origin/<branch>` and the planned `checkout -B <branch> origin/<branch>` would fail. Before the fetch, run `git remote set-branches --add origin <branch>` (or fetch `+refs/heads/<branch>:refs/remotes/origin/<branch>`), in both `scripts/daemon-ctl.sh` and `src/cli/services/maintenance.ts`.
2. **The order of the sync is fixed, in both implementations:** discard the `package-lock.json` churn, dirty-tree check, `git remote set-url origin` (only when the URL differs), fetch, local-only-commit check (`git branch -r --contains HEAD` empty), then `checkout -B <branch> origin/<branch>` when the branch differs, else the fast-forward. A dirty tree must never have its origin rewritten.
3. **The integration fixtures clone with `--single-branch`**, as the installer does, and include a branch other than the cloned one and an unchanged URL (no `set-url`).
