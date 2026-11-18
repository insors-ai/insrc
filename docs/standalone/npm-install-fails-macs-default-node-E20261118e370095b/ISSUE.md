<!-- insrc:artifact ISSUE-e370095b52a98433 -->

# npm install fails on Macs with default node 24/26: redundant disturl in .npmrc obscures the real 22.22.1 header pin

## Reproduction

On a Mac where Homebrew's default `node` is 24.x/26.x (this machine: v26.5.1): clone the repo and run `npm install` (with CXXFLAGS=-std=c++17 unset or set — either way) in a clean checkout. fs-ext@2.1.1 (native addon, NAN-based, install script `node-gyp configure build`, dependency of packages/project-memory) compiles against the RUNNING node's V8 headers. Node 24/26 headers require C++20 (v8config.h) while the NAN/fs-ext C++ is C++17-era, so the build fails with ~20 clang errors (e.g. v8-maybe.h:106 'expected ( for function-style cast', 'fatal error: too many errors emitted') and `npm install` exits 1. Expected: install succeeds because .npmrc pins node-gyp to Node 22.22.1 headers (modules=127), matching the Node 22 the daemon runs under. Verified by isolated probe builds in /tmp/fs-ext-probe across three .npmrc variants (target-only builds clean and the addon loads under node@22; disturl-only or empty .npmrc both fail on 26.5.1 headers).

## Root cause

Two stacked facts. (1) The .npmrc comment claims the file pins builds to Node 22.22.1 headers, and the line that actually does that is target="22.22.1" + runtime="node" (node-gyp reads these as npm config pass-throughs; proven: with only those two lines, node-gyp resolves node_root_dir to ~/.cache/node-gyp/22.22.1 and fs-ext compiles cleanly). (2) The disturl="https://nodejs.org/dist" line is redundant — it equals npm's compiled-in default (npm config get disturl returns it with the line absent) and npm warns all three keys are 'Unknown project config'. It does not affect header selection but makes the pin look load-bearing when it is not, and it is the line a user removes when installs fail, which can confuse the real guard. Separately, fs-ext has no C++ standard in its binding.gyp, so on hosts without the 22.22.1 header pin (or without CXXFLAGS=-std=c++17, which our installer scripts add) the compile against Node 24/26 headers fails — that is the user-visible install failure.

## Fix intent

Remove the redundant disturl="https://nodejs.org/dist" line from the repo-root .npmrc (it is npm's built-in default and only produces an 'Unknown project config' warning) and extend the .npmrc comment to state explicitly that target="22.22.1" + runtime="node" are the effective pin that lands node-gyp headers on Node 22.22.1 — the guard that makes fs-ext@2.1.1 compile on Macs whose default node is 24/26.x. No dependency, script, or source changes.

## Citations

- **[[c1]]** `code` `.npmrc:21-24` — "target="22.22.1"
runtime="node"
disturl="https://nodejs.org/dist"
legacy-peer-deps="true""
- **[[c2]]** `code` `package-lock.json#node_modules/fs-ext` — ""node_modules/fs-ext": { "version": "2.1.1", "hasInstallScript": true, "dependencies": { "nan": "^2.21.0" } }"
- **[[c3]]** `code` `packages/project-memory/package.json` — "fs-ext 2.1.1 listed under packages/project-memory dependencies"
- **[[c4]]** `doc` `scripts/daemon-ctl.sh:227-230` — "fs-ext sets no C++ standard and does not build on the Node 22.22.1 headers without it; NATIVE_CXX_STD="-std=c++17""
- **[[c5]]** `convention` `/tmp/cfg-target_only.log, /tmp/cfg-disturl_only.log, /tmp/cfg-neither.log` — "Probe in /tmp/fs-ext-probe with node 26.5.1: .npmrc 'target only' -> node_root_dir=.../node-gyp/22.22.1, fs-ext builds clean (exit 0) and loads under node@22 (modules=127); 'disturl only' or no .npmrc"
