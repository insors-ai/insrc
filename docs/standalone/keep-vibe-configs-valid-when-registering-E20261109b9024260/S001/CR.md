<!-- insrc:artifact CR-b902426092868097-s1 -->

# Code review: s1

Status: **changes_requested** · task-based schema version 2

## vibe-config-valid-s1 — attempt 1

Scope: whole story · reviewer: daemon · 2026-11-09T07:48:34.682Z

1 selected task assessment(s): changes_requested.

### Submitted scope

- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:src/shared/toml-inline-list.ts` — [{"after":[1,103]},{"after":[105,105]},{"after":[107,127]},{"after":[129,145]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:src/shared/__tests__/toml-inline-list.test.ts` — [{"after":[1,80]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:src/daemon/mcp-register.ts` — [{"after":[34,34]},{"after":[167,169]},{"after":[177,178]},{"after":[180,185]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:src/daemon/__tests__/mcp-register.test.ts` — [{"after":[443,476]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:vscode-plugin/src/hosts/toml-mcp-writer.ts` — [{"after":[17,17]},{"after":[111,118]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:vscode-plugin/src/hosts/__tests__/writers.test.ts` — [{"after":[243,296]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:vscode-plugin/src/hosts/__tests__/commands.test.ts` — [{"after":[129,130]},{"after":[140,140]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:src/shared/toml-inline-list.ts` — [{"after":[91,101]},{"after":[115,115]},{"after":[117,118]},{"after":[140,140]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:src/shared/__tests__/toml-inline-list.test.ts` — [{"after":[59,64]},{"after":[82,84]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:src/daemon/mcp-register.ts` — [{"after":[225,225]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:src/daemon/__tests__/mcp-register.test.ts` — [{"after":[470,478]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:vscode-plugin/src/hosts/toml-mcp-writer.ts` — [{"after":[26,26]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:vscode-plugin/src/hosts/__tests__/writers.test.ts` — [{"after":[288,293]}]

### Verified final scope: 16ee89dd357384b04a9e6389dfafa5f7f374ab87

Projection: 49ba3d75cecfffe04b1a445ed51acbdb3dc4579c05e5907c71d6aeff9a05796f · attribution: accepted

- `src/shared/toml-inline-list.ts` (e65d0c448761bc6920fdf923cf07e339ea312762) — selected: [{"after":[1,90]},{"after":[102,114]},{"after":[116,116]},{"after":[119,139]},{"after":[141,157]}]
- `src/shared/__tests__/toml-inline-list.test.ts` (c4a75b7df024e09aeeed9d98a58fb9070bc8a682) — selected: [{"after":[1,58]},{"after":[65,81]},{"after":[85,89]}]
- `src/daemon/mcp-register.ts` (9f5c840f0b9baaf1a8a680f936f13fbb1daa1ac7) — selected: [{"after":[34,34]},{"after":[167,169]},{"after":[177,178]},{"after":[180,185]}]
- `src/daemon/__tests__/mcp-register.test.ts` (3708824b70dbe0c03bf1c7c52fd8179dcc129d6d) — selected: [{"after":[443,469]},{"after":[479,485]}]
- `vscode-plugin/src/hosts/toml-mcp-writer.ts` (e850b2420a57bbdd0fef8d6a64f47ac23863b797) — selected: [{"after":[17,17]},{"after":[111,118]}]
- `vscode-plugin/src/hosts/__tests__/writers.test.ts` (4a95adb1cd6f985283f038e7b11e32dbf123a1b8) — selected: [{"after":[243,287]},{"after":[294,302]}]
- `vscode-plugin/src/hosts/__tests__/commands.test.ts` (238efc08fd74c0375739a1e14ae1f8ff47c1210d) — selected: [{"after":[129,130]},{"after":[140,140]}]
- `src/shared/toml-inline-list.ts` (e65d0c448761bc6920fdf923cf07e339ea312762) — selected: [{"after":[91,101]},{"after":[115,115]},{"after":[117,118]},{"after":[140,140]}]
- `src/shared/__tests__/toml-inline-list.test.ts` (c4a75b7df024e09aeeed9d98a58fb9070bc8a682) — selected: [{"after":[59,64]},{"after":[82,84]}]
- `src/daemon/mcp-register.ts` (9f5c840f0b9baaf1a8a680f936f13fbb1daa1ac7) — selected: [{"after":[225,225]}]
- `src/daemon/__tests__/mcp-register.test.ts` (3708824b70dbe0c03bf1c7c52fd8179dcc129d6d) — selected: [{"after":[470,478]}]
- `vscode-plugin/src/hosts/toml-mcp-writer.ts` (e850b2420a57bbdd0fef8d6a64f47ac23863b797) — selected: [{"after":[26,26]}]
- `vscode-plugin/src/hosts/__tests__/writers.test.ts` (4a95adb1cd6f985283f038e7b11e32dbf123a1b8) — selected: [{"after":[288,293]}]
- Task s1: initial; changes 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12; identity 8e7e9c12c4c76763987168f4b44613c61c13937097d7dc804643b62fea9dd48d

### s1: changes_requested

Completed inspection of all submitted segments, requirements, acceptance checks, and relevant test assertions. Two correctness gaps remain. The disclosed, user-accepted design and escaped-name limitations are not raised again.

Coverage: **verified** — Reviewed all submitted test bodies and relevant surrounding assertions against the full acceptance check: empty and non-empty conversion, server/settings preservation, mixed-form repair, quoted keys, idempotency, and failure without writes. Main paths have concrete output assertions. The two demonstrated edge-case coverage defects are described in findings. The import-boundary allowance is narrowly scoped and the shared helper has no imports. Reported test-version sources match the reviewed revision for all seven submitted files.

- **MED** `vscode-plugin/src/hosts/toml-mcp-writer.ts:113-118`: Converted multiline values can cause an unrelated server to be mistaken for insrc.
  For example, an inline docs entry with env = { TEXT = """\nname = "insrc"\n""" } is valid TOML. Conversion preserves that string, but the subsequent section-line scan treats its embedded name line as the server identity. The plugin replaces the docs entry, losing an existing server. The daemon likewise treats the converted entry as insrc and skips adding the actual server. Make identity detection string-aware, or refuse this unsupported form before writing. Existing tests cover punctuation inside single-line strings but do not assert this multiline preservation and registration behavior.
  Evidence: `16ee89dd357384b04a9e6389dfafa5f7f374ab87:src/shared/toml-inline-list.ts`, `16ee89dd357384b04a9e6389dfafa5f7f374ab87:vscode-plugin/src/hosts/toml-mcp-writer.ts`, `16ee89dd357384b04a9e6389dfafa5f7f374ab87:src/daemon/mcp-register.ts`, `16ee89dd357384b04a9e6389dfafa5f7f374ab87:src/shared/__tests__/toml-inline-list.test.ts`, `16ee89dd357384b04a9e6389dfafa5f7f374ab87:vscode-plugin/src/hosts/__tests__/writers.test.ts`, `16ee89dd357384b04a9e6389dfafa5f7f374ab87:src/daemon/__tests__/mcp-register.test.ts`
- **MED** `src/shared/toml-inline-list.ts:140-140`: The single-table guard misses escaped TOML key spellings and allows an invalid write.
  A config containing ["mcp\u005fservers"] followed by name = "docs" defines the same mcp_servers table as the guarded bare spelling. The regex misses it, and findRootAssignment stops at the header. Both writers then append [[mcp_servers]], producing conflicting table and array namespaces instead of refusing and preserving the file. Decode table-key spellings when checking conflicts. The refusal tests cover bare and directly quoted headers, but not escaped headers or writer-level preservation for this case.
  Evidence: `16ee89dd357384b04a9e6389dfafa5f7f374ab87:src/shared/toml-inline-list.ts`, `16ee89dd357384b04a9e6389dfafa5f7f374ab87:src/shared/__tests__/toml-inline-list.test.ts`, `16ee89dd357384b04a9e6389dfafa5f7f374ab87:src/daemon/mcp-register.ts`, `16ee89dd357384b04a9e6389dfafa5f7f374ab87:vscode-plugin/src/hosts/toml-mcp-writer.ts`, `16ee89dd357384b04a9e6389dfafa5f7f374ab87:docs/standalone/keep-vibe-configs-valid-when-registering-E20261109b9024260/ISSUE.md`

Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typecheck, or build were run by this reviewer. A focused reproduction command could not start because the read-only environment denied the shell's here-document temporary file; it was not retried. Findings are based on source traces.
- The pure shared helper, camelCase functions, PascalCase error class, and existing writer-owned filesystem access fit the inspected local conventions.

Inspected references:

- `16ee89dd357384b04a9e6389dfafa5f7f374ab87:docs/standalone/keep-vibe-configs-valid-when-registering-E20261109b9024260/ISSUE.md`
- `16ee89dd357384b04a9e6389dfafa5f7f374ab87:src/shared/toml-inline-list.ts`
- `16ee89dd357384b04a9e6389dfafa5f7f374ab87:src/shared/__tests__/toml-inline-list.test.ts`
- `16ee89dd357384b04a9e6389dfafa5f7f374ab87:src/daemon/mcp-register.ts`
- `16ee89dd357384b04a9e6389dfafa5f7f374ab87:src/daemon/__tests__/mcp-register.test.ts`
- `16ee89dd357384b04a9e6389dfafa5f7f374ab87:vscode-plugin/src/hosts/toml-mcp-writer.ts`
- `16ee89dd357384b04a9e6389dfafa5f7f374ab87:vscode-plugin/src/hosts/__tests__/writers.test.ts`
- `16ee89dd357384b04a9e6389dfafa5f7f374ab87:vscode-plugin/src/hosts/__tests__/commands.test.ts`
- `16ee89dd357384b04a9e6389dfafa5f7f374ab87:docs/standalone/keep-vibe-configs-valid-when-registering-E20261109b9024260/S001/TESTS.md`

Test: `npx tsx --test src/shared/__tests__/toml-inline-list.test.ts` — pass
Build-gate-reported execution on 739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca, not reviewer execution. Submitted source files are unchanged between that revision and the reviewed revision.

Test: `npx tsx --test src/daemon/__tests__/mcp-register.test.ts` — pass
Build-gate-reported execution on 739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca, not reviewer execution; submitted sources match the reviewed revision.

Test: `npx tsx --test vscode-plugin/src/hosts/__tests__/writers.test.ts` — pass
Build-gate-reported execution on 739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca, not reviewer execution; submitted sources match the reviewed revision.

Test: `npx tsx --test vscode-plugin/src/hosts/__tests__/commands.test.ts` — pass
Build-gate-reported execution on 739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca, not reviewer execution; submitted sources match the reviewed revision.

Test: `node --input-type=module (here-document)` — not_run
Shell rejected temporary-file creation before Node or any assertion executed. No retry.
## vibe-config-valid-s1 — attempt 2

Scope: whole story · reviewer: daemon · 2026-11-09T07:53:53.737Z

1 selected task assessment(s): changes_requested.

### Submitted scope

- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:src/shared/toml-inline-list.ts` — [{"after":[1,103]},{"after":[105,105]},{"after":[107,127]},{"after":[130,145]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:src/shared/__tests__/toml-inline-list.test.ts` — [{"after":[1,80]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:src/daemon/mcp-register.ts` — [{"after":[34,34]},{"after":[167,169]},{"after":[177,178]},{"after":[180,185]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:src/daemon/__tests__/mcp-register.test.ts` — [{"after":[443,476]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:vscode-plugin/src/hosts/toml-mcp-writer.ts` — [{"after":[17,17]},{"after":[111,118]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:vscode-plugin/src/hosts/__tests__/writers.test.ts` — [{"after":[243,296]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:vscode-plugin/src/hosts/__tests__/commands.test.ts` — [{"after":[129,130]},{"after":[140,140]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:src/shared/toml-inline-list.ts` — [{"after":[91,101]},{"after":[115,115]},{"after":[117,118]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:src/shared/__tests__/toml-inline-list.test.ts` — [{"after":[59,64]},{"after":[82,84]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:src/daemon/mcp-register.ts` — [{"after":[225,225]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:src/daemon/__tests__/mcp-register.test.ts` — [{"after":[470,478]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:vscode-plugin/src/hosts/toml-mcp-writer.ts` — [{"after":[26,26]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:vscode-plugin/src/hosts/__tests__/writers.test.ts` — [{"after":[288,293]}]
- `c571e6fe73f599d14f71b6d75ffaeddd2251c366:src/shared/toml-inline-list.ts` — [{"after":[128,129]},{"after":[142,143]}]
- `c571e6fe73f599d14f71b6d75ffaeddd2251c366:src/shared/__tests__/toml-inline-list.test.ts` — [{"after":[83,84]}]

### Verified final scope: 1c7b1fa99d107745c87ed3da581a84531fbf770b

Projection: d8b0318cfcb8c62f8515f96c10ca2acc79ba444ad76f44db20e6950b127d9f7c · attribution: accepted

- `src/shared/toml-inline-list.ts` (64a45e1a7fbfca65a85ca4eadd3be5c4701e7457) — selected: [{"after":[1,90]},{"after":[102,114]},{"after":[116,116]},{"after":[119,127]},{"after":[130,141]},{"after":[144,159]}]
- `src/shared/__tests__/toml-inline-list.test.ts` (df5441be58076d2624cc2c92782447a98270661e) — selected: [{"after":[1,58]},{"after":[65,81]},{"after":[87,91]}]
- `src/daemon/mcp-register.ts` (9f5c840f0b9baaf1a8a680f936f13fbb1daa1ac7) — selected: [{"after":[34,34]},{"after":[167,169]},{"after":[177,178]},{"after":[180,185]}]
- `src/daemon/__tests__/mcp-register.test.ts` (3708824b70dbe0c03bf1c7c52fd8179dcc129d6d) — selected: [{"after":[443,469]},{"after":[479,485]}]
- `vscode-plugin/src/hosts/toml-mcp-writer.ts` (e850b2420a57bbdd0fef8d6a64f47ac23863b797) — selected: [{"after":[17,17]},{"after":[111,118]}]
- `vscode-plugin/src/hosts/__tests__/writers.test.ts` (4a95adb1cd6f985283f038e7b11e32dbf123a1b8) — selected: [{"after":[243,287]},{"after":[294,302]}]
- `vscode-plugin/src/hosts/__tests__/commands.test.ts` (238efc08fd74c0375739a1e14ae1f8ff47c1210d) — selected: [{"after":[129,130]},{"after":[140,140]}]
- `src/shared/toml-inline-list.ts` (64a45e1a7fbfca65a85ca4eadd3be5c4701e7457) — selected: [{"after":[91,101]},{"after":[115,115]},{"after":[117,118]}]
- `src/shared/__tests__/toml-inline-list.test.ts` (df5441be58076d2624cc2c92782447a98270661e) — selected: [{"after":[59,64]},{"after":[82,82]},{"after":[85,86]}]
- `src/daemon/mcp-register.ts` (9f5c840f0b9baaf1a8a680f936f13fbb1daa1ac7) — selected: [{"after":[225,225]}]
- `src/daemon/__tests__/mcp-register.test.ts` (3708824b70dbe0c03bf1c7c52fd8179dcc129d6d) — selected: [{"after":[470,478]}]
- `vscode-plugin/src/hosts/toml-mcp-writer.ts` (e850b2420a57bbdd0fef8d6a64f47ac23863b797) — selected: [{"after":[26,26]}]
- `vscode-plugin/src/hosts/__tests__/writers.test.ts` (4a95adb1cd6f985283f038e7b11e32dbf123a1b8) — selected: [{"after":[288,293]}]
- `src/shared/toml-inline-list.ts` (64a45e1a7fbfca65a85ca4eadd3be5c4701e7457) — selected: [{"after":[128,129]},{"after":[142,143]}]
- `src/shared/__tests__/toml-inline-list.test.ts` (df5441be58076d2624cc2c92782447a98270661e) — selected: [{"after":[83,84]}]
- Task s1: reassess; changes 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14; identity b5db8cff0b68d5e2124f30a1f1bbf7391bdcff7ecc5cc47ac2d66609b6a6c3bd

All selected changes and supplied tests belong to s1, the single BUILD-derived review unit. Attempt 2 requires reassessment because the helper and regression tests changed to address attempt 1 findings.

### s1: changes_requested

Completed review of all submitted segments, requirements, acceptance checks, and relevant test assertions. Both prior findings are addressed. Two remaining input forms violate registration or safe-refusal requirements.

Coverage: **verified** — Inspected all submitted test bodies and relevant surrounding assertions across all four test files. Exact-output and write/no-write assertions cover empty and nonempty conversion, server/settings preservation, mixed-form repair, quoted keys, idempotency, and refusal. The new helper assertions cover both prior findings; writer exception paths establish refusal before writes. The import-boundary allowance names only the pure shared helper. The two demonstrated coverage gaps are recorded in findings. Reported test sources match the reviewed revision: the seven submitted files have no differences between c571e6fe73f599d14f71b6d75ffaeddd2251c366 and the pinned review commit.

- **MED** `src/shared/toml-inline-list.ts:128-129`: Single-line triple-quoted server names pass conversion but produce duplicate insrc entries.
  The valid input mcp_servers = [{ name = """insrc""", command = "node" }] contains no newline, so conversion accepts it. Both writers' identity expressions fail to recognise the triple-quoted name and append another insrc server. This violates registration exactly once and is distinct from the accepted escaped-name limitation. Recognise this string form or refuse it before writing. Existing assertions cover ordinary quoted names and multiline refusal, but not triple-quoted names without newlines.
  Evidence: `1c7b1fa99d107745c87ed3da581a84531fbf770b:src/shared/toml-inline-list.ts`, `1c7b1fa99d107745c87ed3da581a84531fbf770b:src/daemon/mcp-register.ts`, `1c7b1fa99d107745c87ed3da581a84531fbf770b:vscode-plugin/src/hosts/toml-mcp-writer.ts`, `1c7b1fa99d107745c87ed3da581a84531fbf770b:src/shared/__tests__/toml-inline-list.test.ts`, `1c7b1fa99d107745c87ed3da581a84531fbf770b:src/daemon/__tests__/mcp-register.test.ts`, `1c7b1fa99d107745c87ed3da581a84531fbf770b:vscode-plugin/src/hosts/__tests__/writers.test.ts`
- **MED** `src/shared/toml-inline-list.ts:115-115`: Whitespace around dotted-key separators bypasses the namespace conflict guard.
  For valid TOML mcp_servers . name = "docs", keyText returns the raw dotted spelling. It does not start with 'mcp_servers.', so the guard permits both writers to append [[mcp_servers]], conflicting with the existing table namespace and making the file invalid. Parse dotted-key components or conservatively refuse this spelling before writing. The refusal test asserts only mcp_servers.a without separator whitespace; neither writer asserts preservation for this case.
  Evidence: `1c7b1fa99d107745c87ed3da581a84531fbf770b:src/shared/toml-inline-list.ts`, `1c7b1fa99d107745c87ed3da581a84531fbf770b:src/shared/__tests__/toml-inline-list.test.ts`, `1c7b1fa99d107745c87ed3da581a84531fbf770b:src/daemon/mcp-register.ts`, `1c7b1fa99d107745c87ed3da581a84531fbf770b:vscode-plugin/src/hosts/toml-mcp-writer.ts`

Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typecheck, or build were run by this reviewer. Findings follow concrete source traces.
- The pure helper preserves writer ownership of filesystem state. Names such as findRootAssignment, entryBodyLines, readOrThrow, and TomlInlineListError follow the inspected local conventions. Public writer signatures remain compatible.
- The disclosed shared-helper design override, escaped-name limitation, already-invalid duplicate root assignments, and unchanged unregister behavior were considered and are not raised again.

Inspected references:

- `16ee89dd357384b04a9e6389dfafa5f7f374ab87:docs/standalone/keep-vibe-configs-valid-when-registering-E20261109b9024260/ISSUE.md`
- `1c7b1fa99d107745c87ed3da581a84531fbf770b:src/shared/toml-inline-list.ts`
- `1c7b1fa99d107745c87ed3da581a84531fbf770b:src/shared/__tests__/toml-inline-list.test.ts`
- `1c7b1fa99d107745c87ed3da581a84531fbf770b:src/daemon/mcp-register.ts`
- `1c7b1fa99d107745c87ed3da581a84531fbf770b:src/daemon/__tests__/mcp-register.test.ts`
- `1c7b1fa99d107745c87ed3da581a84531fbf770b:vscode-plugin/src/hosts/toml-mcp-writer.ts`
- `1c7b1fa99d107745c87ed3da581a84531fbf770b:vscode-plugin/src/hosts/__tests__/writers.test.ts`
- `1c7b1fa99d107745c87ed3da581a84531fbf770b:vscode-plugin/src/hosts/__tests__/commands.test.ts`
- `1c7b1fa99d107745c87ed3da581a84531fbf770b:docs/standalone/keep-vibe-configs-valid-when-registering-E20261109b9024260/S001/TESTS.md`

Test: `npx tsx --test src/shared/__tests__/toml-inline-list.test.ts` — pass
Build-gate-reported execution on c571e6fe73f599d14f71b6d75ffaeddd2251c366, not reviewer execution. Submitted sources match the pinned review revision.

Test: `npx tsx --test src/daemon/__tests__/mcp-register.test.ts` — pass
Build-gate-reported execution on c571e6fe73f599d14f71b6d75ffaeddd2251c366, not reviewer execution. Submitted sources match the pinned review revision.

Test: `npx tsx --test vscode-plugin/src/hosts/__tests__/writers.test.ts` — pass
Build-gate-reported execution on c571e6fe73f599d14f71b6d75ffaeddd2251c366, not reviewer execution. Submitted sources match the pinned review revision.

Test: `npx tsx --test vscode-plugin/src/hosts/__tests__/commands.test.ts` — pass
Build-gate-reported execution on c571e6fe73f599d14f71b6d75ffaeddd2251c366, not reviewer execution. Submitted sources match the pinned review revision.
## vibe-config-valid-s1 — attempt 3

Scope: whole story · reviewer: daemon · 2026-11-09T07:59:14.732Z

1 selected task assessment(s): changes_requested.

### Submitted scope

- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:src/shared/toml-inline-list.ts` — [{"after":[1,103]},{"after":[105,105]},{"after":[107,127]},{"after":[130,145]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:src/shared/__tests__/toml-inline-list.test.ts` — [{"after":[1,80]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:src/daemon/mcp-register.ts` — [{"after":[34,34]},{"after":[167,169]},{"after":[177,178]},{"after":[180,185]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:src/daemon/__tests__/mcp-register.test.ts` — [{"after":[443,476]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:vscode-plugin/src/hosts/toml-mcp-writer.ts` — [{"after":[17,17]},{"after":[111,118]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:vscode-plugin/src/hosts/__tests__/writers.test.ts` — [{"after":[243,296]}]
- `e15fcf080575a8ad29b2723d1abc6b5ae5e1eebf:vscode-plugin/src/hosts/__tests__/commands.test.ts` — [{"after":[129,130]},{"after":[140,140]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:src/shared/toml-inline-list.ts` — [{"after":[91,101]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:src/shared/__tests__/toml-inline-list.test.ts` — [{"after":[59,64]},{"after":[82,84]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:src/daemon/mcp-register.ts` — [{"after":[225,225]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:src/daemon/__tests__/mcp-register.test.ts` — [{"after":[470,478]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:vscode-plugin/src/hosts/toml-mcp-writer.ts` — [{"after":[26,26]}]
- `739e70e986c41bd0b7ac37ebfdc034c3ae55b9ca:vscode-plugin/src/hosts/__tests__/writers.test.ts` — [{"after":[288,293]}]
- `c571e6fe73f599d14f71b6d75ffaeddd2251c366:src/shared/toml-inline-list.ts` — [{"after":[128,129]}]
- `c571e6fe73f599d14f71b6d75ffaeddd2251c366:src/shared/__tests__/toml-inline-list.test.ts` — [{"after":[83,84]}]
- `62146456312d98459c82bf981fc9f4ae0c720f19:src/shared/toml-inline-list.ts` — [{"after":[102,107]},{"after":[121,121]},{"after":[123,124]},{"after":[132,148]},{"after":[155,155]},{"after":[166,171]}]
- `62146456312d98459c82bf981fc9f4ae0c720f19:src/shared/__tests__/toml-inline-list.test.ts` — [{"after":[65,69]},{"after":[92,99]}]

### Verified final scope: b453df0d7573f134bbfd65c8230474077ae05bad

Projection: 1eebfa727aa4767a9422675999cf94032947e8f4966b9dc4c86d1fdbde19646d · attribution: accepted

- `src/shared/toml-inline-list.ts` (8bd92a68ccead40d1024623e324c93c6876c58d8) — selected: [{"after":[1,90]},{"after":[108,120]},{"after":[122,122]},{"after":[125,131]},{"after":[149,150]},{"after":[153,154]},{"after":[156,165]},{"after":[172,187]}]
- `src/shared/__tests__/toml-inline-list.test.ts` (5f5995c60cf9000e863d4e00e900ebc9e497bbfb) — selected: [{"after":[1,58]},{"after":[70,86]},{"after":[100,104]}]
- `src/daemon/mcp-register.ts` (9f5c840f0b9baaf1a8a680f936f13fbb1daa1ac7) — selected: [{"after":[34,34]},{"after":[167,169]},{"after":[177,178]},{"after":[180,185]}]
- `src/daemon/__tests__/mcp-register.test.ts` (3708824b70dbe0c03bf1c7c52fd8179dcc129d6d) — selected: [{"after":[443,469]},{"after":[479,485]}]
- `vscode-plugin/src/hosts/toml-mcp-writer.ts` (e850b2420a57bbdd0fef8d6a64f47ac23863b797) — selected: [{"after":[17,17]},{"after":[111,118]}]
- `vscode-plugin/src/hosts/__tests__/writers.test.ts` (4a95adb1cd6f985283f038e7b11e32dbf123a1b8) — selected: [{"after":[243,287]},{"after":[294,302]}]
- `vscode-plugin/src/hosts/__tests__/commands.test.ts` (238efc08fd74c0375739a1e14ae1f8ff47c1210d) — selected: [{"after":[129,130]},{"after":[140,140]}]
- `src/shared/toml-inline-list.ts` (8bd92a68ccead40d1024623e324c93c6876c58d8) — selected: [{"after":[91,101]}]
- `src/shared/__tests__/toml-inline-list.test.ts` (5f5995c60cf9000e863d4e00e900ebc9e497bbfb) — selected: [{"after":[59,64]},{"after":[87,87]},{"after":[90,91]}]
- `src/daemon/mcp-register.ts` (9f5c840f0b9baaf1a8a680f936f13fbb1daa1ac7) — selected: [{"after":[225,225]}]
- `src/daemon/__tests__/mcp-register.test.ts` (3708824b70dbe0c03bf1c7c52fd8179dcc129d6d) — selected: [{"after":[470,478]}]
- `vscode-plugin/src/hosts/toml-mcp-writer.ts` (e850b2420a57bbdd0fef8d6a64f47ac23863b797) — selected: [{"after":[26,26]}]
- `vscode-plugin/src/hosts/__tests__/writers.test.ts` (4a95adb1cd6f985283f038e7b11e32dbf123a1b8) — selected: [{"after":[288,293]}]
- `src/shared/toml-inline-list.ts` (8bd92a68ccead40d1024623e324c93c6876c58d8) — selected: [{"after":[151,152]}]
- `src/shared/__tests__/toml-inline-list.test.ts` (5f5995c60cf9000e863d4e00e900ebc9e497bbfb) — selected: [{"after":[88,89]}]
- `src/shared/toml-inline-list.ts` (8bd92a68ccead40d1024623e324c93c6876c58d8) — selected: [{"after":[102,107]},{"after":[121,121]},{"after":[123,124]},{"after":[132,148]},{"after":[155,155]},{"after":[166,171]}]
- `src/shared/__tests__/toml-inline-list.test.ts` (5f5995c60cf9000e863d4e00e900ebc9e497bbfb) — selected: [{"after":[65,69]},{"after":[92,99]}]
- Task s1: reassess; changes 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16; identity 74efe1588b18a257f98563d8390fc8f7d9ee6cb9886570195bb862bda7642f59

All 17 selected changes and all four supplied tests belong to s1, the single BUILD-derived review unit. Updated helper behavior and regression evidence require reassessment.

### s1: changes_requested

Reviewed all submitted implementation segments, requirements, acceptance checks, and relevant test assertions. Prior findings are addressed, but two correctness gaps remain.

Coverage: **verified** — Inspected all submitted test bodies and relevant surrounding assertions in all four test files. Reviewed coverage of empty/nonempty conversion, preservation of servers and settings, mixed-form repair, quoted names and keys, idempotency, refusal without writes, and the import-boundary allowance. Exact-output and no-write assertions cover the principal paths. The two demonstrated edge-case coverage gaps are recorded in findings. The seven submitted source/test files have no differences between the reported test revision 62146456312d98459c82bf981fc9f4ae0c720f19 and the pinned review revision.

- **MED** `src/shared/toml-inline-list.ts:167-171`: Quoted sub-table components containing # or ] bypass the namespace conflict guard.
  For example, [mcp_servers."a#b"] followed by x = 1 defines a valid table namespace. The header regex excludes # and ] even inside quoted components, so it misses this header; findRootAssignment then stops at it. Both writers append [[mcp_servers]], producing a conflicting namespace and invalid TOML instead of refusing without writing. This concerns the new namespace guard, independently of the disclosed existing server-identity limitation. Refusal tests cover quoted components and ordinary sub-tables, but not punctuation inside quoted components.
  Evidence: `b453df0d7573f134bbfd65c8230474077ae05bad:src/shared/toml-inline-list.ts`, `b453df0d7573f134bbfd65c8230474077ae05bad:src/shared/__tests__/toml-inline-list.test.ts`, `b453df0d7573f134bbfd65c8230474077ae05bad:src/daemon/mcp-register.ts`, `b453df0d7573f134bbfd65c8230474077ae05bad:vscode-plugin/src/hosts/toml-mcp-writer.ts`
- **MED** `src/shared/toml-inline-list.ts:144-145`: Accepted plain quoted names can still fool the daemon into skipping insrc registration.
  The valid inline entry mcp_servers = [{ name = "insrc'docs", command = "docs" }] passes this restriction and converts successfully. The daemon identity regex independently accepts either quote as its closing delimiter and has no value-ending anchor, so it matches the prefix name = "insrc'. upsertVibeProjectServer writes only the converted docs entry and reports registered without adding insrc. Require identity matching with paired delimiters and a complete value, or refuse this form before conversion. Existing tests do not assert registration for names containing the opposite quote character.
  Evidence: `b453df0d7573f134bbfd65c8230474077ae05bad:src/shared/toml-inline-list.ts`, `b453df0d7573f134bbfd65c8230474077ae05bad:src/daemon/mcp-register.ts`, `b453df0d7573f134bbfd65c8230474077ae05bad:src/shared/__tests__/toml-inline-list.test.ts`, `b453df0d7573f134bbfd65c8230474077ae05bad:src/daemon/__tests__/mcp-register.test.ts`

Optional verification and advice (nonblocking):

- Optional execution: This reviewer did not run tests, integration checks, typechecks, or builds. Findings are based on source traces.
- The pure helper retains filesystem ownership in the writers. Names including firstComponent, findRootAssignment, entryBodyLines, readOrThrow, and TomlInlineListError follow the inspected TypeScript conventions; public signatures remain compatible.
- The disclosed design override, existing table-form identity limitations, duplicate root assignments, and unchanged unregister behavior were considered without reopening them.

Inspected references:

- `16ee89dd357384b04a9e6389dfafa5f7f374ab87:docs/standalone/keep-vibe-configs-valid-when-registering-E20261109b9024260/ISSUE.md`
- `b453df0d7573f134bbfd65c8230474077ae05bad:src/shared/toml-inline-list.ts`
- `b453df0d7573f134bbfd65c8230474077ae05bad:src/shared/__tests__/toml-inline-list.test.ts`
- `b453df0d7573f134bbfd65c8230474077ae05bad:src/daemon/mcp-register.ts`
- `b453df0d7573f134bbfd65c8230474077ae05bad:src/daemon/__tests__/mcp-register.test.ts`
- `b453df0d7573f134bbfd65c8230474077ae05bad:vscode-plugin/src/hosts/toml-mcp-writer.ts`
- `b453df0d7573f134bbfd65c8230474077ae05bad:vscode-plugin/src/hosts/__tests__/writers.test.ts`
- `b453df0d7573f134bbfd65c8230474077ae05bad:vscode-plugin/src/hosts/__tests__/commands.test.ts`
- `b453df0d7573f134bbfd65c8230474077ae05bad:docs/standalone/keep-vibe-configs-valid-when-registering-E20261109b9024260/S001/TESTS.md`

Test: `npx tsx --test src/shared/__tests__/toml-inline-list.test.ts` — pass
Build-gate-reported execution on 62146456312d98459c82bf981fc9f4ae0c720f19, not reviewer execution. Submitted sources match the pinned review revision.

Test: `npx tsx --test src/daemon/__tests__/mcp-register.test.ts` — pass
Build-gate-reported execution on 62146456312d98459c82bf981fc9f4ae0c720f19, not reviewer execution. Submitted sources match the pinned review revision.

Test: `npx tsx --test vscode-plugin/src/hosts/__tests__/writers.test.ts` — pass
Build-gate-reported execution on 62146456312d98459c82bf981fc9f4ae0c720f19, not reviewer execution. Submitted sources match the pinned review revision.

Test: `npx tsx --test vscode-plugin/src/hosts/__tests__/commands.test.ts` — pass
Build-gate-reported execution on 62146456312d98459c82bf981fc9f4ae0c720f19, not reviewer execution. Submitted sources match the pinned review revision.
