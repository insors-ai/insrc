<!-- insrc:artifact ISSUE-f0da1b8b9cdb28b6 -->

# Stop review guidance from prompting sleep-based waits

## Reproduction

Start a design review or a code review from a Claude Code session and follow the shipped review guidance while it runs. The design-review guidance says to poll `progress` "about every 10–30 seconds" [[c1]] [[c3]]; the code-review steps say to observe progress but give no rule for how to wait between calls [[c2]]. Claude Code refuses a foreground `sleep 45` and tells the agent to "use Monitor with an until-loop" [[c4]]. Observed in session 1ba9ad48 (both times while polling a code review): on 2026-11-13 at 05:32 UTC the agent started a background `until grep -q … /dev/null; do sleep 20; done &` loop labelled "Placeholder no-op" that can never finish (it ran about 32 hours until killed) and a 10-minute Monitor that only sleeps; on 2026-11-14 at 12:57 UTC it armed another 10-minute Monitor described as "placeholder" that only sleeps [[c4]]. Each time it then kept calling `progress` every few seconds anyway. In the VS Code chat the session stays held while such a wait is armed, so the user's next message queued for up to ten minutes while the chat showed idle. Expected: the agent waits for a review without inventing waits that do nothing, and never leaves one armed when it hands control back to the user.

## Root cause

The review guidance asks for a polling interval but says nothing about how to wait for it, and the only interval it names is a fixed sleep the agent's harness forbids [[c1]] [[c2]] [[c3]]. Told to space its polls and refused a plain sleep, the agent satisfies the harness's suggestion with a Monitor or background loop that has no real condition [[c4]]. Nothing in the guidance says such a wait must watch something real, must end when the review ends, or must be stopped before the turn ends.

## Fix intent

Reword the waiting guidance in both review sections of the steering block and in the design-review execution document. The agent should either call `progress` again directly, without sleeping between calls, or wait with one background command whose own exit is the review reaching a terminal status in its checkpoint. It must never arm a placeholder or no-op wait (a loop or monitor with no real condition), and it must stop any wait it armed before ending a turn that asks the user a question. Guidance text only: no code, tool or schema change; the VS Code plugin picks the steering text up at its next packaging.

## Citations

- **[[c1]]** `doc` `src/prompts/steering-block.md:390` — "Poll `progress` conservatively (about every 10–30 seconds), show meaningful status"
- **[[c2]]** `doc` `src/prompts/steering-block.md:475-476` — "2. `progress`: observe the same repo/epicHash/reviewId/attempt, or read the atomic checkpoint. This never starts/resumes work. Report meaningful progress to user."
- **[[c3]]** `doc` `docs/design-review-execution.md:24` — "Poll `progress` about every 10–30 seconds and report meaningful progress."
- **[[c4]]** `stakeholder` `/Users/subhagho/.claude/projects/-Users-subhagho-work-projects-insors-insrc/1ba9ad48-edb1-4510-a396-ed5677f39097.jsonl` — "2026-11-13T05:32:00Z Bash `sleep 45; echo waited` -> Blocked: ... To wait for a condition, use Monitor with an until-loop ...; 05:32:06Z Bash `until grep -q ... /dev/null 2>/dev/null; do sleep 20; don"
