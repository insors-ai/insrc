<!-- insrc:artifact LLD-3b6bd6b5fa3c30d1-S001 -->

# LLD: E202610093b6bd6b5:S001

## Summary

**Epic:** `defects-review-pane-s-test-file`
**HLD base run:** `wf-1791552370732-5sywlc`
**HLD effective hash:** `bb128977d8fb...`

This fixes the review pane's 200-test file in four ways. Its six private fake DOMs become one shared model, so every renderer is tested against the same DOM rules. Its four tree walks become one, and its two document openers become one. Checks that read git history or run the TypeScript compiler now confirm that history or compiler is present first; when it isn't, they skip with a stated reason instead of failing or passing on nothing. No production code changes.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `bodyStub`

```typescript
function bodyStub(tagName: string, id?: string, text?: string, ns?: string | null): BodyStub
```

**Parameters:**
- `tagName: string` — The element tag. It is stored as tagName and also exposed as tag for the suites that read tag.
- `id: string` _(optional)_ — The element id that querySelector('#id') matches.
- `text: string` _(optional)_ — Initial text content.
- `ns: string | null` _(optional)_ — The namespace. createElementNS passes it; createElement leaves it null.

**Returns:** `BodyStub` — The single fake element every review-pane suite builds from. It moves out of docs-review-panel.test.ts into a new module, vscode-plugin/src/chat/__tests__/fake-dom.ts.

**Errors:**
- `AssertionError` when removeChild is called with a node that is not a child, as today.
- `SyntaxError` when querySelector('#<digit-leading id>'), as in the real DOM and today's bodyStub.

**Postconditions:**
- BodyStub is the union of the six fakes' members. It has tag/tagName, ns, id, value, className, style, attrs, children (elements and text nodes), parentNode, nextSibling, firstChild, listeners as arrays, scrolled and scrollIntoView(). It has appendChild, insertBefore, removeChild, setAttribute, querySelector('#id') with a tree walk, querySelectorAll(tag), addEventListener, and writes.
- writes records every textContent, className, setAttribute ('attr:<k>'), innerHTML and outerHTML assignment, in order. These are the records the frNode, dgNode and uxNodeStub suites assert on.
- Assigning innerHTML records the write and also replaces the children by parsing the harness's 'TAG\ttext' lines, as bodyStub does today. Assigning outerHTML only records the write.
- Assigning textContent clears the children, as in the real DOM. This is now true for every suite, not only bodyStub's.
- className is independent of attrs['class'], as in all six fakes today. This is stated in the module as the one known divergence from the real DOM.
- Text nodes are { nodeType: 3, data } and are never elements.

### 2.2 `allOf`

```typescript
function allOf(n: BodyStub): BodyStub[]
```

**Parameters:**
- `n: BodyStub` — The root of a built tree.

**Returns:** `BodyStub[]` — Every element in the tree in pre-order, root first, skipping text nodes.

**Postconditions:**
- It replaces frAll, dgFlatten, allOf and uxFlatten. It moves to fake-dom.ts. Callers that passed dgFlatten an out accumulator use the return value instead.
- For trees without text nodes it returns exactly what frAll, dgFlatten and allOf return today. For trees with text nodes it returns exactly what uxFlatten returns today.

### 2.3 `openWithContent`

```typescript
async function openWithContent(content: DocsContent | string): Promise<Record<string, unknown>>
```

**Parameters:**
- `content: DocsContent | string` — The document the fake client serves. A string is markdown, served as { markdown, openQuestions: [], blocked: false } exactly as openAndGetContent does today.

**Returns:** `Promise<Record<string, unknown>>` — The docs-content payload posted for LLD-abc-s7.

**Errors:**
- `AssertionError` when No docs-content message is posted for the opened artifact, as today.

**Postconditions:**
- It replaces openAndGetContent. That function's 5 call sites (:621, :637 inside a loop, :645, :666, :689) call openWithContent(markdown); the 11 existing openWithContent call sites are unchanged. That makes 16 opener call sites in all.
- openWithContent(markdown) and openWithContent({ markdown, openQuestions: [], blocked: false }) return identical payloads.

### 2.4 `typecheckAgainstPanel`

```typescript
function typecheckAgainstPanel(t: TestContext, snippet: string): { ok: boolean; out: string } | null
```

