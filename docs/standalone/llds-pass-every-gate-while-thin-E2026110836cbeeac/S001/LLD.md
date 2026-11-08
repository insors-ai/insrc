<!-- insrc:artifact LLD-36cbeeac485c0af7-s1 -->

# LLD: STORY-36cbeeac485c0af7-s1

## Summary

**Epic:** `llds-pass-every-gate-while-thin`
**HLD base run:** `wf-1794122938555-ch5567`
**HLD effective hash:** `7f5480f3f756...`

An LLD's quality will stop depending on which model wrote it. The daemon will fill each alternative from what the alternatives step recorded and refuse new LLDs whose alternatives are incomplete or whose citations carry a file reference outside the documented form. LLD titles will show the Story title, and client-authored artifacts will record the real client family plus the model the client reports, or say the model is unknown. All of this applies when an artifact is written, so stored artifacts read and render exactly as before.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `handleSynthesize`

```typescript
handleSynthesize(input: WorkflowStepInputSynthesize): Promise<WorkflowStepDone | WorkflowStepError>
```

**Parameters:**
- `input: WorkflowStepInputSynthesize` — the synthesize phase input; gains optional authorModel, the model the client says authored the artifact

**Returns:** `Promise<WorkflowStepDone | WorkflowStepError>` — the written artifact, or an error naming what must be corrected and whether a retry can help

**Preconditions:**
- the run's state is awaiting_synthesize

**Postconditions:**
- the finalized artifact's meta.attribution has one (client) stamp whose runner is the family of the step context's client, or 'unknown' when that client maps to no family
- the stamp's model is the trimmed authorModel when it is a non-empty single line, otherwise 'unknown'

### 2.2 `finalizeDesignStory`

```typescript
finalizeDesignStory(intent: WorkflowIntent, stepOutputs: Readonly<Record<string, unknown>>, runId: string, elapsedMs: number, llmResponse: Record<string, unknown>, model: string, attribution?: ArtifactModelAttribution): Promise<FinalizeResult>
```

**Parameters:**
- `stepOutputs: Readonly<Record<string, unknown>>` — the run's step outputs; s2.alternatives is the source of each alternative's content
- `llmResponse: Record<string, unknown>` — the submitted artifact; each alternative needs only its id, and a loser its reasonRejected
- `attribution: ArtifactModelAttribution` _(optional)_ — the authoring record, now forwarded on the standalone path as well

**Returns:** `Promise<FinalizeResult>` — the finalized LLD, or a schema or paths failure that says whether a retry can help

**Errors:**
- `retryable schema failure` when submitted alternative ids are duplicated or do not match s2's ids one-to-one, or on a run with no s2 output an alternative is incomplete
- `non-retryable schema failure` when s2 itself has duplicate ids or an incomplete record, which no resubmission can correct
- `retryable paths failure` when a citation of a non-path kind holds a file reference that is not the whole ref, or a whole-ref file reference not in the one form

**Preconditions:**
- the body has passed isLldBody

**Postconditions:**
- every stored alternative's name, oneLineSummary, approach, pros, cons and costEstimate equal the s2 record with the same id
- a submitted reasonRejected is retained
- fields s2 does not define, other than reasonRejected, are not stored
- meta.storyTitle is set on both the Epic and the standalone path

### 2.3 `renderLldMarkdown`

```typescript
renderLldMarkdown(artifact: LldArtifact): string
```

**Parameters:**
- `artifact: LldArtifact` — the LLD to render, new or stored

**Returns:** `string` — the LLD markdown

**Postconditions:**
- with meta.storyTitle the H1 is 'LLD: <id> — <title>'
- without meta.storyTitle the output is unchanged from today

### 2.4 `isAlternative`

```typescript
isAlternative(v: unknown): boolean
```

**Parameters:**
- `v: unknown` — a candidate alternative

**Returns:** `boolean` — true when every field of a complete alternative is present

