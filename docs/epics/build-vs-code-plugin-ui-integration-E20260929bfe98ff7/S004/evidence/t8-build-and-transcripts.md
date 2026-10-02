# S004/t8 — build, size delta and test transcripts

Every number below is RAW OUTPUT of the command shown above it, re-run against the
exact working tree this commit contains, and committed together with the message
that quotes it.

A transcript committed alongside test changes CANNOT name its own commit sha — the
sha does not exist until the commit is made. So this file deliberately does not
name one: the counts describe THE TREE COMMITTED HERE, and the way to check that
is to run the two commands at this commit and compare. An earlier version named a
parent sha, which read as a claim about a tree that was not the one it shipped in;
the build validation gate caught that.

Two earlier failures of this file's own standard, both also caught by the gate and
both corrected here: its `ls -l` block was hand-formatted prose sitting under a
command prompt that implied raw output, and its counts were captured before three
later fix commits changed the test file. The blocks below are verbatim.

## VSIX size delta

```
$ ls -l insrc-vscode-0.5.9.vsix insrc-vscode-0.5.10.vsix
-rw-r--r--@ 1 subhagho  staff  250580 Oct  2 12:29 insrc-vscode-0.5.10.vsix
-rw-r--r--@ 1 subhagho  staff  247667 Oct  2 01:41 insrc-vscode-0.5.9.vsix

S003 baseline 0.5.9 : 247667 bytes
S004          0.5.10: 250580 bytes
delta               : +2913 bytes (+1.18%)
```

Under 3 KB for the whole experience mock. Alternative a2 — vendor the Adaptive
Cards renderer SDK — was rejected against sc2 and ac5 rather than on size, but the
size is what makes the rejection visible, as S003's +5,954 bytes did against a3.

## Test transcripts

```
$ npx tsc --noEmit ; echo "exit $?"
exit 0

$ npx tsx --test --test-force-exit src/chat/__tests__/docs-review-panel.test.ts
ℹ tests 194
ℹ suites 0
ℹ pass 194
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
exit 0

$ npx tsx --test --test-force-exit 'src/**/__tests__/*.test.ts'
ℹ tests 819
ℹ suites 0
ℹ pass 815
ℹ fail 0
ℹ cancelled 0
ℹ skipped 4
ℹ todo 0
ℹ duration_ms 12281.92475
exit 0
```

The docs-review suite was 122 at the end of S003.

## NO daemon rebuild is required

S004 changes no file under `src/`, and the reason is structural rather than
disciplined: `uxDefinition` was already one of sc1's ORIGINAL four projected
fields (`src/workflow/artifact-content.ts:76`, projected verbatim by
`structuredRecords` at `:216-227`), so the record already reached the extension
host and was simply dropped before being posted. Closing that one hop needed
nothing from the daemon.

This is what distinguishes S004 from S003, which needed amendment
AMD-bfe98ff7f97178cf-1 to add `sequenceDefinition` to sc1 and therefore a daemon
rebuild. Conflating the two is how a correct change came to look broken earlier
in this Epic, when a daemon update fast-forwarded to the wrong commit.

## The Story's committed change set

Range: the commit that approved the PLAN (`87f3f2f3d527`) to `fa4c35347f4a`.
A change-set listing can never include its own commit, so the one addition not
shown below is this file itself.

```
$ git diff --name-only 87f3f2f3d527..HEAD
.insrc/artifacts/BUILD-bfe98ff7f97178cf-s4.json
.insrc/artifacts/CR-bfe98ff7f97178cf-s4.json
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/BUILD.md
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/CR.md
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t3-depth-measured-light.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t3-depth-measured.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t3-depth-measurement.md
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t3-isolated-dark.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t3-isolated-light.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t7-control-absent-at-400px.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t7-state-absent.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t7-state-deep-narrow.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t7-state-dual-slot-dark.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t7-state-dual-slot-light.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t7-state-real-fidelity-lld.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t7-state-real-hld.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t7-state-real-record-light.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t7-state-real-s002-lld.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t7-state-real-uxfix-lld.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t7-state-unshowable-dark.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t7-state-unshowable-light.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t7-visual-verification.md
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t8-build-and-transcripts.md
vscode-plugin/package.json
vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts
vscode-plugin/src/chat/__tests__/fixtures/ux-parity.ts
vscode-plugin/src/chat/docs-review-panel.ts
vscode-plugin/src/chat/protocol.ts
```

Nothing under `src/`. A committed test asserts this over the same range, with a
positive control so it cannot pass against an empty change set.
