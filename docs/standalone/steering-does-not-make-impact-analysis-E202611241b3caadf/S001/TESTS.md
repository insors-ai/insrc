<!-- insrc:artifact TESTS-1b3caadf04023d33-s1 -->

# Tests: 1b3caadf04023d33 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-24T09:39:19.957Z on commit `390991aa6`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: epic-impact-artifacts.test.ts: an LLD and a PLAN with an epicImpact render an 'Epic impact analysis' section, one without it renders exactly as before, and a synthesize with a non-null digest and no analysis (or an empty one) is rejected with the reason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | epic-impact-artifacts.test.ts: an LLD and a PLAN with an epicImpact render an 'Epic impact analysis' section, one without it renders exactly as before, and a synthesize with a non-null digest and no analysis (or an empty one) is rejected with the reason | `src/workflow/__tests__/epic-impact-artifacts.test.ts` |
| pass | epic-impact-artifacts.test.ts: the first-step schemas of design.story and plan accept an epicImpact and still accept a context without one | `src/workflow/__tests__/epic-impact-artifacts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/epic-impact-artifacts.test.ts` | 0 | 2 | 0.9 s |  |

## t2

Run at 2026-11-24T09:48:42.508Z on commit `6efe9f02e`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: epic-built-state-digest.test.ts: buildEpicBuiltStateDigest returns null for a standalone Story, for an Epic's first Story and for an Epic with no other Story that has an approved BUILD, and otherwise lists the other Stories in the Define's order without the Story at hand**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | epic-built-state-digest.test.ts: buildEpicBuiltStateDigest returns null for a standalone Story, for an Epic's first Story and for an Epic with no other Story that has an approved BUILD, and otherwise lists the other Stories in the Define's order without the Story at hand | `src/workflow/__tests__/epic-built-state-digest.test.ts` |

**unit: epic-built-state-digest.test.ts: a Story whose BUILD or TESTS record is missing or malformed, or whose commits cannot be listed, is listed with a note naming what was unreadable, the other Stories are still digested, and the builder never throws**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | epic-built-state-digest.test.ts: a Story whose BUILD or TESTS record is missing or malformed, or whose commits cannot be listed, is listed with a note naming what was unreadable, the other Stories are still digested, and the builder never throws | `src/workflow/__tests__/epic-built-state-digest.test.ts` |

**unit: epic-built-state-digest.test.ts: the newest Stories are in full and older ones are a summary line and a path, the rendered text never exceeds the total cap, and truncated says how many Stories were reduced**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | epic-built-state-digest.test.ts: the newest Stories are in full and older ones are a summary line and a path, the rendered text never exceeds the total cap, and truncated says how many Stories were reduced | `src/workflow/__tests__/epic-built-state-digest.test.ts` |

**unit: epic-built-state-digest.test.ts: renderEpicBuiltStateDigest renders the same digest to the same text and a null digest to one line that says the analysis does not apply and why**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | epic-built-state-digest.test.ts: renderEpicBuiltStateDigest renders the same digest to the same text and a null digest to one line that says the analysis does not apply and why | `src/workflow/__tests__/epic-built-state-digest.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/epic-built-state-digest.test.ts` | 0 | 4 | 0.9 s |  |

## t3

Run at 2026-11-24T09:57:47.561Z on commit `1cd4a3244`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: epic-impact-prompts.test.ts: the design.story and plan context.assemble prompts for a later Story of an Epic lead with EPIC_IMPACT_FIRST_ACTION and carry the rendered digest above the Story detail or the LLD handoff, and the prompts for a first or standalone Story carry only the one-line 'does not apply'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | epic-impact-prompts.test.ts: the design.story and plan context.assemble prompts for a later Story of an Epic lead with EPIC_IMPACT_FIRST_ACTION and carry the rendered digest above the Story detail or the LLD handoff, and the prompts for a first or standalone Story carry only the one-line 'does not apply' | `src/workflow/__tests__/epic-impact-prompts.test.ts` |

**unit: epic-impact-artifacts.test.ts: an LLD and a PLAN with an epicImpact render an 'Epic impact analysis' section, one without it renders exactly as before, and a synthesize with a non-null digest and no analysis (or an empty one) is rejected with the reason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | epic-impact-artifacts.test.ts: an LLD and a PLAN with an epicImpact render an 'Epic impact analysis' section, one without it renders exactly as before, and a synthesize with a non-null digest and no analysis (or an empty one) is rejected with the reason | `src/workflow/__tests__/epic-impact-artifacts.test.ts` |
| pass | epic-impact-artifacts.test.ts: design.story and plan synthesize reject a later Story with no real analysis, carry the first step's analysis verbatim, and do not ask a Story with nothing built for one | `src/workflow/__tests__/epic-impact-artifacts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/epic-impact-artifacts.test.ts` | 0 | 3 | 0.9 s |  |
| `src/workflow/__tests__/epic-impact-prompts.test.ts` | 0 | 1 | 0.8 s |  |

