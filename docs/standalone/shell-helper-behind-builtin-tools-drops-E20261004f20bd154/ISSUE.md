<!-- insrc:artifact ISSUE-f20bd1548038128c -->

# Keep capped tool output up to the cap and report truncation

## Reproduction

Run the `git_diff` tool over a diff larger than its size cap.

Observed on 2026-10-04 while building ISSUE-5f7a7cb95b643ae5: a range whose diff was about 8 KB, read with `maxBytes: 1024`, came back with an EMPTY diff body and `truncated: false`. The file list (which comes from a separate command) still named both changed files.

Expected: the body holds the first `maxBytes` of the diff and `truncated` is true.

Actual: everything from the first chunk that crosses the cap onward is discarded, including the part of that chunk that would have fit. When the whole diff arrives in one chunk larger than the cap, nothing is kept. The returned body is then shorter than the cap, so the tool reports that it was not truncated.

## Root cause

Two pieces of code disagree about what a cap means.

1. The shared shell helper counts output bytes as they arrive and appends a chunk only while the running total is still within the cap. A chunk that takes the total past the cap is dropped whole, and so is every later chunk. The helper's result carries no field saying that output was dropped.

2. The `git_diff` tool has no truncation signal to read, so it infers one: it treats the output as truncated when its length is at least the cap. Because the helper drops the crossing chunk whole, the kept output is normally SHORTER than the cap, so the inference says false exactly when truncation happened.

The helper is shared by about 60 builtin tool files, so the same chunk-dropping applies to every tool that passes a cap, and any other tool that infers truncation from output length has the same blind spot.

## Fix intent

Make a capped read keep the output up to the cap and say when it cut something off, and make `git_diff` report truncation from that statement rather than from the output's length.

- The shell helper keeps the part of the crossing chunk that fits, for both output streams.
- The helper's result says whether each stream was truncated.
- `git_diff` reports `truncated` from the helper's statement.
- Other builtin tools that infer truncation from output length are found and switched to the same statement.
- A tool call whose output is within its cap behaves exactly as it does today.

Whether a multi-byte character split at the cap boundary is trimmed, and how the new result field is named, are design decisions for the next stage.

## Citations

- **[[c1]]** `code` `src/daemon/tools/shell-helper.ts` — "if (stdoutBytes <= maxBytes) { stdout += chunk.toString('utf8'); }"
- **[[c2]]** `code` `src/daemon/tools/builtins/git/diff.ts` — "const truncated = diff.stdout.length >= maxBytes;"
- **[[c3]]** `code` `src/daemon/tools/builtins/git/__tests__/diff.test.ts` — "an over-cap diff can come back SHORTER"
- **[[c4]]** `stakeholder` `user, 2026-10-04` — "log this as an issue first"
