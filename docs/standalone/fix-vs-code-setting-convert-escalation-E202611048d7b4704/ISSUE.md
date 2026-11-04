<!-- insrc:artifact ISSUE-8d7b4704660a5866 -->

# Fix the VS Code setting for the convert escalation tier, which VS Code cannot read back

## Reproduction

In VS Code, open Settings and change `insrc.models.tasks.tools.convert.escalate` (a tier: cheap, mid or core) while `insrc.models.tasks.tools.convert` is also set. Observed: the extension shows "insrc: 'insrc.models.tasks.tools.convert.escalate' must be one of: cheap, mid, core — change not applied" even though the value entered is one of those three, and the field reverts. Expected: the change is accepted and sent to the daemon. The same value set from the insrc terminal Settings pane works.

## Root cause

The extension names each native setting `insrc.` plus the catalog path, so the role `tools.convert` becomes `insrc.models.tasks.tools.convert` and the role `tools.convert.escalate` becomes `insrc.models.tasks.tools.convert.escalate`. The second key is a dotted child of the first. VS Code keeps settings in a nested tree, where `tools.convert` is already a string value ("cheap") and cannot also hold an `escalate` child, so `workspace.getConfiguration().get('insrc.models.tasks.tools.convert.escalate')` returns undefined. The change listener passes that undefined to the enum validator, which reports it as not one of cheap, mid, core and refuses the edit.

## Fix intent

Give the escalation role a native setting id that is not a dotted child of another setting id (for example `insrc.models.tasks.tools.convertEscalate`), and map it back to the unchanged catalog path `models.tasks.tools.convert.escalate`, in the key derivation, the manifest generator and the generated manifest. Move a value a user already has under the old id to the new one once, so it is not lost. Add a test that no native setting id is a dotted prefix of another, so the same clash cannot come back for another role. The daemon, its catalog and its protocol are unchanged.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/config/key-map.ts:28` — "export function nativeKeyForPath(path: string): string"
- **[[c2]]** `code` `vscode-plugin/src/extension.ts:283` — "if (event.affectsConfiguration(entry.nativeKey)) {"
- **[[c3]]** `code` `vscode-plugin/src/config/sync-engine.ts:71` — "`must be one of: ${allowed.join(', ')}`"
- **[[c4]]** `code` `src/config/role-taxonomy.ts:96` — "{ id: 'tools.convert',"
