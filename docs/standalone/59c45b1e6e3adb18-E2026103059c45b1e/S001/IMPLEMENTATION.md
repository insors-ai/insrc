# Opened repository default

Approved issue: docs/standalone/default-connections-repository-dropdown-opened-repository-E20261030eda948ee/ISSUE.md.

On first manager open, activation supplies the local active file path when it belongs to an open workspace, otherwise the first local workspace folder. The host captures this before opening the webview, then chooses the deepest containing registered root with platform path boundaries. It never registers a root. Unmatched context leaves the dropdown empty. A retained selection or draft prevents replacing the default on reopen; all existing generation/epoch and admission checks remain in use.

No daemon IPC, storage schema or ownership relationship changes. No layout change: the existing repository dropdown starts with a value. This corrects the existing implementation's UX; an additional diagram does not clarify the changed default. Live UI verification remains with the user.

Root and extension TypeScript checks passed. All 36 connection tests passed, with nine host tests passing again after adding explicit manual-selection retention coverage. The initial development run used an unavailable fixture property and needed its owned process group terminated after setup failed; the fixture was corrected and rerun with a timeout. Existing declaration shims were extended for native VS Code context APIs.

The user-requested SQLite fixture was created before advancing the approved issue: test-fixtures/connection-management/v1/manual-orders.sqlite. Read-only SQLite integrity and foreign-key checks passed: 3 customers, 5 orders, order_summary view. Only synthetic sample data; no schema corpus/manifest changes.
