<!-- insrc:artifact CR-2ff0dfdadb1c8d1c-s5 -->

# Code review: 2ff0dfdadb1c8d1c:s5

⚠️ **WARN** — HIGH 0 · MED 3 · LOW 5 · model `claude:opus`

**Changed files:** 19

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/delivery/markdown.ts:109 | When a record's markdown file exists, is inside docs/, and starts with a different artifact's marker, `markdownOf` returns null. The LLD says the port returns null only when the file is missing or fails containment. Otherwise it should return the path with `hasMarker` false. Because of this, the snapshot entry reports `mdPath` null for a file that does exist. It also means `workflow.deliveryEvidence` returns `renderedMarkdown` null for that record, while the LLD says it returns whatever markdown the port finds, and a file without the marker is still returned. |
| LOW | src/workflow/delivery/types.ts:352 | The published `DeliveryMarkdownPort` seam returns `{ mdPath, realPath, hasMarker }`. The LLD and plan t1 define it as `{ readonly mdPath: string; readonly hasMarker: boolean } \| null`. The extra required `realPath` field changes the seam: test ports written to the approved shape will not type-check. |

## conventions — 0 finding(s)

_No findings._

## coverage — 0 finding(s)

_No findings._

## quality — 6 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/delivery/handlers.ts:90 | renderedMarkdownOf reloads and lifts the entire artifact store and rebuilds the whole WorkItemGraph just to resolve one record's markdown path for a single evidence request. That makes the cost of every evidence call grow with the size of the store. It also means a malformed sibling record can affect resolution of this record's markdown; any throw is swallowed into a warn and returns null, so the client sees 'no markdown' rather than an error. Consider building the port once from a cached or shared record set, or resolving the path from the record alone. |
| LOW | src/workflow/delivery/handlers.ts:93 | The markdown body is read with a direct readFileSync, bypassing the injected deps.fs (ReadonlyStoreFs) seam that the store read in handleDeliveryEvidence goes through. A test or caller that injects deps.fs still hits the real disk for the markdown, so the 'one fs seam' contract only partly holds. |
| MED | src/workflow/pending.ts:95 | kindFromFilename splits on the first '-' to get the kind prefix. That is the same logic as the new delivery loader's kindOfFile, which also validates the prefix against DELIVERY_ARTIFACT_KINDS. Two classifiers for the same store-filename convention can drift: pending.ts accepts any prefix, while delivery rejects unknown ones. |
| LOW | src/workflow/pending.ts:202 | str(v) duplicates the unknown→string narrowing that delivery/read.ts exports as asString. The only difference is that str returns undefined where asString returns null. |
| LOW | src/workflow/artifact-content.ts:90 | The private ArtifactShape interface (meta/body view of a store JSON) is redeclared here and again in pending.ts. Each copy can drift separately. |
| LOW | src/workflow/delivery/__tests__/currency.test.ts:231 | The test helpers storeRepo, snapshotTree and walk are copied verbatim from load.test.ts, and handlers.test.ts has a near-identical repoWith/treeOf pair. A shared test fixture module would remove the triplication. |

