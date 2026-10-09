# Measurement: a vector query with a list of entity ids (Story s7, task t8)

Taken on 2026-10-09, before task t8 was submitted to the gate.

**Question.** The vector search's filter gains a list of entity ids, so that for
an area the nearest hits are the nearest within the area. Does one condition
take as many ids as the largest directory of this repository holds, or must the
ids be sent in batches?

**Where it was run.** Against a copy of this repository's stored vector table.
`~/.insrc/lance/entity_vec.lance` (472 MB) was copied with `cp -R` to
`/tmp/insrc-lance-copy/`, and a throwaway script opened the copy with
`@lancedb/lancedb` under Node 22. The store the daemon holds was not opened by
a second process. The copy held 78,218 rows and a vector index on `embedding`.

**How many ids.** The vector table holds no file path, so a directory's ids
cannot be picked from it alone. The list used is larger than any directory can
give: every document, section and config vector of this repository, 12,442 ids.
A second run used every vector of the repository of any kind, 36,117 ids.

**Result.** Each query asked for 60 hits, with the query vector of a stored
section, the repo condition and `id IN (...)` in one `where`.

| ids in the list | answered | time (first run, second run) | length of the condition |
|---|---|---|---|
| none (the query as before) | 60 hits | 150 ms, 24 ms | 129 chars |
| 100 | 60 hits | 29 ms, 29 ms | 3,740 chars |
| 1,000 | 60 hits | 41 ms, 30 ms | 36,140 chars |
| 5,000 | 60 hits | 35 ms, 39 ms | 180,140 chars |
| 12,442 (every doc-kind vector) | 60 hits | 76 ms, 45 ms | 448,052 chars |
| 20,000 (any kind) | 60 hits | 56 ms | 720,065 chars |
| 36,117 (every vector of the repo) | 60 hits | 103 ms | 1,300,277 chars |

With the list holding every doc-kind id, the 20 nearest hits were the same ids
in the same order as without a list.

**Decision.** One query takes them: nothing was refused and nothing was slow.
The ids are sent in one condition; no batches, and no id is left out.
`searchEntityVecs` records this beside the filter's type.

**Limits of the measurement.** One machine, one table, one query vector, and a
copy taken while the daemon was running. The copy's hits were not compared with
the live store's.
