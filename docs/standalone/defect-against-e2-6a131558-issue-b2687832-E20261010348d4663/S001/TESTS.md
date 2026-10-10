<!-- insrc:artifact TESTS-348d4663a4bc17af-s1 -->

# Tests: 348d4663a4bc17af s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 33 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-10T05:47:27.819Z on commit `defe3195`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: board-protocol.test.ts: 'every new up-message parses and a malformed crumb, back or set-view gives null'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every new up-message parses and a malformed crumb, back or set-view gives null | `vscode-plugin/src/delivery/__tests__/board-protocol.test.ts` |

**unit: board-state.test.ts: 'statusView places empty and snapshot-less failures in the body and stale failures and partial evidence in the banner'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | statusView places empty and snapshot-less failures in the body and stale failures and partial evidence in the banner | `vscode-plugin/src/delivery/__tests__/board-state.test.ts` |

**unit: labels.test.ts: 'DISPLAY_LABELS carries the view, item-tab, attention and stage-section labels'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DISPLAY_LABELS carries the view, item-tab, attention and stage-section labels | `vscode-plugin/src/delivery/__tests__/labels.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-protocol.test.ts` | 0 | 4 | 0.3 s |  |
| `vscode-plugin/src/delivery/__tests__/board-state.test.ts` | 0 | 7 | 0.3 s |  |
| `vscode-plugin/src/delivery/__tests__/labels.test.ts` | 0 | 4 | 0.3 s |  |

## t2

Run at 2026-10-10T05:52:36.045Z on commit `777b5d67`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: board-model.test.ts: 'stage sections start open when they hold matches, closed when empty, and Complete closed with its attention hint unless Needs attention is on'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stage sections start open when they hold matches, closed when empty, and Complete closed with its attention hint unless Needs attention is on | `vscode-plugin/src/delivery/__tests__/board-model.test.ts` |

**unit: board-model.test.ts: 'totals read N items · M need attention, or M of N with Show all under Needs attention, and empty stages fold under Needs attention'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | totals read N items · M need attention, or M of N with Show all under Needs attention, and empty stages fold under Needs attention | `vscode-plugin/src/delivery/__tests__/board-model.test.ts` |

**unit: board-views.test.ts: 'a standalone issue correcting a story of an epic counts towards no epic, and the epic's Epics row equals its board header'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a standalone issue correcting a story of an epic counts towards no epic, and the epic's Epics row equals its board header | `vscode-plugin/src/delivery/__tests__/board-views.test.ts` |

**unit: board-views.test.ts: 'the Epics body filters rows by epic title or id and by attention, with whole-epic counts, and a search matching no epic gives the no-matches panel'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the Epics body filters rows by epic title or id and by attention, with whole-epic counts, and a search matching no epic gives the no-matches panel | `vscode-plugin/src/delivery/__tests__/board-views.test.ts` |

**unit: board-views.test.ts: 'the Issues body lists issues in stage order with their parent, parent notice and fix stories'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the Issues body lists issues in stage order with their parent, parent notice and fix stories | `vscode-plugin/src/delivery/__tests__/board-views.test.ts` |

**unit: board-details.test.ts: 'correctedBy lists the issues correcting the item and approvedAt reads the approval time'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | correctedBy lists the issues correcting the item and approvedAt reads the approval time | `vscode-plugin/src/delivery/__tests__/board-details.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-details.test.ts` | 0 | 13 | 0.3 s |  |
| `vscode-plugin/src/delivery/__tests__/board-model.test.ts` | 0 | 14 | 0.3 s |  |
| `vscode-plugin/src/delivery/__tests__/board-views.test.ts` | 0 | 8 | 0.3 s |  |

## t3

Run at 2026-10-10T05:59:13.757Z on commit `88e9a2b4`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: board-state.test.ts: 'set-view from a story screen resets the trail to one root and keeps only the attention flag'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | set-view from a story screen resets the trail to one root and keeps only the attention flag | `vscode-plugin/src/delivery/__tests__/board-state.test.ts` |

**unit: board-state.test.ts: 'open-epic and open-item push entries with new ids and record the opener, and the trail is capped at 20 keeping the root'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | open-epic and open-item push entries with new ids and record the opener, and the trail is capped at 20 keeping the root | `vscode-plugin/src/delivery/__tests__/board-state.test.ts` |

**unit: board-state.test.ts: 'back and go-to-crumb restore the earlier entry with its own search, attention and paging'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | back and go-to-crumb restore the earlier entry with its own search, attention and paging | `vscode-plugin/src/delivery/__tests__/board-state.test.ts` |

**unit: board-state.test.ts: 'filter intents are ignored on an item screen, and a refresh that removes the item truncates the trail with a notice'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | filter intents are ignored on an item screen, and a refresh that removes the item truncates the trail with a notice | `vscode-plugin/src/delivery/__tests__/board-state.test.ts` |

**unit: board-state.test.ts: 'every screen message carries a breadcrumb that follows the trail and a back label naming where Back goes'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every screen message carries a breadcrumb that follows the trail and a back label naming where Back goes | `vscode-plugin/src/delivery/__tests__/board-state.test.ts` |

