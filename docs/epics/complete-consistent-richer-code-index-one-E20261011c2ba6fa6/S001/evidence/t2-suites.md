# s1/t2 evidence: src/db, src/indexer and src/daemon suites

commit 246077cb, 2026-10-16T13:06:20Z. Mutations run by hand: the recount on open disabled -> 'recount on open corrects a hand-edited count...' fails; 'unwritable === 0' dropped from the formula -> the table test fails. Both restored. The new test file typechecks with a config that includes it.

```
ok 1 - mapper: table covers every AnalyzeRunEvent variant exactly once (exhaustive)
ok 2 - mapper: stage variants -> StageProgressEvent{operation:analyze.run,total:null,index}
ok 3 - mapper: specific stageId/stageLabel derivations
ok 4 - mapper: llm-token + all sub-events + done -> null (no throw)
ok 5 - mapper: malformed / unknown input -> null, never throws
ok 6 - emitter: stage events -> progress frames; sub-events/llm-token emit nothing; zero delta frames
ok 7 - emitter: repeated stages still advance the counter
ok 8 - emitter: a send that throws EPIPE on the Nth call does not abort the run
ok 9 - the daemon's run request, plan request and classify request treat a stated size as a hint and return the measured size; a plan request at depth 0 takes the measured size for the band and the depth, and one at a greater depth takes the measured size for the band and the caller's root size for the depth (mutation: take the child's size for the depth)
ok 10 - the one-shot tool and the workflow runner state no size of their own and their answers carry the measure line; a run-level request needs no size on its intent, and a run and a plan request for the same scope share one cached run bundle
ok 11 - a run takes one measure of the area it names: the context builder uses the measure it is handed and does not measure, and the size of its planning call is the size on the run's intent; the plan RPC hands its measure to the builder in the same way
ok 12 - analyze.classify on an unindexed scope answers 'scope-not-indexed' and returns no measured size; on a repository under index, 'repo-indexing'
ok 13 - analyze-rpc.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 14 - buildClassification: happy path + cache hit on identical re-invocation # SKIP
ok 15 - buildRun (infra target): happy path returns schema-valid bundle # SKIP
ok 16 - buildTask (code target): happy path with upstream mix # SKIP
ok 17 - buildRun (code target): unindexed registered repo -> scope-not-indexed error code # SKIP
ok 18 - classify: happy path returns ok:true with a ClassifiedIntent # SKIP
ok 19 - classify: nonexistent scopeRef.value -> scope-ref-unresolved error code # SKIP
ok 20 - plan (infra XS): end-to-end -> ok:true with a validator-passing PlanTask # SKIP
ok 21 - plan: currentDepth=99 -> max-plan-depth-exceeded error code in <5s # SKIP
ok 22 - buildRun: malformed intent -> invalid-params error code # SKIP
ok 23 - runStart (streaming): infra workspace end-to-end via streaming RPC; result mirrors run.json # SKIP
ok 24 - runStart (streaming): invalid scopeRef.kind -> invalid-params in analyze.result, fast (no LLM) # SKIP
ok 25 - buildClassification rejects non-object params with invalid-params
ok 26 - buildClassification rejects missing runId
ok 27 - buildClassification rejects missing scopeRef
ok 28 - buildClassification rejects bad scopeRef.kind
ok 29 - buildRun rejects missing intent
ok 30 - buildRun rejects bad intent.target
ok 31 - buildRun rejects bad intent.scope
ok 32 - buildRun rejects non-boolean intent.focused
ok 33 - buildTask rejects target=generic at task scope
ok 34 - buildTask rejects bad task.produces shape
ok 35 - buildTask accepts undefined upstream as an empty Map
ok 36 - buildTask accepts array-form upstream
ok 37 - buildTask rejects bad upstream array entries
ok 38 - invalid-params responses carry { code, message }
ok 39 - classify rejects non-object params with invalid-params
ok 40 - classify rejects missing runId
ok 41 - classify rejects missing userPrompt
ok 42 - classify rejects missing scopeRef
ok 43 - classify rejects bad scopeRef.kind
ok 44 - classify rejects empty-string userPrompt
ok 45 - plan rejects non-object params with invalid-params
ok 46 - plan rejects missing runId
ok 47 - plan rejects missing intent
ok 48 - plan rejects bad intent.target
ok 49 - plan rejects bad rootScope value
ok 50 - plan rejects non-integer currentDepth
ok 51 - plan rejects negative currentDepth
ok 52 - runStart (streaming): non-object params -> analyze.result frame with invalid-params + done
ok 53 - runStart (streaming): missing runId -> invalid-params in terminal frame
ok 54 - runStart (streaming): missing userPrompt -> invalid-params
ok 55 - runStart (streaming): missing scopeRef -> invalid-params
ok 56 - runStart (streaming): bad scopeRef.kind -> invalid-params with field name in message
ok 57 - runStart (streaming): resume cache hit -> analyze.result with ok:true; no intermediate progress frames
ok 58 - runStatus rejects non-object params with invalid-params
ok 59 - runStatus rejects missing runId
ok 60 - runStatus on missing runId record returns invalid-input
ok 61 - runStatus returns the persisted RunRecord round-trip
ok 62 - runPurge rejects non-object params with invalid-params
ok 63 - runPurge rejects missing runId
ok 64 - runPurge rejects non-boolean force
ok 65 - runPurge on missing runId record returns purged=false (idempotent)
ok 66 - runPurge removes a persisted finished run; subsequent purge returns purged=false
ok 67 - runPurge refuses on status=in-progress for a live run without force; force=true overrides
ok 68 - AnalyzeRpcOk responses have ok:true and a bundle field
ok 69 - a record in progress with no live run is rewritten as 'run-abandoned' by the status request, on disk too (mutation: return the record as read)
ok 70 - the daemon's purge request purges such a record without force; purgeRun with no liveness refuses it; a live run's record is returned unchanged and refused
ok 71 - the daemon's handler writes the record and sends its stage, not 'classify', for a runAnalyze that throws, and sends both frames when the record cannot be written
ok 72 - with a record that cannot be written the status request still says 'run-abandoned' and the purge still removes the directory (mutation: let the rewrite's error escape)
ok 73 - no reader changes a record that is 'ok' or 'failed'
ok 74 - an empty prompt with a stated kind of source is accepted and gives an unfocused intent; with none it is refused with the new message
ok 75 - a prompt of only white space is accepted with and without a stated kind of source (mutation: treat white space as empty at the parser)
ok 76 - the daemon's error payload, the one-shot tool's message and the workflow runner's step failure carry the report and the reason
ok 77 - a failure with no report is passed on as before: its code and message, and nothing about completeness
ok 78 - a grounded step gets the flattened findings of a successful request
ok 79 - index.ts registers an 'artifact.feedback.append' handler that delegates to appendFeedback
ok 80 - the handler returns { error } (not throw) on a bad request / ArtifactFeedbackError
ok 81 - the artifact-feedback tool is mounted at boot and single-sources appendFeedback
ok 82 - the writer exports the append-only API + typed error
ok 83 - backupAll snapshots LMDB to a single file at <target>/graph.lmdb
ok 84 - backupAll snapshot is openable + round-trips the source rows
ok 85 - backupAll leaves the source env writable + readable
ok 86 - backupAll re-run over an existing target overwrites idempotently
ok 87 - backupAll skips Lance when the source directory is absent
ok 88 - backupGraphStore throws when env is not open
ok 89 - runBootSteeringRefresh re-stamps a MARKED repo file to the stripped skeleton
ok 90 - runBootSteeringRefresh leaves an UNMARKED / absent file untouched (REPLACE-ONLY opt-out)
ok 91 - runBootSteeringRefresh is idempotent — an already-current marked file reports unchanged, no write
ok 92 - runBootSteeringRefresh swallows a readBlock throw (missing/empty asset) and returns undefined
ok 93 - runBootSteeringRefresh swallows a listRepos rejection and returns undefined (never throws)
ok 94 - runBootSteeringRefresh over an empty registry returns an empty report, no writes
ok 95 - src/daemon/index.ts imports and calls runBootSteeringRefresh AFTER the reconcile, guarded
ok 96 - STEERING markers are exported for fixtures
ok 97 - T12 the daemon refuses to review code the daemon wrote: an error frame, no provider, no review
ok 98 - T4 the daemon reviews code that is controller-authored, and stamps the review as the daemon's
ok 99 - T4 the daemon reviews code that is of unknown author (an older record), and stamps the review as the daemon's
ok 100 - T4 with no BUILD record at all the author is unknown and the daemon reviews
ok 101 - the author is read from the BUILD record
ok 102 - a declined subject is still an error frame, before the author is looked at
ok 103 - T17 the degraded mode grounds on the diff, stamps the record degraded and caps a clean verdict at warn
ok 104 - T17 a diff the daemon cannot read ends in one error frame naming the cause, and no record is written
ok 105 - T17 with no mode the request grounds on the graph and can pass, as before
ok 106 - T17 with the full mode the request grounds on the graph and can pass, as before
ok 107 - T17 a grounding mode the daemon does not know is refused, not read as full
ok 108 - first-boot equivalence: surviving former-literal keys match catalog defaults; retired ones are absent
ok 109 - first boot with no config present → writes surviving former keys + canonical catalog defaults; no retired keys, one write
ok 110 - module boundary: daemon imports the catalog from src/config, and src/daemon has zero imports of src/cli
ok 111 - boot wiring contract: unconditional, no silent parse catch, distinguishable catalog-error, all outcomes handled
ok 112 - reconcile never aborts boot: every failure input yields a structured outcome, not a throw
ok 113 - t2: the status object includes installedCommit populated from the reader
ok 114 - t2: a reader returning '' yields installedCommit:'' with the rest of the status intact (never throws)
ok 115 - t2: sc1 (daemon.update/updateOutcome) surface is untouched by the status change
ok 116 - t2: end-to-end — readInstalledCommit() with the default git exec returns this repo's real HEAD sha
ok 117 - index.ts registers 'workflow.delivery', which lazy-imports handleDelivery and passes INSRC_REPO
ok 118 - index.ts registers 'workflow.deliveryEvidence', which lazy-imports handleDeliveryEvidence and passes INSRC_REPO
ok 119 - guideMarkerStart/End produce the exact insrc:guide marker strings
ok 120 - readWorkflowGuide returns the trimmed section for a known workflow (ac1)
ok 121 - readWorkflowGuide keeps a decoy inner marker verbatim, not mis-sliced
ok 122 - readWorkflowGuide returns null for an unknown key
ok 123 - readWorkflowGuide returns null for a half-present pair (start, no end)
ok 124 - readWorkflowGuide returns null for an inverted pair (end before start)
ok 125 - listWorkflowGuides returns COMPLETE-pair keys only, in document order
ok 126 - listWorkflowGuides returns [] for text with no pairs (Phase-A empty)
ok 127 - guideGetResult: known key -> Ok { workflow, guidance }
ok 128 - guideGetResult: omitted workflow -> Error { validWorkflows }
ok 129 - guideGetResult: unknown workflow -> Error { validWorkflows }
ok 130 - guideGetResult: read-seam throws -> Error { validWorkflows: [] }, never escapes
ok 131 - guideListResult: returns { workflows } in document order
ok 132 - guideListResult: read-seam throws -> { workflows: [] }, never escapes
ok 133 - shipped steering-block.md enumerates bugfix without disturbing the existing keys/order
ok 134 - guideGetResult({workflow:"bugfix"}) returns the bugfix section from the shipped asset
ok 135 - removes every complete guide section, retaining the skeleton
ok 136 - leaves a half-present (start-only) marker intact
ok 137 - collapses the blank run left where a section was removed
ok 138 - is idempotent — stripping an already-stripped skeleton is a no-op
ok 139 - is safe on text with no guide sections at all
ok 140 - is safe on empty-ish text
ok 141 - the shipped asset carries guide sections; readSteeringBlock returns it whole
ok 142 - refreshSteeringAcrossRepos (default readBlock) stamps a guide-marker-free skeleton
ok 143 - an injected readBlock (the daemon-update path) is ALSO stripped — the skeleton contract cannot be bypassed
ok 144 - the inject-path strip is idempotent over the shipped asset
ok 145 - t1: readInstalledCommit returns the trimmed sha for a valid HEAD (trailing newline stripped)
ok 146 - t1: readInstalledCommit invokes git with `-C <root> rev-parse HEAD`
ok 147 - t1: any exec failure (throw / non-git / ENOENT) returns '' and never throws
ok 148 - t1: with no root arg it resolves DAEMON_ROOT = $INSRC_DAEMON_ROOT ?? ~/.insrc/daemon
ok 149 - listModels('cli-claude') -> curated list mapped from CatalogModel, available:true
ok 150 - listModels('cli-codex') -> the cli-codex curated list, available:true
ok 151 - cloud branch: an empty curated array stays available:true + []
ok 152 - ac4: the ollama lister is NEVER called for a cloud provider (no HTTP path)
ok 153 - listModels('ollama') success -> available:true + mapped models
ok 154 - listModels('ollama') with a REJECTING lister (unreachable) -> available:false + []
ok 155 - listModels('ollama') with a lister that rejects on timeout -> available:false + []
ok 156 - listModels('ollama') with a lister that rejects on malformed -> available:false + []
ok 157 - listModels('ollama') reachable-but-zero -> available:true + [] (distinct from failure)
ok 158 - unknown/missing provider -> invalid-params error result, no throw, no mutation
ok 159 - read-only: the injected deps expose only read methods (no config-write path reachable)
ok 160 - source-scan: list-models.ts imports no cloud-REST / provider-SDK path (k1/ac4)
ok 161 - handler map: 'providers.listModels' is a real handler delegating to listModels, not offlineRpc (lc1)
ok 162 - integration: listModels(cloud) sources from the REAL getCuratedCatalog after validateModelCatalog
ok 163 - unselected clients are always emitted as skipped, never omitted
ok 164 - {claude:true} registers claude (mcp add --scope user); codex is skipped
ok 165 - {agents:true} maps to the codex client (agents flag → codex, --scope omitted)
ok 166 - an existing `insrc` entry in `mcp list` → unchanged, no add spawned
ok 167 - an `insrc` substring only inside a path (not a line-start name) does NOT count as registered
ok 168 - an indeterminate `mcp list` (non-zero exit) → failed, and deliberately does NOT add
ok 169 - a missing CLI binary (ENOENT spawn) → failed with a not-found note, no throw
ok 170 - a non-zero `mcp add` exit → failed carrying the CLI stderr
ok 171 - per-client isolation: claude add fails, codex still registers independently
ok 172 - mixed idempotency: claude already present, codex absent → unchanged + registered
ok 173 - a missing out/bin/insrc-mcp.js → failed for each selected client, no subprocess
ok 174 - registerMcpClients never rejects even if the injected run throws
ok 175 - src/daemon/__tests__/model-catalog-asset.test.ts: the shipped cloud model catalog lists the three GPT-6 Codex models
ok 176 - validateModelCatalog: valid catalog fixture → resolves, caches the frozen parse
ok 177 - validateModelCatalog: removed/absent catalog file → throws ModelCatalogValidationError naming the file + one copy-assets Fix: line
ok 178 - validateModelCatalog: non-JSON file → throws (parse failure) naming the file
ok 179 - validateModelCatalog: schema-invalid variants → throw naming the specific failure, short-circuit
ok 180 - validateModelCatalog: short-circuits on the FIRST structural failure (version before providers)
ok 181 - modelsFor('cli-claude') / modelsFor('cli-codex') over a loaded catalog → the curated readonly arrays
ok 182 - modelsFor for a provider with an explicitly-empty array → empty readonly array (not an error)
ok 183 - getCuratedCatalog before validateModelCatalog populated the cache → throws the boot-ordering Error
ok 184 - MODEL_CATALOG_DIR is the dir modelCatalogDir() resolves by default (one source of truth)
ok 185 - contract: validateModelCatalog passes against the real resolved MODEL_CATALOG_DIR and modelsFor is well-formed
ok 186 - smoke: the built out/assets/models stages the catalog JSON, non-empty
ok 187 - depthForRepo counts repoPath-named jobs (full/reembed/doc-summarise-repo) for that repo
ok 188 - depthForRepo counts file/config-file jobs whose filePath is under the repo (repoPath+sep)
ok 189 - repo-agnostic jobs (config-full/config-reindex/doc-summarise-entity) and other-repo jobs do NOT count
ok 190 - depthForRepo returns 0 for a repo with no queued jobs; get depth() is the global total
ok 191 - a queued clean-up job is counted as pending for its repository, and a second one for the same repository is not queued
ok 192 - index.ts registers a 'repo.stats' handler that delegates to collectRepoStats
ok 193 - the handler returns { error } (not throw) for an unregistered repoPath and returns the array when omitted
ok 194 - the repo.stats handler is READ-ONLY (no mutation of store/registry/queue/config)
ok 195 - collectRepoStats delegates to the pure buildRepoStats and RepoStats is declared
ok 196 - buildRepoStats: fileCount is distinct files; filesByLanguage counts a mixed-language file in each bucket
ok 197 - buildRepoStats: entityCount total + entityCountByKind grouped by EntityKind
ok 198 - buildRepoStats: relationCount is per-repo; a source-repo not registered and a repo with 0 source are ignored
ok 199 - buildRepoStats: registry fields verbatim; a never-indexed registered repo yields a zero-count RepoStats (present)
ok 200 - buildRepoStats: sizeBytes = injected sizeOf; pendingJobs = injected pendingFor
ok 201 - buildRepoStats: an unregistered-repo entity row is ignored; empty inputs give all-zero RepoStats per repo
ok 202 - collectRepoStats: per-repo counts + cross-repo edge attributed to its source repo + best-effort size
ok 203 - search.callers across repositories leaves out the entities of a repository under index
ok 204 - search.query while one repository is being indexed returns rows from the other repositories only
ok 205 - entity.closure, entity.unreachable, search.closure, repo.depends_on and repo.search_cross_repo from a ready repository whose closure reaches a repository under index leave that repository's entities out
ok 206 - the result filter leaves out exactly the repositories the analyzer refuses: for every registry status, underIndexFilter drops the repository iff ensureRepoQueryable refuses it, and both agree with isUnderIndex
ok 207 - guardSearchRequest: an entity whose store read fails names nothing and the request is answered; another name in the same request still refuses it
ok 208 - search requests: search.callers / search.callees / search.by_file / search.closure / entity.summary / repo.depends_on / locate.inferParents about a repository being indexed answer 'repo-indexing: ...' with the figures and no result; about another, ready repository they answer as before
ok 209 - entity.closure / entity.unreachable with a root in a repository under index are refused
ok 210 - search guard: a registry read that throws skips the guard and the request is answered as today
ok 211 - search request contract: each guarded search request accepts its existing params and answers
ok 212 - a new connection registers an entry labelled unknown until a message identifies it
ok 213 - handleMessage with a valid client envelope updates label/pid/lastMethod
ok 214 - a malformed client envelope is ignored — the connection stays unknown/pid undefined
ok 215 - socket close deletes the entry; a double-close / close-before-message is idempotent
ok 216 - attachedClients() returns entries sorted by connectedAt
ok 217 - the daemon.debug-status contract returns { clients } from the registry with no side effects (k1/k5)
ok 218 - status after failure: storeFailure names another process and does not contain 'semume'
ok 219 - store failure to stop: exit within 5 seconds, pid file and socket gone, second start succeeds, last log line names the skipped close
ok 220 - fatal after failure: an unhandled rejection with the store failed ends the process within 5 seconds
ok 221 - healthy shutdown is unchanged: queue drained, connections closed in order, normal exit
ok 222 - with the store failed no path calls exit: the shutdown, its backstop, a failure found during the drain, and any other exit
ok 223 - daemon status payload: no storeFailure when healthy; kind, time, operation and cause when locks-lost
ok 224 - status handler with the store failed returns an empty repository list and storeFailure and does not throw
ok 225 - absent file → create with only the marked section
ok 226 - file with user content but no marker → append, preserving content
ok 227 - marked section present + identical → idempotent no-op (unchanged, no write)
ok 228 - stale marked section → replace ONLY between markers, preserve surrounding
ok 229 - open marker without close → left untouched (never clobber to EOF)
ok 230 - duplicate open markers → left untouched (ambiguous)
ok 231 - refresh: present + stale block → replaced, surrounding content byte-for-byte preserved
ok 232 - refresh: present + identical block → unchanged, content null (no write)
ok 233 - refresh: absent file → skipped, NEVER created
ok 234 - refresh: present file WITHOUT markers → skipped, NEVER created/appended (opt-out)
ok 235 - refresh: duplicate markers → unchanged + note, untouched
ok 236 - refresh: malformed markers (open without close) → unchanged + note, untouched
ok 237 - walk: mixed repos — stale written, opted-out skipped-not-created, malformed untouched
ok 238 - walk: per-file read rejection → skipped+note, walk continues to remaining repos
ok 239 - walk: per-file write rejection → skipped+note, other repos still refreshed
ok 240 - walk: CLAUDE.md refreshed while sibling AGENTS.md absent → independent per-file
ok 241 - walk: zero registered repos → empty report, no writes
ok 242 - walk: partial deps fills the omitted members with production defaults
ok 243 - readSteeringBlock: resolves the shipped prompts/steering-block.md and is non-trivial
ok 244 - injectSteeringBlock: nothing selected → both files skipped, no writes
ok 245 - injectSteeringBlock: claude only → CLAUDE.md created, AGENTS.md untouched
ok 246 - injectSteeringBlock: both selected + one pre-existing → created + preserved-append
ok 247 - injectSteeringBlock: re-run is idempotent (second run unchanged)
ok 248 - dispatcher: a handler throwing code -30775 records locks-lost and the caller gets the named error, at each of the three server sites and the queue runner
ok 249 - detection through the real wrappers: a read through the dispatcher records at once
ok 250 - periodic check records locks-lost when no request or write has met the failure
ok 251 - diagnostic through the tools' route: fs.promises.readFile of the lock file logs one warn line with a stack, once per stack
ok 252 - the default report is a warn line on the daemon log, with the stack
ok 253 - t3: daemon.update returns { launched:true } and schedules shutdown, without exiting the process
ok 254 - t3: a launch guard failure surfaces as a result.error envelope and does NOT schedule shutdown
ok 255 - t3: daemon.updateOutcome returns the last outcome, and null when none exists
ok 256 - t1: PATHS carries the two S001 daemon-home entries under the insrc dir
ok 257 - t2: launchUpdate spawns the detached daemon-ctl.sh restart child with detached/unref/stdio-to-log
ok 258 - t2: launchUpdate rejects a concurrent launch when a live marker is present; a stale marker is ignored
ok 259 - t2: launchUpdate throws cannot-locate BEFORE any spawn or marker write when the root/helper is missing
ok 260 - t2: readUpdateOutcome parses a present record and returns null for absent / unparseable (never throws)
ok 261 - t2: writeUpdateOutcome persists the record and clears the in-flight marker
ok 262 - t2: runDetachedUpdate writes state:succeeded on a zero exit and clears the marker
ok 263 - t2: runDetachedUpdate writes state:failed with the raw stderr on a non-zero exit; no retry/rollback
ok 264 - workflowProgressToStage maps phase→stageId and folds runner/attempt/detail into stageLabel
ok 265 - workflowProgressToStage falls back to phase as the label when no extra fields
ok 266 - makeTokenAccumulator batches tokens and flushes the tail
ok 267 - makeTokenAccumulator keeps tokensTotal monotonic and stageId from the latest step
ok 268 - T12 a controller-authored LLD: progress frames, then done with the verdict and reviewedBy daemon
ok 269 - T12 a controller-authored DEF is reviewed through the pipeline and ends in done
ok 270 - T12 a daemon-authored DEF ends in one error frame; no provider call, nothing stamped
ok 271 - T12 a daemon-authored LLD ends in one error frame; no provider call, nothing stamped
ok 272 - a bad request, a missing artifact and a failing review each end in one error frame
ok 273 - finalizeArtifact: s8 sbdry4 hard-fail is now CORRECTABLE and carries structured findings
ok 274 - finalizeArtifact: a CLEAN s8 (all passed) yields no boundary failure
ok 275 - correctionDirective: names each finding + demands change-nothing-else + grounding
ok 276 - reAuditBoundary: audits the CORRECTED artifact for the flagged items + returns fresh verdicts
ok 277 - the findings flattened into a workflow step start with the completeness line when the bundle has a report, and are unchanged when it has none
ok 278 - prepareWorkflowRun exposes a router + cfg + repoPath alongside the back-compat scalar provider
ok 279 - prep.router resolves a provider per role (distinct roles → distinct resolutions)
ok 280 - prepareWorkflowRun still throws "no repo" before any router is built
ok 281 - runWorkflowServerSide drives stub end-to-end + stamps per-output attribution (sc5), not the retired scalar model
ok 282 - runWorkflowServerSide with a router captures per-output attribution — one heterogeneous row per output (sc5 ac1)
ok 283 - runWorkflowServerSide does NOT review the artifact it authors (the other party reviews it)
ok 284 - T16 a run asked to review (review:true) makes no review call, says the artifact needs a controller review, and stamps nothing
ok 285 - T16 a run not asked to review announces nothing about a review
ok 286 - runWorkflowServerSide refuses a provider without structured-output
ok 287 - runWorkflowServerSide fails clearly when synthesize stays invalid across all attempts
ok 288 - T2 the daemon run finalizes through ONE call, so a correction retry cannot skip the author stamp
ok 289 - startWorkflowRun returns a runId synchronously and poll transitions running → done
ok 290 - poll with the returned cursor yields only NEW frames (append-only)
ok 291 - unknown runId polls as status:unknown with an error
ok 292 - abortWorkflowRun flips a running run to aborted; unknown runId → ok:false
ok 293 - getAllTurnsWithVectorsForRepo joins Lance vectors back onto turns
ok 294 - getAllTurnsWithVectorsForRepo returns vectors only for Lance-backed turns
ok 295 - compaction reclassifies directive turns as type=directive
ok 296 - compaction promotes warm-tier turns and re-embeds the compressed text
ok 297 - compaction collapses archive sessions into a summary turn (centroid)
ok 298 - compaction dedupes near-duplicate turns within the same tier
ok 299 - compaction-deleted turns are removed from Lance turn_vec
ok 300 - compaction dryRun does not mutate state
ok 301 - compaction on empty repo is a no-op
ok 302 - saveTurn persists vector to Lance
ok 303 - saveTurn with empty vector skips Lance write
ok 304 - addCompactedTurns persists batch to Lance with type=merged tier=cold defaults
ok 305 - saveSession with vector persists summary to Lance
ok 306 - closeSession persists summary embedding to Lance
ok 307 - searchTurnsByRepo returns hydrated TurnRecord objects
ok 308 - searchTurnsByRepo returns [] on dim mismatch (legacy silent-error contract)
ok 309 - seedFromPrior returns sessions sorted by recency
ok 310 - seedFromPrior returns [] on dim mismatch
ok 311 - deleteSession cascades Lance session + turn rows
ok 312 - deleteTurnsForSession cascades only the turn Lance rows
ok 313 - deleteSessionsForRepo cascades all Lance rows for that repo
ok 314 - deleteTurnsForRepo cascades Lance turn rows but leaves sessions
ok 315 - deleteTurnsByIds cascades the corresponding Lance rows
ok 316 - saveSession + getSessionById round-trip
ok 317 - saveSession with explicit fields preserves them
ok 318 - saveSession upsert preserves single row
ok 319 - getSessionById on unknown id returns null
ok 320 - setSessionAgent updates agent + category
ok 321 - setSessionStatus mutates only the status
ok 322 - bumpSessionActivity is silent no-op for unknown id
ok 323 - closeSession upserts the row + sets status=completed
ok 324 - saveTurn + getTurnsForSession round-trip
ok 325 - getTurnsForSession returns idx-ordered turns only of type "turn"
ok 326 - saveTurn round-trips assertionRefs (G6 of memory-context design)
ok 327 - saveTurn omits assertionRefs when not provided (back-compat)
ok 328 - saveTurn upsert preserves single row by (sessionId, idx)
ok 329 - saveTurn bumps session lastActivityAt
ok 330 - addCompactedTurns sets defaults: type=merged, tier=cold
ok 331 - addCompactedTurns on empty array is a no-op
ok 332 - getAllTurnsForRepo returns only that repo's turns
ok 333 - getAllTurns returns every turn across repos
ok 334 - listSessions returns sessions in createdAt-desc order
ok 335 - listSessions filters by repo
ok 336 - listSessionRecords filters by status
ok 337 - getConversationStats counts turns + sessions
ok 338 - deleteSession removes the session + all its turns
ok 339 - deleteSession on unknown id returns 0/0
ok 340 - deleteTurnsForSession removes all turns, leaves session
ok 341 - deleteSessionRecord removes only the session row
ok 342 - deleteSessionsForRepo removes only that repo's sessions
ok 343 - deleteTurnsForRepo removes only that repo's turns
ok 344 - deleteTurnsByIds removes the specific turns
ok 345 - deleteTurnsByIds on empty list is a no-op
ok 346 - searchTurnsByRepo returns [] (Phase 3.3 wires Lance)
ok 347 - seedFromPrior returns [] (Phase 3.3 wires Lance)
ok 348 - sessions + turns survive close + reopen
ok 349 - resetTableCaches is a no-op (back-compat shim)
ok 350 - t1: deleteEntitiesById removes the entity + cascades its CALLS_HTTP in/out edges; others untouched
ok 351 - t1: deleting an absent/stale id is a no-op; a mixed batch deletes present, skips absent
ok 352 - writeDocSummary + getDocSummary round-trip
ok 353 - writeDocSummary overwrites an existing summary
ok 354 - getDocSummary returns null for unknown entity
ok 355 - getDocSummary returns null for known entity with no summary
ok 356 - writeDocSummary rejects an unknown entity
ok 357 - writeDocSummary rejects an unregistered repo
ok 358 - listDocSummariesForRepo returns every summary for the repo
ok 359 - countDocSummariesForRepo matches the list length
ok 360 - listDocSummaryEntityIdsForRepo returns the same entity ids
ok 361 - listDocSummariesForRepo returns empty for an unregistered repo
ok 362 - deleteDocSummary drops primary + secondary index
ok 363 - deleteDocSummariesForRepo scoped drop
ok 364 - deleteEntitiesForFile cascades to the summary row
ok 365 - placeholder rows persist the errorCode field
ok 366 - upsertEntities persists vectors to entity_vec when embedding is non-empty
ok 367 - upsertEntities skips Lance write when embedding is empty
ok 368 - upsertEntities re-embed (existing entity, new vector) replaces the Lance row
ok 369 - updateEmbedding persists vector to entity_vec
ok 370 - updateEmbedding on unknown entity is silent no-op
ok 371 - updateEmbedding with empty embedding only updates LMDB model field
ok 372 - searchEntities returns hydrated Entity objects via Lance ANN
ok 373 - searchEntities returns [] for empty query vector
ok 374 - searchEntities returns [] for empty closure
ok 375 - searchEntities respects closure-repo scope
ok 376 - deleteEntitiesForFile cascades Lance rows
ok 377 - deleteEntitiesForRepo cascades all Lance rows for the repo
ok 378 - reindexFile cascades Lance rows for tombstoned entities
ok 379 - upsertEntities + getEntity round-trip
ok 380 - upsertEntities preserves all flag fields
ok 381 - getEntity on unknown id returns null
ok 382 - getEntitiesByIds returns matched subset (unmatched omitted)
ok 383 - getEntitiesByIds on empty array returns []
ok 384 - upsert overwrites a non-module entity
ok 385 - module-stub upsert is ensure-exists (does not overwrite)
ok 386 - upsertEntities dedupes intra-batch duplicates (last-wins)
ok 387 - upsertEntities on empty array is a no-op
ok 388 - listEntitiesForRepo returns only the requested repo
ok 389 - listEntitiesForRepo on unknown repo returns []
ok 390 - findEntitiesByFile filters by absolute path
ok 391 - findEntitiesByName matches names + kind filter
ok 392 - findEntitiesByName respects repo filter
ok 393 - findEntitiesByName respects multi-repo `repos` filter
ok 394 - findEntitiesByName: empty `repos` array returns []
ok 395 - findEntitiesByName: `repos` with unknown paths drops them silently
ok 396 - findEntitiesByName: passing both `repo` and `repos` throws
ok 397 - findEntitiesByName respects limit
ok 398 - findEntitiesByName on empty input returns []
ok 399 - listUnembeddedEntities filters on empty embeddingModel
ok 400 - updateEmbedding sets the model name (vector goes to Lance in 3.2)
ok 401 - updateEmbedding on unknown id is a silent no-op
ok 402 - deleteEntitiesForFile removes only that file's entities
ok 403 - deleteEntitiesForFile cascades to out_edge and in_edge
ok 404 - deleteEntitiesForRepo removes all entities for that repo only
ok 405 - deleteEntitiesForRepo on unknown repo is a silent no-op
ok 406 - entities survive close + reopen
ok 407 - absolute file path -> repo-relative on write, back to absolute on read
ok 408 - repo IDs are auto-allocated on first sighting
ok 409 - the read of a repository's stored files returns each file once, only that repository's files, and no empty path
ok 410 - the removal of one repository's unresolved relations of a file leaves another repository's unresolved relations of the same path
ok 411 - an unregistered repository has no stored files and its removal of unresolved relations does nothing
ok 412 - put + get round-trip
ok 413 - get returns null on cache miss (never written)
ok 414 - same exploration params produce the same hash
ok 415 - different exploration types produce distinct hashes
ok 416 - nested params still canonicalise deterministically
ok 417 - different lastIndexedAt produces cache miss
ok 418 - repo scoping: repo A row is not visible to repo B lookup
ok 419 - deleteCachedExplorationsForRepo drops every row for the repo
ok 420 - put + get on unregistered repo is a no-op / null
ok 421 - completenessOf table test: graphComplete and complete follow the sc1 formula for every combination of the inputs, and reasons are empty exactly when complete
ok 422 - completenessOf(undefined) reads not complete with "a reindex is needed"
ok 423 - completeness reason lines: one per non-zero cause with its count, awaiting rows split by reason, no-candidate and ambiguous rows not a cause
ok 424 - an aborted transaction leaves the counts unchanged: a callback that writes a pending row and its count, then throws, leaves neither
ok 425 - recount on open corrects a hand-edited count with a warn log, and deletes the row of an unregistered repoId
ok 426 - lancedb native binding loads
ok 427 - create table + insert + count round-trip
ok 428 - vector search returns nearest first
ok 429 - vector dim 1024 is accepted (post-0.2 default)
ok 430 - table reopened from disk retains data (file-backed persistence)
ok 431 - filter columns work alongside vector search (where clause)
ok 432 - lmdb native binding loads
ok 433 - put and get round-trip with default msgpack codec
ok 434 - binary keys (Buffer) round-trip
ok 435 - cursor range scan returns sorted keys
ok 436 - sub-databases (named) are independent keyspaces
ok 437 - msgpack codec preserves nested objects
ok 438 - write transaction is atomic (all-or-nothing)
ok 439 - reopened env retains data (file-backed persistence)
ok 440 - reindexFile on empty store creates entity rows
ok 441 - reindexFile on empty parsed list with no existing is a no-op
ok 442 - reindexFile: identical re-parse is a no-op
ok 443 - reindexFile: adding an entity inserts the new + preserves existing
ok 444 - reindexFile: removing an entity tombstones it + keeps the rest
ok 445 - reindexFile: replacing all entities tombstones the original set
ok 446 - reindexFile: changed body updates the row
ok 447 - reindexFile: tombstoning a referenced entity clears incident edges
ok 448 - reindexFile preserves module stubs that already exist
ok 449 - reindexFile is idempotent: same parse twice produces the same row set
ok 450 - reindexFile: contentHash unchanged + body unchanged -> no row mutation
ok 451 - reindexFile auto-allocates a repoId on first sighting
ok 452 - reindexFile only touches entities of the specified file
ok 453 - reindexFile result survives close + reopen
ok 454 - upsertRelation writes a single resolved edge to both mirrors
ok 455 - upsertRelations bulk-writes multiple resolved edges
ok 456 - upsertRelations dedupes intra-batch duplicates by (from, to, kind)
ok 457 - upsertRelations is idempotent across calls
ok 458 - upsertRelations skips resolved edges with missing endpoints
ok 459 - upsertRelations on empty array is a no-op
ok 460 - different relation kinds coexist on the same (from, to) pair
ok 461 - upsertRelation routes unresolved to the queue
ok 462 - upsertRelations splits resolved/unresolved correctly
ok 463 - listUnresolvedRelations with file scope filters correctly
ok 464 - unresolved row missing meta.file/repo is dropped
ok 465 - promoteToResolved writes the resolved edge + removes the unresolved row
ok 466 - updateUnresolvedMeta writes the new meta + bumps attemptedAt
ok 467 - updateUnresolvedMeta on unknown id is a silent no-op
ok 468 - deleteUnresolvedForFile removes only that file's unresolved rows
ok 469 - deleteUnresolvedForRepo removes everything for that repo only
ok 470 - deleteUnresolvedForRepo on unknown repo is a silent no-op
ok 471 - promoteResolvedBatch writes all edges + removes all unresolved rows
ok 472 - updateUnresolvedMetaBatch updates each row
ok 473 - promoteResolvedBatch on empty array is a no-op
ok 474 - updateUnresolvedMetaBatch on empty array is a no-op
ok 475 - makeUnresolvedRelationId is deterministic
ok 476 - makeUnresolvedRelationId differs for different inputs
ok 477 - resolved edges + unresolved rows survive close + reopen
ok 478 - 5.2: upsertEntities throws UnregisteredRepoError for an unregistered workspace path
ok 479 - 5.2: failed upsert leaves the repo sub-DB untouched (no auto-allocation)
ok 480 - 5.2: upsertEntities succeeds once the path is pre-registered via addRepo
ok 481 - 5.2: storage layer never writes a non-shared-modules repo row outside addRepo()
ok 482 - 5.2: module entities (empty repo path) bypass strict lookup via namespace fallback
ok 483 - 5.2: UnregisteredRepoError is throwable + introspectable
ok 484 - 5.3: same module name in Java vs Python produces distinct entity IDs
ok 485 - 5.3: Java + Scala module entities share the jvm namespace row (no separate row per language)
ok 486 - 5.3: every shared-modules namespace gets its own reserved repoId (4 distinct rows)
ok 487 - 5.3: reserved shared-modules row has empty path + namespace tag in storage
ok 488 - addRepo + listRepos round-trip
ok 489 - addRepo with explicit name overrides basename derivation
ok 490 - addRepo with empty name falls back to basename
ok 491 - addRepo on existing path updates in place (same repo_id semantics)
ok 492 - addRepo with multiple paths creates multiple rows
ok 493 - removeRepo by path deletes the row
ok 494 - removeRepo deletes the repository's index_state row with its registry row (Epic c2ba6fa6 s1/t1)
ok 495 - removeRepo on unknown path is a silent no-op
ok 496 - listRepos on empty registry returns empty array
ok 497 - updateRepoStatus mutates only status / lastIndexed / errorMsg
ok 498 - updateRepoStatus on unknown path is a silent no-op
ok 499 - updateRepoStatus with errorMsg surfaces it on listRepos
ok 500 - all four status values round-trip
ok 501 - lastIndexed sentinel: absent when never indexed, present after first index
ok 502 - lastIndexed survives close + reopen
ok 503 - many repos round-trip without collision (linear-scan correctness)
ok 504 - addRepo updates status without losing addedAt
ok 505 - validateRepoPathShape rejects empty string
ok 506 - validateRepoPathShape rejects non-string input
ok 507 - validateRepoPathShape rejects relative paths
ok 508 - validateRepoPathShape rejects filesystem root + system / volatile dirs
ok 509 - validateRepoPathShape normalises trailing-slash + .. segments
ok 510 - validateRepoPathShape rejects normalised banned root (e.g. `/Users/.`)
ok 511 - validateRepoPath (full) accepts an existing temp directory
ok 512 - validateRepoPath (full) rejects non-existent path
ok 513 - addRepo rejects empty / banned-root paths via shape validation
ok 514 - registry codec: decodeRepoRow keeps lastRun, and a status write without lastRun keeps the stored one
ok 515 - findCallees returns 1-hop CALLS successors
ok 516 - findCallers returns 1-hop CALLS predecessors
ok 517 - findCallees with no outgoing CALLS returns []
ok 518 - findCallers with no incoming CALLS returns []
ok 519 - findCallees on unknown entity returns []
ok 520 - findCallees ignores non-CALLS edges
ok 521 - findDefinedIn returns DEFINES successors
ok 522 - findDefinedIn with mixed kinds only returns DEFINES targets
ok 523 - findImports returns IMPORTS successors
ok 524 - findImports on file with no IMPORTS returns []
ok 525 - resolveClosure includes the root even with no DEPENDS_ON edges
ok 526 - resolveClosure on unknown repo path returns just the path
ok 527 - resolveClosure walks transitive DEPENDS_ON across repos
ok 528 - resolveClosure handles cycles without infinite loop
ok 529 - resolveClosure filters out non-repo reachable entities
ok 530 - insertList creates a list with a seed transfer entry
ok 531 - insertList rejects unknown owner / source
ok 532 - insertList with parentListId validates session match
ok 533 - insertList with missing parent rejects
ok 534 - insertItem creates an item under an existing list
ok 535 - insertItem on missing list rejects
ok 536 - listItems returns items sorted by order
ok 537 - listItems supports fractional ordering for insert-between
ok 538 - insertComment + listCommentsForItem round-trip
ok 539 - listCommentsForItem returns comments sorted by createdAt
ok 540 - updateComment updates body + agentAcknowledged
ok 541 - deleteComment removes the comment
ok 542 - updateItem rejects illegal status transitions
ok 543 - updateItem -> completed sets completedAt
ok 544 - updateItem -> blocked requires non-empty blockedReason
ok 545 - updateList rejects illegal status transitions
ok 546 - transferList changes owner + appends transfer history
ok 547 - reparentList sets the parent
ok 548 - reparentList rejects cycles
ok 549 - assertParentAllowed accepts valid hierarchies
ok 550 - listListsBySession returns roots first then children
ok 551 - listListsBySession filters by includeArchived flag
ok 552 - listAllLists filters by status + source
ok 553 - deleteItem removes the item + its comments
ok 554 - deleteList cascades through items + comments
ok 555 - deleteListsBySession returns the count
ok 556 - lists + items + comments survive close + reopen
ok 557 - repo row round-trip
ok 558 - registry codec: a row with lastRun round-trips; an older row without it decodes with lastRun undefined
ok 559 - repo row round-trip -- shared-modules kind with namespace
ok 560 - entity row round-trip including all flag fields
ok 561 - entity row preserves empty-string sentinel defaults
ok 562 - edge props: empty payload encodes to zero-byte buffer
ok 563 - edge props: CALLS shape round-trips
ok 564 - edge props: READS shape round-trips
ok 565 - edge props: IMPORTS shape round-trips
ok 566 - unresolved row round-trip
ok 567 - plan row round-trip
ok 568 - plan_step row round-trip with sentinel timestamps + dependsOn
ok 569 - session row round-trip with all status / tier values
ok 570 - turn row round-trip with all enum values
ok 571 - todo_list row round-trip
ok 572 - todo_item row round-trip with tags + meta
ok 573 - todo_comment row round-trip
ok 574 - config_entry row round-trip
ok 575 - msgpack encoding is more compact than JSON for typical entity
ok 576 - large body in entity row round-trips correctly
ok 577 - compactGraphStore reclaims space after large deletes
ok 578 - compactGraphStore preserves all rows when nothing has been freed
ok 579 - compactGraphStore cleans up .bak after success
ok 580 - compactGraphStore re-opens the env so subsequent writes go through
ok 581 - compactGraphStore throws when env is not open
ok 582 - compactGraphStore pre-clears stale .compact / .bak from a prior aborted run
ok 583 - entityIdByU64 finds the string id via the reverse index
ok 584 - entityIdsByU64s bulk-resolves O(K) via point lookups
ok 585 - entity_string_by_u64 is removed when an entity is deleted
ok 586 - name_index returns ALL entities sharing (repo, kind, name)
ok 587 - name_index drops only the deleted entity from the dup set
ok 588 - findEntitiesByName respects kind filter via name_index
ok 589 - v1->v2 migration backfills entity_string_by_u64 + name_index
ok 590 - schema_version pre-flight runs the v1->v2 migration on env open
ok 591 - first entity allocation returns 1 (0 reserved as no-ID sentinel)
ok 592 - first repo allocation returns 1
ok 593 - entity allocations are monotonically increasing
ok 594 - repo allocations are monotonically increasing
ok 595 - block allocation reserves contiguous IDs without gaps
ok 596 - block allocation rejects count < 1
ok 597 - counters survive close + reopen
ok 598 - peek does not mutate the counter
ok 599 - in-txn allocator works alongside other writes
ok 600 - in-txn allocator: repo + entity counters are independent
ok 601 - concurrent allocations all return distinct IDs
ok 602 - large block allocation produces correct next value at u64 scale
ok 603 - owner check: default path with no declaration is refused and no file is created
ok 604 - owner check: after the declaration the same open succeeds, also after a close and reopen
ok 605 - owner check: a temporary path opens without a declaration
ok 606 - owner check: the live path as a relative path and through a symbolic link is refused
ok 607 - owner check: only the owner declaration opens the live path; without it, and after it is forgotten, the open is refused
ok 608 - source scan: the reader declaration's name appears nowhere under src/
ok 609 - refusal: process B is refused and never opens the lock file; process A then writes; a child of a declared process is refused
ok 610 - refusal of a third process: beside the owner, a process with no declaration is refused the live graph store and holds no descriptor
ok 611 - lmdb behaviour pin: after a reopen in a fresh process, root.transaction keeps a throwing callback's write, root.childTransaction and root.transactionSync discard it
ok 612 - the store opens without writemap mode, so child transactions are available
ok 613 - detection through the real wrappers: asynchronous write by probe, synchronous write at once
ok 614 - control: the same wrappers on a store that was not broken write and record nothing
ok 615 - store library after another process removed its locks
ok 616 - v2->v3: provisions all 4 reserved shared-modules rows
ok 617 - v2->v3: rewires Java module entity to jvm namespace + recomputes string ID
ok 618 - v2->v3: rewires Python module entity to python namespace (separate from jvm)
ok 619 - v2->v3: drops the phantom workspace row + its entities (cascade)
ok 620 - v2->v3: idempotent on re-run from v3
ok 621 - v2->v3: workspace row with valid path is preserved
ok 622 - a v4 store opened by this code is at version 5 with one IndexStateRow per workspace repository, not complete, its pending counts recounted from the stored rows
ok 623 - a v4 -> v5 step that throws leaves the stored version at 4 and writes no IndexStateRow
ok 624 - the registry keeps V1->V2, V2->V3 and V3->V4 in order and appends V4->V5
ok 625 - removing a repository after the migration leaves no index_state row for it
ok 626 - production MIGRATIONS registry has the v1->v2 entry
ok 627 - production MIGRATIONS registry has the v2->v3 entry
ok 628 - runMigrations is a no-op when stored == target
ok 629 - runMigrations with empty registry but stored < target throws
ok 630 - runMigrations rejects when stored > target
ok 631 - runMigrations applies a single 1->2 step and advances meta.schema_version
ok 632 - runMigrations chains 1 -> 2 -> 3 in two steps
ok 633 - runMigrations prefers the longest jump that does not overshoot
ok 634 - runMigrations does not overshoot the target
ok 635 - runMigrations leaves intermediate version on disk after a per-step crash
ok 636 - a throwing step leaves neither its rows nor its version write; earlier steps stay committed (ISSUE-5437d6e5)
ok 637 - runMigrations throws MigrationPathError when chain is incomplete
ok 638 - runMigrations re-run from already-current version is a no-op
ok 639 - the two formerly live-store test files pass against a temporary store and create nothing at the default path
ok 640 - the review probe test, found by the same search, creates nothing at the default path either
ok 641 - three daemon request tests, found by the same search, create nothing at the default path
ok 642 - the MCP step and review tests, found by the full audit, create nothing at the default path
ok 643 - the check sees a store that IS opened at the default path
ok 644 - first boot writes schema_version
ok 645 - re-open with matching schema_version proceeds normally
ok 646 - re-open with stored > expected hard-fails with LmdbStoreSchemaVersionMismatch
ok 647 - INSRC_LMDB_MAPSIZE_GIB override is honored
ok 648 - invalid INSRC_LMDB_MAPSIZE_GIB falls back to default
ok 649 - LmdbStoreError classes are exported and constructible
ok 650 - opening a non-LMDB file at the env path surfaces a typed error
ok 651 - SCHEMA_VERSION constant is exported and stable
ok 652 - runReaderCheck returns 0 on a fresh env (no stale slots)
ok 653 - runReaderCheck is a no-op when env is closed
ok 654 - runReaderCheck is safe to call repeatedly
ok 655 - RELATION_KIND_BYTE: no duplicate byte; boundary kinds appended at 13-16
ok 656 - ENTITY_KIND_BYTE: no duplicate byte; externalEndpoint appended at 13
ok 657 - each boundary RelationKind byte round-trips via kindByteToName
ok 658 - frozen sc1 vocabulary: protocol enum + boundary names
ok 659 - externalEndpoint EntityRow round-trips (resolved variant)
ok 660 - externalEndpoint EntityRow round-trips (unresolved variant with rawExpression)
ok 661 - forward-compat: a pre-S001 row (no endpoint fields) decodes unchanged, endpoint fields undefined
ok 662 - graph closure
ok 663 - v3 -> v4 no-op migration advances schema_version leaving rows byte-identical
ok 664 - recordStoreFailureIfLockError: records both read failures once, and nothing else
ok 665 - the named error's message names another process and does not repeat the library's advice
ok 666 - health record: after locks-lost a further store call throws the named error and closeGraphStore skips the library's close
ok 667 - health record: after locks-lost getGraphStore itself rejects with the named error
ok 668 - sync wrapper: code 22 with a succeeding probe read is rethrown and leaves the record ok
ok 669 - slow healthy write: the probe runs and returns, nothing is recorded, the write completes
ok 670 - encodeEntityKey + decode round-trips u64 values including edges
ok 671 - encodeRepoKey + decode round-trips u32
ok 672 - encodeOutEdgeKey produces 17 bytes; round-trips
ok 673 - encodeInEdgeKey produces 17 bytes; round-trips
ok 674 - encodeOutEdgePrefix + prefixSuccessor bracket a single (from,kind) range
ok 675 - encodeOutEdgePrefix without kind brackets all kinds for a (from)
ok 676 - big-endian u64 key ordering matches numeric ordering
ok 677 - composite name_index key includes repo + kind + name
ok 678 - plan_step key range scans return idx-ordered steps
ok 679 - conversation_turn key orders by idx within session
ok 680 - todo_item key respects orderKey lex order
ok 681 - config_by_scope key supports hierarchical prefix scans
ok 682 - relation-kind enum byte mapping is bidirectional
ok 683 - entity-kind enum byte mapping is bidirectional
ok 684 - utf8 segment with null byte is rejected
ok 685 - all 20 sub-DBs open and accept basic put/get
ok 686 - lifecycle close + reopen preserves data
ok 687 - concurrent first-callers share the same init promise
ok 688 - write transaction is atomic
ok 689 - cursor range scan over out_edge prefix returns kind-scoped neighbors
ok 690 - bfs from a single root yields the root + transitive descendants
ok 691 - bfs visits each node exactly once even with cycles
ok 692 - bfs respects maxDepth
ok 693 - bfs respects kindFilter
ok 694 - bfs with direction=in walks reverse edges
ok 695 - bfs visitor pruning skips subtree expansion
ok 696 - bfs from multiple roots merges the closures
ok 697 - bfs deduplicates roots
ok 698 - dfs visits the same nodes as bfs (different order)
ok 699 - dfs handles cycles without infinite loop
ok 700 - dfs respects maxDepth
ok 701 - transitiveClosure returns the BFS-reachable set
ok 702 - transitiveClosure on empty roots returns empty set
ok 703 - scc: isolated nodes are singletons
ok 704 - scc: a 3-node cycle is one component of size 3
ok 705 - scc: cycle + tail reports two components
ok 706 - scc: two disjoint cycles + reachable from a single root via separate edge
ok 707 - scc respects kindFilter
ok 708 - traversal results survive close + reopen
ok 709 - unreachable: every entity outside the closure is yielded
ok 710 - unreachable respects candidateKinds (only those kinds yielded)
ok 711 - unreachable: empty roots yields every entity of the candidate kinds
ok 712 - unreachable: all roots, all reachable -> empty
ok 713 - unreachable: empty candidateKinds is a no-op
ok 714 - unreachable handles cycles in the reachable subgraph
ok 715 - unreachable respects kindFilter on the closure traversal
ok 716 - unreachable respects direction=in (reverse reachability)
ok 717 - unreachable respects maxDepth
ok 718 - a withWriteTxn callback that writes in two sub-DBs and throws rejects with its own error and leaves nothing, in-process and after a reopen
ok 719 - of two callers queued together, one throwing and one succeeding, only the successful one's writes are kept
ok 720 - an async callback is refused with "withWriteTxn callbacks must be synchronous" and keeps nothing; the type rejects it
ok 721 - a refused async callback that rejects later raises no unhandled rejection
ok 722 - upsertArtifactVec + queryArtifactVec round-trip
ok 723 - queryArtifactVec scopes by sessionId
ok 724 - queryArtifactVec scopes by intent when provided
ok 725 - getArtifactById returns the row by exact id (no ANN)
ok 726 - deleteArtifactsForSession removes all rows for a session and returns count
ok 727 - upsert: writing the same id replaces
ok 728 - returns [] for empty query / empty session / k=0
ok 729 - deleteArtifactsForSession on empty session returns 0 cleanly
ok 730 - default summary on a freshly-spilled row is empty string
ok 731 - upsertArtifactVec persists explicit summary verbatim
ok 732 - updateArtifactSummary overwrites only the summary column
ok 733 - updateArtifactSummary returns false for unknown id (soft-fail)
ok 734 - updateArtifactSummary refuses empty id + the seed sentinel
ok 735 - listArtifactsForSession returns rows newest-first
ok 736 - listArtifactsForSession scopes by session and excludes seed
ok 737 - listArtifactsForSession honours skillIdPrefix filter
ok 738 - listArtifactsForSession honours afterTimestamp lower bound (exclusive)
ok 739 - listArtifactsForSession returns [] for empty sessionId
ok 740 - listArtifactsForSession defaults summary to empty string for rows without one
ok 741 - queryArtifactVec results carry the summary field
ok 742 - deleteSessionFromLance: empty sessionId is a no-op + zero counts
ok 743 - deleteSessionFromLance: unknown sessionId returns zero counts
ok 744 - deleteSessionFromLance: removes only the targeted session across all 4 tables
ok 745 - deleteSessionFromLance: re-running on the same session is idempotent
ok 746 - deleteSessionFromLance: SQL-injection-safe (apostrophes in sessionId)
ok 747 - compactSessionVecTables: succeeds when tables exist + have tombstones
ok 748 - compactSessionVecTables: succeeds when no tables exist yet
ok 749 - compactSessionVecTables: idempotent (call twice, second is cheap)
ok 750 - writeConfigEmbedding + searchConfigVecs round-trip
ok 751 - searchConfigVecs accepts caller-supplied where filter
ok 752 - searchConfigVecs scope filter via where
ok 753 - searchConfigVecs language=all-or-specific filter
ok 754 - upsert: writing same id replaces
ok 755 - deleteConfigVec / deleteConfigVecsByIds / deleteConfigVecsForScope
ok 756 - returns [] for empty query
ok 757 - seed sentinel is excluded from search results
ok 758 - getLanceConn creates the directory + opens a connection
ok 759 - subsequent getLanceConn calls return the same instance
ok 760 - concurrent first-callers share the init promise
ok 761 - close + reopen works (data persists)
ok 762 - setLanceConnPath isolates between tests (different tmpdirs)
ok 763 - openOrCreateTable creates the table on first call
ok 764 - openOrCreateTable opens an existing table without re-seeding
ok 765 - openOrCreateTable rejects empty seed when creating
ok 766 - writeEntityEmbedding stores a single row
ok 767 - writeEntityEmbedding upsert: same id replaces row
ok 768 - writeEntityEmbeddings bulk upsert
ok 769 - writeEntityEmbeddings on empty array is a no-op
ok 770 - searchEntityVecs returns ANN hits ordered by distance
ok 771 - searchEntityVecs respects closure-repo scope
ok 772 - searchEntityVecs filter=code excludes artifacts
ok 773 - searchEntityVecs filter=artifact returns only artifacts
ok 774 - searchEntityVecs returns [] for empty query vector
ok 775 - searchEntityVecs returns [] for empty closureRepos
ok 776 - searchEntityVecs excludes the seed sentinel row
ok 777 - the vector search given an empty list of ids makes no query; given a large list it returns the nearest of them, in one query or in batches merged by distance; with no area the query is as before
ok 778 - deleteEntityVec removes a single row
ok 779 - deleteEntityVecsByIds bulk drop
ok 780 - deleteEntityVecsForRepo removes all rows for a repo
ok 781 - delete on empty input is a silent no-op
ok 782 - strings with single quotes are escaped in delete + search
ok 783 - rows survive close + reopen
ok 784 - compactEntityVecTable reduces on-disk fragment count
ok 785 - compactEntityVecTable preserves all rows + searchability
ok 786 - compactEntityVecTable on a fresh / single-fragment table is a cheap no-op
ok 787 - compactEntityVecTable result survives close + reopen
ok 788 - vector store owner rule: no declaration other than the owner's exists, and without it the live vector store is refused
ok 789 - vector store owner rule: live path refused with no declaration and nothing created; opens after declareLiveStoreOwner; a temporary path opens; relative path and symbolic link refused
ok 790 - no test opens the live vector store: each repaired test file run in a temporary home leaves no lance directory
ok 791 - the check sees a vector store that IS opened at the default path
ok 792 - upsertResponseSegmentVec + queryResponseSegmentVec round-trip
ok 793 - queryResponseSegmentVec scopes hits to a single session
ok 794 - queryResponseSegmentVec respects the k limit
ok 795 - queryResponseSegmentVec returns [] for empty query vector or empty sessionId
ok 796 - upsert is idempotent on the same id (mergeInsert overwrite)
ok 797 - deleteResponseSegmentsForSession removes all rows for a session and returns the count
ok 798 - deleteResponseSegmentsForSession on an empty session returns 0
ok 799 - deleteResponseSegmentsForTurn removes only the rows for that turn
ok 800 - seed row never appears in query results
ok 801 - writeSessionEmbedding + searchSessionVecs round-trip
ok 802 - searchSessionVecs scopes by repo
ok 803 - searchSessionVecs with notExpired drops expired sessions
ok 804 - upsert: writing the same id replaces
ok 805 - deleteSessionVec / deleteSessionVecsByIds / deleteSessionVecsForRepo
ok 806 - returns [] for empty query / empty repo
ok 807 - writeTurnEmbedding + searchTurnVecs round-trip
ok 808 - searchTurnVecs default type filter excludes summary
ok 809 - searchTurnVecs with explicit types
ok 810 - deleteTurnVec / deleteTurnVecsBySessionId / deleteTurnVecsForRepo
ok 811 - writeBullet + searchBullets: single-row round-trip
ok 812 - writeBullets: batched insert + ANN returns multiple hits ordered by distance
ok 813 - searchBullets: filters by runId -- other runs are excluded
ok 814 - searchBullets: empty runId -> [] (early return)
ok 815 - searchBullets: empty queryVec -> [] (early return)
ok 816 - deleteBulletsForRun: drops every row for the run
ok 817 - deleteBulletsForRun: empty runId -> no-op (no throw)
ok 818 - deleteBulletsForTodo: drops just the matching TODO's rows
ok 819 - escapeLanceString: doubles single quotes
ok 820 - searchBullets: runId containing a single quote does not corrupt the filter
ok 821 - writeBullets: writing the same id twice updates the row in place
ok 822 - S003 t2 — code-symbol resolver excludes CALLS_HTTP
ok 823 - runCrossFileResolver (LMDB) -- INHERITS in same package
ok 824 - runCrossFileResolver (LMDB) -- module-stub IMPORTS rewiring
ok 825 - runCrossFileResolver (LMDB) -- external-dep stays as module stub
ok 826 - runCrossFileResolver (LMDB) -- CALLS resolves to exported function in imported file
ok 827 - runCrossFileResolver (LMDB) -- CALLS to non-exported target stays unresolved
ok 828 - runCrossFileResolver (LMDB) -- CALLS marks ambiguous when two imported files export same name
ok 829 - runCrossFileResolver (LMDB) -- idempotency
ok 830 - embedder.ts derives its keep_alive from the models.local.embeddingKeepAlive config
ok 831 - every ollama.embed(...) call in the indexer embedder passes keep_alive
ok 832 - t1 ac1: one externalEndpoint node per distinct resolved target, with a CALLS_HTTP edge from each caller
ok 833 - t1 ac2 dedup: three call-sites to one target => one node, three CALLS_HTTP edges
ok 834 - t1 ac2 per-repo: two repos calling the same target => two distinct nodes
ok 835 - t1 cross-language: a TS and a Python edge to the same resolved identity share ONE language-agnostic node
ok 836 - t1 resolved-vs-literal dedup: an interpolated expr resolving to the same host/path as a literal collapses to one node
ok 837 - t1 unresolved (k5): an un-pinnable URL mints an unresolved node carrying rawExpression + a CALLS_HTTP edge, never dropped
ok 838 - t1 dangling `from`: a CALLS_HTTP whose caller no longer exists is skipped (no node, no edge)
ok 839 - t1 idempotency: re-running over identical rows yields the identical node/edge set; sc2 called once per distinct expr
ok 840 - t1 no-op: a repo with no CALLS_HTTP rows produces no endpoints and leaves the graph unchanged
ok 841 - t2 edges-stat: one caller, two distinct raw exprs -> same identity => endpoints=1, edges=1 (not 2)
ok 842 - t2 GC: an orphan externalEndpoint (no in-edge) is deleted while a live one survives the pass
ok 843 - t2 GC full-clear: a repo whose HTTP calls were all removed ends with zero endpoint nodes
ok 844 - t2 idempotency: re-running on identical rows deletes nothing and yields the same node set
ok 845 - IGNORE_DIRS excludes build-output + daemon-artifact dirs
ok 846 - full index: during a run the in-process record shows began and files done of selected; at the end the registry row's lastRun is written once with outcome 'completed' or 'failed' (a forced failure mid-walk), and the record is closed; no write per file (counted)
ok 847 - reindex of a ready repository: status indexing and the running record carries the new run's figures
ok 848 - start-up re-queue: repositories left indexing without lastIndexed are still re-queued, unchanged
ok 849 - parseManifest - Maven pom.xml
ok 850 - parseManifest - Gradle (Groovy DSL)
ok 851 - parseManifest - Gradle (Kotlin DSL)
ok 852 - parseManifest - SBT
ok 853 - parseManifest - Mill
ok 854 - parseManifest - no manifest
ok 855 - ac1: publish + subscribe to the SAME topic => ONE node, TWO edges (direction on the edge)
ok 856 - ac1 dedup: three producers to one topic => one node, three PUBLISHES_TO edges; sc2 called once
ok 857 - ac2: a config-built topic resolves to an identity; an un-pinnable one still mints a resolved:false node
ok 858 - idempotency: re-running over identical rows yields the identical node set and GC deletes nothing
ok 859 - cross-protocol GC: the messaging pass GCs an orphan messaging node but NEVER an HTTP node
ok 860 - cross-protocol GC (symmetric): the HTTP pass never deletes a messaging endpoint
ok 861 - no-op: a repo with no messaging rows produces no endpoints
ok 862 - a clean-up job for a registered repository with nothing stored is processed without error
ok 863 - the clean-up removes a file that is gone and a file under an ignored directory, with their relations and unresolved relations, and leaves every other file of the repository and every file of another repository as it was
ok 864 - a file that exists and is not ignored is kept although the file listing leaves it out, an entity with no file path is kept, and a file whose name only contains an ignored name is kept
ok 865 - a repository whose directory is missing loses nothing, and a file whose presence cannot be told is kept
ok 866 - running the clean-up a second time removes nothing, and a repository with nothing stale is left as it was
ok 867 - a file whose parent directory became a file is removed as absent
ok 868 - the clean-up of a repository that ignores a directory leaves the entities a nested registered repository holds for the files under it
ok 869 - the vector rows of a removed file are gone after the clean-up and those of a kept file remain
ok 870 - a kept file's link into a removed entity is removed with it, and the kept file's other links and entities stay
ok 871 - a clean-up that removed files runs the resolver once inside the job, leaves no settle timer armed and removes the repository's cached exploration results, and one that removed nothing leaves them
ok 872 - the clean-up method called directly removes the stale files, runs no resolver and removes no cached result
ok 873 - a store failure part-way through a clean-up job still drops the cached results and runs the resolver for the files already removed, and the job fails
ok 874 - a resolver failure after a clean-up fails the job with the cached results already dropped
ok 875 - a failure on the only stale file still drops the cached results and runs the resolver, because part of the file may be gone
ok 876 - a repository whose directory is there but holds none of the stored files loses nothing, and one where only ignored files are left on disk is still cleaned
ok 877 - an ignored file is removed whatever the check of its presence says, also when it is the only thing stored
ok 878 - a clean-up failure inside a full index fails the full index and marks the repository error
ok 879 - a create or update file job for a file under an ignored directory indexes nothing, and one for a file elsewhere is indexed
ok 880 - a ready repository gets a clean-up job at daemon start, one that gets a full index at start gets no separate one, and a full index runs the clean-up before it marks the repository ready
ok 881 - detectRepoType: marker files map to types (polyglot returns all)
ok 882 - detectRepoType: empty repo → no types
ok 883 - repoTypeIgnoreDirs: java → target/build, python → __pycache__/.venv, node → node_modules/dist
ok 884 - gitignoreDirs: extracts bare dir names, skips comments/negations/globs/nested
ok 885 - gitignoreDirs: no .gitignore → empty
ok 886 - initRepoIgnore: with .gitignore → base ∪ gitignore dirs, persisted to .insrc/config.json
ok 887 - initRepoIgnore: no .gitignore → base ∪ repo-type defaults (java)
ok 888 - initRepoIgnore: idempotent — never overwrites an existing ignore
ok 889 - resolveRepoIgnore: config present → its ignore; absent → IGNORE_DIRS fallback
ok 890 - resolveRelations -- Python relative imports
ok 891 - detectSourceRoots -- Java/Maven
ok 892 - detectSourceRoots -- Java/Gradle
ok 893 - detectSourceRoots -- Scala/SBT cross-build
ok 894 - detectSourceRoots -- Python flat + nested
ok 895 - detectSourceRoots -- Python with src/ layout
ok 896 - detectSourceRoots -- Go
ok 897 - detectSourceRoots -- TypeScript tsconfig
ok 898 - detectSourceRoots -- JavaScript jsconfig
ok 899 - detectSourceRoots -- no-manifest conventions
ok 900 - endpoint id reuses the makeEntityId hex-32 convention (file="" , kind="externalEndpoint")
ok 901 - same (repo, protocol, target) => same id; differing repo => different id (per-repo dedup, k2)
ok 902 - protocol participates in identity: same target, different protocol => different id
ok 903 - unresolved endpoint (target="") derives its id from rawExpression, distinct from a resolved same-protocol endpoint
ok 904 - http-client-shapes helper — stable contract for t4/t5
ok 905 - TypeScript/JS HTTP recognizer
ok 906 - TypeScript proven-receiver dataflow recall (S001 t3)
ok 907 - Java HTTP recognizer (import-gated)
ok 908 - Scala HTTP recognizer (import-gated)
ok 909 - Python HTTP recognizer
ok 910 - Go HTTP recognizer
ok 911 - Python proven-receiver dataflow recall (S001 t4)
ok 912 - Python messaging recognizer (S004)
ok 913 - Go messaging recognizer (S004)
ok 914 - Java parser - top-level types
ok 915 - Java parser - package + imports
ok 916 - Java parser - CALLS
ok 917 - Java parser - members
ok 918 - Java parser - annotations + nesting
ok 919 - Kotlin parser - types
ok 920 - Kotlin parser - functions
ok 921 - Kotlin parser - package + imports
ok 922 - Kotlin parser - supertypes
ok 923 - Kotlin parser - calls
ok 924 - Kotlin parser - robustness
ok 925 - Kotlin parser - registry + jvm dedup
ok 926 - Kotlin parser - grammar smoke regression
ok 927 - messaging-client-shapes helper — stable contract
ok 928 - TypeScript/JS messaging recognizer
ok 929 - Scala parser - top-level types
ok 930 - Scala parser - imports
ok 931 - Scala parser - members
ok 932 - Scala parser - Scala 3 specifics
ok 933 - Scala parser - CALLS
ok 934 - t4: adapter discovers a config-entity Dockerfile AND reads repo-root .env at rest; matches the pure core
ok 935 - t4: an empty-config repo yields an empty map — literals pin, indirect exprs resolve unresolved, no throw
ok 936 - t4: resolution never executes a config source — a Dockerfile RUN / shell is inert text
ok 937 - t1: ResolvedTarget discriminates on `resolved`; ConfigSourceLayer has the four members
ok 938 - t3: a concrete literal resolves true with identity=the literal (no map lookup)
ok 939 - t3: an interpolation referencing a key present only in localConfig resolves from the default
ok 940 - t3: a two-key interpolation with one missing key => {resolved:false} (no partial pin)
ok 941 - t3: a missing key => unresolved
ok 942 - t3: a cyclic interpolation chain terminates and returns unresolved
ok 943 - t3: a deep (nested) chain that terminates resolves to the final literal
ok 944 - t3: protocol is carried through unchanged for http/messaging/rpc (no shape validation)
ok 945 - t3: precedence via resolveAgainst — k8s beats envFile beats localConfig; k8s beats docker
ok 946 - t2: .env parser — key=value, quoted, comments, export, malformed line skipped
ok 947 - t2: Dockerfile ENV parser — KEY=VALUE (multi) + legacy KEY VALUE, tagged docker
ok 948 - t2: docker-compose parser — environment map + list forms, tagged docker
ok 949 - t2: k8s manifest parser — container env + ConfigMap data (multi-doc), tagged k8s, never kubectl
ok 950 - t2: unparseable YAML is skipped without throwing
ok 951 - t2: localConfig parser — flat JSON + key=value/key: value lines, tagged localConfig
ok 952 - t2: buildConfigSourceMap — dispatch by filename + total precedence winner per key
# tests 1063
# pass 1051
# fail 0
# cancelled 0
# skipped 12
```
