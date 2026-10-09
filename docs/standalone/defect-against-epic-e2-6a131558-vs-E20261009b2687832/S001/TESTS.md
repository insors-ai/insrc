<!-- insrc:artifact TESTS-b2687832a8c75877-s1 -->

# Tests: b2687832a8c75877 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 29 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-09T16:54:22.468Z on commit `14983e6b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: board-model.test.ts: compactId is 'ABCDEF01 / S001' for 'E20261009abcdef01:S001', 'ABCDEF01' for an epic-level 'E20261009abcdef01', 'ABCDEF01 / S002' for the H-form 'Habcdef0123456789:S002', and the full id for a ':R(<raw>)' fallback id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | compactId is 'ABCDEF01 / S001' for 'E20261009abcdef01:S001', 'ABCDEF01' for an epic-level 'E20261009abcdef01', 'ABCDEF01 / S002' for the H-form 'Habcdef0123456789:S002', and the full id for a ':R(<raw>)' fallback id | `vscode-plugin/src/delivery/__tests__/board-model.test.ts` |

**unit: board-model.test.ts: taskSummary is 'n/N tasks passed' from validation and null when validation is null or has no recorded tasks**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | taskSummary is 'n/N tasks passed' from validation and null when validation is null or has no recorded tasks | `vscode-plugin/src/delivery/__tests__/board-model.test.ts` |

**unit: board-model.test.ts: accessibleLabel carries the compactId and task summary, and badges are unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | accessibleLabel carries the compactId and task summary, and badges are unchanged | `vscode-plugin/src/delivery/__tests__/board-model.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-model.test.ts` | 0 | 11 | 0.3 s |  |

## t2

Run at 2026-10-09T16:57:25.604Z on commit `e9e5b97b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: board-views.test.ts: buildEpicRollup returns one row per listed epic plus 'Not in an epic' with story, complete, task, issue and attention counts, and the row totals sum to the board's totals.items for the same selection**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | buildEpicRollup returns one row per listed epic plus 'Not in an epic' with story, complete, task, issue and attention counts, and the row totals sum to the board's totals.items for the same selection | `vscode-plugin/src/delivery/__tests__/board-views.test.ts` |

**unit: board-views.test.ts: attentionLabel is 'No open gates' at 0, '1 needs attention' at 1, 'N need attention' otherwise**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attentionLabel is 'No open gates' at 0, '1 needs attention' at 1, 'N need attention' otherwise | `vscode-plugin/src/delivery/__tests__/board-views.test.ts` |

**unit: board-views.test.ts: an epic row's compactId is the epic's compact id and the 'Not in an epic' row's compactId is null**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an epic row's compactId is the epic's compact id and the 'Not in an epic' row's compactId is null | `vscode-plugin/src/delivery/__tests__/board-views.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-views.test.ts` | 0 | 8 | 0.3 s |  |

## t3

Run at 2026-10-09T17:00:44.243Z on commit `4654570c`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: board-details.test.ts: chain rows per route — full-chain story shows DEF/HLD from its epic plus LLD/PLAN/BUILD; small story has no PLAN row; small-bugfix has ISSUE and BUILD only; trivial has BUILD only; unknown lists recorded kinds only; a missing expected kind is 'Not recorded'; two BUILDs give two rows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chain rows per route — full-chain story shows DEF/HLD from its epic plus LLD/PLAN/BUILD; small story has no PLAN row; small-bugfix has ISSUE and BUILD only; trivial has BUILD only; unknown lists recorded kinds only; a missing expected kind is 'Not recorded'; two BUILDs give two rows | `vscode-plugin/src/delivery/__tests__/board-details.test.ts` |

**unit: board-details.test.ts: a story with CR, SPEC, EXT and AMD evidence gets a chain without those kinds, they remain in Records, and buildItemDetails does not throw**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a story with CR, SPEC, EXT and AMD evidence gets a chain without those kinds, they remain in Records, and buildItemDetails does not throw | `vscode-plugin/src/delivery/__tests__/board-details.test.ts` |

**unit: board-details.test.ts: conflict is { headline: 'Two records disagree', text } exactly when item.conflict is set**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | conflict is { headline: 'Two records disagree', text } exactly when item.conflict is set | `vscode-plugin/src/delivery/__tests__/board-details.test.ts` |

**unit: board-details.test.ts: kicker, chips and TaskRowView.resultTone**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | kicker, chips and TaskRowView.resultTone | `vscode-plugin/src/delivery/__tests__/board-details.test.ts` |

**unit: labels.test.ts: DISPLAY_LABELS carries chain.notRecorded, conflictHeadline and noMatchesTitle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DISPLAY_LABELS carries chain.notRecorded, conflictHeadline and noMatchesTitle | `vscode-plugin/src/delivery/__tests__/labels.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-details.test.ts` | 0 | 9 | 0.3 s |  |
| `vscode-plugin/src/delivery/__tests__/labels.test.ts` | 0 | 3 | 0.3 s |  |

## t4

Run at 2026-10-09T17:04:01.404Z on commit `f5b314b2`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: board-state.test.ts: statusView panel kinds — empty, unavailable, refresh-failed (stale with a shown snapshot, retry action), partial with affected entries from store notices and the unreadable count; freshnessLabel phrasing and NaN fallback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | statusView panel kinds — empty, unavailable, refresh-failed (stale with a shown snapshot, retry action), partial with affected entries from store notices and the unreadable count; freshnessLabel phrasing and NaN fallback | `vscode-plugin/src/delivery/__tests__/board-state.test.ts` |

**unit: board-state.test.ts: boardDownMessages with now keeps status first and the selected view's model second**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | boardDownMessages with now keeps status first and the selected view's model second | `vscode-plugin/src/delivery/__tests__/board-state.test.ts` |

**integration: board-host.test.ts: the refresh announcement text is unchanged after statusView takes now**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the refresh announcement text is unchanged after statusView takes now | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-host.test.ts` | 0 | 26 | 0.4 s |  |
| `vscode-plugin/src/delivery/__tests__/board-state.test.ts` | 0 | 6 | 0.3 s |  |

