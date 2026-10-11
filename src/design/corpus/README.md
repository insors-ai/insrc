# Corpus foundation (sc1/sc2)

Import the pure API from `index.js`. It uses no filesystem, database, daemon, network or LLM provider. It does not import sources, install or publish releases, activate guidelines, or grant approval.

- `decode*` functions check closed runtime schemas without coercion or field stripping.
- `validateGuidanceRecord` checks complete content and its deterministic version. Draft mode permits a draft review; publication mode requires content-bound review metadata and a supplied specimen inventory.
- `validateRelease` checks a caller-supplied immutable in-memory manifest/file inventory, regular-file membership, portable paths, raw file hashes, record versions, exact acyclic relationships and the coverage envelope binding. Specimens must be separate from metadata and record files.
- `checkPublication` also requires exactly one successful, current internal assessment from each downstream stage (`eligibility` and `coverage`). These are adapter results, never user-issued authorization tokens. `eligible` is a preflight result, not persistent publication.

Record content → candidate content → coverage review → release manifest is the hash order. Coverage is excluded from candidate content to avoid a self-reference. Original authors may omit sources. Unsourced inferred guidance must explicitly declare an independently authored/inferred/developed rationale with author attribution; downstream eligibility still assesses the declaration.

Release diagnostics address `/manifest/...` or `/files/...`. Errors inside decoded JSON point to the containing file's `/bytes`, with the decoded field pointer in the message. Assessment composition additionally uses `/assessments`. Hash functions reject unsafe/non-JSON data; validators turn expected input failures into deterministic issues.

## Verification

Run `npm run build` and `node --import tsx --test 'src/design/corpus/__tests__/*.test.ts'`. The isolation test compiles current sources into fresh private output before exercising valid/invalid preflight with external I/O blocked.

S001's actual insrc gate runs and per-case results are recorded in [TESTS.md](../../../docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/S001/TESTS.md), with task completion evidence in [BUILD.md](../../../docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/S001/BUILD.md). The [verification report](../../../plans/design-intelligence-di1-s1-build.md) distinguishes corpus results from unrelated full-suite failures. These records exist independently of code-graph test-reachability edges.
