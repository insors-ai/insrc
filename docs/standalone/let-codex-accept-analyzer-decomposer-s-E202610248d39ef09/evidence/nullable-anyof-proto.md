# Prototype: codex accepts a nested anyOf of closed params objects with nullable optionals (2026-10-24)

`nullable-anyof-proto.mts` (beside this file) sends a two-type prototype of the LLD a1 params shape to live codex (gpt-6.1-sol): `params` is an `anyOf` of one closed object per exploration type, with optional params typed `T | null`. It prints the strict copy codex was given, then the reply. Re-run on the commit date:

```
strict: {"type":"object","additionalProperties":false,"required":["explorations"],"properties":{"explorations":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["id","type","params"],"properties":{"id":{"type":"string"},"type":{"type":"string","enum":["symbol.locate","search.text"]},"params":{"anyOf":[{"type":"object","additionalProperties":false,"required":["names","kinds","limit"],"properties":{"names":{"type":"array","items":{"type":"string"}},"kinds":{"type":["array","null"],"items":{"type":"string"}},"limit":{"type":["integer","null"]}}},{"type":"object","additiona
ACCEPTED {"explorations":[{"id":"locate_runReview","type":"symbol.locate","params":{"names":["runReview"],"kinds":null,"limit":null}},{"id":"search_VERIFY_CALL","type":"search.text","params":{"pattern":"VERIFY_CALL","glob":null,"topK":null}}]}
```
