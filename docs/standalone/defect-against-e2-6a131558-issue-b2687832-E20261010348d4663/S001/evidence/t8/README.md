# t8 evidence — performance and full verification

- [perf-exact-targets.tap](perf-exact-targets.tap): `INSRC_PERF=1 npx tsx --test src/delivery/__tests__/board-perf.test.ts`
  in `vscode-plugin`, asserting the exact targets on the 500-item, 1,000-record fixture, best of three. Measured on
  the fake DOM (host derive and post plus the real webview script's DOM build; no layout or paint):
  first screen (All work) 3.4 ms (target 1,000 ms); search 0.9 ms, Needs attention 2.3 ms, view change 0.4 ms,
  drill-down into an epic's board 0.3 ms, into a story's screen 0.4 ms (target 150 ms each).
- [typecheck.txt](typecheck.txt): `npx tsc -p tsconfig.json --noEmit`, exit 0.
- [full-plugin-suite.txt](full-plugin-suite.txt): `npx tsx --test 'src/**/__tests__/*.test.ts'`. 941 tests: 936 pass,
  4 live tests skipped, 1 failure, the known manifest-catalog baseline ("each declared key's type/enum/default
  matches its ConfigOption").
