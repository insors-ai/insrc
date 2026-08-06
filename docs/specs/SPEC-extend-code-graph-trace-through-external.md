<!-- insrc:artifact SPEC-26c321a52f39c4b7 -->

# Spec: Extend insrc's code graph so it doesn't dead-end at the process boundary.

**Category:** design

## Intent

Extend insrc's code graph so it doesn't dead-end at the process boundary. Today EntityKind is code-only and RelationKind is intra-code, with manifests parsed only for package-level deps. This effort adds external-boundary vocabulary + a static detection/resolution pipeline so dependency-closure (DEPENDS_ON) queries trace across service boundaries. V1 covers three external-boundary classes — HTTP/REST, messaging pub/sub (topics/queues), and typed RPC (gRPC/Thrift) — detected via static call-site analysis plus config resolution, across all 5 tree-sitter-indexed languages (TypeScript, Python, Go, Java, Scala). The graph vocabulary is hybrid: one new ExternalEndpoint EntityKind (protocol property + resolved/unresolved tag) plus per-class RelationKinds (CALLS_HTTP, PUBLISHES_TO, SUBSCRIBES_TO, CALLS_RPC); every call-site target — resolved or not — gets a synthetic ExternalEndpoint node, deduped per-repo (one node per unique resolved target scoped to the calling repo, id derived from repo + target string), with each call-site pointing at it via its own edge. Cross-repo linking is dual-mode: framework-aware static detection finds inbound handlers (HTTP routes, messaging consumers, RPC service impls); each registered repo declares a service identity (service name + base URL/topic namespace), auto-inferred at index time and overridable via per-repo config; outbound-call resolution matches against declared identities (not raw strings) and, on multiple candidates, picks the most-specific one. A confirmed match forms a true cross-repo edge that terminates directly on the target repo's real function/method entity (handler status as a property, no new EntityKind) and participates in the DEPENDS_ON transitive closure; matching runs event-driven on repo registration/re-index so out-of-order workspace registration eventually resolves. Config resolution for indirect targets draws from a full layered hybrid of sources with a defined precedence.

## Scope boundary

V1 detection is static call-site analysis + config resolution only — explicitly NOT manifest/OpenAPI/AsyncAPI spec ingestion and NOT runtime/trace-based discovery. Boundary classes are limited to HTTP/REST, messaging pub/sub, and typed RPC; raw socket/TCP, direct database connections, and file-based IPC are out of scope for v1. Config resolution sources are a layered hybrid with precedence: deploy-time env (k8s ConfigMaps/Secrets/Deployment env AND Docker — Dockerfile ENV, docker-compose environment/env_file, container env) > .env files > local config-entity default (the user explicitly expanded the deploy-time tier to include Docker alongside k8s during elicitation). Unresolvable targets are never dropped — they still get an ExternalEndpoint node tagged unresolved with the raw expression. Ambiguous cross-repo matches are resolved by specificity-ranked best-match; a genuine tie falls back to ExternalEndpoint-only rather than over-linking the closure. One detail is deliberately deferred to the design/HLD stage: the exact signals that drive the auto-inferred service-identity default (sensible default: manifest package name > k8s Service name > directory-name fallback). This is a multi-story epic (new EntityKind + edges + graph/closure changes + 3 detector families × 5 languages for both outbound calls and inbound handlers + a per-repo service-identity registry + a layered config-resolution engine + event-driven cross-repo backfill).

## Non-goals

