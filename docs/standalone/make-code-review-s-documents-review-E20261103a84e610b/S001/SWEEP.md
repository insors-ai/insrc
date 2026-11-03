# Sweep record: make the code review's documents and review units follow the Story's process flow (Story a84e610b0a910d49/s1)

Run on 2026-11-03 for t6, in the foreground, by area. Each failing area was also run on a clean checkout of the commit just before the Story's first build commit (`4e2ad9162`, a detached worktree outside the repository, removed afterwards), and the failing titles were compared.

Method: `npx tsx --test --test-force-exit <files>`; titles are the lines that start with the cross sign in the node:test output.

## task-review suite (this Story's area)

`npx tsx --test --test-force-exit 'src/workflow/code-review/task-review/__tests__/*.test.ts'`

Result on this tree: 115 tests, 115 pass, 0 fail. This includes the existing 101 tests unchanged and the 14 added by t1 to t6.

## daemon code review files

`src/daemon/__tests__/code-review-freshness-request.test.ts`, `code-review-rpc-fallback.test.ts`, `code-review-rpc.test.ts`

Result on this tree: all three files fail as files. The same three files fail on the base checkout, so none is caused by this Story. `handler-runtime.test.ts` and `task-review-plan-path.test.ts` pass.

## workflow gate suites

`src/workflow/__tests__/approve-codereview-gate.test.ts`, `approve-build-completion.test.ts`, `approve-build-record-completion.test.ts`, `gate-approve.test.ts`, `gates-lifecycle-guard.test.ts`, `gates-lifecycle-service.test.ts`, `gate-guarded-entry-points.test.ts`

Result on this tree: 32 tests, 15 pass, 17 fail. The sorted list of failing titles and counts is byte-identical to the base checkout. The failing titles on both trees:

- ✖ ac1: enforce on + CR block + no override → skipped, not approved, codeReview[] blocked
- ✖ ac1: epic-batch sweep includes a pending BUILD; excludes an already-approved BUILD
- ✖ ac2: enforce on + CR block + overrideReview → approved, codeReview[] overridden + overrideReason
- ✖ ac2: single BUILD + enforce ON + CR pass => completes, codeReview[] pass
- ✖ ac3: CR pass → approved, codeReview[] pass + counts
- ✖ ac3: CR warn → approved, codeReview[] warn + counts
- ✖ ac5: BUILD + enforce ON + CR block => withheld into skipped[], codeReview[] blocked
- ✖ ac5: enforce OFF + CR block → approved (demoted advisory), codeReview[] warn/advisory
- ✖ ac6: BUILD + enforce OFF + a BLOCKING CR => completes: enforcement off still demotes a blocking verdict to advisory
- ✖ ac6: clean meta.review + CR block → withheld ONLY by the code-review gate
- ✖ ac6: corrupt CR record (non-BUILD) → no-review fail-open, approved
- ✖ approveArtifactByJsonPath and reviewArtifactFile refuse a conflicted head before any stamp and an unhashed head is unchanged
- ✖ approveWorkflowTarget refuses a conflicted BUILD target in both branches before ensureBuildRecordOnCompletion rewrites it
- ✖ batch: story A CR block + story B CR pass (enforce on) → A skipped, B approved
- ✖ single BUILD target with no prior json creates the record, but completes only after its code review
- ✖ the inventory of guarded entry points (daemon step phases, approveArtifactByJsonPath, approveWorkflowTarget, resolveReviewFinding apply) is complete, and the analyze and code-review steps are not on it
- ✖ with a service, an explicit override over an advisory-blocked code review completes the Story through a real approval and the reason is on the complete entry

## MCP suite

`npx tsx --test --test-force-exit 'src/mcp/__tests__/*.test.ts'`

Result on this tree: 117 tests, 95 pass, 22 fail. Every failing title also fails on the base checkout. The base fails one more test, `handleWorkflowRun: START returns runId + next:poll + guidance`, which passes on this tree. The failing titles on this tree:

- ✖ ac3: with no daemon every moved tool returns DaemonUnreachableError through a real MCP process, which opens no store; against a daemon without step.call, DaemonTooOldError
- ✖ MCP forwarder: a forwarded insrc_code_review_step with a progressToken emits notifications/progress for each progress frame
- ✖ MCP review streams preserve split UTF-8 in done frames
- ✖ MCP tool surface: the thirteen tools keep their names, descriptions and input schemas
- ✖ repo-schema-guard.test.ts: the MCP artifact tools refuse an unconverted repository
- ✖ T11 codeReviewStream: an invalid line is a protocol error; an abort rejects
- ✖ T11 codeReviewStream: any other plain error line is a final daemon error; a plain result is a protocol error
- ✖ T11 codeReviewStream: a plain unknown-method line with the socket kept open fails AT ONCE, not at the timer
- ✖ T11 codeReviewStream: rejects on an error frame and carries the daemon's reason
- ✖ T11 codeReviewStream: rejects when the connection closes before a final frame
- ✖ T11 codeReviewStream: rejects when the daemon is not running
- ✖ T11 codeReviewStream: sends one stream request, forwards progress, resolves on done
- ✖ T11 codeReviewStream: with a daemon that never answers, it fails at its wait limit and drops the connection
- ✖ T11 reviewArtifactStream: an invalid line is a protocol error; an abort rejects
- ✖ T11 reviewArtifactStream: any other plain error line is a final daemon error; a plain result is a protocol error
- ✖ T11 reviewArtifactStream: a plain unknown-method line with the socket kept open fails AT ONCE, not at the timer
- ✖ T11 reviewArtifactStream: rejects on an error frame and carries the daemon's reason
- ✖ T11 reviewArtifactStream: rejects when the connection closes before a final frame
- ✖ T11 reviewArtifactStream: rejects when the daemon is not running
- ✖ T11 reviewArtifactStream: sends one stream request, forwards progress, resolves on done
- ✖ T11 reviewArtifactStream: with a daemon that never answers, it fails at its wait limit and drops the connection
- ✖ the steering block, the steering template and the guide tell the controller to call insrc_present before it asks for approval

## Not caused by this Story

- Several failures belong to the code-review and design-review rewrite that is in progress (stubbed `insrc_review_step`, "PENDING REVIEW RE-IMPLEMENTATION").
- At the time of the run `npx tsc --noEmit` also reported type errors in untracked files of another session under `src/workflow/review/design-review/`; they are not part of this Story and the build gate's own typecheck was clean when it ran.
