<!-- insrc:artifact DEF-914cbf5ea9026b92 -->

# Epic: insrc's code graph stops at the process boundary.

**Flavor:** new-capability
**Seeded from:** `SPEC-26c321a52f39c4b7`

## Problem

insrc's code graph stops at the process boundary. Every dependency it can represent lives inside a single codebase: which functions call which, which modules import which, which repos depend on which by package. But a modern service's most consequential dependencies are the ones it reaches over the network — the other services it calls over HTTP, the topics and queues it publishes to and consumes from, the typed-RPC methods it invokes — and none of these are visible in the graph at all. A call site that hands work to another service looks, in the graph, like a call into nothing: the target, the fact that a dependency exists there, and (when the callee is itself an indexed codebase) the actual handler on the other side are all absent. As a result, dependency-closure reasoning — the mechanism that scopes what the system can see and answer about a repo — dead-ends at the edge of one process, even in a workspace where both the caller and the service it depends on are indexed side by side. Anyone asking 'what does this service actually depend on', 'who calls this endpoint', or 'what breaks if this handler changes' gets an answer that is silently truncated at the network boundary, and there is no signal that the truncation happened. The gap spans every language the system indexes and every common inter-service coupling style, and it is widest exactly where cross-service blast radius matters most.

## Non-goals

- **Model external boundaries other than HTTP/REST, messaging pub/sub, and typed RPC — raw socket/TCP, direct database connections, and file-based IPC are out of scope for v1.** — These couple far less commonly across service boundaries and each needs its own detection model; scoping to the three dominant inter-service styles keeps v1 tractable and lets those land before rarer forms are attempted.
- **Ingest service-contract specifications (OpenAPI / AsyncAPI / proto IDL) or use runtime/trace/APM data as detection sources.** — Spec files are frequently absent or stale and runtime tracing needs live infrastructure the system does not have; detection stays consistent with insrc's at-rest, local-first static-analysis model (static call-site + config resolution only).
- **Drop, defer to manual annotation, or partially-resolve a call whose target cannot be statically pinned.** — Silently dropping real outbound dependencies undermines the accuracy-first principle; the settled decision is to always create the node and tag it resolved/unresolved so no dependency is ever invisible.
- **Introduce a separate callee-side endpoint node (a new InboundEndpoint kind or endpoint-to-endpoint linking) for the cross-repo edge to terminate on.** — A confirmed cross-repo match should land directly on the target repo's real function/method entity so closure walks reach handling code in one hop; an intermediary node adds a kind and an extra hop for no gain.
- **Match outbound targets to callee repos by raw URL/topic string comparison, or by user-declared repo-to-repo link tables.** — Raw strings break on env-specific hosts/ports/path-templating and manual link tables do not scale or auto-discover; matching is against a per-repo declared service identity instead.
- **Deduplicate ExternalEndpoint nodes globally across the whole registry, or create a distinct node per call-site.** — Global dedup breaks the repo-scoped deterministic-id convention and invites concurrent-index write contention; per-call-site nodes are noisy — per-repo dedup fits the existing id model and still shows fan-in within a repo.

## Assumptions

