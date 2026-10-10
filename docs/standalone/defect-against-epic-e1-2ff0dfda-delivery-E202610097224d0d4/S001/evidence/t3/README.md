# t3 evidence: full suites and typechecks

Captured at commit `c04e408a`, the t3 commit.

## Root suite

[root-suite.txt](root-suite.txt): `npx tsx --test --test-force-exit --test-timeout=120000 'src/**/__tests__/*.test.ts'` at the repo root.

| Tests | Passed | Skipped | Failed |
|---|---|---|---|
| 5,169 | 5,039 | 126 | 1 |

- **The one failure is not caused by this story.** It is `temporalTrend recovers slope/intercept/R² via expression-based regression` in `src/daemon/db/__tests__/sqlite-driver.test.ts`. It also fails with this story's changes stashed (12 pass, 1 fail either way).
- **Why `--test-force-exit`:** without it, an open handle keeps the runner alive after the last test and the run never ends.
- **The total varies:** across runs it reports 5,062 to 5,169 tests, with the same single failure each time.

The root typecheck (`npx tsc --noEmit`) is clean.

## Plugin suite and typechecks

[plugin-suite.txt](plugin-suite.txt) covers the `vscode-plugin` checks:
- `npx tsc -p tsconfig.json --noEmit` exits 0.
- `npx tsc -p tsconfig.delivery-contract.json --noEmit` exits 0.
- `npx tsx --test 'src/**/__tests__/*.test.ts'` runs 966 tests: 961 pass, 4 are skipped, and 1 fails. The failure is the known manifest-catalog baseline: "each declared key's type/enum/default matches its ConfigOption, and scope is 'machine'".

## The contract check fails when a field is dropped

I removed `'feedback'` from the `DeliveryItemView` Pick and ran `npx tsc -p tsconfig.delivery-contract.json --noEmit`. It reported 1 error, on `DELIVERY_ITEM_VIEW_CARRIES_DESCRIPTION_AND_FEEDBACK`. I then restored the file, and the typecheck passed again.
