# s1/t7 evidence — one file-selection predicate

`selectFile` (src/indexer/file-selection.ts) is the full index's selection rule. It combines a parser for the extension or basename, not generated or minified, and the artifact parser's skip rules (SKIP_BASENAMES; source over MAX_SIZE characters), then checks the ignore list. fullIndex's selection loop calls it.

## Selection before and after, on real repositories

For each repository, the files the full index lists (`git ls-files --cached --others --exclude-standard`, ignore list applied) are selected by the pre-t7 rule and by `selectFile`:

```
/Users/subhagho/work/projects/insors/insrc: listed 3518; selected before 3384, now 3356; added 0; dropped 28: docs/epics/understand-changes-before-committing-E20261017670419c4/er-model.html, docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S002/sequence-diagram.html, docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/er-model.html, docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/er-model.html, docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/er-model.html, docs/epics/complete-generated-artifact-companion-wiring-across-E20260929e2c6705f/er-model.html, docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/S003/sequence-diagram.html, docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/component-dependency.html, docs/epics/e1-delivery-read-model-daemon-from-E202610072ff0dfda/er-model.html, docs/epics/e2-delivery-board-vs-code-goal-E202610086a131558/sequence-diagram.html, docs/epics/harden-insrc-artifact-creation-flows-two-E202609309b72686c/sequence-diagram.html, docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/measurements/live/repo.run/children/shared-file-t10.json, docs/epics/per-repo-chat-turn-queue-outbox-E20261014613abdb3/S001/sequence-diagram.html, docs/epics/per-repo-chat-turn-queue-outbox-E20261014613abdb3/er-model.html, docs/epics/per-repo-chat-turn-queue-outbox-E20261014613abdb3/sequence-diagram.html, docs/epics/understand-changes-before-committing-E20261017670419c4/S001/sequence-diagram.html, docs/standalone/artifact-docs-folders-fork-per-stage-E20261003e20235c1/S001/er-model.html, docs/standalone/both-cli-providers-reject-top-level-E202610031f7ade1a/S001/sequence-diagram.html, docs/standalone/bug-vs-code-dev-chat-approvals-E202610046a811b8a/S001/sequence-diagram.html, docs/standalone/every-standalone-bugfix-story-reaches-design-E202610036f31771d/S001/er-model.html, docs/standalone/page-dev-chat-transcript-show-latest-E20261012ddc4ede1/S001/sequence-diagram.html, docs/standalone/rework-document-review-pane-fixed-decision-E202610138d4b90c9/S001/sequence-diagram.html, docs/standalone/show-each-changed-section-turn-s-E20261013b2e8109f/S001/sequence-diagram.html, docs/standalone/two-dev-chat-chrome-changes-1-E2026100174bc0120/S001/sequence-diagram.html, docs/standalone/vs-code-plugin-chat-cli-turn-E202610101d04e560/S001/sequence-diagram.html, docs/standalone/vs-code-plugin-chat-panel-concurrent-E20261010d6a4bc79/S001/sequence-diagram.html, package-lock.json, vscode-plugin/package-lock.json
/Users/subhagho/work/projects/FieldML: listed 645; selected before 644, now 644; added 0; dropped 0: 
/Users/subhagho/work/projects/AFM: listed 436; selected before 393, now 390; added 0; dropped 3: attractor-lab/RESEARCH_LOG.md, attractor-lab/data/lexicon/corpus.json, attractor-lab/data/lexicon/corpus_tr.json
/Users/subhagho/work/projects/findme: listed 12; selected before 10, now 9; added 0; dropped 1: package-lock.json
```

No file is added. Every dropped file is a lock file (package-lock.json) or a document over 256 KB characters. The artifact parser returned no entities for either before t7, so the graph content does not change. The only effect is that the run record's `filesSelected` no longer counts them.

## Mutations (each must fail a test in src/indexer/__tests__/file-selection.test.ts)

| Mutation | Failing tests |
| --- | --- |
| no artifact skip rules | 1, 3 |
| no generated/minified check | 1 |
| no ignore check | 1 |
| size compared in bytes, not characters | 1 |
| ignore checked before code-ness (an ignored .png reads excluded-by-ignore) | 1 |
| full index keeps the pre-t7 rule | 3 |

The first M6 run also failed test 1. That did not reproduce: M6 failed only test 3 in three further runs, and the unmutated file passed 10 of 10 runs.

## Full sweep

`npx tsx --test --test-force-exit --test-timeout=180000 'src/**/__tests__/*.test.ts'`: # tests 5858 # pass 5727 # fail 2 # cancelled 1 # skipped 125 

These are the same failures as at t6, and all predate this Story:
- `src/daemon/db/__tests__/sqlite-driver.test.ts` (SqliteDriver via pool, temporalTrend);
- `src/workflow/__tests__/review-decision.test.ts` (a `/private/var` vs `/var` path);
- `src/daemon/__tests__/search-filter.test.ts`, cancelled under sweep load, which passes when run alone.

Left out: the cross-file pass does not call the predicate yet; its classification is a later task.
