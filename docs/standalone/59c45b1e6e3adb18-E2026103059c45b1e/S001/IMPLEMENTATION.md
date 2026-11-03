# Opened repository default

Approved issue: docs/standalone/default-connections-repository-dropdown-opened-repository-E20261030eda948ee/ISSUE.md.

On first manager open, activation supplies the local active file path when it belongs to an open workspace, otherwise the first local workspace folder. The host captures this before opening the webview, then chooses the deepest containing registered root with platform path boundaries. It never registers a root. Unmatched context leaves the dropdown empty. A retained selection or draft prevents replacing the default on reopen; all existing generation/epoch and admission checks remain in use.

No daemon IPC, storage schema or ownership relationship changes. No layout change: the existing repository dropdown starts with a value. This corrects the existing implementation's UX; an additional diagram does not clarify the changed default. Live UI verification remains with the user.

Root and extension TypeScript checks passed. All 36 connection tests passed, with nine host tests passing again after adding explicit manual-selection retention coverage. The initial development run used an unavailable fixture property and needed its owned process group terminated after setup failed; the fixture was corrected and rerun with a timeout. Existing declaration shims were extended for native VS Code context APIs.

The user-requested SQLite fixture was created before advancing the approved issue: test-fixtures/connection-management/v1/manual-orders.sqlite. Read-only SQLite integrity and foreign-key checks passed: 3 customers, 5 orders, order_summary view. Only synthetic sample data; no schema corpus/manifest changes.

Package: vscode-plugin/insrc-vscode-0.5.20-s005-66b504e49.vsix, built from clean source commit 66b504e49. Prepublish/typecheck/bundle, archive CRC/version and shipped context-selection bundle checks passed. SHA256: 2600be8358c127a1bfdf1372101deb4ee937422cfb1bee7843c06b08fb38de45. The installed daemon read-only Test of the SQLite fixture returned reachable in 220.57 ms; no registration was saved and the daemon was not restarted.

Final 116-file extension sweep: 1348 tests in complete TAP totals, 1333 pass, 3 fail, 12 skipped, plus chat-panel timeout without a final total. The same prior /proc CLI test, detail-renderer message-set assertion and workspace activation import assertion failed. All raw outputs are archived. Backend and JetBrains source are unchanged and were not swept again for this VS Code correction. Live UI and independent story-completion review remain pending; this report does not certify either.

Standalone build validation passed: root/extension typechecks and nine host tests executed by the gate. The verdict noted the initial pre-build commit in the draft BUILD record; final persisted JSON and Markdown both reference implementing commit 66b504e49. Independent completion review and BUILD approval have not been claimed.
