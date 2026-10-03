<!-- insrc:artifact CR-095906bac5bbacaf-S001 -->

# Code review: 095906bac5bbacaf:S001

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 5 · model `client`

**Changed files:** 2

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:253 | Pass-state is not attested by the daemon validate gate, so it is recorded here as locally-verified rather than gate-verified. The gate returned passed:false with reason 'every test/typecheck command was permission-denied ... unverified — failing per the gate's if-unsure-fail rule', while confirming scopeRespected:true. Locally I ran `npx tsc --noEmit` (clean) and `npx tsx --test 'src/**/__tests__/*.test.ts'` in vscode-plugin (612 tests, 608 pass, 0 fail, 4 skipped). Crucially I also ran a mutation check: reverting the CSP to its pre-fix form makes the new test fail with 'the shell declares an image with scheme data: but its CSP img-src ('none') does not permit it', while the pre-existing glyph test stays GREEN — which both proves the new test genuinely reaches the changed line and reproduces the exact blindness this Story exists to close. Recorded as an observation, not a breach: the changed behaviour IS exercised; only the gate's independent attestation is missing. |
| LOW | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:1372 | Graph grounding for this Story is hollow: both changed files carry testsReaching: [] and empty caller/callee edges, because they were re-indexed as whole-file diff entities rather than resolved symbols. That empty edge set is an indexing artifact, NOT evidence of missing tests — treating it as a coverage gap would manufacture a false HIGH against a file that is itself the new test. Coverage was therefore judged by executing the suite and by the mutation check described in the sibling finding. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:1391 | Two adjacent comments contradict each other after the fix iteration: the first says url(...) layers are scanned 'in the <style> block' (singular), and the line immediately below corrects it to 'ALL <style> blocks — the shell ships more than one and the glyph is not in the first.' The singular phrasing is a leftover from the first attempt, which failed exactly because it sliced only the first block. Harmless to behaviour but actively misleading about the subtlety it is there to explain. Taste/clarity only. |
| LOW | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:1394 | The <img src=...> scan runs over the ENTIRE shipped html, which includes the inlined marked bundle (~53 KB of embedded library source). If that bundle ever ships a literal like `<img src="http` inside a string or regex, the scheme scan would pick it up and fail the CSP invariant spuriously. The url(...) half of the scan is already correctly narrowed to the concatenated <style> blocks; the <img> half is not similarly bounded. Currently benign — the suite is green and the sibling assertion at line ~323 shows the bundle ships URLs only in warning strings — and the failure mode is a loud false positive rather than a silent miss, so this is a robustness observation, not a defect. Narrowing it to the <body> markup would remove the coupling. |
| LOW | vscode-plugin/src/chat/chat-panel.ts:253 | Security posture of the relaxation was checked and is sound, recorded for the reader rather than as a risk to fix: `img-src data:` permits inline data-URI images only. An SVG loaded as a CSS background-image or via <img> is rendered in script-disabled mode by browsers, so it cannot execute script or fetch subresources; default-src stays 'none', script-src stays nonce-only, style-src is untouched, and no remote origin becomes loadable. The narrowing is asserted by the test (img-src data:; exactly, plus doesNotMatch on https?:), so a later widening to `data: https:` or `*` would fail the suite. |

