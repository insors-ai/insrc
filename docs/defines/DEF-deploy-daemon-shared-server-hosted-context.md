<!-- insrc:artifact DEF-4152d0e88a8cec7c -->

# Epic: insrc's grounded context lives in per-developer silos.

**Flavor:** enhancement

## Problem

insrc's grounded context lives in per-developer silos. Each developer must add and index every repository on their own machine, and the resulting graph + vector index is private to that one process, reachable only over a local socket. On a team this means the same shared codebases are indexed redundantly by everyone — wasteful of time and compute, and inconsistent, because each person's index reflects whatever files and branch they happened to have checked out when they last re-indexed, drifting from their teammates'. There is no way to index a shared codebase ONCE against a known, named branch and let the whole team reuse and search that same grounded context — its API endpoints, function and type signatures, structure, and semantic neighbours. Anyone who does not have a given repo checked out at all — a newcomer, or a developer on an adjacent team who needs to call another team's service — simply cannot query its context. And because each index is bound to a working tree rather than an agreed branch, 'what does this shared codebase actually expose right now' has no single, current, authoritative answer that the team can point tools at; every developer re-derives it locally, at their own cost, from their own possibly-stale checkout.

## Non-goals

- **Removing or weakening the local-first path for a developer's own / uncommitted repositories.** — Local-first is a core project principle; the shared server is ADDITIVE for shared, branch-tracked repos. A developer's personal work must still be served by their local daemon with no dependency on a server. [[c1]]
- **Executing, building, or running the shared repositories' code on the server.** — The server is a read-only context index over tracked source, not a build/CI/runtime host; running arbitrary repo code server-side is a security and scope explosion. [[c3]]
- **Writing back to, or mutating, the shared source repositories from the server.** — The server consumes git as a read-only mirror of tracked branches; it is a context service, not a code host or review system.
- **Real-time, per-keystroke freshness of the shared index.** — Shared context is bound to a named branch as of the last re-index trigger, not a live editor buffer; sub-second freshness is a non-goal and conflicts with the branch-agreed semantics. [[c8]]
- **A general multi-tenant SaaS with strong cross-org data-isolation guarantees beyond repo-level access control, in v1.** — v1 targets a team sharing repos on a server they control, with authenticated access control to repos; full tenant isolation is deferred to keep v1 tractable.
- **Reintroducing direct cloud REST for the server's own embeddings or summaries.** — The no-direct-cloud-REST rule holds on the server too: server-side reasoning/embeddings go through the local provider or the CLI wrapper, not a reinstated REST provider. [[c4]]

## Assumptions

- `high` Because the daemon owns all DB access, a shared server needs no distributed database — remote clients query the server process over the network and never open its LMDB/Lance directly, so 'shared reads' are just concurrent RPC into one owner process. [[c2]]
- `med` The existing RPC handler set (analyze / graph / vector search) is transport-agnostic enough to be served over a networked transport without rewriting the query logic itself. [[c8]]
- `high` The indexer's parse → graph → embed pipeline is source-tree-oriented and produces the same index whether pointed at a locally-added directory or a server-managed git checkout of a branch. [[c7]]
- `med` The server can be provisioned with git credentials to clone/fetch the registered repositories and check out the named branch. [[c7]]
- `med` The server runs its own local embedder (Ollama) so shared-repo embeddings are generated server-side, consistent with the embeddings-are-local rule applied at the server process rather than each developer's machine. [[c1]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | Local-first MUST be preserved for personal/uncommitted repositories: the local daemon remains authoritative for a developer's own repos, and the shared server is strictly additive — querying shared context must never become a hard dependency for local work. | [[c1]] |
| `k2` | invariant | Daemon-owns-all-DB-access MUST hold on the server: remote clients query the server daemon over the networked transport and MUST NOT open its LMDB graph or Lance vectors directly. No client-side direct DB access, local or remote. | [[c2]] |
| `k3` | invariant | The server MUST treat shared repositories as READ-ONLY: it indexes tracked branches without executing, building, or writing back to the source. No side effects on the shared codebase. | [[c3]] |
| `k4` | contract | The repo-registry schema change MUST be additive + backward-compatible: existing local-path registrations keep working unchanged; the remote-git-source + tracked-branch + shared/server-ownership fields are optional dimensions on RegisteredRepo, and validateRepoPath's local-directory requirement is relaxed ONLY for the new remote-source kind. | [[c6]] |
| `k5` | contract | Federated queries MUST merge local + remote results into the SAME structured bundle shape clients already consume (structured entity summaries + relations, no raw file dumps), attaching provenance (which daemon / repo / branch / index-revision) rather than introducing a new client result format. | [[c3]] |
| `k6` | invariant | Every shared result MUST be attributable to a specific repository + named branch + index revision — shared context is bound to an agreed, trackable branch, never to ambiguous local working-tree state. | [[c6]] |
| `k7` | invariant | The server's own embeddings / summaries MUST go through the local provider (Ollama) or the CLI wrapper — no direct cloud REST provider may be reintroduced server-side. | [[c4]] |
| `k8` | invariant | The networked transport MUST be authenticated and access-controlled: an unauthenticated or unauthorized client cannot read shared context, and access is scoped per repository. | [[c5]] |

