<!-- insrc:artifact ISSUE-3c0b242fcabf01e9 -->

# Stop flat amendment heads from blocking every completion roll-up

## Reproduction

In this repository, finish a Story or Issue build and approve its BUILD record (for example BUILD-6fab702a7015853e-s1) through the approval tool. Observed: the approval is refused with 'cannot roll up: unreadable children AMD-86197ac660732ceb-1, AMD-86197ac660732ceb-2', even though the unit's own code review passed, and a review override does not help. Expected: the BUILD is approved; two amendment records of an unrelated epic must not matter. Workaround used so far: moving those two files out of the artifacts folder for the approval and back afterwards.

## Root cause

Completion counts a unit's children by scanning every head file in the artifacts folder and reading only its parent link. A head that lacks top-level meta and body objects is recorded as unreadable, and any unreadable head, even one that cannot be a child of the unit being completed, makes the whole roll-up throw. Exactly two heads in this repository have that flat shape: AMD-86197ac660732ceb-1 and -2, committed on 2026-10-28 and 2026-10-29, after the repository was converted to the common model on 2026-10-22. The amendment store has written the converted shape (meta, body, citations) since 2026-10-22, and its reader and the codec both refuse a flat amendment until the conversion runs on it, so these two records were left behind in the old shape; which process wrote them in that shape after the conversion is not established.

## Fix intent

Make the two amendment records readable in the converted shape without changing what they say or their approval, and make the completion roll-up resilient so that a head which cannot be a child of the unit being completed no longer blocks it, while a genuinely unreadable child of that unit still does. Also record how the two flat records came to exist after the conversion, so the cause can be closed or tracked.

## Citations

- **[[c1]]** `code` `src/workflow/artifact-core/store.ts:139-161` — "if (!isObject(head) || !isObject(head['meta']) || !isObject(head['body'])) throw new ArtifactShapeError("
- **[[c2]]** `code` `src/workflow/artifact-core/lifecycle.ts:311-313` — "if (unreadable.length > 0) throw new UnreadableChildError(unreadable);"
- **[[c3]]** `code` `src/workflow/amendments/store.ts:125-129` — "a flat record from before the s9 conversion has no `meta`"
- **[[c4]]** `code` `src/workflow/artifact-core/codecs.ts:108-110` — "An amendment stored before the s9 conversion is a flat record with no meta and body"
- **[[c5]]** `prior-artifact` `.insrc/artifacts/AMD-86197ac660732ceb-1.json`
- **[[c6]]** `prior-artifact` `.insrc/artifacts/AMD-86197ac660732ceb-2.json`
