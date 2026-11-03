<!-- insrc:artifact TESTS-b220bb6174a2f5ed-s4 -->

# Tests: b220bb6174a2f5ed s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-30T08:42:30.969Z on commit `e7ce2bd8f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-tier-picker.test.ts: the host family is offered next to today's; its models carry cloud/local marks, no 'Enter another model id', efforts only where the model has them, one whole-tier write**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-tier-picker.test.ts: the host family is offered next to today's; its models carry cloud/local marks, no 'Enter another model id', efforts only where the model has them, one whole-tier write | `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` |

**unit: model-tier-picker.test.ts: an undeclared current model on the host family is 'not supported — the tier will not run'; a vendor family and a host-less answer keep today's items**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-tier-picker.test.ts: an undeclared current model on the host family is 'not supported — the tier will not run'; a vendor family and a host-less answer keep today's items | `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` |

**unit: model-tier-picker.test.ts: reopening the picker after a save on the host family marks the saved family, model and effort as current**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-tier-picker.test.ts: reopening the picker after a save on the host family marks the saved family, model and effort as current | `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` | 0 | 6 | 0.7 s |  |

## t2

Run at 2026-10-30T08:44:06.234Z on commit `e7ce2bd8f`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: sync-engine.test.ts: an undeclared model for the host family is refused with 'only listed models can be used' and reverted; a vendor or host-less family keeps 'check and approve it'; a daemon refusal reverts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | manifest-key-map-engine.test.ts: an undeclared model for the host family is refused with 'only listed models can be used' and reverted; a vendor or host-less family keeps 'check and approve it'; a daemon refusal reverts | `vscode-plugin/src/config/__tests__/manifest-key-map-engine.test.ts` |

**unit: sync-engine.test.ts: a runner-only switch to the host family writes its first declared model as the whole tier and mirrors the native keys; an alias is written canonically; an effort the model does not take is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | manifest-key-map-engine.test.ts: a runner-only switch to the host family writes its first declared model as the whole tier and mirrors the native keys; an alias is written canonically; an effort the model does not take is refused | `vscode-plugin/src/config/__tests__/manifest-key-map-engine.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/config/__tests__/manifest-key-map-engine.test.ts` | 0 | 3 | 0.3 s |  |
