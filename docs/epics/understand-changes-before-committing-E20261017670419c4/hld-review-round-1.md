# Historical HLD review: round 1

Review of the initial HLD, before the Source Control, test mapping, model-role and schema-handling corrections. No findings have been overridden.



## Review

### ⛔ Review `BLOCK` — design.epic (design.epic)

**2 do not hold · 2 could not be verified · 6 hold** · template `design-spec` · model `cli-codex:gpt-6-astra` · reviewed 2026-10-17T12:15:59.416Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| coverage-of-intent | MED | The editor and Git stories cover all required commit-readiness presentation. | Specification section 5 requires: “Source Control shows whether the commit is ready or paused.” The HLD assigns an editor pane and Git hooks but no Source Control status integration. The inspected extension wiring creates status/config webviews and status-menu commands; those do not supply the required assessment readiness display. [files: docs/pre-commit-understanding-spec.md, vscode-plugin/src/extension.ts, vscode-plugin/src/panels/webview-host.ts] | Assign Source Control readiness presentation to s5, with daemon-derived state and refresh behavior after assessment, policy and scope changes. |
| tests | MED | Every upstream acceptance criterion maps to a planned test. | The DEF contains 22 story acceptance criteria. Specification section 11 additionally requires ported grading validation and coverage for policy, snapshot identity, retries, guidance, overrides and IPC recovery. The HLD mentions Git integration checks and association scenarios, but supplies no complete criterion-to-test mapping, including restart recovery, unchanged delivery approvals, Unsure before submission, stale UI authority and preserved original versus assisted attempts. [files: .insrc/artifacts/DEF-670419c4ad8bea8e.json, docs/pre-commit-understanding-spec.md] | Add a test matrix mapping each DEF acceptance criterion and the association acceptance checks to an owning story, test level and observable assertion; include upstream grading fixtures and real-repository Git cases. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| change-sites | Assessment grading and independent verification have a defined integration with existing role tiering. | The HLD says to use existing role routing but does not select existing RoleIds or assign ownership for new taxonomy entries. The inspected taxonomy has no assessment-specific roles. resolveRoleInternal defaults unknown roles to 'mid' and only applies the core floor when a descriptor exists. Thus floor protection for the new authoritative judgments is not established. [files: src/config/role-taxonomy.ts, src/analyze/context/role-router.ts, AGENTS.md] | Specify reused or new RoleIds for classification, generation, grading, verification and guidance; assign taxonomy changes and criticality before implementation. |
| data-compatibility | Assessment schema upgrades and older-record handling are sufficiently specified to verify compatibility. | The existing store has SCHEMA_VERSION = 5, explicit forward migrations and rejection of newer stored versions. The HLD proposes a versioned namespace and assigns migrations to s1, but supplies no persisted assessment schema, version-dispatch rules or migration behavior. Existing graph migrations cannot establish compatibility for those future records. [files: src/db/graph/store.ts, .insrc/artifacts/DEF-670419c4ad8bea8e.json] | Define assessment record versions, migration atomicity, unsupported-version handling and current/history deletion consistency in the s1 LLD. |