## Stories

### E202607304152d0e8:S001 — Register a git repository and branch as a shared, server-managed repo

**User value:** `size: M`

An admin (or developer) can register a codebase with the server by naming its git source and the branch to track — without having a local checkout — so a shared repo becomes a first-class, branch-bound registry entry that the whole team can later reuse.

**Extends:** [[c6]]

**Acceptance criteria:**

- **ac1:** Given a git repository source and a branch name, and no pre-existing local checkout, when it is registered as a shared server-managed repo, then the registration is accepted and recorded with its remote source + tracked branch + shared/server ownership, rather than rejected for lacking a local directory. _(operationalizes `k4`, `k6`)_
- **ac2:** Given existing local-path repo registrations already in the registry, when the shared-repo registration capability is added, then every existing local registration keeps working exactly as before, with no change to how personal repos are added. _(operationalizes `k4`, `k1`)_

### E202607304152d0e8:S002 — Index a shared repository once, on the server, from its tracked branch

**User value:** `size: L`

The server indexes each shared repo a single time by obtaining the code for the named branch itself, so the whole team gets one grounded graph + vector index of that codebase without anyone re-indexing it locally.

**Depends on:** `s1`

**Extends:** [[c7]]

**Acceptance criteria:**

- **ac1:** Given a registered shared repo naming a git source + branch, when the server indexes it, then it obtains the code from git at that branch and produces the same kind of structured graph + vector index a locally-added repo would, strictly read-only — without building, executing, or writing back to the source. _(operationalizes `k3`, `k6`)_
- **ac2:** Given a registered shared repo the server cannot obtain (unreachable source or missing credentials), when indexing is attempted, then it fails with a clear, attributable status rather than producing a partial or silently-empty index. _(operationalizes `k6`, `k3`)_

### E202607304152d0e8:S003 — Keep a shared repo's index current as its tracked branch advances

**User value:** `size: L`

As the tracked branch moves, the shared index refreshes to the new branch tip, so the team always searches current context and never a stale snapshot — without any developer manually re-indexing.

**Depends on:** `s2`

**Extends:** [[c7]]

**Acceptance criteria:**

- **ac1:** Given a shared repo whose tracked branch has advanced since it was last indexed, when the re-index trigger fires, then the shared index is refreshed to the new branch tip and its index revision is updated so results reflect the current branch state. _(operationalizes `k6`, `k3`)_
- **ac2:** Given a shared index being refreshed, when developers query it during the refresh, then they always see a consistent index revision (the current or the prior one), never a half-updated mix. _(operationalizes `k6`)_

### E202607304152d0e8:S004 — Reach the daemon securely over the network

**User value:** `size: L`

A remote client can invoke the daemon's context-query surface over the network with authentication, so developers not on the server host can use it — while the daemon still owns all database access.

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given the daemon running as a networked server, when a remote client connects with valid credentials, then it can invoke the daemon's query surface; a client without valid credentials is refused. _(operationalizes `k8`, `k2`)_
- **ac2:** Given a remote client querying the server, when it retrieves context, then it does so ONLY through the daemon's networked interface and never opens the server's graph or vector store directly. _(operationalizes `k2`)_

### E202607304152d0e8:S005 — Control who can read which shared repositories

**User value:** `size: L`

The server enforces per-repository access so an authenticated developer sees context only for the shared repos they are authorized for, letting one server safely host repos across teams.

**Depends on:** `s4`, `s1`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given a server hosting several shared repos with per-repo access rules, when an authenticated client queries, then it can read context only for the repos it is authorized for, and repos it is not authorized for do not appear in results. _(operationalizes `k8`)_
- **ac2:** Given an unauthenticated or unauthorized client, when it attempts any shared query, then the request is denied and no shared context is returned. _(operationalizes `k8`)_

### E202607304152d0e8:S006 — Search shared and local context together in one federated query

**User value:** `size: XL`

A developer runs a single analyze / graph / vector search and gets results merged from their own local context AND the shared server's context — each result attributable to its repo, branch, and source — so shared reuse feels like one search, with local-first preserved when the server is away.

**Depends on:** `s2`, `s4`, `s5`

**Extends:** [[c8]]

**Acceptance criteria:**

- **ac1:** Given a developer with a local daemon (personal repos) and access to a shared server, when they run an analyze / graph / vector query, then results from local and remote are merged into the same structured bundle shape they already consume, each entry carrying provenance (which repo / branch / source), with no raw file dumps. _(operationalizes `k5`, `k6`, `k1`)_
- **ac2:** Given the shared server is unreachable, when the developer runs a query, then their local context still answers (local-first preserved) with a clear note that shared results were unavailable, never a hard failure of the whole query. _(operationalizes `k1`)_
- **ac3:** Given a merged federated result, when it is presented, then every shared entry is attributable to a specific repository + named branch + index revision. _(operationalizes `k6`, `k5`)_

