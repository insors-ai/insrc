# Manual acceptance after installation

The user will perform live UI validation after the full build and plugin installation. Tasks 26–29 remain pending manual acceptance; the failed automated task-26 attempt remains historical evidence. This instruction permits continuing the build and full sweep without converting pending checks into passes. Installation is the next step after package delivery.

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
