<!-- insrc:artifact PLAN-ddc4ede1dbf84626-s1 -->

# Plan: E20261012ddc4ede1:S001

## Summary

**Epic:** `page-dev-chat-transcript-show-latest`
**LLD run:** `wf-1791789281233-4pjafm`
**LLD effective hash:** `6baf2b206346...`

Eight tasks, each leaving the test suite green. First the pieces nothing depends on yet: the page-cutting rule, the message shapes, and the registry and test-fixture additions. Then the host starts writing each row before posting it with its index and answers requests for older pages, while the webview pager is built and tested on its own in two steps. Only then is the pager embedded in the chat shell, and last the host switches to sending just the latest window when a chat opens. This is the plan as amended on 2026-10-12: one check of task 3 described a state that cannot occur and now states what the code does.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Page-cutting module | S | — | unit: latestWindow: a transcript no longer than one page is returned whole with firstIndex 0; unit: latestWindow: a long transcript returns its last page, moved back to the start of the turn when a user row is within one more page, and never more than two pages of rows; unit: latestWindow and pageBefore: with no user row within reach the cut is the plain page; consecutive pages cover every row exactly once; unit: pageBefore: before is clamped to 0..length; at 0 it returns no rows and firstIndex 0; unit: walking pageBefore from the latest window down to 0 reproduces the whole transcript in order with no row skipped or repeated | [[c2]] [[c5]] [[c7]] |
| 2 | **`t2`** Protocol shapes for paging | S | — | unit: WEBVIEW_TO_HOST_TYPES includes 'load-older' and HOST_TO_WEBVIEW_TYPES includes 'transcript-page', alongside every prior kind | [[c2]] [[c5]] |
| 3 | **`t3`** Host: write-then-post with row indexes, and answer load-older | M | `t1`, `t2` | integration: live rows carry rowIndex from all five writers: assistant, marker and tool-result events, the user-row, a permission outcome and a selection outcome are each posted with the absolute index of the row already written; status and approval-request carry none; integration: write-then-post order: when each live row is posted, the transcript already holds it at that index; integration: a followed turn writes each row before posting it; after a chat switch the follow stops, posting and writing nothing more; the write is outside the shown-session guard; integration: load-older for the active session answers one transcript-page whose rows end just before `before`; repeated requests walk back to index 0; integration: load-older for another session id, or with a malformed before or sessionId, posts nothing; integration: session-restored carries firstIndex 0 and total while the whole transcript is still sent | [[c1]] [[c2]] [[c3]] [[c5]] [[c8]] |
| 4 | **`t4`** Fixture scroll metrics and registry paging companions | S | — | unit: registry forgetKeysBefore drops only the r<n> keys below the index; withIsolatedPending runs a render with an empty pending-tool list and restores the live list afterwards; unit: registry forgetPendingIn drops the pending tool entries whose node is given, and a later result for one renders as its own row; unit: fake-dom nodes carry scrollTop, scrollHeight and clientHeight | [[c1]] [[c2]] [[c4]] [[c6]] |
| 5 | **`t5`** Pager: follow rule, stamping and trimming | M | `t4` | unit: a live row rendered by the registry while the view is scrolled up leaves scrollTop unchanged and trims nothing, even with more than 300 rows held; unit: a live row rendered by the registry while the view is at the bottom moves the view to the bottom; with more than 300 rows held the oldest nodes are then removed back to a user row leaving about 200, and the view is still at the bottom; unit: one turn longer than 300 rows is trimmed by a plain cut, and a pending tool row in the removed range is dropped so a later result renders as its own row; unit: pager reset: a restore sets the first held index and total and ends at the bottom | [[c1]] [[c2]] [[c3]] [[c4]] [[c6]] [[c7]] |
| 6 | **`t6`** Pager: older pages, load requests and the bar | M | `t5` | unit: pager prepend: an older page is rendered above the held rows in transcript order, keyed r<absolute index>; scrollTop grows by exactly the height added and the view is never moved to the bottom while the page renders; unit: pager prepend: a page for another session, or whose before is not the first held index, is discarded and adds no row; unit: trimmed rows render again when their page comes back: the dropped keys are forgotten, so appendKeyed renders new nodes; unit: pager load request: one load-older is sent for the first held index on a bar click or a scroll to the top; no second request is sent while one is loading; the flag clears on the matching page, on a restore and after 5 seconds; unit: returning to the bottom with more than 300 rows held runs the trim from the scroll listener; unit: a row that throws while an older page renders falls back, and following is switched back on afterwards; unit: the 'load earlier' bar is shown only when the first held index is above 0, names the count of older rows, and appears after a trim | [[c1]] [[c2]] [[c3]] [[c4]] |
| 7 | **`t7`** Embed the pager in the shell | M | `t3`, `t6` | integration: the shell embeds the pager: line() appends through it, session-restored replays with absolute keys through its reset, transcript-page goes to prepend, live rows are stamped and trimmed, and the provider lock settles from total; integration: the shell is still one nonce'd inline script, with no direct scrollTop write outside the pager, no innerHTML outside the guarded markdown path and no remote origin | [[c1]] [[c2]] [[c3]] [[c5]] [[c6]] |
| 8 | **`t8`** Send only the latest window on restore | S | `t7` | integration: opening a 1,000-row session posts session-restored with at most 200 rows, firstIndex at a turn start, total 1,000 and the session's mode; a short session is posted whole with firstIndex 0; integration: ready, new-chat and open-chat post the same windowed session-restored; integration: a ready after older pages were requested posts the latest window again, with the approval head after it; integration: the stored session is unchanged by paging: after restores and page loads the saved transcript equals the original rows | [[c1]] [[c2]] [[c3]] [[c5]] |

