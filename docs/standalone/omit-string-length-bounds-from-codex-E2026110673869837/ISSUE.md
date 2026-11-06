<!-- insrc:artifact ISSUE-7386983710e0c464 -->

# Omit string-length bounds from Codex wire schemas

## Reproduction

The actual task-result schema with a tiny synthetic prompt terminates in Codex CLI with max_output_tokens and no assistant output. Removing only maxLength still fails; removing both minLength and maxLength succeeds. The returned JSON passes the original schema including its original length bounds. Same Sol model, medium effort, CLI, working directory and prompt. [c2]

## Root cause

The Codex-specific recursive keyword filter retains minLength and maxLength in the outgoing strict schema. Controlled replay demonstrates that removing those string-bound keywords from this schema avoids the observed failure; it does not establish the internal Codex/backend defect. Original-schema validation is a separate existing boundary. [c1][c2]

## Fix intent

Omit minLength and maxLength recursively from the Codex-only schema copy. Preserve the original host schema and enforce its string bounds when validating responses. Preserve other keywords, property names, enum/default data, regexes, array/numeric constraints, and non-Codex behavior. Cover wire omission and rejection of out-of-bounds host responses with deterministic tests. Keep the earlier nullable experiment separate. [c1][c2]

## Citations

- **[[c1]]** `code` `src/agent/providers/structured-schema.ts`
- **[[c2]]** `doc` `/tmp/codex-review-schema-probe/no-string-lengths-stdout.jsonl`
- **[[c3]]** `doc` `/tmp/codex-review-schema-probe/removed-string-lengths.json`