- Boundary classes outside HTTP/REST, messaging, and typed RPC (e.g. raw socket/TCP, direct database connections, file-based IPC) are out of scope for v1.
- Manifest/OpenAPI/AsyncAPI spec ingestion and runtime tracing are not detection sources in v1 — detection is static call-site + config resolution only.
- HTTP/REST outbound calls only
- HTTP/REST + pub/sub messaging (topics/queues)
- Fully protocol-agnostic "external target" model
- Manifest/schema-first (OpenAPI/AsyncAPI/proto as source of truth)
- Runtime/trace-based discovery
- Hybrid: static detection as primary, manifest/schema as enrichment when present
- External-node-only: always create a synthetic ExternalEndpoint entity (URL/topic/service name) for the call target; never link across repos even when a match exists
- Cross-repo-only: only create an edge when the target positively resolves to another registered repo's inbound handler (route/consumer/RPC method); unmatched calls are dropped, not modeled
- Fully generic — one ExternalEndpoint EntityKind (protocol property: http|messaging|rpc) + one generic CALLS_EXTERNAL RelationKind
- Fully typed — per-class EntityKinds (HttpEndpoint, MessageTopic, RpcService) and per-class RelationKinds (CALLS_HTTP, PUBLISHES_TO, SUBSCRIBES_TO, CALLS_RPC)
- Node-shape only — one ExternalEndpoint EntityKind + one generic edge kind, with class distinction pushed entirely into properties on both
- Convention-based path/topic matching
- Manual inbound-boundary declarations
- Skip unresolved call-sites
- Best-effort partial resolution
- Surface as a manual-annotation gap
- Raw string matching on the resolved identity (URL host+path, topic name, or RPC service.method) against the same string parsed from the target repo's route/consumer/service declarations.
- Explicit cross-repo linking — the user (or a manifest field) declares which repos are expected to call which others; matching only runs within declared pairs.
- Extend `repo.add` IPC with an optional serviceIdentity payload (serviceName, baseUrl, topicNamespace) supplied explicitly at registration time
- Auto-infer identity at index time from manifest + framework signals (package.json name, port from server bootstrap code, route-prefix conventions) with no manual step
- Separate declaration surface: a per-repo config file (e.g. `.insrc/service.json`) authored by the user in the target repo, read at index time, independent of repo.add IPC
- Global dedup by resolved target: one ExternalEndpoint node per unique protocol+target across the entire registry, regardless of which repo(s) call it
- Per-call-site: a new ExternalEndpoint node for every call-site, no dedup at all
- Index-time only
- Query-time resolution
- Existing indexed `config` EntityKind only — whatever insrc's indexer already parses as config files in-repo (e.g. `.json`/`.yaml`/`.toml` config)
- + env files — also parse `.env` / docker-compose env blocks not currently indexed as `config` entities
- + k8s manifests — also resolve against ConfigMaps/Secrets/Deployment env, reusing the existing k8s tool namespace
- New InboundEndpoint EntityKind, symmetric with ExternalEndpoint: the cross-repo edge lands on this new node, which itself has a HANDLED_BY edge into the underlying function/method entity
- Endpoint-to-endpoint only: the cross-repo edge connects the caller's ExternalEndpoint node to a callee-side endpoint-equivalent node, without touching the underlying function/method entity directly
- TypeScript only
- TypeScript + Python
- Language-agnostic core + per-language detector plugins, ship whichever subset lands first
- All matches become edges
- Never auto-resolve ambiguity
- Confidence-scored manual review queue

## Decisions

- **HTTP/REST + messaging + typed RPC (gRPC/Thrift)** — What class of external boundaries is in scope for v1 — this gates everything downstream (detection strategy, node/edge shapes, resolution semantics)?
  - Ruled out: _HTTP/REST outbound calls only_, _HTTP/REST + pub/sub messaging (topics/queues)_, _Fully protocol-agnostic "external target" model_
- **Static call-site detection + config resolution** — How should insrc detect and resolve outbound external calls (HTTP/REST, messaging, typed RPC) to build these new edges?
  - Ruled out: _Manifest/schema-first (OpenAPI/AsyncAPI/proto as source of truth)_, _Runtime/trace-based discovery_, _Hybrid: static detection as primary, manifest/schema as enrichment when present_
- **Dual mode (recommended): always create the ExternalEndpoint node for the call target regardless of match; additionally form a genuine cross-repo edge into the resolved entity when it matches another registered repo's inbound handler, and that edge participates in DEPENDS_ON closure** — CLAUDE.md rule 3 (dependency-closure scoping) says graph searches span only the transitive DEPENDS_ON closure of the active repo — this decision determines whether new external edges ever become part of that closure, or stay a same-repo annotation.
  - Ruled out: _External-node-only: always create a synthetic ExternalEndpoint entity (URL/topic/service name) for the call target; never link across repos even when a match exists_, _Cross-repo-only: only create an edge when the target positively resolves to another registered repo's inbound handler (route/consumer/RPC method); unmatched calls are dropped, not modeled_
