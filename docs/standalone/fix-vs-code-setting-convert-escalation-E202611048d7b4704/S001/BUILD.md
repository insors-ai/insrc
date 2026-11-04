<!-- insrc:artifact BUILD-8d7b4704660a5866-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-04T05:10:47.913Z  ·  **Updated:** 2026-11-04T05:16:15.912Z

**Commit:** 8a82006af

## Scope

Fix the VS Code setting for the convert escalation tier (ISSUE-8d7b4704660a5866): give models.tasks.tools.convert.escalate a native setting id that is not a dotted child of another setting id (insrc.models.tasks.tools.convertEscalate), map it back to the unchanged catalog path in vscode-plugin/src/config/key-map.ts and scripts/sync-manifest-catalog.mjs, regenerate vscode-plugin/package.json, move an existing user value from the old id once at activation in vscode-plugin/src/extension.ts, and add a test that no native setting id is a dotted prefix of another.

## Triage rationale

Small bugfix (ISSUE-8d7b4704660a5866): the native VS Code id of the convert escalation role is a dotted child of another native id.

## Summary

vscode-plugin/src/config/key-map.ts gains nativeRoleKey: a role whose id extends another role's id with a dot joins the rest onto the parent in camel case, so tools.convert.escalate gets the native id insrc.models.tasks.tools.convertEscalate; every other role keeps insrc.models.tasks.<roleId>. buildPerRoleKeyMap uses it and the catalog path models.tasks.tools.convert.escalate is unchanged; vscode-plugin/package.json declares the renamed setting. New src/config/legacy-keys.ts: migrateLegacyKeys moves a valid tier typed under the old id to the new id once, after the activation pull (src/extension.ts), only when the new id still shows its default, and clears the old id best effort (VS Code refuses to write an unregistered setting). Tests: per-role.test.ts (derivation, the escalation role's mapping, and that no declared or mapped native id is a dotted prefix of another; it fails with the old key restored) and legacy-keys.test.ts (move, no-overwrite, invalid and failing deps). scripts/sync-manifest-catalog.mjs needed no change: it leaves the per-role keys alone and the taxonomy-coverage test guards them. Not checked: behaviour inside a running VS Code. repo-config.test.ts has two failures that exist without this change (it hardcodes 14 critical and 20 peripheral roles).

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/package.json` — **insrc-build** (2026-11-04T05:16:15.912Z)
- `vscode-plugin/src/config/__tests__/per-role.test.ts` — **insrc-build** (2026-11-04T05:16:15.912Z)
- `vscode-plugin/src/config/key-map.ts` — **insrc-build** (2026-11-04T05:16:15.912Z)
- `vscode-plugin/src/config/__tests__/legacy-keys.test.ts` — **insrc-build** (2026-11-04T05:16:15.912Z)
- `vscode-plugin/src/config/legacy-keys.ts` — **insrc-build** (2026-11-04T05:16:15.912Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-11-04T05:16:15.912Z)
- `vscode-plugin/src/vscode.d.ts` — **insrc-build** (2026-11-04T05:16:15.912Z)