## t5

Run at 2026-10-09T17:06:14.190Z on commit `92d3da37`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: board-protocol.test.ts: parseBoardUpMessage accepts { type: 'clear-filters' } and rejects it with extra fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parseBoardUpMessage accepts { type: 'clear-filters' } and rejects it with extra fields | `vscode-plugin/src/delivery/__tests__/board-protocol.test.ts` |

**integration: board-host.test.ts: clear-filters resets search and attention, keeps scope and view, and resets paging**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | clear-filters resets search and attention, keeps scope and view, and resets paging | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: clear-filters with no snapshot shown posts only the status message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | clear-filters with no snapshot shown posts only the status message | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-host.test.ts` | 0 | 28 | 0.4 s |  |
| `vscode-plugin/src/delivery/__tests__/board-protocol.test.ts` | 0 | 3 | 0.3 s |  |

## t6

Run at 2026-10-09T17:09:01.189Z on commit `4a2472a5`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: board-host.test.ts: CSP string unchanged, exactly one aria-live region, #details precedes #board**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CSP string unchanged, exactly one aria-live region, #details precedes #board | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: BOARD_STYLE has only var(--vscode-*) colours, no display:none/visibility:hidden/clip, six equal columns when wide, density rules and :focus-visible**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | BOARD_STYLE has only var(--vscode-*) colours, no display:none/visibility:hidden/clip, six equal columns when wide, density rules and :focus-visible | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: BOARD_STYLE's 600 px block orders empty stage sections after non-empty ones and contains no hiding rule**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | BOARD_STYLE's 600 px block orders empty stage sections after non-empty ones and contains no hiding rule | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-host.test.ts` | 0 | 31 | 0.4 s |  |

## t7

Run at 2026-10-09T17:12:30.203Z on commit `8a4b1c8d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: board-host.test.ts: a rendered card shows its kicker, title, epic line, task summary and tone pills (data-tone) in the six-column board**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a rendered card shows its kicker, title, epic line, task summary and tone pills (data-tone) in the six-column board | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: every board column heading renders its label and a count chip holding the column total, for empty and non-empty stages alike**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every board column heading renders its label and a count chip holding the column total, for empty and non-empty stages alike | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: clicking a rollup row title posts set-scope for that epic (standalone for 'Not in an epic') and then set-view board, and the meter exposes completionLabel and aria-valuenow/max**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | clicking a rollup row title posts set-scope for that epic (standalone for 'Not in an epic') and then set-view board, and the meter exposes completionLabel and aria-valuenow/max | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: scope and attention chips post set-scope / set-attention with aria-pressed; tabs are role=tab with aria-selected and arrow-key movement**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | scope and attention chips post set-scope / set-attention with aria-pressed; tabs are role=tab with aria-selected and arrow-key movement | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-host.test.ts` | 0 | 35 | 0.4 s |  |

## t8

Run at 2026-10-09T17:18:51.490Z on commit `1e2edf3a`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: board-host.test.ts: opening a card shows #details before #board in DOM order with its heading focused, tasks as <details> rows with checks and dependency chips, and a 'Why this stage?' highlight with the stage reason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | opening a card shows #details before #board in DOM order with its heading focused, tasks as <details> rows with checks and dependency chips, and a 'Why this stage?' highlight with the stage reason | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: the conflict box is the first element after the details chips, before the task list**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the conflict box is the first element after the details chips, before the task list | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: a view with emptySelection renders 'Nothing matches this view' with Clear filters posting clear-filters; Retry posts refresh; the partial panel's 'Inspect affected records' lists artifact ids**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a view with emptySelection renders 'Nothing matches this view' with Clear filters posting clear-filters; Retry posts refresh; the partial panel's 'Inspect affected records' lists artifact ids | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: the script uses textContent only and posts only BoardUpMessage envelopes; Escape closes details and focus returns to the card or the tab**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the script uses textContent only and posts only BoardUpMessage envelopes; Escape closes details and focus returns to the card or the tab | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-host.test.ts` | 0 | 39 | 0.4 s |  |

## t9

Run at 2026-10-09T17:21:51.676Z on commit `87eee377`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**smoke: board-perf.test.ts: first render under 1 s and each filter change under 150 ms, best of three, on the 500-item / 1,000-record fixture with the new DOM**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a 500-item, 1,000-record board renders within one second and each filter change within 150 ms, best of three | `vscode-plugin/src/delivery/__tests__/board-perf.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-perf.test.ts` | 0 | 1 | 0.4 s |  |
