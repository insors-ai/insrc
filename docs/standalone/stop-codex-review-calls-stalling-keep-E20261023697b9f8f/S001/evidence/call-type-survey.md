# Codex call-type survey (2026-10-24)

Every `codex exec` session under `~/.codex/sessions/2026/10/` (Oct 16-24), excluding runs started from `/tmp` (manual replays), grouped by the opening of the task prompt. Outcome: **ok** = a `task_complete` event without error; **error** = `task_complete` with an error; **no-finish** = no `task_complete` (the run was killed: a stall). Durations are first to last session event; "silence" is the longest gap between session events in a healthy call. Script: [call-type-survey.py](call-type-survey.py).

```
call type                                calls    ok error no-finish   rate | ok:   med  p95  p99  max | silence(ok) max | no-finish last event med/max
DEF review: verify one claim               792   754     0        38   4.8% |        11   18   25   62 |              61 | 5/9 s
DEF review: extract claims                  19    19     0         0   0.0% |       130  403  403  403 |             291 | nan/nan s
HLD/LLD review: reviewer session           130   130     0         0   0.0% |       115  194  394  428 |              80 | nan/nan s
code review: adherence evidence gather     701   670    29         2   0.3% |        12   39   86  186 |             159 | 13/13 s
code review: judges (4 dimensions)         101   101     0         0   0.0% |         7   47   56   66 |              50 | nan/nan s
build: validation verdict session          176   174     1         1   0.6% |        36   53   65   85 |              26 | 42/42 s
analyze: exploration decomposer            113     0   113         0   0.0% |       nan  nan  nan  nan |             nan | nan/nan s
workflow: open design question              58    58     0         0   0.0% |        11   21   24   24 |              17 | nan/nan s
brainstorm drafter                          10    10     0         0   0.0% |        17   24   24   24 |              13 | nan/nan s
schema/format probes                        90    71    10         9  10.0% |         6    8   16   16 |              12 | 2/6 s

ERROR analyze: exploration decomposer: 113x {"message": "{\"type\":\"error\",\"error\":{\"message\":\"Invalid schema for response_format 'codex_output_sch
ERROR schema/format probes: 10x {"message": "{\"type\":\"error\",\"error\":{\"message\":\"Invalid schema for response_format 'codex_output_sch
ERROR build: validation verdict session: 1x {"message": "{\"type\":\"error\",\"error\":{\"message\":\"Invalid schema for response_format 'codex_output_sch
ERROR code review: adherence evidence gather: 29x {"message": "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more cred
```

## Reading

- Stalls (no-finish) concentrate in DEF verify calls: 38 of 792 (4.8%). Code-review gather 2 of 701, build validation 1 of 176, and none in 129 HLD/LLD sessions, 101 code-review judges, 19 extract calls, 58 open-question calls or 10 brainstorm calls. Schema/format probes are test traffic.
- Healthy silence differs by call type, from about 15 s to 291 s (extract), so one limit cannot fit every type.
- The analyzer's exploration decomposer fails on every codex run (112 of 112): `Invalid schema for response_format 'codex_output_schema': 'schema.properties.explorations.items.properties.params.properties' is required for object schemas.` This is a separate defect.
- The 29 code-review gather errors are the codex usage limit (Oct 21).

## Silence as the watchdog sees it (stdout)

The watchdog resets on stdout. A live check on 2026-10-24 (codex-cli 0.164.0, gpt-6.1-sol, effort high) shows
that `codex exec --json` prints `thread.started`, `turn.started`, `item.started`/`item.completed` for tool
calls (`command_execution`), `item.completed` for each agent message, and `turn.completed`, but **no
reasoning items**. A plain structured call printed 4 events in 6.2 s; a call that ran two shell commands
printed 9 events in 11.1 s, with a longest stdout gap of 3.7 s.

The session files also log reasoning items, so the gaps above understate stdout silence. Recomputed from
only the session events that codex also prints on stdout (tool calls, tool outputs, assistant messages,
task start and end), over healthy calls ([call-type-stdout-silence.py](call-type-stdout-silence.py)):

```
call type                                healthy calls  p99 stdout silence     max
DEF review: verify one claim                       754                  25      62
DEF review: extract claims                          19                 343     343
HLD/LLD review: reviewer session                   132                 116     172
code review: adherence evidence gather             670                  86     185
code review: judges (4 dimensions)                 105                  56      66
build: validation verdict session                  176                  26      29
```

Chosen silence limits against these maxima: verify 90 s (max 62 s), HLD/LLD session 300 s (172 s),
code review 300 s (gather 185 s, judges 66 s), build validation 90 s (29 s), extract none (343 s).