## t4

Run at 2026-11-24T10:00:43.332Z on commit `8335d53f4`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: render.test.ts: the build implement prompt for a later Story begins its Process with the Epic impact analysis and the digest and tells the builder to open its BUILD summary with a paragraph labelled EPIC_IMPACT_LABEL naming each covered Story and that BUILD approval is refused without it, and for a first or standalone Story gains only the one-line 'does not apply'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | render.test.ts: the build implement prompt for a later Story begins its Process with the Epic impact analysis and the digest and tells the builder to open its BUILD summary with a paragraph labelled EPIC_IMPACT_LABEL naming each covered Story and that BUILD approval is refused without it, and for a first or standalone Story gains only the one-line 'does not apply' | `src/daemon/steps/build-step/__tests__/render.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/render.test.ts` | 0 | 14 | 0.9 s |  |

## t5

Run at 2026-11-24T10:07:57.206Z on commit `f82157b01`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: epic-impact-build-check.test.ts: checkBuildEpicImpact does not apply to a Story with no approved LLD, whose LLD has no epicImpact or whose epicImpact says it does not apply, and for a later Story refuses a BUILD summary with no 'Epic impact:' paragraph, one that is under the minimum length, or one that does not name each Story the LLD's analysis covered as a whole token inside that paragraph, and passes one that does, and never throws on an unreadable record**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | epic-impact-build-check.test.ts: checkBuildEpicImpact does not apply to a Story with no approved LLD, whose LLD has no epicImpact or whose epicImpact says it does not apply, and for a later Story refuses a BUILD summary with no 'Epic impact:' paragraph, one that is under the minimum length, or one that does not name each Story the LLD's analysis covered as a whole token inside that paragraph, and passes one that does, and never throws on an unreadable record | `src/workflow/__tests__/epic-impact-build-check.test.ts` |

**integration: epic-impact-build-check.test.ts: approveWorkflowTarget over a later Story's BUILD without the paragraph returns it in skipped[] with the reason and the kind 'epic-impact-missing' (when skipKinds is set) and creates no record, approves it with an explicit overrideReview, approves one with the paragraph, and leaves a first Story's BUILD, a test record and every existing refusal as they were**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | epic-impact-build-check.test.ts: approveWorkflowTarget over a later Story's BUILD without the paragraph returns it in skipped[] with the reason and the kind 'epic-impact-missing' (when skipKinds is set) and creates no record, approves it with an explicit overrideReview, approves one with the paragraph, and leaves a first Story's BUILD, a test record and every existing refusal as they were | `src/workflow/__tests__/epic-impact-build-check.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/epic-impact-build-check.test.ts` | 0 | 2 | 0.9 s |  |

## t6

Run at 2026-11-24T10:10:11.047Z on commit `d7f4538fa`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: steering-epic-impact.test.ts: the design.story, plan and build guide sections of the shipped steering block each state the rule, the build section states that the BUILD summary must carry the labelled paragraph and that approval is refused without it, the skeleton's feature route points at it, no new marker pair was added, and the existing sections are still addressable by name**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | steering-epic-impact.test.ts: the design.story, plan and build guide sections of the shipped steering block each state the rule, the build section states that the BUILD summary must carry the labelled paragraph and that approval is refused without it, the skeleton's feature route points at it, no new marker pair was added, and the existing sections are still addressable by name | `src/daemon/__tests__/steering-epic-impact.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/steering-epic-impact.test.ts` | 0 | 1 | 0.9 s |  |

## t7

Run at 2026-11-24T11:04:19.077Z on commit `7eada8bf5`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: build-commands-doc.test.ts or a docs test: docs/workflow.md describes the Epic impact analysis, the digest and its caps and the BUILD approval check in line with the code**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | epic-impact-doc.test.ts: docs/workflow.md describes the Epic impact analysis, the digest and its caps and the BUILD approval check in line with the code | `src/workflow/__tests__/epic-impact-doc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/epic-impact-doc.test.ts` | 0 | 1 | 0.8 s |  |
