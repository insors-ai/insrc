# Check on the installed daemon — ISSUE-2764c29d S001/t5

Run by the builder on 2026-10-10 against the installed daemon, asked over its
socket with `search.by_file` and `repo.stats`. No model was called.
The daemon was updated from `da1fae76` to `48c98646` and restarted between the
two readings.

## This repository, before and after

| What | Before | After |
| :--- | ---: | ---: |
| Entities of `out/db/entities.js` (on disk, under ignored `out`) | 45 | 0 |
| Entities of `out/shared/logger.js` | 10 | 0 |
| Entities of `out/indexer/index.js` | 27 | 0 |
| Entities of `out/daemon/queue.js` | 7 | 0 |
| Entities of `vscode-plugin/src/chat/__tests__/chat-view-channel.test.ts` (not on disk) | 8 | 0 |
| Entities of `src/db/entities.ts` (source; edited by this Story) | 49 | 50 |
| Entities of `src/indexer/index.ts` (source; edited by this Story) | 28 | 39 |
| Files in the index | 4680 | 2647 |
| JavaScript files | 503 | 12 |
| TypeScript files | 1791 | 1305 |
| JSON files | 1019 | 72 |
| Entities | 42634 | 34351 |
| Relations | 78734 | 66710 |

The daemon's log line for the pass: `index clean-up complete` with
`compared: 4706, removedAbsent: 33, removedIgnored: 2026, notChecked: 0`,
preceded by one `cross-file pass after index clean-up`.
4706 - 33 - 2026 = 2647, the file count after.

## Cross-check against the file listing

The listing (`git ls-files --cached --others --exclude-standard`, less any path
with a segment in this repository's ignore list) holds 1312 `.ts`/`.tsx` files
and 12 `.js`/`.mjs` files; the index now holds 1305 and 12. The fall in
TypeScript files is the 654 `.d.ts` files under `out/`.

## Consequences seen

- The 21 tracked source files under `src/workflow/runners/build/` and
  `src/prompts/build/` are no longer in the index: `build` is in this
  repository's ignore list and the rule matches a path segment at any depth.
  Before, the index held copies of them from 2026-07-19.
- The two `externalEndpoint` entities are gone (2 before, 0 after). Not traced;
  the endpoint pass removes endpoints that no caller refers to any more.
- Other registered repositories were cleaned by the same start: FieldML
  (88 ignored files removed), AFM (27), findme (1); insors-extraction and
  odr-website had nothing stale.
