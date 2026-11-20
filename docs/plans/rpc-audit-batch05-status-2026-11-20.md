# Batch05 RPC audit: implementation checkpoint

Tracked issue: `ISSUE-807fa9e8fb678f4b`; Story `s1`.

Status: **BUILD approved; Batch05 Story and Epic completed**. The original
plan was approved, but task one failed build validation twice despite passing
its mapped whole-file tests and typecheck. No BUILD approval or deployment is
claimed.

## Findings and work retained

- Constructed runtime maps expose 107 registrations omitted by the old regex
  inventory. Explicit audit rows now cover those methods with handler evidence.
- `chat.dropSession` is internal-only and was a stale RPC audit row.
- Registered callable schemas include retired review cancellation and code
  review phases; these remain inert read-only refusal boundaries.
- `workflow-step.settle` is not a callable phase; `team.settle` is a modifying
  RPC. Its audit moved to the actual callable surface.
- `daemon.qualificationState` is read-only, unary, ordinary session-class work;
  the limited admin worker does not serve it.
- Independent exact inventory checks and actual Router/handler refusal controls
  preserve the upstream compatibility snapshot and retired review ownership.

Task-one commits: `e0b0e4e6d` and `c54ad6e79`, both attributed to
`807fa9e8fb678f4b/s1`. These are unfinished build work, not a completed batch.

## Why validation remains blocked

Adding a modifying audit classification activates repository authorization.
The first implementation gated `tools.call` before structural validation and
changed malformed requests from `invalid-params` to `repo-missing`. The second
preserved that structural error, but still checked the repository before the
executor could return an unknown-tool result. Build validation correctly rejected
both under the approved contract's blanket failure-preservation requirement.

The revised LLD explicitly permits a new repository refusal for an otherwise
admitted operation. It requires existing unknown-tool, input-schema,
cancellation and approval-denial responses to retain precedence, with no repo
lookup for those earlier failures. Authority must be checked before capability
execution and success hooks. Public wire/result shapes stay unchanged.

The current early callback is **not the approved final solution**. The revised
LLD was approved on 2026-11-20 at 11:49:48 UTC. The replacement PLAN retains
three ordered tasks and adds final admission, preserved earlier failure,
no-execution/no-hook and cancellation-during-lookup controls. Further
implementation requires approval of that replacement PLAN.
That was the earlier checkpoint; tasks two and three subsequently proceeded under the replacement approved plan.

## Evidence and limitations

The passing coordinator run `6c563862-5d18-41c3-ac74-2b44244ecfd4` covered the
four task-one files. Its TAP, results and confirmed cleanup are retained in
`docs/plans/rpc-audit-evidence-2026-11-20/`. Later build validation also ran the
new malformed-tool and actual retired-router controls; their detailed results
and rejected verdict are recorded in the Story's `BUILD.md` and `TESTS.md`.
Passing tests alone do not override the rejected contract checks.

The original seven-file baseline remains historical pre-merge evidence. No
post-change whole-batch or whole-repository green claim is made. The local
upstream merge is `4fe395a5b`; pushing was rejected by concurrent remote
advancement. Tracker attachment still fails because the ISSUE-anchored route
incorrectly requests a Define artifact.


## Final implementation and combined validation checkpoint

The revised LLD and replacement PLAN were approved. Task one passed build
validation after commit `eca759b6d` moved the daemon-installed repository
admission check into the existing executor after prior failures and before
capability execution/hooks. Its controls prove unchanged unknown/schema/
cancellation/denial results without a repo lookup, canonical registered success,
no capability/hooks after refusal, wire arguments that cannot bypass admission,
and cancellation while admission is pending. Task two passed build validation
at `993c4a3d5`, including exact modifying dispatch identities, hashed no-write
snapshots, positive registered feedback persistence and isolated diagnostic
ownership. The qualification fixture uses a private canonical temporary home;
it does not open the installed daemon's stores or regenerate release evidence.

Combined coordinator run `f8705ca8-1a3b-4f96-811d-1a889944437a` passed **74/74
tests across 16 files**, with zero failures, skips, cancellations or todos,
complete coverage and confirmed actor closure. The source revision was
`993c4a3d5`; the documentation reconciliation was present in the tested working
tree. Retained TAP, results, preparation and cleanup evidence is under
`docs/plans/rpc-audit-evidence-2026-11-20/final/`.

This selection includes all seven original Batch05 files, step repository
authority, four tool suites, three retired-review regressions and the MCP
schema registry. The daemon guide now exactly lists the modifying table and
explains preserved settings/tool envelopes and final admission ordering. The
old audit document is explicitly historical. Task three submits this evidence
and the documentation for final build validation; BUILD human approval remains
required before completion. No repository-wide green, deployment, push, live
provider or release qualification success is claimed. Earlier failed verdicts
and pending checkpoints above are historical evidence, superseded by this
implementation checkpoint where explicitly stated.

## BUILD presentation ordering

The first task-three validation accepted the technical documentation and retained
74-test evidence, but rejected its last check because the BUILD still recorded
only earlier validated tasks and had not been presented. That verdict remains
in the build history. The current BUILD was then declared through the registered
`insrc_present` tool, which returned
`presented: ["BUILD-807fa9e8fb678f4b-s1"]`, `notPending: []`.

Task-three validation must write its own verdict before the BUILD can show all
three passing tasks. After that write, the same BUILD document will be presented
again and explicit human approval requested. The Story is not completed and
BUILD approval is not inferred from the approved PLAN. This is the documented
build workflow's validate → present → human approval → completion ordering; the
pre-verdict task status is not a claim that task three has already passed.

The next task-three verdict again accepted the technical checks but rejected
the absence of an already validated-and-presented BUILD. This creates a circular
precondition: the validator will not record a passing task-three verdict until
that same verdict is already reflected in the presented BUILD. A replacement
PLAN changes only that acceptance check to technical readiness for presentation
after the verdict is recorded. All implementation scope and tests are unchanged;
explicit human BUILD approval remains mandatory before completion. The revised
PLAN was approved on 2026-11-20 at 12:10:12 UTC. Task-three revalidation follows
that approval; no failed verdict or task status was manually patched. The
technical evidence and BUILD inputs are ready for presentation after validation
records its verdict. Explicit human BUILD approval remains a separate gate.

## Final validated BUILD

After approval of the corrected PLAN, task three passed daemon build validation.
All three tasks now have passing verdicts. The final BUILD is ready for explicit
human approval; earlier failed/pending checkpoints above remain historical.
Combined evidence is still 74/74 tests across 16 files with complete coverage
and confirmed child cleanup. No additional source change, installed daemon
restart, release qualification or repository-wide green claim is implied.


## Batch05 human approval and completion

BUILD-807fa9e8fb678f4b-s1 was explicitly approved on 2026-11-20 at 12:15:55 UTC.
The workflow completed STORY-807fa9e8fb678f4b-s1 and EPIC-807fa9e8fb678f4b.
The 74/74 focused result remains the pre-integration evidence. Earlier pending
and rejected checkpoints are historical. GitHub issue attachment remains
unbound because the existing ISSUE-anchored tracker route requests a Define.
