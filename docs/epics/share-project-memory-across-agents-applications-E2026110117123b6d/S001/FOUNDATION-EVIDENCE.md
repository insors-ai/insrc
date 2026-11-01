# S1 foundation acceptance evidence

The standalone `@insrc/project-memory` foundation is implemented in `packages/project-memory`. This record covers S1 only; independent code review and BUILD completion approval follow.

## Completed checks

| Check | Actual result | Evidence |
| --- | --- | --- |
| Combined package suite | 18 passed; 0 failed/skipped/cancelled/todo; natural exit | [macOS TAP](evidence/macos-combined.tap) |
| Independent TS/ESM tarball consumer | Public typecheck, explicit open/ready/drain/close and host-resource preservation passed | `packed-isolated-node22-consumer` in the combined TAP |
| Missing native dependency | Pure import succeeds; explicit open rejects NOT_READY | `packed-native-missing-import-versus-open` |
| Native contention and recovery | Same process, duplicate package copies, worker threads, child process, aliases, stopped owner, killed owner and worker termination passed | `contention.test.ts`, `ownership.test.ts`, combined TAP |
| Model serialization and lifecycle | Completion/embedding serialization, bounded overload, queued cancellation, ignored abort, incomplete drain and idempotent close passed | `model-dispatcher.test.ts`, `runtime.test.ts`, combined TAP |
| Linux/ext4 qualification | Node 22.22.1, ABI 127; 10 native/lifecycle and 3 packed tests passed, no skips | [Successful run](https://github.com/insors-ai/insrc/actions/runs/41343486195), [run identity](evidence/linux/run.json), [platform](evidence/linux/platform.log), [native TAP](evidence/linux/native-lifecycle.tap), [packed TAP](evidence/linux/packed-consumer.tap) |
| Root package-first build | Exit 0; package tsc precedes backend tsc, model validation and asset copying | [build output](evidence/root-build.txt) |

Commands: `npm test --workspace @insrc/project-memory` and `npm run build`, with `/opt/homebrew/opt/node@22/bin` first on PATH. Local executable resolved to `/opt/homebrew/Cellar/node@22/22.23.2/bin/node`, Node 22.23.2, ABI 127; project and temporary roots both reported APFS statfs type 26. Root native headers target 22.22.1 per the existing .npmrc. Resolved dependency: fs-ext 2.1.1 / nan 2.30.0. External consumers rebuilt the native dependency independently with documented CXXFLAGS=-std=c++17 rather than inheriting backend npm configuration.

## Acceptance mapping and boundary

- **ac1:** `contracts.test.ts` checks strict public declarations, pure import and emitted local dependency boundaries. `packed.test.ts` installs a real tarball into an independent directory, compiles its public consumer, checks the export/asset allowlist and tests honest native-load failure. Root build evidence preserves backend output and steps.
- **ac2:** `configuration.test.ts`, `ownership.test.ts`, `contention.test.ts` and `runtime.test.ts` prove canonical identity, one real kernel owner, independent roots, host-resource preservation, crash release, stopped-owner exclusion and safe cleanup. Linux qualification independently repeats the real native and lifecycle checks. The archived-evidence test verifies zero skips and that the current source/workflow equals the qualified revision.

The nine source modules import only package-local modules, Node built-ins, and lazily loaded fs-ext. The public entry does no filesystem/provider/native startup on import. There are no imports of backend src, daemon, config, shared paths/logger/types, index graph or vector stores. Models/policy/logger are supplied by the host and remain host-owned. Source/declaration closure and packed allowlisting passed the combined contract tests.

S1 persists only layout.json and the persistent ownership file. Durable journal, LanceDB memory store, semantic normalization/dedupe/compression, recall, IPC executable, agent adapters and daemon integration remain later-story work. All five data methods reject NOT_READY; foundation readiness is not data-capability readiness. The package exports only its main contract and explicit Node host, with no unfinished IPC export.

## Qualification corrections and limits

The original fs-ext asynchronous callback crashed under concurrent worker isolates. The adapter now uses synchronous **nonblocking** exnb flock, and both macOS and Linux worker tests pass, including terminated-worker recovery. The Promise-shaped private adapter still awaits completion before descriptor cleanup. Unsafe FIFO metadata is opened nonblocking and refused before reading.

The first Linux run [41343237150](https://github.com/insors-ai/insrc/actions/runs/41343237150) failed because the worker source loader did not resolve a TypeScript .js import outside the repository. Peers now consume the actual built JavaScript entry. The successful rerun used an isolated S1 branch to exclude another stream's unpushed commit; its package/workflow source is identical to the current implementation.

The first root-build attempt and t9 validation overlapped incomplete changes in the other stream and saw missing evidence/origin fields in analyze outputs. Those files were not changed by this story. After the other stream's edits settled, the root build passed; t9 validation then passed against that corrected tree.

Filesystem qualification is local APFS/macOS and ext4/Linux only. ext-family statfs magic alone does not identify an exact Linux subtype, so deployment retains the documented ext4 precondition. Uncooperative external mutation of a live directory and overlapping external cleanup roots remain unsupported host-precondition violations. Native compilation requires the documented toolchain. No tests invoke real LLMs or cloud REST.

No full repository test sweep was run per task. S1 runs focused package checks and the preserved root build; broader feature testing remains sequenced after the feature's remaining stories. No npm publish occurred.