**Postconditions:**
- exported from hld.ts unchanged, so the LLD finalize path applies the same standard as the HLD

## 3. Data model changes

### 3.1 `LLD alternatives at finalize` — invariant-change

Today the model re-types alternatives and only an array is required. A new helper in orchestrator.ts, applyStepAlternatives(body, stepOutputs), runs in finalizeDesignStory before the standalone branch so both paths get it. It first requires s2's ids to be unique and every s2 record to pass isAlternative; otherwise the failure is non-retryable and tells the client to restart design.story, because every resubmission would meet the same s2. It then requires submitted ids to be unique and to match s2's one-to-one, and rebuilds each entry from the s2 record, keeping only the submitted reasonRejected. When the run has no s2 output there is nothing to overlay, and the submitted list must itself pass isAlternative. The synthesis schema gives each item a required id and an optional reasonRejected, and allows other fields, so a model that still copies them is not refused. The synthesis prompt says the daemon fills the rest. isLldBody is unchanged, so stored LLDs still read.

**Call sites:**
- `src/workflow/orchestrator.ts:2022`
- `src/workflow/orchestrator.ts:2085`
- `src/workflow/orchestrator.ts:2117`
- `src/workflow/artifacts/hld.ts:298`

### 3.2 `LLD citations at finalize` — invariant-change

Today citations of kinds other than code and doc may hold any text. A new check in synthesizer.ts, checkNonPathCitationRefs(citations, repoPath), is called only from finalizeDesignStory. It looks for file references in the ref: slash-separated paths, root-level file names with a known source or document extension, absolute paths and URLs. A ref with none passes. A ref that is exactly one file reference is judged by the existing pathFormProblem rule, so a bad path-only ref such as one starting with ./ is refused and a standalone URL passes. A file reference alongside any other text is refused. The failure tells the author to use a code or doc citation with the path as ref and any prose as quotedText. Recognition is a heuristic and an unusual file name can be missed. checkPathForms and validateBodyAndCitations are unchanged, so other artifact kinds are unaffected.

**Call sites:**
- `src/workflow/synthesizer.ts:239`
- `src/workflow/synthesizer.ts:273`
- `src/workflow/orchestrator.ts:2117`

### 3.3 `LldMeta` — field-add

Adds optional storyTitle. finalizeDesignStory's Epic path sets it from story.title. The standalone path sets it from params.storyTitle, falling back to hldContextSlice.boundary.internal as the companion header already does. A stored LLD has no storyTitle and renders exactly as before.

```
+ readonly storyTitle?: string | undefined;
```

**Call sites:**
- `src/workflow/artifacts/lld.ts:188`
- `src/workflow/artifacts/lld.ts:328`
- `src/workflow/orchestrator.ts:2247`
- `src/workflow/orchestrator.ts:2363`

### 3.4 `OutputModelStamp` — field-modify

Today the runner must be a FamilyId, so an unmapped client takes the default family. runner widens to FamilyId or the literal 'unknown', so such a client is recorded as unknown. A new helper in attribution.ts, clientAttribution(family, authorModel), builds the single (client) stamp. handleSynthesize reads the client from the step context and calls it. singleModelAttribution stays for its other callers, and stored stamps are read unchanged.

```
- readonly runner: FamilyId;
+ readonly runner: FamilyId | 'unknown';
```

**Call sites:**
- `src/workflow/types.ts:281`
- `src/workflow/attribution.ts:63`
- `src/daemon/steps/workflow-step/phases/synthesize.ts:35`
- `src/daemon/model-registry.ts:122`

### 3.5 `WorkflowStepInputSynthesize` — field-add

Adds optional authorModel, exposed on the insrc_workflow_step tool for phase=synthesize and described as the model authoring this artifact, to be omitted when not known. Omitting it is valid and records 'unknown'. finalizeDesignStory now forwards attribution to finalizeStandaloneLld, which it drops today.

