<!-- insrc:artifact CR-7d42920dbef28b51-s1 -->

# Code review: 7d42920dbef28b51:S001

✅ **PASS** — HIGH 0 · MED 0 · LOW 7 · model `claude:opus`

**Changed files:** 10

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/migrate-docs-tree.ts:130 | MetaRewrite has an extra field the approved shape doesn't list: `unmatchedLabelLines`. Because of it, a label line that isn't in the md exactly once is caught when the plan is made. Both the CLI and applyMigration then refuse the whole plan up front (migrate-docs-tree.ts:876-880, insrc-migrate-docs.ts:40-44). The LLD intended something different: the md edit should throw inside the apply step, and the existing reset --hard should roll back. The result is equivalent or stricter (nothing is half-applied, and the dry run shows the problem). Still, the public plan shape and the error path differ from what was approved. The apply-time check (applyMetaRewrite, line 862) is still there and covers edits committed after planning. |

## conventions — 0 finding(s)

_No findings._

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/migrate-docs-tree.ts:1 | Graph grounding is hollow: none of the changed production symbols (planMigration, planMetaRewrite, labelEdits, applyMigration, applyMetaRewrite, CLI main, the exported epicShortName/hldShortName/extendTitleLine/extendBannerLine/epicLabelLine) show any testsReaching edges. I didn't take the empty edges as proof of a gap. Instead I checked by running the suite. All 54 tests in migrate-docs-meta-rewrite.test.ts and migrate-docs-tree.test.ts pass, and they call these symbols directly: t1 for the short-name exports, t2/t3 for planMigration, t4 for applyMigration and t5 for the CLI. So no not-exercised gap is reported. The missing edges look like an indexing limit, not missing coverage. |
| LOW | src/bin/insrc-migrate-docs.ts:1 | The promised smoke check 't6: dry run of insrc-migrate-docs over this repo shown to the user before any apply' is a manual step, not an automated test. Nothing in the grounding or the build record shows it was done, so its status is present-but-unverified rather than missing. Every other promised unit and integration test has a matching test, and all of those pass (t1–t5 in migrate-docs-meta-rewrite.test.ts, 54/54 passing across both migration suites). |

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/migrate-docs-tree.ts:663 | Duplicate-render path: realign(m, to, to) checks and edits only the copy at the destination. The source copy at m.mdPath is deliberately left in place, keeps the old epic label, and carries the same artifact marker. The folder already won't converge until someone resolves it by hand, and the warning says so. Still, after the JSON is realigned, the leftover source md disagrees with its meta, and nothing in the plan output points at that file. |
| LOW | src/bin/insrc-migrate-docs.ts:40 | The CLI repeats the unmatched-label-line refusal that applyMigration now enforces itself (migrate-docs-tree.ts ~L876). There are two copies of the same gate with different wording. The CLI copy only adds an earlier exit code, and the two can drift apart if the rule changes. |
| LOW | src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts:43 | Test fixture helpers seedJson/seedMd are near-identical copies of the ones in migrate-docs-tree.test.ts (L28/L31). The only difference is the extra optional `body` parameter. A shared test helper would keep the two fixture formats from drifting. |
| LOW | src/workflow/artifacts/lld.ts:476 | escapePipes is defined privately and identically in lld.ts, hld.ts, plan.ts and define.ts. isCitationArray is also repeated across define/hld/lld/plan. This duplication predates the Story and is harmless, but it could be consolidated into format/bindings.ts. |

