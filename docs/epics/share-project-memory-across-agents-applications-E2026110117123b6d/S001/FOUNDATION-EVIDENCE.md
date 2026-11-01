# S1 foundation acceptance evidence

The standalone `@insrc/project-memory` foundation is implemented in `packages/project-memory`. This record covers S1 only; independent code review and BUILD completion approval follow.

## Completed checks

| Check | Actual result | Evidence |
| --- | --- | --- |
| Combined package suite | 19 passed; 0 failed/skipped/cancelled/todo; natural exit | [macOS TAP](evidence/macos-combined.tap) |
| Independent TS/ESM tarball consumer | Public typecheck, explicit open/ready/drain/close and host-resource preservation passed | `packed-isolated-node22-consumer` in the combined TAP |
| Missing native dependency | Pure import succeeds; explicit open rejects NOT_READY | `packed-native-missing-import-versus-open` |
| Native contention and recovery | Same process, duplicate package copies, worker threads, child process, aliases, stopped owner, killed owner and worker termination passed | `contention.test.ts`, `ownership.test.ts`, combined TAP |
| Model serialization and lifecycle | Completion/embedding serialization, bounded overload, queued cancellation, ignored abort, incomplete drain and idempotent close passed | `model-dispatcher.test.ts`, `runtime.test.ts`, combined TAP |
| Linux/ext4 qualification | Node 22.22.1, ABI 127; 11 native/lifecycle and 3 packed tests passed, no skips | [Successful run](https://github.com/insors-ai/insrc/actions/runs/41346411241), [run identity](evidence/linux/run.json), [platform](evidence/linux/platform.log), [native TAP](evidence/linux/native-lifecycle.tap), [packed TAP](evidence/linux/packed-consumer.tap) |
| Root package-first build | Exit 0; package tsc precedes backend tsc, model validation and asset copying | [build output](evidence/root-build.txt) |

Commands: `npm test --workspace @insrc/project-memory` and `npm run build`, with `/opt/homebrew/opt/node@22/bin` first on PATH. Local executable resolved to `/opt/homebrew/Cellar/node@22/22.23.2/bin/node`, Node 22.23.2, ABI 127; project and temporary roots both reported APFS statfs type 26. Root native headers target 22.22.1 per the existing .npmrc. Resolved dependency: fs-ext 2.1.1 / nan 2.30.0. External consumers rebuilt the native dependency independently with documented CXXFLAGS=-std=c++17 rather than inheriting backend npm configuration.

## Acceptance mapping and boundary

- **ac1:** `contracts.test.ts` checks strict public declarations, pure import and emitted local dependency boundaries. `packed.test.ts` installs a real tarball into an independent directory, compiles its public consumer, checks the export/asset allowlist and tests honest native-load failure. Root build evidence preserves backend output and steps.
- **ac2:** `configuration.test.ts`, `ownership.test.ts`, `contention.test.ts` and `runtime.test.ts` prove canonical identity, one real kernel owner, independent roots, host-resource preservation, crash release, stopped-owner exclusion and safe cleanup. Linux qualification independently repeats the real native and lifecycle checks. The archived-evidence test verifies zero skips and that the current source/workflow equals the qualified revision.

The ten source modules import only package-local modules, Node built-ins, and lazily loaded fs-ext. The public entry does no filesystem/provider/native startup on import. There are no imports of backend src, daemon, config, shared paths/logger/types, index graph or vector stores. Models/policy/logger are supplied by the host and remain host-owned. Source/declaration closure and packed allowlisting passed the combined contract tests.

S1 persists only layout.json and the persistent ownership file. Durable journal, LanceDB memory store, semantic normalization/dedupe/compression, recall, IPC executable, agent adapters and daemon integration remain later-story work. All five data methods reject NOT_READY; foundation readiness is not data-capability readiness. The package exports only its main contract and explicit Node host, with no unfinished IPC export.

## Qualification corrections and limits

The original fs-ext asynchronous callback crashed under concurrent worker isolates. The adapter now uses synchronous **nonblocking** exnb flock, and both macOS and Linux worker tests pass, including terminated-worker recovery. The Promise-shaped private adapter still awaits completion before descriptor cleanup. Unsafe FIFO metadata is opened nonblocking and refused before reading.

The first Linux run [41343237150](https://github.com/insors-ai/insrc/actions/runs/41343237150) failed because the worker source loader did not resolve a TypeScript .js import outside the repository. Peers now consume the actual built JavaScript entry. The successful rerun used an isolated S1 branch to exclude another stream's unpushed commit; its package/workflow source is identical to the current implementation.

The first root-build attempt and t9 validation overlapped incomplete changes in the other stream and saw missing evidence/origin fields in analyze outputs. Those files were not changed by this story. After the other stream's edits settled, the root build passed; t9 validation then passed against that corrected tree.

Filesystem qualification is local APFS/macOS and ext4/Linux only. ext-family statfs magic alone does not identify an exact Linux subtype, so deployment retains the documented ext4 precondition. Uncooperative external mutation of a live directory and overlapping external cleanup roots remain unsupported host-precondition violations. Native compilation requires the documented toolchain. No tests invoke real LLMs or cloud REST.

No full repository test sweep was run per task. S1 runs focused package checks and the preserved root build; broader feature testing remains sequenced after the feature's remaining stories. No npm publish occurred.

## First independent review corrections

The [first review](evidence/review-round-1.md) blocked on native loading preceding root/filesystem qualification and identified cleanup/readability issues. Corrections are committed in de4da9d4c:

- Root and filesystem preparation now precede native loading. The missing-native packed test also supplies an invalid existing layout and proves INVALID_REQUEST wins before any attempted addon load.
- Failed construction returns sanitized NOT_READY only after verified ownership release; failed cleanup explicitly takes priority as STORE_UNAVAILABLE.
- Per-call timeout, cancellation and settlement live in ModelCall; ModelDispatcher owns only FIFO admission/lane bookkeeping. Ignored abort still retains the lane until underlying settlement.
- All already-quiescent participants get cleanup attempted in dependency order. Any failure retains ownership and rejects close. A new multi-participant regression verifies both attempts and retained ownership. A failed quiescence barrier still prevents resource release.
- A shared private-file predicate now validates regular/single-link/uid/private-permission requirements in both layout and ownership paths.

Refreshed evidence: combined package 19/19, root build exit 0, Linux 11 native/lifecycle plus 3 packed tests, no skips. The qualified Linux revision 9d44e75bfd1bf04602bd38c69087c3cf7fb181dd has identical current package source and qualification workflow. Review round 2 follows these results.

## Second independent review clarification

[Round 2](evidence/review-round-2.md) used full graph grounding and found no adherence, conventions or coverage issues. Its sole MED questioned two filesystem qualifications in prepareRoot. They are deliberately separate phases: validateNearestExistingFilesystem rejects an unsupported target before mkdir (and may inspect only an existing ancestor when the requested root is absent); the later statfs reads the realpath-resolved directory after creation. A pre-creation ancestor result must not be reused as proof of the final owned root's filesystem. The private helper is renamed and both phases are documented; neither check is removed. This preserves t3's fail-fast requirement and its actual-resolved-target requirement. There is no cached/stale type argument: each validateFilesystem receives its own awaited statfs result.

After the filesystem-phase clarification, package tsc and both focused configuration tests passed. Final-source Linux run 41346411241 also passed all 14 checks; the qualification test verifies its source/workflow equality. The 19-test combined macOS run and root-build success above precede this private-helper rename/comment clarification; no behavior or public contract changed in that clarification.

## Third independent review and completion decision

[Round 3](CR.md) used full graph grounding and returned WARN: HIGH 0, MED 2, LOW 0. Adherence, conventions and coverage have no findings. No fourth review is started under the project's three-round cycle limit. BUILD completion remains unapproved.

Builder assessment of the remaining quality warnings:

1. **acquireOwnership coordination complexity:** the reviewer recommends splitting new/existing layout branches based on seven callees. The function already delegates native binding, read-only classification, file identity, guarded initialization and descriptor cleanup to helpers while keeping one descriptor's acquisition/unwind lifetime together. No failing behavior or cleanup path is identified. This is maintainability advice rather than a demonstrated correctness defect. The reported ownership.ts:1001 location is not a valid source line.
2. **Repeated classifyLayout:** prepareRoot calls classification only as read-only validation and returns RootIdentity; it does not return or cache a new/existing decision. acquireOwnership validates again before creating a lock file in a candidate root, and initializeLayout classifies under the acquired guard before deciding whether to initialize. Another cooperating opener may complete initialization between preflight and acquisition; the later classification correctly observes that new state. Reusing the preflight decision would weaken this safety protocol. The extra reads are intentional correctness checks, consistent with the project's accuracy-first principle.

The builder recommends treating these two warnings as documented nonblocking advice. The user may approve BUILD with that explicit override, authorize another review cycle, or change course. Earlier rounds corrected native-load ordering, explicit failed-startup cleanup priority, model-call/lane separation, multi-participant cleanup and duplicated file-safety validation, and clarified filesystem preflight versus final canonical-root qualification. All ten task gates passed; final evidence remains 19 combined local tests, focused configuration tests after the comment/helper rename, 14 current-source Linux checks and a successful preserved root build.
