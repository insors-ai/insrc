# Codex review-call stall evidence (2026-10-23)

All runs used codex-cli 0.164.0, `gpt-6.1-sol` at `-c model_reasoning_effort=high` (one row uses
`medium`), and `codex exec --json --sandbox read-only` with the prompt read from stdin. The runs
were serial. A run that produced no answer within the limit (60 s; 90 s for the first set) was
killed and counted as stalled. Stalled runs printed only `thread.started` and `turn.started`.

The prompt is the verify prompt for claim `c12` of DEF-ce99b72065d03b1b, copied from a codex
session file in which it had stalled ([stalled-c12-prompt.txt](stalled-c12-prompt.txt)). The full
schema is the daemon's `codexStrictSchema(envelopeSchema(callId, VERIFY_SCHEMA))`
([c12-schema-full.json](c12-schema-full.json)).

| Variant | Runs | Stalled |
|---|---|---|
| Full schema, effort high (first set, 90 s limit) | 6 | 1 |
| Full schema with `callId` not `const` | 8 | 1 |
| Full schema without `minLength` | 10 | 1 |
| Full schema, effort medium | 10 | 1 |
| **Full schema, total** | **34** | **4** |
| No `--output-schema` | 18 | 0 |
| Trivial schema `{answer: string}` | 14 | 0 |
| Full schema without `proposedFix` ([file](c12-schema-no-proposedFix.json)) | 14 | 0 |
| `proposedFix`, `artifactEdits` and `options` nullable ([file](c12-schema-nullable.json)), stopped early | 6 | 0 |

The per-run timings were printed to the terminal and were not kept; the files under `/tmp` were
later cleared. The schema files here are regenerated from the same code.

## Session-file survey

The codex session files under `~/.codex/sessions/2026/10/` were scanned for review verify calls,
that is, prompts containing `You are a grounded reviewer` or a `callId` envelope. A call counts as
stalled when its session has no assistant message.

| Day | Model | Effort | Calls | Stalled |
|---|---|---|---|---|
| Oct 20 | gpt-6-astra | medium | 165 | 7 |
| Oct 21 | gpt-6-astra | medium | 1021 | 44 |
| Oct 23 | gpt-6.1-sol | high | 290 | 10 |

In every stalled session, the last event is the completed reasoning item, 4-6 s after the turn
started. Completed calls on Oct 23 took a median of 13 s, with a 95th percentile of 39 s.

## Daemon runs of the DEF review (from the daemon log)

| Run (UTC) | Duration | Codex calls | Stalls (180 s kill) | Unjudged claims |
|---|---|---|---|---|
| 10:34-11:19 (round 3) | 45 min | ~77 | 7 | 1 |
| 12:47-13:24 (after a network change) | 36 min | 67 | 5 | 1 |

## Replay without the short kill (19:11 IST, after the network change)

The same prompt and full schema were run again, gpt-6.1-sol at effort high, each run allowed up
to 600 s and stopped after the first run that took over 60 s. All 16 runs completed: exit 0,
8-35 s each, 169-230 output tokens and about 800 bytes of output per run
([replay-no-kill-log.txt](replay-no-kill-log.txt)). None stalled and none produced a long answer.

Across every full-schema replay, 4 of 50 runs stalled, against 0 of 52 for the other variants.
That difference is too small to show that the schema causes the stalls. The daemon's DEF review
after the network change still had 5 stalls in 67 calls, so the network change did not remove
them either. What the evidence does show is an intermittent stall (about 4% of review calls over
several days, on two models) in which the call goes silent after its reasoning step and does not
recover within 180 s.
