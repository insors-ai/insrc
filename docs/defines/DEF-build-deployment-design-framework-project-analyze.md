<!-- insrc:artifact DEF-753e0ed64921d937 -->

# Epic: insrc has no grounded way to understand how it is deployed today or how it should be deployed as the system grows.

**Flavor:** new-capability

## Problem

insrc has no grounded way to understand how it is deployed today or how it should be deployed as the system grows. The backend currently runs only as a single local daemon process installed by shell scripts, with all persistence embedded inside that one process and no accounting of the project's storage patterns, messaging, or service tiers. There is no discovery of the current deployment state, no mapping of what could be reused versus stood up new, and no structured way to reason about topology, connectivity, security and access controls, or scale and high-availability. Anyone attempting to run insrc beyond a single developer machine — self-hosted containers or orchestration, or a cloud target such as GCP or AWS — has no evidence-backed picture to work from, so deployment decisions are ad hoc, ungrounded, and inconsistent across environments.

## Non-goals

- **Executing or automating actual deployments (provisioning infrastructure, running rollouts, mutating live clusters or cloud accounts).** — The gap is the absence of grounded understanding and design of deployment; execution belongs to the existing k8s/cloud/ssh built-in tool domains and is a separate concern from the design capability this Epic frames.
- **Reintroducing direct cloud REST providers to Anthropic/OpenAI/Gemini/Mistral for any part of deployment reasoning.** — Project principle mandates cloud LLM access stays behind the local claude/codex CLI OAuth sessions; deployment design must not become a reason to bypass that.
- **Redesigning or replacing the existing local single-process daemon-install path.** — The current install script works for the single-developer case; the missing piece is the ability to understand and design broader topologies, not to rework the one deployment that already exists.
- **Owning IDE-fork deployment concerns (VSCode workbench, insrc IDE contributions, the daemon installer that lives in the fork).** — Those surfaces are owned by the insrc-ide repository; this repo's contract with the fork is the IPC surface only, so deployment design here is scoped to the backend.

## Assumptions

