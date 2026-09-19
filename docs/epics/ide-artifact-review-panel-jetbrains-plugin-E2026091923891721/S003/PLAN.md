<!-- insrc:artifact PLAN-238917216d8fd532-s3 -->

# Plan: E2026091923891721:S003

**Epic:** `ide-artifact-review-panel-jetbrains-plugin`
**LLD run:** `wf-1789815661984-ov4xx0`
**LLD effective hash:** `c93cb4358ff4...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Plugin: sc3 model (ReviewComment/CommentAnchor) + pure CommentBuffer | S | — | unit: CommentBuffer.add mints a client id, appends, and returns the ReviewComment carrying the anchor+body (ac1); unit: CommentBuffer.edit(known id) updates the body and is reflected in snapshot; edit(unknown id) returns false and changes nothing (ac3); unit: CommentBuffer.remove(known id) drops it from snapshot; remove(unknown id) returns false (ac3); unit: snapshot() returns an immutable copy in insertion order; clear() empties it; unit: two adds to the same sectionPath get DISTINCT ids and each retains its own quote (ac2) | [[c1]] [[c2]] |
| 2 | **`t2`** Plugin: pure comment-op applier (JSON op -> CommentBuffer mutation) | M | `t1` | unit: applyCommentOp(add) with a valid anchor+body -> buffer gains the anchored comment (ac1); unit: applyCommentOp(edit/remove) by id -> reflected in snapshot (ac3); unit: malformed JSON / unknown op / missing fields -> no-op (buffer unchanged), no throw; unit: an add with an all-null anchor OR a blank body -> rejected; unit: an add whose anchor carries openQuestionId -> distinctly associated (ac2) | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Plugin: additive heading-id hook in the bundled markdown-renderer.js | S | — | unit: renderer resource: the bundled markdown-renderer.js still ships in the built resources / jar and carries no http(s)/CDN reference after the heading-id addition | [[c4]] |
| 4 | **`t4`** Plugin: the comment JS layer (bundled resource) | M | `t3` | unit: comment JS resource: present on the classpath / in the built resources and referenced by a local URL only (no http(s)/CDN string) | [[c1]] [[c2]] [[c4]] |
| 5 | **`t5`** Plugin: wire ArtifactCommentLayer into ArtifactContentPane (JBCefJSQuery bridge + native-fallback notice) | L | `t1`, `t2`, `t4` | unit: per-artifact scoping: the buffer/layer is keyed to the open artifactId so switching artifacts shows only that artifact's comments (the Kotlin-side scoping check; JBCefJSQuery wiring itself is manual-verified) | [[c1]] [[c2]] [[c3]] [[c4]] |
| 6 | **`t6`** Plugin tests: CommentBuffer + comment-op applier + anchor model | M | `t1`, `t2` | unit: Aggregate: CommentBuffer + comment-op applier + anchor model + per-artifact scoping subjects run green via ./gradlew test JDK21; unit: CommentAnchor supports section-only, quote-only, openQuestion-only, and combined anchors (all optional) | [[c5]] [[c1]] [[c2]] |

### E2026091923891721:S003:T001 — Plugin: sc3 model (ReviewComment/CommentAnchor) + pure CommentBuffer

Add the sc3 Kotlin data classes ReviewComment(id, anchor, body) + CommentAnchor(sectionPath?, quote?, openQuestionId?) and the pure Kotlin-owned CommentBuffer (add mints a client id + appends and returns the ReviewComment; edit(id,body)->Boolean; remove(id)->Boolean; snapshot()->immutable List in insertion order; clear()). Source of truth, headlessly testable. Presentation-only (lc1/k1) — in-memory only, no persistence, no daemon call.

**Acceptance checks:**
- ReviewComment/CommentAnchor compile with all anchor fields optional; add mints a client id, appends, returns the ReviewComment carrying anchor+body.
- edit(known)->true + reflected in snapshot; edit(unknown)->false, no change; remove(known) drops it; remove(unknown)->false.
- snapshot() is an immutable copy in insertion order; clear() empties it; two adds to the same sectionPath get distinct ids.
- No file/daemon access; compiles under JDK21/Gradle 8.10.

### E2026091923891721:S003:T002 — Plugin: pure comment-op applier (JSON op -> CommentBuffer mutation)

Add the pure applyCommentOp(buffer, payloadJson) that the JBCefJSQuery handler will delegate to: parse a { op: add|edit|remove, comment } JSON payload and fold it into the CommentBuffer, rejecting malformed JSON / unknown op / missing fields (no-op, no throw) and an add with an all-null anchor OR a blank body. Headlessly testable; the JS<->Kotlin boundary logic lives here in Kotlin, not JS.

**Acceptance checks:**
- applyCommentOp(add) with a valid anchor+body -> the buffer gains the anchored comment; (edit/remove) by id -> reflected in snapshot.
- malformed JSON / unknown op / missing fields -> no-op (buffer unchanged), never throws.
- an add with an all-null anchor OR a blank body -> rejected (no comment added).
- an add whose anchor carries openQuestionId -> the comment is distinctly associated.

### E2026091923891721:S003:T003 — Plugin: additive heading-id hook in the bundled markdown-renderer.js

Additively extend the S002 bundled markdown-renderer.js so ATX headings emit a stable id (slug + ordinal) and expose the heading path, enabling CommentAnchor.sectionPath. Purely additive to the render output; the HTML-escaping, link-scheme filter, and CSP (no CDN, read-only) rules are unchanged.

**Acceptance checks:**
- Headings render with a stable, unique id (slug + ordinal for duplicates); a heading-path helper is available to the comment JS.
- No change to escaping / link-scheme / CSP behavior; still a local resource (no CDN).
- The renderer still ships in the plugin jar; S002 rendering is unaffected.

### E2026091923891721:S003:T004 — Plugin: the comment JS layer (bundled resource)

Add the comment JS layer as a bundled local resource loaded into the JCEF page alongside the renderer: a selection / open-question-marker 'add comment' affordance, anchor capture (sectionPath from the t3 heading ids, quote from window.getSelection, openQuestionId on a marker click), thread rendering from a pushed comment set, and the injected JBCefJSQuery call posting { op, comment } for add/edit/remove. Pre-checks a non-empty selection/target before posting. No network; read-only over the rendered content. The load-bearing op validation lives in the pure t2 applier (Kotlin); this JS only captures + posts + renders.

**Acceptance checks:**
- The JS resource is bundled locally (no CDN/http reference) and loaded into the JCEF page by composeHtml.
- Selection / open-question-marker -> an 'add comment' affordance that captures the anchor and posts { op:add, comment } via the injected query; edit/remove post their ops.
- Threads render from a pushed comment set (Kotlin is the source of truth); an empty selection/body is pre-checked and not posted.

### E2026091923891721:S003:T005 — Plugin: wire ArtifactCommentLayer into ArtifactContentPane (JBCefJSQuery bridge + native-fallback notice)

Add ArtifactCommentLayer(buffer, browser, parentDisposable) hosted in the S002 ArtifactContentPane: create the JBCefJSQuery(ies) at page-build time (guarded by the S002 @Volatile disposed flag + browser.isDisposed — the proven S002 pattern), addHandler delegating to the pure t2 applyCommentOp, inject the query into the page (composeHtml), and on each content (re-)load re-attach + re-push the buffer so un-submitted comments survive a re-render; per-artifact buffer scoping. A malformed payload is ignored (logged), never throwing into the EDT. On the native-editor fallback the layer is inert and the pane shows a one-line 'annotation requires a JCEF-capable JBR' notice (JCEF-only, resolved). No content re-fetch (s2), no daemon write (s4), no approve wiring (s5). Only the JBCefJSQuery+inject+re-render slice is manual-verified; validation + mutation are the tested t2 core.

**Acceptance checks:**
- Selecting a part / an open-question marker in the JCEF view adds an anchored comment thread (ac1); several comments are each distinctly associated (ac2).
- Edit/remove of an un-submitted comment is reflected before any submit; a page re-render (poll refresh/re-open) preserves the comments from the Kotlin buffer (ac3).
- JBCefJSQuery create/inject/re-render are guarded by disposed/isDisposed + try/catch (no AlreadyDisposedException); handlers disposed with parentDisposable.
- On the native fallback annotation is inert with a one-line notice; no daemon write / approve wiring is added; S001 list + S002 fetch/render are untouched.

### E2026091923891721:S003:T006 — Plugin tests: CommentBuffer + comment-op applier + anchor model

Add plugin JUnit tests (mirroring ArtifactContentTest) for CommentBuffer (add/edit/remove/snapshot/clear, distinct same-section ids), the comment-op applier (add/edit/remove reflected; malformed/unknown/missing -> no-op; empty anchor/blank body rejected; openQuestionId association), and the anchor model + per-artifact scoping. Verify locally (./gradlew test JDK21). The JS layer (t3/t4) + the JCEF wiring (t5) have no JVM harness — manual + backstopped by the pure cores (the known JS-untested residual, recorded honestly in the CR as in S002).

**Acceptance checks:**
- Every LLD test-strategy subject for ac1/ac2/ac3 has a passing test over the pure Kotlin cores.
- Plugin tests green via ./gradlew test on JDK21; no live socket, no GitHub CI.
- The JS/JCEF residual is recorded honestly (not asserted as covered).

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| CommentBuffer.add mints a client id, appends, and returns the ReviewComment carrying the anchor+body (ac1) | `t1`, `t6` |
| CommentBuffer.edit(known id) updates the body and is reflected in snapshot; edit(unknown id) returns false and changes nothing (ac3) | `t1`, `t6` |
| CommentBuffer.remove(known id) drops it from snapshot; remove(unknown id) returns false (ac3) | `t1`, `t6` |
| snapshot() returns an immutable copy in insertion order; clear() empties it | `t1`, `t6` |
| two adds to the same sectionPath get DISTINCT ids and each retains its own quote (ac2) | `t1`, `t6` |
| applyCommentOp(add) with a valid anchor+body -> buffer gains the anchored comment (ac1) | `t2`, `t6` |
| applyCommentOp(edit/remove) by id -> reflected in snapshot (ac3) | `t2`, `t6` |
| malformed JSON / unknown op / missing fields -> no-op (buffer unchanged), no throw | `t2`, `t6` |
| an add with an all-null anchor OR a blank body -> rejected | `t2`, `t6` |
| an add whose anchor carries openQuestionId -> distinctly associated (ac2) | `t2`, `t6` |
| CommentAnchor supports section-only, quote-only, openQuestion-only, and combined anchors (all optional) | `t1`, `t6` |
| the buffer is scoped per artifactId so switching artifacts shows only that artifact's comments | `t5`, `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails.api CommentBuffer + ArtifactCommentLayer + interactionWithShared sc3 (presentation-only, lc1/k1)` — "The pure Kotlin-owned un-submitted buffer (source of truth) ... Presentation-only — no persistence, no resolution reasoning (lc1/k1)."
- **[[c2]]** `prior-artifact` `LLD s3 dataModelChanges ReviewComment / CommentAnchor / CommentBuffer` — "+ data class ReviewComment(id: String, anchor: CommentAnchor, body: String)"
- **[[c3]]** `prior-artifact` `LLD s3 errorPaths (malformed payload no-op, unknown-id no-op, dispose-race guard, empty anchor/blank body rejected)` — "malformed JSON / unknown op / missing fields -> no-op (buffer unchanged), never throws"
- **[[c4]]** `prior-artifact` `LLD s3 contractDetails.api markdown-renderer.js (additive heading ids) + the comment JS layer + migration (JCEF-only)` — "ATX headings now emit a stable id (slug + ordinal) and expose the heading path so the comment JS can compute CommentAnchor.sectionPath"
- **[[c5]]** `prior-artifact` `LLD s3 testStrategy (plugin JUnit; JS/JCEF is the manual/backstopped residual)` — "Plugin: JUnit5 (pure Kotlin units — CommentBuffer + the comment-op applier + the anchor model) via ./gradlew test on JDK21"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-19T11:24:09.901Z

_No load-bearing premises were extracted._
