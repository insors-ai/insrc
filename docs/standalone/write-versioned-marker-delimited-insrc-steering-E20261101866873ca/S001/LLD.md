<!-- insrc:artifact LLD-866873cab2dedcc7-S001 -->

# LLD: E20261101866873ca:S001

## Summary

**Epic:** `write-versioned-marker-delimited-insrc-steering`
**HLD base run:** `wf-1793514227546-4iy7v6`
**HLD effective hash:** `866873cab2de...`

When vibe is registered as an insrc MCP client, the daemon also ensures the user-level ~/.vibe/AGENTS.md carries a versioned, marker-delimited insrc steering block (the shared insrc:steering markers). Re-registration replaces the marked span in place, so the steering is idempotent and future releases change its content by editing one function. The repo AGENTS.md insrc:steering block remains the project-level source of truth; the user-level block only directs agents to follow it when present.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** mcp-register.ts registers the insrc MCP per CLI; vibe has no `mcp list`, so it is pre-checked via config.toml and registered into the repo's .vibe/config.toml (upsertVibeProjectServer) or the user-global config. Nothing wrote ~/.vibe/AGENTS.md, so the insrc:steering-following rule was lost on fresh machines and could not evolve across releases.
**Rollout phase:** n/a (standalone small)

## 2. Contract details

**Surface level:** internal

### 2.1 `upsertVibeAgentsSteering`

```typescript
(deps?: McpRegisterDeps) => 'unchanged' | 'updated'
```

**Parameters:**
- `deps: McpRegisterDeps` _(optional)_ — injected seams; defaults read/write $VIBE_HOME|~/.vibe/AGENTS.md

**Returns:** `'unchanged' | 'updated'` — whether the file was written

**Errors:**
- `IOError` when AGENTS.md unwritable; propagates to the guarded caller

**Preconditions:**
- vibe plan selected

**Postconditions:**
- exactly one marked block at current version
- content outside markers unchanged

### 2.2

```typescript
() => string
```

The block text comes from the existing `readSteeringBlock()` (shipped `prompts/steering-block.md` asset), overridable via the `steeringBlockText` seam; future releases edit the asset.

## 3. Data model changes

### 3.1 shared `insrc:steering` markers — reused, not new

<!-- insrc:steering:start --> ... <!-- insrc:steering:end --> — the existing constants `STEERING_MARKER_START`/`STEERING_MARKER_END` from `src/daemon/steering-inject.ts` (already used for repo AGENTS.md/CLAUDE.md). No new marker pair and no version token: the block content is the shipped `prompts/steering-block.md` asset, and `upsertMarkedSection` replaces the marked span with the current asset on each registration, so future releases change the steering content by shipping a new asset.

**Call sites:**
- `src/daemon/mcp-register.ts` (via `upsertMarkedSection` / `readSteeringBlock` from `src/daemon/steering-inject.ts`)

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `mcp-register-deps` | implements | McpRegisterDeps gains vibeAgentsMdText / writeVibeAgentsMd / vibeHome seams mirroring the existing vibe config seams; vibeHome shared with defaultVibeConfigText. registerMcpClients calls upsertVibeAgentsSteering on the vibe path after the MCP outcome; steering write failure is logged, never fails registration. |

## 5. Error paths

**Error cases**

- **AGENTS.md absent or unreadable** (recoverable)
  - Detection: read seam returns undefined
  - Response: create file with heading + marked block; return 'updated'
  - User impact: none; steering appears on next vibe start
- **marked block present at any version** (recoverable)
  - Detection: start marker found
  - Response: replace exactly the span start..end inclusive; never append
  - User impact: none
- **malformed markers (open without close, or duplicates)** (recoverable)
  - Detection: marker counts differ or out of order
  - Response: guarded no-op — the file is left byte-for-byte untouched and a note is logged; the same 'never guess, never clobber' convention as `upsertMarkedSection` in src/daemon/steering-inject.ts (LLD-866873cab2dedcc7 reuses that writer rather than diverging from it)
  - User impact: steering not updated this time; de-duplicate manually