### 1.1 E20261012ddc4ede1:S001:T001 — Page-cutting module

Add the vscode-free transcript-window module: latestWindow(transcript, pageRows) and pageBefore(transcript, before, pageRows), each returning { firstIndex, rows }, with the one rule (PAGE_ROWS back from the end of the range, then back to the nearest user row within a further PAGE_ROWS, else the plain cut), `before` clamped to 0..length, and the fixed constants (PAGE_ROWS = 100). Nothing uses it yet.

**Acceptance checks:**
- A transcript no longer than one page is returned whole with firstIndex 0
- A long transcript returns at most two pages of rows, starting at a user row when one is within reach, else the plain last page
- pageBefore clamps `before`; at 0 it returns no rows and firstIndex 0
- Walking pageBefore from the latest window to 0 reproduces the whole transcript, no row skipped or repeated
- The sizes are named constants; no setting is read

### 1.2 E20261012ddc4ede1:S001:T002 — Protocol shapes for paging

In protocol.ts add the optional `firstIndex` and `total` on session-restored, optional `rowIndex` on turn-event and user-row, the WebviewToHost `load-older` message and the HostToWebview `transcript-page` message; add 'load-older' to WEBVIEW_TO_HOST_TYPES and 'transcript-page' to HOST_TO_WEBVIEW_TYPES, with a protocol.test.ts case. Types only; no behaviour changes.

**Acceptance checks:**
- The two unions carry the new messages and optional fields and the project typechecks
- WEBVIEW_TO_HOST_TYPES includes 'load-older' and HOST_TO_WEBVIEW_TYPES includes 'transcript-page', with every prior kind still present

### 1.3 E20261012ddc4ede1:S001:T003 — Host: write-then-post with row indexes, and answer load-older

In chat-panel.ts make appendEvent return the index of the row it wrote; in the run sink and the followed-turn sink call appendEvent first and post second with `rowIndex` (in the followed sink the write stays before and outside the `!disposed && session === s` guard); in recordPermissionOutcome and recordSelectionOutcome push first and post with `rowIndex` (none when there is no session); add `rowIndex` to runTurn's user-row. Add the `load-older` handler: validate sessionId and before, ignore a request for a session that is not active, and post one transcript-page cut by pageBefore. session-restored still carries the whole transcript, now with firstIndex 0 and total; any existing deep-equality assertion on that payload is updated here. AMENDED: the earlier check that a turn followed for a session that is not shown 'still writes its rows' described a state that cannot occur, because a chat switch or a closed panel aborts the follow at once; it is replaced by what the code does.

**Acceptance checks:**
- Every persisted live row (assistant, marker, tool-result, user, permission outcome, selection outcome) is posted with the absolute index of a row the transcript already holds; status and approval-request carry none
- The rows written to the transcript are unchanged
- A followed turn's row is written before it is posted with its index; after a chat switch the follow stops, posting and writing nothing more (the rest is read again on the next resume, as before this change); in the followed-turn sink the write is before and outside the shown-session guard
- load-older for the active session answers one transcript-page ending just before `before`; repeated requests walk back to 0
- load-older for another session id, or with a malformed before or sessionId, posts nothing
- session-restored carries firstIndex 0 and total, and the existing session-restored assertions pass

### 1.4 E20261012ddc4ede1:S001:T004 — Fixture scroll metrics and registry paging companions

Add scrollTop, scrollHeight and clientHeight to the shared __tests__/fake-dom.ts (no second fake DOM). Add three companions to the render registry's returned object: forgetKeysBefore(index), which drops the r<n> keys below an index; withIsolatedPending(fn), which runs a render with an empty pending-tool list and restores the live list afterwards; and forgetPendingIn(nodes), which drops pending tool entries whose row node is one of the given nodes.