- `high` The graph vocabulary is code-only today — EntityKind covers only code/doc/config entities and RelationKind is intra-code — so representing external boundaries requires net-new node and edge vocabulary rather than reusing an existing kind. [[c1]]
- `high` The indexer parses manifests only for package-level dependencies and has no mechanism to resolve a configured service URL/topic or read .env/k8s/docker deploy-time environment, so config resolution is new construction. [[c2]]
- `high` No endpoint/route/messaging/RPC/inbound/outbound notion exists anywhere in the indexer or graph layer today, confirming this is a new capability and not an extension of an existing one. [[c3]]
- `high` Entity IDs are deterministic SHA256(repo+file+kind+name), which the per-repo ExternalEndpoint dedup can reuse to key one node per unique resolved target within a repo. [[c1]]
- `med` The five indexed languages (TypeScript, Python, Go, Java, Scala) each parse via tree-sitter, so per-language outbound and inbound detectors attach to the existing per-language parsing harness. [[c2]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | convention | Graph searches span only the transitive DEPENDS_ON closure of the active repo; any new cross-repo external-service edge must participate in that closure to be reachable, and must not be introduced as an out-of-closure annotation that queries never see. | [[c4]] |
| `k2` | invariant | Entity IDs are deterministic — SHA256(repo + file + kind + name), hex-32; new ExternalEndpoint nodes must derive their id deterministically (repo + resolved target) so re-indexing is stable and per-repo dedup holds. | [[c1]] |
| `k3` | convention | The daemon owns all DB/graph access; detection, resolution, service-identity storage, and cross-repo matching run inside the daemon/indexer — the CLI, MCP, and workbench never open the graph directly. | [[c4]] |
| `k4` | contract | Workspace registry membership is established exclusively via the repo.add IPC; the service-identity registry and any cross-repo backfill key off registered repos only and never auto-allocate registry rows for unregistered targets. | [[c4]] |
| `k5` | stakeholder | Accuracy is primary and cost is least priority: unresolved targets are never dropped (always create the node, tagged unresolved), and ambiguous cross-repo matches fall back to endpoint-only rather than over-linking the closure with a wrong edge. | [[c5]] |
| `k6` | stakeholder | Detection is static and at-rest only — no OpenAPI/AsyncAPI/proto spec ingestion and no runtime/trace-based discovery are permitted as v1 detection sources; resolution draws only from indexed config entities + .env + k8s + docker deploy-time env with a defined precedence. | [[c5]] |

## Stories

### E20260806914cbf5e:S001 — Represent an external-service dependency as a first-class part of the graph

**User value:** `size: L`

The code graph gains the vocabulary to hold a service's outbound external-service dependencies — the target of an outbound call and the typed relationship from the calling code to it — so that everything built afterward has a place to record what a service reaches over the network, and those relationships are reachable by the same dependency-closure queries that scope every graph answer today.

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given a repo whose code makes an outbound call to an external service, when the repo is indexed, then the graph contains a first-class external-endpoint node standing for the call target, and a typed boundary relationship from the calling code entity to that node, distinguishable by the class of boundary (HTTP call, publish, subscribe, or RPC call). _(operationalizes `k2`)_
- **ac2:** Given an external-endpoint node and its boundary relationship exist for a repo, when a dependency-closure query is run from that repo, then the external-service relationship is traversable within the repo's dependency closure rather than being an out-of-closure annotation the query never sees. _(operationalizes `k1`)_

### E20260806914cbf5e:S002 — Turn a configured or indirect call target into a concrete service identity

**User value:** `size: L`

A call whose destination is not a literal string — it is built from an environment variable, a configuration value, or a deploy-time setting — is resolved to the concrete host, topic, or service it actually reaches, drawing on the layered sources where those values really live; and a target that genuinely cannot be pinned is preserved rather than lost, so recall stays high without inventing a false destination.

**Acceptance criteria:**

- **ac1:** Given an outbound call target built from an indirect reference whose value is defined in in-repo config, a .env file, a Docker source (Dockerfile/compose/container env), or a k8s manifest, when the target is resolved, then it yields the concrete host/topic/service identity, and when more than one source defines the same key the layered precedence (deploy-time k8s or docker > .env > local config default) decides the winner. _(operationalizes `k6`)_
- **ac2:** Given an outbound call target that cannot be fully pinned from any available source, when resolution runs, then the target is still recorded as an external-endpoint node tagged unresolved, carrying its raw expression, and is never dropped. _(operationalizes `k5`)_

**Local constraints:**

- `lc1` (stakeholder) Config resolution draws ONLY from indexed config entities + .env files + k8s manifests + Docker sources, with the fixed precedence deploy-time (k8s or docker) > .env > local config default; no other source (and no runtime value) participates. [[c5]]

### E20260806914cbf5e:S003 — See a service's outbound HTTP/REST dependencies in the graph

**User value:** `size: L`

When a service calls other services over HTTP/REST — in any of the five indexed languages — those calls and the endpoints they reach become visible in its graph, so 'what does this service call over HTTP' has a grounded answer instead of dead-ending at the client call.

**Depends on:** `s1`, `s2`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given a repo that issues HTTP/REST calls to external services in any of TypeScript, Python, Go, Java, or Scala, when the repo is indexed, then each distinct resolved HTTP target is one external-endpoint node in that repo and every call-site linking to it carries its own HTTP boundary relationship to that node. _(operationalizes `k2`)_
- **ac2:** Given several call-sites in one repo that reach the same HTTP target, when the repo is indexed, then they share a single per-repo external-endpoint node for that target rather than producing a separate node each, and a different repo calling the same target gets its own node. _(operationalizes `k2`)_

### E20260806914cbf5e:S004 — See a service's outbound messaging (publish/subscribe) dependencies in the graph

**User value:** `size: M`

When a service publishes to or consumes from messaging topics/queues — in any of the five indexed languages — those pub/sub couplings appear in its graph as distinct publish and subscribe relationships to the topic it targets, so message-driven dependencies are no longer invisible.

**Depends on:** `s1`, `s2`

**Acceptance criteria:**

- **ac1:** Given a repo that publishes to or subscribes from messaging topics/queues in any of the five indexed languages, when the repo is indexed, then each distinct resolved topic/queue target is a per-repo external-endpoint node, and the call-site links to it via a publish or a subscribe boundary relationship according to the direction of the coupling. _(operationalizes `k2`)_
- **ac2:** Given a messaging target whose topic/queue name is built from configuration, when the repo is indexed, then the target is resolved through the same layered resolution and, when it cannot be pinned, is still recorded as an unresolved endpoint rather than dropped. _(operationalizes `k5`)_

### E20260806914cbf5e:S005 — See a service's outbound typed-RPC dependencies in the graph

**User value:** `size: M`

When a service invokes another over typed RPC (gRPC/Thrift) — in any of the five indexed languages — those invocations appear in its graph as RPC boundary relationships to the service+method they call, so typed-RPC coupling is represented alongside HTTP and messaging.

**Depends on:** `s1`, `s2`

**Acceptance criteria:**

- **ac1:** Given a repo that invokes typed-RPC (gRPC/Thrift) methods on external services in any of the five indexed languages, when the repo is indexed, then each distinct resolved RPC service+method target is a per-repo external-endpoint node and the call-site links to it via an RPC boundary relationship. _(operationalizes `k2`)_

### E20260806914cbf5e:S006 — Recognize a repo's inbound service handlers

**User value:** `size: L`

A repo that serves requests — exposing HTTP routes, consuming messages, or implementing RPC service methods — has those handling entry-points recognized and marked in its graph, so the system knows what a service accepts, which is the callee half of any cross-service link.

**Depends on:** `s1`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given a repo that defines HTTP routes, messaging consumers, or RPC service implementations in any of the five indexed languages, when the repo is indexed, then each such entry-point is recognized statically and its underlying function/method entity is marked as an inbound handler of the corresponding class (route, consumer, or RPC method). _(operationalizes `k6`)_
- **ac2:** Given a framework whose handler style is not among those the detectors recognize, when the repo is indexed, then indexing still completes normally and the unrecognized handlers are simply left unmarked rather than causing a failure. _(operationalizes `k5`)_

### E20260806914cbf5e:S007 — Give each registered repo a service identity to be matched against

**User value:** `size: M`

Each registered repo carries a declared identity for itself as a service — its service name and its base URL / topic namespace — defaulted automatically at index time and correctable by the operator, so cross-service matching can key off a stable, env-independent notion of 'which service this repo is' instead of brittle raw strings.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a registered repo, when it is indexed, then it carries a service identity (service name plus base URL / topic namespace) that was auto-inferred without any manual step. _(operationalizes `k4`)_
- **ac2:** Given a repo whose auto-inferred identity is wrong or ambiguous (for example a monorepo hosting several services), when the operator supplies a per-repo identity override, then the override takes precedence over the inferred default for all subsequent matching. _(operationalizes `k4`)_

### E20260806914cbf5e:S008 — Link an outbound call to the actual service that handles it, across repos

**User value:** `size: L`

When a service's outbound call resolves to another registered repo whose declared identity owns a matching inbound handler, the graph forms a real cross-service dependency edge that lands on the handling code itself and joins the dependency closure — so 'what does this service depend on' and 'what breaks if this handler changes' finally reach across the process boundary; and when the destination is ambiguous the system stays conservative rather than inventing a wrong link.

**Depends on:** `s3`, `s4`, `s5`, `s6`, `s7`

**Acceptance criteria:**

- **ac1:** Given an outbound external-endpoint in one repo whose resolved target matches another registered repo's declared service identity and a corresponding inbound handler there, when matching runs, then a cross-repo dependency edge is formed that terminates directly on the target repo's real handler function/method entity and participates in the dependency-closure traversal from the calling repo. _(operationalizes `k1`)_
- **ac2:** Given a resolved target that plausibly matches more than one registered repo's declared identity, when matching runs, then the most specific identity wins the single edge, and a genuine tie forms no cross-repo edge at all — the endpoint stays endpoint-only rather than linking to several possibly-wrong repos. _(operationalizes `k5`)_

**Local constraints:**

- `lc1` (invariant) Cross-repo matching is against declared per-repo service identities only (never raw URL/topic strings and never user-declared repo-to-repo link tables), and forms at most one edge — the specificity-ranked best match, with ties resolving to endpoint-only. [[c5]]

### E20260806914cbf5e:S009 — Resolve cross-service links even when repos are registered out of order

**User value:** `size: M`

A caller indexed before the service it depends on is ever registered does not stay permanently disconnected: when that target repo is later registered or re-indexed, the previously-unmatched outbound endpoints are retroactively upgraded to real cross-repo edges, so a growing workspace converges to a complete cross-service dependency picture without anyone manually re-indexing the caller.

**Depends on:** `s8`

**Acceptance criteria:**

- **ac1:** Given a repo whose outbound endpoints could not be matched because their target repo was not yet registered, when that target repo is later registered or re-indexed and carries a matching service identity + inbound handler, then the previously-unmatched endpoints are retroactively re-evaluated and upgraded to cross-repo edges that join the closure, with no manual re-index of the calling repo required. _(operationalizes `k4`, `k1`)_
- **ac2:** Given a target repo is removed from the registry or its identity changes so a prior match no longer holds, when the triggering registry/re-index event is processed, then the affected cross-repo edges are revised so the graph never retains a cross-repo edge to a target that no longer matches. _(operationalizes `k4`)_

## Citations

- **[[c1]]** `code` `src/shared/types.ts — EntityKind (:515) + RelationKind (:529) + deterministic entity-id convention` — "EntityKind is a code-only union (repo/file/module/function/method/class/interface/type/variable/document/section/config); RelationKind is intra-code (DEFINES/IMPORTS/CALLS/INHERITS/IMPLEMENTS/DEPENDS_"
- **[[c2]]** `code` `src/indexer (parser/, resolver.ts, manifest.ts, watcher.ts) — tree-sitter indexer + package-manifest parsing` — "manifest.ts parses only package-dependency manifests (package.json/go.mod/pyproject.toml/pom.xml/build.sbt); no service-URL/topic resolution, no .env/k8s/docker env reading, no outbound/inbound detect"
- **[[c3]]** `analyze-bundle` `s1 capability.probe — external-service notion absent across src/indexer + src/db/graph` — "text search for endpoint|route|http client|kafka|rabbit|topic|external service|inbound|outbound|openapi|asyncapi returned no matching non-test source — the external-service dimension is entirely absen"
- **[[c4]]** `convention` `CLAUDE.md key architectural rules — rule 3 (dependency-closure scoping), rule 1 (daemon owns DB access), rule 6 (repo registry contract)` — "Graph searches span only the transitive DEPENDS_ON closure of the active repo; the daemon owns all DB access via IPC; workspace registry membership is established exclusively via repo.add."
- **[[c5]]** `prior-artifact` `Approved SpecArtifact 26c321a52f39c4b7 (brainstorm) — 14 recorded decisions + non-goals` — "Dual-mode always-create-node + cross-repo edge in the DEPENDS_ON closure; unresolved targets tagged not dropped; specificity-ranked tie-break; static call-site + layered config resolution (config + .e"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-08-06T15:52:54.411Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1/assumption-1 | citation | LOW | auto | EntityKind in src/shared/types.ts is a code-only union (repo/file/module/function/method/class/interface/type/variable/document/section/config) with no external-endpoint/service kind. | grep confirms `export type EntityKind` in src/shared/types.ts ending in `'config';` — the code-only union with no external-endpoint kind, as the assumption states. | None — citation verified. |
| c1/k1 | citation | LOW | auto | RelationKind in src/shared/types.ts is intra-code (DEFINES/IMPORTS/CALLS/INHERITS/IMPLEMENTS/DEPENDS_ON/EXPORTS/REFERENCES) with no outbound-call / pub-sub / RPC edge kind. | grep confirms `export type RelationKind` with `'DEPENDS_ON'` and `'REFERENCES'` present — the intra-code edge union; no outbound/pub-sub/RPC edge kind exists. | None — citation verified. |
| c1/k2 | citation | LOW | auto | The deterministic entity-id convention SHA256(repo+file+kind+name) hex-32 is documented on the Entity type in src/shared/types.ts. | grep confirms the deterministic id convention `SHA256(repo + file + kind + name)` + `hex-32` documented on Entity in src/shared/types.ts — the id model k2 reuses. | None — citation verified. |
| c2/assumption-2 | semantic | LOW | auto | The indexer's manifest parsing covers only package-dependency manifests (package.json/go.mod/pyproject/pom/build.sbt) and has no service-URL/topic or .env/k8s/docker env resolution. | grep confirms `export function parseManifest` in src/indexer/manifest.ts alongside package.json/go.mod handling — manifest parsing is package-dependency-only, so config/env/k8s/docker resolution is genuinely new (assumption 2 holds). | None — semantic premise verified. |
| c3/assumption-3 | closed-union | LOW | auto | No external-service notion (endpoint/route/http-client/messaging/topic/openapi/asyncapi/inbound/outbound) exists in the non-test source of src/indexer or src/db/graph today. | The review grep matched ExternalEndpoint/CALLS_HTTP/PUBLISHES_TO/SUBSCRIBES_TO/CALLS_RPC, but a scoped check (grep -rl over src/) returns ZERO hits — every match is in this session's workflow ARTIFACTS (docs/specs, docs/defines, .insrc/artifacts), not in src/indexer or src/db/graph source. The premise (no external-service notion in the source today) therefore holds; the matches are the spec/DEF/design docs describing the new vocabulary, not a pre-existing implementation. | None — premise verified after excluding self-authored artifacts; the source has no external-service notion. |
| c4/k1 | citation | LOW | auto | The LMDB graph layer exposes a transitive-closure traversal API (transitiveClosure/outNeighbors/inNeighbors) that the DEPENDS_ON-closure scoping relies on. | grep confirms transitiveClosure (33), outNeighbors (50), inNeighbors (28) in the graph layer — the closure-traversal API k1's DEPENDS_ON-closure constraint depends on exists. | None — citation verified. |
| meta/seededFromSpec | cross-artifact | LOW | auto | This DEF is seeded from the approved SpecArtifact SPEC-26c321a52f39c4b7, whose 14 decisions the Epic's constraints/non-goals restate. | The DEF meta records seededFromSpec=26c321a52f39c4b7 and the SPEC json exists at .insrc/artifacts/SPEC-26c321a52f39c4b7.json — the cross-artifact seed trace holds; constraints k5/k6 + non-goals restate that spec's decisions. | None — cross-artifact trace verified. |
