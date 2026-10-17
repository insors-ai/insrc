# T001 pre-split characterization record

Before `resolveGithubConfig` was split, the two characterization tests of
`src/workflow/config/__tests__/github-split.test.ts` were run against the unchanged
parent code (commit 8891f928 plus the docs commit, `github.ts` untouched), using a
temporary copy of the test that did not import `resolveGithubConfigFromFile` and
compared `resolveGithubConfig` with itself. Result on the unchanged code:

```
✔ resolveGithubConfig returns none for a missing, unreadable, invalid-JSON and non-object file
✔ characterization of a null own entry and a null default is unchanged by the split
ℹ tests 2  ℹ pass 2  ℹ fail 0
```

That run pinned today's behaviour: loader-rejected inputs resolve to
`{ type: 'none', source: 'default-config' }`, and a null own entry or a null default
throws `TypeError` (the resolver reads `entry.type`). After the split the committed
test compares `resolveGithubConfigFromFile` with `resolveGithubConfig` for the same
inputs and passes, so the split adds neither a new throw nor a new swallow.
