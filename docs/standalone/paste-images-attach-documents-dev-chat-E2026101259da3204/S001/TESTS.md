<!-- insrc:artifact TESTS-59da3204a44afd1b-S001 -->

# Tests: 59da3204a44afd1b S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-12T10:25:29.172Z on commit `744692cd`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: attachment store: addBytes and addFile write into the session's own directory under a safe numbered name and return id, original name, kind, size and path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attachment store: addBytes and addFile write into the session's own directory under a safe numbered name and return id, original name, kind, size and path | `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` |

**unit: attachment store: an oversize paste or file, a mime outside the image list and a source that is not a regular file are refused with AttachmentRefused and nothing is written**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attachment store: an oversize paste or file, a mime outside the image list and a source that is not a regular file are refused with AttachmentRefused and nothing is written | `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` |

**unit: attachment store: remove ignores an id that is not a plain file name in the session's directory, and remove and removeSession succeed when the target is gone**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attachment store: remove ignores an id that is not a plain file name in the session's directory, and remove and removeSession succeed when the target is gone | `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` |

**unit: attachment store: sweep removes only directories of sessions not kept whose files are all older than the age**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attachment store: sweep removes only directories of sessions not kept whose files are all older than the age | `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` |

**unit: attachment store: a failed write leaves no partial file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attachment store: a failed write leaves no partial file | `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` | 0 | 5 | 0.3 s |  |
