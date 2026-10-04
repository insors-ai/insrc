<!-- insrc:artifact CR-c4c420c22b71651e-S001 -->

# Code review: c4c420c22b71651e:S001

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 5 · model `client`

**Changed files:** 9

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | vscode-plugin/src/chat/group-lock.ts:45 | The LLD makes the manual smoke check (a)-(d) in an Extension Development Host a REQUIRED acceptance step for ac1-ac3 and the only check of the runtime tab-input view type and the real lock command. Nothing in commit e0d0adf records that it was run or what activeTab.input.viewType was observed; the comment at this line states the 'mainThreadWebview-' prefix as fact. Every automated test drives fakes, so whether the chat group actually locks in a real window is still unproven. |
| LOW | vscode-plugin/package.json:5 | LLD migration step 6 says to bump the plugin version and rebuild after the smoke check; version is still 0.5.10 and the commit only adds the setting. Harmless if the bump is deliberately deferred to release, but the behaviour does not reach users until it happens. |

## conventions — 0 finding(s)

_No findings._

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | vscode-plugin/src/chat/group-lock.ts:106 | The subscribe-failure branch (lines 102-111: onDidChangeViewState / onTabsChanged throwing, e.g. an editor fork where window.tabGroups is undefined) has no committed test, so removing that try/catch leaves the 30-test suite green while attach would throw into panel create and into deserializeWebviewPanel, whose catch disposes the restored chat. Verified by an ad hoc run (not a committed test) that the current code does the right thing: no throw, one warn, zero live view-state subscriptions, zero lock calls. Present behaviour correct; guarantee unpinned. Note: the tool's graph grounding for this story is file-level with empty testsReaching for every entry, so no coverage finding here is derived from it; coverage was judged by reading and running the tests (30/30 pass). |
| LOW | vscode-plugin/src/extension.ts:481 | The extension.ts seams (composite onTabsChanged disposer, activeTabInput, lockActiveGroup) are covered only by text regexes in extension-chat-wiring.test.ts, which match on shape and would pass for a disposer that drops one subscription. Acceptable by the LLD's own framing (presence-only), but it leaves the smoke check as the sole behavioural check of this code. Separately, the two activation.test.ts cases that scan extension.ts are cancelled in a whole-file run by an earlier hanging test in the same file; run by name they pass. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/extension.ts:482 | Composite subscription is not exception-safe: if onDidChangeTabGroups throws after onDidChangeTabs has subscribed, the first subscription is never returned and so never disposed. The leaked listener only calls attempt(), which is a no-op once the module's catch has finished the panel, so the cost is one dead listener per panel on a host with a partial tab API. |
| LOW | vscode-plugin/src/chat/group-lock.ts:96 | deps.warn is called inside catch handlers with no guard, so a throwing warn escapes attach (confirmed by an ad hoc run with a throwing warn and a synchronously throwing lock command). Not reachable with the wired logger (console.warn-backed panelLog.warn), so this is a robustness note against the 'never throws' contract, not a live defect. |
| LOW | vscode-plugin/src/chat/chat-panel.ts:104 | `const VIEW_TYPE = CHAT_VIEW_TYPE;` keeps a private alias for a single use site; taste only. |

