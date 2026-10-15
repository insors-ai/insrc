<!-- insrc:artifact TESTS-babd84c6e2fb480a-S001 -->

# Tests: babd84c6e2fb480a S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 25 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-15T05:44:51.534Z on commit `b11da5d9`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: protocol allowlist includes open-link and open-code-ref**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | protocol allowlist includes open-link and open-code-ref | `vscode-plugin/src/chat/__tests__/protocol.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/protocol.test.ts` | 0 | 13 | 0.3 s |  |

## t2

Run at 2026-10-15T05:45:51.325Z on commit `4855bcb1`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: companion-reader behaves as before after the containment helper is extracted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review wiring: readCompanion answers the text of an .html file under the workspace's docs/ folder and undefined for another extension, a path that leaves docs/, a missing file and a file over 8 MB | `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` |

**unit: resolveWithin refuses .. escapes, absolute paths, missing files and a symlink that points outside the root**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveWithin refuses .. escapes, absolute paths, missing files and a symlink that points outside the root | `vscode-plugin/src/chat/__tests__/resolve-within.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/resolve-within.test.ts` | 0 | 1 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` | 0 | 4 | 0.3 s |  |

## t3

Run at 2026-10-15T05:48:49.612Z on commit `ac4ecbd0`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the host opens a valid http url externally and refuses a non-http url**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the host opens a valid http url externally and refuses a non-http url | `vscode-plugin/src/chat/__tests__/link-opener.test.ts` |

**integration: the host opens an existing in-workspace path with the line selected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the host opens an existing in-workspace path with the line selected | `vscode-plugin/src/chat/__tests__/link-opener.test.ts` |

**integration: the host refuses an absolute path, a .. path, a missing file and a path with no workspace folder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the host refuses an absolute path, a .. path, a missing file and a path with no workspace folder | `vscode-plugin/src/chat/__tests__/link-opener.test.ts` |

**integration: the host refuses a symlink inside the workspace that points outside it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the host refuses a symlink inside the workspace that points outside it | `vscode-plugin/src/chat/__tests__/link-opener.test.ts` |

**integration: the host logs and survives an open that rejects or resolves false**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the host logs and survives an open that rejects or resolves false | `vscode-plugin/src/chat/__tests__/link-opener.test.ts` |

**integration: the host opens a clicked code reference in the column chooseReviewColumn picks, and Beside when it picks none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the host opens a clicked code reference in the column chooseReviewColumn picks, and Beside when it picks none | `vscode-plugin/src/chat/__tests__/link-opener.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/link-opener.test.ts` | 0 | 7 | 0.4 s |  |

## t4

Run at 2026-10-15T05:52:35.333Z on commit `6f3044aa`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a code reference with a line in running text becomes a link carrying its path and line**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a code reference with a line in running text becomes a link carrying its path and line | `vscode-plugin/src/chat/__tests__/link-markup.test.ts` |

**unit: text inside code and pre and existing anchors is not wrapped**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | text inside code and pre and existing anchors is not wrapped | `vscode-plugin/src/chat/__tests__/link-markup.test.ts` |

**unit: a version number is not treated as a path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a version number is not treated as a path | `vscode-plugin/src/chat/__tests__/link-markup.test.ts` |

**unit: a click on an http link posts open-link and prevents the default**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a click on an http link posts open-link and prevents the default | `vscode-plugin/src/chat/__tests__/link-markup.test.ts` |

**unit: a click on a code reference posts open-code-ref with path and line**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a click on a code reference posts open-code-ref with path and line | `vscode-plugin/src/chat/__tests__/link-markup.test.ts` |

**unit: guardMd still drops a non-http href**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | guardMd still drops a non-http href | `vscode-plugin/src/chat/__tests__/link-markup.test.ts` |

**unit: an http link keeps its target in data-url and has no href, so it cannot open by itself**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an http link keeps its target in data-url and has no href, so it cannot open by itself | `vscode-plugin/src/chat/__tests__/link-markup.test.ts` |

**unit: inline code whose whole text is a code reference becomes a link**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | inline code whose whole text is a code reference becomes a link | `vscode-plugin/src/chat/__tests__/link-markup.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/link-markup.test.ts` | 0 | 9 | 0.3 s |  |

## t5

Run at 2026-10-15T05:57:01.427Z on commit `32d6f3b9`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the review pane renderer source, run against a stub DOM, links a code reference, strips the href of an http link, and posts open-code-ref and open-link on click**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the review pane renderer source, run against a stub DOM, links a code reference, strips the href of an http link, and posts open-code-ref and open-link on click | `vscode-plugin/src/chat/__tests__/link-markup.test.ts` |
| pass | t4: guardMd strips a non-http href and an image src from the rendered body, and moves an http(s) address to data-url | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: the chat page and the review pane both include the linkify and click wiring**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the chat page and the review pane both include the linkify and click wiring | `vscode-plugin/src/chat/__tests__/link-markup.test.ts` |
| pass | t1: the emitted shell is byte-identical to the captured fixed-nonce baseline, and the bootstrap references functionalDefinition nowhere | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |
| pass | t1/t2: the shell matches the pin, and NOTHING reads either new field yet | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |
| pass | the shell inlines each of its source strings verbatim and exactly once, with the ux CSS fragment | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |
| pass | docs review shell: the shell is one inline script under a nonce CSP with no remote origin, and its recorded baseline is that of the new shell | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |
| pass | docs review shell: the list view's table is its own scrolling region, the toolbar and pager are outside it, titles and ids are set as text, and the recorded baseline is that of the new shell | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` | 0 | 228 | 16.8 s |  |
| `vscode-plugin/src/chat/__tests__/link-markup.test.ts` | 0 | 11 | 0.3 s |  |

## t6

Run at 2026-10-15T08:17:53.430Z on commit `32d6f3b9`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: an http link opens in the browser exactly once, in the chat and in the review pane**

Reported by the builder, not run by the gate: **pass**. Evidence: Reported by the user on 2026-10-15. In the chat, two clicks on an https link gave two approval prompts and two browser tabs, so one open per click. In a review pane, the user clicked the https://code.visualstudio.com/api/references/vscode-api#env link in this BUILD record's summary (BUILD.md line 11) and reported that the browser opened fine. The user was not asked to count tabs on the review pane click; the chat result shows the handler opens once per click.

**live: a code reference opens at its line, in the chosen editor group, and Beside when only the chat group exists**

Reported by the builder, not run by the gate: **pass**. Evidence: Reported by the user on 2026-10-15, all confirmed in the running editor: a code reference in the chat and one in the review pane (vscode-plugin/src/chat/link-opener.ts in this Story's LLD) opened; the file opened with the referenced line selected; it opened in the right editor group with another group open; and with only the chat group open it opened beside it. package.json at the workspace root also opened.
