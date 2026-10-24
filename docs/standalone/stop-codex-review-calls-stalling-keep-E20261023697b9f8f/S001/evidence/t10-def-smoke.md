# t10 smoke: a real DEF review on the rebuilt daemon (2026-10-24)

Daemon: `~/.insrc/daemon` updated to fe21858a (contains t1-t9 of this Story) and
restarted with `maintenance.update` / `maintenance.restart` (rollout shared with
ISSUE-8d39ef09, evidence beside LLD-9874475f902756f6-S001).

Call: `insrc_review_step({ phase: 'start', artifact: <abs>/docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/DEF.md })`.
DEF-ce99b72065d03b1b was authored by the controller, so the daemon reviewed it
(the pipeline review whose codex calls stalled in ISSUE-562b1bb5).

## Result

- Started 16:02:36, finished 16:19:24: **16 min 48 s**, verdict `block` (0 HIGH, 13 MED, 51 LOW), `reviewedBy: daemon`, model `cli-codex:gpt-6.1-sol`.
- 67 codex calls completed in that window (`cli-provider codex completed`, /tmp/.insrc/daemon.log).
- No stall, timeout, retry or reply-shape error was logged. The only warnings: 6 x `review:probe: grep errored on root; skipping` (an evidence-probe problem, not a call limit).
- The MCP side ran the new code: its start line logs `timeoutMs: 5400000, idleMs: 300000` (t9's 5-minute no-frame give-up). It did not give up during the 16.8-minute review, so frames from workflow.review (phase progress and t8's per-minute heartbeat) kept reaching it.

## Limits of this smoke

- No call stalled, so the per-call-type retry was not exercised live; it is covered by the t5/t6 unit tests.
- The progress notifications the MCP server forwards to the client are not visible in a tool result, so their arrival at the client UI was not observed directly; what is shown is that the controller-side step received frames often enough never to hit its 5-minute idle limit.

Result: pass.
