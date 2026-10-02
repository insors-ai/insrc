# S004/t8 — build, size delta and test transcripts

Every number below is READ OUT of the run that produced it. None is typed from
memory, and the commands are the ones that generated these transcripts.

## VSIX size delta — COMPUTED from the two artefacts

```
$ ls -l insrc-vscode-0.5.9.vsix   # the S003 baseline, still on disk
S003 baseline (0.5.9): 247667 bytes
S004          (0.5.10): 250580 bytes
delta:                 +2,913 bytes  (+1.18%)
```

A few KB, not megabytes. That is the DOM-construction route paying off, the
same way S003 avoided alternative a3's bundle: alternative a2 was to vendor the
Adaptive Cards renderer SDK into the VSIX, and it was rejected against sc2 and
ac5 rather than on size alone — but the size is what makes the rejection
visible. The whole experience mock costs under 3 KB of packaged extension.

## Test transcripts

```
$ npx tsc --noEmit
exit 0

$ npx tsx --test --test-force-exit src/chat/__tests__/docs-review-panel.test.ts
ℹ tests 193
ℹ suites 0
ℹ pass 193
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
exit 0

$ npx tsx --test --test-force-exit 'src/**/__tests__/*.test.ts'   # the full plugin sweep
ℹ tests 818
ℹ suites 0
ℹ pass 814
ℹ fail 0
ℹ cancelled 0
ℹ skipped 4
ℹ todo 0
exit 0
```

The docs-review suite grew from 122 at the end of S003 to 193 here.

## NO daemon rebuild is required

S004 changes no file under `src/`. The reason is structural rather than
disciplined: `uxDefinition` was already one of sc1's ORIGINAL four projected
fields (`src/workflow/artifact-content.ts:76`, projected verbatim by
`structuredRecords` at `:216-227`), so the record already reached the extension
host and was simply dropped before being posted. Closing that one hop needed
nothing from the daemon.

This is what distinguishes S004 from S003, which required amendment
AMD-bfe98ff7f97178cf-1 to add `sequenceDefinition` to sc1 and therefore a
daemon rebuild. Conflating the two is how a correct change came to look broken
earlier in this Epic, when a daemon update fast-forwarded to the wrong commit.

The Story's whole committed change set, from the commit that approved the PLAN
to HEAD:

```
$ git diff --name-only 87f3f2f3d527..HEAD
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t3-depth-measured.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t3-depth-measurement.md
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t3-isolated-dark.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t3-isolated-light.png
docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S004/evidence/t3-url-defect-fixed.png
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
vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts
vscode-plugin/src/chat/__tests__/fixtures/ux-parity.ts
vscode-plugin/src/chat/docs-review-panel.ts
vscode-plugin/src/chat/protocol.ts
```

Nothing under `src/`. A committed test asserts this over the same range, with a
positive control so it cannot pass against an empty change set.
