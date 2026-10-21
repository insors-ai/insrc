<!-- insrc:artifact ISSUE-d3a6b651962959a9 -->

# Read codex's last agent message as its answer

## Reproduction

Run a code review whose relation calls go to codex, for example `codeReview.run` on Epic c2ba6fa6 Story s1 against the daemon. Observed on 2026-10-21 (codex-cli 0.154.0): for about 85 minutes the daemon logged roughly 40 `review pipeline: a call did not complete` warnings a minute (dimension adherence, role relation, cause transient), each straight after `codex completed` with exit code 0 and an agent message. Each call was re-issued once, failed again and was recorded as not judged, so the review could never judge a relation. codex's own session files for those calls end with a valid answer, for example `{"callId":"059fd16b-1288-4acb-b3aa-2c56ebefb78b","answer":{"findings":[]}}`, preceded by a narration message such as "I'll inspect the call and lookup implementation to check the arguments, return handling, and error behavior." Premise calls in the DEF reviews of Epic 86197ac6 failed the same way. Expected: the call's answer is the JSON codex returned, and the review judges the relation. Second symptom: the warning carries no failure detail, so the daemon log does not say why the call failed.

## Root cause

`runCodex` picks the FIRST completed `agent_message` event as the run's text (src/agent/providers/cli-provider.ts:574-576). A codex run that uses tools in the repository narrates before it answers, so the first agent message is the narration and the answer is the LAST one. `completeStructured` then `JSON.parse`s the narration (src/agent/providers/cli-provider.ts:336-344) and throws `codex agent_message.text was not parseable JSON`. The review-pipeline driver does not recognise that message, so it classifies the failure as `transient` (src/workflow/review-pipeline/driver.ts:104-110) and re-issues the call once, which fails the same way. `complete` (src/agent/providers/cli-provider.ts:231-233) and the path at src/agent/providers/cli-provider.ts:389-390 read the same first message and would return the narration as the text. The reviewer-session path already takes the last agent message for exactly this reason (src/agent/providers/cli-provider.ts:464-466). The driver's warning (src/workflow/review-pipeline/driver.ts:65) logs dimension, stage, role, attempt and cause, but not the failure detail it already has from `classify`.

## Fix intent

Every codex call reads the run's answer from its last agent message, as the reviewer-session path already does, so a run that narrates before answering is parsed correctly by `completeStructured`, `complete` and the other path that reads the text. The review-pipeline driver's 'a call did not complete' warning also carries the failure detail, so a failing call's cause is visible in the daemon log. A run with a single agent message behaves exactly as today.

## Citations

- **[[c1]]** `code` `src/agent/providers/cli-provider.ts:574-576` — "const agentMsg = events.find(e => e.type === 'item.completed' && e.item?.type === 'agent_message'); ... return { events, agentText: agentMsg?.item?.text };"
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts:336-344` — "const { agentText } = await this.runCodex(args, prompt, ...); ... parsed = JSON.parse(agentText); ... throw new Error(`codex agent_message.text was not parseable JSON: ...`)"
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:464-466` — "// A tool-using run narrates before it answers: the answer is the LAST message. const messages = events.filter(...agent_message); const text = messages[messages.length - 1]?.item?.text;"
- **[[c4]]** `code` `src/workflow/review-pipeline/driver.ts:104-110` — "/** Why a call did not complete. Anything not recognised is treated as transient: re-issued once, as today's retries would. */ ... return { cause: 'transient', detail };"
- **[[c5]]** `code` `src/workflow/review-pipeline/driver.ts:65` — "log.warn({ dimension: job.dimension, stage: call.stage, role: call.role, attempt: call.attempt, cause: failure.cause }, 'review pipeline: a call did not complete');"
- **[[c6]]** `code` `src/agent/providers/cli-provider.ts:231-233` — "const { agentText } = await this.runCodex(args, prompt, ...); ... text: agentText ?? '',"
- **[[c7]]** `code` `src/agent/providers/cli-provider.ts:389-390` — "const { agentText } = await this.runCodex(args, prompt, exec); return { text: agentText ?? '', stopReason: 'end_turn' as const };"
