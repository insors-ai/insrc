# Batch 01 build evidence

## t1 — baseline

Approved issue: ISSUE-3275fb2e9a542cd6. Approved LLD and PLAN: s1.

Merged origin/v2 separately with `git merge --no-ff`, producing
`97ec6496f0594b8e512186e3829be1b7d99944a1`. The four upstream commits change
build test mapping and an unrelated workflow plan; they do not change the
approved harness ownership design. Local audit, issue and companion files were
preserved. No conflicting source edits were present.

Immediately before the merge, process inspection found no existing tsx/Node
test, tsc or npm test/build process (only the inspection command itself).
The source-tree probe filename search found no `__sc4probe_` file. No process
was stopped and no unknown file was removed; the installed daemon was untouched.

The validation gate requested captured evidence instead of the narrative alone.
The repeated inspection is captured with timestamp, exact commands, filters and
results in [baseline capture](test-harness-baseline-2026-11-20.json). It found
zero matching test/compiler processes, zero source-adjacent probes and no active
harness lease. It does not reconstruct past process state; it establishes a new
quiescent checkpoint before any shared-output implementation. The only t1
actions were the merge and adding these evidence files.

No full sweep was started: the approved PLAN requires ownership controls before
focused validation and forbids overlapping broad sweeps. This task's smoke
evidence is the baseline/overlap/quiescence inspection above.

## Historical progress before plan revision

This checkpoint is historical; the final implementation evidence below supersedes its pending statuses.

- t1 passed daemon validation after the timestamped capture was added.
- t2 passed daemon validation with four focused ownership/runtime tests and a
  clean typecheck. Strict malformed-record checks and diagnostic-value controls
  remain enforced.
- t3 passed daemon validation with seven coordinator tests and a clean
  typecheck. Controls cover contention, fingerprints, real signals/deadlines,
  failed-run evidence, writer reservation through drain and host prerequisites.
- t4 is implemented partially and remains **not validated**. Its two integration
  controls passed, including an actual full build and the actual retirement
  stale-output rebuild. Validation correctly rejected its broader acceptance:
  root npm commands are not routed yet, and repeating a prepared check is not
  sufficient positive evidence for the five actual consumer files.

The revised PLAN retains task IDs and moves t7 (command routing) immediately
after t3, before t4/t5/t6. This removes an acceptance-level ordering cycle in
the original plan. It also requires actual consumer invocation evidence while
preserving native assertions and separately reporting remaining platform
failures. The revision is presented and pending human approval; implementation
is paused at that artifact gate. No background tests or compiler processes
remained at the final inspection.

The build gate's default npx command selected Node 26. The documented per-repo
build command settings now explicitly use the installed Node 22 executable
for both typecheck and test, with TAP case reporting. The previous configuration
was backed up at `~/.insrc/tmp/harness-build-config-before.json`; no global
build-command default or production daemon was changed. Runtime refusal was
preserved, and internal NODE_TEST_CONTEXT is cleared for new child runners so
a nested runner cannot silently skip its files.


## Final Batch 01 implementation evidence

The revised plan was explicitly approved. Tasks t1, t2, t3, t7, t4, t5 and t6
passed daemon validation in that order. Implementation through `90b744fd1` passed those gates. Final t8 integration
checks additionally fixed abandoned-writer recovery (`3fd825b00`) and serial
admission for explicit live opt-ins (`02c2fbe8b`); their focused controls passed. The
latest authoritative task verdicts are in the Story's TESTS.md and BUILD.md.
The BUILD still requires human approval after validation.

See [supported commands and recovery](../testing.md), the
[final machine-readable capture](test-harness-final-validation-2026-11-20.json),
and [isolated native consumer results](test-harness-consumer-results-2026-11-20.json).
The controller TAP and each backend/native consumer TAP are checked into
`docs/plans/test-harness-evidence-2026-11-20/` with captured counts and hashes.

