<!-- insrc:artifact LLD-238917216d8fd532-s3 -->

# LLD: E2026091923891721:S003

**Epic:** `ide-artifact-review-panel-jetbrains-plugin`
**HLD base run:** `wf-1789799576767-kl7v1b`
**HLD effective hash:** `c93cb4358ff4...`

## HLD context

**Framework:** Thin three-layer review surface over existing daemon capability; reasoning stays daemon-side (k1), the plugin only renders and transports. Phase B adds inline PR-style anchored comment threads.
**Rollout phase:** Phase B — Inline annotation + submit as open-question resolutions
**Owns:** `sc3` (ReviewComment)
**Consumes:** `sc2` (ArtifactReviewView)

## Contract details

**Surface level:** internal-shared

### `CommentBuffer`

```typescript
class CommentBuffer { fun add(anchor: CommentAnchor, body: String): ReviewComment; fun edit(id: String, body: String): Boolean; fun remove(id: String): Boolean; fun snapshot(): List<ReviewComment>; fun clear() }
```

**Parameters:**
- `anchor: CommentAnchor` — The captured target of a new comment (sectionPath/quote/openQuestionId) from the JS layer.
- `body: String` — The reviewer's comment text (add) or replacement text (edit).
- `id: String` — The client-generated ReviewComment id addressed by edit/remove.

**Returns:** `ReviewComment | Boolean | List<ReviewComment>` — The pure Kotlin-owned un-submitted buffer (source of truth). add mints a client id + appends; edit/remove return whether the id was found; snapshot returns an immutable copy s4 reads at submit. Presentation-only — no persistence, no resolution reasoning (lc1/k1).

**Errors:**
- `(none — total)` when edit/remove of an unknown id return false (not an exception); the buffer never throws on normal ops.

**Preconditions:**
- Holds only un-submitted comments; cleared or handed to s4 at submit.

**Postconditions:**
- Mutation is in-memory only; the artifact and its .md/.json are never touched (k5).

### `ArtifactCommentLayer`

```typescript
class ArtifactCommentLayer(buffer: CommentBuffer, browser: JBCefBrowser, parentDisposable: Disposable) { fun install(); fun onContentLoaded(view: ArtifactReviewViewDto); fun renderThreads() }
```

**Parameters:**
- `buffer: CommentBuffer` — The Kotlin source-of-truth buffer this layer mutates from JS events and re-renders from.
- `browser: JBCefBrowser` — The S002 content-view browser whose page hosts the comment overlay (reused, not created).
- `parentDisposable: Disposable` — The tool-window disposable; the JBCefJSQuery objects register against it.

**Returns:** `Unit` — The s3-owned comment layer hosted inside the S002 ArtifactContentPane: installs the JBCefJSQuery bridge + injects the comment JS, folds JS add/edit/remove events into the buffer, and re-pushes the current comment set to render anchored threads. Re-attaches on each content (re-)load so un-submitted comments survive a re-render.

**Errors:**
- `(none escaping)` when a malformed JS payload is ignored (logged); the bridge never throws into the EDT.

**Preconditions:**
- The JCEF surface is active (JBCefApp.isSupported()); in the native fallback the comment layer is inert (annotation is a JCEF-only affordance).

**Postconditions:**
- JBCefJSQuery handlers are disposed with parentDisposable; no state persists past the panel.

### `JBCefJSQuery`

```typescript
JBCefJSQuery.create(browser: JBCefBrowserBase): JBCefJSQuery; fun addHandler(h: (String) -> JBCefJSQuery.Response?); fun inject(jsResultCallback: String): String
```

**Parameters:**
- `browser: JBCefBrowserBase` — The S002 content browser the query is bound to.
- `h: (String) -> JBCefJSQuery.Response?` — The Kotlin handler receiving the JSON comment-op payload from JS.

**Returns:** `JBCefJSQuery` — The external IntelliJ-Platform JS<->Kotlin bridge (consumed): JS calls the injected function with a serialized comment op; the Kotlin handler folds it into the CommentBuffer. In-process only (no socket/cloud).

**Errors:**
- `(platform)` when create throws if the browser is disposed — guarded by the S002 disposed/isDisposed checks.

**Preconditions:**
- Created at page-build time, before loadHTML injects the comment JS.

**Postconditions:**
- Disposed with the browser/parentDisposable.

### `ArtifactContentPane`