**Parameters:**
- `t: TestContext` — The calling test, used to skip it.
- `snippet: string` — The probe source, as today.

**Returns:** `{ ok: boolean; out: string } | null` — The tsc result, or null after it has skipped the test because the compiler is not installed.

**Postconditions:**
- When node_modules/typescript/bin/tsc is missing, it calls t.skip('TypeScript compiler not installed at <path>') and returns null, and the caller returns. It no longer asserts the compiler exists.
- The never-witness check (:2549) uses the same rule through this function's tsc lookup. Once the compiler is present, every existing assertion about tsc's output is unchanged.

### 2.5 `git`

```typescript
function git(t: TestContext, need: { readonly commits?: readonly string[]; readonly window?: { readonly from: string; readonly to: string } }): ((...args: string[]) => string) | null
```

**Parameters:**
- `t: TestContext` — The calling test, used to skip it.
- `need: { commits?: readonly string[]; window?: { from: string; to: string } }` — What history the check relies on: named commits that must exist, or a window between the last commits touching two files (from, to) that must be two distinct commits with from an ancestor of to.

**Returns:** `((...args: string[]) => string) | null` — A git runner bound to the repo root, or null after it has skipped the test with the reason.

**Postconditions:**
- It replaces the local git(...) helper at :4010 and the direct execFileSync('git', …) calls at :1501, :3567 and :5648-:5655.
- It skips with a stated reason when the directory is not a git work tree, when the clone is shallow (rev-parse --is-shallow-repository), when a named commit is missing (cat-file -e), or when the window's ends are missing, equal, or out of ancestry order. A check never runs on an empty or invented window.
- When the history is present, each check runs exactly the git commands and assertions it runs today.

## 3. Data model changes

### 3.1 `vscode-plugin/src/chat/__tests__/fake-dom.ts` — new

A new non-.test.ts test module holding BodyStub/bodyStub and allOf, so the plugin glob does not run it as a test. docs-review-panel.test.ts imports them, and stubEl, node/StubNode, frNode/FrNode, dgNode/DgNode, uxNodeStub/UxNode and frAll/dgFlatten/uxFlatten are deleted. Each loader (loadRenderer, loadSections, loadFr, loadFrAnchor, loadPlace, runWebview, loadDg, loadUx and the dgPickRef documents) builds its document from bodyStub. Where a suite records the elements it creates (created, createdHtml, texts, nodes), it keeps doing so.

**Call sites:**
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts`

### 3.2 `Listener firing at :807 and :826` — invariant-change

StubNode stored one listener per type (listeners[k] = fn), so these sites fire `sel.listeners['change']!()`. BodyStub stores arrays, so the two sites fire each listener in the array. That is the real DOM's rule, and bodyStub's today.

**Call sites:**
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts`

### 3.3 `textContent assignment` — invariant-change

Assigning textContent now clears the children in every suite. Before, only bodyStub cleared them; frNode, dgNode and uxNodeStub kept them. If a test fails because of this, it shows a renderer that set textContent on an element it had already filled. That is reported as a finding, not hidden by weakening the fake.

