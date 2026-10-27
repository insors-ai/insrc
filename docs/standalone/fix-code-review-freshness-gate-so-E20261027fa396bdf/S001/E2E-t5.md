# s1/t5 live check (builder-reported, 2026-10-27)

**Setup.** The shared daemon (pid 2316252) runs from `~/.insrc/daemon`, a checkout synced from GitHub origin, so restarting it would not load these unpushed commits. A second daemon was started from this working tree (HEAD ae156482d plus another session's uncommitted edits, `node --import tsx/esm src/daemon/index.ts`) under an isolated `HOME=/tmp/s1-home` (own socket and store). A temp repo `/tmp/s1-repo` (`src/base.ts`) was added with `repo.add` and left until idle. Each check polled `codeReview.freshness` (repo `/tmp/s1-repo`, epic `fa396bdf197b8e8b`, story `s1`) every second until the file was not stale. The temp daemon and both temp directories were removed afterwards.

**Idle baseline** (6 polls, 10 s apart, `changedFiles: ["src/base.ts"]`), each reply:
`{"isProcessing": false, "inFlight": false, "pendingCodeIndexJobs": 0, "staleFiles": [], "unindexedFiles": []}`

**Check 1 — `mkdir -p dir/sub` with `first.ts` written at once** (`changedFiles: ["dir/sub/first.ts"]`), reply when first not stale, after 1.0 s:
`{'isProcessing': False, 'inFlight': False, 'pendingCodeIndexJobs': 0, 'staleFiles': [], 'unindexedFiles': []}`

**Check 1b — `second.ts` written in the same directory 3 s later, no restart** (`changedFiles: ["dir/sub/second.ts"]`), reply after 1.0 s:
`{'isProcessing': False, 'inFlight': False, 'pendingCodeIndexJobs': 0, 'staleFiles': [], 'unindexedFiles': []}`

**Check 2 — append to the already indexed `src/base.ts`** (`changedFiles: ["src/base.ts"]`), reply after 1.0 s:
`{'isProcessing': False, 'inFlight': False, 'pendingCodeIndexJobs': 0, 'staleFiles': [], 'unindexedFiles': []}`

The daemon output held no "could not watch a new directory" warning. A file with no entities is stale until entities exist, so a not-stale reply for the new `.ts` files means they were indexed.

**Not shown by these replies:** whether the watcher event or the gate's own request caused each indexing. The first poll of each check was not recorded, so the reply that listed the file in `unindexedFiles` (if any) is not quoted.
