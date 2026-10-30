# File connection form feedback — 2026-10-30

User requested implementation after reporting a hidden/unclear Path field, no file picker, uncertainty about Label, and disabled Test/Save after entering a path. This is a manual-acceptance correction to S005 t18/t20/t30; prior release prerequisites remain pending.

File sources now render File path first in Connection fields, with a clear required label, example path and source-file help. Browse opens the native VS Code single-file picker through an injected extension-host port. The renderer cannot request arbitrary native dialogs or RPC. Cancellation does nothing; duplicate dialogs are refused; late results cannot affect changed/hidden/closed/replaced drafts or a new root/epoch. Typing a path remains supported.

Label is explicitly optional, explains its list-name purpose and falls back to Connection ID when blank. Save/Test now have persistent individual explanations and accessible descriptions/tooltips. Missing ID/path/invalid fields and unavailable daemon action features are distinguished. Host-side checks refuse invalid file submissions even if a disabled action intent is forged. A complete Parquet draft with an explicitly empty Label enables both actions on an enabled daemon and completes one signed Save with no legacy fallback. The signed fixture injects runtime factories; it is not real source/worker acceptance evidence.

Current production capability read: v2 with safe-read and driver-descriptors only. Its release prerequisites still block Save/Test. This change does not bypass gates or claim production creation is fixed; the user can edit a local draft and see the exact restriction. Genuine S001/provider/worker-affinity/SQLServer/client acceptance work remains independent.

Extension version raised to 0.5.17 so the corrected UI is distinguishable from 0.5.16. A daemon update alone does not replace the VS Code extension. No plugin installed, daemon restarted, release prerequisite promoted or deprecated IDE work added.

Validation so far: 32 Connections tests passed; after the blank-label display correction, all 6 host tests passed again. Extension TypeScript noEmit passed. Regression coverage includes picker cancel/late edits/hidden view, missing-input refusal, explicit blank Label, enabled Save/Test, signed Saved creation, and per-action disabled reasons against metadata-only capabilities. Canonical implementation definitions and generated UX preview were updated; live rendering remains user acceptance work.


Runtime source commit: `edf10ffe1`. The installable archive is `vscode-plugin/insrc-vscode-0.5.17-s005-edf10ffe1.vsix`, built from a clean temporary git archive of that commit. SHA256: `43097bc3d4caa9c1cfd2ce15d22d33cdbc7a2cc1eb55f7ccc7f6b3d5e85a742f`. Prepublish, typecheck and bundle passed; archive CRC, version, native picker/new form text and source/node_modules exclusion passed. Both release/artifact guard tests passed. No installed extension or daemon was changed.


Final extension sweep on the committed snapshot: 116 files attempted with 60-second per-file deadlines. Completed-file TAP totals: 1332 tests, 1317 passed, 3 failed, 12 skipped. The chat-panel file timed out and has no final totals; partial cases are excluded. Failures remain in the same unrelated areas recorded for the previous feedback sweep: macOS /proc assumptions in cli-adapter, stale repoRegisterProviders message expectations in detail-renderers, and a stale repo-config import assertion in workspace/activation. This sweep is not green. Package boundary tests passed 11/11. Exact per-file outcomes and raw output: evidence/file-feedback/sweep/. No backend/native product code changed; their prior full-sweep results remain historical.

The tracked t18 validation passed all checks, root/extension typechecks, the host suite and compatibility suite. This is task validation, not independent code-review approval or live UI acceptance.
