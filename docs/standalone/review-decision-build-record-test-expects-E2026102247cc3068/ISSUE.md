<!-- insrc:artifact ISSUE-47cc3068c78cac34 -->

# review-decision BUILD-record test expects an unresolved temporary path and fails on macOS

## Reproduction

On macOS, run npx tsx --test src/workflow/__tests__/review-decision.test.ts. The test 'handleReviewDecision on a BUILD record: approve goes through the same approve call as any record ...' fails. Observed: the approve call receives artifactPath '/private/var/folders/.../BUILD-...-S001.json'. Expected by the test: '/var/folders/.../BUILD-...-S001.json'. The other tests in the file pass.

## Root cause

The test builds its repository with mkdtempSync(join(tmpdir(), ...)), and on macOS tmpdir() is /var/folders/..., a symlink to /private/var/folders/.... handleReviewDecision resolves the artifact markdown to its real path (resolveDocsMarkdown, the guard against a symlink escaping docs/) and passes the JSON beside that real path to the approve call. The handler is right; the test's expected path is the unresolved one.

## Fix intent

The test expects the path the handler uses, by working in its temporary repository's real path. No production code changes, and the assertion keeps its meaning: the approve call receives the repository and the record.

## Citations

- **[[c1]]** `code` `src/workflow/review-decision.ts:117-131` — "const realMd = located.realPath;"
- **[[c2]]** `code` `src/workflow/review-decision.ts:164` — "const res = await (deps.approve ?? approveWorkflowTarget)({ repoPath, artifactPath: jsonPath });"
- **[[c3]]** `code` `src/workflow/__tests__/review-decision.test.ts:436` — "const repo = mkdtempSync(join(tmpdir(), 'insrc-review-decision-build-'));"
- **[[c4]]** `code` `src/workflow/__tests__/review-decision.test.ts:458` — "assert.deepEqual(calls, [{ repoPath: repo, artifactPath: jsonPath }], 'the same call as for any record: the repository and the record');"