- `high` Deployment understanding is expected to be graph-grounded and evidence-backed — structured entity/relation summaries rather than raw file dumps — consistent with how the existing analyze framework produces context. [[c2]]
- `med` Deployment targets in scope are open-ended and may span local self-hosted (Docker/K3s) and cloud (GCP/AWS), since no target exists in-repo today and the current install covers only a single local process. [[c1]]
- `high` The new capability is expected to pattern-match the shape of insrc's existing framework subsystems (analyze, workflow) while remaining a distinct net-new subsystem rather than an extension of either. [[c2]]
- `med` Discovery and any execution surface for deployment reasoning are expected to reuse the existing k8s/cloud/ssh/http built-in tool domains rather than introduce parallel infrastructure access. [[c2]]
- `high` None of the three existing Epics (build stage, plan stage, progress streaming) overlap with deployment design, so this Epic starts from a clean problem space. [[c3]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | Deployment today is a single local daemon process with all persistence (LMDB/LanceDB/DuckDB) embedded in that one process; there are no service tiers, messaging brokers, or multi-node artifacts in-repo. | [[c1]] |
| `k2` | invariant | No Docker, K3s/K8s, or cloud (GCP/AWS) manifests exist in-repo — there is no container/orchestration/topology definition available to extend, so the design starts from bare shell-script install. | [[c1]] |
| `k3` | contract | The IDE fork clones this repo into ~/.insrc/daemon/ and spawns the compiled out/daemon/index.js; the IPC contract (socket path, method names, payload shapes) is the only surface consumed across the two repos and must stay in lock-step. | [[c1]] |
| `k4` | convention | The daemon owns all DB access; CLI, MCP, and the IDE workbench communicate via IPC only — any deployment topology must preserve this single-owner-of-storage rule. | [[c5]] |
| `k5` | convention | Cloud LLM access must go through the local claude/codex CLI subprocesses; no direct cloud REST providers may be introduced by deployment reasoning. | [[c5]] |
| `k6` | convention | The deployment-design capability must remain distinct from, but consistent with, the two existing framework subsystems (analyze and workflow) and should reuse the k8s/cloud/ssh/http built-in tool domains for discovery/execution. | [[c2]] |

## Stories

### E20260721753e0ed6:S001 — Establish deployment design as a distinct, consistent framework surface

**User value:** `size: M`

Anyone already familiar with insrc's analyze and workflow frameworks can reach deployment design through the same shape of interface, so the new capability feels native rather than bolted on.

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given a registered, indexed insrc repo and the existing analyze and workflow frameworks, when a user invokes the deployment-design capability, then it is reached through an interface consistent with those frameworks while remaining a distinct, separately-scoped subsystem. _(operationalizes `k6`)_
- **ac2:** Given the deployment-design capability produces any understanding of deployment, when it returns results to the user, then the output is graph-grounded, structured entity/relation summaries rather than raw file dumps, consistent with how the analyze framework produces context. _(operationalizes `k6`)_

### E20260721753e0ed6:S002 — Discover and report the current deployment state

**User value:** `size: L`

A user planning to run insrc beyond one developer machine starts from an evidence-backed picture of how the backend runs today instead of guessing.

**Depends on:** `s1`

**Extends:** [[c1]] [[c2]]

**Acceptance criteria:**

- **ac1:** Given a registered, indexed insrc repo, when a user requests a current-deployment discovery, then they receive a structured, evidence-backed report describing that the backend runs today as a single local daemon process with persistence embedded in that one process. _(operationalizes `k1`)_
- **ac2:** Given the discovery is characterizing how insrc runs today, when it reports the project's storage patterns, service tiers, and messaging, then it records the persistence present today and notes the absence of service tiers, messaging brokers, or multi-node artifacts where none exist. _(operationalizes `k1`)_
- **ac3:** Given no container, orchestration, or cloud manifests exist in-repo, when discovery reports the available deployment artifacts, then it states plainly that only a local shell-script install exists and that no Docker, K3s, or cloud topology definition is present to extend. _(operationalizes `k2`)_

### E20260721753e0ed6:S003 — Distinguish reusable infrastructure from net-new needs

**User value:** `size: M`

A user can see which existing tooling a broader deployment can lean on versus what must be stood up new, so design effort concentrates on the real gaps.

**Depends on:** `s2`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given a completed current-deployment discovery, when a user requests a reuse-versus-new inventory for a target deployment, then each element of that deployment is classified as reused (already present today) or new (must be introduced), each with grounding. _(operationalizes `k6`)_
- **ac2:** Given the inventory is identifying how deployment discovery and execution would reach infrastructure, when it proposes access surfaces, then it maps those surfaces onto the existing k8s, cloud, ssh, and http built-in tool domains rather than proposing parallel infrastructure-access paths. _(operationalizes `k6`)_

### E20260721753e0ed6:S004 — Design deployment topology and connectivity for a chosen target

**User value:** `size: L`

A user targeting self-hosted containers or orchestration, or a cloud such as GCP or AWS, gets a grounded topology-and-connectivity design instead of ad hoc, inconsistent decisions.

**Depends on:** `s2`, `s3`

**Acceptance criteria:**

- **ac1:** Given a completed discovery and reuse inventory and a chosen deployment target, when a user requests a topology design for that target, then they receive a topology-and-connectivity design covering how components are placed and how they communicate for that target. _(operationalizes `k2`)_
- **ac2:** Given the proposed topology includes storage-bearing components, when the design defines which components may access persistence, then it keeps a single owner of all database access, with every other component reaching storage only over the IPC surface. _(operationalizes `k4`)_
- **ac3:** Given the daemon is spawned through the IDE-fork install contract, when the topology changes where or how the daemon runs, then the design preserves the IPC contract — socket path, method names, and payload shapes — unchanged across the two repos. _(operationalizes `k3`)_

### E20260721753e0ed6:S005 — Design security and access controls for the deployment

**User value:** `size: M`

A user receives an access-control and security-boundary design layered onto the topology, so a broader deployment is not left implicitly open.

**Depends on:** `s4`

**Acceptance criteria:**

- **ac1:** Given a proposed deployment topology, when a user requests a security design for it, then they receive access-control and security-boundary reasoning for the components and connections in that topology, including who may reach the single storage owner. _(operationalizes `k4`)_
- **ac2:** Given the deployment reasons about cloud LLM access, when the security design addresses how providers are reached and authenticated, then it keeps cloud LLM access behind the local claude/codex CLI OAuth sessions and introduces no direct cloud REST provider path. _(operationalizes `k5`)_

### E20260721753e0ed6:S006 — Design the scale and high-availability posture

**User value:** `size: M`

A user can reason about how the deployment scales and stays available as load and nodes grow, grounded in the reality that persistence lives inside one owning process today.

**Depends on:** `s4`

**Acceptance criteria:**

- **ac1:** Given a proposed deployment topology, when a user requests a scale-and-high-availability design, then they receive reasoning on how the deployment scales and how it stays available as demand or node count grows for that topology. _(operationalizes `k1`)_
- **ac2:** Given persistence is embedded inside a single owning process today, when the high-availability design proposes redundancy or additional nodes, then it accounts for the single-owner-of-storage rule rather than assuming shared multi-writer storage. _(operationalizes `k4`)_

## Citations

- **[[c1]]** `analyze-bundle` `code: Current deployment / build / runtime layout of the insrc backend` — "Deployment today is a local, single-process daemon install ... The graph-grounded structure contains no Docker, K3s/K8s, or cloud (GCP/AWS) manifests — there is no container/orchestration/topology def"
- **[[c2]]** `analyze-bundle` `code: Existing insrc frameworks and reusable infra tooling vs a deployment-design capability` — "insrc already ships two comparable framework subsystems ... the analyze framework and the workflow framework ... Built-in tool domains under src/daemon/tools/builtins/ include k8s, cloud, ssh, and htt"
- **[[c3]]** `prior-artifact` `185807ba9a6b35d3 add-build-workflow-insrc-5th-stage` — "Build stage — turning approved Tasks into working code under a gate; no overlap with deployment topology/infra."
- **[[c4]]** `prior-artifact` `1cd9a4c34f403a80 add-plan-workflow-insrc-framework-4th` — "Plan stage — breaking a Story design into an ordered task list; unrelated to deployment design."
- **[[c5]]** `convention` `CLAUDE.md — project principles + key architectural rules` — "No direct cloud REST calls from our process ... Daemon owns all DB access — CLI, MCP, and the IDE workbench communicate via IPC only."
- **[[c6]]** `code` `scripts/insrc-daemon-install.sh` — "Current 'deployment' is a local daemon install script; no Docker/K3s/cloud topology manifests exist in-repo."

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — define (define)

**0 HIGH · 7 MED · 5 LOW** · model `claude` · reviewed 2026-07-21T15:05:36.865Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| k1 | closed-union | MED | assisted | There are no service tiers, messaging brokers, or multi-node artifacts in-repo — persistence is embedded in one process only. | The closed-union claim "no ... messaging brokers ... in-repo" is factually open against the gathered grep. In-repo broker/KV client drivers exist: `src/daemon/db/drivers/nats.ts:2` ("NATS JetStream KV driver (kind: `nats`)") importing `@nats-io/transport-node` (nats.ts:10) and `@nats-io/kv` (nats.ts:12); `src/daemon/db/drivers/redis.ts:2` ("Redis driver (kind: `redis`)... Covers redis / valkey / keydb", redis.ts:4) importing `ioredis` (redis.ts:13); both registered in `src/daemon/db/drivers/index.ts:24,27`. So NATS (a messaging broker) and Redis service-tier clients ARE present in-repo — the union is not closed. HOWEVER, per CLAUDE.md these are the data-driver `db_file_*` tools (client connectors to the USER's external data sources), not the daemon's OWN persistence. The daemon's persistence remains LMDB + Lance + DuckDB embedded in one process, so the load-bearing conclusion ("persistence is embedded in one process only") still holds. The `/broker\|message.?queue\|pubsub/` grep returned only one incidental match (`chat-sessions.ts:16`, an in-memory injected-message queue), confirming no broker runs the daemon itself. | Reword the premise to scope the single-process claim to the DAEMON'S OWN persistence (LMDB + Lance + DuckDB) and acknowledge the in-repo external-source client drivers (redis/valkey/keydb, nats JetStream) as data-driver tools, so the "no messaging brokers in-repo" absolute is not stated as a closed union. The prescribed architectural conclusion (embedded single-process persistence, no multi-node daemon) is sound; only the exhaustiveness framing is imprecise. |
| k4 | citation | MED | manual | The daemon owns all DB access; CLI, MCP, and the IDE workbench communicate via IPC only (single-owner-of-storage rule). | The premise is a citation to CLAUDE.md asserting the "daemon owns all DB access; CLI/MCP/IDE workbench communicate via IPC only" rule. Both re-grounding probes came back empty: grep /Daemon owns all DB access/ → 0 matches, grep /communicate via IPC only/ → 0 matches. The only successful read is CLAUDE.md:1 → "# CLAUDE.md — insrc backend", i.e. the title line, which does not address the claim. So the handed evidence neither confirms nor contradicts the premise — the probes failed to re-locate the cited rule text (likely a phrasing/markdown-formatting mismatch against the actual bolded rule, e.g. "**Daemon owns all DB access**"), rather than the rule being absent. | Re-anchor the citation with grep patterns that match the artifact's actual rule text (e.g. the bolded "Daemon owns all DB access" list item under "## Key architectural rules") so the probe resolves. No change to the premise text is warranted — it describes a genuine documented rule; only the re-grounding query needs fixing before this can be promoted to verified-sound. |
| k6 | inventory | MED | manual | insrc ships exactly two comparable framework subsystems today: analyze and workflow. | The premise claims "exactly two comparable framework subsystems: analyze and workflow." The gathered evidence does not address this count claim. Both directory probes returned nothing usable — `grep /^src/analyze//` → 0 matches and `grep /^src/workflow//` → 0 matches — but these are malformed regex probes (stray `/` delimiters), not credible evidence that the directories are absent. The only successful read is `CLAUDE.md:1 → "# CLAUDE.md — insrc backend"`, which confirms nothing about how many framework subsystems ship or whether they are limited to exactly two. No enumeration of `src/` was captured to confirm or refute exclusivity. | Re-run the probes with correct patterns (e.g. a directory listing of `src/` or ripgrep for `Framework` subsystem markers) to actually verify the "exactly two" exclusivity claim. As currently gathered, the evidence neither confirms the count nor identifies analyze/workflow as the members — the premise is unverifiable against it. |
| k6 | inventory | MED | manual | Built-in tool domains under src/daemon/tools/builtins/ include k8s, cloud, ssh, and http. | Both gathered probes returned zero matches: `grep /builtins/(k8s\|cloud\|ssh\|http)/` → 0 matches, and `grep /(?i)\\b(k8s\|cloud\|ssh\|http)\\b.*tool/` → 0 matches. Nothing in the handed evidence confirms or contradicts that k8s/cloud/ssh/http exist as tool domains under src/daemon/tools/builtins/. The path-shaped probe would only hit if those domains were literal subdirectory segments in a matched path, and the second probe assumes a `...tool` co-occurrence on one line; neither firing tells us whether the domains exist or merely that these probes were mis-shaped for the actual layout. The premise is therefore unverifiable from this evidence. | Re-run a probe that actually enumerates the builtins layout (e.g. list directory entries / files under src/daemon/tools/builtins/) rather than the two co-occurrence greps, which returned nothing and cannot confirm or refute the domain inventory. No artifact edit is warranted since the evidence neither supports nor overturns the listed domains. |
| c3 | cross-artifact | MED | manual | Prior artifact 185807ba9a6b35d3 (add-build-workflow-insrc-5th-stage) is the build-stage Epic and does not overlap with deployment topology/infra. | The premise makes a claim about the CONTENT of a sibling workflow artifact (185807ba9a6b35d3 = "add-build-workflow-insrc-5th-stage" being a build-stage Epic that does not overlap deployment topology/infra). The gathered probes only searched the source tree. `grep /185807ba9a6b35d3/` returned 2 matches, both incidental fixtures — `src/workflow/__tests__/id-resolve.test.ts:34` (`const EPIC_HASH = '185807ba9a6b35d3';`) and `src/workflow/id.ts:34` (a docstring example `epicHash '185807ba9a6b35d3'`). Neither is the artifact itself nor says anything about build vs. deployment scope. `grep /add-build-workflow/` returned 0 matches. So the evidence neither confirms nor contradicts the overlap claim — it is silent on the artifact's actual topic. | Verify the non-overlap claim against the actual prior artifact record (the workflow store entry for 185807ba9a6b35d3), not the source tree — a ripgrep probe over `src/` cannot ground a cross-artifact scope assertion. Confirm from that artifact's Epic definition that its scope is the build stage and excludes deployment topology/infra before relying on c3. |
| c4 | cross-artifact | MED | manual | Prior artifact 1cd9a4c34f403a80 (add-plan-workflow-insrc-framework-4th) is the plan-stage Epic and is unrelated to deployment design. | Both probes returned nothing against the source tree: grep /1cd9a4c34f403a80/ → 0 matches and grep /add-plan-workflow/ → 0 matches. Neither the artifact hash nor the slug appears anywhere in the actual source, so the evidence handed over does not address — and cannot confirm or contradict — the claim that prior artifact 1cd9a4c34f403a80 is the plan-stage Epic or that it is unrelated to deployment design. This is expected for a cross-artifact reference (a sibling workflow artifact ID would not live in the source tree), which is precisely why the gathered evidence is non-probative here. | Unverifiable from the gathered source-tree evidence. To verify, resolve the referent against the workflow artifact store (not the source tree) — confirm artifact 1cd9a4c34f403a80 exists, is stage=plan / kind=Epic, and has no deployment-design coupling. No safe evidence-derived edit is possible since the probes returned nothing to correct against. |
| a5 | inventory | MED | manual | There are exactly three existing Epics (build stage, plan stage, progress streaming), none of which overlap with deployment design. | The three probes chosen to ground this inventory claim all come up empty against the source tree. Epic hash `185807ba9a6b35d3` has 2 matches, but both are non-substantive: `src/workflow/id.ts:34` is a doc-comment example line (`*   epicHash  '185807ba9a6b35d3'`) and `src/workflow/__tests__/id-resolve.test.ts:34` is a test fixture constant — neither is an actual Epic artifact/definition. Epic hash `1cd9a4c34f403a80` → 0 matches. `progress.?streaming` → 0 matches. Nothing in the evidence confirms the existence of three Epics, their identities (build/plan/progress-streaming stages), or non-overlap with deployment design. This is expected — Epics live in the daemon's LMDB graph/tracker storage, not in the source tree — so a ripgrep over source cannot verify or refute this inventory. The premise is therefore UNVERIFIABLE from the gathered evidence, not confirmed. | Re-ground this inventory against the actual Epic store (daemon tracker/graph state) rather than source-tree grep — e.g. list the registered Epics via the workflow tracker IPC — and confirm both the count of three and the "no deployment overlap" claim there. The source probes provided cannot establish either fact; the lone hash hit is only a doc-comment/test example. Do not treat the premise as verified until a probe against real Epic storage returns the three named Epics. |
| k1 | semantic | LOW | manual | Deployment today embeds all persistence — LMDB, LanceDB, and DuckDB — inside the single local daemon process. | The gathered grep confirms all three engines are compiled/imported in-process within the daemon's own source tree — the single-process embedding the premise asserts. LMDB: `src/db/graph/store.ts:10` ("Substrate: lmdb-js 3.5.4"), plus 16 more matches under `src/db/`. LanceDB: `src/db/lance/conn.ts:56` (`getLanceConn`), `src/db/lance/entity-vec.ts:41`, and 42 more `@lancedb/lancedb` imports under `src/db/lance/`. DuckDB: `src/daemon/db/duckdb-pool.ts:39` (`import { DuckDBInstance } from '@duckdb/node-api'`), wired into daemon lifecycle at `src/daemon/index.ts:65` (`import { closeDuckDB }`). No evidence of any out-of-process persistence tier — every DB dependency resolves inside `src/db/` or `src/daemon/db/`. One imprecision only: per CLAUDE.md, DuckDB is an in-memory query engine backing the `db_file_*` data drivers, not a persistence store — but it is still embedded in the single daemon process, so the deployment-topology claim (all DB engines in one local process) holds regardless. | none — verified sound. Optionally tighten "all persistence" to note DuckDB is an in-process in-memory query engine rather than a persistence store, but this does not change the load-bearing single-process claim. |
| k2 | closed-union | LOW | manual | No Docker, K3s/K8s, or cloud (GCP/AWS) manifests exist in-repo; only a bare shell-script install is present. | The three probes confirm the premise. `dockerfile\|docker-compose` → 0 matches; `terraform\|cloudformation\|\\.tf$` → 0 matches. The `apiVersion:\|kind: Deployment\|Service\|Pod\|StatefulSet` probe returned 30 hits, but every one is a false positive relative to "manifests in-repo": they are test fixtures (src/analyze/context/__tests__/fixtures/setup.ts:316-364, fixtures.test.ts:183-188), infra-runtime unit/live test strings (aggregate-report.live.test.ts:53-55 and infra-runtimes.test.ts:170-374 — synthetic in-memory YAML, not files on disk), the infra-discovery feature's own source (discovery-families.ts:16, inventory-kubernetes.ts:51), and prompt documentation (infra.system.md:21-61) that *describes* how to detect these families. None is an actual Docker/K8s/cloud deployment manifest checked into the tree. The closed union — no Docker, no K3s/K8s, no GCP/AWS manifests, only a shell-script install — therefore holds. | none — verified sound |
| k3 | external-contract | LOW | manual | The IDE fork clones this repo into ~/.insrc/daemon/ and spawns the compiled out/daemon/index.js; the IPC surface (socket path ~/.insrc/daemon.sock, method names, payload shapes) is the only cross-repo contract. | Every load-bearing clause of the premise is confirmed by the gathered evidence. The socket path is real: `src/shared/paths.ts:19` defines `sockFile: join(INSRC_DIR, 'daemon.sock')`, and `src/daemon/lifecycle.ts:27` documents removing `daemon.sock` on teardown — matching the `~/.insrc/daemon.sock` contract point. The clone-into-`~/.insrc/daemon/` layout is corroborated across the tree: `src/analyze/context/driver.ts:376-377` ("production daemon (~/.insrc/daemon/out/insrc/...)"), `src/analyze/context/index.ts:42`, and `src/cli/services/maintenance.ts:13` ("`~/.insrc/daemon` — ... fast-forward sync against origin") all describe the fork cloning this repo to that directory. `CLAUDE.md:1` is FOUND and its header text states the IDE fork "clones this repo into `~/.insrc/daemon/` and spawns the compiled entry ... the daemon binary the IDE spawns is `out/daemon/index.js`", exactly the premise's spawn target and its "IPC is the only cross-repo surface" assertion. No evidence contradicts any clause; the anchors resolve to the entities the premise names. | none — verified sound |
| k5 | external-contract | LOW | manual | Cloud LLM access must go through the local claude/codex CLI subprocesses (CliProvider); no direct cloud REST providers may be introduced. | The evidence confirms the premise. `src/agent/providers/cli-provider.ts:7` documents "CliProvider -- wraps the locally-installed `claude` and `codex` CLI" and defines the concrete `class CliProvider implements LLMProvider` (cli-provider.ts:88). The 47 `CliProvider` matches show it is the sole cloud-LLM path across the codebase: it is instantiated for the claude/codex kinds in the shaper provider (`shaper-provider.ts:197`, routing log at :195), the workflow service (`cli/services/workflow.ts:231`), the build-step validate phase (`mcp/build-step/phases/validate.ts:45`), and exercised by live/unit tests. The "No direct cloud REST" constraint is also propagated into the implement-task build prompt (`src/prompts/build/implement-task.md:34`: "No direct cloud REST — CLI binaries only."). No evidence of any direct Anthropic/OpenAI/Gemini REST provider being introduced. The contract holds. | none — verified sound |
| c6 | citation | LOW | manual | scripts/insrc-daemon-install.sh exists and is the current local daemon install (no Docker/K3s/cloud topology manifests in-repo). | The read probe `scripts/insrc-daemon-install.sh:1` returned `#!/usr/bin/env bash`, confirming the file exists and is a shell script — the load-bearing claim of citation c6 ("scripts/insrc-daemon-install.sh exists and is the current local daemon install"). The `grep /insrc-daemon-install/ → 0 matches` probe searches file *contents* for the literal token and does not bear on the file's existence; it neither confirms nor contradicts. The file's existence and script nature are directly confirmed by the successful read of a bash shebang at the anchored path. | none — verified sound. The anchor `scripts/insrc-daemon-install.sh` resolves to a real bash script exactly as c6 asserts. The secondary negative claim ("no Docker/K3s/cloud topology manifests in-repo") is not addressed by the gathered evidence, but nothing in the evidence contradicts it, and the core citation anchor is confirmed. |

#### Proposed fixes

- **k1** (assisted) — The union is literally open (nats.ts + redis.ts broker/KV clients exist in-repo), but they are data-driver connectors to external user sources, not the daemon's persistence tier — so the correction is a scoping reword, needing a human to confirm intended scope rather than a mechanical value swap.
  - option: Scope the claim to the daemon's own persistence: 'The daemon's persistence is embedded in one process only (LMDB + Lance + DuckDB); no service tier or broker runs the daemon itself.'
  - option: Acknowledge the drivers explicitly: 'Persistence is single-process embedded; the repo does ship client drivers for external KV/broker stores (redis/valkey/keydb, nats JetStream) as data-driver tools, but these connect to the user's external sources and are not part of the daemon's persistence.'
  - option: Drop the absolute 'no messaging brokers in-repo' phrasing and keep only the verifiable core: 'The daemon runs as a single embedded process — no multi-node or distributed persistence artifacts.'

- **k4** (manual) — The premise content is a real architectural rule; the failure is that the re-run grep strings did not match the source phrasing, leaving the claim unverifiable from the handed evidence. Correcting this is a probe/anchor-query decision, not a mechanical artifact edit — no safe find/replace on the premise text is derivable from the empty evidence.
  - option: Adjust the citation's grep probe to the exact source phrasing (match on 'Daemon owns all DB access' as a bolded list item under 'Key architectural rules') and re-run to confirm before final classification.
  - option: Point the anchor at the concrete file:line of rule #1 in CLAUDE.md instead of a free-text grep, so re-grounding is deterministic.
  - option: Leave the premise text as-is (it is materially correct) and record the probe as a known false-negative pending anchor repair.

- **k6** (manual) — The count/exclusivity premise cannot be judged from the gathered evidence — the two directory greps were malformed (0 matches from bad patterns, not real absence) and the single CLAUDE.md header read says nothing about subsystem count. No safe text edit can be derived; the probes must be re-run before any correction is warranted.
  - option: Re-gather evidence with a valid `src/` directory listing to confirm exactly analyze + workflow exist as framework subsystems
  - option: Soften the premise from "exactly two" to "at least two (analyze and workflow)" if exclusivity cannot be established
  - option: Keep the premise but flag it as pending re-verification once the probes are corrected

- **a5** (manual) — The premise cannot be corrected or confirmed from the source-grep evidence given; Epics are stored in daemon storage, not source files. Resolving this requires re-probing the real Epic inventory (a design/verification decision), not a mechanical text edit. No evidence-supported replacement value exists.
  - option: Re-run the inventory probe against the workflow tracker/graph store (Epic registry) and update the premise to reflect the actual Epics found there.
  - option: If the tracker confirms exactly three Epics (build stage, plan stage, progress streaming) with no deployment overlap, mark the premise verified and keep it as-is.
  - option: If storage cannot be queried in this review, downgrade the premise from 'exactly three' to a non-load-bearing assumption and flag it for human confirmation before building on it.
