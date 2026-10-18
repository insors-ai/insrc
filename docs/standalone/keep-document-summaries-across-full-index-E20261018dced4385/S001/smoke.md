# Smoke: ISSUE-dced4385 S001/t6 on the installed daemon

2026-10-18, the installed daemon at `~/.insrc/daemon`, updated to 0fb0c2b7 (this Story's t1–t5 pushed to main).
Times are UTC. Counts with the daemon stopped come from a read-only open of `~/.insrc/graph.lmdb`
(`doc_summary_by_repo` entries per repository); everything else is from IPC replies and the daemon log.

## Ship

- `git push origin main` (13 commits), then the maintenance update: sync, build, config reconcile; daemon restarted (pid 39216).
- Start-up: every repository `ready` and complete; no full index queued.

## Restore from the 2026-10-16 backup

Backup: `/Users/subhagho/.insrc/backup/graph.lmdb.schema-v4.2026-10-16T16-59-39-955Z` (279,134,208 bytes).

Summary rows per repository, daemon stopped:

| Repository | Before the restore | After the restore |
|---|---:|---:|
| /Users/subhagho/work/projects/insors/insrc | 321 | 10,996 |
| /Users/subhagho/work/projects/insors-ai/insors-extraction | 0 | 7,910 |
| /Users/subhagho/work/projects/FieldML | 0 | 2,637 |
| /Users/subhagho/work/projects/AFM | 0 | 718 |
| /Users/subhagho/work/projects/findme | 0 | 10 |
| /Users/subhagho/work/projects/insors/odr-website | 0 | 6 |
| **Total** | **321** | **22,277** |

`docSummary.restoreFromBackup`:

| Run | read | written | alreadyPresent | entityGone | bodyChanged | undecodable | elapsed |
|---|---:|---:|---:|---:|---:|---:|---:|
| first | 22,216 | 21,993 | 167 | 43 | 13 | 0 | 686 ms |
| second | 22,216 | 0 | 22,160 | 43 | 13 | 0 | 496 ms |

- The backup's SHA-256 is `339938a416edae3d004056d0fb2cb1edf93c16cd50ba98b5be743d5d8437db42` before and after both runs. The read-only open left a lock file beside it (`…-955Z-lock`, 8,200 bytes); the backup itself is unchanged.
- The total after (22,277) is 37 below 321 + 21,993. Not investigated; the likely cause is the 26 per-file index jobs start-up queued replacing sections whose text had changed (a per-file reindex drops the summary of a changed section).

## Reindex of this repository (the carry end to end)

`repo.reindex` for `/Users/subhagho/work/projects/insors/insrc` at 12:14:54:

| Log line | Figures |
|---|---|
| 12:15:39 `full index: repository rows deleted` | returnedToPending 0, **carriedDocSummaries 10,996** |
| 12:56:44 `full index: carried document summaries written back` | **written 10,996**, entityGone 0, bodyChanged 0 |
| 12:56:44 `full index complete` | fileCount 3,385, elapsed 2,509.4 s |

- Before the reindex this repository held 10,996 summaries; all 10,996 were written back. No document was changed or deleted in between, so the difference is 0, as expected.
- The summariser wrote nothing while the reindex ran (log lines between the two figures above).
- The sweep that followed (15,384 documents and sections): by 13:45, 2,220 skipped as unchanged and 70 summarised. Before this fix the same sweep re-summarised every document at about 35 s each.
