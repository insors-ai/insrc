<!-- insrc:artifact ISSUE-37ca9cf46748fb43 -->

# Declare analyzer.dataSourceListingTimeoutMs in the VS Code settings manifest

## Reproduction

1. On main (a66eae5a), run the VS Code plugin suite: `cd vscode-plugin && npx tsx --test 'src/**/__tests__/*.test.ts'` (Node 22).
2. Two tests in vscode-plugin/src/config/__tests__/manifest-catalog.test.ts fail:
   - 'declared global insrc.* keys EXACTLY cover the global CONFIG_CATALOG paths (no missing, no extra)': manifest missing keys: insrc.analyzer.dataSourceListingTimeoutMs.
   - 'each declared key's type/enum/default matches its ConfigOption, and scope is 'machine'': no declared schema for insrc.analyzer.dataSourceListingTimeoutMs.
3. As a consequence (follows from the missing declaration; not yet checked in the editor): with the extension installed (0.5.14), VS Code Settings has no entry for the data-source listing timeout.

Expected: every global key in the daemon's config catalog has a matching insrc.* setting in the extension manifest, so the contract test passes and the setting can be edited from VS Code.

## Root cause

The daemon's config catalog gained the global key analyzer.dataSourceListingTimeoutMs (src/config/config-catalog.ts:88: type number, default 120000), read by dataSourceListingTimeoutMs() in src/config/analyze.ts:479. It was introduced on 2026-10-10 by the work for ISSUE-008e146a. The VS Code extension declares its settings statically in vscode-plugin/package.json under contributes.configuration, and no insrc.analyzer.dataSourceListingTimeoutMs entry was added there. The manifest/catalog contract test (vscode-plugin/src/config/__tests__/manifest-catalog.test.ts), which imports CONFIG_CATALOG and compares it with the shipped package.json, catches exactly this drift. It was not run when the key was added.

## Fix intent

Declare insrc.analyzer.dataSourceListingTimeoutMs in the extension's settings manifest so it matches the catalog entry (its type, default and description, with machine scope like the other global keys). The manifest/catalog contract test then passes and the setting is editable from VS Code. Check that no other catalog key has drifted the same way.

## Citations

- **[[c1]]** `code` `src/config/config-catalog.ts:88` — "{ path: 'analyzer.dataSourceListingTimeoutMs', type: 'number', default: 120000, desc: 'max ms one live data source is given to be reached ..."
- **[[c2]]** `code` `src/config/analyze.ts:479` — "export function dataSourceListingTimeoutMs(configPath: string = PATHS.config): number {"
- **[[c3]]** `code` `vscode-plugin/src/config/__tests__/manifest-catalog.test.ts` — "manifest ↔ CONFIG_CATALOG contract test ... Reads the shipped package.json + imports the ONE daemon catalog."
- **[[c4]]** `code` `vscode-plugin/package.json` — ""insrc.analyzer.useLocal": { ... (contributes.configuration has insrc.analyzer.* keys but no insrc.analyzer.dataSourceListingTimeoutMs)"
- **[[c5]]** `step-output` `plugin suite run on a66eae5a, 2026-10-12` — "not ok 768 - declared global insrc.* keys EXACTLY cover the global CONFIG_CATALOG paths (no missing, no extra) / manifest missing keys: insrc.analyzer.dataSourceListingTimeoutMs; not ok 769 - ... no d"
- **[[c6]]** `step-output` `git log -S'dataSourceListingTimeoutMs'` — "earliest: ed564dff 2026-10-10 18:18 docs(workflow): design for ISSUE-008e146a (a bounded, cancellable measure of a live data source ...)"