**Call sites:**
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts`

## 4. Error paths

**Error cases**

- **Under the stricter shared fake, a renderer test fails because the renderer set textContent on an element after giving it children, which the old fake allowed.** (recoverable)
  - Detection: That suite's existing assertions fail once the shared BodyStub clears children when textContent is assigned.
  - Response: Report the failure as a finding against the renderer, with the test and element. Do not weaken the fake or the assertion. Fixing the renderer is a production change, outside this test-only issue, so it is raised as its own tracked issue.
  - User impact: A real renderer bug, previously hidden by a lenient fake, becomes visible.
- **A check runs in a source tarball or a directory that is not a git work tree.** (recoverable)
  - Detection: In git(t, need), `git rev-parse --is-inside-work-tree` throws or does not print 'true'.
  - Response: Skip the test with 'not a git work tree: <repo root>'.
  - User impact: The test reports skipped with a reason instead of a raw subprocess error.
- **A check runs in a shallow clone.** (recoverable)
  - Detection: `git rev-parse --is-shallow-repository` prints 'true'.
  - Response: Skip with 'shallow clone: history needed for <what>'. This also covers the window check, which would otherwise pass vacuously on the single grafted commit.
  - User impact: No vacuous pass and no raw failure.
- **A named commit (09e6efa, 8908338) is missing, for example after a history rewrite.** (recoverable)
  - Detection: `git cat-file -e <sha>^{commit}` exits non-zero.
  - Response: Skip with 'commit <sha> is not in this history'.
  - User impact: The test is skipped with a reason.
- **A window's ends do not form a real window: one end is missing, both are the same commit, or the start is not an ancestor of the end.** (recoverable)
  - Detection: In git(t, need), the `git log -1 --format=%H -- <file>` results are empty or equal, or `git merge-base --is-ancestor from to` exits non-zero.
  - Response: Skip with 'no build window between <from file> and <to file>: <which condition>'.
  - User impact: The window check never inspects an empty or inverted diff.
- **The TypeScript compiler is not installed where the probes look for it.** (recoverable)
  - Detection: In typecheckAgainstPanel, and in the never-witness check through the same lookup, existsSync(node_modules/typescript/bin/tsc) is false.
  - Response: Skip with 'TypeScript compiler not installed at <path>', and return null.
  - User impact: The test is skipped with a reason, where it used to fail on the assertion.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A dgFlatten caller that passed its own out accumulator. | It uses allOf's return value (spread or concatenated where it accumulated), with the same element order as before. |
| A ux tree with text nodes passed to allOf. | The text nodes are skipped, as uxFlatten did; uxAllText still reads them. |
| A suite that asserts no innerHTML writes, on a renderer that writes none. | writes has no innerHTML entry, and the parse never runs, so behaviour is unchanged. |
| openWithContent('markdown text'), where an openAndGetContent call used to be. | The fake client serves { markdown, openQuestions: [], blocked: false }, and the returned payload is identical to openAndGetContent's. |
| Every history check run in the full clone. | No skip. Each runs exactly its current git commands and assertions, and the suite stays at 200 passing. |

**Invariants to preserve**

- Every assertion in docs-review-panel.test.ts is kept. The full-clone run stays at 200 tests passing with no skips. [[c3]]
- Each existing fake-DOM behaviour a suite asserts on keeps working: write recording, the innerHTML/outerHTML trap and parse, the SVG namespace, text nodes, parent and sibling links, querySelector's digit-leading SyntaxError, removeChild's presence check, listeners, scrollIntoView, and className kept apart from attrs['class'] for the serialized snapshots. [[c1]]
- The flatten order (pre-order, root first, text nodes skipped) and the openers' returned payloads are unchanged. [[c2]]
- The shared module is a non-.test.ts file under __tests__, so the plugin glob does not run it as a test. No production file changes. [[c4]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx (cd vscode-plugin && npx tsx --test 'src/**/__tests__/*.test.ts'), as in vscode-plugin/src/chat/__tests__`

**Test levels**

- **unit** — The shared fake DOM's own contract, tested once and directly, so the guarantees every suite relies on are fixed in one place.
  - Subjects: `bodyStub`, `allOf`
  - Fixtures: `a new fake-dom.test.ts beside fake-dom.ts`
- **unit** — The environment guards, driven against real temporary directories (not a work tree; a one-commit repository, where the window ends coincide) and a missing compiler path. A recording test context stands in for t, so each skip and its reason can be asserted.
  - Subjects: `git`, `typecheckAgainstPanel`
  - Fixtures: `mkdtemp directories; `git init` plus one commit in a temporary repository`, `a recording { skip(reason) } context`
- **integration** — The whole of docs-review-panel.test.ts, rebuilt on the shared fake, flatten and opener, with every existing assertion kept. A source scan pins one opener.
  - Subjects: `openWithContent`, `bodyStub`, `allOf`
  - Fixtures: `the existing suite`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `fake-dom.test.ts: 'the shared fake DOM records writes, parses and traps innerHTML, clears children on textContent, and models namespaces, text nodes, parent and sibling links, querying and listeners'`, `docs-review-panel.test.ts: all 200 existing tests pass unchanged in assertion on the shared fake (full clone)` |
