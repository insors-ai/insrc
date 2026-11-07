<!-- insrc:artifact ISSUE-65b643840a294422 -->

# Take a structured analyze request, not a prompt, and anchor the analysis on its named scope

## Reproduction

Ask the analyzer, through either MCP tool (insrc_analyze_step or insrc_analyze), a question about one module, for example how the task-review checkpoint is published, passing the user's wording as the only description of the request (focus) with the repository path. The analysis is started against the whole repository, and the user's words alone then choose where it centres: for code, directories, files and entities are ranked by how many words of the prompt appear in their paths and names and the answer is told to centre on the top hit; for documents, the prompt is embedded and matched by vector similarity. A prompt that names the module differently from its path, or shares words with another area, centres the analysis on the wrong place, and the caller has no way to say which module, file or symbol it means. Expected: the calling agent, which has read the prompt, hands the analyzer a structured request that names the repository, the scope (a module, file, symbol, directory or document) and the question, and the analysis is anchored on that scope.

## Root cause

Both MCP analyze tools take a prompt and nothing else that describes the request: the step tool's start input is { focus, repo?, target?, scope? } where scope is only a size hint, and the one-shot tool builds the same shape. Each hand-builds the intent with a scope reference of kind workspace set to the repository path, so the scope is always the whole repository, and the raw prompt is stored as the intent's focus. The structured scope reference type already exists (kinds repo, module, file, symbol, connection, manifest-dir and workspace), and the daemon's own run pipeline fills it by sending the user's prompt to an LLM classifier, but neither MCP tool lets the caller supply it. With the scope fixed at the whole repository, the first exploration ranks the repository by token match against the focus and the answer prompt tells the synthesizer to trust and centre on its top hit, and the docs retrieval embeds the focus for a vector search. The decision the calling agent is best placed to make, what the user is pointing at, is therefore left to word matching over the whole repository.

## Fix intent

The analyze request becomes a structured object that the calling agent fills after reading the user's prompt: the repository, the scope it points at (using the existing scope reference kinds), the kind of source, the question, and a size hint and related context where it has them. Both MCP analyze tools accept that object, the analyzer anchors the analysis on the scope it names instead of the whole repository, and the text-matching and vector lookups are used only to explore within or around that scope, not to decide it. What happens to a request that carries only a prompt, and how the steering text tells agents to build the request, are design decisions for the next stage.

## Citations

- **[[c1]]** `code` `src/daemon/steps/analyze-step/types.ts:24-30` — "readonly focus:   string;"
- **[[c2]]** `code` `src/daemon/steps/analyze-step/phases/start.ts:66` — "scopeRef: { kind: 'workspace', value: repoPath },"
- **[[c3]]** `code` `src/daemon/steps/analyze-oneshot.ts:47-52` — "scopeRef:  { kind: 'workspace', value: repoPath },"
- **[[c4]]** `code` `src/shared/analyze-types.ts:33-43`
- **[[c5]]** `code` `src/analyze/explore/concept-resolve.ts:10-20`
- **[[c6]]** `code` `src/analyze/docs-retrieval.ts:205` — "queryVec = await vectorPass.embedQuery(args.query, args.connectionExecution);"
- **[[c7]]** `code` `src/prompts/analyze/synthesize.code.system.md:132` — "Trust the resolver's ranking."
- **[[c8]]** `code` `src/analyze/classifier/driver.ts:23`
- **[[c9]]** `doc` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/DEF.md`
