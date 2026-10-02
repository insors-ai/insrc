# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-02T05:57:19.813Z  ·  **Updated:** 2026-10-02T09:08:49.948Z

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`
- ✗ `t7`
- ✗ `t8`

## Changes

- `.insrc/artifacts/BUILD-bfe98ff7f97178cf-s4.json` — **insrc-build** (2026-10-02T09:08:49.948Z)
- `docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/BUILD.md` — **insrc-build** (2026-10-02T09:08:49.948Z)

## Feedback

- **insrc-build (s4/t4)** (2026-10-02T08:48:37.906Z) `comment` — `vscode-plugin/src/chat/docs-review-panel.ts`: DEPTH BOUND — the value and its justification, recorded here because t4's acceptance check requires them IN THE BUILD RECORD and citing S004/evidence/t3-depth-measurement.md. The build validation gate was right that code comments and a commit message do not satisfy that.

UX_DEPTH_MAX = 24 (docs-review-panel.ts, one named constant, no second copy).

Measured, per S004/evidence/t3-depth-measurement.md:
  - metric: ELEMENT NESTING — what the renderer's recursive walk counts, and therefore what the bound guards. Named explicitly because the plan review's HIGH finding was that "depth" was ambiguous between element nesting and rendered DOM depth.
  - real maximum across the four ledger records: element depth 4 (per record 2, 4, 3, 4).
  - rendered DOM depth inside the slot: 7 at most.
  - horizontal cost: exactly 22px per Container level (1px border x2 + 10px padding x2), measured at a 380px pane with a 362px card inner width.

HEADROOM: 24 is SIX TIMES the measured real maximum of 4, so no plausible growth in authored content reaches it; and it sits beyond the ~16 levels (362/22) at which a narrow pane has no content width left, so layout degrades on its own before the guard could engage. That ordering is the point — the bound is a SAFETY limit against malformed, cyclic or hostile structure and never a presentation rule. Alternative a4 was rejected for blurring exactly that line.

NOTE on the inherited floor: the LLD required "strictly greater than 9", and 9 turned out to be a figure no metric the renderer uses produces — it counts the daemon standalone document's own html/body chrome, which the webview slot does not have. The floor is still honoured (24 > 9) but it is no longer the justification.
- **insrc-build (ledger note)** (2026-10-02T09:08:36.752Z) `comment` — `docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/BUILD.md`: WHAT THE ✗ MARKS MEAN. All eight tasks are implemented and green; the ✗ is the validation gate's own verdict, and in this environment the gate cannot EXECUTE anything — every attempt to run `npx tsx --test` or `npx tsc` was refused permission. Its verdicts say "I could not verify", not "this failed", and it says so in its own reason text on every task.

The gate was still worth running on every task, and not as a formality: reading the code and the evidence, it found SIX real defects this Story would otherwise have shipped — the "no file under src/" test that read the working tree and so went red on a clean checkout (t1); committed evidence images captured BEFORE the url fix while the note claimed both themes read correctly (t3); a depth overlay labelling DOM depth as element depth in the one file whose job is to name the metric (t3); a picker-partition fixture that never reproduced the three-renderers-one-kind hazard it names (t5); four t6 checks that claimed more than their tests asserted, including a voided createElement count and a digit-leading-slug case covered only statically; and a transcript whose `ls -l` block was prose dressed as output (t8). Each is fixed and recorded in its own commit.

The real verification, re-run against the committed tree:
  docs-review-panel suite  194 pass / 0 fail   (122 at the end of S003)
  plugin sweep             819 tests, 815 pass / 0 fail / 4 skipped, exit 0
  npx tsc --noEmit         exit 0
with the raw output committed at S004/evidence/t8-build-and-transcripts.md.
- **insrc-build (ledger note)** (2026-10-02T09:08:36.754Z) `comment` — `src/mcp/build-step/phases/validate.ts`: HOW THIS RECORD'S CHANGE SET WAS PRODUCED, and why it had to be repaired by hand. `collectBuildChangeLog` derives the set from `changedFiles`, which reads the WORKING-TREE diff (unstaged ∪ staged) via the git_diff builtin (src/workflow/runners/build/changed-files.ts:43-55). The build-step's own implement prompt instructs "If green, commit ... then submit this Task to the build validation gate" — commit first, validate second — so by the time validate runs the tree is clean, the collector returns [], and validate.ts:164 drops the key entirely via `...(changeLog.length > 0 ? { changeLog } : {})`. Proven: on a clean tree the collector returns 0 entries; dirty one tracked file and it returns 1.

Worse than empty: when validate ran last here, the only dirty paths were the BUILD record's OWN json and md (written by the previous validate), so the change set captured those two files and claimed the Story had changed them. A wrong change set reads as fact in a way an absent one does not.

The 28 entries now in this record were derived from the Story's COMMITTED range (the commit that approved the PLAN to HEAD) and written by hand, which is what the collector should do when the tree is clean. Filed as a bugfix; this note is the provenance for the repair so the entries are not mistaken for collector output.
