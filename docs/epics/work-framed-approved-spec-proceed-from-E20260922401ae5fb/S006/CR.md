<!-- insrc:artifact CR-401ae5fb7b8537cc-s6 -->

# Code review: 401ae5fb7b8537cc:s6

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 1 · model `client`

**Changed files:** 6

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 0 finding(s)

_No findings._

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/extension.ts:197 | panelLog uses console.warn(`[insrc] …`) rather than a structured getLogger — an intentional, documented k5 deviation (importing the daemon pino stack would bloat the thin extension bundle and fail the packaging allowlist), consistent with the S004/S005 precedent. Extension-host diagnostics correctly go to the console channel. |

