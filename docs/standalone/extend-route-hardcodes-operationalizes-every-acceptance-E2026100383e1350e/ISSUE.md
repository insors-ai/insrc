<!-- insrc:artifact ISSUE-83e1350e567d86d4 -->

# Give extend-route acceptance criteria a real constraint linkage instead of an empty one

## Reproduction

NOTE ON CONFIDENCE: these steps are PREDICTED from the code, not executed. The empty list is written unconditionally, so every criterion the route builds must receive it — but no extend run was performed to confirm the rendered output, and step 2 assumes the scope assessor routes a build-on-existing ask to `extend`. Reproduce for real before relying on the sequence verbatim.

1. Take an Epic with an approved Define and HLD, whose Define declares constraints.
2. Ask for something that builds on it, so scope assessment routes to `extend` rather than framing a new Epic. The route appends a new Story to that Epic's Define.
3. Inspect the appended Story's acceptance criteria in the updated Define.
4. EXPECTED OBSERVATION: every criterion carries an empty `operationalizes` list, so none of them references any of the Epic's constraints. The rendered Define shows no linkage for them, and the Define's constraint validator reports nothing.
   EXPECTED INSTEAD: an appended Story's criteria carry the same constraint traceability as criteria created through the normal define route — or, if they legitimately cannot, the gap is surfaced rather than written as an empty list.

Contrast that makes the gap concrete: the define route's own end-to-end fixtures create criteria with populated values such as `operationalizes: ['k1']`, so a non-empty list is the normal shape. Only the extend route produces empty ones.

## Root cause

The extend route does not derive the value at all — it writes the empty list as a literal when constructing the appended Story's criteria.

The field is not decorative. It is declared as a list of constraint ids on a Story's acceptance criterion, the Define renderer prints it as an 'operationalizes' annotation when present, and a Define validator walks every criterion's list and reports any id that does not match a declared constraint.

That validator is exactly why the defect is SILENT. It validates the ids that ARE referenced; it has nothing to say about a criterion that references none. So an empty list cannot fail it, no warning is produced anywhere, and the only way to notice is to read a rendered Define and observe the missing annotation. A Story added by extending an Epic therefore drops out of constraint traceability without any signal.

The reason this is not simply a one-line correction: unlike the sibling label and marker defects, there is no upstream value here to inherit. The route is appending a brand-new Story whose criteria have never been mapped to a constraint by anyone, so nothing it already reads contains the answer.

## Fix intent

An acceptance criterion created by extending an Epic must end up with constraint traceability that is either genuine or visibly absent — never silently empty.

Deliberately NOT settled here, because it is a design choice with materially different consequences and belongs in the design stage: where the mapping comes from. At least three candidates exist — elicit it as part of the extend step, refuse a criterion that maps to nothing, or decide explicitly that extended Stories are exempt and record that exemption so the absence is intentional rather than accidental. These differ in what they do to the extend contract and in whether existing extend runs start failing, so the choice should be reasoned about with its alternatives written down.

What the correction should achieve regardless of that choice: the silence ends. Whatever the chosen source, it must not be possible for a criterion to reach a persisted Define with no linkage and no explanation. Already-written Defines containing empty lists are out of scope for the behavioural fix and should be treated as a separate question.

## Citations

- **[[c1]]** `code` `src/workflow/orchestrator.ts:1272` — "operationalizes: [],"
- **[[c2]]** `code` `src/workflow/artifacts/define.ts:61` — "readonly operationalizes: readonly string[];         // constraint ids"
- **[[c3]]** `code` `src/workflow/artifacts/define.ts:131` — "const ops = ac.operationalizes.length === 0 ? '' : ' _(operationalizes ...)_';"
- **[[c4]]** `code` `src/workflow/artifacts/define.ts:264` — "for (const op of ac.operationalizes) {"
- **[[c5]]** `code` `src/workflow/artifacts/define.ts:266` — "details.push(`Story '${s.id}' AC '${ac.id}' operationalizes unknown constraint '${op}'`);"
- **[[c6]]** `code` `src/mcp/workflow-step/__tests__/define-e2e.test.ts:90` — "{ id: 'ac1', given: 'a repo with tagged todos', when: 'user picks a tag', then: 'only matching todos are visible', operationalizes: ['k1'] }"
