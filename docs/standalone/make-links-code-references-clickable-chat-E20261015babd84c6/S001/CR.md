<!-- insrc:artifact CR-babd84c6e2fb480a-S001 -->

# Code review: babd84c6e2fb480a:S001

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 4 · model `claude:opus`

**Changed files:** 17

## adherence — 0 finding(s)

_No findings._

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/link-markup.test.ts:211 | `plain_` repeats the `plain` helper from line 15 exactly (JSON round-trip clone), but under a name with a trailing underscore. No other helper in the touched test modules uses a trailing underscore, and the duplicate is not needed because `plain` is already in scope at line 207. Delete `plain_` and call `plain` at line 207. |

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | vscode-plugin/src/chat/companion-reader.ts:1 | No test carries the promised name 'companion-reader behaves as before after the containment helper is extracted'. Its behaviour is covered by the existing review-wiring.test.ts:61 ('readCompanion answers the text of an .html file under docs/ … and undefined for … a path that leaves docs/, a missing file …'), which passes after the extraction (4/4 in review-wiring.test.ts). Map that case to this planned test in the build's validate `tests`, otherwise the gate will report it as not found. |
| LOW | vscode-plugin/src/chat/link-markup.ts:1 | Live test is present only as a plan promise and was not run. 'An http link opens in the browser exactly once, in the chat and in the review pane' needs a running VS Code. Its pass-state is unverified until it is reported with evidence. |
| LOW | vscode-plugin/src/chat/link-opener.ts:1 | Live test is present only as a plan promise and was not run. 'A code reference opens at its line, in the chosen editor group, and Beside when only the chat group exists' needs a running VS Code. Its pass-state is unverified until it is reported with evidence. |

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/link-opener.ts:62 | The `'..'` segment pre-check in openCodeRef repeats containment logic that resolveWithin already enforces (absolute-path refusal + as-written and post-realpath `within` checks). Harmless — it only refuses earlier and with a clearer log line — but it is a second copy of the escape rule that could drift; consider relying on resolveWithin alone and logging on its undefined result. |

