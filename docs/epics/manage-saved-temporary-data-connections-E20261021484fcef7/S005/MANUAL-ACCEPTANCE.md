# Manual acceptance after installation

## Current acceptance status — 2026-10-31

VS Code connection-manager manual testing is complete, reported by the user after installation of version 0.5.23: “ok, manual test of connection manager done”. This records completion of the VS Code manual test session; it does not claim that every case in the historical checklist was individually evidenced.

JetBrains manual testing is deferred by explicit user instruction on 2026-10-31: “mark the JetBrains validation as deferred and go with completion review”. This is a deferral, not a successful JetBrains test result. Tasks 26–29 retain any outstanding lifecycle/service and cross-client evidence requirements; the JetBrains manual portion is deferred; the failed automated task-26 attempt remains historical evidence. SQL Server, provider-service coverage, positive Saved worker-affinity proof and independent Story-completion review are not completed by this report. Automated failures/skips and release-audit status are unchanged.

Installed package: `vscode-plugin/insrc-vscode-0.5.23-s005-b09162a00.vsix`; source `b09162a00`; SHA256 `bf217b50c93006473054928da8e01a17199eca01c3552dfed49b1ee63b5eec24`. The installed bundle was verified against that archive. The manual feedback cycle covered reported form/path/control issues, saved-versus-temporary behavior, recovery of repository discovery, list-first layout, message history, per-row removal and the correction to product icons. The user's final completion statement is the manual-session evidence; it is not a detailed per-scenario pass ledger.

The historical instructions and version-specific rechecks below are retained as history. Later default-enablement, list-first layout and product-icon corrections supersede conflicting earlier instructions.

Use only VS Code and JetBrains. Test with disposable repositories and sources. Production connection-management admission currently remains closed by upstream prerequisites; unsupported controls should show upgrade guidance. Positive feature testing requires the separately isolated signed test daemon, with its socket protected from startup provisioning. Do not enable production gates to obtain a positive UI result.

The existing signed mutation peer uses controlled driver factories for fault injection. It is useful for UI/transport flows, but does not prove real SQL/KV/file service behavior or handle cleanup. Source-preservation acceptance requires actual disposable services and native driver paths; do not count that controlled peer as service evidence.

Record the installed package hashes, IDE versions, root/project selections, steps, screenshots (synthetic values only), and expected/actual results for each check:

- Both IDEs: light/dark/high-contrast, keyboard focus/labels, blank masked replacements and fixed safe errors.
- Settings and palette/action open the same retained manager. JetBrains application Settings explicitly chooses a live Project; no project creates no owner.
- Explicit registered-root selection; All/Saved/Temporary counts and search; loading, empty, error, offline and upgrade states.
- Add/edit/Test/Save; Keep/Replace/Clear; Save independent of optional Test; dirty exits Cancel/Discard.
- Saved Delete and Temporary Discard confirmation identifies root/scope/ID/revision; Cancel has no effect. Busy/conflict/unknown/cleanup cards retain truthful independent phases and original-operation recovery.
- Panel/Settings close and root switches retain temporary entries; actual workbench/Project disposal, same-epoch resume, actual 90-second lease expiry and daemon restart have the documented behavior and drain owned workers.
- Disposable PostgreSQL/Redis and native/converted file sources retain rows/bytes after both-scope Test/Save/Delete/Discard. Unsupported/limited files refuse safely. SQL Server remains pending because unavailable.

Do not infer live acceptance from headless tests, diagrams, build success, or installation. Source/provider/worker-affinity prerequisites and historical suite failures remain independent release blockers.


## VS Code feedback recheck

- Confirm the Connections editor tab has its database icon in light/dark themes.
- Confirm registration is above the list at wide and narrow widths, including keyboard order.
- Hover/focus Add, Refresh, Previous/Next, Delete/Discard and Close: icon-only controls have names/tooltips; temporary removal says Discard.
- Select a registered repository, click Add, choose CSV/JSON/Parquet and scope, and edit fields. A metadata-only daemon must allow this local draft and explicitly explain why Save/Test are unavailable.
- Against an isolated enabled signed test daemon only, Save/Test and successful list refresh remain available. The installed production daemon currently advertises safe-read and driver-descriptors only; a VSIX update alone cannot enable actual creation.

Details: UI-FEEDBACK.md. Earlier acceptance results remain historical.


## File form feedback recheck (VS Code 0.5.17)

- Install the new VSIX and reload VS Code; a daemon update alone does not update this UI.
- Add Parquet: File path is first under Connection fields, clearly labeled with source-file guidance. Browse opens the native file selector and fills the same editable path input.
- Cancel Browse, edit the path while a dialog is open, or hide/close the manager: a delayed selection must not overwrite the current draft.
- Leave Label blank. Enter Connection ID and file path. On an enabled isolated daemon, Test and Save enable; successful Save shows Connection ID as the list name.
- Missing inputs get specific messages. On the current production daemon, each action explains that creation/testing is not enabled; changing Label cannot resolve a backend capability restriction.


## Default enablement (supersedes historical production-gate restrictions above)

The user explicitly enabled this feature by default. After updating/restarting the daemon, a fresh registered repository should advertise sessions, Test and Saved creation/update/removal; completed inputs should enable Test and Save. No special test daemon or release-evidence flag is required. Existing legacy registries still require their offline migration, and corrupt/partial state still requires recovery. Earlier acceptance failures and pending service coverage remain historical evidence.

For the insrc repository, use `test-fixtures/connection-management/v1/manual-orders.parquet` (five synthetic rows). The existing source policy requires a path within the selected registered repository; the earlier ~/work/temp absolute path is outside that boundary.


## Path icon correction (VS Code 0.5.18)

- Install 0.5.18 and Reload Window. Source File path and database Schema Source → Schema file path each have a file-open icon with a specific tooltip and accessible name; no Use default button stands in for file selection.
- Click the icon, select/cancel a file, and verify only that field changes. Both manual and selected schema-file paths must validate without a hidden-format error.
- For the Parquet sample select Driver = parquet and use its File path. A database Schema Source field is for its schema (for example a Prisma file), not the Parquet data file.