```typescript
internal class ArtifactContentPane(project, gateway, parentDisposable) { /* S002 + s3: hosts ArtifactCommentLayer, installs the bridge in composeHtml/render */ }
```

**Parameters:**
- `view: ArtifactReviewViewDto` — The sc2 view already rendered by S002; s3 reads its openQuestions[].id for open-question-targeted anchors and overlays the comment layer.

**Returns:** `Unit` — The S002 pane (extended, not re-designed): composeHtml additionally injects the comment JS + the JBCefJSQuery inject() expression; render() wires the ArtifactCommentLayer to the freshly loaded page. The content fetch (s2) and pending list (s1) are untouched.

**Preconditions:**
- Reuses the S002 JCEF/native surface + bundled renderer; annotation is active only on the JCEF card.

**Postconditions:**
- No change to the sc2 fetch/render contract; the comment overlay is additive.

### `markdown-renderer.js`

```typescript
// bundled renderer (S002) extended: heading render emits stable ids + records a heading path for sectionPath anchoring
```

**Returns:** `(HTML)` — The S002 bundled renderer, extended additively: ATX headings now emit a stable id (slug + ordinal) and expose the heading path so the comment JS can compute CommentAnchor.sectionPath. Additive; escaping/link/CSP rules unchanged (no CDN, read-only).

**Preconditions:**
- Runs inside the JCEF page as today.

**Postconditions:**
- renderedMarkdown remains the source of truth; ids are presentation hooks, not a second copy (k5).

## Data model changes

### `CommentAnchor` — new

sc3 anchor model as a Kotlin data class: { sectionPath: String?; quote: String?; openQuestionId: String? }. sectionPath = heading path (from the renderer ids); quote = selected text; openQuestionId = the sc2 openQuestions[].id when targeting a question. All optional.

```
+ data class CommentAnchor(sectionPath: String?, quote: String?, openQuestionId: String?)
```

**Call sites:**
- `jetbrains-plugin/.../review/ (ArtifactCommentLayer + CommentBuffer)`
- `consumed by s4 at submit`

### `ReviewComment` — new

sc3 comment model as a Kotlin data class: { id: String (client-generated until submitted); anchor: CommentAnchor; body: String }.

```
+ data class ReviewComment(id: String, anchor: CommentAnchor, body: String)
```

**Call sites:**
- `jetbrains-plugin/.../review/ (CommentBuffer.snapshot)`
- `consumed by s4`

### `CommentBuffer` — new

The pure Kotlin-owned un-submitted buffer keyed by id, with add/edit/remove/snapshot/clear. Source of truth; survives a page re-render (the JS overlay re-renders FROM it). Presentation-only (lc1).

```
+ class CommentBuffer { add; edit; remove; snapshot; clear }
```

**Call sites:**
- `jetbrains-plugin/.../review/ArtifactCommentLayer`
- `read by s4's submit`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | S003 owns sc3 and realizes its comment MODEL: ReviewComment + CommentAnchor as Kotlin data classes, plus the pure CommentBuffer and the ArtifactCommentLayer that captures anchors via the JBCefJSQuery bridge and renders threads. The sc3 sketch's daemon WRITE portion (ResolveCommentRequest/ResolveCommentResult + the 'workflow.resolveComment' handler) is built by S004 (which consumes sc3); S003 defines the comment objects s4 submits and performs NO resolution reasoning (lc1/k1). |
| `sc2` | consumes | The comment layer overlays the sc2 content already rendered by S002: it anchors into that DOM and reads view.openQuestions[].id to set CommentAnchor.openQuestionId. It does NOT re-fetch (s2) or alter the sc2 contract; the small heading-id renderer hook is additive, not a re-design. |

## Error paths

### Error cases

- **A malformed comment-op payload arrives over the JBCefJSQuery bridge (bad JSON, missing op/anchor/body).** (recoverable)
  - Detection: The Kotlin JBCefJSQuery handler JSON-parses the payload and validates op ∈ {add,edit,remove} + required fields; a parse failure or missing field is caught.
  - Response: Ignore the op (log at warn) and return a no-op Response; the buffer is unchanged and the current set is re-pushed to JS to re-sync.
  - User impact: The stray event does nothing; existing comments intact. No crash into the EDT.
- **An edit/remove references a comment id not in the buffer (stale JS after a re-render, or a double-remove).** (recoverable)
  - Detection: CommentBuffer.edit/remove returns false (id not found).
  - Response: Treat as a no-op and re-push the authoritative buffer to JS so the overlay re-syncs.
  - User impact: The overlay converges on the real state; no phantom edit/remove.
