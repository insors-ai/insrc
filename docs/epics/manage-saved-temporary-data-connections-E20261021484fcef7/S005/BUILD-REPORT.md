# S005 full build and test report

Latest VS Code file-form correction: runtime commit `edf10ffe1`, extension **0.5.17**. Installable package: [insrc-vscode-0.5.17-s005-edf10ffe1.vsix](/Users/subhagho/work/projects/insors/insrc/vscode-plugin/insrc-vscode-0.5.17-s005-edf10ffe1.vsix). Native Browse, prominent File path, optional Label fallback and per-action disabled reasons are implemented. See FILE-FEEDBACK.md for current evidence and remaining daemon restrictions. Production Save/Test is still unavailable; no release prerequisite was promoted. The frozen full-build results below remain historical.

Frozen source: `b4f7a82cb44550ef55e522966c2237417bd15307`; tree `38ff9012a5dcbd6ec88b5a1c2cbad79c2c2234ad`. Node v22.23.2, JDK21. Source drift: 0 tracked files.

The user owns live UI validation after installation. Tasks26–29 remain pending; the earlier failed UI attempt is retained. No production release gate was enabled. No automated code-review workflow ran; builder manual inspection is recorded separately.

| Suite | Files | Tests | Pass | Fail | Cancel | Skip | TODO |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Backend (including native bridge wrappers) | 868 | 7039 | 6888 | 13 | 1 | 134 | 3 |
| Explicit VS Code extension | 115 | 1448 | 1423 | 2 | 15 | 8 | 0 |

Full JetBrains JUnit: 468 tests, 1 failures, 0 errors, 1 skipped. Native cases behind Node bridge wrappers are not added again to the Node totals.

The original sweep used INSRC_LOG_LEVEL=error. A separate diagnostic run of the two logging-sensitive files under default logging passed all eight tests; original failures remain unchanged in the table. Source-inventory, CLI/worker/protected-file/import-graph and any other unresolved failures remain recorded individually in summary.json. Historical S003/S004 totals and prerequisites were not relabeled.

Build and package commands:

- backend-build: exit 0; timeout False; raw output `backend-build.txt`.

- extension-typecheck: exit 0; timeout False; raw output `extension-typecheck.txt`.

- extension-bundle: exit 0; timeout False; raw output `extension-bundle.txt`.

- jetbrains-test-build: exit 1; timeout False; raw output `jetbrains-test-build.txt`.

- jetbrains-plugin-verifier: exit 1; timeout False; raw output `jetbrains-plugin-verifier.txt`.

- vscode-vsix: exit 0; timeout False; raw output `vscode-vsix.txt`.

- jetbrains-package: exit 0; timeout False; raw output `jetbrains-package.txt`.

Installable artifacts (built locally, not installed or published):

- [insrc-jetbrains-0.5.2-s005-b4f7a82cb.zip](/Users/subhagho/work/projects/insors/insrc/jetbrains-plugin/build/distributions/insrc-jetbrains-0.5.2-s005-b4f7a82cb.zip) — SHA256 `05fef79e1f7fea853a68a3aef1297b9173ae2aabfbfa04b83be6b26bc828f8d4`.

- [insrc-vscode-0.5.16-s005-b4f7a82cb.vsix](/Users/subhagho/work/projects/insors/insrc/vscode-plugin/insrc-vscode-0.5.16-s005-b4f7a82cb.vsix) — SHA256 `d72c043d2716c937d4791ed30d777752610e10181faeb50d381fdc0397592115`.

Raw per-file logs, manifests, JUnit XML and original report: `evidence/t32/run-b4f7a82cb`. The complete20subject matrix is `acceptance-matrix.json`. Manual checklist: `MANUAL-ACCEPTANCE.md`. Production admission remains fail-closed pending upstream S001/provider/worker-affinity/SQLServer and genuine client acceptance.

Post-sweep corrections and revalidation:

- Two legacy TypeScript tests were corrected without production changes: include the five Connections commands and hold a test-owned event-loop reference for unrefed deadline checks. All 27 focused tests passed against the same frozen product source. The initial attempts and original totals remain recorded.
- The native descriptor guard now expects the three Ops children plus Connections. Its 3 focused tests passed. The complete JDK21 `test build` was then repeated on a separate copy with only that test changed: **468 tests, 467 passed, 1 skipped, 0 failures/errors; build passed**. Production source was unchanged.
- Newer-IDE plugin verification remains pending: offline resolution could not obtain IntelliJ 2024.3.7. No compatibility success is claimed.
- Both final archives passed CRC, descriptor/command/class presence, and content-boundary checks; hashes are in `evidence/t32/summary.json`. Neither plugin has been installed or published.

The full sweep remains non-green because its original failures/cancellations are retained and broader unresolved checks remain. Source inventory needs producer review; CLI/worker/protected-file/import-graph checks and macOS-incompatible `/proc` test behavior are outside this consumer build. Live UI, real source-service coverage, SQLServer and independent code-review approval remain pending.
