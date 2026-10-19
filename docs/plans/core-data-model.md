# Core data model: brainstorm decision log

Started 2026-10-19 with the owner (Subho Ghosh), after the team signoff epic exposed that Task-level comments, history and references have nowhere to live. This is a brainstorm in progress: a gap is **settled** only when it says so. Nothing here is built. When the brainstorm converges it becomes a SPEC, then goes through triage (an epic).

## Proposed base class: `Artifact`

Every persisted entity (Define, Design, Plan, Task, BUILD/CR/TESTS records, UML diagrams, mocks, ...) inherits from it.

| Attribute | Shape |
| :--- | :--- |
| `id` | the artifact's unique, hierarchical ID (Gap 1) |
| `description` | a summary of the artifact |
| `parent?` | `Reference` |
| `changeLog[]` | `{ actor, timestamp, operation (create / update / delete), references? }` |
| `comments[]` | `Comment { id (UUID), text, actor, timestamp, comments[] }` (nested) |
| `references[]` | `Reference { entityId, type }` |

`Actor { id (required: git id, Jira id or OS user), name?, properties{} }`.

## Why: what the code has today

- `meta.revision`, `meta.runId`, `meta.attribution` approximate a change log; `body.feedback[]` (Define, HLD, LLD, Plan only, each declaring its own copy of the field) approximates comments; `meta.tracker` and `citations` approximate references; `epicHash` / `storyId` are the implicit parent keys.
- A Task is a row (`PlanTask`) inside the Plan and has no feedback, history or references of its own.
- Tracker issue comments are only ever written by insrc, never read.
- There are two ID systems (below).

## Gap 1: ID scheme: SETTLED

Today: the work-item ID in `src/workflow/id.ts` (`E<YYYYMMDD><hash8>[:S<nnn>][:T<nnn>]`, added with the GitHub/Jira integration; used for issue titles, folders, labels) and the artifact IDs in `src/workflow/storage.ts` (`DEF-<hash16>`, `LLD-<hash>-S001`, `PLAN-…`, `BUILD-…`, `CR-…`, `TESTS-…`, `SPEC-…`, `ISSUE-…`, `EXT-…`, `AMD-…`). The second duplicates the first and the two disagree (`S001` against `s1`, hash length). The duplication is a defect.

1. IDs stay hierarchical and human-readable (they read well on flat tracker schemas such as GitHub). No separate UUID.
2. One ID system, minted in one module. The work-item grammar is the base; an artifact's ID is its owning unit's ID plus an optional type segment: Task `...:T010`, diagram or mock `...:DIAG<nnn>`, build / code-review / test records `...:BR`, `...:CR`, `...:TR` (the Story ID plus the segment).
3. Rounds (`BR`, `CR`, `TR`) are overwritten in place; the change log is the only record of earlier rounds (so a log entry for them must carry the round's outcome: Gap 4).
4. An ID never changes. Diagram numbering is a per-parent counter; only the unit's holder authors under it (the claim gate), so counters do not collide.
5. The design documents take type segments `:DEF`, `:HLD`, `:LLD`, `:PLN` (so an LLD is `E...:S006:LLD`; the unit's own ID stays the unit's, never the document's).
6. There are several ID **roots**, minted by the one module: `E<YYYYMMDD><hash8>` (epic work items), `SPEC<YYYYMMDD><hash8>` (a brainstormed spec) and `ISSUE<YYYYMMDD><hash8>` (a tracked defect). The grammar after the root is the same. `SPEC` and `ISSUE` are **origin artifacts**: the artifacts downstream (the Define, or a bugfix's first artifact) carry a **reference** to them (relation `derived-from`), not a parent edge, and a SPEC or ISSUE is never re-IDed when it becomes an epic or story. This makes the relation kind on `Reference` (Gap 7) required.

## Gaps still to discuss (one at a time)

2 payload and state on the base; 3 revision (derived from the change log?); 4 operations beyond create / update / delete, and what a log entry carries; 5 comment vs feedback (anchor, kind, decision, resolved); 6 external comment ids for tracker sync; 7 parent vs references (relation kind); 8 issues as external references; 9 actor id namespacing; 10 storage and merges across clones; 11 Tasks as their own artifacts; 12 migration.