- **AGENTS.md unwritable** (recoverable)
  - Detection: write throws
  - Response: propagate to guarded caller; registration unaffected, logged
  - User impact: steering retried next registration

**Edge cases**

| Input | Expected |
| :--- | :--- |
| empty file | heading + block written |
| file with only the block | one block remains |
| CRLF outside block | preserved byte-identical |

**Invariants to preserve**

- content outside the marked span byte-identical [[c1]]
- exactly one marked block after any call [[c1]]
- same-version second call writes nothing [[c1]]
- VIBE_HOME honored for read and write [[c1]]

## 6. Test strategy

**Test framework:** `node:test via tsx`

**Test levels**

- **unit** — upsertVibeAgentsSteering via injected seams: create, replace, idempotent, preserve, asset change, unterminated marker, registerMcpClients vibe path invokes it
  - Subjects: `src/daemon/__tests__/mcp-register.test.ts`
  - Fixtures: `in-memory AGENTS.md via seams`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `replace on re-registration, no duplicate` |
| `ac2` | `asset change updates content` |
| `ac3` | `surrounding content byte-identical` |
| `ac4` | `idempotent second call writes nothing` |

## 7. Alternatives considered

### 7.1 a1: Append every time

Append block per registration

append at end

**Rejected because:** not idempotent, not evolvable

### 7.2 a2: Marker-delimited replace-in-place — **CHOSEN**

Replace marked span per registration

replace span if markers present, else append

### 7.3 a3: Write once ever

Write only when no marker

write if absent

**Rejected because:** future releases cannot update

### 7.4 a4: Project-level only

No user-level write

repo AGENTS.md only

**Rejected because:** does not fix the ask

## 8. References

- **[[c1]]** `code` `src/daemon/mcp-register.ts`
- **[[c2]]** `code` `src/daemon/__tests__/mcp-register.test.ts`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**3 do not hold · 0 could not be verified · 5 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-11-01T08:06:26.267Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| new-versus-reuse | MED | Section 2.2 names `vibeAgentsSteeringBlock: () => string` as a contract function of this Story, reading the shipped `prompts/steering-block.md` asset. | No such function exists anywhere in the source tree (grep for
| change-sites | MED | Section 4's shared-contract row states 'registerMcpClients calls upsertVibeAgentsSteering on the vibe path after the MCP outcome'. | In `registerOne` (src/daemon/mcp-register.ts:324-397), the vibe steering upsert block (lines 340-347) runs immediately after the `entrypointExists` check and BEFORE the idempotency pre-check (`listArgs`/`repoPath` branch) and the `add` call that actually produce the 'registered'/'unchanged'/'failed' MCP outcome — i.e. before, not after, the outcome is known. [files: src/daemon/mcp-register.ts] | Correct the sequencing description in section 4 to 'before the MCP registration outcome is determined' so a reader relying on the contract table for ordering isn't misled. |
| error-paths | MED | The error-cases table states that when AGENTS.md is absent, the response is to 'create file with heading + marked block', and the edge-case table states an empty file yields 'heading + block written'. | `upsertMarkedSection(null, block)` in steering-inject.ts:119-125 (the function this Story reuses unmodified) returns `content: section + '\\n'` — only the marked span, with no heading of any kind. The Story's own test confirms this: 'upsertVibeAgentsSteering: creates AGENTS.md ... ' (mcp-register.test.ts:141-155) asserts the written text matches `/<!-- insrc:steering:start -->\\nSTEERING BLOCK v1\\n<!-- insrc:steering:end -->/` with no heading text at all. [files: src/daemon/steering-inject.ts, src/daemon/__tests__/mcp-register.test.ts] | Remove the 'heading +' wording from the error-case and edge-case rows (or state explicitly that no heading is written) so the error-path table matches the reused upsert function's real behavior. |

#### Could not verify (does not block)

_None._
