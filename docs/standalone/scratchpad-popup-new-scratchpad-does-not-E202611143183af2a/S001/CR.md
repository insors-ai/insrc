<!-- insrc:artifact CR-3183af2a005db14f-s1 -->

# Code review: s1

Status: **passed** · task-based schema version 3

## CR-3183af2a-s1-a1 — attempt 1: admission failed

Technical admission only; scope was not verified and no task assessment was performed. code_review_admission_failed (segments): segments: Selected range is not inside one referenced changed hunk

## CR-3183af2a-s1-a1 — attempt 2: admission failed

Technical admission only; scope was not verified and no task assessment was performed. code_review_admission_failed (segments): segments: Selected range is not inside one referenced changed hunk

## CR-3183af2a-s1-a1 — attempt 3

Scope: task s1 · reviewer: daemon · 2026-11-14T12:58:30.459Z

1 selected task assessment(s): passed.

### Submitted scope

- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/chat/chat-panel.ts` — [{"after":[2305,2310]},{"after":[2528,2532]},{"after":[2536,2538]},{"after":[2540,2545]},{"after":[2645,2645]}]
- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/chat/scratch-host.ts` — [{"after":[118,127]}]
- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/extension.ts` — [{"after":[979,979]}]
- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/panels/scratch-panels.ts` — [{"after":[225,225]},{"after":[252,255]}]
- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/panels/types.ts` — [{"after":[138,139]}]
- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — [{"after":[8565,8565]},{"after":[8580,8599]},{"after":[8602,8602]},{"after":[8604,8604]},{"after":[8606,8606]},{"after":[8608,8608]},{"after":[8610,8610]},{"after":[8612,8612]},{"after":[8614,8615]},{"after":[8621,8621]},{"after":[8623,8624]}]
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/extension.ts` — [{"after":[987,998]}]
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — [{"after":[493,497]}]
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` — [{"after":[508,533]}]

### Verified final scope: c83844958d32643d77483679f4b63b5c34758fe4

Projection: 1d5531ede03ee62e6e168f5b336141691cd6abaa4556f39391665577a7b8e069 · attribution: accepted

- `vscode-plugin/src/chat/chat-panel.ts` (1c801ed941fe5d00ae94930e07e7709e51d2e575) — selected: [{"after":[2305,2310]},{"after":[2528,2532]},{"after":[2536,2538]},{"after":[2540,2545]},{"after":[2645,2645]}]
- `vscode-plugin/src/chat/scratch-host.ts` (29ceb8344d34c6e7b34bddf9731c9b26ba45ffb0) — selected: [{"after":[118,127]}]
- `vscode-plugin/src/extension.ts` (c624325124d866c565039cf151f7e01b78d07b42) — selected: [{"after":[979,979]}]
- `vscode-plugin/src/panels/scratch-panels.ts` (798383d702d5d9b7a4ef2ad68fc63ccda90f725b) — selected: [{"after":[225,225]},{"after":[252,255]}]
- `vscode-plugin/src/panels/types.ts` (80154dc0de577dffac8cd4a65d393d3a4d1650a4) — selected: [{"after":[138,139]}]
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` (b1aef753fd8ece3e7f9d4dc306e72094f8fa3b31) — selected: [{"after":[8565,8565]},{"after":[8580,8599]},{"after":[8602,8602]},{"after":[8604,8604]},{"after":[8606,8606]},{"after":[8608,8608]},{"after":[8610,8610]},{"after":[8612,8612]},{"after":[8614,8615]},{"after":[8621,8621]},{"after":[8623,8624]}]
- `vscode-plugin/src/extension.ts` (c624325124d866c565039cf151f7e01b78d07b42) — selected: [{"after":[987,998]}]
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` (cb2b238a1ffb18610fd93a8b97f5b77f66667e7c) — selected: [{"after":[493,497]}]
- `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` (6e9fee60221b5c4ca19e4a16caa715c5cfffe7fd) — selected: [{"after":[508,533]}]
- Task s1: reassess; changes 0, 1, 2, 3, 4, 5, 6, 7, 8; identity a9ae311c5ad4628170bcbeb6ef1631948957010c18cefa913da45389f70e1670

Attribution covers the complete Story scope, including all source changes, the regression tests, and the typecheck evidence. Reassessed because earlier attempts failed and no reusable attribution was established.

### s1: passed

Reviewed the pinned issue, all submitted source changes, and the changed test bodies against both acceptance checks. The implementation covers the popup actions and the scratch-new open path; no HIGH or MED findings identified.

Coverage: **verified** — Inspected the added assertions, not just test names. The chat-panel test checks the action strip, SVGs, hidden labels, accessible names, row actions, and empty/error states. Scratch-host tests check that a browse-refresh failure does not prevent opening and that failures are logged. Scratch-panel tests check pre-ready content replay and duplicate-ready behavior. The extension-wiring test checks logging branches structurally, but does not execute the VS Code adapter against false delivery or rejection; the functional replay assertion covers content recovery through the panel controller. This leaves no demonstrated coverage defect for the stated acceptance checks.


Optional verification and advice (nonblocking):

- Optional execution: I did not run tests, typecheck, or build. Builder-reported passing results are not my executions.

Inspected references:

- `94de6d11457ebe764b514f8d6e307712faa47d05:docs/standalone/scratchpad-popup-new-scratchpad-does-not-E202611143183af2a/ISSUE.md`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/chat/chat-panel.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/chat/scratch-host.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/extension.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/panels/scratch-panels.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/panels/types.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/chat/__tests__/chat-panel.test.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/panels/__tests__/scratch-panel.test.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/tsconfig.json`
## CR-3183af2a-s1-full-a1 — attempt 1

