<!-- insrc:artifact PLAN-2ff0dfdadb1c8d1c-s5 -->

# Plan: E202610082ff0dfda:S005

## Summary

**Epic:** `e1-delivery-read-model-daemon-from`
**LLD run:** `wf-1791474528232-yf1eui`
**LLD effective hash:** `215b5fd4f60f...`

The build adds the published delivery types, a pure snapshot assembler that joins the graph and the three passes into one deterministic view, a markdown lookup that finds each record's rendered document through its work item's folder, and two thin daemon handlers for the snapshot and for one evidence record, registered beside workflow.pending. Two small additive exports let the handlers reuse workflow.pending's path derivation and workflow.artifactContent's docs/ containment rule. A type-only file in the VS Code plugin and a JSON sample snapshot fix the shape for the client mirrors.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Delivery IPC types | S | — | unit: types.test.ts: 'the delivery IPC types list exactly the sketched members' | [[c1]] |
| 2 | **`t2`** Snapshot assembler | M | `t1` | unit: snapshot.test.ts: 'every work item is joined with its stage, evidence, gates, currency and notices'; unit: snapshot.test.ts: 'two snapshots of the same store, with equal timestamps, are identical in order and counts'; unit: snapshot.test.ts: 'needsAttention comes from a gate reason or an attention notice, each reason listed once, and store-level notices stay off items'; unit: snapshot.test.ts: 'a full-chain, feature or sized-bugfix story with a build and no plan gets incomplete-evidence, and small, small-bugfix and trivial stories do not' | [[c2]] [[c7]] |
| 3 | **`t3`** Shared markdown lookup and containment | M | `t1` | integration: artifact-content.test.ts and pending.test.ts: the existing workflow.artifactContent and workflow.pending tests, unchanged; integration: handlers.test.ts: 'resolveDocsMarkdown keeps workflow.artifactContent's containment errors word for word'; integration: handlers.test.ts: 'a build record that stamps no epic slug or date is located through its work item's folder' | [[c3]] [[c7]] |
| 4 | **`t4`** Handlers and daemon entries | M | `t2`, `t3` | integration: handlers.test.ts: 'workflow.delivery returns one timestamped snapshot and leaves the store, docs and git untouched'; integration: handlers.test.ts: 'workflow.deliveryEvidence reads a marker-less build record through the daemon'; integration: handlers.test.ts: 'workflow.deliveryEvidence refuses an invalid or escaping id and reports a missing one'; integration: handlers.test.ts: 'an unresolved repo or an unreadable store is an error and an absent store is an empty snapshot'; integration: handlers.test.ts: 'a 1,000-record store forming 500 work items is served within 500 ms' | [[c4]] [[c5]] [[c7]] |
| 5 | **`t5`** Client mirrors | S | `t2` | integration: contract.test.ts: 'the VS Code plugin type-checks against the published delivery types'; integration: contract.test.ts: 'the JetBrains sample snapshot is plain JSON and equals what the assembler produces' | [[c6]] |

### 1.1 E202610082ff0dfda:S005:T001 — Delivery IPC types

Add the sc7 types to src/workflow/delivery/types.ts exactly as the HLD sketch (DeliverySnapshotRequest, DeliveryEvidenceEntry, DeliveryItem, DeliverySnapshot, DeliveryEvidenceRequest, DeliveryEvidenceRecord, DeliveryError, DeliverySnapshotResponse, DeliveryEvidenceResponse) plus the two seams DeliveryMarkdownPort and DeliveryDeps; types.ts stays type-only apart from DeliveryStoreUnreadableError.

**Acceptance checks:**
- The sc7 types are exported with exactly the sketched fields.
- DeliveryMarkdownPort and DeliveryDeps are exported as the LLD defines them.
- types.ts adds no runtime code; the module compiles under the strict tsconfig.

### 1.2 E202610082ff0dfda:S005:T002 — Snapshot assembler

New src/workflow/delivery/snapshot.ts exporting the pure assembleSnapshot(recordSet, graph, stages, gates, currency, markdown): every graph item joined with its stage, evidence entries (approval, review, reviewCurrency, mdPath, openWith from the port), task results, amendments and the notices naming it; the build-without-plan incomplete-evidence notice for full-chain / feature / sized-bugfix stories; needsAttention and de-duplicated attentionReasons; store-level notices; counts with every key; schemaVersion 1; plain JSON, deterministic.

**Acceptance checks:**
- Every item of every kind appears once, sorted by id, with the fields the LLD lists; epics and tasks have stage null.
- Two runs over the same inputs, including equal timestamps, are deep-equal.
- needsAttention comes from an sc5 reason or an attention-true notice; attentionReasons list each entry once; notices with no itemIds appear only at the snapshot level.
- A full-chain, feature or sized-bugfix story with a BUILD and no PLAN gets one incomplete-evidence notice; small, small-bugfix, trivial and unknown routes do not.
- The result contains no Map, Set or undefined.

### 1.3 E202610082ff0dfda:S005:T003 — Shared markdown lookup and containment