| `ac2` | `fake-dom.test.ts: 'allOf walks pre-order, root first, and skips text nodes'` |
| `ac3` | `docs-review-panel.test.ts: 'there is one document opener, and a markdown string and the same markdown as DocsContent open to identical payloads'. It is a source scan asserting the file declares no openAndGetContent and exactly one openWithContent, plus a direct equality check of the two payloads. It fails while openAndGetContent still exists.`, `docs-review-panel.test.ts: the 16 opener call sites pass through openWithContent (the existing suite)` |
| `ac4` | `docs-review-panel.test.ts: 'history and compiler checks skip with a stated reason when what they need is missing, and never run on an empty window'`, `Manual: a git clone --depth 1 run of docs-review-panel.test.ts reports 0 failures, with the history-dependent tests skipped with reasons and none vacuously passing` |

## 6. Migration

**State before:** docs-review-panel.test.ts has 200 tests and 5,740 lines, and no file imports from it (c1). It carries:
- six private fake-DOM builders: stubEl, node, frNode, bodyStub, dgNode and uxNodeStub (c1);
- four pre-order flatten helpers and two identical document openers (c2);
- git checks that call git unguarded (:1501, :3567, the window helper at :4010/:4023-:4030, and :5648-:5655);
- tsc probes that assert the compiler exists (:2449, :2549).
In a shallow clone 197 tests pass and 3 fail, and the second 't6' passes vacuously (c3). The full clone passes 200/200.

**State after:** A new non-test module, vscode-plugin/src/chat/__tests__/fake-dom.ts, holds the one fake element (bodyStub/BodyStub) and the one flatten (allOf). The test file imports both and keeps one opener, openWithContent(content | markdown). Its git and tsc checks run through git(t, need) and typecheckAgainstPanel(t, …), which skip with a stated reason when the history or compiler they need is missing. The full clone still passes all 200 existing tests, plus the new fake-DOM and environment-guard tests. A shallow clone reports no failures, with the history-dependent tests skipped and reasons given.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add fake-dom.ts with the superset bodyStub/BodyStub and allOf, and its own contract tests in fake-dom.test.ts. The existing test file is not changed yet. — ↩ rollbackable
2. Repoint each suite's document from its private builder (stubEl, node, frNode, dgNode, uxNodeStub, and the local bodyStub) to the shared bodyStub, one suite at a time. Delete each private builder once nothing uses it. Fire the :807/:826 listeners through the listener array. Run the file after each suite. — ↩ rollbackable
3. Replace frAll, dgFlatten and uxFlatten with the shared allOf. dgFlatten accumulator callers switch to the return value. — ↩ rollbackable
4. Fold openAndGetContent into openWithContent(content | markdown) and repoint its 5 call sites. The 11 existing openWithContent call sites are unchanged, 16 in all. — ↩ rollbackable
5. Add the git(t, need) guard and route the :1501, :3567, :4023-:4030 and :5648-:5655 checks through it. Change typecheckAgainstPanel and the never-witness probe to skip with a reason when tsc is missing. Add the environment-guard tests, and verify once in a --depth 1 clone. — ↩ rollbackable

**Backward compat:** No public API is affected. Every change is in the plugin's test tree. No production module, IPC payload or package manifest changes, and no file outside docs-review-panel.test.ts imports the helpers that move.

## 7. Alternatives considered

### 7.1 a1: One faithful superset fake DOM in a shared module — **CHOSEN**

A single FakeElement/FakeText model and a recording fakeDocument in a new __tests__/fake-dom.ts. It does the union of today's behaviours, adopts the real-DOM rule that textContent clears children, and leaves className independent of the class attribute.

A new test module, vscode-plugin/src/chat/__tests__/fake-dom.ts, exports a FakeElement with these fields:
- tag and tagName;
- ns, which is null for createElement and the namespace for createElementNS;
- id, value, className, style, attrs, children, parentNode, nextSibling, firstChild;
- listeners as arrays;
- scrolled and scrollIntoView;
- appendChild, insertBefore, and a removeChild that asserts the child is present;
- setAttribute;
- querySelector('#id'), which throws SyntaxError on a digit-leading id;
- querySelectorAll by tag;
- `writes`, which records every textContent, className, attribute, innerHTML and outerHTML write.
The innerHTML setter records the write and also replaces the children by parsing the harness's TAG\ttext lines. The two never conflict: suites that trap innerHTML assert there are no such writes, and the webview suites rely on the parse. Setting textContent clears the children, as the real DOM does. className stays independent of attrs['class'], as all six fakes keep it today, and the module states this as a known divergence. FakeText is {nodeType: 3, data}.
fakeDocument() records what it creates (created, createdNS, texts and nodes) through createElement, createElementNS and createTextNode, and every loader is built on it. The module also exports flatten(n), a pre-order walk that skips text nodes and replaces frAll, dgFlatten, allOf and uxFlatten, and fire(el, type) to run listeners. In the test file, openDoc(content: string | DocsContent) replaces both openers. requireHistory(t, need) and requireTsc(t) helpers come before every git and tsc use.