**Acceptance checks:**
- fake-dom.ts nodes carry scrollTop, scrollHeight and clientHeight, and its existing tests pass
- forgetKeysBefore drops only the r<n> keys below the index; other keys and nodes are untouched
- withIsolatedPending runs the render with an empty pending list and restores the live list afterwards, also when the render throws
- forgetPendingIn drops exactly the pending entries whose node is given; a later tool result for a dropped entry renders as its own row
- The existing registry tests pass unchanged

### 1.5 E20261012ddc4ede1:S001:T005 — Pager: follow rule, stamping and trimming

Add the transcript-pager webview source module with its window state and: append(node), the single way a node joins the terminal, which follows to the bottom only when the view was at the bottom before the append and no page is being rendered; reset(firstIndex, total), which ends at the bottom; stamp(fromChild, rowIndex); and trimIfNeeded(), which, above 300 held rows and at the bottom, removes the oldest nodes back to a user row leaving about 200, cuts plainly when no user row is in the removable range, and calls forgetKeysBefore and forgetPendingIn for what it removed. Tests build the real registry on a line() that appends through the pager, on fake-dom.ts. The shell does not embed it yet.

**Acceptance checks:**
- A live row rendered through the registry while the view is scrolled up leaves scrollTop unchanged and trims nothing, even above 300 held rows
- A live row while at the bottom follows to the bottom; above 300 held rows the oldest are removed back to a user row leaving about 200 and the view is still at the bottom
- One turn longer than 300 rows is trimmed by a plain cut; a pending tool row in the removed range is dropped, so a later result renders as its own visible row
- reset sets the first held index and total and ends at the bottom
- The sizes are named constants; the pager tests use fake-dom.ts and define no fake DOM of their own

### 1.6 E20261012ddc4ede1:S001:T006 — Pager: older pages, load requests and the bar

Extend the pager with: prepend(page), which discards a page that does not match the shown session and first held index, records scrollTop and scrollHeight, renders the page through the registry (keys r<absolute index>, pending rows isolated, following off, cleared in a finally), moves the new nodes above the held ones and restores the reader's place; the load request with its one-at-a-time flag, cleared on the matching page, on reset and after 5 seconds; the scroll listener that requests a page at the top and runs the trim on return to the bottom; and the 'load earlier' bar, shown when the first held index is above 0, with the count of older rows.

**Acceptance checks:**
- prepend renders an older page above the held rows in order, keyed r<absolute index>; scrollTop grows by exactly the height added and the view never jumps to the bottom
- A page for another session or with the wrong `before` adds no row
- Trimmed rows render again when their page comes back
- One load-older is sent per request (bar click or scroll to the top); none while loading; the flag clears on the matching page, on reset and after 5 seconds
- Returning to the bottom above 300 held rows runs the trim
- A row that throws while a page renders falls back and following is switched back on
- The bar is shown only when the first held index is above 0 and names the count of older rows

### 1.7 E20261012ddc4ede1:S001:T007 — Embed the pager in the shell

In the chat-panel.ts shell create the pager before the registry and hand it the registry; route line(), renderDiff and the approval-card branch through pager.append (no direct scrollTop writes); on session-restored reset the registry keys and the pager, replay rows with absolute keys (firstIndex + i) and end at the bottom; send transcript-page to prepend; stamp live rows with rowIndex and run the trim; wire the bar and scroll to post load-older; settle the provider lock from total. Update, in this same task, the three shell-text pins in chat-panel.test.ts (the replay loop, the appendKeyed key and the setProvLock expression) and any pin on line()'s scroll. Scroll behaviour itself is proven by the pager tests that drive the real registry; this task's own tests are the shell-text pins and the host integration tests still passing. The host still sends the whole transcript.

**Acceptance checks:**
- The shell embeds the pager source; line(), renderDiff and the approval card append through it and no other code sets the terminal's scrollTop
- session-restored replays with keys r<firstIndex + i> through the pager's reset; transcript-page goes to prepend; live rows are stamped and trimmed
- The provider lock settles from total
- The shell is still one nonce'd inline script with no innerHTML outside the guarded markdown path and no remote origin
- The three shell-text pins are updated in this task and the whole chat test suite passes at this commit

### 1.8 E20261012ddc4ede1:S001:T008 — Send only the latest window on restore

Switch postInitialState, the new-chat handler and the open-chat handler to post session-restored through one helper that uses latestWindow, so only the latest window is sent with its firstIndex and total. Update the tests that assert the whole transcript is posted.

