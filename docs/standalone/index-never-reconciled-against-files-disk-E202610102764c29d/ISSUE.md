<!-- insrc:artifact ISSUE-2764c29d7ccb66a5 -->

# The index keeps the entities of files that are deleted or are now ignored

## Reproduction

Seen on 2026-10-10 by asking the running daemon for the stored entities of single files of this repository. It returned 7 entities for `out/daemon/index.js`, 11 for `out/analyze/classifier/scope-picker.js` and 5 for `out/prompts/analyze/scope-picker.system.md`, although `out/` is listed in `.gitignore` and in the repository's own ignore list (`.insrc/config.json`). It returned 8 entities for `vscode-plugin/src/chat/__tests__/chat-view-channel.test.ts`, a file that no longer exists on disk. The repository's statistics count 503 JavaScript files in a repository whose sources are TypeScript. Effects seen earlier: a whole-repository analysis named `out/prompts/analyze/scope-picker.system.md` as a file of the repository, and a lookup skipped the deleted test file because it could not be read. Expected: the index holds entities only for files that exist and that the repository's ignore list does not exclude.

## Root cause

The indexer adds and updates; it does not reconcile. Its full pass and its changed-files pass each list the repository's files through the ignore list and index what the list holds; neither compares the index with that list, so an entity whose file is no longer in the list is never removed. Entities of a file are removed in one case only: when the file watcher reports that the file was deleted while the daemon was running and watching. A file deleted while the daemon was stopped, or a directory added to the ignore list after it was indexed, therefore stays in the index for good. How the files under `out/` first entered the index was not established; that nothing removes them is.

## Fix intent

The index holds entities only for files that exist on disk and are not excluded by the repository's ignore list. Entities of a file that was deleted while the daemon was not watching, and of a file in a directory that has since been ignored, are removed together with what was derived from them (their relations and their vectors), without the user re-registering the repository. A repository already indexed is brought to that state when the daemon next indexes it. The counts a request is sized by, and the files an analysis can name, then no longer include build output or deleted files.

## Citations

- **[[c1]]** `code` `src/indexer/index.ts` — "const files = listRepoFiles(repoPath, resolveRepoIgnore(repoPath));"
- **[[c2]]** `code` `src/indexer/index.ts` — "await deleteEntitiesForFile(this.db, filePath);"
- **[[c3]]** `code` `src/indexer/repo-ignore-config.ts` — "export function resolveRepoIgnore(repoRoot: string): string[] {"
- **[[c4]]** `doc` `docs/plans/handover-2026-10-10.md` — "`out/` is ignored by git and still indexed, so an"