```
+ readonly authorModel?: string | undefined;
```

**Call sites:**
- `src/daemon/steps/workflow-step/types.ts:50`
- `src/mcp/server.ts:1283`
- `src/workflow/orchestrator.ts:2339`

## 4. Diagrams

- [Sequence diagram](docs/standalone/llds-pass-every-gate-while-thin-E2026110836cbeeac/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Submitted alternative ids are duplicated or do not match s2's ids one-to-one** (recoverable)
  - Detection: applyStepAlternatives compares the submitted ids against s2's, checking uniqueness and that both sets are equal
  - Response: Returns a retryable schema failure naming the duplicated, unknown or missing ids
  - User impact: None beyond one synthesize retry; nothing is written
- **s2 has duplicate ids or an incomplete record** (terminal)
  - Detection: applyStepAlternatives checks s2's id uniqueness and runs isAlternative on each s2 record before overlaying
  - Response: Returns a non-retryable schema failure naming the defect and telling the client to restart design.story
  - User impact: The stage must be restarted, because no resubmission can correct a stored step output; nothing is written
- **On a run with no s2 output, a submitted alternative is incomplete** (recoverable)
  - Detection: isAlternative returns false for the submitted entry
  - Response: Returns a retryable schema failure naming the entry and the required fields
  - User impact: None beyond one synthesize retry; nothing is written
- **A non-path citation carries a file reference alongside other text, or a whole-ref file reference outside the one form** (recoverable)
  - Detection: checkNonPathCitationRefs finds a file reference in the ref and either other text beside it or a pathFormProblem result for it
  - Response: Returns a retryable paths failure naming the citation and telling the author to use a code or doc citation
  - User impact: None beyond one synthesize retry; nothing is written

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A loser in the submission has no reasonRejected | Accepted as today; the alternative renders without a rejection line |
| The submission repeats full alternative fields that differ from s2 | Accepted, and s2's values are stored |
| The submission carries an extra field such as chosen: true | Accepted, and the field is not stored |
| On a run with no s2 output, the submission has complete alternatives | Accepted as submitted |
| A non-path citation ref is text with no file reference, such as a step-output label | Passes the check |
| A non-path citation ref is exactly one well-formed path or URL | Passes the check |
| A non-path citation ref is exactly one badly formed path, such as one starting with ./ | Refused, as the same ref would be under a code citation |
| A non-path citation ref names a root-level file or a URL alongside prose | Refused |
| authorModel is absent, blank or spans several lines | The stamp records model 'unknown' |
| The client maps to no model family, or there is no client identity | The stamp records runner 'unknown' |
| A Story title contains a line break | The H1 stays on one line, with whitespace collapsed |
| A daemon-driven run, where a per-step attribution is supplied | That attribution is written unchanged; the client stamp applies only to handleSynthesize |

**Invariants to preserve**

- isLldBody keeps accepting a stored LLD whose alternatives lack the full fields, so stored artifacts keep reading [[c2]]
- checkPathForms keeps examining only code and doc citations, so artifact kinds other than LLD are unaffected [[c4]]
- A stored LLD with no meta.storyTitle renders the same id-only H1 as today [[c5]]

## 6. Test strategy

**Test framework:** `node:test (tsx --test)`

**Test levels**

- **unit** — Prove the overlay, id uniqueness, the completeness rule, the citation rule, the title and the attribution stamp in isolation.
  - Subjects: `applyStepAlternatives`, `checkNonPathCitationRefs`, `renderLldMarkdown`, `clientAttribution`
- **integration** — Run the full finalize path for both Epic and standalone Stories, the synthesize phase including the client identity and retry behaviour, and re-render real stored LLDs to prove they do not change.
  - Subjects: `finalizeDesignStory`, `handleSynthesize`, `stored LLD re-render`
  - Fixtures: `the DeepSeek LLD's stored body and step outputs`, `a stored LLD with no meta.storyTitle`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `overlay: a submission with only ids and reasonRejected stores every s2 field`, `overlay: a submission that alters s2's content stores s2's values`, `finalize: both the Epic and the standalone path apply the overlay`, `fallback: a run with no s2 output accepts complete submitted alternatives` |
| `ac2` | `finalize: duplicate submitted ids are refused as retryable`, `finalize: an id absent from s2 is refused as retryable`, `finalize: an s2 alternative missing from the submission is refused as retryable`, `finalize: duplicate s2 ids are refused as non-retryable`, `finalize: an incomplete s2 record is refused as non-retryable, naming a restart, and writes nothing`, `fallback: a run with no s2 output refuses an id-only submission` |
| `ac3` | `citations: the DeepSeek LLD's actual refs are refused`, `citations: a badly formed path-only ref under analyze-bundle is refused, as under code`, `citations: a root-level file name alongside prose is refused`, `citations: a URL alongside prose is refused`, `citations: a text-only label, a well-formed path and a standalone URL all pass`, `citations: a refused citation names its id, writes nothing and succeeds when corrected`, `citations: other artifact kinds are unaffected` |
| `ac4` | `title: the H1 shows id and title on both finalize paths`, `title: a title with a line break renders on one line` |
| `ac5` | `attribution: a Codex client with a reported model stamps cli-codex and that model`, `attribution: absent, blank and multiline authorModel stamp unknown`, `attribution: a client with no family stamps runner unknown`, `attribution: a supplied multi-output attribution stays unchanged on both finalize paths` |
| `ac6` | `stored: a stored LLD with no storyTitle renders byte-identically`, `stored: isLldBody still accepts a stored LLD with partial alternatives`, `stored: checkPathForms behaviour for other artifact kinds is unchanged` |

## 7. Migration

**State before:** The synthesizing model re-types each alternative, and the LLD finalize path checks only that the list is an array. Non-path citations may hold any text. The LLD H1 shows the id alone. A client-authored artifact is stamped from the label 'client', which falls to the default family whichever client wrote it.

**State after:** Each new LLD's alternatives carry s2's content and must be complete, with unique ids matching s2 one-to-one. A non-path citation may hold no file reference or exactly one in the one form. A new LLD's H1 shows the id and the Story title. A client-authored artifact records its client's family and the reported model, or unknown. Stored artifacts read and render as they did.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional fields: storyTitle on the LLD meta, authorModel on the synthesize input, and the 'unknown' runner value on the attribution stamp. — ↩ rollbackable
2. Stamp the Story title at finalize and render it in the H1 when present. — ↩ rollbackable
3. Overlay s2's alternatives at LLD finalize, require unique ids and complete entries, and relax the synthesis schema and prompt to ask only for id and reasonRejected. — ↩ rollbackable
4. Refuse non-path citations whose file reference is not the whole ref or is not in the one form, at LLD finalize only. — ↩ rollbackable
5. Build the client stamp in the synthesize phase, forward attribution on the standalone path, and describe authorModel on the workflow-step tool. — ↩ rollbackable

**Backward compat:** All new input fields are optional, so an existing client that sends none keeps working and records the model as unknown. A client that keeps sending full alternatives is accepted. Stored artifacts are not rewritten. The stricter checks apply only to new LLD writes. A run in flight when the daemon updates may need a synthesize retry, or a restart of design.story if its stored s2 output is malformed. MCP clients need a reconnect to see the new tool field.

## 8. Alternatives considered

### 8.1 a1: Daemon overlays s2 alternatives at finalize, then validates — **CHOSEN**

At finalize the daemon replaces each alternative's content with the s2 record by id, keeps the author's reasonRejected, then requires every entry to be complete.

finalizeDesignStory overlays stepOutputs.s2.alternatives onto the submitted list by id, before the standalone branch so both paths get it. Ids must be unique in both lists and match one-to-one. The author supplies id and reasonRejected; every other field comes from s2. A submission that disagrees with s2 is a retryable failure. A malformed s2 record cannot be fixed by resubmitting, so it is a non-retryable failure that tells the client to restart the stage. The result must pass the HLD's isAlternative. At LLD finalize, a citation of a non-path kind must either contain no file reference or be exactly one reference in the one form; anything else is refused. Finalizers stamp meta.storyTitle and the renderer adds it to the H1 when present. The synthesize input gains an optional authorModel and the step context's client, producing a stamp of the real family and the reported model, or the literal unknown.

### 8.2 a2: Daemon authors alternatives entirely; drop them from the synthesis output

Remove alternativesConsidered from what the model submits and have the daemon build the list from s2 and s3.

The synthesis schema stops asking for alternativesConsidered and chosenAlternative. The daemon assembles the list from s2 and takes the winner and rejection reasons from s3's judgments. Title, citation and attribution handling match a1. This changes the required shape of the LLD synthesis response.

**Rejected because:** Also satisfies ac1 to ac6, but it replaces the authored rejection reasons with s3's rationale and changes the submission contract for every fixture and caller, a larger change for the same result.

### 8.3 a3: Validation only: reject incomplete alternatives and retry

Tighten the schema and validator and rely on the model retrying until it copies every field.

Give alternativesConsidered a full item shape in the synthesis schema and check it at finalize with isAlternative. No overlay: the model remains the source of the content. Title, citation and attribution handling match a1.

**Rejected because:** The cheapest option, but it violates ac1: the content would still depend on what the model re-types, which is the defect being fixed.

## 9. References

- **[[c1]]** `code` `src/workflow/orchestrator.ts:2117` — "async function finalizeDesignStory("
- **[[c2]]** `code` `src/workflow/artifacts/lld.ts:492` — "if (!Array.isArray(r['alternativesConsidered'])) return false;"
- **[[c3]]** `code` `src/workflow/artifacts/hld.ts:298` — "function isAlternative(v: unknown): boolean {"
- **[[c4]]** `code` `src/workflow/synthesizer.ts:280` — "if (c.kind !== 'code' && c.kind !== 'doc') continue;"
- **[[c5]]** `code` `src/workflow/artifacts/lld.ts:328` — "const h1 = `LLD: ${lldSid ?? meta.storyId}`;"
- **[[c6]]** `code` `src/workflow/attribution.ts:63` — "export function singleModelAttribution(label: string): ArtifactModelAttribution {"
- **[[c7]]** `code` `src/daemon/steps/host.ts:96` — "`context.client` must be 'claude', 'codex' or 'vibe'"
- **[[c8]]** `code` `src/workflow/runners/design-story/schemas.ts:57` — "required: ['id', 'name', 'oneLineSummary', 'approach', 'pros', 'cons', 'costEstimate']"
- **[[c9]]** `code` `src/workflow/orchestrator.ts:2085` — "alternativesConsidered: { type: 'array', minItems: 2 }"
- **[[c10]]** `code` `src/workflow/orchestrator.ts:2022`
- **[[c11]]** `code` `src/workflow/orchestrator.ts:2339` — "async function finalizeStandaloneLld("
- **[[c12]]** `code` `src/daemon/steps/workflow-step/phases/synthesize.ts:35` — "export async function handleSynthesize("
- **[[c13]]** `code` `src/assets/artifacts/formats/lld.md:3` — "# LLD: <story id — title>"
- **[[c14]]** `code` `src/workflow/types.ts:281` — "export interface OutputModelStamp {"
- **[[c15]]** `code` `src/workflow/synthesizer.ts:239` — "function pathFormProblem(ref: string, repoPath?: string): string | undefined {"
- **[[c16]]** `prior-artifact` `docs/standalone/llds-pass-every-gate-while-thin-E2026110836cbeeac/ISSUE.md`
