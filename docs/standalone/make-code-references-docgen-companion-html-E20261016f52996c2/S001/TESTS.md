<!-- insrc:artifact TESTS-f52996c2709dba81-S001 -->

# Tests: f52996c2709dba81 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 17 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-16T11:29:23.058Z on commit `996e7c01`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/docgen/extract/__tests__/call-sequence-label.test.ts: a call frame is labelled with its path relative to the repo root and its line**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/docgen/extract/__tests__/call-sequence-label.test.ts: a call frame is labelled with its path relative to the repo root and its line | `src/docgen/extract/__tests__/call-sequence-label.test.ts` |

**unit: src/docgen/extract/__tests__/call-sequence-label.test.ts: a frame outside the root, or a build with no root, keeps the base-name label**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/docgen/extract/__tests__/call-sequence-label.test.ts: a frame outside the root, or a build with no root, keeps the base-name label | `src/docgen/extract/__tests__/call-sequence-label.test.ts` |

**unit: src/docgen/extract/__tests__/call-sequence-label.test.ts: node ids, edge ids and citations do not change with the label**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/docgen/extract/__tests__/call-sequence-label.test.ts: node ids, edge ids and citations do not change with the label | `src/docgen/extract/__tests__/call-sequence-label.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/docgen/extract/__tests__/call-sequence-label.test.ts` | 0 | 3 | 0.3 s |  |

## t2

Run at 2026-10-16T11:31:21.154Z on commit `c0611679`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: an element holding a path and line is marked, and a click posts that path and line to the parent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: an element holding a path and line is marked, and a click posts that path and line to the parent | `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts` |

**unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a table cell holding a path with no line is marked and posts the path alone**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a table cell holding a path with no line is marked and posts the path alone | `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts` |

**unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: text with no reference is not marked and a click on it posts nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: text with no reference is not marked and a click on it posts nothing | `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts` |

**unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: marking changes no text node**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: marking changes no text node | `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts` |

**unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a click on a marked box inside the pan/zoom viewport, which captures the pointer, posts the reference**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a click on a marked box inside the pan/zoom viewport, which captures the pointer, posts the reference | `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts` |

**unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a press, a move past the drag threshold and a release posts nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a press, a move past the drag threshold and a release posts nothing | `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts` |

**unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a bare file name is not marked**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: a bare file name is not marked | `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts` | 0 | 8 | 0.3 s |  |

## t3

Run at 2026-10-16T11:33:52.639Z on commit `1fc91785`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from the companion frame is posted to the host as an open-code-ref message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from the companion frame is posted to the host as an open-code-ref message | `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts` |

**unit: vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from any other window is ignored**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from any other window is ignored | `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts` |

**unit: vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a message with a missing, non-string or oversized path, or a line that is not a positive integer, is ignored**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a message with a missing, non-string or oversized path, or a line that is not a positive integer, is ignored | `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts` |

**unit: vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: the frame keeps sandbox allow-scripts only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: the frame keeps sandbox allow-scripts only | `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts` | 0 | 4 | 0.4 s |  |

## t4

Run at 2026-10-16T11:35:25.616Z on commit `e73cc2fb`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: the companion page and the docgen page carry the script, after the diagram is drawn**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: the companion page and the docgen page carry the script, after the diagram is drawn | `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts` |

**unit: src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: the docgen fallback shell carries the script and marks references at load**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts: the docgen fallback shell carries the script and marks references at load | `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts` | 0 | 10 | 0.5 s |  |

## t5

Run at 2026-10-16T11:36:50.249Z on commit `230b8645`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/docgen/__tests__/code-ref-grammar-pin.test.ts: the page script's reference grammar equals the chat page's CREF_EXT and CREF_CORE except that it requires a directory part**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/docgen/__tests__/code-ref-grammar-pin.test.ts: the page script's reference grammar equals the chat page's CREF_EXT and CREF_CORE except that it requires a directory part | `src/docgen/__tests__/code-ref-grammar-pin.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/docgen/__tests__/code-ref-grammar-pin.test.ts` | 0 | 1 | 0.3 s |  |
