<!-- insrc:artifact TESTS-3c6a109dffcde0c1-S001 -->

# Tests: 3c6a109dffcde0c1 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-16T07:48:15.718Z on commit `47a28716`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/path-forms.test.ts: the callSites and pathsCited schema descriptions carry the rule wording**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/__tests__/path-forms.test.ts: the callSites and pathsCited schema descriptions carry the rule wording | `src/workflow/__tests__/path-forms.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/path-forms.test.ts` | 0 | 1 | 0.3 s |  |

## t2

Run at 2026-10-16T07:50:02.750Z on commit `b2d7a503`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/path-forms.test.ts: every synthesize prompt and the step prompts that author paths contain PATH_FORM_RULE**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/__tests__/path-forms.test.ts: every synthesize prompt and the step prompts that author paths contain PATH_FORM_RULE | `src/workflow/__tests__/path-forms.test.ts` |

**unit: src/workflow/__tests__/path-forms.test.ts: the design.story synthesize prompt lets a call site taken from s4 be corrected to the path form**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/__tests__/path-forms.test.ts: the design.story synthesize prompt lets a call site taken from s4 be corrected to the path form | `src/workflow/__tests__/path-forms.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/path-forms.test.ts` | 0 | 3 | 0.3 s |  |

## t3

Run at 2026-10-16T08:19:49.056Z on commit `4561cee8`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts a root-relative path with and without a line number**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts a root-relative path with and without a line number | `src/workflow/__tests__/path-forms.test.ts` |

**unit: src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts an absolute path as an external file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts an absolute path as an external file | `src/workflow/__tests__/path-forms.test.ts` |

**unit: src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses a call site with prose beside the path and names it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses a call site with prose beside the path and names it | `src/workflow/__tests__/path-forms.test.ts` |

**unit: src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses a leading ./ and a .. segment**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses a leading ./ and a .. segment | `src/workflow/__tests__/path-forms.test.ts` |

**unit: src/workflow/__tests__/path-forms.test.ts: checkPathForms checks only citations of kind code and doc**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/__tests__/path-forms.test.ts: checkPathForms checks only citations of kind code and doc | `src/workflow/__tests__/path-forms.test.ts` |

**unit: src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts a path with a line range, a column and a #anchor**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts a path with a line range, a column and a #anchor | `src/workflow/__tests__/path-forms.test.ts` |

**unit: src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts an http(s) URL in a doc citation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts an http(s) URL in a doc citation | `src/workflow/__tests__/path-forms.test.ts` |

**integration: src/workflow/__tests__/path-forms.test.ts: validateBodyAndCitations returns a paths failure for an LLD whose call site carries prose**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/__tests__/path-forms.test.ts: validateBodyAndCitations returns a paths failure for an LLD whose call site carries prose | `src/workflow/__tests__/path-forms.test.ts` |

**integration: src/workflow/__tests__/path-forms.test.ts: validateBodyAndCitations keeps the citation result for a well-formed artifact**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/__tests__/path-forms.test.ts: validateBodyAndCitations keeps the citation result for a well-formed artifact | `src/workflow/__tests__/path-forms.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/path-forms.test.ts` | 0 | 17 | 0.3 s |  |