**Acceptance checks:**
- Opening a 1,000-row session posts at most 200 rows, firstIndex at a turn start, total 1,000 and the session's mode; a short session is posted whole with firstIndex 0
- ready, new-chat and open-chat post the same windowed session-restored
- A `ready` after older pages were requested posts the latest window again, with the approval head after it
- After restores and page loads the saved transcript equals the original rows

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| latestWindow: a transcript no longer than one page is returned whole with firstIndex 0 | `t1` |
| latestWindow: a long transcript returns its last page, moved back to the start of the turn when a user row is within one more page, and never more than two pages of rows | `t1` |
| latestWindow and pageBefore: with no user row within reach the cut is the plain page; consecutive pages cover every row exactly once | `t1` |
| pageBefore: before is clamped to 0..length; at 0 it returns no rows and firstIndex 0 | `t1` |
| walking pageBefore from the latest window down to 0 reproduces the whole transcript in order with no row skipped or repeated | `t1` |
| a live row rendered by the registry while the view is scrolled up leaves scrollTop unchanged and trims nothing, even with more than 300 rows held | `t5` |
| a live row rendered by the registry while the view is at the bottom moves the view to the bottom; with more than 300 rows held the oldest nodes are then removed back to a user row leaving about 200, the bar appears, and the view is still at the bottom | `t5`, `t6` |
| returning to the bottom with more than 300 rows held runs the trim from the scroll listener | `t6` |
| pager prepend: an older page is rendered above the held rows in transcript order, keyed r<absolute index>; scrollTop grows by exactly the height added and the view is never moved to the bottom while the page renders | `t6` |
| pager prepend: a page for another session, or whose before is not the first held index, is discarded and adds no row | `t6` |
| trimmed rows render again when their page comes back: the dropped keys are forgotten, so appendKeyed renders new nodes | `t6` |
| pager reset: a restore sets the first held index and total, ends at the bottom, and shows the 'load earlier' bar only when the first held index is above 0, naming the count of older rows | `t5`, `t6` |
| pager load request: one load-older is sent for the first held index on a bar click or a scroll to the top; no second request is sent while one is loading; the flag clears on the matching page, on a restore and after 5 seconds | `t6` |
| a row that throws while an older page renders falls back, and following is switched back on afterwards | `t6` |
| registry forgetKeysBefore drops only the r<n> keys below the index; withIsolatedPending runs a render with an empty pending-tool list and restores the live list afterwards | `t4` |
| WEBVIEW_TO_HOST_TYPES includes 'load-older' and HOST_TO_WEBVIEW_TYPES includes 'transcript-page', alongside every prior kind | `t2` |
| opening a 1,000-row session posts session-restored with at most 200 rows, firstIndex at a turn start, total 1,000 and the session's mode; a short session is posted whole with firstIndex 0 | `t8` |
| ready, new-chat and open-chat post the same windowed session-restored | `t8` |
| load-older for the active session answers one transcript-page whose rows end just before `before`; repeated requests walk back to index 0 | `t3` |
| load-older for another session id, or with a malformed before or sessionId, posts nothing | `t3` |
| live rows carry rowIndex from all five writers: assistant, marker and tool-result events, the user-row, a permission outcome and a selection outcome are each posted with the absolute index of the row already written; status and approval-request carry none | `t3` |
| write-then-post order: when each live row is posted, the transcript already holds it at that index | `t3` |
| a turn followed for a session that is not shown still writes its rows and posts nothing | `t3` |
| the shell embeds the pager: line() appends through it, session-restored replays with absolute keys through its reset, transcript-page goes to prepend, live rows are stamped and trimmed, and the provider lock settles from total | `t7` |
| the stored session is unchanged by paging: after restores and page loads the saved transcript equals the original rows | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails (postInitialState, appendEvent, recordPermissionOutcome, recordSelectionOutcome, runTurn, line, appendKeyed, resetKeys)`
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges (session-restored, load-older, transcript-page, rowIndex, transcript-window, transcript-pager, fake-dom.ts, ChatSession invariant)`
- **[[c3]]** `prior-artifact` `LLD S001 errorPaths (error cases, edge cases, invariants to preserve)`
- **[[c4]]** `prior-artifact` `LLD S001 testStrategy (test levels, subjects, fixtures)`
- **[[c5]]** `prior-artifact` `LLD S001 migration (six ordered steps, backward compatibility)`
- **[[c6]]** `prior-artifact` `LLD S001 review override, 2026-10-12` — "(1) The three shell-text pins in chat-panel.test.ts are updated in the same task that embeds the pager. (2) The trim cuts plainly when no user row is in the removable range, drops pending tool entries"
- **[[c7]]** `stakeholder` `LLD S001 open questions, resolved by the user 2026-10-12` — "fixed sizes no settings"
- **[[c8]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts (plan amendment approved by the user 2026-10-12: a chat switch or a closed panel aborts the follow, so no event is delivered for a session that is not shown)` — "following?.ctl.abort(); // a resumed turn: its process is not ours to stop here"