- **The JBCefBrowser is disposed while a comment op / thread re-render is in flight (tool-window unload race, as in S002).** (recoverable)
  - Detection: The S002 disposed flag + browser.isDisposed guard is checked before JBCefJSQuery.create / executeJavaScript.
  - Response: Skip installing the bridge / skip the re-render (try/catch); no exception escapes.
  - User impact: The panel tears down cleanly; no AlreadyDisposedException.
- **An 'add' arrives with an empty anchor (no sectionPath, no quote, no openQuestionId) and/or an empty body.** (recoverable)
  - Detection: The JS pre-checks a non-empty selection/target before posting; the Kotlin handler also rejects an all-null anchor or blank body.
  - Response: Do not add a ReviewComment; surface a subtle in-page hint; buffer unchanged.
  - User impact: No un-anchorable/empty comment is created (keeps ac1/ac2 meaningful).

### Edge cases

| Input | Expected |
| :--- | :--- |
| JCEF is unavailable so the S002 native-editor fallback is showing. | Content still readable (s2 fallback), but inline annotation is inert — anchoring into a plain read-only text area is unsupported; the affordance is JCEF-only. No crash (documented limitation, consistent with k6). |
| A comment targets a rendered open-question marker. | CommentAnchor.openQuestionId is set (from sc2 openQuestions[].id); the thread is anchored to that question and distinctly associated (ac2), ready for s4. |
| Several comments are added to the same section. | Each is a distinct ReviewComment (distinct client id + its own quote) as its own thread — distinct association holds (ac2). |
| The page re-renders (poll refresh / re-open) while un-submitted comments exist. | The Kotlin CommentBuffer survives; onContentLoaded re-pushes them and the overlay re-anchors by sectionPath/quote (ac3). An anchor that no longer resolves shows as 'unanchored', never silently dropped. |
| The reviewer switches to a DIFFERENT pending artifact. | Comments are per-artifact; the buffer is scoped to the open artifactId (no cross-artifact bleed). |

### Invariants to preserve

- Un-submitted annotation state is presentation-only: the CommentBuffer holds comments in memory, performs NO approval/resolution reasoning, and nothing is persisted until s4's submit (lc1/k1). [[c1]]
- A single artifact remains the single source of truth: comments are a SEPARATE annotation layer over the rendered content; the additive heading-id hook is a presentation aid — no divergent second copy (k5). [[c5]]
- The one plugin artifact keeps loading across all four IDEs off the shared platform module; the annotation surface degrades gracefully where the embedded browser is unavailable (JCEF-only affordance; native fallback stays readable) (k6). [[c6]]
- No cloud/REST path and no daemon write is opened by S003: the JS<->Kotlin bridge is entirely in-process, and the buffer is not submitted here (the daemon write is s4) (k2). [[c4]]

## Test strategy

**Test framework:** `Plugin: JUnit5 (pure Kotlin units — CommentBuffer + the comment-op applier + the anchor model) via ./gradlew test on JDK21, mirroring S001/S002. No daemon test (S003 is plugin-only). The JS layer (heading-id hook, window.getSelection capture, JBCefJSQuery wiring, thread rendering) has no JVM harness — exercised manually + backstopped by the pure Kotlin core that owns all mutation; recorded as the known JS-untested residual (as in S002). No live socket, no GitHub CI.`

### Test levels

- **unit** — Plugin: the pure CommentBuffer — add/edit/remove/snapshot/clear, headless (no JCEF).
  - Subjects: `CommentBuffer.add mints a client id, appends, and returns the ReviewComment carrying the anchor+body (ac1)`, `CommentBuffer.edit(known id) updates the body and is reflected in snapshot; edit(unknown id) returns false and changes nothing (ac3)`, `CommentBuffer.remove(known id) drops it from snapshot; remove(unknown id) returns false (ac3)`, `snapshot() returns an immutable copy in insertion order; clear() empties it`, `two adds to the same sectionPath get DISTINCT ids and each retains its own quote (ac2)`
