<!-- insrc:artifact CR-8d7b4704660a5866-s1 -->

# Code review: s1

Status: **incomplete** · task-based schema version 2

## review-8d7b4704660a5866-s1-r1 — attempt 1

Scope: whole story · reviewer: daemon · 2026-11-04T05:26:04.985Z

1 selected task assessment(s): incomplete.
Native output diagnostics: [{"phase":"assessment","taskId":"s1","provider":"claude","resolved":true,"errors":[{"code":"MISSING_REQUIRED_FIELD","field":"taskId","correction":"Return the required field in the JSON object.","occurrences":1},{"code":"MISSING_REQUIRED_FIELD","field":"status","correction":"Return the required field in the JSON object.","occurrences":1},{"code":"MISSING_REQUIRED_FIELD","field":"summary","correction":"Return the required field in the JSON object.","occurrences":1},{"code":"MISSING_REQUIRED_FIELD","field":"findings","correction":"Return findings as a top-level JSON array.","occurrences":1},{"code":"MISSING_REQUIRED_FIELD","field":"testCoverage","correction":"Return the required field in the JSON object.","occurrences":1},{"code":"MISSING_REQUIRED_FIELD","field":"limitations","correction":"Return the required field in the JSON object.","occurrences":1},{"code":"MISSING_REQUIRED_FIELD","field":"advice","correction":"Return the required field in the JSON object.","occurrences":1},{"code":"MISSING_REQUIRED_FIELD","field":"inspectedReferences","correction":"Return the required field in the JSON object.","occurrences":1}]}]

### Submitted scope

- `91cce9e62e5649888912760010a9c2b75c67eaab:vscode-plugin/package.json` — [{"after":[741,741]}]
- `91cce9e62e5649888912760010a9c2b75c67eaab:vscode-plugin/src/config/__tests__/per-role.test.ts` — [{"after":[15,15]},{"after":[29,29]},{"after":[78,78]},{"after":[88,88]},{"after":[96,124]}]
- `91cce9e62e5649888912760010a9c2b75c67eaab:vscode-plugin/src/config/key-map.ts` — [{"after":[32,46]},{"after":[135,135]},{"after":[147,147]}]
- `8a82006af49749c11cdee01481efe582789ebd99:vscode-plugin/src/config/__tests__/legacy-keys.test.ts` — [{"after":[1,59]}]
- `8a82006af49749c11cdee01481efe582789ebd99:vscode-plugin/src/config/legacy-keys.ts` — [{"after":[1,58]}]
- `8a82006af49749c11cdee01481efe582789ebd99:vscode-plugin/src/extension.ts` — [{"after":[46,46]},{"after":[276,285]}]
- `8a82006af49749c11cdee01481efe582789ebd99:vscode-plugin/src/vscode.d.ts` — [{"after":[212,213]}]

### s1: incomplete

The native-id fix (nativeRoleKey camelCase-joining, package.json key rename, prefix-collision test) is correct, narrowly scoped to the one real collision in the current role taxonomy, and well covered by tests that all pass. The second commit's value-migration path, however, reads the stuck legacy value through the exact same VS Code configuration API (nested dotted-path resolution) that the ISSUE's own root cause documents as broken for this specific key pair, so it is likely to silently no-op for the primary repro scenario it was written to fix; no test exercises the real API to catch this.

Coverage: **partial** — per-role.test.ts and legacy-keys.test.ts both pass (verified by my own execution) and thoroughly exercise the pure logic: nativeRoleKey's camelCase-join vs. unchanged-id branches, the manifest↔taxonomy exact-cover contract against the real package.json, the no-dotted-prefix invariant across both the manifest and the merged key map, and migrateLegacyKeys' move/skip/never-throw branches. What is not and cannot be covered by this Node-only test suite is the real `vscode.workspace.getConfiguration().inspect()` behavior against VS Code's nested configuration tree — legacy-keys.test.ts injects a plain-object `read`/`apply`/`clear`, so the exact collision described in the MED finding is never exercised. This is a genuine coverage gap on the one piece of behavior that most needed a check against real VS Code semantics (the same semantics the ISSUE itself documents as the root cause).