- **Hybrid: one ExternalEndpoint EntityKind (protocol property) + per-class RelationKinds (CALLS_HTTP, PUBLISHES_TO, SUBSCRIBES_TO, CALLS_RPC)** — What new EntityKind/RelationKind vocabulary should represent these three boundary classes in the graph?
  - Ruled out: _Fully generic — one ExternalEndpoint EntityKind (protocol property: http|messaging|rpc) + one generic CALLS_EXTERNAL RelationKind_, _Fully typed — per-class EntityKinds (HttpEndpoint, MessageTopic, RpcService) and per-class RelationKinds (CALLS_HTTP, PUBLISHES_TO, SUBSCRIBES_TO, CALLS_RPC)_, _Node-shape only — one ExternalEndpoint EntityKind + one generic edge kind, with class distinction pushed entirely into properties on both_
- **Framework-aware static handler detection** — The cross-repo edge in decision 3 depends on matching an outbound call target against another registered repo's inbound handler. How should insrc detect those inbound handlers (HTTP routes, messaging consumers, RPC service implementations) so that match can happen?
  - Ruled out: _Convention-based path/topic matching_, _Manual inbound-boundary declarations_
- **Always create the node, tagged resolved/unresolved (recommended)** — Builds directly on decision 3 (dual-mode: always create the ExternalEndpoint node for the call target regardless of match) — this decision extends that same 'always create, never drop' posture to the harder case where even the target value itself can't be statically pinned.
  - Ruled out: _Skip unresolved call-sites_, _Best-effort partial resolution_, _Surface as a manual-annotation gap_
- **Recommended: Per-repo service identity registry — each registered repo declares its own service identity (service name + base URL/topic namespace) once at index/registration time; outbound call resolution matches against that declared identity rather than raw strings.** — Decision 3/5 form a true cross-repo edge when an outbound call target matches another registered repo's inbound handler — but matching *how*? An outbound call resolves to a concrete host/path, topic name, or RPC service+method string; an inbound handler is detected as a route/consumer/service-impl. What's the mechanism that links the two into a match?
  - Ruled out: _Raw string matching on the resolved identity (URL host+path, topic name, or RPC service.method) against the same string parsed from the target repo's route/consumer/service declarations._, _Explicit cross-repo linking — the user (or a manifest field) declares which repos are expected to call which others; matching only runs within declared pairs._
- **Hybrid (recommended): auto-infer a default identity at index time, exposed via per-repo config for manual override when inference is wrong or ambiguous** — Decision 7 introduced a per-repo service identity registry (service name + base URL/topic namespace) that outbound call resolution matches against — but how does a repo actually declare that identity so it exists in the first place?
  - Ruled out: _Extend `repo.add` IPC with an optional serviceIdentity payload (serviceName, baseUrl, topicNamespace) supplied explicitly at registration time_, _Auto-infer identity at index time from manifest + framework signals (package.json name, port from server bootstrap code, route-prefix conventions) with no manual step_, _Separate declaration surface: a per-repo config file (e.g. `.insrc/service.json`) authored by the user in the target repo, read at index time, independent of repo.add IPC_
- **Per-repo dedup (recommended): one ExternalEndpoint node per unique resolved target, scoped to the calling repo (id derived from repo + target string, not per-file) — every call-site in that repo linking to the same target points at the same node via its own CALLS_HTTP/PUBLISHES_TO/etc. edge** — insrc's existing entity IDs are deterministic — SHA256(repo + file + kind + name) — and a real codebase will have many call-sites hitting the same external target (e.g. 12 functions across a repo all calling the same payments API host+path). When multiple call-sites resolve to the same target (same host+path, topic, or RPC service+method), should insrc create one shared ExternalEndpoint node or a separate node per call-site?
  - Ruled out: _Global dedup by resolved target: one ExternalEndpoint node per unique protocol+target across the entire registry, regardless of which repo(s) call it_, _Per-call-site: a new ExternalEndpoint node for every call-site, no dedup at all_