Scope: whole story · reviewer: daemon · 2026-11-14T13:10:07.910Z

1 selected task assessment(s): changes_requested.

### Submitted scope

- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/chat/chat-panel.ts` — [{"after":[2305,2310]},{"after":[2528,2532]},{"after":[2536,2538]},{"after":[2540,2545]},{"after":[2645,2645]}]
- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/chat/scratch-host.ts` — [{"after":[118,127]}]
- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/extension.ts` — [{"after":[979,979]}]
- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/panels/scratch-panels.ts` — [{"after":[225,225]},{"after":[252,255]}]
- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/panels/types.ts` — [{"after":[138,139]}]
- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — [{"after":[8565,8565]},{"after":[8580,8599]},{"after":[8602,8602]},{"after":[8604,8604]},{"after":[8606,8606]},{"after":[8608,8608]},{"after":[8610,8610]},{"after":[8612,8612]},{"after":[8614,8615]},{"after":[8621,8621]},{"after":[8623,8624]}]
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/extension.ts` — [{"after":[987,998]}]
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — [{"after":[493,497]}]
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` — [{"after":[508,533]}]

### Verified final scope: c83844958d32643d77483679f4b63b5c34758fe4

Projection: 1d5531ede03ee62e6e168f5b336141691cd6abaa4556f39391665577a7b8e069 · attribution: accepted

- `vscode-plugin/src/chat/chat-panel.ts` (1c801ed941fe5d00ae94930e07e7709e51d2e575) — selected: [{"after":[2305,2310]},{"after":[2528,2532]},{"after":[2536,2538]},{"after":[2540,2545]},{"after":[2645,2645]}]
- `vscode-plugin/src/chat/scratch-host.ts` (29ceb8344d34c6e7b34bddf9731c9b26ba45ffb0) — selected: [{"after":[118,127]}]
- `vscode-plugin/src/extension.ts` (c624325124d866c565039cf151f7e01b78d07b42) — selected: [{"after":[979,979]}]
- `vscode-plugin/src/panels/scratch-panels.ts` (798383d702d5d9b7a4ef2ad68fc63ccda90f725b) — selected: [{"after":[225,225]},{"after":[252,255]}]
- `vscode-plugin/src/panels/types.ts` (80154dc0de577dffac8cd4a65d393d3a4d1650a4) — selected: [{"after":[138,139]}]
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` (b1aef753fd8ece3e7f9d4dc306e72094f8fa3b31) — selected: [{"after":[8565,8565]},{"after":[8580,8599]},{"after":[8602,8602]},{"after":[8604,8604]},{"after":[8606,8606]},{"after":[8608,8608]},{"after":[8610,8610]},{"after":[8612,8612]},{"after":[8614,8615]},{"after":[8621,8621]},{"after":[8623,8624]}]
- `vscode-plugin/src/extension.ts` (c624325124d866c565039cf151f7e01b78d07b42) — selected: [{"after":[987,998]}]
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` (cb2b238a1ffb18610fd93a8b97f5b77f66667e7c) — selected: [{"after":[493,497]}]
- `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` (6e9fee60221b5c4ca19e4a16caa715c5cfffe7fd) — selected: [{"after":[508,533]}]
- Task s1: initial; changes 0, 1, 2, 3, 4, 5, 6, 7, 8; identity a9ae311c5ad4628170bcbeb6ef1631948957010c18cefa913da45389f70e1670

### s1: changes_requested

Reviewed the submitted implementation and its relevant test bodies against the ISSUE requirements and acceptance checks. The UI change and scratch-new ordering/readiness paths are supported by source and behavioral assertions. The new postMessage delivery logging is only pinned by source-text regexes, so runtime logging behavior remains unverified by tests.

Coverage: **verified** — Inspected all submitted changed implementation segments, the applicable ISSUE requirements and acceptance checks, and the relevant changed test bodies/assertions. Behavioral tests cover the icon-strip rendering and intent dispatch, scratch-new still attempting document open after browse-refresh failure, and pre-ready content replay for a fresh document panel. Coverage does not behaviorally verify the extension factory adapter's false-delivery and rejection logging; this demonstrated gap is reported as a finding. Builder-reported pass results were not independently executed or treated as evidence of behavior.

- **MED** `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts:493-497`: The changed postMessage adapter has no behavioral test for either delivery outcome. These assertions only match source text; they do not exercise the adapter with a false result or a rejected promise and verify that panelLog.warn is called.
  The acceptance check specifically requires that posts to a not-yet-attached or disposed webview are not silently dropped. A wiring regression could preserve these matched strings while changing runtime behavior, and the test does not verify warning contents or invocation. Add a focused behavioral test with controlled postMessage results for false and rejection.
  Evidence: `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/extension.ts`, `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts`

Optional verification and advice (nonblocking):

- Optional execution: No tests, typecheck, or build were run independently. The supplied task record reports passing tests/typecheck, but those builder-reported results were not independently verified here.

Inspected references:

- `94de6d11457ebe764b514f8d6e307712faa47d05:docs/standalone/scratchpad-popup-new-scratchpad-does-not-E202611143183af2a/ISSUE.md`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/chat/chat-panel.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/chat/scratch-host.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/panels/scratch-panels.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/panels/types.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/extension.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/chat/__tests__/chat-panel.test.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/panels/__tests__/scratch-panel.test.ts`
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/tsconfig.json`
## CR-3183af2a-s1-full-a1 — attempt 2

Scope: whole story · reviewer: daemon · 2026-11-14T13:28:19.155Z

1 selected task assessment(s): passed.

### Submitted scope

- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/chat/chat-panel.ts` — [{"after":[2305,2310]},{"after":[2528,2532]},{"after":[2536,2538]},{"after":[2540,2545]},{"after":[2645,2645]}]
- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/chat/scratch-host.ts` — [{"after":[118,127]}]
- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/extension.ts` — [{"after":[979,979]}]
- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/panels/scratch-panels.ts` — [{"after":[225,225]},{"after":[252,255]}]
- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/panels/types.ts` — [{"after":[138,139]}]
- `94de6d11457ebe764b514f8d6e307712faa47d05:vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — [{"after":[8565,8565]},{"after":[8580,8599]},{"after":[8602,8602]},{"after":[8604,8604]},{"after":[8606,8606]},{"after":[8608,8608]},{"after":[8610,8610]},{"after":[8612,8612]},{"after":[8614,8615]},{"after":[8621,8621]},{"after":[8623,8624]}]
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/extension.ts` — [{"after":[987,998]}]
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — [{"after":[493,497]}]
- `c83844958d32643d77483679f4b63b5c34758fe4:vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` — [{"after":[508,533]}]
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/panels/types.ts` — [{"after":[148,155]}]
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/panels/scratch-panels.ts` — [{"after":[228,248]}]
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/extension.ts` — [{"after":[475,475]},{"after":[988,990]},{"after":[993,993]},{"after":[997,997]}]
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` — [{"after":[52,58]},{"after":[540,578]}]
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/panels/__tests__/webview-host.test.ts` — [{"after":[47,47]},{"after":[49,49]}]
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — [{"after":[494,496]},{"after":[498,505]}]

### Verified final scope: 4aff565d5db00043932517ac8a97caa7656a5638

Projection: 145cfaf79fbc13a98fa7232ea66aa3fb9fdcdfc35d383394646f29b0f56fee1f · attribution: accepted

- `vscode-plugin/src/chat/chat-panel.ts` (1c801ed941fe5d00ae94930e07e7709e51d2e575) — selected: [{"after":[2305,2310]},{"after":[2528,2532]},{"after":[2536,2538]},{"after":[2540,2545]},{"after":[2645,2645]}]
- `vscode-plugin/src/chat/scratch-host.ts` (29ceb8344d34c6e7b34bddf9731c9b26ba45ffb0) — selected: [{"after":[118,127]}]
- `vscode-plugin/src/extension.ts` (2f296f94d5086a1456fda00115c603924270dc3f) — selected: [{"after":[977,977]}]
- `vscode-plugin/src/panels/scratch-panels.ts` (7f8343950d2e2f4954dfb397241beb1a5349acb9) — selected: [{"after":[225,225]},{"after":[272,275]}]
- `vscode-plugin/src/panels/types.ts` (cb2fdfb843b4b9c5e6ec5de650cca1ac113e0dc5) — selected: [{"after":[138,139]}]
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` (b1aef753fd8ece3e7f9d4dc306e72094f8fa3b31) — selected: [{"after":[8565,8565]},{"after":[8580,8599]},{"after":[8602,8602]},{"after":[8604,8604]},{"after":[8606,8606]},{"after":[8608,8608]},{"after":[8610,8610]},{"after":[8612,8612]},{"after":[8614,8615]},{"after":[8621,8621]},{"after":[8623,8624]}]
- `vscode-plugin/src/extension.ts` (2f296f94d5086a1456fda00115c603924270dc3f) — selected: [{"after":[985,987]},{"after":[991,992]},{"after":[994,996]},{"after":[998,999]}]
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` (02c3912164ea31d0acc5d7f80641d85c95c2d5c5) — selected: [{"after":[493,493]},{"after":[497,497]}]
- `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` (8e8a00fa792ab2f6237deb148df9922d017b8fd0) — selected: [{"after":[514,539]}]
- `vscode-plugin/src/panels/types.ts` (cb2fdfb843b4b9c5e6ec5de650cca1ac113e0dc5) — selected: [{"after":[148,155]}]
- `vscode-plugin/src/panels/scratch-panels.ts` (7f8343950d2e2f4954dfb397241beb1a5349acb9) — selected: [{"after":[228,248]}]
- `vscode-plugin/src/extension.ts` (2f296f94d5086a1456fda00115c603924270dc3f) — selected: [{"after":[475,475]},{"after":[988,990]},{"after":[993,993]},{"after":[997,997]}]
- `vscode-plugin/src/panels/__tests__/scratch-panel.test.ts` (8e8a00fa792ab2f6237deb148df9922d017b8fd0) — selected: [{"after":[52,58]},{"after":[540,578]}]
- `vscode-plugin/src/panels/__tests__/webview-host.test.ts` (d1d2156d845e8483735a19ca01da0b487500294f) — selected: [{"after":[47,47]},{"after":[49,49]}]
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` (02c3912164ea31d0acc5d7f80641d85c95c2d5c5) — selected: [{"after":[494,496]},{"after":[498,505]}]
- Task s1: reassess; changes 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14; identity d07e01e415857aac4c6b0771db3bbc5d74381245ba418486f00dc018aede6516

