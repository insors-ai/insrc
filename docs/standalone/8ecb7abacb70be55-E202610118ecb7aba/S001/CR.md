<!-- insrc:artifact CR-8ecb7abacb70be55-S001 -->

# Code review: 8ecb7abacb70be55:S001

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 4 · model `claude:opus`

**Changed files:** 7

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | vscode-plugin/src/delivery/board-wiring.ts:49 | The graph shows no tests reaching registerDeliveryBoard, but that grounding is missing edges. board-wiring.test.ts imports it (line 15) and calls it directly at lines 92, 159 and 200. The test at line 212 checks that panel.iconPath equals the light/dark tabIcon pair, or is undefined when no icon is given. So a test exists, but there is no build record, so its pass-state is unverified. This is not a missing test; confirm it passes by running the vscode-plugin suite. |
| LOW | vscode-plugin/src/delivery/board-wiring.ts:50 | clientNow is a closure inside registerDeliveryBoard and only runs when the board host calls snapshot() or evidence() (lines 59-60). The graph shows no tests reaching it, but the registerDeliveryBoard tests above run the code around it. Whether they actually trigger snapshot/evidence is unverified, and that pass-state is unverified too. |
| MED | vscode-plugin/src/extension.ts:633 | The change inside activate passes a tabIcon to registerDeliveryBoard (line 633). That change is checked only by scanning source text: board-icon.test.ts:45 matches the tabIcon {light, dark} literal with a regex, and board-wiring.test.ts:75/144 looks up the call site with indexOf. Neither test executes activate, so the icon paths are confirmed textually but never resolved at runtime. The pass-state of these tests is also unverified. The other extension.ts helpers in the changed set (folders, managedPid, runGit, relForGit, absForFs, readText, webviewPanelChannel, deactivate, chatCwd) look like file-level noise rather than changes made by this Story, so they are not reported. |
| LOW | vscode-plugin/package.json:109 | The new SVG assets and the package.json icon entry (lines 109-110) have no graph edges, which is expected for static files. board-icon.test.ts covers them by reading the files and matching their text (LIGHT/DARK constants at lines 15-16, plus a read() helper). That test exists, but its pass-state is unverified because there is no build record. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/extension.ts:638 | The board's tabIcon builds its light/dark pair the same way the chat panel's iconPath does at extension.ts:521: vscode.Uri.file(join(context.extensionPath, 'media', <name>)) once per theme. Both are in activate. A small helper such as themedIcon(base) would remove the repeated path code. This is only a style point: the overlap is two lines and nothing is wrong today. |
| LOW | vscode-plugin/src/delivery/board-wiring.ts:24 | BoardTabIcon types light and dark as unknown, and BoardWebviewPanel types iconPath as unknown, so that board-wiring.ts does not import vscode. The cost is that the compiler cannot catch a wrong value, such as a plain string path, being passed as tabIcon. That risk is small: there is one call site, and it passes vscode.Uri values. Typing it as a minimal UriLike would win back some checking. |