## Open questions

- Re-index trigger mechanism (deferred from the topology decisions): as a tracked branch advances, does the server re-index via a git push webhook, a periodic poll/fetch, an explicit API/CLI trigger, or a combination — and how is a re-index de-duplicated/debounced under rapid pushes?
- Concrete networked transport + auth model (settled at HLD): HTTP vs gRPC for the wire protocol, and the auth/identity scheme (bearer/API token, mTLS, or OIDC) — and where per-repo access rules (s5) are stored and administered.
- Server-side git credential model (med-confidence assumption): how the server is provisioned with credentials to clone/fetch private repos (deploy key, PAT, SSH agent, git-credential-helper) and how they are scoped per repo + rotated.
- Query-surface transport-agnosticism (med-confidence assumption): are the existing analyze/graph/vector RPC handlers already transport-agnostic, or does exposing them over the network require refactoring the handler/registry boundary — and does that boundary become a shared contract in the HLD?
- Server-side embedder (med-confidence assumption): does the shared server run its own Ollama embedder to honour the embeddings-are-local rule at the server process, and must a client's embedding model/dim match the server's for federated vector search to be comparable?
- Federation multiplicity + merge semantics: may a developer federate across MORE than one shared server, and how are ranking/scores reconciled + deduplicated when the same entity appears in local + one-or-more remote indexes (esp. for vector-search score comparability)?

## Resolved questions

- `q4b91f91b` — Re-index trigger mechanism (deferred from the topology decisions): as a tracked branch advances, does the server re-index via a git push webhook, a periodic poll/fetch, an explicit API/CLI trigger, or a combination — and how is a re-index de-duplicated/debounced under rapid pushes?
  - **resolved**: Combination: one coalescing queue fed by webhook + poll backstop + explicit trigger — Freshness must not depend on webhook config being present/correct: the periodic fetch backstop guarantees eventual convergence, an optional webhook adds latency, and an explicit API/CLI trigger covers on-demand. All three enqueue one per-repo 're-index the tracked branch' job; dedup is one mechanism (at most one in-flight + one queued successor, coalesced to the latest tip SHA; a job whose resolved tip == current index revision is a no-op), and the new revision publishes atomically so queries see only prior-or-new (S003/ac2). Keeps the index revision pinned to a concrete commit (k6). _(2026-07-30T08:47:08.576Z)_

## Citations

- **[[c1]]** `convention` `CLAUDE.md — Project principles + Key architectural rule #2 (Local-first: Ollama always available, embeddings are local-only)` — "Local-first — Ollama is always available (embeddings are local-only). Cloud LLM access goes through CliProvider; no direct REST."
- **[[c2]]** `convention` `CLAUDE.md — Key architectural rule #1 (Daemon owns all DB access; CLI/MCP/workbench communicate via IPC only)` — "Daemon owns all DB access — CLI, MCP, and the IDE workbench communicate via IPC only. The CLI/MCP/workbench never opens LMDB or LanceDB directly."
- **[[c3]]** `convention` `CLAUDE.md — analyze tools are read-only; No raw file dumps (structured entity summaries + relations)` — "Both analyze tools are read-only. No raw file dumps — context is always structured entity summaries + relations from the graph."
- **[[c4]]** `convention` `CLAUDE.md — Project principle: No direct cloud REST calls from our process (cloud via CliProvider)` — "No direct cloud REST calls from our process. Direct REST providers to Anthropic / OpenAI / Gemini / Mistral must not be reintroduced."
- **[[c5]]** `code` `src/daemon/server.ts — IpcServer (the Unix-socket transport; no networked/authenticated transport exists)` — "IpcServer (class, lines 39-183) is the daemon's only transport — a Unix socket; a search across src/daemon found no networked (TCP/HTTP/WS/gRPC) or auth layer."
- **[[c6]]** `code` `src/db/repos.ts (validateRepoPath:129 / addRepo:153) + src/shared/types.ts (RegisteredRepo:621-641)` — "validateRepoPath hard-requires an existing LOCAL absolute directory; RegisteredRepo has no git-remote-source, branch, or shared-ownership field."
- **[[c7]]** `code` `src/indexer/index.ts — IndexerService (per-repo add + local file-watch + re-index queue)` — "IndexerService does per-repo add + local file-watching (watcher.ts) + a re-index queue; no git clone/fetch or branch-tracking."
- **[[c8]]** `analyze-bundle` `s1 structural-map — daemon transport + registry + storage + indexer (local-first assumptions)` — "The daemon's only transport is the Unix-socket IpcServer; storage is a single-writer local LMDB+Lance substrate; the indexer is source-tree-oriented, not branch/remote-aware."
