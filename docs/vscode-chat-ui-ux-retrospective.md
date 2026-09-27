# Retrospective: why the VS Code dev-chat UI shipped "complete" with many UX defects

**Date:** 2026-09-27
**Subject epic:** `vs-code-editor-dev-chat-ui` (`f9563bf5bbb29c43`) — [docs/epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/](epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/)
**Author:** engineering (written for insrc maintainers + the workflow owners)

## TL;DR

The UX was designed in detail — an agreed mock, an HLD, four LLDs, design reviews, and 238 green tests — yet a string of user-visible UX defects surfaced only when the extension was actually run. This was **not** a case of a sloppy design or skipped process. It is the opposite: a thorough process whose **every verification step could see only the contract, never the rendered outcome.** The design, the tests, and both review gates operated on strings, a fake DOM, and fabricated inputs, so the three failure classes that actually bit us — **CSS/layout**, **visual fidelity vs. the mock**, and **runtime / lifecycle / integration** — were structurally invisible to the whole pipeline. The mock was the "source of truth" but was never an *acceptance gate*, so a human ended up being the visual and runtime QA.

## What shipped vs. what broke

The epic was marked **COMPLETE 4/4, 238 tests green**. The following user-visible defects were then found by running the extension (all have since been fixed, plugin `0.4.x`):

| Defect | Where it lived |
| :--- | :--- |
| Session history dropdown empty; transcript blank on restore | webview message delivery + lifecycle |
| Panel box didn't fill; input floated mid-panel | CSS specificity in `renderShell` |
| Messages rendered as flat colored text, not the mock's cards/labels | S003 "rich rendering" |
| Permission approval card never appeared | S004 approvals / real claude protocol |
| Two confusingly-similar "auto/review" dropdowns | S004 + S006 controls, no end-to-end UX pass |
| Chat mode not persisted per session | mode modelled as ephemeral view state |
| Markdown tables rendered as raw pipes | S003 hand-rolled markdown widget |

## Verdict

Detailed design did not prevent these because **verification never reached the real surface.** Green tests + approved artifacts was the definition of done, and every one of those tests was a *proxy* (a string assertion, a fake DOM, or a fabricated input) that could not exercise CSS layout, visual fidelity, or the live webview/CLI runtime.

## Root causes (each documented in the epic's own artifacts)

### 1. The test method physically cannot see rendering, layout, or lifecycle

Every LLD's test strategy is explicit about this. S003: *"eval `renderRegistryWebviewSource()` against a fake document … no DOM exec"* ([S003/LLD.md](epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/S003/LLD.md#L159)). S002: *"drives `renderShell` via the FakeChannel and inspects the html string"* ([S002/LLD.md](epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/S002/LLD.md#L160)).

A fake DOM has no CSS engine, no layout, and no VS Code webview lifecycle. Consequently:

- **Layout not filling** — the string test confirmed the CSS *text* was present; it could never see that `.insrc-term-chat{display:block}` (a class selector, specificity 0,1,0) overrode `body{display:flex}` (an element selector, 0,0,1). A specificity bug is invisible to a substring check.
- **History empty / restore / mode-not-persisted** — the FakeChannel delivers messages synchronously and perfectly. It cannot model the real webview's async load (a `postMessage` fired before the listener attaches is lost), its reload-on-hide (the panel had no `retainContextWhenHidden`, so VS Code re-loads it blank), or serializer restore. The happy-path delivery always "passed."

### 2. The mock (k5) was the source of truth but never an acceptance criterion