- **MED** `vscode-plugin/src/extension.ts:279-284`: migrateLegacyKeys reads the stuck legacy value via `vscode.workspace.getConfiguration().inspect('insrc.models.tasks.tools.convert.escalate')?.globalValue`. The ISSUE's own root cause (ISSUE-8d7b4704660a5866, rootCause) states that this exact key returns undefined from `.get()` because its sibling leaf setting `insrc.models.tasks.tools.convert` (vscode-plugin/package.json:730, unchanged, still a string-typed setting) occupies the same node in VS Code's nested configuration tree, so indexing one level deeper for `.escalate` fails. `inspect()` resolves a section's per-scope value (including `globalValue`) through the same underlying nested configuration model as `.get()`, so for the repro's own precondition ('while insrc.models.tasks.tools.convert is also set') the legacy read is very likely to also return undefined. legacy-keys.ts:41-43 then hits `if (entry === undefined || value === undefined) continue;` and silently skips the move — defeating the commit's stated acceptance criterion ('Move a value a user already has under the old id to the new one once, so it is not lost') for the exact scenario the fix targets.
  This is the primary functional promise of the second commit (data preservation across the rename), it fails specifically for the scenario the ISSUE reproduces (both sibling keys set), and the failure mode is silent (no error, no notification) — a user who had the old value set would simply find it gone with no explanation, and would have to notice and re-enter the tier manually. Severity is MED rather than HIGH because the failure is not destructive beyond the pre-existing broken state (the value was already functionally inert since the daemon never received it before this fix either) and the underlying write-side bug (the actual VS Code 'change not applied' defect) is still fixed going forward for new edits under the new id.
  Evidence: `ffd812e79bd66e4b89581dd362a0c3be2c4709cc:.insrc/artifacts/ISSUE-8d7b4704660a5866.json`, `8a82006af49749c11cdee01481efe582789ebd99:vscode-plugin/src/extension.ts`, `8a82006af49749c11cdee01481efe582789ebd99:vscode-plugin/src/config/legacy-keys.ts`, `91cce9e62e5649888912760010a9c2b75c67eaab:vscode-plugin/package.json`

Review limitations (blocking):

- Required coverage remains partial: per-role.test.ts and legacy-keys.test.ts both pass (verified by my own execution) and thoroughly exercise the pure logic: nativeRoleKey's camelCase-join vs. unchanged-id branches, the manifest↔taxonomy exact-cover contract against the real package.json, the no-dotted-prefix invariant across both the manifest and the merged key map, and migrateLegacyKeys' move/skip/never-throw branches. What is not and cannot be covered by this Node-only test suite is the real `vscode.workspace.getConfiguration().inspect()` behavior against VS Code's nested configuration tree — legacy-keys.test.ts injects a plain-object `read`/`apply`/`clear`, so the exact collision described in the MED finding is never exercised. This is a genuine coverage gap on the one piece of behavior that most needed a check against real VS Code semantics (the same semantics the ISSUE itself documents as the root cause).

Optional verification and advice (nonblocking):

- Optional execution: did not run a live VS Code extension host to empirically confirm the inspect()/get() nested-tree collision for the legacy key; the finding is based on the ISSUE's own documented root cause plus VS Code's standard configuration-model resolution semantics, not a live reproduction.
- Consider verifying the migration against a real VS Code window with both insrc.models.tasks.tools.convert and the legacy ...convert.escalate set in settings.json, to confirm whether inspect().globalValue actually recovers the value; if it does not, reading the raw settings.json file directly (bypassing the configuration API) would be a more robust recovery path for this one key.
- migrateLegacyKeys calls deps.clear(legacy) unconditionally whenever entry+value are both defined, even when the value is not moved (already held under the new id, or invalid) — reasonable as best-effort cleanup of an orphaned/invalid key, but legacy-keys.test.ts does not assert cleared in those two branches, so this behavior is currently unverified by name.

Inspected references:

- `ffd812e79bd66e4b89581dd362a0c3be2c4709cc:.insrc/artifacts/ISSUE-8d7b4704660a5866.json`
- `91cce9e62e5649888912760010a9c2b75c67eaab:vscode-plugin/package.json`
- `91cce9e62e5649888912760010a9c2b75c67eaab:vscode-plugin/src/config/__tests__/per-role.test.ts`
- `91cce9e62e5649888912760010a9c2b75c67eaab:vscode-plugin/src/config/key-map.ts`
- `8a82006af49749c11cdee01481efe582789ebd99:vscode-plugin/src/config/__tests__/legacy-keys.test.ts`
- `8a82006af49749c11cdee01481efe582789ebd99:vscode-plugin/src/config/legacy-keys.ts`
- `8a82006af49749c11cdee01481efe582789ebd99:vscode-plugin/src/extension.ts`
- `8a82006af49749c11cdee01481efe582789ebd99:vscode-plugin/src/vscode.d.ts`

Test: `npx tsx --test-force-exit vscode-plugin/src/config/__tests__/per-role.test.ts` — pass
Ran directly against the current checkout at commit 91cce9e62e5649888912760010a9c2b75c67eaab (unchanged since): all 8 cases passed.

Test: `npx tsx --test-force-exit vscode-plugin/src/config/__tests__/legacy-keys.test.ts` — pass
Ran directly against the current checkout at commit 8a82006af49749c11cdee01481efe582789ebd99 (unchanged since): all 4 cases passed.