| Run | Tests | Passed | Failed | Cancelled | Skipped | Meaning |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Sequential controller suites | 19 | 19 | 0 | 0 | 0 | Ownership/runtime, real rebuild, signals, failure evidence and compiler controls |
| Follow-up coordinator controls, including serial live admission | 8 | 8 | 0 | 0 | 0 | New serial-admission control uses disposable children; no live service is called |
| Eight affected backend files, coordinator concurrency 1 | 30 | 28 | 0 | 0 | 2 | Two existing Linux-only cases skip on macOS; all mapped checks pass |
| Complete native consumer diagnostic files | 23 | 8 | 11 | 1 | 3 | Original product failures remain non-green; three existing platform skips |

These rows are separate runs, not a deduplicated whole-repository total.
No full backend/VS Code/JetBrains sweep was claimed. Controller checks include nested real test runs, and the follow-up repeats
seven controller checks plus one new serial-admission check. These counts are
not added to native/backend counts or presented as distinct tests.

### Local acceptance mapping

The ac1–ac6 labels are local issue-derived checks, not upstream Story IDs.

| Check | Concrete evidence |
| --- | --- |
| ac1 shared output ownership | Alias contention; competing npm/build/test/qualification commands refuse before mutation; timed-out writer retains reservation; complete real consumers preserve output fingerprints |
| ac2 one Node runtime | Unsupported runtime refuses before mutation; nested executable/version checks pass; final runtime is Node 22.23.2; per-repo gate commands explicitly bind Node 22 |
| ac3 resources and probes | Real peer round-trip closes both ports; failed startup frees its child/socket; handles remain retained on refusal; owned-group and escaped-descendant controls; ignored compiler probes are removed after confirmed closure |
| ac4 assertions/security | Real positive and intended-negative panel type checks; native permission refusals and saved-mode controls unchanged; full native/lifecycle failures retained in captured TAP |
| ac5 minimal boundary reuse | Existing process-disposal and captured-native-handle APIs consumed unchanged; no new dependency, direct cloud call or production lifecycle/storage/IPC change |
| ac6 bounded truthful outcomes | Real SIGINT/SIGTERM separate from abandoned-record tests; deadlines and unavailable reports remain incomplete/nonzero; actual close journals and cleanup confirmations retained; source/output drift refused |

### Remaining failures and closure

The complete consumer files ran serially against verified helpers. The control,
bounded-shutdown and lifecycle-evidence failures include observed native
capability/permission denial. The watchdog file remains an unresolved lifecycle
assertion/cancellation after verified prerequisites. This distinguishes those
observations from missing helpers, before-hook setup failures and output races;
it does not prove that every remaining assertion is a platform-only defect.
Batch 17 owns diagnosis; no assertions were weakened to make those cases green.

Both the backend run and native diagnostic run recorded confirmed closure.
The timestamped final capture found no matching test/compiler/disposable fixture
process, no active checkout lease and no source-adjacent probe. It performed no
process signaling or unknown-file deletion. Uncatchable death remains explicitly
limited: a blocked record needs deliberate recovery after all old actors ended;
no age/PID-only takeover or guarantee about arbitrary detached descendants is
claimed. Explicit recovery now atomically archives the validated record and any
empty writer reservation; foreign/unexpected entries fail before metadata is
changed. Live-enabled files use serial admission without a Promise.all path to
providers; ordinary offline concurrency remains configurable.

No qualification runner was executed and no ready gate/proof digest was
refreshed. Batches 15/16 remain pending authentic qualification. Other failure
batches retain their separate scope and human approval gates.

### Design artifact self-check

The generated sequence source has six participants and ten messages. Its
referential validation returned no findings. The source ordering matches
admission → build/serial mutation → readers/probes → confirmed drain → release.
The guide also documents the specialized launcher's later writer phase, admitted
only after reader acknowledgments close. Relationships and ownership cardinality
are documented in the approved LLD and the guide's ownership table; no public
storage entity or UX layout changes require an additional ERD or mock.

The browser access host was unavailable when rendering was attempted. The HTML
and structured source were inspected; **browser rendering was not verified**.
Automated design/code-review endpoints were not invoked. This is builder
self-check evidence plus build validation, followed by the human BUILD gate.
