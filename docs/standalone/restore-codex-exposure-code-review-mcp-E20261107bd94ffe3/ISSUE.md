<!-- insrc:artifact ISSUE-bd94ffe3cce0cd70 -->

# Restore Codex exposure of the code-review MCP tool

## Reproduction

Start Codex with the current insrc MCP server. Server listTools advertises 13 tools including insrc_code_review_step, but this session exposes 12. Codex logs: Skipping MCP tool mcp__insrcinsrc_code_review_step: failed to build tool spec: invalid type: map, expected a string. No review is dispatched.

## Root cause

Codex rejects the advertised code-review input schema during tool-spec construction. The shared converter in src/mcp/structural-schema.ts emits z.tuple for array-valued schema.items; the advertised packet.reviewSet[].files[].segments[].after.items is an array of two integer schema maps. This is the isolated incompatible construct candidate; confirm its removal resolves ingestion with a focused schema compatibility regression and post-update session check. Canonical packet validation is separate and must remain unchanged.

## Fix intent

Advertise selected line ranges with client-compatible homogeneous array items and exact length while preserving integer bounds and host validation. Add focused tests for range acceptance/rejection, actual advertised code-review schema shape, and shared converter behavior. Verify build and tool discovery; real Codex exposure requires an updated MCP process.

## Citations

- **[[c1]]** `code` `src/mcp/structural-schema.ts`
- **[[c2]]** `stakeholder` `Codex diagnostic logs and MCP listTools comparison captured in this session` — "failed to build tool spec: invalid type: map, expected a string"
- **[[c3]]** `analyze-bundle` `Analyze file-scope run: structural-schema.ts, module.profile and import.graph; graph coverage incomplete.`
