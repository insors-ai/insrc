<!-- insrc:artifact ISSUE-f4ee5748836ddd1f -->

# Refuse a URL attached to a colon label in an LLD citation

## Reproduction

Finalize an LLD with a citation of kind analyze-bundle whose ref is `read:source:https://example.com/source.ts?version=2 explains the implementation`. Observed: the citation is accepted. Expected: it is refused as a file reference beside other text, as `read:source: https://example.com/source.ts explains the implementation` already is. Separately, the test that a stored LLD with no storyTitle renders byte-identically compares both strings after trimEnd(), so a change to trailing spaces or newlines would still pass it.

## Root cause

isFileToken recognises a URL only when the token starts with http:// or https:// [[c1]]. A token with a colon label in front does not, so it falls through to the colon split, which leaves `//example.com/source.ts?version=2`. That part ends in a query rather than a file extension and matches neither file heuristic, so no token counts as a file and checkNonPathCitationRefs skips the citation [[c2]]. The test weakness is the trimEnd() call on both sides of its comparison [[c3]].

## Fix intent

A URL that follows a colon label is recognised as a file reference, so a citation holding one beside other text is refused, while a standalone URL and a text-only label keep passing. The byte-identical test compares the rendered strings without trimming them. No other citation kind, finalize path or stored artifact changes.

## Citations

- **[[c1]]** `code` `src/workflow/synthesizer.ts:260` — "if (/^https?:\/\//.test(token)) return true;"
- **[[c2]]** `code` `src/workflow/synthesizer.ts:261-263`
- **[[c3]]** `code` `src/workflow/__tests__/lld-authoring-gates.test.ts:153`