Export pending.ts deriveMdPath with its kind parameter widened to path-scheme's ArtifactKind (workflow.pending unchanged); extract the docs/ lexical-plus-realpath containment from handleArtifactContent into an exported resolveDocsMarkdown that handleArtifactContent calls with the same error messages; add createMarkdownPort(repoPath, graph) in src/workflow/delivery/markdown.ts, which lists work-item folders once with listWorkItems, locates a record's .md through its graph item's epic segment and story folder, falls back to deriveMdPath ('' to null), checks existence and containment, and reads at most 512 bytes for the marker.

**Acceptance checks:**
- The existing pending.test.ts and artifact-content.test.ts pass unchanged.
- resolveDocsMarkdown returns the same errors handleArtifactContent returned for an escaping path, a symlink escape, a non-.md path and a missing file.
- A BUILD record with no epicSlug or epicCreatedAt is located under its work item's real folder; an AMD, an unresolvable record or a missing file gives null; hasMarker is true only for the record's own marker line.
- The port never writes.

### 1.4 E202610082ff0dfda:S005:T004 — Handlers and daemon entries

New src/workflow/delivery/handlers.ts with handleDelivery (repo resolution, one store read, the four passes, assembleSnapshot with createMarkdownPort, one log line, every failure as { error }) and handleDeliveryEvidence (repo resolution, the anchored id pattern, realpath containment under the store, lift with liftStoreFile, renderedMarkdown through resolveDocsMarkdown); two new lazy-import entries 'workflow.delivery' and 'workflow.deliveryEvidence' in src/daemon/index.ts beside workflow.pending.

**Acceptance checks:**
- A request over a temporary git repository returns one snapshot stamped with the read time and changes no file under the repo, including .git.
- deliveryEvidence returns the meta, body and markdown of a marker-less BUILD.
- An invalid or escaping id is 'invalid artifact id', a missing one 'not found'; an unresolved repo or unreadable store is { error }; an absent store is an empty snapshot.
- A 1,000-record store forming 500 work items is served within 500 ms (best of three) with the real port.
- No existing handler entry changes.

### 1.5 E202610082ff0dfda:S005:T005 — Client mirrors

Add vscode-plugin/src/delivery/delivery-contract.ts (type-only, importing the sc7 types by relative path) and vscode-plugin/tsconfig.delivery-contract.json (extending the plugin's tsconfig, including only that file); add src/workflow/delivery/__tests__/fixtures/delivery-snapshot.sample.json assembled from fixed records, a fixed time and a fixed port, kept equal to the assembler's output by a test.

**Acceptance checks:**
- npx tsc -p vscode-plugin/tsconfig.delivery-contract.json exits 0.
- The sample file parses as plain JSON and deep-equals what assembleSnapshot produces from its fixture.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| snapshot.test.ts: 'every work item is joined with its stage, evidence, gates, currency and notices' | `t2` |
| snapshot.test.ts: 'two snapshots of the same store, with equal timestamps, are identical in order and counts' | `t2` |
| snapshot.test.ts: 'needsAttention comes from a gate reason or an attention notice, each reason listed once, and store-level notices stay off items' | `t2` |
| snapshot.test.ts: 'a full-chain, feature or sized-bugfix story with a build and no plan gets incomplete-evidence, and small, small-bugfix and trivial stories do not' | `t2` |
| handlers.test.ts: 'workflow.delivery returns one timestamped snapshot and leaves the store, docs and git untouched' | `t4` |
| handlers.test.ts: 'workflow.deliveryEvidence reads a marker-less build record through the daemon' | `t4` |
| handlers.test.ts: 'workflow.deliveryEvidence refuses an invalid or escaping id and reports a missing one' | `t4` |
| handlers.test.ts: 'an unresolved repo or an unreadable store is an error and an absent store is an empty snapshot' | `t4` |
| handlers.test.ts: 'a 1,000-record store forming 500 work items is served within 500 ms' | `t4` |
| artifact-content.test.ts and pending.test.ts: the existing workflow.artifactContent and workflow.pending tests, unchanged | `t3` |
| handlers.test.ts: 'resolveDocsMarkdown keeps workflow.artifactContent's containment errors word for word' | `t3` |
| handlers.test.ts: 'a build record that stamps no epic slug or date is located through its work item's folder' | `t3` |
| contract.test.ts: 'the VS Code plugin type-checks against the published delivery types' | `t5` |
| contract.test.ts: 'the JetBrains sample snapshot is plain JSON and equals what the assembler produces' | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s5 dataModelChanges: the sc7 types and the two seams in delivery/types.ts`
- **[[c2]]** `prior-artifact` `LLD s5 contractDetails: assembleSnapshot and the DeliverySnapshot rules`
- **[[c3]]** `prior-artifact` `LLD s5 contractDetails: DeliveryMarkdownPort / createMarkdownPort and the shared deriveMdPath / resolveDocsMarkdown exports`
- **[[c4]]** `prior-artifact` `LLD s5 contractDetails: handleDelivery and handleDeliveryEvidence`
- **[[c5]]** `prior-artifact` `LLD s5 dataModelChanges: the 'workflow.delivery' and 'workflow.deliveryEvidence' daemon handler entries`
- **[[c6]]** `prior-artifact` `LLD s5 contractDetails: the sc7 types' client mirrors (VS Code type-only file, JetBrains sample snapshot)`
- **[[c7]]** `prior-artifact` `LLD s5 errorPaths: repo, store, id, record and markdown failures and edge cases`
