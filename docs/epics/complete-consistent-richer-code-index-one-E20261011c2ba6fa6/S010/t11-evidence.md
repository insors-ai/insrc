# S010 t11 — live measurement and installed-daemon smoke (2026-11-04)

The installed daemon (`~/.insrc/daemon`) ran a21ea79d (s10 complete, pushed). Requests were sent over daemon IPC with `rpc()` from the daemon's own `out/shared/ipc-client.js`.

## Live measurement on this repository against the hand-checked set

- **Before:** a full reindex of this repository (`repo.reindex`), so every stored document carries the links it writes. It finished with status `ready`, 5,103 files, generation 23,173.
- **Request:** `docRelations.measure { repoPath: <this repo> }` answered `{ queued: true, setHash: 9b19488b…a75, checked: 961 }`.
  - The set (`.insrc/doc-relations-checked.json`, approved by the user) has 1,140 real links from 27 documents. 179 of them are links the documents already write, so 961 links are implied.
- **Model:** the mid tier's CLI provider, `gpt-6.1-sol` (cli-codex), one document at a time on the summary lane.
- **Recorded** 2026-11-04T18:12:16Z (daemon log, `doc-relations measurement recorded`):

| Figure | Value |
|---|---|
| implied links (checked) | 961 |
| admitted proposals | 185 |
| admitted and real | 144 |
| admitted and implied (found) | 144 |
| precision | 0.778 (144 / 185) |
| recall | 0.150 (144 / 961) |
| extractedRecovery | 1.0 |

- **Switch:** `off`. The bar is ≥ 100 implied links (met), precision ≥ 0.95 (not met) and recall ≥ 0.60 (not met).
  - As lc1 states, a result below the bar is a valid outcome: the capability stays off and the figures are recorded.
  - Readers do not see model proposals while the switch is off; written links (`extracted`) are unaffected.
- **repo.stats** for this repository after the measurement:

```json
"docRelations": {
  "switch": "off",
  "figures": { "checked": 961, "precision": 0.7783783783783784, "recall": 0.14984391259105098,
               "extractedRecovery": 1, "modelId": "gpt-6.1-sol", "measuredAt": "2026-11-04T18:12:16.642Z" },
  "extraction": { "state": "ok", "examined": 0, "failed": 0, "updatedAt": "2026-11-04T18:12:16.643Z" }
}
```

- **Three earlier requests** (16:50, 22:05 and the one before a daemon update) were dropped by daemon restarts before they ran. The job queue is in memory, and nothing reports a lost measurement job. Noted as a follow-up, not filed.

### Re-measurement after the code-review fix (2026-11-05)

Code review round 1 found that the pass dropped a symbol proposal (`path#symbol`) whenever the document already linked the symbol's file (MED). Those links still counted as implied, so they could never be found and recall was pushed down by construction. Fixed in 5c5bc0cf1. The installed daemon was updated to 5c5bc0cf and the measurement ran again, with the same set (hash 9b19488b…a75) and the same model:

| Figure | First run (18:12Z, before the fix) | Re-run (04:27Z, after the fix) |
|---|---|---|
| implied links (checked) | 961 | 961 |
| admitted proposals | 185 | 165 |
| admitted and real | 144 | 131 |
| found (implied) | 144 | 131 |
| precision | 0.778 | 0.794 |
| recall | 0.150 | 0.136 |
| extractedRecovery | 1.0 | 1.0 |

- **Switch:** `off` after both runs (the bar is precision ≥ 0.95, recall ≥ 0.60).
- **Why recall is lower on the re-run:** the model proposed fewer links this run (165 against 185). The fix can only admit proposals the old rule dropped; it never removes one. Either way the recorded figures (the re-run's) sit far below the bar. The capability stays off, which is the valid lc1 outcome.

## Installed-daemon smoke

- **Written links:** `search.doc_relations { entityId, direction: 'out' }` on the sections of `docs/workflow.md` (entities from `search.by_file`) returned `REFERENCES` rows with `evidence: 'extracted'`, at generation 23,173 with 0 stale proposals.
  - "Install" → `docs/daemon.md` (`01b4493f…697`, resolved with `entity.summary`), which the section does link to.
  - The same holds for "insrc workflow framework" (2), "Register the MCP server", "Add the steering block" (2), "Per-output model attribution" and "Can I re-run a workflow after approval?".
- **State with its reason, live.** For one run I pointed the registered repository `findme` (complete graph) at the cheap tier: `config.write models.byRepo[<findme>].tasks['indexer.docRelations'] = 'cheap'`, then a daemon restart and `repo.reindex`. Its pass recorded the cause, and `repo.stats` on the installed daemon returned:

```json
"docRelations": { "switch": "not-measured",
  "extraction": { "state": "unavailable",
                  "reason": "indexer.docRelations is assigned to tier cheap; this capability runs only on the mid tier",
                  "examined": 0, "failed": 0, "updatedAt": "2026-11-04T19:29:03.293Z" } }
```

  The override was then removed (`config.write models.byRepo[<findme>] = null`). The loader checked afterwards: `findme` resolves to tier mid, `gpt-6.1-sol`.
- **Status before measuring:** `repo.stats` reported `docRelations: { switch: 'not-measured' }`; after measuring, the block above.
  - The cause path (`extraction.state 'unavailable'` with its reason) is covered by the t10 integration test. It was not produced live here, because the provider was available.
- **The pass on the installed daemon:**
  - It examined documents of registered repositories whose graph is complete. Examples: insors-extraction `README.md`, 9 admitted; in one hour, AFM 58 documents and FieldML 26.
  - It does not examine this repository. 5 relationships point at files an ignore rule excludes, so the graph is not complete, which is the sc1 gate as designed.

## Full sweep

See `t11-sweep.md`.
