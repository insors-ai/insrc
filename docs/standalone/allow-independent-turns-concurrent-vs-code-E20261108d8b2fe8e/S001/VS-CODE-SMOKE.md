# Concurrent chats in VS Code

Manual validation is pending. Record the extension version, operating system, provider, and observed result when the checks are run.

1. Close every VS Code window using the earlier extension for this repository. Install the build for this story and open the same repository in VS Code. If the queue reports that an older writer is still active, close that window and reload.
2. Open chat A and start a read-only task that runs long enough to switch chats. For example, ask the agent to run `sleep 45` and report when it finishes. Note the phase and elapsed time once A starts.
3. Create chat B in the same repository and start a second long-running read-only task. Confirm that B starts while A is running or waiting for approval.
4. Switch back to A from Active Chats. Confirm that its previous phase appears immediately and its elapsed time continues from the original start. Check that B’s messages stay in B.
5. Press Stop in A, then switch to B. Confirm that A stops, B keeps its original progress and elapsed time, and B can finish normally.

Record the outcome and any discrepancy in the story’s test record.

## Automated verification

The concurrent-chat end-to-end test and extension TypeScript check passed. The full extension suite ran on Node 26.5.1 after the six implementation tasks passed daemon validation. It reported 1,671 passes, 19 failures, and 9 skips.

- Sixteen failures in activation, approval subscription, the ledger UX fixtures, executable scanning, and the repo panels also failed in the pre-story checkout at `610671dd6`.
- The settings bundle and connection privacy checks passed on isolated reruns. The full run’s bundle error involved a temporary TypeScript probe from another test. The privacy check resolved its build entry from the repository root on rerun.
- The cross-window session-lock test read an incomplete fixture JSON file during the full run. It passed in isolation. Eight isolated repetitions on the pre-story checkout also passed, so the timing failure was not reproduced there.
