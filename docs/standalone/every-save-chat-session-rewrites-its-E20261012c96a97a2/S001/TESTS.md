<!-- insrc:artifact TESTS-c96a97a204fac22b-S001 -->

# Tests: c96a97a204fac22b S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 18 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-12T09:10:47.854Z on commit `fff8f095`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: INDEX_KEY, SESSION_PREFIX, isSession and updatedAtOf are exported from session-store.ts and are the keys and checks the memento store itself uses**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | INDEX_KEY, SESSION_PREFIX, isSession and updatedAtOf are exported from session-store.ts and are the keys and checks the memento store itself uses | `vscode-plugin/src/chat/__tests__/session-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/session-store.test.ts` | 0 | 26 | 0.3 s |  |

## t2

Run at 2026-10-12T09:14:01.747Z on commit `1c71c3f5`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a save of a session with new rows appends exactly those rows to the rows file and replaces the head; the bytes written do not grow with the rows already stored (1,000 stored rows, one new row)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a save of a session with new rows appends exactly those rows to the rows file and replaces the head; the bytes written do not grow with the rows already stored (1,000 stored rows, one new row) | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**unit: a save with no new rows writes the head only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a save with no new rows writes the head only | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**unit: a draft writes nothing until its first save, which writes its rows and then its head; create() saves at once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a draft writes nothing until its first save, which writes its rows and then its head; create() saves at once | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**unit: get returns the saved session with every row variant, editMode, mode, nativeSessionId and liveTurn unchanged, and the same object on a second call without reading the files again**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | get returns the saved session with every row variant, editMode, mode, nativeSessionId and liveTurn unchanged, and the same object on a second call without reading the files again | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**unit: list reads head files only, never a rows file, and returns id, provider, title and updatedAt sorted by updatedAt descending**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | list reads head files only, never a rows file, and returns id, provider, title and updatedAt sorted by updatedAt descending | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**unit: a damaged head reads as no session and is left out of list; a rows file with a torn last line is read without it and cut back before the next append; a bad line in the middle is skipped**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a damaged head reads as no session and is left out of list; a rows file with a torn last line is read without it and cut back before the next append; a bad line in the middle is skipped | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**unit: an id with characters outside A-Za-z0-9_- is stored under sessionFileName(id) and read back with its real id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an id with characters outside A-Za-z0-9_- is stored under sessionFileName(id) and read back with its real id | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` | 0 | 7 | 0.3 s |  |

## t3

Run at 2026-10-12T09:17:10.214Z on commit `d73cc765`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: after another writer has appended to the rows file, the same held session object is saved three times (with a new row, with only a head change, and after a get of its id): every save only appends, the rows file is never replaced, it holds both writers' rows in save order, and the get returns a fresh object with all of them (mutation: untrack the object when the cached copy is dropped)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | after another writer has appended to the rows file, the same held session object is saved three times (with a new row, with only a head change, and after a get of its id): every save only appends, the rows file is never replaced, it holds both writers' rows in save order, and the get returns a fresh object with all of them (mutation: untrack the object when the cached copy is dropped) | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**unit: an object the store has never tracked, saved for an id whose files exist, replaces the rows file whole through a temporary file and a rename; so does a tracked object whose transcript is shorter than its count**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an object the store has never tracked, saved for an id whose files exist, replaces the rows file whole through a temporary file and a rename; so does a tracked object whose transcript is shorter than its count | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**unit: a failing append or head write makes save throw and leaves the object's count where the rows on disk are, so the next save writes the missing rows once and none twice**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failing append or head write makes save throw and leaves the object's count where the rows on disk are, so the next save writes the missing rows once and none twice | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**unit: with maxSessions set, a save that creates a new session removes the sessions with the oldest savedAt and their rows files and calls onEvict for each, never the session being saved; a failing remove is logged and the save succeeds; a cap of 0 or less is no cap**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with maxSessions set, a save that creates a new session removes the sessions with the oldest savedAt and their rows files and calls onEvict for each, never the session being saved; a failing remove is logged and the save succeeds; a cap of 0 or less is no cap | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**unit: a held session object saved after its files were removed is written whole with its head, get then returns every row, and the cap is applied without removing it (mutation: append only the rows beyond its count)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a held session object saved after its files were removed is written whole with its head, get then returns every row, and the cap is applied without removing it (mutation: append only the rows beyond its count) | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**unit: a save after the store cut back a torn last line appends and does not replace the rows file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a save after the store cut back a torn last line appends and does not replace the rows file | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` | 0 | 13 | 0.3 s |  |

## t4

Run at 2026-10-12T09:20:05.206Z on commit `38ce31e0`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the migration writes each indexed session's files, reads them back equal, then removes its memento key and the index; the store then lists and returns every session as the memento store did**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the migration writes each indexed session's files, reads them back equal, then removes its memento key and the index; the store then lists and returns every session as the memento store did | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**unit: a session whose write or read-back fails is left in the memento untouched, stays in the index and is returned in kept, and the others are still migrated**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a session whose write or read-back fails is left in the memento untouched, stays in the index and is returned in kept, and the others are still migrated | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**unit: a session whose files already hold a prefix of the memento's rows gets the missing rows appended and its memento key removed; one whose files hold more rows than the memento is left as it is on disk and its key removed; one that disagrees is changed in neither place and returned in kept**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a session whose files already hold a prefix of the memento's rows gets the missing rows appended and its memento key removed; one whose files hold more rows than the memento is left as it is on disk and its key removed; one that disagrees is changed in neither place and returned in kept | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**unit: the migration with no index, or run a second time, reads no session, writes nothing and returns no kept id; an entry isSession rejects is kept and logged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the migration with no index, or run a second time, reads no session, writes nothing and returns no kept id; an entry isSession rejects is kept and logged | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` | 0 | 17 | 0.3 s |  |