**integration: details-memory.test.ts: 'the memory is told null once the item screen is left'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the memory is told null once the item screen is left | `vscode-plugin/src/delivery/__tests__/details-memory.test.ts` |
| pass | the host checks the ids it is sent and announces each screen change once | `vscode-plugin/src/delivery/__tests__/details-memory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-state.test.ts` | 0 | 9 | 0.3 s |  |
| `vscode-plugin/src/delivery/__tests__/details-memory.test.ts` | 0 | 3 | 0.4 s |  |

## t4

Run at 2026-10-10T06:06:38.783Z on commit `ecad4653`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: board-host.test.ts: 'opening an epic and then a story replaces #main each time, and nothing from an earlier screen remains'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | opening an epic and then a story replaces #main each time, and nothing from an earlier screen remains | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: 'the filter bar has exactly the four views and Needs attention, and no epic is a chip'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the filter bar has exactly the four views and Needs attention, and no epic is a chip | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: 'an Epics row opens that epic's board with its header, breadcrumb and ← Epics, and no view control'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an Epics row opens that epic's board with its header, breadcrumb and ← Epics, and no view control | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: 'stages render as six <details> sections in workflow order, and a toggled section stays as the reader left it across a refresh'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stages render as six <details> sections in workflow order, and a toggled section stays as the reader left it across a refresh | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: 'a narrow pane shortens the breadcrumb and folds empty stages into Other stages · 0 matching, and widening re-renders the wide form'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a narrow pane shortens the breadcrumb and folds empty stages into Other stages · 0 matching, and widening re-renders the wide form | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: 'Back restores the saved scroll and focuses the card that opened the story; Escape goes back'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Back restores the saved scroll and focuses the card that opened the story; Escape goes back | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: 'empty replaces the screen, no matches replaces the list area with Clear filters, and a failed refresh over a story keeps the story under the banner'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | empty replaces the screen, no matches replaces the list area with Clear filters, and a failed refresh over a story keeps the story under the banner | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: 'CSP string unchanged, exactly one aria-live region, and the script uses textContent only and posts only BoardUpMessage envelopes'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CSP string unchanged, exactly one aria-live region, and the script uses textContent only and posts only BoardUpMessage envelopes | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-host.test.ts` | 0 | 27 | 0.4 s |  |

## t5

Run at 2026-10-10T06:11:36.811Z on commit `76fc89e8`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: board-host.test.ts: 'opening a story replaces the screen: #main holds only the story screen, with its breadcrumb and Back, and no card from the list it came from'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | opening a story replaces the screen: #main holds only the story screen, with its breadcrumb and Back, and no card from the list it came from | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: 'the story tabs post set-item-tab; overview shows the conflict first, tasks, why and chain; evidence is a records table with open buttons'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the story tabs post set-item-tab; overview shows the conflict first, tasks, why and chain; evidence is a records table with open buttons | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: 'linked work lists the epic, children and correcting issues, each opening its own screen'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | linked work lists the epic, children and correcting issues, each opening its own screen | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: 'the issue screen opens what it corrects, or shows the parent notice, and lists its fix stories'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the issue screen opens what it corrects, or shows the parent notice, and lists its fix stories | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-host.test.ts` | 0 | 31 | 0.4 s |  |

## t6

Run at 2026-10-10T06:19:06.714Z on commit `dc87f5bd`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: board-host.test.ts: 'BOARD_STYLE keeps a 320px minimum, card and column minimums, the records table scroll wrapper and only var(--vscode-*) colours, with no hiding rule'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | BOARD_STYLE keeps a 320px minimum, card and column minimums, the records table scroll wrapper and only var(--vscode-*) colours, with no hiding rule | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**integration: board-host.test.ts: 'density is restored from the webview state, saved on change and mirrored to the host, and both densities render every screen'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | density is restored from the webview state, saved on change and mirrored to the host, and both densities render every screen | `vscode-plugin/src/delivery/__tests__/board-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-host.test.ts` | 0 | 30 | 0.4 s |  |

## t7

Run at 2026-10-10T06:21:19.626Z on commit `314e42d7`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: board-protocol.test.ts: 'the removed set-scope, select-item, close-details and set-view board give null'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the removed set-scope, select-item, close-details and set-view board give null | `vscode-plugin/src/delivery/__tests__/board-protocol.test.ts` |

**integration: board-wiring.test.ts: 'extension.ts registers insrc.delivery.openBoard outside the chat gate with a warn-and-error logger and a repo-scoped delivery client'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | extension.ts registers insrc.delivery.openBoard outside the chat gate with a warn-and-error logger and a repo-scoped delivery client | `vscode-plugin/src/delivery/__tests__/board-wiring.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-protocol.test.ts` | 0 | 5 | 0.3 s |  |
| `vscode-plugin/src/delivery/__tests__/board-wiring.test.ts` | 0 | 2 | 0.4 s |  |

## t8

Run at 2026-10-10T06:22:58.974Z on commit `9c2f0f3f`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**smoke: board-perf.test.ts: 'a 500-item, 1,000-record board renders within one second and each filter change or drill-down within 150 ms, best of three'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a 500-item, 1,000-record board renders within one second and each filter change or drill-down within 150 ms, best of three | `vscode-plugin/src/delivery/__tests__/board-perf.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-perf.test.ts` | 0 | 1 | 0.4 s |  |
