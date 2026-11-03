# Schema path file selector correction — 2026-10-30

User screenshot showed a database driver’s nested Schema Source → Path, not the primary Parquet/file-source Path. The generic Use default button reset that field and never opened a dialog. The prior native picker only supported a root file-family path. This is a correction to S005 t18.

Both root data paths and nested schemaSource.path now use a folder/file-open SVG icon only, with tooltip and accessible name. Path reset buttons are removed. The allowlisted browse-file intent carries exactly path=[path] or [schemaSource,path]; the host additionally checks that the selected descriptor declares a string field. No arbitrary native action or RPC is exposed. Existing cancellation, edited-draft, generation, hidden/closed view and daemon-epoch guards are retained.

A schema source has a fixed format hidden by the descriptor form. Both typing and selecting its path now initialize that descriptor constant; an empty path restores/omits the whole optional schema-source value rather than leaving an invalid orphan. Data-file selection cannot populate a database schema path or vice versa. Non-path fields cannot invoke the picker.

Regression tests: all 33 Connections tests passed, including icon/SVG accessibility, root picker cancellation/stale events, actual nested picker selection/cancellation, manual entry/clearing, fixed-format validation, and hostile path-target refusal. Extension TypeScript noEmit passed. Live native dialog/visual verification remains assigned to the user. Version 0.5.18 requires extension installation and Reload Window; daemon updates alone do not replace this UI.


Runtime source commit: f5f0eafd0. Clean-snapshot package: vscode-plugin/insrc-vscode-0.5.18-s005-f5f0eafd0.vsix; SHA256 de82939a9876048e8f745a0410117681376a85af589510815cb38f073763428a. Prepublish/typecheck/bundle, archive CRC/version and new picker bundle checks passed. Not installed or published. The t18 validation gate passed all checks and mapped tests. Both artifact checks passed; canonical companion source regenerated, live visual/native-dialog acceptance remains user-owned.

The final 116-file extension sweep completed with 1342 tests in complete TAP totals: 1327 pass, 3 fail, 12 skip. Chat-panel timed out at 60 seconds with no final total; partial tests are excluded. The same unrelated cli-adapter (/proc), detail-renderer message-set and workspace activation import assertions failed. All original outputs are retained in evidence/schema-picker/sweep-logs.tar.gz, with exact per-file results in sweep-summary.json. The backend/native implementation is unchanged by this UI correction and was not rebuilt/retested wholesale again.