- **unit** — Plugin: the pure comment-op applier (the JBCefJSQuery handler's core), headless.
  - Subjects: `applyCommentOp(add) with a valid anchor+body -> buffer gains the anchored comment (ac1)`, `applyCommentOp(edit/remove) by id -> reflected in snapshot (ac3)`, `malformed JSON / unknown op / missing fields -> no-op (buffer unchanged), no throw`, `an add with an all-null anchor OR a blank body -> rejected`, `an add whose anchor carries openQuestionId -> distinctly associated (ac2)`
  - Fixtures: `canned JSON comment-op payloads (add/edit/remove/malformed/empty)`
- **unit** — Plugin: the ReviewComment/CommentAnchor model + per-artifact scoping.
  - Subjects: `CommentAnchor supports section-only, quote-only, openQuestion-only, and combined anchors (all optional)`, `the buffer is scoped per artifactId so switching artifacts shows only that artifact's comments`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `CommentBuffer.add returns a ReviewComment carrying the anchor+body`, `applyCommentOp(add) with a valid anchor -> buffer gains the anchored comment` |
| `ac2` | `two adds to the same sectionPath get distinct ids + own quotes`, `an openQuestionId-anchored add is distinctly associated in snapshot` |
| `ac3` | `CommentBuffer.edit(known) reflected in snapshot; edit(unknown) -> false, no change`, `CommentBuffer.remove(known) drops it; applyCommentOp(edit/remove) reflected before any submit` |

## Migration

**State before:** S002 (main 505a95f) ships the JCEF content view: ArtifactContentPane creates a JBCefBrowser and composeHtml inlines the bundled markdown-renderer.js + a bootstrap and loadHTML()s the rendered artifact into CARD_JCEF, with a read-only native fallback. The renderer emits headings WITHOUT ids. No comment/annotation code, no JBCefJSQuery use, no daemon comment IPC. renderedMarkdown is the single source of truth; the sc2 view carries openQuestions[].id.

**State after:** The plugin adds the sc3 comment MODEL + a pure CommentBuffer + an ArtifactCommentLayer hosted in ArtifactContentPane that installs a JBCefJSQuery bridge, injects a comment JS layer, folds add/edit/remove into the buffer, and re-renders anchored threads from the buffer. The bundled renderer is additively extended to emit heading ids. No daemon change; the buffer is presentation-only (submit is s4). All S002 behaviour unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the sc3 model (ReviewComment, CommentAnchor) + the pure CommentBuffer (add/edit/remove/snapshot/clear). Net-new. — ↩ rollbackable
2. Add the pure comment-op applier (parse {op, comment} JSON -> a CommentBuffer mutation, rejecting malformed/empty). Net-new; the JBCefJSQuery handler delegates to it. — ↩ rollbackable
3. Additively extend markdown-renderer.js: headings emit a stable id (slug + ordinal) + expose the heading path. Additive; escaping/link/CSP unchanged. — ↩ rollbackable
4. Add the comment JS layer (bundled resource): selection/marker 'add comment' affordance, anchor capture, thread rendering from the pushed set, and the injected JBCefJSQuery call for add/edit/remove. — ↩ rollbackable
5. Wire ArtifactCommentLayer into ArtifactContentPane: create the JBCefJSQuery(ies) at page-build time (guarded by disposed/isDisposed), install on the JCEF card only, and re-attach + re-push the buffer on each content (re-)load. Native fallback untouched. — ↩ rollbackable
6. Add the plugin JUnit tests (CommentBuffer, the comment-op applier, the anchor model + per-artifact scoping). Verify locally via ./gradlew test JDK21. — ↩ rollbackable

**Backward compat:** Fully backward compatible and purely additive: no existing public API changes. ArtifactContentPane's sc2 fetch/render contract is unchanged (the comment layer overlays it); the renderer change is additive (heading ids only) with escaping/link/CSP intact; no daemon IPC is added or altered (the submit write is s4). S001 + S002 behave exactly as before; a reviewer on a JBR-without-JCEF still reads via the native fallback (annotation inert). No cross-repo/IPC contract touched.

## Alternatives considered

### a1: Kotlin-owned buffer; JS captures anchors + renders threads via JBCefJSQuery; small additive renderer hook for stable section anchors — **CHOSEN**

The authoritative un-submitted ReviewComment buffer lives Kotlin-side (testable, s4-readable, survives re-render); the JCEF JS layer captures the anchor and posts add/edit/remove ReviewComment JSON through JBCefJSQuery; Kotlin updates the buffer and re-pushes state to render threads.

S003 defines the sc3 model as Kotlin types + a pure CommentBuffer (source of truth). ArtifactContentPane creates JBCefJSQuery handler(s) on the JBCefBrowser (disposed with it); composeHtml injects a comment JS layer that captures the anchor (sectionPath via a small additive renderer hook giving heading ids; quote = selected text; openQuestionId on a marker click) and posts a JSON op through the injected query. Kotlin folds it into the CommentBuffer and re-pushes the set to JS. Presentation-only (lc1/k1); s4 reads snapshot() at submit.

### a2: JS owns the entire buffer; Kotlin pulls the ReviewComment[] at submit

The comment model + un-submitted buffer live entirely in the JCEF page's JS; Kotlin only executeJavaScript-pulls the ReviewComment[] at submit.

All add/edit/remove + anchoring + the buffer live in the page's JS; Kotlin holds no comment state; at submit s4 serializes the buffer out. sc3 exists only as a JSON shape.

**Rejected because:** Loses decisively on ac3 (violates — un-submitted state is lost on any re-render) and is weak on sc3/k1 (JS-only model, untestable headlessly). Simpler anchoring does not offset losing the durability + testability of a Kotlin-owned buffer.

### a3: Kotlin-owned buffer; anchors are quote+offset only, ZERO change to the s2 renderer

Same Kotlin-owned buffer as a1, but anchors are captured purely from the existing DOM (selected text + a computed section index) with NO additive hook in the renderer.

Kotlin holds the CommentBuffer (as a1). The JS derives CommentAnchor at capture time by walking the existing DOM (nearest preceding heading text -> sectionPath; selected text -> quote) without renderer ids. openQuestionId on a marker click. No touch to markdown-renderer.js.

**Rejected because:** Matches a1 except ac2 (partial): avoiding the renderer hook makes anchors heuristic (heading-text based), so multiple comments in the same/duplicate section are harder to tell apart and re-locate. The saved s2-touch is not worth the weaker distinct-association guarantee; the a1 hook is tiny and additive.

## Open questions

- Inline annotation is a JCEF-only affordance: on a JBR-without-JCEF the S002 native-editor fallback stays readable but cannot anchor comments. Whether the native fallback should offer a coarser whole-artifact (un-anchored) comment affordance, or annotation stays JCEF-only, is deferred — either keeps lc1/k6; flagged for the plan/build.

## Resolved questions

- `q0faa8535` — Inline annotation is a JCEF-only affordance: on a JBR-without-JCEF the S002 native-editor fallback stays readable but cannot anchor comments. Whether the native fallback should offer a coarser whole-artifact (un-anchored) comment affordance, or annotation stays JCEF-only, is deferred — either keeps lc1/k6; flagged for the plan/build.
  - **resolved**: JCEF-only annotation, native fallback read-only — User's decision (took the recommended default). Inline comments ship only in the JCEF view; the S002 native-editor fallback stays read-only and shows a one-line notice that annotation needs a JCEF-capable JBR. Smallest s3 surface (one authoring path, one anchor model). The sc3 CommentAnchor already has all fields optional, so a future coarse un-anchored native affordance remains a purely additive follow-up with no contract change. _(2026-09-19T11:19:00.184Z)_

## Citations

- **[[c1]]** `prior-artifact` `HLD k1 / s3 lc1 (thin orchestrator; un-submitted annotation is presentation-only, no approval/resolution reasoning)`
- **[[c2]]** `prior-artifact` `HLD sc2 assumption / S002 openQuestions[].id feeding CommentAnchor.openQuestionId`
- **[[c3]]** `prior-artifact` `HLD k3 (approve path) — sc2 approvable assumption (consumed context, not built here)`
- **[[c4]]** `prior-artifact` `HLD k2 (all daemon access over the local Unix socket; the plugin opens no cloud/REST) — s3 opens no daemon write`
- **[[c5]]** `prior-artifact` `HLD k5 (single source of truth; render the artifact's content, never a divergent second copy) — comments are a separate annotation layer`
- **[[c6]]** `prior-artifact` `HLD k6 (one artifact loads across four IDEs; degrade where the embedded browser is unavailable) — annotation is a JCEF-only affordance`
- **[[c7]]** `analyze-bundle` `external-platform-contract (s1): JBCefJSQuery is the bundled IntelliJ JS<->Kotlin bridge (create/addHandler/inject), net-new in the plugin`
- **[[c8]]** `prior-artifact` `S002 (main 505a95f): ArtifactContentPane/JBCefBrowser/composeHtml/loadHTML + the bundled markdown-renderer.js (headings emit no ids) + ArtifactReviewViewDto — the surface s3 extends`