### 7.2 a2: Shared core with per-suite behaviour profiles

One base builder with option flags (innerHTML: 'trap' | 'parse', textContentClears, record) that reproduces each of today's fakes exactly.

fake-dom.ts exports makeElement(tag, profile), where the profile switches the innerHTML behaviour, whether textContent clears the children, and whether writes are recorded. Each suite passes the profile that matches its old fake, so every suite keeps its current behaviour bit for bit. The flatten, opener and environment guards are as in a1.

**Rejected because:** It is the safest option, but i1 is only partial: the flags preserve the divergence the issue exists to remove.

### 7.3 a3: A real DOM implementation as a devDependency

Replace the fakes with happy-dom or jsdom.

Add a DOM library as a plugin devDependency and evaluate the renderer sources against its document. Write recording and the innerHTML trap would be added through proxies or MutationObservers.

**Rejected because:** It violates i2 and i5.

## 8. References

- **[[c1]]** `analyze-bundle` `s1: vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts, the six fake-DOM builders and the behaviours each suite asserts on`
- **[[c2]]** `analyze-bundle` `s1: docs-review-panel.test.ts, the four flatten helpers and the two document openers`
- **[[c3]]** `analyze-bundle` `s1: docs-review-panel.test.ts, the git-history and tsc checks; the shallow-clone run (197 pass, 3 fail, one vacuous pass) and the full clone (200/200)`
- **[[c4]]** `analyze-bundle` `s1: shared test scaffolding convention, non-.test.ts modules under __tests__ (delivery/__tests__/board-fixtures.ts, board-webview-harness.ts)`
- **[[c5]]** `prior-artifact` `ISSUE-3b6bd6b5fa3c30d1 (docs/standalone/defects-review-pane-s-test-file-E202610093b6bd6b5/ISSUE.md), the approved defect record this LLD fixes`

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**2 do not hold · 0 could not be verified · 5 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-09T13:31:20.869Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| current-behaviour | MED | openAndGetContent has 6 callers, and the two openers together have 18 call sites (LLD §2.3, migration step 4, ac3 mapping). | A grep of docs-review-panel.test.ts finds openAndGetContent( called at :621, :637 (once, inside a for loop), :645, :666 and :689, which is 5 callers, not 6. openWithContent( is called at :976, :990, :2316, :2353, :2367, :3755, :3796, :3814, :3832, :3856 and :3881, which is 11. The total is 16, not 18. The merge itself is still right, but the counts the ac3 proof relies on are wrong. [files: vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts] | Correct the counts to 5 openAndGetContent callers and 16 opener call sites in total, in §2.3, migration step 4 and the ac3 mapping. |
| tests | MED | Each acceptance criterion has a test that would fail without the fix. In particular, ac3 (one opener) is proven by a test. | ac4 has a real failing-first test: the recording-context guard tests and 'history and compiler checks skip with a stated reason…' need git(t, need) and typecheckAgainstPanel(t, …), which do not exist yet. ac1 and ac2 have new fake-dom.test.ts contract tests. The ac3 entry is 'the 18 former … call sites pass through the one openWithContent'. That is the existing suite, which passes today with two openers, so nothing would fail if openAndGetContent were left in place. The figure 18 is also wrong; there are 16 call sites (see current-behaviour). [files: vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts] | Give ac3 a check that fails without the fix: for example, a source scan asserting that the file declares exactly one opener (no `function openAndGetContent`), plus a direct test that openWithContent(string) and openWithContent({markdown, openQuestions: [], blocked: false}) return identical payloads. |

#### Could not verify (does not block)

_None._
