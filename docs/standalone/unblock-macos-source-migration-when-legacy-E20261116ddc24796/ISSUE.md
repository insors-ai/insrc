<!-- insrc:artifact ISSUE-ddc24796d6d788e6 -->

# Unblock macOS source migration when the legacy daemon owns an esbuild helper

## Reproduction

On Apple Silicon macOS, build and start source checkout aaae72fd7 with Node 26.5.1 and --import tsx/esm. Its direct esbuild service child runs from the checkout. Run the packaged signed installer against the running daemon. The installer builds its candidate, then returns “legacy cutover refused: an older launcher, updater or daemon still references the legacy checkout.” The prior daemon and seeded repository remain available. The same child was observed on the installed Mac. [[c3]] [[c4]]

## Root cause

The pre-drain cutover census permits the pinned predecessor PID. Its normal tsx esbuild child points into the old checkout and falls under the rule that rejects older launchers and updaters. The migration runs that census before sending the cooperative drain request. [[c1]] [[c2]]

## Fix intent

Recognize only the expected esbuild service child of the verified predecessor before drain, and require its verified exit before candidate activation. Preserve rejection of unrelated checkout processes and fail closed on ambiguous ownership. Add focused regression coverage for both outcomes and rerun the signed source migration, managed restart, MCP readiness and seeded state checks on a disposable VM. [[c1]] [[c2]]

## Citations

- **[[c1]]** `code` `src/daemon/legacy-cutover-admission.ts:191`
- **[[c2]]** `code` `src/daemon/managed-update-recovery.ts:382`
- **[[c3]]** `doc` `/tmp/insrc-v2-source-qualification.nESUDz/legacy-migration.log`
- **[[c4]]** `doc` `/tmp/insrc-v2-source-qualification.nESUDz/cutover-refusal-evidence.log`
