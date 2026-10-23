# Open Ontologies evaluation for insrc

Date: 23 October 2026. Status: evaluated in isolation; conditional candidate, not adopted.

## Decision

Proceed with a narrow daemon-managed validation/reasoning adapter design if the product needs these capabilities. Do not replace insrc's ontology builder, source analyzers, canonical LMDB persistence, or human review lifecycle with Open Ontologies. Do not make it mandatory for code-only proposal generation yet. Keep the RDF/JS baseline until the remaining gates below are satisfied.

The engine is executable and useful, not merely a conceptual framework. However, default whole-store reasoning/validation and full-replacement lifecycle plans conflict with insrc's contextual assertions unless we supply carefully constructed projections. Two isolated fixtures demonstrate those risks directly.

## Tested artifact and method

- Upstream: [fabio-rovai/open-ontologies](https://github.com/fabio-rovai/open-ontologies).
- Release API selected [v2.0.1](https://github.com/fabio-rovai/open-ontologies/releases/tag/v2.0.1), published 28 September 2026. Downloaded asset: `open-ontologies-aarch64-apple-darwin` (66,806,368 bytes).
- SHA-256: `268ca690b893c8f33f1d4491084fc1e8fc7e0adbbddda59595a419f943c4552b`, matched against that release's SHASUMS.txt. This verifies consistency with the publisher's manifest, not independent signing or reproducible-build provenance.
- Ran on local macOS arm64 using isolated `/tmp/insrc-oo-eval/` directories. Every invocation specified `--no-connect` and `--data-dir`; MCP additionally used an explicit temporary configuration. No global installation, live datastore, user ontology, cloud provider, or model invocation was used. No engine init/model download was performed.
- Twelve CLI scenarios and a stdio MCP initialize/list/call sequence. Fixtures and [observed JSON outputs](observed-results.json) are retained. Absolute checkout paths in those outputs are replaced with `<repo>`. No binary or large synthetic corpus is checked in.
- Development `main` advertised package version 2.1.0 during inspection. Do not assume its docs/tool profiles describe the tested release. For example, `--tool-profile` is documented on main but absent from the tested `serve --help`; the release does support an exact `--tools-allow` list.

To repeat the CLI probes with an independently downloaded and checksum-verified binary:

```bash
python3 docs/evaluations/open-ontologies/run-evaluation.py --binary /absolute/path/to/open-ontologies
```

The runner creates temporary stores and a synthetic corpus and prints their location; it does not download binaries or clean up the retained results. MCP observations are captured in the JSON record; this runner repeats the CLI scenarios only.

## Observed behavior

| Probe | Observed result | Implication |
| --- | --- | --- |
| Valid Turtle | Seven statements accepted, exit 0 | Basic parser interface works. |
| Malformed Turtle | JSON parser error, exit 1 | Syntax errors are distinguishable. |
| Required-property SHACL | Missing `tenantId` produced `conforms:false`, focus/path/constraint diagnostics; batch exit 0 | Exit status alone is insufficient. Read semantic verdict and batch results. |
| RDFS reasoning | Derived Customer instance → Party; ASK returned true | Basic deterministic inference works. |
| Named graphs | TriG preserved accepted/proposed graph names in SELECT results | Named graph interchange/query works for the fixture. |
| Scoped query | Explicit accepted-graph query returned Commerce only | We can query a chosen graph, but this does not scope every engine operation automatically. |
| No-change plan | Zero insertions/deletions and low risk | Basic structural change planning works. Conservativity output ran in this binary and reported an unverified engine opinion because the checker was absent. |
| Independent memory-mode process | A new stats invocation returned zero triples | Separate CLI processes do not share an in-memory load. Use one batch/session per job. |
| Verified SHACL | Refused with no verdict; `oo-shacl` unavailable, exit 1 | The main binary alone does not deliver the verified path. |
| Accepted/proposed contamination | Accepted graph lacked tenant ID; proposed graph supplied it. Whole-store SHACL returned `conforms:true` | Proposed evidence can satisfy accepted-state constraints if both are loaded. Filter before evaluation, not after. |
| Proposal fragment as desired state | One metadata triple planned seven deletions, including both classes; high risk | `plan` is replacement semantics, not an append-only assertion patch. Never pass a fragment as a full ontology. |
| Synthetic load/query smoke | 10,000 entities / 30,000 triples loaded; limited query returned 25 results | Small bounded-query smoke passed. One approximately 0.047-second process measurement is not a benchmark or a UI/large-reasoning scalability claim. |
| Restricted stdio MCP | Initialize, tools/list, and onto_stats worked; exactly five allowed tools advertised | Allowlisting is usable. Initialize identifies `rmcp` 1.4.0, not an engine release; record our pinned release/hash independently. |

The first SHACL fixture without tenant data failed as intended, while adding tenant data only in the proposed named graph made the union pass. The engine's response explicitly discloses whole-store scope. This is a default semantic mismatch for insrc, not evidence that named graphs themselves are broken.

## Fit against the PRD

| Area | Assessment |
| --- | --- |
| ONT1 semantics/validation | Useful for RDF parsing, selected SHACL and explicit inference profiles. Does not verify whether a domain interpretation is true. Define a tested profile and reject unsupported/undetermined cases. |
| ONT2 existing source analysis | Keep insrc data tools. Do not adopt engine schema import, SQL ingest, external vocab fetches or a parallel connector/credential layer. |
| ONT3 history and authority | Keep canonical state and activation in insrc. Engine state is a disposable per-job projection, including derived triples and lineage DB. Engine plan/apply/rollback is not insrc's approval ledger. |
| ONT4 automatic builder | Not supplied by the tested engine. insrc still detects repository/index events, captures evidence, proposes concepts/metadata and runs the human review workflow. |
| ONT5 large-model navigation | No viewer integration evaluated. Keep scoped indexed directory and bounded graph projections. Do not adopt the separate Studio as a prerequisite. |
| ONT6 incremental maintenance | Engine diffs may assist comparisons; insrc owns source dependency invalidation, freshness, manual overrides, rejection history, queueing and resume. |
| ONT7 analysis/review | Optional derived results and validation findings can enrich context when tied to exact input revision, rule profile, evidence and completeness. |

## Proposed integration boundary

1. Daemon selects an immutable, authorized ontology revision and context. Construct a bounded projection containing only the appropriate review/freshness states. Apply repository closure and connection scope before export; filter related shapes and provenance consistently.
2. Serialize to an isolated evaluation directory with explicit source/base revision, projection hash, shape profile and engine release/hash. Keep an ID mapping to insrc assertions. Qualified assertions must not become unqualified exactMatch/sameAs triples.
3. Spawn a local child process with explicit data directory, working directory, configuration and a minimal environment. Do not inherit webhook, remote embedding, proxy, or unrelated secret settings. Use a single batch process for load/check/query, or a daemon-owned restricted MCP session when repeated work justifies it.
4. Allow only required operations. For the first adapter: syntax/shape checks, stats and bounded explicitly scoped queries; opt-in reasoning only for the tested rule subset. Do not expose raw SPARQL or engine tools as new public graph APIs. Avoid apply/migrate, monitor actions, remote imports, marketplace, plugins, SQL ingest and alternate embeddings. CLI `batch` restrictions must be enforced by insrc; MCP allowlisting does not constrain an arbitrary batch supplied by a caller.
5. Enforce timeout, cancellation, output/memory/triple budgets, source-version checks and process cleanup. Parse every batch result, not only exit code. Distinguish valid/invalid, unknown/unsupported, incomplete/fixpoint cap and checker unavailable. Never translate an engine opinion into a verified claim.
6. Return structured findings/derived proposals through daemon IPC. Attach provenance and rule profile; keep inferred triples separate from observed facts. No automatic activation. Dispose of projection state after the chosen retention period.

This adapter needs a tracked implementation definition/design before code changes. It introduces a local executable dependency, not a cloud provider or a second client-accessible database.

## Important constraints and gaps

- `reason` materializes inferred triples in its loaded graph by default; use disposable sessions so checks cannot mutate canonical assertions.
- The tested ordinary SHACL path does not certify conformance. The `--verified` path explicitly refused without its separate checker. No Lean checker was installed or run; no theorem, certificate correctness or full SHACL compliance was independently evaluated.
- Upstream lifecycle documentation describes a `migrate` mode that can create equivalentClass/equivalentProperty bridges using similarity. Insrc requires explicit semantic review and must not adopt that behavior automatically. Only no-op/fragment planning was executed; apply/migrate and rollback were not executed.
- MIT is declared for the engine; packaged/transitive license review, release provenance and platform distribution are still adoption gates.
- No tests of hostile inputs, XML external entities, remote import isolation, timeouts, memory exhaustion, concurrent jobs, crash recovery, sustained workloads, persistence recovery or complete context-sensitive provenance round trips were performed.
- One Apple Silicon asset was tested. Linux, Windows, Intel macOS, upgrade compatibility and binary signature/notarization behavior remain unverified.
- Latest-release selection and default behavior can change. Pin an immutable asset/hash and maintain protocol fixtures rather than rely on an engine version flag: this binary rejects `--version`.

## Gates before adoption

1. Differential selected-SHACL fixtures against the current RDF/JS candidate, including unsupported constraints, nested shapes, cardinality, identity, scoped exact matches and no-data cases.
2. Named-graph/provenance round-trip and accepted/proposed/stale/context isolation tests. Prove the projection does not accidentally union incompatible versions or expand source access.
3. Stale-base and incremental-diff fixtures preserving manual metadata, disputed/rejected mappings and stable IDs.
4. Cancellation, resource limits, offline execution, no remote fetching and concurrent per-repo isolation under representative corpora.
5. Cross-platform asset validation, transitive licenses and a reproducible installation/update path. Add verified checkers only if the product explicitly requires their supported guarantees.

Recommendation: conditional go for a bounded adapter prototype; no-go for adopting Open Ontologies as insrc's authoritative builder/store or claiming production readiness from these smoke tests.

## Upstream references

- [Pinned lifecycle semantics](https://github.com/fabio-rovai/open-ontologies/blob/v2.0.1/docs/lifecycle.md).
- [Architecture](https://github.com/fabio-rovai/open-ontologies/blob/main/docs/architecture.md) and [tool catalogue](https://github.com/fabio-rovai/open-ontologies/blob/main/docs/tool-reference.md); main may differ from v2.0.1.
- [Trusted computing base](https://github.com/fabio-rovai/open-ontologies/blob/main/docs/trusted-computing-base.md) and [CI gates](https://github.com/fabio-rovai/open-ontologies/blob/main/docs/ci-gates.md); formal guarantees are conditional and do not cover business meaning.
