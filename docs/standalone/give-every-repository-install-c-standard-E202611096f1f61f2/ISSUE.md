<!-- insrc:artifact ISSUE-6f1f61f26d4d6169 -->

# Give every repository install the C++ standard fs-ext needs

## Reproduction

In a fresh checkout on macOS with Node 22 and Apple clang 21, run `npm ci` at the repository root with no CXXFLAGS set.

Observed on 2026-11-10: the install stops while compiling fs-ext, with errors in the Node 22.22.1 V8 headers such as "no template named 'is_void_v' in namespace 'std'". The same command with `CXXFLAGS=-std=c++20` completes.

Expected: every supported way of installing the repository compiles fs-ext.

Not reproduced: the two GitHub workflows that run a bare `npm ci` use Ubuntu, where the failure has not been observed. A third workflow on Ubuntu already sets the flag.

## Root cause

The project-memory package depends on the native package fs-ext, whose build file sets no C++ standard, so the compiler's default applies. Under Apple clang that default is too old for the Node 22.22.1 headers. The daemon install paths work around this by asking for C++17 through CXXFLAGS, through `NATIVE_CXX_STD` in the maintenance service and the install scripts, and the project-memory workflow does the same. The other install paths never got that setting: the main CI workflow, the root install in the VS Code plugin workflow, and the manual `npm install` in the build instructions.

## Fix intent

Every supported way of installing the repository must ask for the same C++ standard the daemon install paths already use, so fs-ext compiles in CI and when a developer follows the build instructions. The daemon install paths keep their existing behaviour. The fix must confirm on macOS that a clean install with the documented command succeeds.

## Citations

- **[[c1]]** `code` `packages/project-memory/src/native.ts:15` — "const nativeModule = 'fs-ext';"
- **[[c2]]** `code` `src/cli/services/maintenance.ts:58` — "export const NATIVE_CXX_STD = '-std=c++17';"
- **[[c3]]** `code` `scripts/daemon-ctl.sh:157` — "NATIVE_CXX_STD="-std=c++17""
- **[[c4]]** `code` `scripts/insrc-daemon-install.sh:205` — "# install installs again. CXXFLAGS asks for C++17 (NATIVE_CXX_STD there): fs-ext"
- **[[c5]]** `code` `.github/workflows/project-memory.yml:46` — "CXXFLAGS: -std=c++17"
- **[[c6]]** `code` `.github/workflows/ci.yml:38` — "run: npm ci"
- **[[c7]]** `code` `.github/workflows/vscode-plugin.yml:36` — "run: npm ci"
