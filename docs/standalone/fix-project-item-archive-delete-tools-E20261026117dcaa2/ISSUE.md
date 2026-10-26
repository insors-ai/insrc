<!-- insrc:artifact ISSUE-117dcaa2402ba54c -->

# Fix the project item archive and delete tools, the dash check on two gh families, and an open test handle

## Reproduction

1) Call gh:project:item-archive or gh:project:item-delete with projectId and itemId on gh 2.46.0: the command runs 'gh project item-archive --project-id ... --id ...' and gh rejects the unknown flag --project-id (gh takes the project number as a positional: 'gh project item-archive [<number>] --id ITEM --owner OWNER'). 2) Call a tool of the manage or resources gh families with a positional argument that starts with '-': it is not refused, so gh would read it as a flag; the same call to an account family is refused. 3) Run 'npx tsx --test src/daemon/tools/builtins/gh/__tests__/gh-typed-call.test.ts' without --test-force-exit: the file passes but the process takes about 60 s to exit.

## Root cause

1) The two tools in src/daemon/tools/builtins/gh/project.ts were modelled on gh project item-edit, which has a --project-id flag, but item-archive and item-delete do not; they take the project number. 2) defineGhFamily in src/daemon/tools/builtins/gh/op-table.ts only applies the leading-dash positional check when the family passes dashSafe: true, and only the account families in src/daemon/tools/builtins/gh/account.ts pass it. 3) The open handle in src/daemon/tools/builtins/gh/__tests__/gh-typed-call.test.ts is not yet located; the test loops 46 tools twice through the fake gh (src/daemon/tools/builtins/gh/__tests__/_fakegh.ts) and the approval gate, so the candidate is a timer or child process left by the call path or the fake; it will be found during the build by running the file with active-handle tracing.

## Fix intent

1) Make gh:project:item-archive and gh:project:item-delete take the project number as a positional instead of --project-id, update their input and output schemas, coverage, and tests so the argv matches gh 2.46.0. 2) Turn dashSafe on for the manage and resources families, with tests that a positional starting with '-' is refused. 3) Locate the handle that keeps gh-typed-call.test.ts alive and close it so the file exits promptly without --test-force-exit.

## Citations

- **[[c1]]** `code` `src/daemon/tools/builtins/gh/project.ts` — "ghProjectItemUpdateTool builds item-edit with --project-id; item-archive and item-delete build the same flag"
- **[[c2]]** `code` `src/daemon/tools/builtins/gh/op-table.ts:405` — "defineGhFamily(spec: { id, description, ops, dashSafe?: boolean })"
- **[[c3]]** `code` `src/daemon/tools/builtins/gh/account.ts:113` — "dashSafe: true on gh_search, gh_ruleset, gh_org, gh_auth, gh_status, gh_codespace, gh_config, gh_extension"
- **[[c4]]** `code` `src/daemon/tools/builtins/gh/__tests__/gh-typed-call.test.ts:16`
