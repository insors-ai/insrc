<!-- insrc:artifact ISSUE-ca9883ca42f4d73f -->

# Daemon update never retries a failed npm install, and fs-ext fails to build on the Node 22 target

## Reproduction

1. On an installed daemon (~/.insrc/daemon), run a daemon update whose pull changes package-lock.json while a native dependency cannot compile. Observed in practice: fs-ext 2.1.1 (a dependency of packages/project-memory) fails to build against the Node 22.22.1 headers that .npmrc pins, so `npm install` exits non-zero and the update reports 'npm install failed'.
2. The failed install rewrote package-lock.json; the update resets it to origin, and node_modules exists (partially installed).
3. Run the update again (or after the next push).
Observed: the update logs 'npm install: package-lock.json unchanged; skipping', builds, and restarts with native modules (tree-sitter grammars, etc.) missing or unbuilt; every later update skips the install the same way until someone runs npm by hand (`npm install --ignore-scripts` + `npm rebuild <grammars>` was the manual workaround).
Expected: an update after a failed install installs again, and `npm install` succeeds on the pinned Node 22 target.

## Root cause

(a) The update decides whether to install from two facts only: whether the hash of package-lock.json changed across the pull, or whether node_modules is missing (src/cli/services/maintenance.ts:121-123). Neither records whether the last install succeeded. After a failed install, node_modules exists and the lockfile has been reset to origin's copy, so the next update sees 'unchanged' and skips the install (src/cli/services/maintenance.ts:130) - permanently. (b) The install fails in the first place because fs-ext 2.1.1, declared by packages/project-memory/package.json:36, compiles native code that does not build against the Node 22.22.1 headers targeted by .npmrc (target="22.22.1", packages/project-memory requires node >=22.22.1 <23), whose V8 headers need C++17.

## Fix intent

(a) An update installs whenever the last install did not complete successfully, not only when the lockfile changed: the update keeps a durable record of a successful install for the current lockfile, and a failed or interrupted install leaves that record absent so the next update installs again. (b) `npm install` succeeds on the pinned Node 22.22.1 target: the project-memory package's file-locking dependency builds there (a working version or build configuration, or a replacement) - decided together with the owner of the project-memory package (Epic 17123b6d). Both parts are verified on a clean install and on the installed daemon's update path.

## Citations

- **[[c1]]** `code` `src/cli/services/maintenance.ts:121-131` — "const lockChanged = lockBefore !== lockAfter || !existsSync(join(root, 'node_modules'));
if (opts.skipInstall !== true && lockChanged) { ... } else onLog('npm install: package-lock.json unchanged; ski"
- **[[c2]]** `code` `src/cli/services/maintenance.ts:87-99` — "const lockBefore = (await capture('git', ['-C', root, 'hash-object', 'package-lock.json'])).stdout.trim(); ... await capture('git', ['-C', root, 'checkout', '--', 'package-lock.json']);"
- **[[c3]]** `code` `packages/project-memory/package.json:36` — ""fs-ext": "2.1.1""
- **[[c4]]** `code` `packages/project-memory/package.json:7-8` — ""engines": { "node": ">=22.22.1 <23""
- **[[c5]]** `code` `.npmrc:21` — "target="22.22.1""
- **[[c6]]** `stakeholder` `Observed during the Epic c2ba6fa6 s9 daemon update on 2026-11-02: npm install failed on fs-ext; worked around with npm install --ignore-scripts and npm rebuild of the grammars in ~/.insrc/daemon.`
