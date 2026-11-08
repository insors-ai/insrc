<!-- insrc:artifact PLAN-36cbeeac485c0af7-s1 -->

# Plan: STORY-36cbeeac485c0af7-s1

## Summary

**Epic:** `llds-pass-every-gate-while-thin`
**LLD run:** `wf-1794122938555-ch5567`
**LLD effective hash:** `7f5480f3f756...`

The build makes four independent changes to the write path for workflow artifacts: the LLD heading gains the Story title, alternatives are rebuilt from the step that wrote them, non-path citations are held to the file-reference rule, and client-authored artifacts record who wrote them. Nothing changes for artifacts already stored. The largest risk is existing test fixtures that submit incomplete alternatives, which the alternatives task must update.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Show the Story title in the LLD heading | S | — | — | unit: title: the H1 shows id and title; unit: title: a title with a line break renders on one line; integration: title: the H1 shows id and title on both finalize paths; integration: stored: a stored LLD with no storyTitle renders byte-identically | [[c1]] |
| 2 | **`t2`** Rebuild alternatives from the alternatives step at finalize | M | — | — | unit: overlay: a submission with only ids and reasonRejected stores every s2 field; unit: overlay: a submission that alters s2's content stores s2's values; unit: finalize: duplicate submitted ids are refused as retryable; unit: finalize: an id absent from s2 is refused as retryable; unit: finalize: an s2 alternative missing from the submission is refused as retryable; unit: finalize: duplicate s2 ids are refused as non-retryable; unit: fallback: a run with no s2 output accepts complete submitted alternatives; unit: fallback: a run with no s2 output refuses an id-only submission; integration: finalize: both the Epic and the standalone path apply the overlay; integration: finalize: an incomplete s2 record is refused as non-retryable, naming a restart, and writes nothing; integration: stored: isLldBody still accepts a stored LLD with partial alternatives | [[c1]] [[c2]] |
| 3 | **`t3`** Enforce the file-reference rule on non-path citations in LLDs | M | — | — | unit: citations: the DeepSeek LLD's actual refs are refused; unit: citations: a badly formed path-only ref under analyze-bundle is refused, as under code; unit: citations: a root-level file name alongside prose is refused; unit: citations: a URL alongside prose is refused; unit: citations: a text-only label, a well-formed path and a standalone URL all pass; integration: citations: a refused citation names its id, writes nothing and succeeds when corrected; integration: citations: other artifact kinds are unaffected; integration: stored: checkPathForms behaviour for other artifact kinds is unchanged | [[c3]] |
| 4 | **`t4`** Record the real client and reported model on client-authored artifacts | M | — | — | unit: attribution: absent, blank and multiline authorModel stamp unknown; unit: attribution: a client with no family stamps runner unknown; unit: attribution: modelSummary prints an unknown stamp; integration: attribution: a Codex client with a reported model stamps cli-codex and that model; integration: attribution: a supplied multi-output attribution stays unchanged on both finalize paths | [[c4]] [[c5]] |

### 1.1 TASK-36cbeeac485c0af7-s1-t1 — Show the Story title in the LLD heading

Add optional storyTitle to the LLD meta, set it on the Epic and standalone finalize paths, and render it in the H1 when present.

**Acceptance checks:**
- A new LLD's H1 reads 'LLD: <id> — <title>' on both finalize paths
- A title with a line break renders on one line
- A stored LLD with no storyTitle renders byte-identically

### 1.2 TASK-36cbeeac485c0af7-s1-t2 — Rebuild alternatives from the alternatives step at finalize

Export isAlternative, add the overlay before the standalone branch with unique one-to-one ids, non-retryable handling of a malformed s2 and the no-s2 fallback, relax the synthesis schema and prompt, and update fixtures that submit incomplete alternatives.

**Acceptance checks:**
- Stored alternatives equal s2's records, keeping only the submitted reasonRejected
- A submission whose content differs from s2 is accepted and s2's values are stored
- Mismatched or duplicate submitted ids are refused as retryable
- A malformed s2 is refused as non-retryable, naming a restart, and writes nothing
- A run with no s2 output accepts complete alternatives and refuses incomplete ones
- isLldBody is unchanged, so stored LLDs still read

### 1.3 TASK-36cbeeac485c0af7-s1-t3 — Enforce the file-reference rule on non-path citations in LLDs

Add checkNonPathCitationRefs beside pathFormProblem and call it only from finalizeDesignStory.

**Acceptance checks:**
- The DeepSeek LLD's actual refs are refused
- A badly formed path-only ref, a root-level file name with prose and a URL with prose are refused
- A text-only label, a well-formed path and a standalone URL pass
- A refused citation names its id and writes nothing
- checkPathForms is unchanged and other artifact kinds are unaffected

### 1.4 TASK-36cbeeac485c0af7-s1-t4 — Record the real client and reported model on client-authored artifacts

Widen the stamp's runner to include 'unknown', add clientAttribution, add optional authorModel to the synthesize input and the workflow-step tool, build the stamp in handleSynthesize from the step context, and forward attribution on the standalone path.

**Acceptance checks:**
- A Codex client with a reported model stamps cli-codex and that model
- An absent, blank or multiline authorModel stamps unknown
- A client with no family stamps runner unknown
- A supplied multi-output attribution stays unchanged on both finalize paths
- The source type-checks with the widened runner and modelSummary prints an unknown stamp

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| applyStepAlternatives | `t2` |
| checkNonPathCitationRefs | `t3` |
| renderLldMarkdown | `t1` |
| clientAttribution | `t4` |
| finalizeDesignStory | `t1`, `t2`, `t3` |
| handleSynthesize | `t4` |
| stored LLD re-render | `t1` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails`
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges alternatives at finalize`
- **[[c3]]** `prior-artifact` `LLD s1 dataModelChanges citations at finalize`
- **[[c4]]** `prior-artifact` `LLD s1 dataModelChanges OutputModelStamp`
- **[[c5]]** `prior-artifact` `LLD s1 dataModelChanges WorkflowStepInputSynthesize`
