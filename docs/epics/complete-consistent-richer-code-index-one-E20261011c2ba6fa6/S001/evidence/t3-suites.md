# s1/t3 evidence: db, indexer, daemon and analyze suites

commit 12413661, 2026-10-16T16:32:15Z. Mutations run by hand on relations-awaiting-target.test.ts: (1) the resolved write drops an absent target -> 3 of 4 fail; (2) a promotion deletes instead of keeping -> 1 fails; (3) no replace before a pending write -> 1 fails. All restored. The new and changed test files typecheck.

```
ok 1 - buildCompleteness computes complete and rejects contradictory facts with RangeError
ok 2 - buildCompleteness accepts several reached limits and a per-group limit below the returned count
ok 3 - a limit on a result's sources is not compared with the returned count
ok 4 - an overall limit is compared with the returned count even beside per-group limits
ok 5 - deriveAnswerReport: all complete, one incomplete, one failed, and a source with neither is rejected
ok 6 - renderCompletenessLine names every incomplete and failed source and repeats a shared basis note once
ok 7 - the completeness line is one line even when a reason, a source id or a note spans lines; the report keeps them as given
ok 8 - empty query returns []
ok 9 - empty closureRepos returns []
ok 10 - no doc entities in closure returns []
ok 11 - keyword pass finds docs containing query terms
ok 12 - keyword pass ignores stopwords + short tokens
ok 13 - non-doc entities are excluded from results
ok 14 - results ordered by score desc
ok 15 - dedup collapses same (file, heading) preferring section
ok 16 - filenameHint boosts matching docs
ok 17 - path-hint boost is MULTIPLICATIVE (proportional lift, not additive)
ok 18 - keyword pass counts ALL query terms, not just first 6
ok 19 - short precise query is not punished by the divisor
ok 20 - maxResults caps returned length
ok 21 - minScore filter drops low-scoring results
ok 22 - kinds allowlist restricts to prose-only when configured
ok 23 - previewChars caps the body preview
ok 24 - previewChars=0 omits preview
ok 25 - measureItem returns the file's length for a document and the length of its lines for a section, and says when the indexer cut the stored body
ok 26 - measureItem does not establish a length for a changed or a missing file (mutation: skip the hash comparison)
ok 27 - indexerFileHash is the hash the indexer records on a file entity
ok 28 - the summariser reads its cut from the exported constant and no file under src/indexer or src/db changes
ok 29 - measureRequestScope on a temporary store gives different sizes for a small directory and for the whole repo with the same prompt, and makes no model call (mutation: read the whole repo for a module scope)
ok 30 - measureRequestScope returns a measure that is not determined, with size XL and the reason, for a scope that cannot be resolved, a scope no registered repo contains, a repo that holds no stored entity, a failed read of the store, and a registry read that rejects while a symbol scope or a connection scope is being resolved, and does not throw; an empty directory inside an indexed repo is XS and determined (mutation: return the count of zero for a path the index does not hold)
ok 31 - a workspace that a registered repo contains is counted through the area predicate (the whole repo at the repo's path, only what lies under a directory inside it); a workspace that no repo contains is summed over the registered repos under it, each read once, for a generic request and for a direct call of measureResolvedScope, is not determined when none lies under it, and is not determined for a code or docs request, which the index check refuses (mutation: treat every workspace as a sum over the repos under it)
ok 32 - measureDataSource counts a relational source through the complete mode of its table listing beyond the limited mode's cap, a namespace source through its namespace listing, and a file source through the file listing with no limit (mutation: call the listing in its limited mode)
ok 33 - measureDataSource is not determined, with size XL and its own reason, for a driver with no listing, a listing that is not supported, a listing that reports it was cut, a Redis or etcd source, and a source that cannot be reached; a data request over several connections is not determined when one of them is not
ok 34 - dataScopeOf gives the pool path and connection id resolveDataScope gave before for each kind of scope, and a data request on a repo is measured by one call per registered connection, each with its connection id
ok 35 - an infra request is measured from the files the infra tasks' own walk visits, with no cap and without the stored graph, also in a directory no registered repo contains, and is not determined when the directory cannot be read (mutation: count the stored entities)
ok 36 - a generic request is measured from the stored graph for a path or entity scope and from the live source for a connection scope, through the generic scope resolution
ok 37 - a live source whose listing never returns, and one that is never reached, is reported as not determined after the time limit with the reason that the listing timed out, and is never a count
ok 38 - a request cancelled while a source is being measured stops at once and the remaining sources of a pool are not asked; a signal already aborted reads nothing
ok 39 - one stalled connection among several does not stop the others from being measured, each has its own time limit, and the sum is not a count
ok 40 - the rejection of a listing abandoned after its time limit is caught and is not an unhandled rejection
ok 41 - the time limit comes from the setting, a value in the options replaces it, and a value that cannot be a time limit gives the default of 120 seconds
ok 42 - a symbol scope is measured with one read by id and a file scope with the read of that file's entities; the measure of a resolved scope (measureResolvedScope) asks the store for every entity of the repository in neither case, and the counts and the size equal those of the whole-repository read; driven through measureRequestScope for a code request, the index check of the scope resolution is the only whole-repository read
ok 43 - a symbol or file scope whose narrow read finds nothing, or finds entities of another repository only, is read as before with the same result; a repo, module or directory scope is read as before
ok 44 - sizeOfCounts gives each size at and just above each of the eight thresholds, takes the larger of the two sizes, never gives a smaller size for a larger count, and throws RangeError for a negative or fractional count (mutation: take the smaller of the two sizes)
ok 45 - measureNamedArea counts the entities of the scope's area and their distinct file paths for a repo, a module, a file and a symbol scope, and does not count the whole repo for a narrower scope (mutation: count every entity given)
ok 46 - measureNamedArea gives XS with determined true for an area that holds nothing, and counts files by distinct path when the repo has no entity of kind 'file'
ok 47 - measureLookupResults sums the returned counts of the outputs that carry a completeness record, counts each file once through filesNamedBy, records the characters, and adds nothing for a failed or unsupported lookup (mutation: count a failed lookup's partial findings)
ok 48 - measureLookupResults gives a measure that is not determined, with size XL, when no output carries a completeness record
ok 49 - every measure records the hint it was given and the hint never changes the size, whether the hint is smaller or larger than the measured size (mutation: use the hint when it is larger)
ok 50 - renderMeasureLine states the size, the source and the counts for each of the three sources, the characters for lookup results, the note when not determined, and the hint when one was given
ok 51 - filesNamedBy returns the file paths of a fixture of every lookup output type, none for the three data outputs and for a failed or unsupported output, and is a switch the compiler checks for every member of the output union
ok 52 - measureLookupResults never throws: an output with a count that is not a whole number, with files that cannot be read or that cannot be written as text is named in the note and the rest is counted; anything unforeseen gives a measure that is not determined
ok 53 - every schema handed to a model is valid under JSON Schema draft 2020-12
ok 54 - a schema's identifier has no fragment and still carries the schema's version
ok 55 - a failed model call for planning or classification names the call and no provider
ok 56 - every writer of an answer's head (the run context's markdown, both writers of the bundle's markdown, the step tool's answer turn, both writers of the workflow runner, and the plan tree's final report) carries the measure line under the completeness line; the plan tree's merged report carries the run's measure; and a report or a run record stored before the change is read as it is
ok 57 - classifier.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 58 - classifier: code-dominant workspace + code question -> target=code # SKIP
ok 59 - classifier: data-dominant workspace + data question -> target=data # SKIP
ok 60 - classifier: infra-dominant workspace + infra question -> target=infra # SKIP
ok 61 - classifier: mixed workspace + broad question -> target=generic OR a primary single target # SKIP
ok 62 - classifier: a pointed question lands with focused=true + non-empty focus # SKIP
ok 63 - classifier: emitted scopeRef.value matches a path the user surfaced # SKIP
ok 64 - the classifier's output schema has no size property and rejects an answer that carries one, the user message built for the classifier names no size among its required fields, and no placeholder size is given to the validator; ClassifiedIntent still has the field
ok 65 - a source scan finds no call that picks a size with a model and no literal default size at the four places that set M today (mutation: restore one default)
ok 66 - CLASSIFIER_SCHEMA_VERSION is a positive integer
ok 67 - TARGET_ENUM enumerates the documented five targets
ok 68 - SCOPE_BUCKET_ENUM enumerates the five buckets in size order
ok 69 - SCOPE_REF_KIND_ENUM enumerates the seven kinds
ok 70 - CLASSIFIED_INTENT_SCHEMA declares every required field
ok 71 - validateIntentShape accepts a minimal valid intent
ok 72 - validateIntentShape accepts a focused intent with focus field
ok 73 - validateIntentShape rejects an intent missing 'target'
ok 74 - validateIntentShape rejects an intent missing 'focused'
ok 75 - validateIntentShape rejects an intent missing 'scopeRef'
ok 76 - validateIntentShape rejects an intent missing 'reasoning'
ok 77 - validateIntentShape rejects target outside the enum
ok 78 - validateIntentShape rejects an answer that carries a size, valid or not
ok 79 - validateIntentShape rejects scopeRef.kind outside the enum
ok 80 - validateIntentShape rejects unknown top-level properties
ok 81 - validateIntentShape rejects unknown scopeRef properties
ok 82 - validateIntentShape rejects boolean target
ok 83 - validateIntentShape rejects string focused
ok 84 - validateIntentShape rejects empty-string scopeRef.value
ok 85 - validateIntentShape rejects empty-string reasoning
ok 86 - validateIntentShape accepts focus only when minLength >= 1
ok 87 - the matrix covers every pairing: five kinds of source by seven kinds of scope
ok 88 - isKindCompatibleWithTarget: target=code, kind=repo -> true
ok 89 - isKindCompatibleWithTarget: target=code, kind=module -> true
ok 90 - isKindCompatibleWithTarget: target=code, kind=file -> true
ok 91 - isKindCompatibleWithTarget: target=code, kind=symbol -> true
ok 92 - isKindCompatibleWithTarget: target=code, kind=connection -> false
ok 93 - isKindCompatibleWithTarget: target=code, kind=manifest-dir -> true
ok 94 - isKindCompatibleWithTarget: target=code, kind=workspace -> true
ok 95 - isKindCompatibleWithTarget: target=data, kind=repo -> true
ok 96 - isKindCompatibleWithTarget: target=data, kind=module -> false
ok 97 - isKindCompatibleWithTarget: target=data, kind=file -> false
ok 98 - isKindCompatibleWithTarget: target=data, kind=symbol -> false
ok 99 - isKindCompatibleWithTarget: target=data, kind=connection -> true
ok 100 - isKindCompatibleWithTarget: target=data, kind=manifest-dir -> true
ok 101 - isKindCompatibleWithTarget: target=data, kind=workspace -> true
ok 102 - isKindCompatibleWithTarget: target=infra, kind=repo -> true
ok 103 - isKindCompatibleWithTarget: target=infra, kind=module -> false
ok 104 - isKindCompatibleWithTarget: target=infra, kind=file -> false
ok 105 - isKindCompatibleWithTarget: target=infra, kind=symbol -> false
ok 106 - isKindCompatibleWithTarget: target=infra, kind=connection -> false
ok 107 - isKindCompatibleWithTarget: target=infra, kind=manifest-dir -> true
ok 108 - isKindCompatibleWithTarget: target=infra, kind=workspace -> true
ok 109 - isKindCompatibleWithTarget: target=docs, kind=repo -> true
ok 110 - isKindCompatibleWithTarget: target=docs, kind=module -> true
ok 111 - isKindCompatibleWithTarget: target=docs, kind=file -> true
ok 112 - isKindCompatibleWithTarget: target=docs, kind=symbol -> false
ok 113 - isKindCompatibleWithTarget: target=docs, kind=connection -> false
ok 114 - isKindCompatibleWithTarget: target=docs, kind=manifest-dir -> false
ok 115 - isKindCompatibleWithTarget: target=docs, kind=workspace -> true
ok 116 - isKindCompatibleWithTarget: target=generic, kind=repo -> true
ok 117 - isKindCompatibleWithTarget: target=generic, kind=module -> true
ok 118 - isKindCompatibleWithTarget: target=generic, kind=file -> true
ok 119 - isKindCompatibleWithTarget: target=generic, kind=symbol -> true
ok 120 - isKindCompatibleWithTarget: target=generic, kind=connection -> true
ok 121 - isKindCompatibleWithTarget: target=generic, kind=manifest-dir -> true
ok 122 - isKindCompatibleWithTarget: target=generic, kind=workspace -> true
ok 123 - validateIntentSemantics: code+connection -> scope-ref-kind-target-mismatch
ok 124 - validateIntentSemantics: data+file -> scope-ref-kind-target-mismatch
ok 125 - validateIntentSemantics: infra+module -> scope-ref-kind-target-mismatch
ok 126 - validateIntentSemantics: pairings the plan tasks accept are accepted (infra+repo, data+repo, data+manifest-dir, code+manifest-dir)
ok 127 - validator symbol form: passes, no '\#', file part not a file
ok 128 - classifier prompt's pairing list equals the exported table
ok 129 - validateIntentSemantics: generic+any-kind -> no kind/target failure
ok 130 - validateIntentSemantics: missing path -> scope-ref-unresolved
ok 131 - validateIntentSemantics: kind=file but value is a directory -> scope-ref-unresolved
ok 132 - validateIntentSemantics: kind=repo but value is a file -> scope-ref-unresolved
ok 133 - validateIntentSemantics: kind=workspace + real dir -> pass
ok 134 - validateIntentSemantics: kind=file + real file -> pass
ok 135 - validateIntentSemantics: kind=manifest-dir + real dir + infra target -> pass
ok 136 - validateIntentSemantics: kind=connection + registered id -> pass
ok 137 - validateIntentSemantics: kind=connection + unknown id -> scope-ref-unresolved
ok 138 - validateIntentSemantics: kind=connection + no callback -> pass (cannot verify)
ok 139 - validateAnalyzePrompts: every PROMPT_PATHS entry is present + non-empty
ok 140 - validateAnalyzePrompts: throws when a prompt file is missing
ok 141 - validateAnalyzePrompts: throws when a prompt file is empty
ok 142 - validateAnalyzePrompts: collects ALL failures in one error
ok 143 - AnalyzePromptValidationError preserves the failures array on the instance
ok 144 - prompt file for 'classification' has a role intro matching expectations
ok 145 - prompt file for 'generic' has a role intro matching expectations
ok 146 - prompt file for 'code' has a role intro matching expectations
ok 147 - prompt file for 'data' has a role intro matching expectations
ok 148 - prompt file for 'infra' has a role intro matching expectations
ok 149 - prompt file for 'docs' has a role intro matching expectations
ok 150 - tmp helpers are wired (smoke)
ok 151 - the stored bundle schema accepts a report and the schema version is 2
ok 152 - the model-facing schema has neither meta nor report at both sites, on the first call and on a later one, and rejects an answer that carries a report
ok 153 - no source file under src/daemon/steps/analyze-step writes a literal schema version
ok 154 - RENDER_ORDER is the documented seven layers in spec order
ok 155 - LAYER_LABELS covers every layer in RENDER_ORDER
ok 156 - omitEmpty returns empty string for empty body
ok 157 - omitEmpty returns empty string for whitespace-only body
ok 158 - omitEmpty renders heading + trimmed body for non-empty body
ok 159 - assembleMarkdown renders all seven layers in order with the footer at tail
ok 160 - assembleMarkdown renders the system layer without a heading
ok 161 - assembleMarkdown appends contract footer exactly once
ok 162 - assembleMarkdown omits layers whose body is empty
ok 163 - assembleMarkdown omits layers whose body is whitespace-only
ok 164 - assembleMarkdown omits layers listed in meta.emptyLayers even with non-empty body
ok 165 - assembleMarkdown without meta uses body-emptiness only
ok 166 - assembleMarkdown with an all-empty bundle still emits contract footer
ok 167 - a bundle with a report leads the prompt text with its completeness line; a bundle with none is rendered as before
ok 168 - cache-invalidation.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 169 - runShaper invalidates cached bundle when registry lastIndexed advances # SKIP
ok 170 - isStaleByIndexer returns true when registry watermark is newer than the bundle
ok 171 - isStaleByIndexer returns false when registry watermark equals the bundle
ok 172 - isStaleByIndexer returns false when registry watermark is older than the bundle
ok 173 - isStaleByIndexer treats bundles with no repoLastIndexedAt stamp as stale (conservative)
ok 174 - isStaleByIndexer treats bundles with no meta at all as stale
ok 175 - readBundle returns the bundle when stamp is fresh against the registry watermark
ok 176 - readBundle invalidates + returns null when registry watermark advanced
ok 177 - readBundle skips the freshness check when currentLastIndexedAt is undefined
ok 178 - readBundle invalidates a bundle missing repoLastIndexedAt when a watermark is supplied
ok 179 - readBundle: bypassCache=true short-circuits BEFORE the freshness check
ok 180 - write-then-advance-then-read pattern: bundle is invalidated by the advanced watermark
ok 181 - cacheFilePathFor (mode=classification) yields classification.json
ok 182 - cacheFilePathFor (mode=run) yields run-bundle.json
ok 183 - cacheFilePathFor (mode=task, with taskId) yields <taskId>.bundle.json
ok 184 - cacheFilePathFor (mode=task, no taskId) throws TypeError
ok 185 - writeBundle then readBundle round-trips an identical body (run mode)
ok 186 - writeBundle then readBundle round-trips an identical body (task mode)
ok 187 - readBundle on a missing slot returns null (no throw)
ok 188 - readBundle with bypassCache=true returns null even when the file exists
ok 189 - readBundle discards the file when the stored key does not match the request key
ok 190 - readBundle discards an invalid-JSON file and returns null
ok 191 - readBundle discards a JSON file with wrong shape (missing key field)
ok 192 - writeBundle leaves no .tmp- file behind after a successful write
ok 193 - invalidateBundle on a missing slot is a silent no-op
ok 194 - writeBundle places the file under PATHS.analyzeContext(runId)
ok 195 - node:os tmpdir + mkdtempSync are usable from this module
ok 196 - classification-shaper.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 197 - CL1: code-dominant workspace -- code surface mentioned; data + infra acknowledged absent # SKIP
ok 198 - CL2: data-dominant workspace -- data surface mentioned; code + infra acknowledged absent # SKIP
ok 199 - CL3: mixed workspace -- code + data + infra all surface # SKIP
ok 200 - CL4: classification bundle stays under 10 KB serialized # SKIP
ok 201 - code-shaper.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 202 - C1: tiny-multi-lang-repo run-mode -- all 3 languages + all 3 surfaces # SKIP
ok 203 - C2: monorepo-fixture (src/insrc) run-mode -- deferred (cost; covered by C1+C3 paths) # TODO
ok 204 - C3: single-file scope -- surface narrows to that file # SKIP
ok 205 - C4: task-mode with one upstream output -- upstream rendered, surface trimmed # SKIP
ok 206 - C5: empty closure on unindexed repo -- requires P6 ensureNonEmptyClosure + driver wiring # TODO
ok 207 - C6: identical re-run hits the run-bundle cache # SKIP
ok 208 - completeness.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 209 - live: a focused request whose text search reaches its limit returns a bundle whose first line says it is incomplete and names that lookup # SKIP
ok 210 - live: a request with a lookup made to fail returns a bundle that lists it as failed, not as empty # SKIP
ok 211 - data-shaper.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 212 - D1: SQLite multi-table + FK -- schema enumerated; FK acknowledged # SKIP
ok 213 - D2: CSV directory-as-table -- directory treated as one logical object # SKIP
ok 214 - D3: hive partitions -- region + date keys surfaced # SKIP
ok 215 - D4: empty SQLite -- bundle valid; sparseness reflected in meta # SKIP
ok 216 - D5: task-mode targeting users table -- surface narrows # SKIP
ok 217 - D6: missing SQLite file -- shaper surfaces the error gracefully # SKIP
ok 218 - planning user turn: 'Repo path' from lookupPath, and the line naming a file, entity or connection
ok 219 - the scope line sits directly under the repo path line
ok 220 - prepareDecompose and decompose build the same user turn for a resolved scope
ok 221 - stable stringify produces identical output for object key permutations
ok 222 - stable stringify is order-stable for Maps with reverse insertion
ok 223 - stable stringify treats different values as distinct
ok 224 - stable stringify is deterministic for arrays (insertion order matters)
ok 225 - classifyOllamaError(ECONNREFUSED) -> ShaperLlmUnavailableError
ok 226 - classifyOllamaError("Ollama is not running. Start it...") -> ShaperLlmUnavailableError
ok 227 - classifyOllamaError("Model not found ...") -> ShaperLlmUnavailableError
ok 228 - classifyOllamaError("fetch failed") -> ShaperLlmUnavailableError (retries exhausted by provider)
ok 229 - classifyOllamaError("Did not receive done...") -> ShaperLlmUnavailableError (retries exhausted)
ok 230 - classifyOllamaError("ECONNRESET") -> ShaperLlmUnavailableError
ok 231 - classifyOllamaError("socket hang up") -> ShaperLlmUnavailableError
ok 232 - classifyOllamaError(arbitrary other Error) -> original error
ok 233 - classifyOllamaError(non-Error value) -> wraps in Error
ok 234 - deriveEmptyLayers on an all-empty bundle returns every layer
ok 235 - deriveEmptyLayers on a fully-populated bundle returns []
ok 236 - deriveEmptyLayers treats whitespace-only bodies as empty
ok 237 - deriveEmptyLayers preserves the spec render order in its return
ok 238 - ShaperLlmUnavailableError carries the call and the cause in its message
ok 239 - ShaperToolLoopExhausted carries the turn count in its message
ok 240 - ShaperSchemaUnrecoverable carries the retry count + reasons in its message
ok 241 - ShaperPromptMissingError carries the absolute prompt path
ok 242 - renderUpstreamSection: classification mode returns empty string
ok 243 - renderUpstreamSection: run mode returns empty string
ok 244 - renderUpstreamSection: task mode with empty upstream map returns empty string
ok 245 - renderUpstreamSection: task mode with one populated upstream renders a JSON block
ok 246 - renderUpstreamSection: null upstream value renders [unavailable: ...] marker
ok 247 - renderUpstreamSection: undefined upstream value also renders unavailable marker
ok 248 - renderUpstreamSection: mixed populated + null upstream renders both
ok 249 - renderUpstreamSection: upstream task ids are sorted alphabetically
ok 250 - classifyOllamaError: a CLI provider's failure in the tool loop reads 'The model call for the tool loop failed: ...' and does not mention Ollama; an Ollama failure's own detail is kept
ok 251 - classifyOllamaError from runFinalStructuredEmit reads 'The model call for the final structured emit failed: ...'
ok 252 - driver.live: skipped (set INSRC_LIVE_TESTS=1 to run) # SKIP
ok 253 - runShaper produces a schema-valid bundle from a minimal prompt # SKIP
ok 254 - runShaper hits the run-bundle cache on identical re-invocation # SKIP
ok 255 - runShaper records meta.toolCalls > 0 when the prompt drives a tool call # SKIP
ok 256 - runShaper handles a forced all-empty bundle # SKIP
ok 257 - runShaper throws ShaperLlmUnavailableError when the provider host is bad # SKIP
ok 258 - runShaper throws ShaperToolLoopExhausted when prompt forces tool calls past the cap # SKIP
ok 259 - cleanup: remove the per-test tmp directory # SKIP
ok 260 - failure-modes.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 261 - failure-mode: code-shaper run-mode against an unindexed registered repo throws ScopeNotIndexedError # SKIP
ok 262 - failure-mode: task-mode with null upstream surfaces [unavailable: ...] in the upstream layer # SKIP
ok 263 - failure-mode: auto-reindex on empty closure -- deferred to P6.b (needs indexer-queue wiring) # TODO
ok 264 - tiny-multi-lang-repo has index.ts, compute.py, user.go, README.md
ok 265 - tiny-multi-lang-repo total LOC is in the documented ballpark
ok 266 - tiny-multi-lang-repo TS exports the documented surface
ok 267 - tiny-multi-lang-repo Python module has helper + 2 public functions
ok 268 - tiny-multi-lang-repo Go exports the documented type + methods
ok 269 - seeded.sqlite is openable + has the 3 documented tables
ok 270 - seeded.sqlite has the documented FK from orders.user_id to users.id
ok 271 - seeded.sqlite has FK on order_items.order_id to orders.id
ok 272 - seeded.sqlite row counts: users=3, orders=3, order_items=4
ok 273 - seeded-csv-dir: 5 consistent CSVs + 1 divergent under hive partitions
ok 274 - seeded-manifests/k8s: 3 Deployments + 2 Services + 1 ConfigMap
ok 275 - seeded-manifests/tf: main.tf + variables.tf with aws resources
ok 276 - seeded-manifests/.github/workflows: one CI workflow
ok 277 - empty-repo: has .git marker + README, no source
ok 278 - unindexed-repo: has .git marker + README + a TS source file
ok 279 - teardownFixtures removes the entire root tree (smoke)
ok 280 - setupFixturesAt is idempotent on a populated root
ok 281 - fallbackFreeformPlan emits exactly one freeform.probe step
ok 282 - fallbackFreeformPlan maps shaperId->answerType so logs stay readable
ok 283 - fallbackFreeformPlan preserves intent.focus in the step purpose
ok 284 - free-form replacement's purpose for an unfocused intent is the broad survey
ok 285 - extractSoleFreeformResult returns the bundle when freeform.probe is the only step
ok 286 - extractSoleFreeformResult returns null when the freeform bundle is all-empty
ok 287 - extractSoleFreeformResult returns null on a mixed plan
ok 288 - generic-shaper.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 289 - G1: code-only workspace -- code in summary; data + infra declared-absent # SKIP
ok 290 - G2: mixed workspace -- code + data + infra all positively acknowledged # SKIP
ok 291 - G3: empty workspace -- bundle valid; artefacts + upstream empty per prompt contract # SKIP
ok 292 - infra-shaper.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 293 - I1: k8s + tf + GHA manifests -- all three families appear in summary + surface # SKIP
ok 294 - I2: k8s-only scope does NOT surface false TF / GHA positives # SKIP
ok 295 - I3: empty manifest dir -- no families detected; bundle still schema-valid # SKIP
ok 296 - I4: artefacts contains representative excerpts for each detected family # SKIP
ok 297 - helpers wired: cleanupRun handles missing files (smoke) # SKIP
ok 298 - ensureNonEmptyClosure: pristine registry -> skipped silently, returns undefined
ok 299 - ensureNonEmptyClosure: connection-kind scope is skipped silently
ok 300 - ensureNonEmptyClosure: registered repo with entities -> returns repo path
ok 301 - ensureNonEmptyClosure: scope nested under registered repo with entities -> match
ok 302 - ensureNonEmptyClosure: registered repo with ZERO entities -> ScopeNotIndexedError
ok 303 - ensureNonEmptyClosure: scope outside every registered repo -> ScopeNotIndexedError
ok 304 - ensureNonEmptyClosure: longest-prefix repo wins when nested
ok 305 - ensureNonEmptyClosure: false-prefix is rejected (requires / boundary)
ok 306 - ensureNonEmptyClosure: given readers it reads the registry and the entities through them, not the real store
ok 307 - ensureNonEmptyClosure: with readers the check keeps its leniency for a registry that cannot be read or holds no repo
ok 308 - ScopeNotIndexedError carries scopePath + registeredAs on the instance
ok 309 - ScopeNotIndexedError handles undefined registeredAs
ok 310 - symbol exception: a symbol in a registered repo with ZERO entities -> ScopeNotIndexedError, not "no entity of that name"
ok 311 - symbol exception: a symbol outside every registered repo, and with a pristine registry -> ScopeNotIndexedError
ok 312 - symbol exception: in an indexed repo a symbol resolves to its stored entity; an unknown name is unresolved
ok 313 - ensureNonEmptyClosure: status 'indexing' (with and without entities) throws RepoIndexingError with the running record's figures; 'indexing' with no record says the figures are not known; 'error' with lastRun.outcome 'failed' throws with lastRun's figures and error; 'pending' and 'ready' with no entities keep ScopeNotIndexedError and its message
ok 314 - ensureRepoQueryable: a docs / data / infra / generic run on a repository under index is refused; an 'error' row without lastRun is refused with figures unknown and its errorMsg
ok 315 - ensureRepoQueryable: a registry read that throws, and a pristine registry, skip the check (no refusal, no raw error)
ok 316 - assembleLiveProjectContext returns zero-doc context for a repo with no summaries
ok 317 - familyBreakdown counts summaries per family
ok 318 - decisions + constraints roll up with citations
ok 319 - decisions cap respects maxDecisions option
ok 320 - topSubjects tallies + sorts by document count desc
ok 321 - recentActivity sorts by summarisedAt desc + populates file path
ok 322 - totalCodeEntities excludes artefacts
ok 323 - placeholder rows count into placeholderCount but not decisions/constraints
ok 324 - the context builder gives the planning call the size of the named-area measure, gives the answer step the size of the measure from lookup results, and puts that measure in the report, as do the step tool's bundle phase and answer turn; the one-shot tool, the step tool and the workflow runner set no size of their own; the free-form lookup uses the request size its runner context carries and, when it carries none, measures its resolved scope or a repo scope at its repo path
ok 325 - the builder's cache key leaves out the intent's size and the size hint: a run and a plan request for the same scope share one cached run bundle
ok 326 - the free-form lookup uses the request size its runner context carries and, when it carries none, measures its resolved scope or a repo scope at its repo path; it never takes a default
ok 327 - the bundle cache key is the same with and without a handed measure
ok 328 - source search: the failure-text list exists only in model-failure.ts
ok 329 - each of the five callers classifies a CLI call failure as its model-unavailable error and a shape failure as its schema error
ok 330 - a typed sampling failure reaches each caller's error as the client's own words
ok 331 - isModelCallFailure: a validation message quoting 'ECONNREFUSED' / 'Model not found' / 'EPIPE' / 'fetch failed' without ' text=' is not a failed call; a ModelCallFailedError from the local provider, bare and behind the retry helper's prefix, is
ok 332 - isModelCallFailure: a plain 'structured-output: ... attempts: Model call failed: ...' message is a failed call
ok 333 - isModelCallFailure: CLI call failures and ModelCallFailedError are failures; shape failures are not
ok 334 - what the model WROTE is not evidence about the call: a quoted answer is never matched
ok 335 - modelCallFailureDetail returns the failure's own words
ok 336 - planning and answer-writing classifiers raise their model-unavailable error for a CLI call failure
ok 337 - planning and answer-writing classifiers raise their model-unavailable error for a typed sampling failure
ok 338 - a shape failure stays a schema error for both calls
ok 339 - model-unavailable messages are provider-neutral and carry the underlying message in a field
ok 340 - the two prompt-missing errors carry the prompt path
ok 341 - each consumer family of isModelCallFailure (the classifier, the planner, the summariser, the aggregator, the synthesizer and the decomposer) on a stand-in Ollama socket failure still reports the model as unavailable, not a shape failure
ok 342 - planning prompt has a no-focus recipe per kind of source, with existing lookups and no limit parameter
ok 343 - the no-focus section sits after the other recipes and before the output format
ok 344 - planning user turn for an unfocused intent names the no-focus section
ok 345 - every prompt that prints the intent's focus states the no-focus rule
ok 346 - CONTRACT_FOOTER_MD is non-empty and references the three citation kinds
ok 347 - PROMPT_PATHS has exactly the six expected shapers
ok 348 - PROMPT_PATHS values point at prompts/analyze/<shaper>.system.md
ok 349 - shaperFor('classification') returns a Shaper with buildClassificationBundle
ok 350 - shaperFor('run', 'code') returns a Shaper with buildRunBundle
ok 351 - shaperFor('run', 'data') returns a Shaper with buildRunBundle
ok 352 - shaperFor('run', 'infra') returns a Shaper with buildRunBundle
ok 353 - shaperFor('run', 'generic') returns a Shaper with buildRunBundle
ok 354 - shaperFor('run') without a target throws TypeError
ok 355 - shaperFor('task', 'code') returns a Shaper with buildTaskBundle
ok 356 - shaperFor('task', 'data') returns a Shaper with buildTaskBundle
ok 357 - shaperFor('task', 'infra') returns a Shaper with buildTaskBundle
ok 358 - shaperFor('task') without a target throws TypeError
ok 359 - shaperFor('task', 'generic') is rejected
ok 360 - focused request on a repo: stand-in arguments and bundle equal the recorded baseline
ok 361 - pipeline returns each cause for the stand-in that produces it, including 'empty-plan' through the fourth stand-in
ok 362 - a planning call that fails for another reason is replaced by the free-form lookup, as before
ok 363 - pipeline returns 'not-applicable' for classification and task modes
ok 364 - pipeline returns a bundle for an unfocused intent on a repo, a module and a workspace
ok 365 - an unfocused intent whose plan is replaced falls to the free-form lookup with a broad-survey purpose
ok 366 - pipeline returns a bundle for file, symbol, manifest directory and connection scopes with the resolved lookup path
ok 367 - module scope: lookup path and cache key unchanged
ok 368 - cause-to-error table: one case per cause, ShaperLlmUnavailableError only for a failed planning call
ok 369 - error messages state the cause, name the failed call, and never say retries or Ollama for another provider
ok 370 - CLI and sampling call failures give 'planner-model-failed' and 'answer-model-failed' from the pipeline
ok 371 - runShaper throws ShaperAnswerStepFailedError with reason 'invalid-bundle' for an invalid bundle
ok 372 - settlePipelineOutcome: a valid bundle is stamped and returned; not-applicable continues; a cause throws its error
ok 373 - the pipeline's three causes after the lookups ran carry the results and the report, and the cause table gives ShaperAnswerStepFailedError with its reason
ok 374 - a missing answer prompt found after the lookups ran carries the results and the report under its own code; a missing planning prompt carries none
ok 375 - a run takes one measure of the area it names: the context builder uses the measure it is handed and does not measure, and the size of its planning call is the size on the run's intent; the plan RPC hands its measure to the builder in the same way
ok 376 - a caller that hands the context builder no measure, or a measure of lookup results, is measured by the builder as before
ok 377 - pipeline: an executePlan that throws ends as ShaperLookupFailedError (code 'lookup-failed'); PIPELINE_CAUSES and errorForPipelineCause have one case per member
ok 378 - runShaper refuses a pairing the table does not allow before resolving the scope
ok 379 - runShaper accepts every pairing in the corrected table
ok 380 - the pairing is checked for run mode only: classification and task inputs are not refused
ok 381 - resolveScopeForTarget: every pairing of the table resolves to what resolveScope gives; every other pairing is refused before a reader is touched
ok 382 - prepareScope makes no pairing check outside run mode: a refused pairing resolves to what resolveScope gives
ok 383 - generic and classification-mode requests on a symbol in an unindexed repo fail as not indexed; on a module they proceed
ok 384 - tool loop's path for classification and task modes is the resolved lookupPath
ok 385 - inputs that carry neither a scope nor an intent fail as invalid input, not as a bare TypeError
ok 386 - no production reasoning site bypasses the RoutingSeamContext — only sanctioned files call buildShaperProvider
ok 387 - the allowlisted seam files still exist (guards against a stale allowlist)
ok 388 - excludes directories matching a root .gitignore rule
ok 389 - every ancestor of a tracked file is considered included
ok 390 - respects a subdirectory .gitignore
ok 391 - non-git repo returns a permissive filter that includes everything
ok 392 - permissiveIgnoreFilter is always-include
ok 393 - include() returns only tracked items
ok 394 - scope path: classification input returns scopeRef.value
ok 395 - scope path: run input with kind=repo returns scopeRef.value
ok 396 - scope path: run input with kind=file returns scopeRef.value
ok 397 - scope path: run input with kind=connection returns empty string
ok 398 - scope path: a symbol yields its FILE, without the name
ok 399 - resolveRepoLastIndexedAt: empty path returns undefined
ok 400 - resolveRepoLastIndexedAt: no registered repo matching the path returns undefined
ok 401 - resolveRepoLastIndexedAt: registered repo with lastIndexed returns ms epoch
ok 402 - resolveRepoLastIndexedAt: registered repo without lastIndexed returns undefined
ok 403 - resolveRepoLastIndexedAt: scope path nested under registered repo matches the parent
ok 404 - resolveRepoLastIndexedAt: longest-prefix match wins when multiple repos overlap
ok 405 - resolveRepoLastIndexedAt: false-prefix is rejected (boundary at "/")
ok 406 - resolveRepoLastIndexedAt: a later updateRepoStatus advances the watermark
ok 407 - empty tiering → peripheral (mid) role resolves to the built-in mid default (claude sonnet), no clamp
ok 408 - empty tiering → critical (core) role resolves to the built-in core default (claude opus), no clamp
ok 409 - S010: brainstorm.decision.draft is peripheral → mid and is NOT floor-clamped
ok 410 - empty tiering BUT an explicit legacy shaperProvider still wins over the built-in defaults
ok 411 - a configured cheap tier wins over the built-in cheap default
ok 412 - roleTiers assigns a peripheral role a cheap tier with a concrete model
ok 413 - a mid CLI tier pins a concrete model (e.g. sonnet) that shaperModel alone cannot express
ok 414 - critical role assigned cheap is clamped UP to a core floor (clampedByFloor true) and uses the core tier model
ok 415 - peripheral role assigned cheap is NEVER clamped even with a core floor
ok 416 - byRepo roleTiers overrides the global roleTiers for the same role
ok 417 - an unknown RoleId falls to the built-in default tier (mid), non-critical, no throw
ok 418 - resolveShaperKind: roleResolved wins over repo/global/client
ok 419 - resolveShaperKind: a non-union roleResolved is coerced away (falls through the chain, never a REST path)
ok 420 - resolveShaperKind: legacy three-input callers resolve identically (roleResolved absent)
ok 421 - resolveProviderForRole memoizes per (role, repoPath) — repeated calls reuse the instance
ok 422 - resolveProviderForRole attaches a resolution record with the resolved tier/runner/model
ok 423 - resolveSummariser follows the summariser config (cheap tier), not the shaper/role tiering
ok 424 - currentRoutingContext is undefined outside an established run
ok 425 - established context → a converted site resolves per-role via the ambient router
ok 426 - unestablished context → resolveRoleProvider is byte-for-byte buildShaperProvider(cfg) (k3)
ok 427 - unestablished context → a claude-preserving legacyFallback is honoured (not dropped to Ollama)
ok 428 - established context with a nullish router throws (fail-loud, no silent legacy revert)
ok 429 - runShaper, run mode: an unfocused request on a module gets a stamped bundle, and each step is handed the resolved scope
ok 430 - runShaper, run mode: a refused pairing fails before the scope is resolved or any step runs
ok 431 - runShaper, run mode: a scope outside every registered repo fails as not indexed before any step runs
ok 432 - runShaper, run mode: a cause becomes its typed error and does NOT fall through to the tool loop
ok 433 - runShaper's run-mode bundle carries the report derived from the executed lookups
ok 434 - a lookup that returns no completeness record is listed as failed, and the answer is still written from the other lookups
ok 435 - a request answered by the free-form lookup alone returns a bundle with a one-source 'model-directed' report
ok 436 - a bundle cached before the change is not returned
ok 437 - the tool loop's final answer is asked for with a schema that has no report, and a classification bundle carries none
ok 438 - runShaper: a lastIndexedAt that throws ends as ShaperIndexStateReadError (code 'index-state-read-failed'), through the one injectable reader (PipelineSteps.lastIndexedAt), at runShaper's freshness read and inside the pipeline
ok 439 - runShaper cache order: a cache hit does not call scope resolution (a scopeDeps that throws is never reached) and returns the bundle; a hit on a connection scope while another repository's connections file is broken returns the bundle
ok 440 - runShaper: a cache hit for a bundle whose repository is now being indexed is refused with RepoIndexingError and the bundle is not returned; a bundle without repoPath is a miss
ok 441 - runShaper: a cache hit whose recorded repository was reindexed since (newer last-indexed time) is a miss and the request is built
ok 442 - bundle schema: a freshly built bundle with repoPath (a string and null) passes validateBundleWithErrors; an older bundle without it still validates
ok 443 - runShaper: a connection-scope bundle (repoPath null) is served from cache without the indexing and freshness checks
ok 444 - runShaper: a cache hit decides the index state by the same rule as a miss: a generic run, or a run whose caller checked the scope, about a repository being indexed is served from a warm cache as it would be built from a cold one; a code run is refused
ok 445 - runShaper: a cache hit on a code run whose recorded repository the index no longer holds is refused as not indexed, as the same request is from a cold cache
ok 446 - runShaper (ISSUE-0c845762): a docs run on a scope the index does not hold (in no registered repository, or in a registered repository with no stored entities) is refused as not indexed before any lookup or model call, cold and warm, with the run's message; a caller that checked the scope already is not checked again
ok 447 - SCHEMA_VERSION is a positive integer
ok 448 - BUNDLE_LAYER_NAMES matches the seven documented layers
ok 449 - schema declares every layer as required
ok 450 - validateBundle accepts a minimum valid bundle (all empty strings, no meta)
ok 451 - validateBundle accepts a fully-populated bundle with meta
ok 452 - validateBundleWithErrors returns ok=true on a valid bundle
ok 453 - validateBundle rejects a bundle missing the 'system' layer
ok 454 - validateBundle rejects a bundle missing the 'focus' layer
ok 455 - validateBundle rejects a bundle missing the 'summary' layer
ok 456 - validateBundle rejects a bundle missing the 'structure' layer
ok 457 - validateBundle rejects a bundle missing the 'surface' layer
ok 458 - validateBundle rejects a bundle missing the 'artefacts' layer
ok 459 - validateBundle rejects a bundle missing the 'upstream' layer
ok 460 - validateBundle rejects a non-string layer
ok 461 - validateBundle rejects unknown top-level properties
ok 462 - validateBundle rejects unknown meta properties
ok 463 - meta.mode rejects values outside the enum
ok 464 - meta.shaper rejects values outside the enum
ok 465 - meta.schemaVersion must match SCHEMA_VERSION exactly
ok 466 - meta.emptyLayers rejects an unknown layer name
ok 467 - meta.emptyLayers rejects duplicate entries
ok 468 - meta.toolCalls rejects a negative count
ok 469 - meta.toolCalls rejects a non-integer
ok 470 - meta.modelId rejects an empty string
ok 471 - meta.repoLastIndexedAt accepts a positive integer when present
ok 472 - meta.repoLastIndexedAt rejects a negative value
ok 473 - bundle without meta is valid (driver stamps meta before persisting)
ok 474 - bundle with partial meta (missing required key) is rejected
ok 475 - resolveScope for each of the seven kinds, with nested repos
ok 476 - a sibling directory that only shares a name prefix is not inside the repo
ok 477 - resolveScope directory kinds keep their own directory as lookupPath; a path in no repo gives repoPath null
ok 478 - a registry that cannot be read leaves the repo unknown for the file-system kinds
ok 479 - resolveScope symbol cases: split, no '\#', none, two, '\#' in the path
ok 480 - resolveScope symbol not-indexed cases: empty repo, no containing repo, empty registry
ok 481 - a symbol that resolves costs one read: the whole repo is read only when the file has no entities
ok 482 - resolveScope connection cases: one, none, two, unparseable connections file
ok 483 - ShaperLlmUnavailableError message names the call, never a provider
ok 484 - ShaperAnswerStepFailedError states its reason, keeps what the lookups found, and never reports retries
ok 485 - the other new errors carry their detail and their own name
ok 486 - a tool's output with no JSON form is described as text and never thrown into the tool loop
ok 487 - shaperProvider=ollama returns an OllamaProvider
ok 488 - shaperProvider=cli-claude returns a CliProvider (claude kind)
ok 489 - shaperProvider=cli-codex returns a CliProvider
ok 490 - isOllamaModelId is true for `:`-tagged ids, false for CLI model ids
ok 491 - cli-claude + explicit Ollama shaperModel → CliProvider with NO model (CLI default)
ok 492 - cli-claude + a real claude shaperModel → forwarded verbatim
ok 493 - cli-claude + a role-tier claude model → forwarded (role model wins)
ok 494 - cli-claude + a role-tier model that is Ollama-shaped → also dropped
ok 495 - ollama path is unchanged: the Ollama model id is still used
ok 496 - shaperProvider=ollama honours cfg.shaperModel + cfg.shaper.ollamaNumCtx
ok 497 - shaperProvider=cli-* is idempotent -- repeated calls return distinct instances
ok 498 - clientDefault picks the matching CLI when config does NOT pin a provider
ok 499 - explicit config shaperProvider overrides the clientDefault
ok 500 - ambient runWithClientProviderContext supplies the default
ok 501 - resolveShaperKind: per-repo override wins over everything below it
ok 502 - resolveShaperKind: explicit global wins over the per-run caller
ok 503 - resolveShaperKind: per-run caller used when repo + global are unset
ok 504 - resolveShaperKind: ollama when all signals are unset
ok 505 - repoOverride beats an explicit global config in buildShaperProvider
ok 506 - repoOverride beats the clientDefault in buildShaperProvider
ok 507 - buildSummariserProvider: defaults to a local OllamaProvider
ok 508 - buildSummariserProvider: stays LOCAL even when shaperProvider is a cloud CLI (the decoupling)
ok 509 - buildSummariserProvider: uses a CLI only when summariserProvider is explicitly cli-*
ok 510 - buildSummariserProvider: a CLI summariser pins the cheap tier's model, and replaces an Ollama-style id with the built-in cheap model
ok 511 - stripMetaFromSchema drops $id so ajv can compile it repeatedly
ok 512 - stripMetaFromSchema is cached: identical reference across calls
ok 513 - stripMetaFromSchema still drops the `meta` property + required entry
ok 514 - READ_ONLY_TOOL_IDS matches the expected snapshot
ok 515 - READ_ONLY_TOOL_IDS has no duplicate entries
ok 516 - file_write must NOT be in the shaper's read-only surface
ok 517 - file_edit must NOT be in the shaper's read-only surface
ok 518 - file_delete must NOT be in the shaper's read-only surface
ok 519 - file_copy must NOT be in the shaper's read-only surface
ok 520 - file_move must NOT be in the shaper's read-only surface
ok 521 - file_mkdir must NOT be in the shaper's read-only surface
ok 522 - file_multi-edit must NOT be in the shaper's read-only surface
ok 523 - shell_exec must NOT be in the shaper's read-only surface
ok 524 - shell_exec-detached must NOT be in the shaper's read-only surface
ok 525 - shell_exec-pipeline must NOT be in the shaper's read-only surface
ok 526 - shell_cwd must NOT be in the shaper's read-only surface
ok 527 - ssh_exec must NOT be in the shaper's read-only surface
ok 528 - ssh:exec-detached must NOT be in the shaper's read-only surface
ok 529 - ssh:port-forward must NOT be in the shaper's read-only surface
ok 530 - scp:upload must NOT be in the shaper's read-only surface
ok 531 - scp:download must NOT be in the shaper's read-only surface
ok 532 - git_amend must NOT be in the shaper's read-only surface
ok 533 - git_commit must NOT be in the shaper's read-only surface
ok 534 - git_push must NOT be in the shaper's read-only surface
ok 535 - git_pull must NOT be in the shaper's read-only surface
ok 536 - git_fetch must NOT be in the shaper's read-only surface
ok 537 - git_merge must NOT be in the shaper's read-only surface
ok 538 - git_rebase must NOT be in the shaper's read-only surface
ok 539 - git_reset must NOT be in the shaper's read-only surface
ok 540 - git_revert must NOT be in the shaper's read-only surface
ok 541 - git_checkout must NOT be in the shaper's read-only surface
ok 542 - git_stage must NOT be in the shaper's read-only surface
ok 543 - git_stash must NOT be in the shaper's read-only surface
ok 544 - git_worktree must NOT be in the shaper's read-only surface
ok 545 - git:cherry-pick must NOT be in the shaper's read-only surface
ok 546 - git_branch must NOT be in the shaper's read-only surface
ok 547 - git_tag must NOT be in the shaper's read-only surface
ok 548 - git_remote must NOT be in the shaper's read-only surface
ok 549 - gh_pr_create must NOT be in the shaper's read-only surface
ok 550 - gh_pr_merge must NOT be in the shaper's read-only surface
ok 551 - gh_pr_close must NOT be in the shaper's read-only surface
ok 552 - gh_pr_view must NOT be in the shaper's read-only surface
ok 553 - gh_issue_create must NOT be in the shaper's read-only surface
ok 554 - gh_issue_close must NOT be in the shaper's read-only surface
ok 555 - gh_run_cancel must NOT be in the shaper's read-only surface
ok 556 - cloud_aws_ec2_terminate must NOT be in the shaper's read-only surface
ok 557 - cloud_aws_s3_rm must NOT be in the shaper's read-only surface
ok 558 - cloud_aws_lambda_invoke must NOT be in the shaper's read-only surface
ok 559 - cloud_gcp_storage_rm must NOT be in the shaper's read-only surface
ok 560 - cloud_az_vm_delete must NOT be in the shaper's read-only surface
ok 561 - k8s_apply must NOT be in the shaper's read-only surface
ok 562 - k8s_delete must NOT be in the shaper's read-only surface
ok 563 - k8s_exec must NOT be in the shaper's read-only surface
ok 564 - k8s_logs must NOT be in the shaper's read-only surface
ok 565 - pkg_install must NOT be in the shaper's read-only surface
ok 566 - pkg_add must NOT be in the shaper's read-only surface
ok 567 - pkg_remove must NOT be in the shaper's read-only surface
ok 568 - notify_slack must NOT be in the shaper's read-only surface
ok 569 - notify_email must NOT be in the shaper's read-only surface
ok 570 - test_run must NOT be in the shaper's read-only surface
ok 571 - test_coverage must NOT be in the shaper's read-only surface
ok 572 - test_watch must NOT be in the shaper's read-only surface
ok 573 - http_request must NOT be in the shaper's read-only surface
ok 574 - http_download must NOT be in the shaper's read-only surface
ok 575 - http_upload must NOT be in the shaper's read-only surface
ok 576 - web_fetch must NOT be in the shaper's read-only surface
ok 577 - web_search must NOT be in the shaper's read-only surface
ok 578 - isReadOnlyShaperTool returns true for every allowlist entry
ok 579 - isReadOnlyShaperTool returns false for unknown tool ids
ok 580 - getReadOnlyTools throws ReadOnlyToolRegistryMismatch when registry is empty
ok 581 - getReadOnlyTools returns N ToolDefinitions after registerBuiltinTools()
ok 582 - getReadOnlyTools result preserves allowlist order
ok 583 - each returned ToolDefinition has a non-empty description + inputSchema
ok 584 - every registered mutation tool from the must-not-be-exposed list is absent from the result
ok 585 - ReadOnlyToolRegistryMismatch reports the missing ids in its message
ok 586 - unfocused.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 587 - unfocused code request on this repository returns a bundle with a no-focus focus layer # SKIP
ok 588 - file scope and symbol scope return a bundle # SKIP
ok 589 - real planning call follows the no-focus recipe for code and returns a free-form lookup for docs # SKIP
ok 590 - failure codes: 'scope-ref-unresolved' with the model running, 'shaper-llm-unavailable' with it stopped # SKIP
ok 591 - a plan in which one of three producers failed has a final report written from the two that exist, with the third named as absent (mutation: skip the aggregate task as before)
ok 592 - a plan in which every producer failed has no final report; a task other than the aggregate task with a missing input is still skipped; an aggregate task that throws still fails the run
ok 593 - a plan whose aggregate task consumes nothing runs with and without a failed task before it (mutation: skip an aggregate task that consumes nothing)
ok 594 - a nested plan in which one child task failed gives a root report, and the answer report names the child's task by its path
ok 595 - through the plan walk, eight tasks of one template each produce the same name and the report task receives all eight, in plan order, each with its task id, template and params
ok 596 - a root plan with four planner tasks hands its report task four child reports, each attributed to its planner task
ok 597 - when one of several producers of a name fails, the report task runs on the others and is handed the failed producer as absent, with its task id and reason; the prompt says that task's output is absent and that the other outputs under the name are available, and when no absent name has an output the absent section is unchanged
ok 598 - a task that is not the report task receives every output of a name it consumes
ok 599 - a writing failure while the walk handles one task fails that task and the walk goes on; an error not tied to a task propagates
ok 600 - unmetDependencies: no consumes -> null
ok 601 - unmetDependencies: every consume present -> null
ok 602 - unmetDependencies: first missing name reported
ok 603 - projectUpstream: limits to consumed names only
ok 604 - checkOutputShape: exact match -> null
ok 605 - checkOutputShape: missing name reported
ok 606 - checkOutputShape: extra name reported
ok 607 - runExecutor: 2-task happy path -- discovery + aggregator
ok 608 - runExecutor: missing runtime -> task fails; downstream cascades
ok 609 - runExecutor: runtime throws -> failed status with reason; cascade
ok 610 - runExecutor: runtime returns extra/missing produces -> output-shape-mismatch
ok 611 - runExecutor: planner-template task materialises child report as parent.report
ok 612 - runExecutor: planner task whose child build failed -> child-plan-unavailable + cascade
ok 613 - taskOutputPathFor: lands under ~/.insrc/analyze/<runId>/tasks/<taskId>.json
ok 614 - readTaskOutput: miss returns null
ok 615 - purgeTaskOutput on a missing slot is a silent no-op
ok 616 - onTaskEvent: 2-task happy path emits started+completed per task in plan order
ok 617 - onTaskEvent: failed task emits started + completed with status="failed"
ok 618 - onTaskEvent: planner-template task -- child plan events fire BETWEEN parent started + completed, with parentTaskPath set
ok 619 - onTaskEvent: throwing subscriber does not crash the executor
ok 620 - SINGLE-PASS: child plan tasks execute exactly once (regression for the executePlanNode double-walk)
ok 621 - the plan walk copies the record to the task record, and a runtime that returns none is recorded as failed
ok 622 - a runtime that throws each typed scope error is a failed task with that code and no 'runtime-threw:' prefix; any other error has no code (mutation: drop the class check)
ok 623 - a task refused for naming a connection outside the scope is a failed task with a code and its own message
ok 624 - plan walk: the walker (executor/walker.ts) records a task whose scope's repository is under index with code 'repo-indexing' through taskRefusalMapping
ok 625 - the plan walk imports nothing from the run driver
ok 626 - every task of every plan in a tree keeps its own record
ok 627 - a planner task whose child produced no report fails with the child's cause
ok 628 - a plan two levels down keeps its own records and names its tasks by their full path
ok 629 - a table test over all twenty lookup types finds a completeness record with its stated basis
ok 630 - the fixture gives every lookup something to return, so the table is not a table of empty results
ok 631 - each lookup that stops at a count reports the limit with its scope
ok 632 - data-model.trace reports its overall limit and both per-target limits
ok 633 - search.text and config.trace turn the search's omissions into skipped, partlyRead and limited
ok 634 - the table-listing lookup reads the data driver's cut flag into a limit
ok 635 - every graph-based record carries the coverage note, on the paths that return early as well
ok 636 - a limit below 1 does not make a text lookup fail
ok 637 - a prepared value without the carried facts gives a record that is not established
ok 638 - tokenise drops stopwords + short tokens
ok 639 - tokenise lowercases + splits on non-alphanumeric
ok 640 - tokenise handles snake_case + dot-separated
ok 641 - tokenise drops framework-generic jargon
ok 642 - splitIdentifier handles snake_case
ok 643 - splitIdentifier handles camelCase
ok 644 - splitIdentifier handles kebab-case
ok 645 - splitIdentifier splits letter/digit boundary + drops single-char tokens
ok 646 - splitIdentifier handles filename with extension
ok 647 - directory match beats file match on same token count (Test 3 case)
ok 648 - depth does NOT enter the score (docs shallow, code deep is a bad prior)
ok 649 - zero token hits returns null (dropped)
ok 650 - structural boost lifts dir scores over the same non-boosted case
ok 651 - score is bounded to [0, 1]
ok 652 - name-token match contributes to score
ok 653 - code dir with real entities beats docs dir with zero entities on same tokens
ok 654 - entity density buckets are monotonic
ok 655 - classifier query matches classification/ via prefix (shared 8 chars)
ok 656 - extract query matches extraction/ via prefix
ok 657 - exact match still beats prefix match at same density
ok 658 - test file with exact matches loses to real module with prefix match
ok 659 - test path regex matches common test directory conventions
ok 660 - test path penalty fires WITHOUT structuralBoost too (regression: executor-placeholders.test.ts beat executor.ts)
ok 661 - short query token (<7 chars) does NOT prefix-match (no false hit)
ok 662 - classifyName: snake_case with underscore
ok 663 - classifyName: all-lowercase word reads as snake_case
ok 664 - classifyName: PascalCase class name
ok 665 - classifyName: camelCase identifier
ok 666 - classifyName: kebab-case file name
ok 667 - classifyName: strips single leading underscore for classification
ok 668 - classifyName: dunder methods classify as unknown
ok 669 - classifyName: mixed underscore + uppercase
ok 670 - classifyName: 1-char and empty strings are unknown
ok 671 - classifyTestFile: test_*.py -> test_*
ok 672 - classifyTestFile: *_test.go -> *_test
ok 673 - classifyTestFile: *.spec.ts -> *.spec
ok 674 - classifyTestFile: *.test.tsx -> *.test
ok 675 - classifyTestFile: file inside tests/ dir with plain name -> inline
ok 676 - classifyTestFile: production file -> none
ok 677 - dominant: single bucket at 100% wins
ok 678 - dominant: 60% share + 2x runner-up wins
ok 679 - dominant: 50/50 split -> mixed
ok 680 - dominant: unknown bucket is ignored in the total
ok 681 - dominant: empty -> unknown
ok 682 - config.trace role: JSON file, quoted key -> definition
ok 683 - config.trace role: python getenv with fallback -> default
ok 684 - config.trace role: python getenv without fallback -> usage
ok 685 - config.trace role: comment line -> unknown
ok 686 - test.locate tokenise: strips stopwords + short tokens
ok 687 - test.locate tokenise: camelCase splits into fragments
ok 688 - test.locate tokenise: dedupes repeats
ok 689 - doc.mention rejects empty params
ok 690 - doc.mention rejects whitespace-only subject
ok 691 - doc.mention rejects non-string subject
ok 692 - doc.decision.trace rejects empty params
ok 693 - doc.decision.trace rejects empty topic string
ok 694 - doc.constraint.enumerate rejects empty params
ok 695 - doc.constraint.enumerate rejects null subject
ok 696 - executor dispatches to the registered runner
ok 697 - executor hands the request's resolved scope to the runner; without one the runner gets none
ok 698 - stepPlan hands the resolved scope to the runner too
ok 699 - the step tool's plan phase resolves the scope from the token and runs the lookups there
ok 700 - unsupported exploration type produces a diagnostic output
ok 701 - runner throw produces a `failed` output; does not stop the plan
ok 702 - deterministic exploration is cached across executions
ok 703 - lastIndexedAt bump invalidates the cache
ok 704 - readDep exposes prior exploration outputs to later runners
ok 705 - $e1.field resolves to prior output field
ok 706 - $eN.field[0..2] returns an array of items
ok 707 - placeholder referencing unknown dep skips the runner cleanly
ok 708 - placeholder with out-of-range index skips the runner cleanly
ok 709 - placeholder resolves to empty array -> runner is skipped, not called
ok 710 - literal string params (not $e-prefixed) pass through verbatim
ok 711 - substitution recurses into nested arrays + objects
ok 712 - the count of catch clauses in the lookup files equals the number of classified entries
ok 713 - a text search that throws becomes the failed output (mutation: restore the catch that returns an empty result)
ok 714 - each class of lookup catch clause has a test: an expected condition says so in the record, anything else is a failed output
ok 715 - a document lookup says when the search by meaning did not run and only keyword matches are in the result
ok 716 - the free-form lookup at its turn limit is a failed output whose partial holds the tool results gathered
ok 717 - a free-form answer's record has basis 'model-directed' and is not complete
ok 718 - both mapping functions name the file of the gathered tool results for 'shaper-tool-loop-exhausted', and carry the results only when no file was written
ok 719 - freeform.probe rejects empty params
ok 720 - freeform.probe rejects whitespace-only purpose
ok 721 - freeform.probe rejects missing shaperId
ok 722 - freeform.probe rejects unknown shaperId
ok 723 - freeform.probe rejects non-string shaperId
ok 724 - free-form lookup for a file-scope request builds a file intent and uses the resolved repo as the loop's path
ok 725 - free-form loop's path for a connection is the connection's repo
ok 726 - a module request keeps its own directory, and a bare repo path stands for a workspace scope
ok 727 - k8s body kind wins over a misleading filename
ok 728 - multi-doc manifest returns the FIRST doc kind
ok 729 - helm Chart.yaml returns the chart name; other helm files return undefined
ok 730 - empty and unparseable bodies return undefined (caller falls back)
ok 731 - non-k8s/helm families return undefined (family gate)
ok 732 - a doc with a non-string / missing kind yields undefined
ok 733 - inferResourceKind (fallback) still guesses from the filename
ok 734 - a document lookup that cuts a 100,000-character section to 2,000 reports it against the section's real length (mutation: measure the stored body)
ok 735 - a section whose file changed since it was indexed is reported as partly read with no length claimed
ok 736 - a lookup that passes on a stored body uncut reports the item as partly read when the indexer cut it
ok 737 - module.profile reports each file it cut with the kept and full lengths
ok 738 - each of the three lookups that pause for a model call builds its record in finalize from the facts prepare carried, and a prepared value without them is not established
ok 739 - the measurer finds the file's recorded hash in the graph, and reports an item only when something shows it is longer
ok 740 - usage.example rejects empty params
ok 741 - usage.example rejects blank symbolName + blank entityId
ok 742 - usage.example rejects non-string symbolName
ok 743 - class.hierarchy rejects empty params
ok 744 - class.hierarchy rejects both fields empty-string
ok 745 - capability.reuse-check rejects empty params
ok 746 - capability.reuse-check rejects whitespace-only capability
ok 747 - capability.reuse-check rejects non-string capability
ok 748 - convention.detect rejects empty params
ok 749 - convention.detect rejects whitespace-only path
ok 750 - test.locate rejects empty params
ok 751 - test.locate rejects non-string subject
ok 752 - config.trace rejects empty params
ok 753 - config.trace rejects path outside repoPath
ok 754 - data-model.trace rejects empty params
ok 755 - data-model.trace rejects whitespace-only entityName
ok 756 - db.tables.list rejects empty params
ok 757 - db.tables.list rejects whitespace-only connectionId
ok 758 - db.table.describe rejects empty params
ok 759 - db.table.describe rejects only-connectionId
ok 760 - manifests.locate returns empty output when repo has no indexed entities
ok 761 - classifyFamily: Dockerfile -> docker
ok 762 - classifyFamily: .tf -> terraform
ok 763 - classifyFamily: .github/workflows/*.yml -> ci
ok 764 - classifyFamily: Chart.yaml -> helm
ok 765 - classifyFamily: k8s/ path -> kubernetes
ok 766 - classifyFamily: plain yaml under repo root -> other
ok 767 - isK8sPath: recognises the standard directories
ok 768 - isHelmPath: Chart.yaml + values.yaml + helm/ + charts/
ok 769 - isCIPath: known CI file locations
ok 770 - inferResourceKind: filename convention wins for kubernetes/helm
ok 771 - inferResourceKind: undefined for non-kubernetes families
ok 772 - no prompt under src/prompts/analyze names a removed field, and each names `completeness`
ok 773 - a lookup output cached before the change is not returned: the cache key includes its version
ok 774 - search.text rejects empty params
ok 775 - search.text rejects whitespace-only pattern
ok 776 - search.text rejects non-string pattern
ok 777 - search.text rejects absolute path outside repoPath
ok 778 - search.text rejects sibling-scoped absolute path
ok 779 - hinted request: focused with the prompt as focus, unfocused with an empty prompt
ok 780 - hinted request: the validator's two checks are made, with the connection check it was given
ok 781 - hinted pairing the table refuses fails at 'classify' with a failed run record
ok 782 - hinted request with a scope that does not resolve fails with 'scope-ref-unresolved'
ok 783 - hinted request with a valid pairing reaches the context builder and the planner
ok 784 - hinted request: a connection check that throws fails the run at classify with a code, not an unhandled rejection
ok 785 - the classifier receives a connection check from each caller
ok 786 - connectionIsRegistered: declared by a registered repo or not; an unreadable file is reported
ok 787 - an uncaught error gives a failed record at the stage reached and a returned failure, 'done' fires once and the run is no longer live (mutation: remove the handler)
ok 788 - a run is live from its first read of a record until it returns, and with two runs under one id until the second returns (mutation: hold a set of ids instead of a count)
ok 789 - with a run record that cannot be written the handler still returns 'internal-error' and fires 'done' once (mutation: let the write's error escape)
ok 790 - a completed run asked for again returns its stored result and report; a record left in progress is replaced by the new run's first record, with no abandoned rewrite
ok 791 - the handler of an uncaught error leaves a record that already says how the run ended, and the record of another run still going under the same id
ok 792 - orchestrator-e2e.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 793 - orchestrator-e2e.live: infra XS end-to-end -> result mirrors run.json # SKIP
ok 794 - classifyClassifierError: typed errors map to stable codes
ok 795 - plan tree's classify mapping returns the inner code and passes context errors on; the table-test row rewritten
ok 796 - classifyClassifierError: unrecognized error -> internal-error
ok 797 - classifyClassifierError: non-Error throws are stringified into internal-error
ok 798 - classifyShaperError: ScopeNotIndexedError populates data
ok 799 - classifyShaperError: typed shaper errors map to stable codes
ok 800 - classifyShaperError: unrecognized error -> internal-error
ok 801 - classifyPlannerError: MaxPlanDepthExceededError populates data
ok 802 - classifyPlannerError: PlanBuilderExhausted -> plan-invariant-failed with lastFailure
ok 803 - classifyPlannerError: typed planner errors map to stable codes
ok 804 - classifyPlannerError: unrecognized error -> internal-error
ok 805 - writeRunRecord + readRunRecord: round-trip preserves the record
ok 806 - readRunRecord: miss returns null
ok 807 - runRecordPathFor: lands under ~/.insrc/analyze/<runId>/run.json
ok 808 - purgeRunForTests on a missing slot is a silent no-op
ok 809 - purgeRun: missing run dir -> { ok:true, purged:false }
ok 810 - purgeRun: status=ok run -> removes dir
ok 811 - purgeRun: status=failed run -> removes dir (no protection on failed)
ok 812 - purgeRun: status=in-progress without force -> refused
ok 813 - onEvent: resume cache hit emits a single done event with the cached result
ok 814 - onEvent: aborted signal -> done event with code="aborted"
ok 815 - onEvent: missing onEvent option -> no exception (no-op)
ok 816 - onEvent: throwing callback does not crash the run
ok 817 - purgeRun: status=in-progress with force=true -> removes dir
ok 818 - resume: status=ok + stage=done -> cached RunAnalyzeOk returned without re-running
ok 819 - resume: status=failed -> NOT short-circuited (would re-run)
ok 820 - resume: status=in-progress -> NOT short-circuited (stale record from crash)
ok 821 - resume: missing run.json -> NOT short-circuited (cold cache)
ok 822 - runAnalyze sets the intent's size from the measure on both classification branches, keeps a stated size as the hint, puts the measure on the classified event, in the run record and in the final report, and makes no model call to pick a size (mutation: take the stated size as the size)
ok 823 - a run takes one measure of the area it names: the context builder uses the measure it is handed and does not measure, and the size of its planning call is the size on the run's intent; the plan RPC hands its measure to the builder in the same way
ok 824 - the run driver passes its signal to the measure and to the recursive planner, and the planner passes it to the measure of each child plan
ok 825 - run order: a code request on a path no registered repository contains emits no 'classified' event and no measure substep, and ends failed at classify with the same code and message as runShaper's refusal (recorded from today's code before the change)
ok 826 - run order: the same on the hinted-target branch
ok 827 - run order: a docs request on an unindexed scope emits no 'classified' event and ends failed at classify with the moved check's code and message
ok 828 - run order: a request that passes the check still emits 'classified' with its measure, as before
ok 829 - runAnalyze: a request about a repository under index ends with code 'repo-indexing' through the orchestrator's mapping (not 'internal-error')
ok 830 - runAnalyze's scopeChecked option reaches runShaper through ShapeOpts and does not change the cache key
ok 831 - a run with one failed task and one limited task returns a report naming both, and its final report's text starts with the completeness line
ok 832 - a run with a nested plan names an incomplete child task by its path; the planner-kind task and the aggregate-report task are not sources
ok 833 - a run record written after the change resumes with its report (mutation: leave `report` out of the resume literal)
ok 834 - a run record written without a report resumes with none and its text form carries the not-recorded line
ok 835 - a run that completes stores its report in the run record, and resuming from that record returns the same report and the same text
ok 836 - the plan's and the run's tasksFailed and the daemon's response carry the code
ok 837 - a docs run on a scope in no registered repo ends at stage 'classify' with 'scope-not-indexed' before anything is measured or built; a refused pairing still ends at 'classify'; a generic run is not checked (mutation: remove the check before planning)
ok 838 - runAnalyze: index-state-read-failed and lookup-failed end with their own codes, not internal-error
ok 839 - both classifyShaperError functions map each of the five new error classes to its code
ok 840 - one list of ten error classes gives the same code from the plan tree's and the daemon's mapping
ok 841 - an error neither mapping knows stays internal-error on both sides
ok 842 - the cause codes are declared in both lists
ok 843 - classifyShaperError: RepoIndexingError maps to 'repo-indexing' with its data in both mappings
ok 844 - classifyShaperError: index-state-read-failed and lookup-failed map to their own codes in both mappings
ok 845 - both mapping functions return 'answer-step-failed' with the reason, the results and the report, and a failed planning call is still 'shaper-llm-unavailable'
ok 846 - both mapping functions keep the code of a missing prompt and put the results and the report in its data only when the lookups ran
ok 847 - one function maps the three scope error classes to their codes and data, and both mapping functions return through it what they returned before (mutation: return the code alone)
ok 848 - planDirFor: root plan -> ~/.insrc/analyze/<runId>
ok 849 - planDirFor: child plan for t02 -> tasks/t02
ok 850 - planDirFor: nested child plan for t02.t05 -> tasks/t02/tasks/t02.t05
ok 851 - planDirFor: deeply nested t02.t05.t01 -> three nested tasks/ dirs
ok 852 - planFinalPathFor: root -> plan.json under run dir
ok 853 - planAttemptPathFor + planFeedbackPathFor: zero-padded N-digit naming
ok 854 - planAttemptPathFor: 10 doesn't zero-pad
ok 855 - readPlanFinal: miss returns null
ok 856 - writePlanFinal then readPlanFinal round-trips an identical plan
ok 857 - writePlanFinal overwrites a prior final (resume case)
ok 858 - writeAttempt + writeFeedback land at zero-padded paths
ok 859 - multiple attempts persist independently (no overwriting between attempts)
ok 860 - child plan persists under tasks/<parentTaskPath>/
ok 861 - nested child plan (t02.t05) lands at the right depth
ok 862 - writePlanFinal leaves no .tmp- file behind
ok 863 - purgePlan removes plan.json + plan.attempts/ for the given slot
ok 864 - purgePlan: child plan purge does NOT affect root plan
ok 865 - renderCatalog: empty catalog renders the no-templates marker
ok 866 - renderCatalog: single template renders id + target + family + description + produces
ok 867 - renderCatalog: aggregator template flags itself with INV-12 hint
ok 868 - renderCatalog: catalog order is preserved
ok 869 - renderDepthPolicy: M scope reports 20-40 band
ok 870 - renderDepthPolicy: focused intent halves the lower bound only
ok 871 - renderDepthPolicy: XS depth hint mentions detailed per-unit
ok 872 - renderDepthPolicy: XL depth hint mentions structural breadth + child plans
ok 873 - classifyError(ECONNREFUSED) -> PlanBuilderLlmUnavailableError
ok 874 - classifyError("Ollama is not running") -> PlanBuilderLlmUnavailableError
ok 875 - classifyError("Model not found") -> PlanBuilderLlmUnavailableError
ok 876 - classifyError(arbitrary error) -> PlanBuilderSchemaUnrecoverable
ok 877 - classifyError(non-Error) -> wraps in PlanBuilderSchemaUnrecoverable
ok 878 - PlanBuilderLlmUnavailableError carries cause in message
ok 879 - PlanBuilderSchemaUnrecoverable carries error list in message
ok 880 - PlanBuilderPromptMissingError carries the absolute path
ok 881 - PlanBuilderExhausted carries attempts + failures + lastFailure
ok 882 - buildInitialMessages: emits 2 messages (system, user) with all the required sections
ok 883 - buildInitialMessages: child-plan parentTaskPath emits the warning note
ok 884 - appendCorrectionTurn: re-issues with the assistant turn + VALIDATOR FEEDBACK block
ok 885 - MaxPlanDepthExceededError carries currentDepth, rootScope, cap on the instance
ok 886 - runPlanner: refuses BEFORE any LLM call when currentDepth+1 > cap
ok 887 - runPlanner: rootScope overrides intent.scope for the depth cap
ok 888 - runPlanner: rootScope=XS at currentDepth=2 (exactly the cap) is rejected
ok 889 - runPlanner: default currentDepth=0 always passes the depth check (cap >= 2)
ok 890 - appendCorrectionTurn with failure.target renders the pointer
ok 891 - appendCorrectionTurn: escalation banner fires when the same (invariantId, taskId) repeats
ok 892 - appendCorrectionTurn: no escalation banner when previous failure was a different invariant
ok 893 - appendCorrectionTurn: no escalation banner when same invariant hits a different task
ok 894 - planner.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 895 - runPlanner: infra target + XS scope -> validated PlanTask using the registered catalog # SKIP
ok 896 - planner.live setup: registered catalog covers every target with an aggregator # SKIP
ok 897 - extractChildIntent: well-formed childIntent -> returns it
ok 898 - extractChildIntent: missing childIntent -> null
ok 899 - extractChildIntent: malformed childIntent (missing required field) -> null
ok 900 - buildParentTaskPath: root parent (undefined) -> taskId verbatim
ok 901 - buildParentTaskPath: empty parent string -> taskId verbatim
ok 902 - buildParentTaskPath: nested -> parent.taskId
ok 903 - countNodes / countPlannerTasks / maxDepth on a single-node tree
ok 904 - countNodes / countPlannerTasks / maxDepth on a 3-level tree
ok 905 - runRecursivePlanner: root with one planner-template task spawns a child plan; tree has 2 nodes
ok 906 - runRecursivePlanner: depth-cap hit on a deeper subtree -> childError = MaxPlanDepthExceededError
ok 907 - runRecursivePlanner: child plans inherit rootScope for the depth cap
ok 908 - a plan's task band and its depth cap both follow the measured size, and a child plan is measured from the area it names when it is spawned, with the planner model's figure kept as the hint (mutation: keep the model's figure as the child's size)
ok 909 - the run driver passes its signal to the measure and to the recursive planner, and the planner passes it to the measure of each child plan
ok 910 - PLAN_SCHEMA_VERSION is a positive integer
ok 911 - PLAN_TARGET_ENUM matches the four documented targets
ok 912 - PLAN_SCOPE_BUCKET_ENUM matches the five buckets in size order
ok 913 - TASK_KIND_ENUM is exactly leaf | planner
ok 914 - TASK_ID_PATTERN matches t01 / t99 / t100 / t999 but not t1 / tabc / T01
ok 915 - validatePlanShape accepts a minimal valid plan
ok 916 - validatePlannedTaskShape accepts a minimal valid task
ok 917 - validatePlanShape accepts a plan with parentTaskPath (child plan)
ok 918 - validatePlannedTaskShape accepts a task with consumes + taskPath
ok 919 - validatePlanShape rejects a plan missing 'planId'
ok 920 - validatePlanShape rejects a plan missing 'goal'
ok 921 - validatePlanShape rejects a plan missing 'target'
ok 922 - validatePlanShape rejects a plan missing 'scope'
ok 923 - validatePlanShape rejects a plan missing 'tasks'
ok 924 - validatePlanShape rejects a plan missing 'reasoning'
ok 925 - validatePlannedTaskShape rejects a task missing 'taskId'
ok 926 - validatePlannedTaskShape rejects a task missing 'template'
ok 927 - validatePlannedTaskShape rejects a task missing 'kind'
ok 928 - validatePlannedTaskShape rejects a task missing 'params'
ok 929 - validatePlannedTaskShape rejects a task missing 'produces'
ok 930 - validatePlannedTaskShape rejects a task missing 'rationale'
ok 931 - validatePlanShape rejects unknown target
ok 932 - validatePlanShape rejects unknown scope
ok 933 - validatePlannedTaskShape rejects taskId not matching the pattern
ok 934 - validatePlannedTaskShape rejects kind outside leaf|planner
ok 935 - validatePlanShape rejects unknown top-level properties
ok 936 - validatePlannedTaskShape rejects unknown task properties
ok 937 - validatePlanShape rejects empty tasks array (minItems:1)
ok 938 - validatePlannedTaskShape rejects empty produces array (minItems:1)
ok 939 - validatePlannedTaskShape rejects duplicate produces entries (uniqueItems)
ok 940 - validatePlannedTaskShape rejects too-short rationale (minLength 20)
ok 941 - validatePlanShape rejects too-short plan reasoning (minLength 50)
ok 942 - validatePlanShape rejects too-long goal (maxLength 200)
ok 943 - registerTemplate accepts a well-formed template
ok 944 - registerTemplate rejects id collision
ok 945 - registerTemplate rejects missing inputSchema
ok 946 - registerTemplate rejects empty produces
ok 947 - registerTemplate rejects missing description
ok 948 - registerTemplate: family=aggregate without isAggregator flag is rejected
ok 949 - registerTemplate: isAggregator without family=aggregate is rejected
ok 950 - registerTemplate: family=aggregate AND isAggregator:true is accepted
ok 951 - registerBuiltinTemplates registers exactly 27 builtins (7 code + 5 data + 8 infra + 1 generic + 6 docs) without collision
ok 952 - registerBuiltinTemplates is idempotent (latch prevents double-register)
ok 953 - every per-target subset has its own aggregator
ok 954 - getTemplatesForTarget(code) returns 7 code templates (6 leaf + 1 planner)
ok 955 - getTemplatesForTarget(data) returns 5 data templates
ok 956 - getTemplatesForTarget(infra) returns 8 infra templates
ok 957 - getTemplatesForTarget(docs) returns 6 docs templates (5 leaf + 1 planner)
ok 958 - getTemplatesForTarget(generic) returns the FULL catalog (INV-4 permits cross-target)
ok 959 - every builtin template has a syntactically valid inputSchema (Ajv compiles)
ok 960 - every builtin template produces non-empty string entries
ok 961 - every builtin template id namespaces its target as the leading prefix
ok 962 - every builtin template description is at least one sentence (>= 20 chars)
ok 963 - aggregator templates produce exactly ['report']
ok 964 - every builtin template's scopeRef lists exactly the kinds of scope its family accepts, and the catalog shows the planner those kinds only
ok 965 - a plan whose task carries a kind of scope its family does not accept fails validation with the task, the kind and the accepted kinds
ok 966 - the scope of a child plan is held to the kinds its own kind of source accepts
ok 967 - a scopeRef that is not an object, or whose kind is not a string, still fails validation by the schema
ok 968 - a plan whose adherence task has no topic, no inline constraints and no stored-document ids fails validation with the task, the three ways to give constraints and the option to leave the task out (code, data and infra), and the INV-5 fix hint sent with the message gives the same remedies, including removing the task and renumbering the ids that follow
ok 969 - an adherence task with a topic, with an inline list, or with stored-document ids validates; one whose only source is an empty topic or an empty list does not, a non-empty override with an empty list beside it still validates, one with the removed constraintsSource does not, and for constraintsSource the message says to give constraintTopic instead, also in a generic plan that holds the docs task and also beside a usable override
ok 970 - the catalog shown to the planner for each adherence template names constraintTopic and does not name constraintsSource or docs.constraint.enumerate
ok 971 - validatePlan: happy-path 20-task M-bucket plan passes every invariant
ok 972 - INV-1: empty tasks list
ok 973 - INV-2: gap in task ids (t01, t02, t04)
ok 974 - INV-2: out-of-order ids (t01, t03, t02, ...)
ok 975 - INV-3: unknown template id
ok 976 - INV-4: data template in a code plan
ok 977 - INV-4: generic-target plans accept any target template
ok 978 - INV-5: missing required param key
ok 979 - INV-5: param value with wrong type
ok 980 - INV-6: emitted produces differs from template produces
ok 981 - INV-7: task consumes an output no earlier task produces
ok 982 - INV-8: leaf template emitted with kind=planner
ok 983 - INV-8: planner template emitted with kind=leaf
ok 984 - INV-9: params contains a nested {taskId, template, ...} array
ok 985 - INV-9: params deeply nested array of task-shaped objects
ok 986 - INV-10: produces->consumes cycle (a depends on b depends on a)
ok 987 - INV-12: no aggregator at all
ok 988 - INV-12: aggregator not in the last slot
ok 989 - INV-12: TWO aggregator tasks
ok 990 - INV-13: M-bucket plan with too few tasks (below lower bound 20)
ok 991 - INV-13: focused intent halves the lower bound
ok 992 - INV-13: focused intent does NOT raise the upper bound
ok 993 - INV-14: task rationale at exactly 19 chars (boundary)
ok 994 - INV-14: plan reasoning at exactly 49 chars (boundary)
ok 995 - INV-15: root plan must NOT have parentTaskPath
ok 996 - INV-15: child plan MUST have parentTaskPath
ok 997 - INV-15: child plan with parentTaskPath set passes
ok 998 - SCOPE_BAND values match the design doc
ok 999 - each of the five aggregate-report runtimes hands absentInputs to the aggregator
ok 1000 - each of the five aggregate-report runtimes hands every output of a name to the shared aggregate code, and the count of tasks analysed is the number of outputs
ok 1001 - each of the five aggregate prompts describes the block as it is rendered and no longer says one section per task id
ok 1002 - a table test over every registered plan-task runtime finds a completeness record on each result
ok 1003 - a table test over every registered plan-task runtime still finds a completeness record on each result, with the functional-surface task given a directory path
ok 1004 - the fixture gives the inventories and listings something to return
ok 1005 - no output of the five infra inventories has a `truncated` field; a walk that stops at its cap is a limit in the record
ok 1006 - discovery-families reports its per-family sample as a per-group limit and is not rejected by the builder
ok 1007 - the object-listing plan task reads the data driver's cut flag into a limit
ok 1008 - an aggregate-report runtime's record says its completeness is that of the tasks it summarises
ok 1009 - the count of catch clauses in the runtime files equals the number of classified entries
ok 1010 - an inventory over a tree with an unreadable directory and a file that does not parse lists both under skipped and is not complete (mutation: restore the silent skip)
ok 1011 - an adherence check whose model call fails is recorded by the walk as a failed task
ok 1012 - each adherence check reports a body it cut with the kept and full lengths
ok 1013 - the project-context assembler reports a limit it reached and the documents behind its decisions and constraints, and the adherence check puts them in the record
ok 1014 - the docs plan tasks report a document longer than the summariser's cut under partlyRead, and a missing summary and a failure placeholder under skipped (mutation: drop the partlyRead entry)
ok 1015 - the docs tool exposed to agents returns what it returned before
ok 1016 - the infra and data scope functions are gone and no infra or data runtime uses the scope's value as a repo path
ok 1017 - the code family's scope function and its test hook are gone and no code runtime uses the scope's value as a repo path
ok 1018 - the source scan asserts one read of the repo's entities kept whole in discovery-modules.ts and today's form in the tree and the entry-points runtimes (mutation: read the repo's entities a second time)
ok 1019 - the source scan asserts the new form for structure-module-tree.ts
ok 1020 - the source scan asserts that surface-functional.ts resolves the run's scope through the one scope function for a directory path
ok 1021 - no docs runtime uses the scope's value as a repo path
ok 1022 - the unrelated resolveRepoPath under src/mcp is untouched
ok 1023 - code.aggregate.report.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 1024 - code.aggregate.report.live: real Ollama -> validator-passing AggregateReport # SKIP
ok 1025 - modulePrefixOf: includes trailing slash for nested paths
ok 1026 - modulePrefixOf: root-level path (no slash) returns input
ok 1027 - compareEntitiesByLocation: file then startLine then name
ok 1028 - code deterministic runtimes integration: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 1029 - discovery.entrypoints: lists only exported functions/methods/classes, sorted by location # SKIP
ok 1030 - surface.functional: splits exports vs internalHelpers for a single module # SKIP
ok 1031 - surface.functional: shallow depth omits body, deep includes it # SKIP
ok 1032 - the gated test of an unknown module value fails with the message that no stored source file lies under it # SKIP
ok 1033 - surface.functional: passing a non-module entity id -> throws # SKIP
ok 1034 - surface.functional: missing params.module -> throws with INV-5 message # SKIP
ok 1035 - structure.module-tree: emits module nodes + IMPORTS edges as module-to-module # SKIP
ok 1036 - the gated test of a repository with no module entity and one source file gives one node '.' and no edge # SKIP
ok 1037 - readScopeRef: well-formed scopeRef -> returned verbatim
ok 1038 - readScopeRef: missing scopeRef -> throws with INV-5 message
ok 1039 - readScopeRef: scopeRef with wrong shape -> throws
ok 1040 - registerBuiltinRuntimes registers code.discovery.modules; idempotent
ok 1041 - registerBuiltinRuntimes: after reset, re-registers without collision
ok 1042 - code.discovery.modules integration: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 1043 - integration: seeded 3 modules + 2 functions -> outputs only the 3 modules, sorted by path # SKIP
ok 1044 - integration: repo with zero modules -> empty array, not error # SKIP
ok 1045 - integration: manifest-dir scopeRef -> resolved to repo path # SKIP
ok 1046 - integration: a kind the code family does not accept (connection) -> refused, naming the template and the kinds allowed # SKIP
ok 1047 - on a graph with no module entity for the repository's directories, the module list returns the directories that hold source, and its record's rule says what a module is (mutation: keep only entities of kind 'module', as before)
ok 1048 - the module list keeps a stored module entity with the fields it had and lists no directory in or under its directory; a file scope that names a module entity's own file returns that module; a run scoped under a stored module's directory lists none (mutation: make a directory module of the sub-directory)
ok 1049 - under a module scope the module list keeps to the area, and under a file scope on a source file and a symbol scope it is empty
ok 1050 - on the same graph the module tree has a node per source directory and an edge for an import between two directories, and none for an import inside one
ok 1051 - with two stored module entities and source in a sub-directory of the first, the tree has the two nodes and the one edge between them with its count, and the sub-directory is not a node (mutation: make a directory module of the sub-directory)
ok 1052 - under a module scope the tree keeps to the area, a file whose owning stored module lies above the area is left out, and under a file scope on a source file and a symbol scope the tree is empty
ok 1053 - a repository with no module entity and one source file gives one node '.' and no edge
ok 1054 - the functional-surface task given a directory path returns the exports and helpers of every source file under it, including sub-directories, and names the directory in its output (mutation: require a stored module entity, as before)
ok 1055 - the functional-surface task given a directory that holds source only in its sub-directories returns their surface
ok 1056 - the functional-surface task given a value that names nothing fails with a reason that says no stored source file lies under it, and the plan walk records the task as failed, not as an empty module
ok 1057 - a stored module entity's id returns the surface it returned before under every kind of scope and resolves no scope: with the scope function's readers set to throw the id still answers and a directory path fails (mutation: resolve the scope before the id is looked up)
ok 1058 - a functional-surface task that names a directory outside the area of a module scope is refused, and a directory path under a file scope or a symbol scope is refused (mutation: test a directory against the area with the entity predicate)
ok 1059 - an unknown module value fails with the message that no stored source file lies under it
ok 1060 - a code task with a module scope uses only the entities under that directory, with a file scope only that file's, with a symbol scope the one entity
ok 1061 - the adherence check gives the same result for a repo scope as before, as a code, a data and an infra template, and as a data template on an unregistered directory is not refused
ok 1062 - data.aggregate.report.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 1063 - data.aggregate.report.live: real Ollama -> validator-passing AggregateReport # SKIP
ok 1064 - a data task with a connection scope works on that connection only
ok 1065 - a data task on an unregistered directory and on a manifest directory inside a registered repo opens its pool at that directory (mutation: open it at the containing repo)
ok 1066 - the connection-listing task gives the same result for a repo scope as before, its scopeRefValue parameter still takes precedence, and a kind outside the data row is refused with the mismatch code
ok 1067 - requireStringParam: present non-empty -> returns; missing -> throws INV-5
ok 1068 - requireStringParam: empty string -> throws (empty != non-empty)
ok 1069 - optionalStringParam: present -> value; missing -> undefined; empty -> throws
ok 1070 - registerBuiltinRuntimes registers all 4 data runtimes
ok 1071 - runtime templateIds match expected ids
ok 1072 - DATA_AGGREGATE_PROMPT_PATH resolves to an existing non-empty file
ok 1073 - data runtimes integration: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 1074 - discovery.connections: lists the registered sqlite connection (no secret leak) # SKIP
ok 1075 - discovery.objects: lists rdbms tables for the sqlite connection # SKIP
ok 1076 - discovery.objects: kind filter narrows the result # SKIP
ok 1077 - discovery.objects: unknown connectionId -> throws (no such connection) # SKIP
ok 1078 - discovery.objects: missing connectionId param -> INV-5 message # SKIP
ok 1079 - schema.table: describes the users table -- columns + types + nullability # SKIP
ok 1080 - schema.table: describes orders table -- FK to users surfaces # SKIP
ok 1081 - schema.table: missing table param -> INV-5 message # SKIP
ok 1082 - schema.table: nonexistent table -> driver error propagates # SKIP
ok 1083 - a docs constraint task and a docs decision task with a module scope retrieve only sections under that directory and count within it; without an area the runners and the lookup pipeline's calls return what they did (mutation: drop the area at the hand-over from runner to prepare)
ok 1084 - a docs task with a module scope whose sections are not among the repository's nearest matches still gets them from the vector pass (mutation: search the whole repository and drop what lies outside)
ok 1085 - the docs tasks give the same result for a repo scope as before the change, and refuse a symbol scope with the mismatch code
ok 1086 - the family-summary task with a module scope keeps only the summaries of documents under that directory, and with a file scope only that file's
ok 1087 - generic.aggregate.report.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 1088 - generic.aggregate.report.live: real Ollama -> validator-passing AggregateReport # SKIP
ok 1089 - runtime exposes templateId = generic.aggregate.report
ok 1090 - registerBuiltinRuntimes registers generic.aggregate.report
ok 1091 - registerBuiltinRuntimes registers BOTH code + generic families (idempotent)
ok 1092 - GENERIC_AGGREGATE_PROMPT_PATH resolves to an existing non-empty file
ok 1093 - infra.aggregate.report.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 1094 - infra.aggregate.report.live: real Ollama -> validator-passing AggregateReport # SKIP
ok 1095 - readScopeRef: well-formed -> returns
ok 1096 - readScopeRef: missing -> throws INV-5
ok 1097 - baseName: directory-stripped
ok 1098 - classifyFile: terraform / dockerfile / helm chart / gha / gitlab / compose
ok 1099 - extractResource: minimal valid manifest -> record
ok 1100 - extractResource: no metadata.name -> null (dropped)
ok 1101 - extractResource: no apiVersion/kind -> null
ok 1102 - extractResource: label coercion of non-string values
ok 1103 - registerBuiltinRuntimes registers all infra runtimes (incl. helm/docker/ci)
ok 1104 - runtime templateIds match expected ids
ok 1105 - registration parity: INFRA_RUNTIMES and INFRA_TEMPLATES both length 8; produces-key === runtime output key
ok 1106 - infra.discovery.families description no longer overpromises ansible/pulumi/cloudformation
ok 1107 - INFRA_AGGREGATE_PROMPT_PATH resolves to an existing non-empty file
ok 1108 - walkFiles: node_modules is skipped (SKIP_DIRS); other files visible
ok 1109 - an infra task accepts its three kinds and refuses a file scope with the mismatch code; the connection-listing task gives the same result for a repo scope as before
ok 1110 - discovery.families: classifies all expected families against the fixture
ok 1111 - inventory.kubernetes: enumerates resources with kind/name/namespace/labels
ok 1112 - inventory.kubernetes: Chart.yaml is skipped (helm metadata, not k8s)
ok 1113 - inventory.terraform: extracts resources / data / providers / variables / outputs
ok 1114 - inventory.terraform: captures indented blocks + drops invalid HCL (no throw)
ok 1115 - inventory.helm: enumerates charts with metadata + deps + templateFileCount + valuesKeys
ok 1116 - inventory.docker: multi-stage Dockerfile FROM/stage/EXPOSE + compose services (build-only kept)
ok 1117 - inventory.ci: GHA `on` map normalized + step uses; gitlab stages + jobs (reserved keys excluded); broken skipped
ok 1118 - inventory runtimes: empty scope yields well-formed empty inventories, no throw
ok 1119 - the file walk goes to the end with a null cap and stops at its cap, as before, with a number or with none given
ok 1120 - inline params.constraints pass through untouched
ok 1121 - constraintIds hydrate keyConstraints from summarised docs
ok 1122 - constraintIds skip ids that do not resolve to summarised docs
ok 1123 - a constraintsSource in the params is not read: beside usable ids the ids are used, and the upstream outputs are never looked at
ok 1124 - an inline list wins over ids; an empty inline list counts as not given and the ids are used
ok 1125 - with no source of constraints the check throws, naming constraintTopic, constraints and constraintIds
ok 1126 - one enumeration per run, repository and topic is made, recorded under the run's directory with its whole output, and read back; a topic that differs only in case or spacing reuses it; a different maxSources, topic or run does not; a failed enumeration is not recorded and one with no constraint is
ok 1127 - a record that is unreadable, of another version or of another topic is enumerated again and overwritten; a record that cannot be written does not fail the check
ok 1128 - the seam replaces the enumeration, and is handed the topic, the repository, the limit and no area
ok 1129 - a check with a topic judges against the constraints enumerated from the repository's documents, and its output carries those constraints, their citations and the record's path
ok 1130 - four checks with one topic in one run make one enumeration; a topic that differs only in case or spacing reuses it; a different maxConstraintSources, a different topic or a different run does not
ok 1131 - the enumeration's reached limit, partly read section and skipped search by meaning appear in the completeness record of the check that made it and of a check that read its record
ok 1132 - an inline list or stored-document ids are used alone when given, with a topic also present, and no enumeration is made; an empty inline list beside ids uses the ids, and beside a topic uses the topic
ok 1133 - a data check under a connection scope and an infra check under a manifest directory read the documents of the declaring or containing repository, and a code check scoped to one file reads the whole repository's documents
ok 1134 - when the documents state no constraint on the topic the check fails with that reason, with the number of sections read or the note that none matched, the record is written, and a sibling check fails the same way without a second enumeration
ok 1135 - when the enumeration's model call fails the check fails with 'could not be enumerated', writes no record, and the next check enumerates again; when the judging call fails the reason is the judging's and the record stays
ok 1136 - an override that yields no constraint fails naming the override and does not fall back to the topic
ok 1137 - run through the plan walk, a failed check's reason is in the task's record and in tasksFailed, and the plan's report is still written from the other tasks
ok 1138 - no template, runtime or prompt of the analyze framework names constraintsSource, and the check does not read upstreamOutputs
ok 1139 - stableStringify: object keys sorted
ok 1140 - stableStringify: Map entries sorted + emitted as object
ok 1141 - stableStringify: arrays preserve order
ok 1142 - renderUpstreamSection: empty map -> "No upstream outputs" sentinel
ok 1143 - renderUpstreamSection: tasks emitted in sorted taskId order
ok 1144 - renderUpstreamSection: null upstream rendered as unavailable note
ok 1145 - renderUpstreamSection: JSON output rendered in fenced block
ok 1146 - buildMessages: system has prompt content, user has Target/Scope/upstream
ok 1147 - buildMessages: focus is included in the user message when present
ok 1148 - buildMessages: focus omitted when undefined
ok 1149 - classifyError: Ollama-down patterns -> aggregator-llm-unavailable
ok 1150 - classifyError: arbitrary error -> aggregator-schema-unrecoverable
ok 1151 - classifyError: non-Error -> aggregator-internal wrapper
ok 1152 - runAggregator: stub provider -> report carries LLM output + runtime metadata
ok 1153 - runAggregator: focus passed through to the user message
ok 1154 - runAggregator: provider throws ECONNREFUSED -> rethrown as aggregator-llm-unavailable
ok 1155 - runAggregator: provider throws arbitrary error -> aggregator-schema-unrecoverable
ok 1156 - runAggregator: missing prompt file -> "aggregator prompt missing"
ok 1157 - AGGREGATE_LLM_SCHEMA: requires summary + findings, additionalProperties false
ok 1158 - the aggregator's prompt lists each absent input with its producer and reason after the outputs that exist, and is unchanged when nothing is absent
ok 1159 - a map in which every name has one output renders a user message byte-identical to the one rendered before the change
ok 1160 - a name with several outputs renders one sub-section per task in plan order, with the task id, the template and the params, and a null value renders the unavailable line in its sub-section
ok 1161 - an absent output of one of several producers is worded by its task and the others are said to be available; a name with no output keeps the old wording
ok 1162 - sourceModulesOf returns one module per directory that directly holds a source file, none for a directory of artifacts only, and none for a directory whose source is all in sub-directories (mutation: count artifact files as source)
ok 1163 - sourceModulesOf keeps a stored module entity with its id and lists no directory in or under its directory as a module of its own, also when the entity lies above the area and is not itself listed (mutation: test rule (b) against the area's entities only)
ok 1164 - sourceModulesOf names a module by its path relative to the repo, '.' for the repo's own directory, and does not take 'payments' for part of 'pay' (mutation: test the prefix without the slash)
ok 1165 - moduleOfDirectory reads an absolute path, a relative path, a trailing slash and '.' as the same directory, and moduleOfEntityId reads a stored module entity's id with neither a scope nor a repo's entities (mutation: treat every value as an entity id, as before)
ok 1166 - moduleOfDirectory fails for a directory with no stored source under it, for one outside the repo, for one outside the scope's area and for a directory path under a file or symbol scope, and moduleOfEntityId for the id of an entity of another kind, each with its own message; a relative value with no known repo is joined to the scope's own directory
ok 1167 - a table test over four families and seven kinds of scope: pairings in the table resolve, the rest throw the mismatch error naming the kinds allowed (mutation: give a family a kind outside its row)
ok 1168 - a kind added to a row of a stand-in table is accepted
ok 1169 - a module, a file, a symbol and a connection scope resolve to the registered repo and the area
ok 1170 - a scope in no registered repo is not indexed for code and docs and resolves for infra and data
ok 1171 - an unreadable or empty registry does not refuse a path scope; a symbol scope fails as resolveScope decides (mutation: treat a null repo as not indexed)
ok 1172 - design/ wins over plans/
ok 1173 - plans/ matches for docs directly under plans
ok 1174 - designs/ (plural) matches the design family
ok 1175 - plan/ (singular) matches the plans family
ok 1176 - docs/ matches for docs under docs/
ok 1177 - design > docs when both are in the path
ok 1178 - adr/ matches for docs under adr/
ok 1179 - rfc/ matches for docs under rfc/
ok 1180 - spec/ matches for docs under spec/
ok 1181 - CHANGELOG.md classifies as changelog regardless of directory
ok 1182 - CHANGES.md and HISTORY.md classify as changelog
ok 1183 - README.md classifies as readme
ok 1184 - ADR-*.md by basename classifies as adr
ok 1185 - RFC-*.md by basename classifies as rfc
ok 1186 - SPEC-*.md by basename classifies as spec
ok 1187 - unknown paths fall back to other
ok 1188 - empty path returns other
ok 1189 - windows-style backslashes normalise
ok 1190 - case-insensitive on directory names
ok 1191 - mapper: table covers every AnalyzeRunEvent variant exactly once (exhaustive)
ok 1192 - mapper: stage variants -> StageProgressEvent{operation:analyze.run,total:null,index}
ok 1193 - mapper: specific stageId/stageLabel derivations
ok 1194 - mapper: llm-token + all sub-events + done -> null (no throw)
ok 1195 - mapper: malformed / unknown input -> null, never throws
ok 1196 - emitter: stage events -> progress frames; sub-events/llm-token emit nothing; zero delta frames
ok 1197 - emitter: repeated stages still advance the counter
ok 1198 - emitter: a send that throws EPIPE on the Nth call does not abort the run
ok 1199 - the daemon's run request, plan request and classify request treat a stated size as a hint and return the measured size; a plan request at depth 0 takes the measured size for the band and the depth, and one at a greater depth takes the measured size for the band and the caller's root size for the depth (mutation: take the child's size for the depth)
ok 1200 - the one-shot tool and the workflow runner state no size of their own and their answers carry the measure line; a run-level request needs no size on its intent, and a run and a plan request for the same scope share one cached run bundle
ok 1201 - a run takes one measure of the area it names: the context builder uses the measure it is handed and does not measure, and the size of its planning call is the size on the run's intent; the plan RPC hands its measure to the builder in the same way
ok 1202 - analyze.classify on an unindexed scope answers 'scope-not-indexed' and returns no measured size; on a repository under index, 'repo-indexing'
ok 1203 - analyze-rpc.live: skipped (set INSRC_LIVE_TESTS=1) # SKIP
ok 1204 - buildClassification: happy path + cache hit on identical re-invocation # SKIP
ok 1205 - buildRun (infra target): happy path returns schema-valid bundle # SKIP
ok 1206 - buildTask (code target): happy path with upstream mix # SKIP
ok 1207 - buildRun (code target): unindexed registered repo -> scope-not-indexed error code # SKIP
ok 1208 - classify: happy path returns ok:true with a ClassifiedIntent # SKIP
ok 1209 - classify: nonexistent scopeRef.value -> scope-ref-unresolved error code # SKIP
ok 1210 - plan (infra XS): end-to-end -> ok:true with a validator-passing PlanTask # SKIP
ok 1211 - plan: currentDepth=99 -> max-plan-depth-exceeded error code in <5s # SKIP
ok 1212 - buildRun: malformed intent -> invalid-params error code # SKIP
ok 1213 - runStart (streaming): infra workspace end-to-end via streaming RPC; result mirrors run.json # SKIP
ok 1214 - runStart (streaming): invalid scopeRef.kind -> invalid-params in analyze.result, fast (no LLM) # SKIP
ok 1215 - buildClassification rejects non-object params with invalid-params
ok 1216 - buildClassification rejects missing runId
ok 1217 - buildClassification rejects missing scopeRef
ok 1218 - buildClassification rejects bad scopeRef.kind
ok 1219 - buildRun rejects missing intent
ok 1220 - buildRun rejects bad intent.target
ok 1221 - buildRun rejects bad intent.scope
ok 1222 - buildRun rejects non-boolean intent.focused
ok 1223 - buildTask rejects target=generic at task scope
ok 1224 - buildTask rejects bad task.produces shape
ok 1225 - buildTask accepts undefined upstream as an empty Map
ok 1226 - buildTask accepts array-form upstream
ok 1227 - buildTask rejects bad upstream array entries
ok 1228 - invalid-params responses carry { code, message }
ok 1229 - classify rejects non-object params with invalid-params
ok 1230 - classify rejects missing runId
ok 1231 - classify rejects missing userPrompt
ok 1232 - classify rejects missing scopeRef
ok 1233 - classify rejects bad scopeRef.kind
ok 1234 - classify rejects empty-string userPrompt
ok 1235 - plan rejects non-object params with invalid-params
ok 1236 - plan rejects missing runId
ok 1237 - plan rejects missing intent
ok 1238 - plan rejects bad intent.target
ok 1239 - plan rejects bad rootScope value
ok 1240 - plan rejects non-integer currentDepth
ok 1241 - plan rejects negative currentDepth
ok 1242 - runStart (streaming): non-object params -> analyze.result frame with invalid-params + done
ok 1243 - runStart (streaming): missing runId -> invalid-params in terminal frame
ok 1244 - runStart (streaming): missing userPrompt -> invalid-params
ok 1245 - runStart (streaming): missing scopeRef -> invalid-params
ok 1246 - runStart (streaming): bad scopeRef.kind -> invalid-params with field name in message
ok 1247 - runStart (streaming): resume cache hit -> analyze.result with ok:true; no intermediate progress frames
ok 1248 - runStatus rejects non-object params with invalid-params
ok 1249 - runStatus rejects missing runId
ok 1250 - runStatus on missing runId record returns invalid-input
ok 1251 - runStatus returns the persisted RunRecord round-trip
ok 1252 - runPurge rejects non-object params with invalid-params
ok 1253 - runPurge rejects missing runId
ok 1254 - runPurge rejects non-boolean force
ok 1255 - runPurge on missing runId record returns purged=false (idempotent)
ok 1256 - runPurge removes a persisted finished run; subsequent purge returns purged=false
ok 1257 - runPurge refuses on status=in-progress for a live run without force; force=true overrides
ok 1258 - AnalyzeRpcOk responses have ok:true and a bundle field
ok 1259 - a record in progress with no live run is rewritten as 'run-abandoned' by the status request, on disk too (mutation: return the record as read)
ok 1260 - the daemon's purge request purges such a record without force; purgeRun with no liveness refuses it; a live run's record is returned unchanged and refused
ok 1261 - the daemon's handler writes the record and sends its stage, not 'classify', for a runAnalyze that throws, and sends both frames when the record cannot be written
ok 1262 - with a record that cannot be written the status request still says 'run-abandoned' and the purge still removes the directory (mutation: let the rewrite's error escape)
ok 1263 - no reader changes a record that is 'ok' or 'failed'
ok 1264 - an empty prompt with a stated kind of source is accepted and gives an unfocused intent; with none it is refused with the new message
ok 1265 - a prompt of only white space is accepted with and without a stated kind of source (mutation: treat white space as empty at the parser)
ok 1266 - the daemon's error payload, the one-shot tool's message and the workflow runner's step failure carry the report and the reason
ok 1267 - a failure with no report is passed on as before: its code and message, and nothing about completeness
ok 1268 - a grounded step gets the flattened findings of a successful request
ok 1269 - index.ts registers an 'artifact.feedback.append' handler that delegates to appendFeedback
ok 1270 - the handler returns { error } (not throw) on a bad request / ArtifactFeedbackError
ok 1271 - the artifact-feedback tool is mounted at boot and single-sources appendFeedback
ok 1272 - the writer exports the append-only API + typed error
ok 1273 - backupAll snapshots LMDB to a single file at <target>/graph.lmdb
ok 1274 - backupAll snapshot is openable + round-trips the source rows
ok 1275 - backupAll leaves the source env writable + readable
ok 1276 - backupAll re-run over an existing target overwrites idempotently
ok 1277 - backupAll skips Lance when the source directory is absent
ok 1278 - backupGraphStore throws when env is not open
ok 1279 - runBootSteeringRefresh re-stamps a MARKED repo file to the stripped skeleton
ok 1280 - runBootSteeringRefresh leaves an UNMARKED / absent file untouched (REPLACE-ONLY opt-out)
ok 1281 - runBootSteeringRefresh is idempotent — an already-current marked file reports unchanged, no write
ok 1282 - runBootSteeringRefresh swallows a readBlock throw (missing/empty asset) and returns undefined
ok 1283 - runBootSteeringRefresh swallows a listRepos rejection and returns undefined (never throws)
ok 1284 - runBootSteeringRefresh over an empty registry returns an empty report, no writes
ok 1285 - src/daemon/index.ts imports and calls runBootSteeringRefresh AFTER the reconcile, guarded
ok 1286 - STEERING markers are exported for fixtures
ok 1287 - T12 the daemon refuses to review code the daemon wrote: an error frame, no provider, no review
ok 1288 - T4 the daemon reviews code that is controller-authored, and stamps the review as the daemon's
ok 1289 - T4 the daemon reviews code that is of unknown author (an older record), and stamps the review as the daemon's
ok 1290 - T4 with no BUILD record at all the author is unknown and the daemon reviews
ok 1291 - the author is read from the BUILD record
ok 1292 - a declined subject is still an error frame, before the author is looked at
ok 1293 - T17 the degraded mode grounds on the diff, stamps the record degraded and caps a clean verdict at warn
ok 1294 - T17 a diff the daemon cannot read ends in one error frame naming the cause, and no record is written
ok 1295 - T17 with no mode the request grounds on the graph and can pass, as before
ok 1296 - T17 with the full mode the request grounds on the graph and can pass, as before
ok 1297 - T17 a grounding mode the daemon does not know is refused, not read as full
ok 1298 - first-boot equivalence: surviving former-literal keys match catalog defaults; retired ones are absent
ok 1299 - first boot with no config present → writes surviving former keys + canonical catalog defaults; no retired keys, one write
ok 1300 - module boundary: daemon imports the catalog from src/config, and src/daemon has zero imports of src/cli
ok 1301 - boot wiring contract: unconditional, no silent parse catch, distinguishable catalog-error, all outcomes handled
ok 1302 - reconcile never aborts boot: every failure input yields a structured outcome, not a throw
ok 1303 - t2: the status object includes installedCommit populated from the reader
ok 1304 - t2: a reader returning '' yields installedCommit:'' with the rest of the status intact (never throws)
ok 1305 - t2: sc1 (daemon.update/updateOutcome) surface is untouched by the status change
ok 1306 - t2: end-to-end — readInstalledCommit() with the default git exec returns this repo's real HEAD sha
ok 1307 - index.ts registers 'workflow.delivery', which lazy-imports handleDelivery and passes INSRC_REPO
ok 1308 - index.ts registers 'workflow.deliveryEvidence', which lazy-imports handleDeliveryEvidence and passes INSRC_REPO
ok 1309 - guideMarkerStart/End produce the exact insrc:guide marker strings
ok 1310 - readWorkflowGuide returns the trimmed section for a known workflow (ac1)
ok 1311 - readWorkflowGuide keeps a decoy inner marker verbatim, not mis-sliced
ok 1312 - readWorkflowGuide returns null for an unknown key
ok 1313 - readWorkflowGuide returns null for a half-present pair (start, no end)
ok 1314 - readWorkflowGuide returns null for an inverted pair (end before start)
ok 1315 - listWorkflowGuides returns COMPLETE-pair keys only, in document order
ok 1316 - listWorkflowGuides returns [] for text with no pairs (Phase-A empty)
ok 1317 - guideGetResult: known key -> Ok { workflow, guidance }
ok 1318 - guideGetResult: omitted workflow -> Error { validWorkflows }
ok 1319 - guideGetResult: unknown workflow -> Error { validWorkflows }
ok 1320 - guideGetResult: read-seam throws -> Error { validWorkflows: [] }, never escapes
ok 1321 - guideListResult: returns { workflows } in document order
ok 1322 - guideListResult: read-seam throws -> { workflows: [] }, never escapes
ok 1323 - shipped steering-block.md enumerates bugfix without disturbing the existing keys/order
ok 1324 - guideGetResult({workflow:"bugfix"}) returns the bugfix section from the shipped asset
ok 1325 - removes every complete guide section, retaining the skeleton
ok 1326 - leaves a half-present (start-only) marker intact
ok 1327 - collapses the blank run left where a section was removed
ok 1328 - is idempotent — stripping an already-stripped skeleton is a no-op
ok 1329 - is safe on text with no guide sections at all
ok 1330 - is safe on empty-ish text
ok 1331 - the shipped asset carries guide sections; readSteeringBlock returns it whole
ok 1332 - refreshSteeringAcrossRepos (default readBlock) stamps a guide-marker-free skeleton
ok 1333 - an injected readBlock (the daemon-update path) is ALSO stripped — the skeleton contract cannot be bypassed
ok 1334 - the inject-path strip is idempotent over the shipped asset
ok 1335 - t1: readInstalledCommit returns the trimmed sha for a valid HEAD (trailing newline stripped)
ok 1336 - t1: readInstalledCommit invokes git with `-C <root> rev-parse HEAD`
ok 1337 - t1: any exec failure (throw / non-git / ENOENT) returns '' and never throws
ok 1338 - t1: with no root arg it resolves DAEMON_ROOT = $INSRC_DAEMON_ROOT ?? ~/.insrc/daemon
ok 1339 - listModels('cli-claude') -> curated list mapped from CatalogModel, available:true
ok 1340 - listModels('cli-codex') -> the cli-codex curated list, available:true
ok 1341 - cloud branch: an empty curated array stays available:true + []
ok 1342 - ac4: the ollama lister is NEVER called for a cloud provider (no HTTP path)
ok 1343 - listModels('ollama') success -> available:true + mapped models
ok 1344 - listModels('ollama') with a REJECTING lister (unreachable) -> available:false + []
ok 1345 - listModels('ollama') with a lister that rejects on timeout -> available:false + []
ok 1346 - listModels('ollama') with a lister that rejects on malformed -> available:false + []
ok 1347 - listModels('ollama') reachable-but-zero -> available:true + [] (distinct from failure)
ok 1348 - unknown/missing provider -> invalid-params error result, no throw, no mutation
ok 1349 - read-only: the injected deps expose only read methods (no config-write path reachable)
ok 1350 - source-scan: list-models.ts imports no cloud-REST / provider-SDK path (k1/ac4)
ok 1351 - handler map: 'providers.listModels' is a real handler delegating to listModels, not offlineRpc (lc1)
ok 1352 - integration: listModels(cloud) sources from the REAL getCuratedCatalog after validateModelCatalog
ok 1353 - unselected clients are always emitted as skipped, never omitted
ok 1354 - {claude:true} registers claude (mcp add --scope user); codex is skipped
ok 1355 - {agents:true} maps to the codex client (agents flag → codex, --scope omitted)
ok 1356 - an existing `insrc` entry in `mcp list` → unchanged, no add spawned
ok 1357 - an `insrc` substring only inside a path (not a line-start name) does NOT count as registered
ok 1358 - an indeterminate `mcp list` (non-zero exit) → failed, and deliberately does NOT add
ok 1359 - a missing CLI binary (ENOENT spawn) → failed with a not-found note, no throw
ok 1360 - a non-zero `mcp add` exit → failed carrying the CLI stderr
ok 1361 - per-client isolation: claude add fails, codex still registers independently
ok 1362 - mixed idempotency: claude already present, codex absent → unchanged + registered
ok 1363 - a missing out/bin/insrc-mcp.js → failed for each selected client, no subprocess
ok 1364 - registerMcpClients never rejects even if the injected run throws
ok 1365 - src/daemon/__tests__/model-catalog-asset.test.ts: the shipped cloud model catalog lists the three GPT-6 Codex models
ok 1366 - validateModelCatalog: valid catalog fixture → resolves, caches the frozen parse
ok 1367 - validateModelCatalog: removed/absent catalog file → throws ModelCatalogValidationError naming the file + one copy-assets Fix: line
ok 1368 - validateModelCatalog: non-JSON file → throws (parse failure) naming the file
ok 1369 - validateModelCatalog: schema-invalid variants → throw naming the specific failure, short-circuit
ok 1370 - validateModelCatalog: short-circuits on the FIRST structural failure (version before providers)
ok 1371 - modelsFor('cli-claude') / modelsFor('cli-codex') over a loaded catalog → the curated readonly arrays
ok 1372 - modelsFor for a provider with an explicitly-empty array → empty readonly array (not an error)
ok 1373 - getCuratedCatalog before validateModelCatalog populated the cache → throws the boot-ordering Error
ok 1374 - MODEL_CATALOG_DIR is the dir modelCatalogDir() resolves by default (one source of truth)
ok 1375 - contract: validateModelCatalog passes against the real resolved MODEL_CATALOG_DIR and modelsFor is well-formed
ok 1376 - smoke: the built out/assets/models stages the catalog JSON, non-empty
ok 1377 - depthForRepo counts repoPath-named jobs (full/reembed/doc-summarise-repo) for that repo
ok 1378 - depthForRepo counts file/config-file jobs whose filePath is under the repo (repoPath+sep)
ok 1379 - repo-agnostic jobs (config-full/config-reindex/doc-summarise-entity) and other-repo jobs do NOT count
ok 1380 - depthForRepo returns 0 for a repo with no queued jobs; get depth() is the global total
ok 1381 - a queued clean-up job is counted as pending for its repository, and a second one for the same repository is not queued
ok 1382 - index.ts registers a 'repo.stats' handler that delegates to collectRepoStats
ok 1383 - the handler returns { error } (not throw) for an unregistered repoPath and returns the array when omitted
ok 1384 - the repo.stats handler is READ-ONLY (no mutation of store/registry/queue/config)
ok 1385 - collectRepoStats delegates to the pure buildRepoStats and RepoStats is declared
ok 1386 - buildRepoStats: fileCount is distinct files; filesByLanguage counts a mixed-language file in each bucket
ok 1387 - buildRepoStats: entityCount total + entityCountByKind grouped by EntityKind
ok 1388 - buildRepoStats: relationCount is per-repo; a source-repo not registered and a repo with 0 source are ignored
ok 1389 - buildRepoStats: registry fields verbatim; a never-indexed registered repo yields a zero-count RepoStats (present)
ok 1390 - buildRepoStats: sizeBytes = injected sizeOf; pendingJobs = injected pendingFor
ok 1391 - buildRepoStats: an unregistered-repo entity row is ignored; empty inputs give all-zero RepoStats per repo
ok 1392 - collectRepoStats: per-repo counts + cross-repo edge attributed to its source repo + best-effort size
ok 1393 - search.callers across repositories leaves out the entities of a repository under index
ok 1394 - search.query while one repository is being indexed returns rows from the other repositories only
ok 1395 - entity.closure, entity.unreachable, search.closure, repo.depends_on and repo.search_cross_repo from a ready repository whose closure reaches a repository under index leave that repository's entities out
ok 1396 - the result filter leaves out exactly the repositories the analyzer refuses: for every registry status, underIndexFilter drops the repository iff ensureRepoQueryable refuses it, and both agree with isUnderIndex
ok 1397 - guardSearchRequest: an entity whose store read fails names nothing and the request is answered; another name in the same request still refuses it
ok 1398 - search requests: search.callers / search.callees / search.by_file / search.closure / entity.summary / repo.depends_on / locate.inferParents about a repository being indexed answer 'repo-indexing: ...' with the figures and no result; about another, ready repository they answer as before
ok 1399 - entity.closure / entity.unreachable with a root in a repository under index are refused
ok 1400 - search guard: a registry read that throws skips the guard and the request is answered as today
ok 1401 - search request contract: each guarded search request accepts its existing params and answers
ok 1402 - a new connection registers an entry labelled unknown until a message identifies it
ok 1403 - handleMessage with a valid client envelope updates label/pid/lastMethod
ok 1404 - a malformed client envelope is ignored — the connection stays unknown/pid undefined
ok 1405 - socket close deletes the entry; a double-close / close-before-message is idempotent
ok 1406 - attachedClients() returns entries sorted by connectedAt
ok 1407 - the daemon.debug-status contract returns { clients } from the registry with no side effects (k1/k5)
ok 1408 - status after failure: storeFailure names another process and does not contain 'semume'
ok 1409 - store failure to stop: exit within 5 seconds, pid file and socket gone, second start succeeds, last log line names the skipped close
ok 1410 - fatal after failure: an unhandled rejection with the store failed ends the process within 5 seconds
ok 1411 - healthy shutdown is unchanged: queue drained, connections closed in order, normal exit
ok 1412 - with the store failed no path calls exit: the shutdown, its backstop, a failure found during the drain, and any other exit
ok 1413 - daemon status payload: no storeFailure when healthy; kind, time, operation and cause when locks-lost
ok 1414 - status handler with the store failed returns an empty repository list and storeFailure and does not throw
ok 1415 - absent file → create with only the marked section
ok 1416 - file with user content but no marker → append, preserving content
ok 1417 - marked section present + identical → idempotent no-op (unchanged, no write)
ok 1418 - stale marked section → replace ONLY between markers, preserve surrounding
ok 1419 - open marker without close → left untouched (never clobber to EOF)
ok 1420 - duplicate open markers → left untouched (ambiguous)
ok 1421 - refresh: present + stale block → replaced, surrounding content byte-for-byte preserved
ok 1422 - refresh: present + identical block → unchanged, content null (no write)
ok 1423 - refresh: absent file → skipped, NEVER created
ok 1424 - refresh: present file WITHOUT markers → skipped, NEVER created/appended (opt-out)
ok 1425 - refresh: duplicate markers → unchanged + note, untouched
ok 1426 - refresh: malformed markers (open without close) → unchanged + note, untouched
ok 1427 - walk: mixed repos — stale written, opted-out skipped-not-created, malformed untouched
ok 1428 - walk: per-file read rejection → skipped+note, walk continues to remaining repos
ok 1429 - walk: per-file write rejection → skipped+note, other repos still refreshed
ok 1430 - walk: CLAUDE.md refreshed while sibling AGENTS.md absent → independent per-file
ok 1431 - walk: zero registered repos → empty report, no writes
ok 1432 - walk: partial deps fills the omitted members with production defaults
ok 1433 - readSteeringBlock: resolves the shipped prompts/steering-block.md and is non-trivial
ok 1434 - injectSteeringBlock: nothing selected → both files skipped, no writes
ok 1435 - injectSteeringBlock: claude only → CLAUDE.md created, AGENTS.md untouched
ok 1436 - injectSteeringBlock: both selected + one pre-existing → created + preserved-append
ok 1437 - injectSteeringBlock: re-run is idempotent (second run unchanged)
ok 1438 - dispatcher: a handler throwing code -30775 records locks-lost and the caller gets the named error, at each of the three server sites and the queue runner
ok 1439 - detection through the real wrappers: a read through the dispatcher records at once
ok 1440 - periodic check records locks-lost when no request or write has met the failure
ok 1441 - diagnostic through the tools' route: fs.promises.readFile of the lock file logs one warn line with a stack, once per stack
ok 1442 - the default report is a warn line on the daemon log, with the stack
ok 1443 - t3: daemon.update returns { launched:true } and schedules shutdown, without exiting the process
ok 1444 - t3: a launch guard failure surfaces as a result.error envelope and does NOT schedule shutdown
ok 1445 - t3: daemon.updateOutcome returns the last outcome, and null when none exists
ok 1446 - t1: PATHS carries the two S001 daemon-home entries under the insrc dir
ok 1447 - t2: launchUpdate spawns the detached daemon-ctl.sh restart child with detached/unref/stdio-to-log
ok 1448 - t2: launchUpdate rejects a concurrent launch when a live marker is present; a stale marker is ignored
ok 1449 - t2: launchUpdate throws cannot-locate BEFORE any spawn or marker write when the root/helper is missing
ok 1450 - t2: readUpdateOutcome parses a present record and returns null for absent / unparseable (never throws)
ok 1451 - t2: writeUpdateOutcome persists the record and clears the in-flight marker
ok 1452 - t2: runDetachedUpdate writes state:succeeded on a zero exit and clears the marker
ok 1453 - t2: runDetachedUpdate writes state:failed with the raw stderr on a non-zero exit; no retry/rollback
ok 1454 - workflowProgressToStage maps phase→stageId and folds runner/attempt/detail into stageLabel
ok 1455 - workflowProgressToStage falls back to phase as the label when no extra fields
ok 1456 - makeTokenAccumulator batches tokens and flushes the tail
ok 1457 - makeTokenAccumulator keeps tokensTotal monotonic and stageId from the latest step
ok 1458 - T12 a controller-authored LLD: progress frames, then done with the verdict and reviewedBy daemon
ok 1459 - T12 a controller-authored DEF is reviewed through the pipeline and ends in done
ok 1460 - T12 a daemon-authored DEF ends in one error frame; no provider call, nothing stamped
ok 1461 - T12 a daemon-authored LLD ends in one error frame; no provider call, nothing stamped
ok 1462 - a bad request, a missing artifact and a failing review each end in one error frame
ok 1463 - finalizeArtifact: s8 sbdry4 hard-fail is now CORRECTABLE and carries structured findings
ok 1464 - finalizeArtifact: a CLEAN s8 (all passed) yields no boundary failure
ok 1465 - correctionDirective: names each finding + demands change-nothing-else + grounding
ok 1466 - reAuditBoundary: audits the CORRECTED artifact for the flagged items + returns fresh verdicts
ok 1467 - the findings flattened into a workflow step start with the completeness line when the bundle has a report, and are unchanged when it has none
ok 1468 - prepareWorkflowRun exposes a router + cfg + repoPath alongside the back-compat scalar provider
ok 1469 - prep.router resolves a provider per role (distinct roles → distinct resolutions)
ok 1470 - prepareWorkflowRun still throws "no repo" before any router is built
ok 1471 - runWorkflowServerSide drives stub end-to-end + stamps per-output attribution (sc5), not the retired scalar model
ok 1472 - runWorkflowServerSide with a router captures per-output attribution — one heterogeneous row per output (sc5 ac1)
ok 1473 - runWorkflowServerSide does NOT review the artifact it authors (the other party reviews it)
ok 1474 - T16 a run asked to review (review:true) makes no review call, says the artifact needs a controller review, and stamps nothing
ok 1475 - T16 a run not asked to review announces nothing about a review
ok 1476 - runWorkflowServerSide refuses a provider without structured-output
ok 1477 - runWorkflowServerSide fails clearly when synthesize stays invalid across all attempts
ok 1478 - T2 the daemon run finalizes through ONE call, so a correction retry cannot skip the author stamp
ok 1479 - startWorkflowRun returns a runId synchronously and poll transitions running → done
ok 1480 - poll with the returned cursor yields only NEW frames (append-only)
ok 1481 - unknown runId polls as status:unknown with an error
ok 1482 - abortWorkflowRun flips a running run to aborted; unknown runId → ok:false
ok 1483 - getAllTurnsWithVectorsForRepo joins Lance vectors back onto turns
ok 1484 - getAllTurnsWithVectorsForRepo returns vectors only for Lance-backed turns
ok 1485 - compaction reclassifies directive turns as type=directive
ok 1486 - compaction promotes warm-tier turns and re-embeds the compressed text
ok 1487 - compaction collapses archive sessions into a summary turn (centroid)
ok 1488 - compaction dedupes near-duplicate turns within the same tier
ok 1489 - compaction-deleted turns are removed from Lance turn_vec
ok 1490 - compaction dryRun does not mutate state
ok 1491 - compaction on empty repo is a no-op
ok 1492 - saveTurn persists vector to Lance
ok 1493 - saveTurn with empty vector skips Lance write
ok 1494 - addCompactedTurns persists batch to Lance with type=merged tier=cold defaults
ok 1495 - saveSession with vector persists summary to Lance
ok 1496 - closeSession persists summary embedding to Lance
ok 1497 - searchTurnsByRepo returns hydrated TurnRecord objects
ok 1498 - searchTurnsByRepo returns [] on dim mismatch (legacy silent-error contract)
ok 1499 - seedFromPrior returns sessions sorted by recency
ok 1500 - seedFromPrior returns [] on dim mismatch
ok 1501 - deleteSession cascades Lance session + turn rows
ok 1502 - deleteTurnsForSession cascades only the turn Lance rows
ok 1503 - deleteSessionsForRepo cascades all Lance rows for that repo
ok 1504 - deleteTurnsForRepo cascades Lance turn rows but leaves sessions
ok 1505 - deleteTurnsByIds cascades the corresponding Lance rows
ok 1506 - saveSession + getSessionById round-trip
ok 1507 - saveSession with explicit fields preserves them
ok 1508 - saveSession upsert preserves single row
ok 1509 - getSessionById on unknown id returns null
ok 1510 - setSessionAgent updates agent + category
ok 1511 - setSessionStatus mutates only the status
ok 1512 - bumpSessionActivity is silent no-op for unknown id
ok 1513 - closeSession upserts the row + sets status=completed
ok 1514 - saveTurn + getTurnsForSession round-trip
ok 1515 - getTurnsForSession returns idx-ordered turns only of type "turn"
ok 1516 - saveTurn round-trips assertionRefs (G6 of memory-context design)
ok 1517 - saveTurn omits assertionRefs when not provided (back-compat)
ok 1518 - saveTurn upsert preserves single row by (sessionId, idx)
ok 1519 - saveTurn bumps session lastActivityAt
ok 1520 - addCompactedTurns sets defaults: type=merged, tier=cold
ok 1521 - addCompactedTurns on empty array is a no-op
ok 1522 - getAllTurnsForRepo returns only that repo's turns
ok 1523 - getAllTurns returns every turn across repos
ok 1524 - listSessions returns sessions in createdAt-desc order
ok 1525 - listSessions filters by repo
ok 1526 - listSessionRecords filters by status
ok 1527 - getConversationStats counts turns + sessions
ok 1528 - deleteSession removes the session + all its turns
ok 1529 - deleteSession on unknown id returns 0/0
ok 1530 - deleteTurnsForSession removes all turns, leaves session
ok 1531 - deleteSessionRecord removes only the session row
ok 1532 - deleteSessionsForRepo removes only that repo's sessions
ok 1533 - deleteTurnsForRepo removes only that repo's turns
ok 1534 - deleteTurnsByIds removes the specific turns
ok 1535 - deleteTurnsByIds on empty list is a no-op
ok 1536 - searchTurnsByRepo returns [] (Phase 3.3 wires Lance)
ok 1537 - seedFromPrior returns [] (Phase 3.3 wires Lance)
ok 1538 - sessions + turns survive close + reopen
ok 1539 - resetTableCaches is a no-op (back-compat shim)
ok 1540 - t1: deleteEntitiesById removes the entity + cascades its CALLS_HTTP in/out edges; others untouched
ok 1541 - t1: deleting an absent/stale id is a no-op; a mixed batch deletes present, skips absent
ok 1542 - writeDocSummary + getDocSummary round-trip
ok 1543 - writeDocSummary overwrites an existing summary
ok 1544 - getDocSummary returns null for unknown entity
ok 1545 - getDocSummary returns null for known entity with no summary
ok 1546 - writeDocSummary rejects an unknown entity
ok 1547 - writeDocSummary rejects an unregistered repo
ok 1548 - listDocSummariesForRepo returns every summary for the repo
ok 1549 - countDocSummariesForRepo matches the list length
ok 1550 - listDocSummaryEntityIdsForRepo returns the same entity ids
ok 1551 - listDocSummariesForRepo returns empty for an unregistered repo
ok 1552 - deleteDocSummary drops primary + secondary index
ok 1553 - deleteDocSummariesForRepo scoped drop
ok 1554 - deleteEntitiesForFile cascades to the summary row
ok 1555 - placeholder rows persist the errorCode field
ok 1556 - upsertEntities persists vectors to entity_vec when embedding is non-empty
ok 1557 - upsertEntities skips Lance write when embedding is empty
ok 1558 - upsertEntities re-embed (existing entity, new vector) replaces the Lance row
ok 1559 - updateEmbedding persists vector to entity_vec
ok 1560 - updateEmbedding on unknown entity is silent no-op
ok 1561 - updateEmbedding with empty embedding only updates LMDB model field
ok 1562 - searchEntities returns hydrated Entity objects via Lance ANN
ok 1563 - searchEntities returns [] for empty query vector
ok 1564 - searchEntities returns [] for empty closure
ok 1565 - searchEntities respects closure-repo scope
ok 1566 - deleteEntitiesForFile cascades Lance rows
ok 1567 - deleteEntitiesForRepo cascades all Lance rows for the repo
ok 1568 - reindexFile cascades Lance rows for tombstoned entities
ok 1569 - upsertEntities + getEntity round-trip
ok 1570 - upsertEntities preserves all flag fields
ok 1571 - getEntity on unknown id returns null
ok 1572 - getEntitiesByIds returns matched subset (unmatched omitted)
ok 1573 - getEntitiesByIds on empty array returns []
ok 1574 - upsert overwrites a non-module entity
ok 1575 - module-stub upsert is ensure-exists (does not overwrite)
ok 1576 - upsertEntities dedupes intra-batch duplicates (last-wins)
ok 1577 - upsertEntities on empty array is a no-op
ok 1578 - listEntitiesForRepo returns only the requested repo
ok 1579 - listEntitiesForRepo on unknown repo returns []
ok 1580 - findEntitiesByFile filters by absolute path
ok 1581 - findEntitiesByName matches names + kind filter
ok 1582 - findEntitiesByName respects repo filter
ok 1583 - findEntitiesByName respects multi-repo `repos` filter
ok 1584 - findEntitiesByName: empty `repos` array returns []
ok 1585 - findEntitiesByName: `repos` with unknown paths drops them silently
ok 1586 - findEntitiesByName: passing both `repo` and `repos` throws
ok 1587 - findEntitiesByName respects limit
ok 1588 - findEntitiesByName on empty input returns []
ok 1589 - listUnembeddedEntities filters on empty embeddingModel
ok 1590 - updateEmbedding sets the model name (vector goes to Lance in 3.2)
ok 1591 - updateEmbedding on unknown id is a silent no-op
ok 1592 - deleteEntitiesForFile removes only that file's entities
ok 1593 - deleteEntitiesForFile cascades to out_edge and in_edge
ok 1594 - deleteEntitiesForRepo removes all entities for that repo only
ok 1595 - deleteEntitiesForRepo on unknown repo is a silent no-op
ok 1596 - entities survive close + reopen
ok 1597 - absolute file path -> repo-relative on write, back to absolute on read
ok 1598 - repo IDs are auto-allocated on first sighting
ok 1599 - the read of a repository's stored files returns each file once, only that repository's files, and no empty path
ok 1600 - the removal of one repository's unresolved relations of a file leaves another repository's unresolved relations of the same path
ok 1601 - an unregistered repository has no stored files and its removal of unresolved relations does nothing
ok 1602 - put + get round-trip
ok 1603 - get returns null on cache miss (never written)
ok 1604 - same exploration params produce the same hash
ok 1605 - different exploration types produce distinct hashes
ok 1606 - nested params still canonicalise deterministically
ok 1607 - different lastIndexedAt produces cache miss
ok 1608 - repo scoping: repo A row is not visible to repo B lookup
ok 1609 - deleteCachedExplorationsForRepo drops every row for the repo
ok 1610 - put + get on unregistered repo is a no-op / null
ok 1611 - completenessOf table test: graphComplete and complete follow the sc1 formula for every combination of the inputs, and reasons are empty exactly when complete
ok 1612 - completenessOf(undefined) reads not complete with "a reindex is needed"
ok 1613 - completeness reason lines: one per non-zero cause with its count, awaiting rows split by reason, no-candidate and ambiguous rows not a cause
ok 1614 - an aborted transaction leaves the counts unchanged: a callback that writes a pending row and its count, then throws, leaves neither
ok 1615 - recount on open corrects a hand-edited count with a warn log, and deletes the row of an unregistered repoId
ok 1616 - lancedb native binding loads
ok 1617 - create table + insert + count round-trip
ok 1618 - vector search returns nearest first
ok 1619 - vector dim 1024 is accepted (post-0.2 default)
ok 1620 - table reopened from disk retains data (file-backed persistence)
ok 1621 - filter columns work alongside vector search (where clause)
ok 1622 - lmdb native binding loads
ok 1623 - put and get round-trip with default msgpack codec
ok 1624 - binary keys (Buffer) round-trip
ok 1625 - cursor range scan returns sorted keys
ok 1626 - sub-databases (named) are independent keyspaces
ok 1627 - msgpack codec preserves nested objects
ok 1628 - write transaction is atomic (all-or-nothing)
ok 1629 - reopened env retains data (file-backed persistence)
ok 1630 - reindexFile on empty store creates entity rows
ok 1631 - reindexFile on empty parsed list with no existing is a no-op
ok 1632 - reindexFile: identical re-parse is a no-op
ok 1633 - reindexFile: adding an entity inserts the new + preserves existing
ok 1634 - reindexFile: removing an entity tombstones it + keeps the rest
ok 1635 - reindexFile: replacing all entities tombstones the original set
ok 1636 - reindexFile: changed body updates the row
ok 1637 - reindexFile: tombstoning a referenced entity clears incident edges
ok 1638 - reindexFile preserves module stubs that already exist
ok 1639 - reindexFile is idempotent: same parse twice produces the same row set
ok 1640 - reindexFile: contentHash unchanged + body unchanged -> no row mutation
ok 1641 - reindexFile auto-allocates a repoId on first sighting
ok 1642 - reindexFile only touches entities of the specified file
ok 1643 - reindexFile result survives close + reopen
ok 1644 - each input of a resolved write ends as an edge, one pending row awaiting the target, or a counted unwritable
ok 1645 - writing the same relationship twice while its target is absent leaves one row and an awaiting count of 1
ok 1646 - a boundary relation with an absent target is kept as external-endpoint and does not count against graphComplete
ok 1647 - promotions: an edge removes the row and advances the generation; an absent target re-keys the row to await it; a missing source removes and counts it; the batch reports each
ok 1648 - upsertRelation writes a single resolved edge to both mirrors
ok 1649 - upsertRelations bulk-writes multiple resolved edges
ok 1650 - upsertRelations dedupes intra-batch duplicates by (from, to, kind)
ok 1651 - upsertRelations is idempotent across calls
ok 1652 - upsertRelations skips resolved edges with missing endpoints
ok 1653 - upsertRelations on empty array is a no-op
ok 1654 - different relation kinds coexist on the same (from, to) pair
ok 1655 - upsertRelation routes unresolved to the queue
ok 1656 - upsertRelations splits resolved/unresolved correctly
ok 1657 - listUnresolvedRelations with file scope filters correctly
ok 1658 - unresolved row missing meta.file/repo is dropped
ok 1659 - promoteToResolved writes the resolved edge + removes the unresolved row
ok 1660 - updateUnresolvedMeta writes the new meta + bumps attemptedAt
ok 1661 - updateUnresolvedMeta on unknown id is a silent no-op
ok 1662 - deleteUnresolvedForFile removes only that file's unresolved rows
ok 1663 - deleteUnresolvedForRepo removes everything for that repo only
ok 1664 - deleteUnresolvedForRepo on unknown repo is a silent no-op
ok 1665 - promoteResolvedBatch writes all edges + removes all unresolved rows
ok 1666 - updateUnresolvedMetaBatch updates each row
ok 1667 - promoteResolvedBatch on empty array is a no-op
ok 1668 - updateUnresolvedMetaBatch on empty array is a no-op
ok 1669 - makeUnresolvedRelationId is deterministic
ok 1670 - makeUnresolvedRelationId differs for different inputs
ok 1671 - resolved edges + unresolved rows survive close + reopen
ok 1672 - 5.2: upsertEntities throws UnregisteredRepoError for an unregistered workspace path
ok 1673 - 5.2: failed upsert leaves the repo sub-DB untouched (no auto-allocation)
ok 1674 - 5.2: upsertEntities succeeds once the path is pre-registered via addRepo
ok 1675 - 5.2: storage layer never writes a non-shared-modules repo row outside addRepo()
ok 1676 - 5.2: module entities (empty repo path) bypass strict lookup via namespace fallback
ok 1677 - 5.2: UnregisteredRepoError is throwable + introspectable
ok 1678 - 5.3: same module name in Java vs Python produces distinct entity IDs
ok 1679 - 5.3: Java + Scala module entities share the jvm namespace row (no separate row per language)
ok 1680 - 5.3: every shared-modules namespace gets its own reserved repoId (4 distinct rows)
ok 1681 - 5.3: reserved shared-modules row has empty path + namespace tag in storage
ok 1682 - addRepo + listRepos round-trip
ok 1683 - addRepo with explicit name overrides basename derivation
ok 1684 - addRepo with empty name falls back to basename
ok 1685 - addRepo on existing path updates in place (same repo_id semantics)
ok 1686 - addRepo with multiple paths creates multiple rows
ok 1687 - removeRepo by path deletes the row
ok 1688 - removeRepo deletes the repository's index_state row with its registry row (Epic c2ba6fa6 s1/t1)
ok 1689 - removeRepo on unknown path is a silent no-op
ok 1690 - listRepos on empty registry returns empty array
ok 1691 - updateRepoStatus mutates only status / lastIndexed / errorMsg
ok 1692 - updateRepoStatus on unknown path is a silent no-op
ok 1693 - updateRepoStatus with errorMsg surfaces it on listRepos
ok 1694 - all four status values round-trip
ok 1695 - lastIndexed sentinel: absent when never indexed, present after first index
ok 1696 - lastIndexed survives close + reopen
ok 1697 - many repos round-trip without collision (linear-scan correctness)
ok 1698 - addRepo updates status without losing addedAt
ok 1699 - validateRepoPathShape rejects empty string
ok 1700 - validateRepoPathShape rejects non-string input
ok 1701 - validateRepoPathShape rejects relative paths
ok 1702 - validateRepoPathShape rejects filesystem root + system / volatile dirs
ok 1703 - validateRepoPathShape normalises trailing-slash + .. segments
ok 1704 - validateRepoPathShape rejects normalised banned root (e.g. `/Users/.`)
ok 1705 - validateRepoPath (full) accepts an existing temp directory
ok 1706 - validateRepoPath (full) rejects non-existent path
ok 1707 - addRepo rejects empty / banned-root paths via shape validation
ok 1708 - registry codec: decodeRepoRow keeps lastRun, and a status write without lastRun keeps the stored one
ok 1709 - findCallees returns 1-hop CALLS successors
ok 1710 - findCallers returns 1-hop CALLS predecessors
ok 1711 - findCallees with no outgoing CALLS returns []
ok 1712 - findCallers with no incoming CALLS returns []
ok 1713 - findCallees on unknown entity returns []
ok 1714 - findCallees ignores non-CALLS edges
ok 1715 - findDefinedIn returns DEFINES successors
ok 1716 - findDefinedIn with mixed kinds only returns DEFINES targets
ok 1717 - findImports returns IMPORTS successors
ok 1718 - findImports on file with no IMPORTS returns []
ok 1719 - resolveClosure includes the root even with no DEPENDS_ON edges
ok 1720 - resolveClosure on unknown repo path returns just the path
ok 1721 - resolveClosure walks transitive DEPENDS_ON across repos
ok 1722 - resolveClosure handles cycles without infinite loop
ok 1723 - resolveClosure filters out non-repo reachable entities
ok 1724 - insertList creates a list with a seed transfer entry
ok 1725 - insertList rejects unknown owner / source
ok 1726 - insertList with parentListId validates session match
ok 1727 - insertList with missing parent rejects
ok 1728 - insertItem creates an item under an existing list
ok 1729 - insertItem on missing list rejects
ok 1730 - listItems returns items sorted by order
ok 1731 - listItems supports fractional ordering for insert-between
ok 1732 - insertComment + listCommentsForItem round-trip
ok 1733 - listCommentsForItem returns comments sorted by createdAt
ok 1734 - updateComment updates body + agentAcknowledged
ok 1735 - deleteComment removes the comment
ok 1736 - updateItem rejects illegal status transitions
ok 1737 - updateItem -> completed sets completedAt
ok 1738 - updateItem -> blocked requires non-empty blockedReason
ok 1739 - updateList rejects illegal status transitions
ok 1740 - transferList changes owner + appends transfer history
ok 1741 - reparentList sets the parent
ok 1742 - reparentList rejects cycles
ok 1743 - assertParentAllowed accepts valid hierarchies
ok 1744 - listListsBySession returns roots first then children
ok 1745 - listListsBySession filters by includeArchived flag
ok 1746 - listAllLists filters by status + source
ok 1747 - deleteItem removes the item + its comments
ok 1748 - deleteList cascades through items + comments
ok 1749 - deleteListsBySession returns the count
ok 1750 - lists + items + comments survive close + reopen
ok 1751 - repo row round-trip
ok 1752 - registry codec: a row with lastRun round-trips; an older row without it decodes with lastRun undefined
ok 1753 - repo row round-trip -- shared-modules kind with namespace
ok 1754 - entity row round-trip including all flag fields
ok 1755 - entity row preserves empty-string sentinel defaults
ok 1756 - edge props: empty payload encodes to zero-byte buffer
ok 1757 - edge props: CALLS shape round-trips
ok 1758 - edge props: READS shape round-trips
ok 1759 - edge props: IMPORTS shape round-trips
ok 1760 - unresolved row round-trip
ok 1761 - plan row round-trip
ok 1762 - plan_step row round-trip with sentinel timestamps + dependsOn
ok 1763 - session row round-trip with all status / tier values
ok 1764 - turn row round-trip with all enum values
ok 1765 - todo_list row round-trip
ok 1766 - todo_item row round-trip with tags + meta
ok 1767 - todo_comment row round-trip
ok 1768 - config_entry row round-trip
ok 1769 - msgpack encoding is more compact than JSON for typical entity
ok 1770 - large body in entity row round-trips correctly
ok 1771 - compactGraphStore reclaims space after large deletes
ok 1772 - compactGraphStore preserves all rows when nothing has been freed
ok 1773 - compactGraphStore cleans up .bak after success
ok 1774 - compactGraphStore re-opens the env so subsequent writes go through
ok 1775 - compactGraphStore throws when env is not open
ok 1776 - compactGraphStore pre-clears stale .compact / .bak from a prior aborted run
ok 1777 - entityIdByU64 finds the string id via the reverse index
ok 1778 - entityIdsByU64s bulk-resolves O(K) via point lookups
ok 1779 - entity_string_by_u64 is removed when an entity is deleted
ok 1780 - name_index returns ALL entities sharing (repo, kind, name)
ok 1781 - name_index drops only the deleted entity from the dup set
ok 1782 - findEntitiesByName respects kind filter via name_index
ok 1783 - v1->v2 migration backfills entity_string_by_u64 + name_index
ok 1784 - schema_version pre-flight runs the v1->v2 migration on env open
ok 1785 - first entity allocation returns 1 (0 reserved as no-ID sentinel)
ok 1786 - first repo allocation returns 1
ok 1787 - entity allocations are monotonically increasing
ok 1788 - repo allocations are monotonically increasing
ok 1789 - block allocation reserves contiguous IDs without gaps
ok 1790 - block allocation rejects count < 1
ok 1791 - counters survive close + reopen
ok 1792 - peek does not mutate the counter
ok 1793 - in-txn allocator works alongside other writes
ok 1794 - in-txn allocator: repo + entity counters are independent
ok 1795 - concurrent allocations all return distinct IDs
ok 1796 - large block allocation produces correct next value at u64 scale
ok 1797 - owner check: default path with no declaration is refused and no file is created
ok 1798 - owner check: after the declaration the same open succeeds, also after a close and reopen
ok 1799 - owner check: a temporary path opens without a declaration
ok 1800 - owner check: the live path as a relative path and through a symbolic link is refused
ok 1801 - owner check: only the owner declaration opens the live path; without it, and after it is forgotten, the open is refused
ok 1802 - source scan: the reader declaration's name appears nowhere under src/
ok 1803 - refusal: process B is refused and never opens the lock file; process A then writes; a child of a declared process is refused
ok 1804 - refusal of a third process: beside the owner, a process with no declaration is refused the live graph store and holds no descriptor
ok 1805 - lmdb behaviour pin: after a reopen in a fresh process, root.transaction keeps a throwing callback's write, root.childTransaction and root.transactionSync discard it
ok 1806 - the store opens without writemap mode, so child transactions are available
ok 1807 - detection through the real wrappers: asynchronous write by probe, synchronous write at once
ok 1808 - control: the same wrappers on a store that was not broken write and record nothing
ok 1809 - store library after another process removed its locks
ok 1810 - v2->v3: provisions all 4 reserved shared-modules rows
ok 1811 - v2->v3: rewires Java module entity to jvm namespace + recomputes string ID
ok 1812 - v2->v3: rewires Python module entity to python namespace (separate from jvm)
ok 1813 - v2->v3: drops the phantom workspace row + its entities (cascade)
ok 1814 - v2->v3: idempotent on re-run from v3
ok 1815 - v2->v3: workspace row with valid path is preserved
ok 1816 - a v4 store opened by this code is at version 5 with one IndexStateRow per workspace repository, not complete, its pending counts recounted from the stored rows
ok 1817 - a v4 -> v5 step that throws leaves the stored version at 4 and writes no IndexStateRow
ok 1818 - the registry keeps V1->V2, V2->V3 and V3->V4 in order and appends V4->V5
ok 1819 - removing a repository after the migration leaves no index_state row for it
ok 1820 - production MIGRATIONS registry has the v1->v2 entry
ok 1821 - production MIGRATIONS registry has the v2->v3 entry
ok 1822 - runMigrations is a no-op when stored == target
ok 1823 - runMigrations with empty registry but stored < target throws
ok 1824 - runMigrations rejects when stored > target
ok 1825 - runMigrations applies a single 1->2 step and advances meta.schema_version
ok 1826 - runMigrations chains 1 -> 2 -> 3 in two steps
ok 1827 - runMigrations prefers the longest jump that does not overshoot
ok 1828 - runMigrations does not overshoot the target
ok 1829 - runMigrations leaves intermediate version on disk after a per-step crash
ok 1830 - a throwing step leaves neither its rows nor its version write; earlier steps stay committed (ISSUE-5437d6e5)
ok 1831 - runMigrations throws MigrationPathError when chain is incomplete
ok 1832 - runMigrations re-run from already-current version is a no-op
ok 1833 - the two formerly live-store test files pass against a temporary store and create nothing at the default path
ok 1834 - the review probe test, found by the same search, creates nothing at the default path either
ok 1835 - three daemon request tests, found by the same search, create nothing at the default path
not ok 1836 - the MCP step and review tests, found by the full audit, create nothing at the default path
ok 1837 - the check sees a store that IS opened at the default path
ok 1838 - first boot writes schema_version
ok 1839 - re-open with matching schema_version proceeds normally
ok 1840 - re-open with stored > expected hard-fails with LmdbStoreSchemaVersionMismatch
ok 1841 - INSRC_LMDB_MAPSIZE_GIB override is honored
ok 1842 - invalid INSRC_LMDB_MAPSIZE_GIB falls back to default
ok 1843 - LmdbStoreError classes are exported and constructible
ok 1844 - opening a non-LMDB file at the env path surfaces a typed error
ok 1845 - SCHEMA_VERSION constant is exported and stable
ok 1846 - runReaderCheck returns 0 on a fresh env (no stale slots)
ok 1847 - runReaderCheck is a no-op when env is closed
ok 1848 - runReaderCheck is safe to call repeatedly
ok 1849 - RELATION_KIND_BYTE: no duplicate byte; boundary kinds appended at 13-16
ok 1850 - ENTITY_KIND_BYTE: no duplicate byte; externalEndpoint appended at 13
ok 1851 - each boundary RelationKind byte round-trips via kindByteToName
ok 1852 - frozen sc1 vocabulary: protocol enum + boundary names
ok 1853 - externalEndpoint EntityRow round-trips (resolved variant)
ok 1854 - externalEndpoint EntityRow round-trips (unresolved variant with rawExpression)
ok 1855 - forward-compat: a pre-S001 row (no endpoint fields) decodes unchanged, endpoint fields undefined
ok 1856 - graph closure
ok 1857 - v3 -> v4 no-op migration advances schema_version leaving rows byte-identical
ok 1858 - recordStoreFailureIfLockError: records both read failures once, and nothing else
ok 1859 - the named error's message names another process and does not repeat the library's advice
ok 1860 - health record: after locks-lost a further store call throws the named error and closeGraphStore skips the library's close
ok 1861 - health record: after locks-lost getGraphStore itself rejects with the named error
ok 1862 - sync wrapper: code 22 with a succeeding probe read is rethrown and leaves the record ok
ok 1863 - slow healthy write: the probe runs and returns, nothing is recorded, the write completes
ok 1864 - encodeEntityKey + decode round-trips u64 values including edges
ok 1865 - encodeRepoKey + decode round-trips u32
ok 1866 - encodeOutEdgeKey produces 17 bytes; round-trips
ok 1867 - encodeInEdgeKey produces 17 bytes; round-trips
ok 1868 - encodeOutEdgePrefix + prefixSuccessor bracket a single (from,kind) range
ok 1869 - encodeOutEdgePrefix without kind brackets all kinds for a (from)
ok 1870 - big-endian u64 key ordering matches numeric ordering
ok 1871 - composite name_index key includes repo + kind + name
ok 1872 - plan_step key range scans return idx-ordered steps
ok 1873 - conversation_turn key orders by idx within session
ok 1874 - todo_item key respects orderKey lex order
ok 1875 - config_by_scope key supports hierarchical prefix scans
ok 1876 - relation-kind enum byte mapping is bidirectional
ok 1877 - entity-kind enum byte mapping is bidirectional
ok 1878 - utf8 segment with null byte is rejected
ok 1879 - all 20 sub-DBs open and accept basic put/get
ok 1880 - lifecycle close + reopen preserves data
ok 1881 - concurrent first-callers share the same init promise
ok 1882 - write transaction is atomic
ok 1883 - cursor range scan over out_edge prefix returns kind-scoped neighbors
ok 1884 - bfs from a single root yields the root + transitive descendants
ok 1885 - bfs visits each node exactly once even with cycles
ok 1886 - bfs respects maxDepth
ok 1887 - bfs respects kindFilter
ok 1888 - bfs with direction=in walks reverse edges
ok 1889 - bfs visitor pruning skips subtree expansion
ok 1890 - bfs from multiple roots merges the closures
ok 1891 - bfs deduplicates roots
ok 1892 - dfs visits the same nodes as bfs (different order)
ok 1893 - dfs handles cycles without infinite loop
ok 1894 - dfs respects maxDepth
ok 1895 - transitiveClosure returns the BFS-reachable set
ok 1896 - transitiveClosure on empty roots returns empty set
ok 1897 - scc: isolated nodes are singletons
ok 1898 - scc: a 3-node cycle is one component of size 3
ok 1899 - scc: cycle + tail reports two components
ok 1900 - scc: two disjoint cycles + reachable from a single root via separate edge
ok 1901 - scc respects kindFilter
ok 1902 - traversal results survive close + reopen
ok 1903 - unreachable: every entity outside the closure is yielded
ok 1904 - unreachable respects candidateKinds (only those kinds yielded)
ok 1905 - unreachable: empty roots yields every entity of the candidate kinds
ok 1906 - unreachable: all roots, all reachable -> empty
ok 1907 - unreachable: empty candidateKinds is a no-op
ok 1908 - unreachable handles cycles in the reachable subgraph
ok 1909 - unreachable respects kindFilter on the closure traversal
ok 1910 - unreachable respects direction=in (reverse reachability)
ok 1911 - unreachable respects maxDepth
ok 1912 - a withWriteTxn callback that writes in two sub-DBs and throws rejects with its own error and leaves nothing, in-process and after a reopen
ok 1913 - of two callers queued together, one throwing and one succeeding, only the successful one's writes are kept
ok 1914 - an async callback is refused with "withWriteTxn callbacks must be synchronous" and keeps nothing; the type rejects it
ok 1915 - a refused async callback that rejects later raises no unhandled rejection
ok 1916 - upsertArtifactVec + queryArtifactVec round-trip
ok 1917 - queryArtifactVec scopes by sessionId
ok 1918 - queryArtifactVec scopes by intent when provided
ok 1919 - getArtifactById returns the row by exact id (no ANN)
ok 1920 - deleteArtifactsForSession removes all rows for a session and returns count
ok 1921 - upsert: writing the same id replaces
ok 1922 - returns [] for empty query / empty session / k=0
ok 1923 - deleteArtifactsForSession on empty session returns 0 cleanly
ok 1924 - default summary on a freshly-spilled row is empty string
ok 1925 - upsertArtifactVec persists explicit summary verbatim
ok 1926 - updateArtifactSummary overwrites only the summary column
ok 1927 - updateArtifactSummary returns false for unknown id (soft-fail)
ok 1928 - updateArtifactSummary refuses empty id + the seed sentinel
ok 1929 - listArtifactsForSession returns rows newest-first
ok 1930 - listArtifactsForSession scopes by session and excludes seed
ok 1931 - listArtifactsForSession honours skillIdPrefix filter
ok 1932 - listArtifactsForSession honours afterTimestamp lower bound (exclusive)
ok 1933 - listArtifactsForSession returns [] for empty sessionId
ok 1934 - listArtifactsForSession defaults summary to empty string for rows without one
ok 1935 - queryArtifactVec results carry the summary field
ok 1936 - deleteSessionFromLance: empty sessionId is a no-op + zero counts
ok 1937 - deleteSessionFromLance: unknown sessionId returns zero counts
ok 1938 - deleteSessionFromLance: removes only the targeted session across all 4 tables
ok 1939 - deleteSessionFromLance: re-running on the same session is idempotent
ok 1940 - deleteSessionFromLance: SQL-injection-safe (apostrophes in sessionId)
ok 1941 - compactSessionVecTables: succeeds when tables exist + have tombstones
ok 1942 - compactSessionVecTables: succeeds when no tables exist yet
ok 1943 - compactSessionVecTables: idempotent (call twice, second is cheap)
ok 1944 - writeConfigEmbedding + searchConfigVecs round-trip
ok 1945 - searchConfigVecs accepts caller-supplied where filter
ok 1946 - searchConfigVecs scope filter via where
ok 1947 - searchConfigVecs language=all-or-specific filter
ok 1948 - upsert: writing same id replaces
ok 1949 - deleteConfigVec / deleteConfigVecsByIds / deleteConfigVecsForScope
ok 1950 - returns [] for empty query
ok 1951 - seed sentinel is excluded from search results
ok 1952 - getLanceConn creates the directory + opens a connection
ok 1953 - subsequent getLanceConn calls return the same instance
ok 1954 - concurrent first-callers share the init promise
ok 1955 - close + reopen works (data persists)
ok 1956 - setLanceConnPath isolates between tests (different tmpdirs)
ok 1957 - openOrCreateTable creates the table on first call
ok 1958 - openOrCreateTable opens an existing table without re-seeding
ok 1959 - openOrCreateTable rejects empty seed when creating
ok 1960 - writeEntityEmbedding stores a single row
ok 1961 - writeEntityEmbedding upsert: same id replaces row
ok 1962 - writeEntityEmbeddings bulk upsert
ok 1963 - writeEntityEmbeddings on empty array is a no-op
ok 1964 - searchEntityVecs returns ANN hits ordered by distance
ok 1965 - searchEntityVecs respects closure-repo scope
ok 1966 - searchEntityVecs filter=code excludes artifacts
ok 1967 - searchEntityVecs filter=artifact returns only artifacts
ok 1968 - searchEntityVecs returns [] for empty query vector
ok 1969 - searchEntityVecs returns [] for empty closureRepos
ok 1970 - searchEntityVecs excludes the seed sentinel row
ok 1971 - the vector search given an empty list of ids makes no query; given a large list it returns the nearest of them, in one query or in batches merged by distance; with no area the query is as before
ok 1972 - deleteEntityVec removes a single row
ok 1973 - deleteEntityVecsByIds bulk drop
ok 1974 - deleteEntityVecsForRepo removes all rows for a repo
ok 1975 - delete on empty input is a silent no-op
ok 1976 - strings with single quotes are escaped in delete + search
ok 1977 - rows survive close + reopen
ok 1978 - compactEntityVecTable reduces on-disk fragment count
ok 1979 - compactEntityVecTable preserves all rows + searchability
ok 1980 - compactEntityVecTable on a fresh / single-fragment table is a cheap no-op
ok 1981 - compactEntityVecTable result survives close + reopen
ok 1982 - vector store owner rule: no declaration other than the owner's exists, and without it the live vector store is refused
ok 1983 - vector store owner rule: live path refused with no declaration and nothing created; opens after declareLiveStoreOwner; a temporary path opens; relative path and symbolic link refused
ok 1984 - no test opens the live vector store: each repaired test file run in a temporary home leaves no lance directory
ok 1985 - the check sees a vector store that IS opened at the default path
ok 1986 - upsertResponseSegmentVec + queryResponseSegmentVec round-trip
ok 1987 - queryResponseSegmentVec scopes hits to a single session
ok 1988 - queryResponseSegmentVec respects the k limit
ok 1989 - queryResponseSegmentVec returns [] for empty query vector or empty sessionId
ok 1990 - upsert is idempotent on the same id (mergeInsert overwrite)
ok 1991 - deleteResponseSegmentsForSession removes all rows for a session and returns the count
ok 1992 - deleteResponseSegmentsForSession on an empty session returns 0
ok 1993 - deleteResponseSegmentsForTurn removes only the rows for that turn
ok 1994 - seed row never appears in query results
ok 1995 - writeSessionEmbedding + searchSessionVecs round-trip
ok 1996 - searchSessionVecs scopes by repo
ok 1997 - searchSessionVecs with notExpired drops expired sessions
ok 1998 - upsert: writing the same id replaces
ok 1999 - deleteSessionVec / deleteSessionVecsByIds / deleteSessionVecsForRepo
ok 2000 - returns [] for empty query / empty repo
ok 2001 - writeTurnEmbedding + searchTurnVecs round-trip
ok 2002 - searchTurnVecs default type filter excludes summary
ok 2003 - searchTurnVecs with explicit types
ok 2004 - deleteTurnVec / deleteTurnVecsBySessionId / deleteTurnVecsForRepo
ok 2005 - writeBullet + searchBullets: single-row round-trip
ok 2006 - writeBullets: batched insert + ANN returns multiple hits ordered by distance
ok 2007 - searchBullets: filters by runId -- other runs are excluded
ok 2008 - searchBullets: empty runId -> [] (early return)
ok 2009 - searchBullets: empty queryVec -> [] (early return)
ok 2010 - deleteBulletsForRun: drops every row for the run
ok 2011 - deleteBulletsForRun: empty runId -> no-op (no throw)
ok 2012 - deleteBulletsForTodo: drops just the matching TODO's rows
ok 2013 - escapeLanceString: doubles single quotes
ok 2014 - searchBullets: runId containing a single quote does not corrupt the filter
ok 2015 - writeBullets: writing the same id twice updates the row in place
ok 2016 - S003 t2 — code-symbol resolver excludes CALLS_HTTP
ok 2017 - runCrossFileResolver (LMDB) -- INHERITS in same package
ok 2018 - runCrossFileResolver (LMDB) -- module-stub IMPORTS rewiring
ok 2019 - runCrossFileResolver (LMDB) -- external-dep stays as module stub
ok 2020 - runCrossFileResolver (LMDB) -- CALLS resolves to exported function in imported file
ok 2021 - runCrossFileResolver (LMDB) -- CALLS to non-exported target stays unresolved
ok 2022 - runCrossFileResolver (LMDB) -- CALLS marks ambiguous when two imported files export same name
ok 2023 - runCrossFileResolver (LMDB) -- idempotency
ok 2024 - embedder.ts derives its keep_alive from the models.local.embeddingKeepAlive config
ok 2025 - every ollama.embed(...) call in the indexer embedder passes keep_alive
ok 2026 - t1 ac1: one externalEndpoint node per distinct resolved target, with a CALLS_HTTP edge from each caller
ok 2027 - t1 ac2 dedup: three call-sites to one target => one node, three CALLS_HTTP edges
ok 2028 - t1 ac2 per-repo: two repos calling the same target => two distinct nodes
ok 2029 - t1 cross-language: a TS and a Python edge to the same resolved identity share ONE language-agnostic node
ok 2030 - t1 resolved-vs-literal dedup: an interpolated expr resolving to the same host/path as a literal collapses to one node
ok 2031 - t1 unresolved (k5): an un-pinnable URL mints an unresolved node carrying rawExpression + a CALLS_HTTP edge, never dropped
ok 2032 - t1 dangling `from`: a CALLS_HTTP whose caller no longer exists is skipped (no node, no edge)
ok 2033 - t1 idempotency: re-running over identical rows yields the identical node/edge set; sc2 called once per distinct expr
ok 2034 - t1 no-op: a repo with no CALLS_HTTP rows produces no endpoints and leaves the graph unchanged
ok 2035 - t2 edges-stat: one caller, two distinct raw exprs -> same identity => endpoints=1, edges=1 (not 2)
ok 2036 - t2 GC: an orphan externalEndpoint (no in-edge) is deleted while a live one survives the pass
ok 2037 - t2 GC full-clear: a repo whose HTTP calls were all removed ends with zero endpoint nodes
ok 2038 - t2 idempotency: re-running on identical rows deletes nothing and yields the same node set
ok 2039 - IGNORE_DIRS excludes build-output + daemon-artifact dirs
ok 2040 - full index: during a run the in-process record shows began and files done of selected; at the end the registry row's lastRun is written once with outcome 'completed' or 'failed' (a forced failure mid-walk), and the record is closed; no write per file (counted)
ok 2041 - reindex of a ready repository: status indexing and the running record carries the new run's figures
ok 2042 - start-up re-queue: repositories left indexing without lastIndexed are still re-queued, unchanged
ok 2043 - parseManifest - Maven pom.xml
ok 2044 - parseManifest - Gradle (Groovy DSL)
ok 2045 - parseManifest - Gradle (Kotlin DSL)
ok 2046 - parseManifest - SBT
ok 2047 - parseManifest - Mill
ok 2048 - parseManifest - no manifest
ok 2049 - ac1: publish + subscribe to the SAME topic => ONE node, TWO edges (direction on the edge)
ok 2050 - ac1 dedup: three producers to one topic => one node, three PUBLISHES_TO edges; sc2 called once
ok 2051 - ac2: a config-built topic resolves to an identity; an un-pinnable one still mints a resolved:false node
ok 2052 - idempotency: re-running over identical rows yields the identical node set and GC deletes nothing
ok 2053 - cross-protocol GC: the messaging pass GCs an orphan messaging node but NEVER an HTTP node
ok 2054 - cross-protocol GC (symmetric): the HTTP pass never deletes a messaging endpoint
ok 2055 - no-op: a repo with no messaging rows produces no endpoints
ok 2056 - a clean-up job for a registered repository with nothing stored is processed without error
ok 2057 - the clean-up removes a file that is gone and a file under an ignored directory, with their relations and unresolved relations, and leaves every other file of the repository and every file of another repository as it was
ok 2058 - a file that exists and is not ignored is kept although the file listing leaves it out, an entity with no file path is kept, and a file whose name only contains an ignored name is kept
ok 2059 - a repository whose directory is missing loses nothing, and a file whose presence cannot be told is kept
ok 2060 - running the clean-up a second time removes nothing, and a repository with nothing stale is left as it was
ok 2061 - a file whose parent directory became a file is removed as absent
ok 2062 - the clean-up of a repository that ignores a directory leaves the entities a nested registered repository holds for the files under it
ok 2063 - the vector rows of a removed file are gone after the clean-up and those of a kept file remain
ok 2064 - a kept file's link into a removed entity is removed with it, and the kept file's other links and entities stay
ok 2065 - a clean-up that removed files runs the resolver once inside the job, leaves no settle timer armed and removes the repository's cached exploration results, and one that removed nothing leaves them
ok 2066 - the clean-up method called directly removes the stale files, runs no resolver and removes no cached result
ok 2067 - a store failure part-way through a clean-up job still drops the cached results and runs the resolver for the files already removed, and the job fails
ok 2068 - a resolver failure after a clean-up fails the job with the cached results already dropped
ok 2069 - a failure on the only stale file still drops the cached results and runs the resolver, because part of the file may be gone
ok 2070 - a repository whose directory is there but holds none of the stored files loses nothing, and one where only ignored files are left on disk is still cleaned
ok 2071 - an ignored file is removed whatever the check of its presence says, also when it is the only thing stored
ok 2072 - a clean-up failure inside a full index fails the full index and marks the repository error
ok 2073 - a create or update file job for a file under an ignored directory indexes nothing, and one for a file elsewhere is indexed
ok 2074 - a ready repository gets a clean-up job at daemon start, one that gets a full index at start gets no separate one, and a full index runs the clean-up before it marks the repository ready
ok 2075 - detectRepoType: marker files map to types (polyglot returns all)
ok 2076 - detectRepoType: empty repo → no types
ok 2077 - repoTypeIgnoreDirs: java → target/build, python → __pycache__/.venv, node → node_modules/dist
ok 2078 - gitignoreDirs: extracts bare dir names, skips comments/negations/globs/nested
ok 2079 - gitignoreDirs: no .gitignore → empty
ok 2080 - initRepoIgnore: with .gitignore → base ∪ gitignore dirs, persisted to .insrc/config.json
ok 2081 - initRepoIgnore: no .gitignore → base ∪ repo-type defaults (java)
ok 2082 - initRepoIgnore: idempotent — never overwrites an existing ignore
ok 2083 - resolveRepoIgnore: config present → its ignore; absent → IGNORE_DIRS fallback
ok 2084 - resolveRelations -- Python relative imports
ok 2085 - detectSourceRoots -- Java/Maven
ok 2086 - detectSourceRoots -- Java/Gradle
ok 2087 - detectSourceRoots -- Scala/SBT cross-build
ok 2088 - detectSourceRoots -- Python flat + nested
ok 2089 - detectSourceRoots -- Python with src/ layout
ok 2090 - detectSourceRoots -- Go
ok 2091 - detectSourceRoots -- TypeScript tsconfig
ok 2092 - detectSourceRoots -- JavaScript jsconfig
ok 2093 - detectSourceRoots -- no-manifest conventions
ok 2094 - endpoint id reuses the makeEntityId hex-32 convention (file="" , kind="externalEndpoint")
ok 2095 - same (repo, protocol, target) => same id; differing repo => different id (per-repo dedup, k2)
ok 2096 - protocol participates in identity: same target, different protocol => different id
ok 2097 - unresolved endpoint (target="") derives its id from rawExpression, distinct from a resolved same-protocol endpoint
ok 2098 - http-client-shapes helper — stable contract for t4/t5
ok 2099 - TypeScript/JS HTTP recognizer
ok 2100 - TypeScript proven-receiver dataflow recall (S001 t3)
ok 2101 - Java HTTP recognizer (import-gated)
ok 2102 - Scala HTTP recognizer (import-gated)
ok 2103 - Python HTTP recognizer
ok 2104 - Go HTTP recognizer
ok 2105 - Python proven-receiver dataflow recall (S001 t4)
ok 2106 - Python messaging recognizer (S004)
ok 2107 - Go messaging recognizer (S004)
ok 2108 - Java parser - top-level types
ok 2109 - Java parser - package + imports
ok 2110 - Java parser - CALLS
ok 2111 - Java parser - members
ok 2112 - Java parser - annotations + nesting
ok 2113 - Kotlin parser - types
ok 2114 - Kotlin parser - functions
ok 2115 - Kotlin parser - package + imports
ok 2116 - Kotlin parser - supertypes
ok 2117 - Kotlin parser - calls
ok 2118 - Kotlin parser - robustness
ok 2119 - Kotlin parser - registry + jvm dedup
ok 2120 - Kotlin parser - grammar smoke regression
ok 2121 - messaging-client-shapes helper — stable contract
ok 2122 - TypeScript/JS messaging recognizer
ok 2123 - Scala parser - top-level types
ok 2124 - Scala parser - imports
ok 2125 - Scala parser - members
ok 2126 - Scala parser - Scala 3 specifics
ok 2127 - Scala parser - CALLS
ok 2128 - t4: adapter discovers a config-entity Dockerfile AND reads repo-root .env at rest; matches the pure core
ok 2129 - t4: an empty-config repo yields an empty map — literals pin, indirect exprs resolve unresolved, no throw
ok 2130 - t4: resolution never executes a config source — a Dockerfile RUN / shell is inert text
ok 2131 - t1: ResolvedTarget discriminates on `resolved`; ConfigSourceLayer has the four members
ok 2132 - t3: a concrete literal resolves true with identity=the literal (no map lookup)
ok 2133 - t3: an interpolation referencing a key present only in localConfig resolves from the default
ok 2134 - t3: a two-key interpolation with one missing key => {resolved:false} (no partial pin)
ok 2135 - t3: a missing key => unresolved
ok 2136 - t3: a cyclic interpolation chain terminates and returns unresolved
ok 2137 - t3: a deep (nested) chain that terminates resolves to the final literal
ok 2138 - t3: protocol is carried through unchanged for http/messaging/rpc (no shape validation)
ok 2139 - t3: precedence via resolveAgainst — k8s beats envFile beats localConfig; k8s beats docker
ok 2140 - t2: .env parser — key=value, quoted, comments, export, malformed line skipped
ok 2141 - t2: Dockerfile ENV parser — KEY=VALUE (multi) + legacy KEY VALUE, tagged docker
ok 2142 - t2: docker-compose parser — environment map + list forms, tagged docker
ok 2143 - t2: k8s manifest parser — container env + ConfigMap data (multi-doc), tagged k8s, never kubectl
ok 2144 - t2: unparseable YAML is skipped without throwing
ok 2145 - t2: localConfig parser — flat JSON + key=value/key: value lines, tagged localConfig
ok 2146 - t2: buildConfigSourceMap — dispatch by filename + total precedence winner per key
# tests 2257
# pass 2149
# fail 1
# cancelled 0
# skipped 104
```

## Note on the run above and a re-run

The run above had one failure, 'the MCP step and review tests, found by the full audit, create nothing at the default path' (src/db/graph/__tests__/no-live-store-in-tests.test.ts). That file passes alone (5/5), and a re-run of the same four globs at the same commit had 0 failures:

```
# tests 2257
# pass 2150
# fail 0
# cancelled 0
# skipped 104
```

The audit spawns child test processes with time bounds; under the parallel load of 2257 tests it is flaky, not broken by this task.