All supplied changes and tests relate to Story s1. Reassessed attribution to include the complete final revision inventory, including cross-cutting wiring and regression evidence.

### s1: passed

Reassessed the submitted implementation against the pinned ISSUE and acceptance checks. The scratch-new path attempts the document open after browse refresh errors, creates and reveals the document panel, and retains pre-ready content for generation-matched replay. The popup renders the New/Browse icon strip with accessible labels and preserves the expected menu actions. The corrected drop-logging behavior has behavioral coverage through the controller wrapper.

Coverage: **verified** — Inspected the pinned ISSUE requirements and acceptance checks, the selected implementation segments, and relevant test bodies/assertions. Coverage includes scratch-new creation, refresh failure and attempted open; panel creation/reveal; pre-ready content replay and duplicate-ready handling; delivered, false, rejected, and synchronous-throw outcomes through the wrapper; and icon-only menu rendering, accessible labels, ordering, empty/error states, and action dispatch. The extension adapter’s specific logging remains pinned by source assertions; the runtime behavior through the wrapper is tested. Supplied execution results are builder-reported and were not independently rerun.

- **LOW** `vscode-plugin/src/extension.ts:992`: A dropped post is logged at both the extension adapter and controller wrapper in production.
  The production wiring injects `panelLog` into `createScratchPanels`; the adapter logs a false result here, then returns `false`, which causes `wrap()` in `scratch-panels.ts` to log the same failure again. This creates duplicate warnings for one dropped message. It does not prevent delivery failures from being surfaced, so it is nonblocking.
  Evidence: `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/extension.ts`, `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/panels/scratch-panels.ts`

Optional verification and advice (nonblocking):

- Optional execution: No tests, typecheck, or build were run independently. The submitted task record reports 423/423 tests passing and a clean typecheck; those results were not independently verified.
- Consider logging post-delivery failures at only one production boundary to avoid duplicate warnings.

Inspected references:

- `94de6d11457ebe764b514f8d6e307712faa47d05:docs/standalone/scratchpad-popup-new-scratchpad-does-not-E202611143183af2a/ISSUE.md`
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/chat/chat-panel.ts`
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/chat/scratch-host.ts`
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/extension.ts`
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/panels/scratch-panels.ts`
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/panels/types.ts`
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/chat/__tests__/chat-panel.test.ts`
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts`
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/panels/__tests__/scratch-panel.test.ts`
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/src/panels/__tests__/webview-host.test.ts`
- `4aff565d5db00043932517ac8a97caa7656a5638:vscode-plugin/tsconfig.json`
