<!-- insrc:artifact PLAN-3b6bd6b5fa3c30d1-S001 -->

# Plan: E202610093b6bd6b5:S001

## Summary

**Epic:** `defects-review-pane-s-test-file`
**LLD run:** `wf-1791552370732-5sywlc`
**LLD effective hash:** `bb128977d8fb...`

This build moves the review pane's tests onto one shared fake DOM in a new test module, which is pinned by its own contract tests. It then moves the body, sections and webview suites onto it, followed by the functional-requirements, diagram and experience suites. After that it removes the duplicate flatten helpers and opener. Last, it makes every history- or compiler-dependent check skip with a reason when what it needs is missing, verified once in a shallow clone. No production code changes.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** The shared fake DOM module and its contract tests | M | — | unit: fake-dom.test.ts: 'the shared fake DOM records writes, parses and traps innerHTML, clears children on textContent, and models namespaces, text nodes, parent and sibling links, querying and listeners'; unit: fake-dom.test.ts: 'allOf walks pre-order, root first, and skips text nodes' | [[c1]] [[c2]] [[c5]] |
| 2 | **`t2`** Repoint the body, sections and webview suites to the shared fake | M | `t1` | integration: docs-review-panel.test.ts: the t4 body-renderer, t6 sections-and-chooser and webview-shell suites pass on the shared fake with their assertions unchanged | [[c1]] [[c5]] [[c6]] |
| 3 | **`t3`** Repoint the functional-requirements, diagram and experience suites to the shared fake | M | `t2` | integration: docs-review-panel.test.ts: the functional-requirements, diagram (ER and sequence) and experience-card suites pass on the shared fake with their assertions and parity snapshots unchanged | [[c1]] [[c5]] [[c6]] |
| 4 | **`t4`** One flatten | S | `t3` | integration: docs-review-panel.test.ts: every flatten-based suite passes through the imported allOf, and the file declares no flatten of its own | [[c2]] [[c6]] |
| 5 | **`t5`** One document opener | S | `t4` | integration: docs-review-panel.test.ts: 'there is one document opener, and a markdown string and the same markdown as DocsContent open to identical payloads' | [[c3]] [[c6]] |
| 6 | **`t6`** History and compiler checks skip with a reason | M | `t5` | unit: docs-review-panel.test.ts: 'history and compiler checks skip with a stated reason when what they need is missing, and never run on an empty window' | [[c4]] [[c6]] |

### 1.1 E202610093b6bd6b5:S001:T001 — The shared fake DOM module and its contract tests

Add vscode-plugin/src/chat/__tests__/fake-dom.ts with the superset BodyStub/bodyStub(tagName, id?, text?, ns?) and allOf. The fake records writes, parses innerHTML, clears children on textContent, carries ns, has text nodes, parent and sibling links, querying, array listeners, scrollIntoView and a removeChild presence check, and keeps className independent of the class attribute. Add fake-dom.test.ts for the contract. docs-review-panel.test.ts is not changed yet.

**Acceptance checks:**
- fake-dom.ts exports bodyStub, BodyStub and allOf, and is not a .test.ts file.
- fake-dom.test.ts proves every listed behaviour, including innerHTML being both recorded and parsed, textContent clearing children, the digit-leading querySelector SyntaxError and the removeChild assertion.
- allOf is pre-order and root first, and skips text nodes.

### 1.2 E202610093b6bd6b5:S001:T002 — Repoint the body, sections and webview suites to the shared fake

In docs-review-panel.test.ts, move the stubEl uses (loadRenderer tests), node/StubNode (loadSections) and the local bodyStub (loadPlace, runWebview, frHeadingIn) to the shared bodyStub. Delete stubEl, node, StubNode and the local bodyStub/BodyStub. Fire the :807/:826 listeners through the listener array.

**Acceptance checks:**
- stubEl, node/StubNode and the file-local bodyStub/BodyStub no longer exist in the test file.
- Every test in these suites passes with its assertions unchanged.
- Any failure caused by the shared fake's stricter rules is reported as a finding, not worked around.

### 1.3 E202610093b6bd6b5:S001:T003 — Repoint the functional-requirements, diagram and experience suites to the shared fake

Move frNode (loadFr, loadFrAnchor), dgNode (loadDg and the two dgPickRef documents) and uxNodeStub (loadUx) to the shared bodyStub, with createElementNS passing ns and createTextNode giving text nodes. Delete frNode/FrNode, dgNode/DgNode and uxNodeStub/UxNode. Keep each suite's created/createdHtml/texts/nodes recording.

**Acceptance checks:**
- frNode, dgNode and uxNodeStub and their interfaces no longer exist in the test file.
- The write-recording, innerHTML-trap, SVG-namespace and text-node assertions all pass unchanged.
- The parity and shape snapshots that serialize attrs and className are unchanged.

### 1.4 E202610093b6bd6b5:S001:T004 — One flatten

Delete the file-local allOf and import allOf from fake-dom.ts. Replace frAll, dgFlatten and uxFlatten with it and delete them. Callers that passed dgFlatten an accumulator use the return value instead. uxAllText stays.

**Acceptance checks:**
- The test file declares no flatten of its own: frAll, dgFlatten, uxFlatten and the local allOf are gone, and every former call site uses the imported allOf.
- Every flatten-based assertion passes unchanged, with the same element order.

### 1.5 E202610093b6bd6b5:S001:T005 — One document opener

Fold openAndGetContent into openWithContent(content: DocsContent | string), where a string is served as { markdown, openQuestions: [], blocked: false }. Repoint its 5 call sites and add the source-scan and equal-payload test.

**Acceptance checks:**
- The file declares no openAndGetContent and exactly one openWithContent, and the 16 call sites use it.
- openWithContent(markdown) and openWithContent({ markdown, openQuestions: [], blocked: false }) return identical payloads.

### 1.6 E202610093b6bd6b5:S001:T006 — History and compiler checks skip with a reason

Add git(t, need), which skips with a stated reason when the checkout is not a git work tree, is shallow, lacks a named commit, or has no real window (ends missing, equal, or out of order). Route the five history checks through it (:1501, :3567, :4004-:4030, :5642-:5655). typecheckAgainstPanel(t, …) and the never-witness probe skip when tsc is missing. Add the guard tests against temporary directories, and verify once in a --depth 1 clone.

**Acceptance checks:**
- No direct execFileSync('git') remains outside git(t, need), and no existsSync(tsc) assertion remains.
- The guard test proves a skip with its reason for: not a work tree, a one-commit repository (equal window ends), a missing commit, and a missing compiler path.
- The full clone runs every history and compiler check with no skip. A --depth 1 clone reports 0 failures, with those tests skipped and their reasons given.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| bodyStub | `t1`, `t2`, `t3` |
| allOf | `t1`, `t4` |
| git | `t6` |
| typecheckAgainstPanel | `t6` |
| openWithContent | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails bodyStub: the superset fake element and its postconditions`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails allOf: the one pre-order flatten`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails openWithContent: the one document opener (16 call sites)`
- **[[c4]]** `prior-artifact` `LLD S001 contractDetails git and typecheckAgainstPanel: the history and compiler guards`
- **[[c5]]** `prior-artifact` `LLD S001 dataModelChanges: the new fake-dom.ts module, listener arrays and the textContent rule`
- **[[c6]]** `prior-artifact` `LLD S001 errorPaths and invariantsToPreserve: findings reported not hidden, skip reasons, every assertion kept`