- **Event-driven backfill on repo registration/re-index (recommended)** — Cross-repo matching (decision 7) depends on the target repo being registered and carrying a declared service identity (decision 8). Repos in a workspace get registered and indexed independently and out of order — a call-site might index before its target repo is ever registered. When should insrc (re-)attempt the cross-repo match?
  - Ruled out: _Index-time only_, _Query-time resolution_
- **Full layered hybrid (recommended): `config` entities + env files + k8s manifests, with a defined precedence order (e.g. k8s > env file > local config default) when multiple sources define the same key** — "Config resolution" (decision 2) needs to turn an indirect reference — e.g. a call built from `process.env.PAYMENTS_URL` — into a concrete host/topic/service string insrc can match. Decision 6 already says unresolvable targets get tagged "unresolved" rather than blocking indexing, but that tag's accuracy depends entirely on how many real sources resolution actually checks. What sources should config resolution draw from? [USER REFINEMENT during elicitation: the deploy-time tier must ALSO include Docker sources (Dockerfile ENV, docker-compose environment/env_file, container runtime env), not only k8s — deploy-time = k8s OR docker.]
  - Ruled out: _Existing indexed `config` EntityKind only — whatever insrc's indexer already parses as config files in-repo (e.g. `.json`/`.yaml`/`.toml` config)_, _+ env files — also parse `.env` / docker-compose env blocks not currently indexed as `config` entities_, _+ k8s manifests — also resolve against ConfigMaps/Secrets/Deployment env, reusing the existing k8s tool namespace_
- **Direct-to-code-entity: the cross-repo edge terminates on the target repo's real function/method entity (already indexed); handler status is recorded as a property on that entity, no new EntityKind** — Decision 3 said a matched cross-repo call always forms a genuine edge into the resolved target repo's inbound handler — but land on what, exactly? An outbound call-site already gets a synthetic ExternalEndpoint node regardless of match (decision 6); the open question is what graph object sits on the callee side once a match is confirmed, since that's what the cross-repo edge actually terminates on and what every DEPENDS_ON closure walk crosses through.
  - Ruled out: _New InboundEndpoint EntityKind, symmetric with ExternalEndpoint: the cross-repo edge lands on this new node, which itself has a HANDLED_BY edge into the underlying function/method entity_, _Endpoint-to-endpoint only: the cross-repo edge connects the caller's ExternalEndpoint node to a callee-side endpoint-equivalent node, without touching the underlying function/method entity directly_
- **All 5 indexed languages (TS, Python, Go, Java, Scala) in v1** — Static call-site detection and framework-aware inbound-handler detection (decisions 2 and 5) both depend on per-language parsing. insrc's indexer supports 5 languages via tree-sitter (TypeScript, Python, Go, Java, Scala), but building outbound-call-site detectors and inbound-handler detectors for every HTTP/messaging/RPC framework in all 5 languages simultaneously is a large first slice. What language coverage should v1 ship with?
  - Ruled out: _TypeScript only_, _TypeScript + Python_, _Language-agnostic core + per-language detector plugins, ship whichever subset lands first_
- **Specificity-ranked best match (recommended)** — Direct consequence of decisions 7–8 (identity-based matching): declared identities can overlap or be under-specified, and no prior decision says how insrc breaks a tie.
  - Ruled out: _All matches become edges_, _Never auto-resolve ambiguity_, _Confidence-scored manual review queue_

## Citations

- **[[c1]]** `step-output` `s1` — "Confirmed brainstorm elicitation (s1): 14 recorded design decisions converging the external-service graph-tracing spec (boundary scope, static detection + layered config resolution, ExternalEndpoint v"
- **[[c2]]** `convention` `CLAUDE.md rule 3 — dependency-closure scoping (graph searches span only the transitive DEPENDS_ON closure of the active repo)` — "Whether new external-service edges join the DEPENDS_ON closure (decision 3, dual mode) is governed by this rule; the confirmed spec has cross-repo edges participate in that closure."
