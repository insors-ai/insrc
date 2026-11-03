<!-- insrc:artifact PLAN-866873cab2dedcc7-S001 -->

# Plan: E20261101866873ca:S001

## Summary

**Epic:** `write-versioned-marker-delimited-insrc-steering`
**LLD run:** `wf-1793514227546-4iy7v6`
**LLD effective hash:** `866873cab2de...`

Two tasks: t1 implements upsertVibeAgentsSteering in mcp-register.ts (reusing steering-inject.ts's upsertMarkedSection + readSteeringBlock, guarded wiring on the vibe path); t2 adds the unit tests. Both map to src/daemon/__tests__/mcp-register.test.ts.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Implement upsertVibeAgentsSteering and wire it into the vibe registration path | S | — | unit: src/daemon/__tests__/mcp-register.test.ts | [[c1]] |
| 2 | **`t2`** Unit tests for the steering upsert and registration wiring | S | `t1` | unit: src/daemon/__tests__/mcp-register.test.ts | [[c1]] |

### 1.1 E20261101866873ca:S001:T001 — Implement upsertVibeAgentsSteering and wire it into the vibe registration path

mcp-register.ts: upsertVibeAgentsSteering(deps) reusing upsertMarkedSection + readSteeringBlock; deps seams; registerOne vibe path calls it guarded.

**Acceptance checks:**
- AGENTS.md created with marked block when absent
- marked span replaced in place on re-registration
- malformed markers -> guarded no-op
- steering write failure never fails registration

### 1.2 E20261101866873ca:S001:T002 — Unit tests for the steering upsert and registration wiring

mcp-register.test.ts: in-memory AGENTS.md seams in stub(); create/idempotent/replace/preserve/malformed + registerMcpClients vibe path.

**Acceptance checks:**
- mcp-register.test.ts 27/27 green
- tests never touch real ~/.vibe

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/daemon/__tests__/mcp-register.test.ts | `t1`, `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD-866873cab2dedcc7-S001`
