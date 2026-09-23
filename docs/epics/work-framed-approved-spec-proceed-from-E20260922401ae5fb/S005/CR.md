<!-- insrc:artifact CR-401ae5fb7b8537cc-s5 -->

# Code review: 401ae5fb7b8537cc:s5

✅ **PASS** — HIGH 0 · MED 0 · LOW 2 · model `client`

**Changed files:** 5

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/panels/webview-host.ts:129 | The sc9 amendment holds every documented invariant. XSS: the Detailed Status panel flips enableScripts:false->true but the shared shell carries a strict CSP (default-src 'none'; script-src 'nonce-<random>'; no 'unsafe-inline' for scripts) with a per-render node:crypto nonce that matches the only inline script; every daemon-derived value (state/detail/slug/stage/status) is HTML-escaped via the single shared escaper (html.ts) and lands only in text-node context — an injected </script> cannot break out (k2/XSS). On-demand ONLY: no setInterval/setTimeout is armed anywhere in the panel cores; re-render is open-/switchTab-/refresh-driven (ac3/k3 — the continuous ticker stays s6). Never-throw: renderDetail wraps renderer/gateway/setHtml in try/catch, handleDetailMessage is synchronous + validated, and (this story's hardening) openSingleton now guards reveal/onDidDispose/onCreate too. sole-vscode-importer + no new daemon capability + k5-thin all preserved (cores import only ./html.js, ./types.js, node:crypto). Not a breach — a documentation-level observation. |

## conventions — 0 finding(s)

_No findings._

## coverage — 0 finding(s)

_No findings._

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/panels/webview-host.ts:230 | The independent cold review found 0 HIGH/0 MED; its one worth-fixing LOW (openSingleton's reveal/onDidDispose/onCreate sat outside the create try/catch — a never-throw gap S005 widened by the onCreate->onMessage call) is FIXED in this diff (openSingleton now wraps the whole open in one guard). Two cheap hardenings also applied: extension.ts postMessage now swallows its Thenable rejection (was a latent unhandled-rejection if ever used), and the tab/refresh controls carry type="button". Remaining accepted LOW (not fixed, documented): style-src 'unsafe-inline' — the standard VS Code webview posture and not exploitable here (the <style> is static + every daemon value is escaped, so no style-injection path); and each tab-switch/refresh does a full webview reload (fresh nonce) which resets scroll/focus — a UX cost of the re-set-html approach, acceptable for S005. Deferred item for s6: it must add the debug tab renderer + its (only) continuous log ticker. |

