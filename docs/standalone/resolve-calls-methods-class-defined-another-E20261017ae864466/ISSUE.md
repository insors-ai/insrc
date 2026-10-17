<!-- insrc:artifact ISSUE-ae864466e7f1f4ea -->

# Resolve calls to methods of a class defined in another file

## Reproduction

In a TypeScript repository, file a.ts imports { Queue } from './queue.js', creates const q = new Queue() and calls q.enqueue(job); queue.ts defines export class Queue { enqueue(job) { ... } }. Index both files and run the cross-file pass, then ask for the callers of Queue.enqueue. Observed: none; the CALLS row from a.ts to 'enqueue' stays unresolved. Observed on 2026-10-17 in this repository: the code review of Story b94cf2c9 reported empty testsReaching for every IndexQueue and IndexerService method although src/daemon/__tests__/queue-lanes.test.ts and src/indexer/__tests__/summary-sweep-progress.test.ts call them. Expected: the call is an edge from a.ts's caller to Queue.enqueue, as a call to an exported function in an imported file is today.

## Root cause

The TypeScript parser writes method entities without isExported: extractMethod, called for each method of a class from extractClass (src/indexer/parser/typescript.ts:364), sets no isExported on the entity it writes. The cross-file step of resolveCall accepts a candidate in an imported file only when its isExported is true (src/indexer/cross-file-resolver.ts:506), although methods are call targets (src/indexer/cross-file-resolver.ts:72). So every method of a class in another file is invisible to cross-file resolution; same-file method calls are unaffected because the same-file step does not check isExported.

## Fix intent

A method of an exported class is visible, through the existing import-scoped rule, to the files that import that class's file; a private method (TypeScript private modifier or a #name) stays invisible. A call x.method() then resolves when exactly one such method is visible through the caller's imports, and is recorded ambiguous with its candidates when several are, never guessed. Parsers other than TypeScript/JavaScript are out of scope (Epic c2ba6fa6 s12).

## Citations

- **[[c1]]** `code` `src/indexer/parser/typescript.ts:364` — "extractMethod(member, source, repo, repoId, filePath, lang, fileId, id, name, now, entities, relations);"
- **[[c2]]** `code` `src/indexer/cross-file-resolver.ts:506` — "if (e.isExported !== true) continue;"
- **[[c3]]** `code` `src/indexer/cross-file-resolver.ts:72` — "const CALL_TARGET_KINDS: readonly EntityKind[] = ['function', 'method', 'class'];"
- **[[c4]]** `prior-artifact` `.insrc/artifacts/CR-b94cf2c9058fd82a-S001.json (round 1, 2026-10-17): empty testsReaching for IndexQueue and IndexerService methods`