The HLD says the mock is *"implemented ONCE"* and S002 asserts *"`renderShell` matches the mock"* ([S002/LLD.md](epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/S002/LLD.md#L179)). But the S003 acceptance mapping ties ac1/ac2/ac3 to fake-DOM **class/structure** assertions ([S003/LLD.md](epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/S003/LLD.md#L168)); **not one criterion references the mock's cards, role labels, or bubbles.**

So "role differentiation (ac1)" was satisfied by `.insrc-msg--user{color:#8ab4ff}` — a single color — and the test only checked the class *existed*. "Rich rendering COMPLETE" meant the row-kind plumbing existed, not that it looked like [mocks.html](epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/mocks.html).

### 3. The k1 constraint (no `innerHTML`, inline-only) designed the markdown gaps in

ac3 specifies *"a minimal inline markdown widget (headings/lists/code/emphasis via `createElement`, never `innerHTML`)"* ([S003/LLD.md](epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/S003/LLD.md#L197)). Tables and ordered lists were never in scope — the raw-pipes defect was **baked into the LLD**, not an implementation miss. And because the same constraint mandated fake-DOM testing, nothing could notice the output was incomplete. (The eventual fix relaxed k1 and adopted the `marked` library, bundled CSP-safe.)

### 4. The external integration was verified for flag *existence*, not runtime *behavior* — and the one real-CLI test was opt-in and never run

The HLD leans on a "CLI spike" that *"verified the flags exist"* ([HLD.md](epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/HLD.md#L130)) and assumes a permission request *"surfaces as an approval-request TurnEvent … the host relays [the decision] back to the adapter's permission channel"* ([HLD.md](epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/HLD.md#L11)).

The actual wire protocol was never observed: the installed claude CLI emits `{type:"system", subtype:"permission_denied", …}` and **ends the turn** — there is no in-turn host-answerable channel. The unit tests fed a **fabricated** "scripted permission line" and passed ([S004/LLD.md](epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/S004/LLD.md#L266)); the only real-CLI test was *"INSRC_LIVE_TESTS-gated … skips when unset"* ([S004/LLD.md](epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/S004/LLD.md#L268)) and was never run. The whole relay design rested on an unverified assumption, so a feature that could never work against the real CLI was marked complete.

### 5. Both review gates were structurally blind to outcome

- **Design reviews** passed 0-HIGH / 0-MED with all-LOW citations of the form *"grep confirms X exists"* ([HLD.md](epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/HLD.md#L203), [S003/LLD.md](epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/S003/LLD.md#L225)). This is a real, useful check of **design-vs-code consistency** — but never of **outcome-vs-mock** or runtime correctness.
- **Post-build code reviews** are empty **0/0/0 WARN** ([S003/CR.md](epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/S003/CR.md)) because they ground on the working-tree diff, which was empty (the chat code was committed per task before the review ran). They reviewed nothing.

Neither gate could catch a rendered, lifecycle, or integration defect.

## One subtle design-principle miss

The *mode-not-persisted* bug traces to k4 itself. The durability NFR says *"rich rendering, collapse state, and the progress widget are view-time only and never persisted"* ([HLD.md](epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/HLD.md#L86)). That is correct for **render** state — but the design applied the same "don't persist view state" reflex to permission-mode, which is a durable per-session **preference**, not view state. The principle was right; its categorization of "mode" was wrong.

## What would have caught all of it (the pattern, not the symptoms)

1. **A rendered-DOM acceptance test** — jsdom, or a headless-Chromium screenshot of the real `renderShell` HTML — required for any webview story. This one change catches layout, visual fidelity, and markdown completeness in a single pass. (Every fix in the `0.4.x` line was verified exactly this way.)
2. **Make the mock an executable gate, not prose** — a visual/structural diff of the rendered shell against `mocks.html`, so "matches the mock" is *checked*, not asserted.
3. **Promote the live-CLI test from opt-in to a required pre-completion step** for any story that integrates a real external tool. A feature built and accepted entirely against a fabricated envelope must not qualify as "complete."
4. **Model the webview lifecycle explicitly** in the LLD — load timing, reload-on-hide (`retainContextWhenHidden`), serializer restore, and which state persists — instead of only the happy-path render.
5. **Fix the code-review grounding** so it reviews the actual committed change (e.g. diff against the story's merge-base), not an empty working-tree diff.

### Definition-of-done change

For any **webview / IDE-surface / external-CLI** story, "done" should require, in addition to green unit tests:

- a rendered-DOM or screenshot check that the story maintainer (or reviewer) has actually looked at, and
- for external integrations, at least one execution against the real tool — not a scripted stand-in.

The throughline of every defect above is the same: the automated proxy passed while the real surface failed. Adding one gate that touches the real surface — rendered pixels for UI, the real CLI for integrations — closes the entire class.
