# S5 open issues

Logged 2026-10-18 after S5 (epic `team-signoff-claim-based-workflow`, `315d510cb28100e2`) was BUILD-approved with a recorded override. Every item stays **open** until its status line says otherwise. S4's open items are in [`s4-open-issues.md`](s4-open-issues.md); S4-1 (amendment `AMD-315d510cb28100e2-11`) is shared with s5's issue handling.

| # | Status | Issue | Owner / next step |
| :--- | :--- | :--- | :--- |
| S5-1 | resolved 2026-10-19 | Duplicated logic between `claim` and `teamGate` in `src/workflow/team/gate.ts`. Both repeat the holder comparison, the add-only `addAssignee` call, the failure handling and the contention check (an `addAssignee` result with more than one assignee). A change to claim verification has to be made in both, so the explicit claim (`team claim`) and the implicit claim (on `author` and `build`) can drift apart. Raised as a LOW finding in the S5 code review (round 1) and left as it is. | Extract the shared assignment decision into one helper used by both paths, keeping their distinct outcome messages. Cover it with the existing `gate.test.ts` claim and contention cases. |
