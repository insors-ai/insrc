<!-- insrc:artifact ISSUE-1973e125995f971e -->

# A large Story's code review is cancelled at 30 minutes and can never complete

## Reproduction

Run insrc_code_review_step for Epic 86197ac660732ceb Story s2, a 17-task Story. The daemon review starts at 21:04:07. Its review pipeline divides each dimension into several chunks, each about one model call of ~1 minute; conventions alone takes ~25 minutes. At 21:34:06 the daemon logs 'insrc_code_review_step: the daemon review did not complete; nothing stamped' (failure 'timeout', cause 'codeReview.run: no result from the daemon within 30 minutes') and 'code review failed; no record written' (err 'the review was cancelled'), while the quality dimension still has chunks to judge. Separately, the MCP client aborted the tool call itself after 1800 s with no progress. Observed: no CR-86197ac660732ceb-s2 record, so the Story cannot be completed without a review override. Expected: the review runs to completion and writes its record, however many chunks the Story's code needs.

## Root cause

Three fixed 30-minute limits apply to every code review whatever its size. (1) The review pipeline caps each review session at HARD_REVIEW_DEADLINE_MS, 30 minutes, a limit set for design reviews ('No design review may run longer than this'), applied to code reviews in src/workflow/review-pipeline/job.ts as Math.min(first.deadlineMs, HARD_REVIEW_DEADLINE_MS). (2) The code-review step waits for the daemon's codeReview.run result for DAEMON_CODE_REVIEW_WAIT_MS, also 30 minutes, and then cancels the review. (3) The tool reports no progress while it waits, so the MCP client gives up after 1800 s of silence. A Story whose review needs more chunks than fit in 30 minutes therefore always fails, and the work done so far is discarded.

## Fix intent

A code review is given the time its work needs: its limit follows the amount it has to judge (the chunks of every dimension), up to a ceiling that is a setting. The step's wait for the daemon and the client both stay alive for that time, the client because the tool reports progress while the review runs. A Story the size of 86197ac6 s2 then gets a complete review and record. Design reviews keep their own limits.

## Citations

- **[[c1]]** `code` `src/workflow/review/template.ts:61-62` — "export const HARD_REVIEW_DEADLINE_MS = 30 * 60_000;"
- **[[c2]]** `code` `src/workflow/review-pipeline/job.ts:200` — "const sessionLimitMs = Math.min(first.deadlineMs, HARD_REVIEW_DEADLINE_MS);"
- **[[c3]]** `code` `src/daemon/steps/code-review-step/handler.ts:716` — "export const DAEMON_CODE_REVIEW_WAIT_MS = 30 * 60_000;"
- **[[c4]]** `code` `src/daemon/steps/code-review-step/handler.ts:738-740`
- **[[c5]]** `code` `src/shared/review-stream.ts:215` — "() => failWith('timeout', `${method}: no result from the daemon within ${waitText(opts.timeoutMs)}`),"
- **[[c6]]** `code` `src/daemon/code-review-rpc.ts:46` — "const CODE_REVIEW_CLI_TIMEOUT_MS = 2_700_000;"
