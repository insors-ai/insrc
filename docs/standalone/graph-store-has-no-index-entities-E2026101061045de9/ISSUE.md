<!-- insrc:artifact ISSUE-61045de91faef1a0 -->

# Reading the entities of one file or one repository scans the whole entity table

## Reproduction

Not seen as a failure; read from the code, and confirmed by the daemon's review of the design for ISSUE-008e146ad1475ef9. It can be shown without a model: register two repositories, index both, and ask the store for the entities of one file of the smaller one (or for the entities of the smaller repository), with a counter on the rows the read decodes. Observed (by reading): both reads pass over every row of the entity table, of both repositories, and decode each one; the read by file also works out each row's absolute path before comparing it. The cost of reading one file's entities grows with the size of the whole store, not with the size of the file. Expected: the entities of one file, and of one repository, are read by going to their rows, at a cost that grows with what is returned.

## Root cause

The graph store keeps entity rows keyed by a numeric id and has no index by repository or by file. findEntitiesByFile and listEntitiesForRepo (src/db/entities.ts) therefore iterate the whole range of the entity table and filter row by row: one on the row's repository id, the other on the absolute path computed from the row's repository and its repo-relative file path. The only by-file index the store has is for unresolved relations. The two reads are called from 24 source files outside the store (the analyzer's scope resolution and measure, most of the code runtimes and lookups, the indexer, the daemon and the workflow code), so the scan is paid on most requests. One of those callers needs only to know whether a repository holds any stored entity: the index check of the scope resolution (ensureNonEmptyClosure in src/analyze/context/invariants.ts) asks for every entity of the repository to answer that, on every code and docs request and on every plan task that resolves its scope. One run of a code request makes that check at least three times before it plans: when the request is measured (the measure resolves its scope through resolveTaskScope), when the run's context is built (src/analyze/context/driver.ts calls ensureNonEmptyClosure for a code run) and when the run checks its scope before planning (src/analyze/orchestrator/driver.ts calls resolveTaskScope). Resolving a symbol scope also scans the entity table, through the read of one file's entities (src/analyze/context/scope.ts).

## Fix intent

The store can return the entities of one file, and of one repository, without passing over the rows of other files and other repositories. The index that makes this possible is kept in step by every write and delete of entity rows, and a store already on disk is brought to the new form when the daemon opens it, without the user re-indexing. The two reads return what they return today, in content; callers do not change. The measure of a file-scoped request (ISSUE-008e146ad1475ef9), which today still scans the table for a file scope, then reads only that file's rows. The check whether a repository holds any stored entity is answered without building the repository's entities.

## Citations

- **[[c1]]** `code` `src/db/entities.ts` — "for (const { key, value } of store.entity.getRange()) {"
- **[[c2]]** `code` `src/db/entities.ts` — "if (toAbsolutePath(row.filePath, repoPath) !== file) continue;"
- **[[c3]]** `code` `src/db/graph/store.ts` — "unresolvedByFile:   open_('unresolved_by_file', { dupSort: true }),"
- **[[c4]]** `code` `src/db/graph/store.ts` — "export const SCHEMA_VERSION = 4;"
- **[[c5]]** `prior-artifact` `docs/standalone/defect-analyzer-s-request-measure-src-E20261010008e146a/S001/LLD.md` — "findEntitiesByFile (src/db/entities.ts:795-811) has no file index. It walks the whole entity table of every registered repository"
