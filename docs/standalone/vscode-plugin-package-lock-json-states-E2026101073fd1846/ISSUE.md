<!-- insrc:artifact ISSUE-73fd1846a6238e1c -->

# The extension's lock file states a version its manifest left behind

## Reproduction

Read the two files of the VS Code extension. Observed on 2026-10-10: `vscode-plugin/package.json` states version 0.5.13, the version published to the Marketplace; `vscode-plugin/package-lock.json` states 0.4.8 in both of its own version fields (at the top and in the root package entry). Expected: the lock file states the version of the manifest it locks.

## Root cause

The extension's version was raised release after release in the manifest alone, and the lock file was not regenerated or edited with it. Which step of the release leaves it out was not looked into: the release is made by hand with a package command and a publish command, and neither rewrites the lock file's own version.

## Fix intent

The lock file states the manifest's version, and a release that raises the version leaves the two in step. Nothing about the dependencies the lock file pins changes.

## Citations

- **[[c1]]** `code` `vscode-plugin/package.json` — ""version": "0.5.13","
- **[[c2]]** `code` `vscode-plugin/package-lock.json` — ""version": "0.4.8","
- **[[c3]]** `doc` `docs/plans/handover-2026-10-10.md` — "`vscode-plugin/package-lock.json` has a stale `version` field (0.4.8)."
