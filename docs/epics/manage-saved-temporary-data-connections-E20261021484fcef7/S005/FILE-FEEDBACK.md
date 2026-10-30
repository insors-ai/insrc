# File connection form feedback — 2026-10-30

User requested implementation after reporting a hidden/unclear Path field, no file picker, uncertainty about Label, and disabled Test/Save after entering a path. This is a manual-acceptance correction to S005 t18/t20/t30; prior release prerequisites remain pending.

File sources now render File path first in Connection fields, with a clear required label, example path and source-file help. Browse opens the native VS Code single-file picker through an injected extension-host port. The renderer cannot request arbitrary native dialogs or RPC. Cancellation does nothing; duplicate dialogs are refused; late results cannot affect changed/hidden/closed/replaced drafts or a new root/epoch. Typing a path remains supported.

Label is explicitly optional, explains its list-name purpose and falls back to Connection ID when blank. Save/Test now have persistent individual explanations and accessible descriptions/tooltips. Missing ID/path/invalid fields and unavailable daemon action features are distinguished. Host-side checks refuse invalid file submissions even if a disabled action intent is forged. A complete Parquet draft with an explicitly empty Label enables both actions on an enabled daemon and completes one signed Save with no legacy fallback. The signed fixture injects runtime factories; it is not real source/worker acceptance evidence.

Current production capability read: v2 with safe-read and driver-descriptors only. Its release prerequisites still block Save/Test. This change does not bypass gates or claim production creation is fixed; the user can edit a local draft and see the exact restriction. Genuine S001/provider/worker-affinity/SQLServer/client acceptance work remains independent.

Extension version raised to 0.5.17 so the corrected UI is distinguishable from 0.5.16. A daemon update alone does not replace the VS Code extension. No plugin installed, daemon restarted, release prerequisite promoted or deprecated IDE work added.

Validation so far: 32 Connections tests passed; after the blank-label display correction, all 6 host tests passed again. Extension TypeScript noEmit passed. Regression coverage includes picker cancel/late edits/hidden view, missing-input refusal, explicit blank Label, enabled Save/Test, signed Saved creation, and per-action disabled reasons against metadata-only capabilities. Canonical implementation definitions and generated UX preview were updated; live rendering remains user acceptance work.
