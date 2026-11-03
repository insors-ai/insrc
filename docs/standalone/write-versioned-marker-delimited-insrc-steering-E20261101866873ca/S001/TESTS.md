<!-- insrc:artifact TESTS-866873cab2dedcc7-S001 -->

# Tests: 866873cab2dedcc7 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 54 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t2

Run at 2026-11-01T09:27:22.352Z on commit `42f077889`. Tests check: **passed**. 27 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/__tests__/mcp-register.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | unselected clients are always emitted as skipped, never omitted | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | {claude:true} registers claude (mcp add --scope user); codex is skipped | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | {agents:true} maps to the codex client (agents flag → codex, --scope omitted) | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | {vibe:true} registers vibe via `vibe mcp add insrc --transport stdio`; no `mcp list` is spawned | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | vibe already present in config.toml [[mcp_servers]] → unchanged, no add spawned | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | vibe add failure → failed carrying the CLI stderr; other clients unaffected | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | upsertVibeAgentsSteering: creates AGENTS.md with the marked steering block when absent, idempotent on second call | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | upsertVibeAgentsSteering: replaces only the marked span on re-registration (future release updates content in place), preserves surrounding user content | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | upsertVibeAgentsSteering: malformed markers (open without close) are a guarded no-op — file untouched, never clobbered | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | registerMcpClients with {vibe:true} also upserts the AGENTS.md steering block (in-memory seam), and registration still succeeds | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | vibeConfigHasServer: matches an [[mcp_servers]] name line only, not other tables or values | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | an existing `insrc` entry in `mcp list` → unchanged, no add spawned | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | an `insrc` substring only inside a path (not a line-start name) does NOT count as registered | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | an indeterminate `mcp list` (non-zero exit) → failed, and deliberately does NOT add | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | a missing CLI binary (ENOENT spawn) → failed with a not-found note, no throw | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | a non-zero `mcp add` exit → failed carrying the CLI stderr | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | per-client isolation: claude add fails, codex still registers independently | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | mixed idempotency: claude already present, codex absent → unchanged + registered | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | a missing out/bin/insrc-mcp.js → failed for each selected client, no subprocess | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | registerMcpClients never rejects even if the injected run throws | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | probeMcpClients: per-client availability + registration from the same pre-checks registration uses; never throws | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | probeMcpClients: an unreachable CLI resolves available:false, registered:false; a vibe without config text is registered:false | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | vibe + repoPath: writes [[mcp_servers]] insrc into the repo's own .vibe/config.toml, never spawns `vibe mcp add`, note says restart vibe | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | vibe + repoPath: existing project entry → unchanged, nothing written; existing unrelated content is preserved on write | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | vibe without repoPath keeps the user-global `vibe mcp add` path (unchanged behavior) | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | probeMcpClients with a repoPath counts the repo's project .vibe/config.toml as registered for vibe | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | upsertVibeProjectServer on a real temp dir: creates .vibe/config.toml, idempotent, valid entry | `src/daemon/__tests__/mcp-register.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/mcp-register.test.ts` | 0 | 27 | 0.8 s |  |

## t1

Run at 2026-11-01T09:25:26.181Z on commit `e726a7f08`. Tests check: **passed**. 27 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/__tests__/mcp-register.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | unselected clients are always emitted as skipped, never omitted | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | {claude:true} registers claude (mcp add --scope user); codex is skipped | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | {agents:true} maps to the codex client (agents flag → codex, --scope omitted) | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | {vibe:true} registers vibe via `vibe mcp add insrc --transport stdio`; no `mcp list` is spawned | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | vibe already present in config.toml [[mcp_servers]] → unchanged, no add spawned | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | vibe add failure → failed carrying the CLI stderr; other clients unaffected | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | upsertVibeAgentsSteering: creates AGENTS.md with the marked steering block when absent, idempotent on second call | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | upsertVibeAgentsSteering: replaces only the marked span on re-registration (future release updates content in place), preserves surrounding user content | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | upsertVibeAgentsSteering: malformed markers (open without close) are a guarded no-op — file untouched, never clobbered | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | registerMcpClients with {vibe:true} also upserts the AGENTS.md steering block (in-memory seam), and registration still succeeds | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | vibeConfigHasServer: matches an [[mcp_servers]] name line only, not other tables or values | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | an existing `insrc` entry in `mcp list` → unchanged, no add spawned | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | an `insrc` substring only inside a path (not a line-start name) does NOT count as registered | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | an indeterminate `mcp list` (non-zero exit) → failed, and deliberately does NOT add | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | a missing CLI binary (ENOENT spawn) → failed with a not-found note, no throw | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | a non-zero `mcp add` exit → failed carrying the CLI stderr | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | per-client isolation: claude add fails, codex still registers independently | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | mixed idempotency: claude already present, codex absent → unchanged + registered | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | a missing out/bin/insrc-mcp.js → failed for each selected client, no subprocess | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | registerMcpClients never rejects even if the injected run throws | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | probeMcpClients: per-client availability + registration from the same pre-checks registration uses; never throws | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | probeMcpClients: an unreachable CLI resolves available:false, registered:false; a vibe without config text is registered:false | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | vibe + repoPath: writes [[mcp_servers]] insrc into the repo's own .vibe/config.toml, never spawns `vibe mcp add`, note says restart vibe | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | vibe + repoPath: existing project entry → unchanged, nothing written; existing unrelated content is preserved on write | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | vibe without repoPath keeps the user-global `vibe mcp add` path (unchanged behavior) | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | probeMcpClients with a repoPath counts the repo's project .vibe/config.toml as registered for vibe | `src/daemon/__tests__/mcp-register.test.ts` |
| pass | upsertVibeProjectServer on a real temp dir: creates .vibe/config.toml, idempotent, valid entry | `src/daemon/__tests__/mcp-register.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/mcp-register.test.ts` | 0 | 27 | 0.6 s |  |
