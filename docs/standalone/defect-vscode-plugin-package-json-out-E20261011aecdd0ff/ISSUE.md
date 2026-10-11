<!-- insrc:artifact ISSUE-aecdd0ff26e7b233 -->

# Bring the VS Code extension's settings in line with the daemon's config catalog

## Reproduction

In vscode-plugin, run `npx tsx --test src/config/__tests__/manifest-catalog.test.ts`. Both tests fail:
- "declared global insrc.* keys EXACTLY cover the global CONFIG_CATALOG paths" fails with "manifest missing keys: insrc.analyzer.dataSourceListingTimeoutMs".
- "each declared key's type/enum/default matches its ConfigOption" fails with "no declared schema for insrc.analyzer.dataSourceListingTimeoutMs".

That second test stops at the first problem. Once the missing key is declared, it also fails on the three insrc.designReview.timeLimitMs.* keys. The extension declares defaults of 240000, 360000 and 480000; the catalog has 720000, 1080000 and 1440000.

In VS Code, the analyzer's data-source listing time limit does not appear in Settings. The three design-review time limits show the old defaults. Expected: the extension declares every catalog key, with the catalog's type, default and machine scope.

## Root cause

The daemon's config catalog (src/config/config-catalog.ts) is the single source of truth, and vscode-plugin/package.json contributes.configuration must mirror it exactly. Two catalog changes were made without updating the extension manifest:
- Commit 169e973a (ISSUE-008e146a) added analyzer.dataSourceListingTimeoutMs to the catalog (line 88, default 120000) but not to package.json.
- Commit 4515ca5d ("triple every review time limit") raised the designReview.timeLimitMs.issue/feature/epic defaults (lines 97-99) to 720000, 1080000 and 1440000, but package.json kept 240000, 360000 and 480000.

The manifest-catalog contract test catches this. Its second test stops at the first missing key, so the stale defaults were hidden behind the missing key.

## Fix intent

Make the extension manifest mirror the catalog again:
- Declare insrc.analyzer.dataSourceListingTimeoutMs in package.json with the catalog's type (number), default (120000), description and machine scope.
- Set the three insrc.designReview.timeLimitMs.* defaults to the catalog's values.

The catalog is not changed, and no code changes. The existing manifest-catalog contract test passes in full.

## Citations

- **[[c1]]** `code` `src/config/config-catalog.ts` — "{ path: 'analyzer.dataSourceListingTimeoutMs', type: 'number', default: 120000, desc: 'max ms one live data source is given to be reached and listed when a request is measured; a source that does not "
- **[[c2]]** `code` `src/config/config-catalog.ts` — "{ path: 'designReview.timeLimitMs.issue',   type: 'number', default: 720000,"
- **[[c3]]** `code` `vscode-plugin/package.json` — ""default": 240000,"
- **[[c4]]** `code` `vscode-plugin/src/config/__tests__/manifest-catalog.test.ts` — "assert.deepEqual(missing, [], `manifest missing keys: ${missing.join(', ')}`);"
- **[[c5]]** `prior-artifact` `commit 169e973a feat(build): S001/t1 a live data source is measured within a time limit (ISSUE-008e146a)`
- **[[c6]]** `prior-artifact` `commit 4515ca5d fix(review): triple every review time limit`
