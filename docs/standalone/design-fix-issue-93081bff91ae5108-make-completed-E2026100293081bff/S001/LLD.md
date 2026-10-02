<!-- insrc:artifact LLD-93081bff91ae5108-S001 -->

# LLD: E2026100293081bff:S001

## Summary

**Epic:** `design-fix-issue-93081bff91ae5108-make-completed`
**HLD base run:** `wf-1790932646998-yl883h`
**HLD effective hash:** `16cd7ff49788...`

A completed Story's BUILD record will carry what the Story actually changed, a sentence or two saying what it was, and the commit it landed in — on every route, not just the plan-driven one. The change set stops being a question about the working tree and becomes a question about the Story's committed range, with the record's own artifact paths excluded unconditionally so it can never claim the Story changed BUILD.md. The two renderers converge into one that emits whatever sections the record has content for, which removes a confirmed defect by construction: there is no longer a boolean selecting a renderer for a shared code path to mis-write.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone bugfix — no parent HLD, no shared contracts. Designed directly against the repo and grounded on the s1 analyze passes.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `changedFiles`

```typescript
export async function changedFiles(repoPath: string, opts?: { readonly base?: string | undefined; readonly exclude?: readonly string[] | undefined }): Promise<readonly string[]>
```

**Parameters:**
- `repoPath: string` — Repository root, as today.
- `opts.base: string | undefined` _(optional)_ — A git ref marking the START of the Story's committed range. Consulted ONLY when the working tree is clean. Absent means the caller could not establish a range — it does NOT mean 'guess'.
- `opts.exclude: readonly string[] | undefined` _(optional)_ — Repo-relative path prefixes dropped from the result, applied to BOTH derivations. Carries the record's own artifact paths so a change set can never name the file it is being written into.

**Returns:** `Promise<readonly string[]>` — Repo-relative paths. Dirty tree: the union of unstaged and staged, byte-for-byte today's behaviour. Clean tree WITH a base: the paths changed across `base..HEAD`. Clean tree WITHOUT a base: an EMPTY array — deliberately not a fallback to `HEAD^`.

**Errors:**
- `NoBuildChangesError` when git fails or returns no data for either derivation. Unchanged: still thrown here and caught upstream.

**Preconditions:**
- `repoPath` is a git repository.
- `opts.base`, when given, is a ref the repository can resolve.

**Postconditions:**
- No path in the result matches any `exclude` prefix, regardless of which derivation produced it.
- The dirty-tree result is unchanged from today — the new behaviour is strictly additive on the clean-tree path.
- NO `HEAD^` fallback. The code-review assembler's chain (c12) is deliberately not adopted: `HEAD^` answers 'what did the last commit change', which for a multi-task Story is a populated and confident wrong answer. An empty result is recoverable; a plausible wrong one is not.

### 2.2 `collectBuildChangeLog`

```typescript
export async function collectBuildChangeLog(repoPath: string, ctx: { readonly author: string; readonly timestamp: string; readonly version?: string | undefined; readonly base?: string | undefined; readonly exclude?: readonly string[] | undefined }, listChanged?: (repoPath: string, opts?: { base?: string; exclude?: readonly string[] }) => Promise<readonly string[]>): Promise<ChangeLog>
```

**Parameters:**
- `ctx.base: string | undefined` _(optional)_ — Passed through to the derivation. The CALLER establishes it; this function never guesses a range.
- `ctx.exclude: readonly string[] | undefined` _(optional)_ — Passed through. The caller supplies the record's own json and md paths.
- `listChanged: (repoPath: string, opts?: { base?: string; exclude?: readonly string[] }) => Promise<readonly string[]>` _(optional)_ — The existing injectable test seam, widened to carry the new options so a stub stays honest about what it was asked. CORRECTED at synthesize per the s8 cd2 finding — this was previously described in prose rather than typed.

**Returns:** `Promise<ChangeLog>` — One entry per changed path, stamped with the supplied author/timestamp. Shape unchanged.

**Errors:**
- `NoBuildChangesError` when Thrown by the derivation and CAUGHT here, yielding []. The function itself never throws — see postconditions, where the s8 cd3 finding moved the non-throwing statements.

**Preconditions:**
- The two mandated positional arguments are unchanged, so existing 2-arg call sites keep compiling (c8).

**Postconditions:**
- NEVER THROWS. A git derivation failure is caught internally and yields [], so a git-unavailable build still succeeds.
- A base is consulted only when the working tree is clean — a dirty tree always wins, so mid-task behaviour is untouched.

### 2.3 `persistBuildRecord`

```typescript
export function persistBuildRecord(repoPath: string, rec: BuildRecord): { md: string; json: string }
```

**Parameters:**
- `rec: BuildRecord` — The record to upsert. Signature unchanged; what changes is how the md is produced from the merged result.

**Returns:** `{ md: string; json: string }` — The written paths. Unchanged.

**Errors:**
- `none` when No new failure modes; the merge and atomic write are untouched.

**Preconditions:**
- `mergeWithPrior` behaviour is unchanged — tasks union by id, prior `createdAt` and approval stamps preserved (c7).

**Postconditions:**
- The renderer is NO LONGER selected on `merged.meta.standalone`. One renderer runs for every record.
- A record whose body carries only `focus` and `producesLld` renders byte-identically to today's standalone output — a hard requirement, pinned by committed fixtures rather than asserted.

### 2.4 `renderPlanBuildRecordMd`

```typescript
export function renderPlanBuildRecordMd(rec: BuildRecord): string
```

**Parameters:**
- `rec: BuildRecord` — The merged record. Signature unchanged.

**Returns:** `string` — The full BUILD.md. Becomes the SINGLE renderer: every section is an omit-slot keyed on CONTENT, so what the document shows is a function of what the record holds rather than of a meta flag.

**Errors:**
- `none` when Pure string assembly over optional fields.

**Preconditions:**
- None beyond a well-formed record.

**Postconditions:**
- Emits, each only when it has content: the title; the created/updated line; `**Commit:**`; `## Scope` (from `body.focus`); `## Triage rationale` (from `meta.triageRationale`); `## Summary`; `## Tasks validated`; `## Changes`; `## Feedback`.
- THE TITLE DERIVES FROM `meta.sizeClass`, NOT from `meta.standalone`. Load-bearing: a title keyed on the boolean would still flip when the shared validate path writes it, which is the defect being removed. `sizeClass` is present only on standalone-routed records and is never written by the validate path, so it cannot be clobbered.
- An existing Trivial record — focus + producesLld, nothing else — produces the SAME bytes it produces today.

### 2.5 `renderStandaloneBuildRecordMd`

```typescript
export function renderStandaloneBuildRecordMd(rec: StandaloneBuildRecord): string
```

**Parameters:**
- `rec: StandaloneBuildRecord` — Retained only as a compatibility shim.

**Returns:** `string` — Delegates to the single renderer. Kept exported so any caller beyond the two sites s1 found keeps compiling; it is no longer a distinct rendering path.

**Errors:**
- `none` when Pure delegation.

**Preconditions:**
- None.

**Postconditions:**
- Output identical to calling the single renderer directly — one implementation of the markdown, not two kept in step.

### 2.6 `ensureBuildRecordOnCompletion`

```typescript
export async function ensureBuildRecordOnCompletion(repoPath: string, ref: { readonly epicHash: string; readonly storyId: string }, listChanged?: (repoPath: string, opts?: { base?: string; exclude?: readonly string[] }) => Promise<readonly string[]>): Promise<{ readonly md: string; readonly json: string } | undefined>
```

**Parameters:**
- `ref: { readonly epicHash: string; readonly storyId: string }` — Unchanged.

**Returns:** `Promise<{ md: string; json: string } | undefined>` — Unchanged.

**Errors:**
- `none` when Unchanged — any failure is caught and completion proceeds.

**Preconditions:**
- Runs at story completion, when the tree is typically cleanest of all — which is why it is empty today (c8).

**Postconditions:**
- Supplies the same base and exclude the validate path does, so the completion-time write becomes a genuine second chance rather than another guaranteed-empty collection.

## 3. Data model changes

### 3.1 `StandaloneBuildRecord` — invariant-change

Stops being a separate narrowing with its own renderer. The TYPE remains so existing callers and the code-review subject keep compiling, but it no longer selects a rendering path and no longer constrains which fields a standalone record may carry. The consequence the ISSUE asks for: a trivial-routed build can hold a changeLog, a summary and a commit, because no shape forbids them.

**Call sites:**
- `src/mcp/build-step/phases/implement.ts:133-140`
- `src/workflow/runners/build/standalone-record.ts:186-210`

### 3.2 `BuildRecord.meta.standalone` — invariant-change

No longer selects the renderer. TWO changes close the flip, deliberately belt-and-braces because each is cheap and they fail independently. FIRST, the renderer stops reading it (the title keys on `meta.sizeClass`). SECOND, the shared `runValidateSession` persist STOPS asserting `standalone: false` — it does not know the answer, and `mergeWithPrior` preserves the prior value when the new write omits it. s1 CONFIRMED this path is shared by both branches by design, so the flip is reachable rather than theoretical (c14).

**Call sites:**
- `src/mcp/build-step/phases/validate.ts:163`
- `src/workflow/runners/build/standalone-record.ts:198-200`
- `src/workflow/runners/build/standalone-record.ts:246-266`

### 3.3 `BuildRecord.body.summary` — invariant-change

No type change — the field exists and already renders (c4). It acquires a PRODUCER: the implementer, because it is the only party that knows what changed and why. It reaches the record as an optional input on the validate phase rather than being invented by the writer or derived from commit messages. A record with no summary renders exactly as before.

**Call sites:**
- `src/workflow/runners/build/standalone-record.ts:146-149`
- `src/mcp/build-step/phases/validate.ts:161-164`

### 3.4 `BuildRecord.body.commit` — invariant-change

No type change; acquires a producer. Read from git HEAD at persist time, because under the mandated commit-before-validate ordering (c3) HEAD IS the task's commit — so the one place that knows the task passed also knows the sha. This is the defect the rejected a3 could not have fixed: validating before committing leaves nothing to name.

**Call sites:**
- `src/workflow/runners/build/standalone-record.ts:139-140`
- `src/mcp/build-step/phases/validate.ts:161-164`

### 3.5 `BuildRecord.body.changeLog` — invariant-change

No type change. What changes is where the paths come from (the Story's committed range when the tree is clean) and what can never appear in them (the record's own json and md). The omit-slot guard at the persist site stays — an absent changeLog still means no `## Changes` section — and a FAILED collection stays indistinguishable from an EMPTY one, settled in errorPaths.

**Call sites:**
- `src/mcp/build-step/phases/validate.ts:164`
- `src/workflow/runners/build/completion-record.ts:44`
- `src/workflow/artifacts/format/bindings.ts:91-93`

## 4. Error paths

**Error cases**

- **The base ref cannot be resolved — a shallow clone lacking the Story's boundary commit, a rewritten history, or a repo where the artifact tree is gitignored so the PLAN was never committed.** (recoverable)
  - Detection: The range derivation asks `git_diff { from: base }` and the builtin reports failure, OR the caller's base resolution yields nothing to pass. Both surface from the git call before any record is written.
  - Response: No base means no range derivation: an EMPTY set, never a substituted range. A failed range diff is treated as the git failure it is, not as 'nothing changed'. The record is still written; the build is never blocked on provenance.
  - User impact: A BUILD record with no `## Changes` section, exactly as today — a known-incomplete entry rather than a confidently wrong one, which is the whole point of refusing a HEAD^ substitution.
- **The git derivation itself fails — git not installed, not a repository, or the builtin errors.** (recoverable)
  - Detection: `changedFiles` throws `NoBuildChangesError`, which `collectBuildChangeLog` already catches (c1).
  - Response: Unchanged: caught internally, logged, yields []. SETTLED HERE, because s4 deferred it — a FAILED collection stays indistinguishable from an EMPTY one in the record body. A third state would mean a new field on a persisted artifact and a new section in every renderer, disproportionate to a condition that is already logged. The ISSUE asks for provenance that is accurate, not provenance that explains its own absence.
  - User impact: No `## Changes` section, with the reason in the daemon log rather than the artifact.
- **The record's own artifact paths reach the change set — the second, worse symptom, where a validate call runs while a previous validate's json/md writes are still uncommitted.** (recoverable)
  - Detection: Prevented at the source rather than detected after the fact; a REGRESSION is detected by comparing the exclusion list against the paths the writer is about to write, so the two cannot drift. (Corrected at synthesize per the s8 ep2 finding, which rightly noted the original wording stated prevention where a detection was asked for.)
  - Response: The record's own json and md are dropped unconditionally from BOTH derivations, so no ordering lets them survive into the log.
  - User impact: A change set never claims the Story changed `BUILD.md` or `BUILD-<hash>-<story>.json`. Observed on Epic bfe98ff7 Story s4 (c16) and the symptom most likely to mislead, because a populated section reads as fact.
- **A `HEAD` that does not exist — the repository has no commits, so there is no sha to read and no range to diff.** (recoverable)
  - Detection: Reading HEAD for `body.commit` fails, and any range diff against it fails.
  - Response: `body.commit` is omitted rather than written empty or placeholder; the change set falls to the working-tree derivation. DELIBERATE divergence from the code-review assembler, which diffs against the empty-tree object to recover a root commit (c12) — right for reviewing a first commit, wrong here, because a BUILD record for a Story in a repo with no commits has no Story range to describe.
  - User impact: No `**Commit:**` line, and whatever the working tree holds as the change set.
- **The implementer supplies a summary that is empty, whitespace-only, or absent.** (recoverable)
  - Detection: The persist path trims before deciding; the renderer independently re-checks with the existing `rec.body.summary?.trim() ?? ''` guard (c4).
  - Response: The field is omitted rather than stored as an empty string. No summary is a legitimate outcome — it is never fabricated from commit messages or the diff, because invented prose in a ledger entry is worse than a missing section.
  - User impact: No `## Summary` section; the record renders as it would have before this Story.
- **A pre-fix record is upserted by a post-fix write — a Story already has a record whose meta carries `standalone: true`, and a later validate writes without the flag.** (recoverable)
  - Detection: `mergeWithPrior` spreads `{ ...rec.meta }` over the prior; with the flag omitted, the prior value survives by construction (c7).
  - Response: Intended, and the second half of the flip fix. The validate path stops asserting a flag it does not know; the prior record keeps what it legitimately recorded.
  - User impact: A trivial-routed build keeps its Scope and Triage-rationale sections through a validate call — which it does not today.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A dirty working tree at validate time — the controller did NOT commit first, or committed only part of the task. | The working-tree derivation wins and the base is never consulted. Today's behaviour exactly. This is what makes the fix independent of the ordering rather than dependent on the opposite one — the k1 constraint that eliminated a3. |
| A Story whose entire change set is artifact files — a docs-only Story — where excluding the record's own two paths removes a meaningful fraction. | Only the record's OWN json and md are excluded, not the artifact tree generally. A docs-only Story still shows its evidence, its LLD and its PLAN; it simply never shows the BUILD record it is being written into. |
| A multi-task Story where validate is called once per task, so the range derivation runs repeatedly against a growing range. | Each call derives afresh from the same base to the current HEAD, so the change set GROWS monotonically and the final value describes the whole Story. The merge replaces `changeLog` wholesale rather than unioning, so no duplicates and no stale mid-Story paths. |
| Validate is re-run for an already-validated task, after further commits. | Idempotent in shape: the task row merges by id as today, and the change set re-derives to the current HEAD. A re-run never shrinks the record. |
| A record carrying BOTH `body.focus` (standalone origin) and `body.tasks` (a plan-driven validate ran against it) — the mixed state the flip produces today. | The single renderer emits BOTH `## Scope` and `## Tasks validated`, because each section keys on its own content. The mixed state stops being a rendering accident and becomes simply a record with two kinds of content — the clearest evidence that content-keyed sections are the right shape. |
| An existing Trivial record written before this Story — body carries only `focus` and `producesLld`. | Byte-identical output: the title from `meta.sizeClass`, the size-class/created line, `## Scope`, and `## Triage rationale` when present. Nothing else, because it has content for nothing else. Pinned against a REAL pre-fix record rather than a constructed one. |

**Invariants to preserve**

- `collectBuildChangeLog` NEVER throws. A git derivation failure is caught internally and yields [] so a git-unavailable build still succeeds — the validate phase must be able to populate the body unconditionally. The new base and exclude paths must not introduce a throw. [[c1]]
- An empty or absent change log renders NO `## Changes` section. `changeLogBodyLines` returns [] for both, and the persist site omits the key entirely for an empty collection — so a record with nothing to report is byte-identical to one written before the change-log feature existed. [[c9]]
- A persistence failure never converts a real verdict into an error. The validate path wraps the whole record write in a catch that logs and returns the verdict unchanged; adding base resolution, commit reading and exclusion inside that block must not escape it. [[c2]]
- `mergeWithPrior` preserves the prior `createdAt` and the approval/rejection stamps, and unions `body.tasks` by id with the new write's `passed` winning. The flip fix RELIES on this spread behaviour rather than changing it — omitting `standalone` from the new write is what lets the prior value survive. [[c7]]
- The Trivial standalone markdown stays byte-identical for a record carrying no new content. The renderer split exists specifically to keep that output from churning after the S001 generalization; converging is only acceptable because omit-slots preserve the same bytes, and that must be PROVED rather than assumed. [[c5]]
- Existing two-argument call sites of `collectBuildChangeLog` keep compiling. The injectable `listChanged` seam is additive and optional and the mandated positional arguments are unchanged, so the completion-time writer and the tests are not forced to change in lockstep. [[c8]]
- `body.summary` is never fabricated. The field renders a human narrative, and the only honest author is the party that made the change; deriving it from commit messages or from the diff would put invented prose into a ledger entry. [[c4]]

## 5. Test strategy

**Test framework:** `node:test via `npx tsx --test`, the framework every suite under src/**/__tests__/ uses. Git-dependent behaviour follows the pattern established in src/workflow/code-review/__tests__/diff-grounding.test.ts (c13): a THROWAWAY repository per test, with a clean skip when git is unavailable. Record-level behaviour follows src/mcp/build-step/__tests__/build-step.test.ts (c15), which parses the PERSISTED json rather than an in-memory value — the right instinct for an artifact whose defect was that the file said something different from what the code believed.`

**Test levels**

- **integration** — THE DECISIVE LEVEL. The defect is that a clean working tree yields nothing, so the test that matters is differential and must run against a real repository: the same Story derived once clean and once dirty. A stubbed seam cannot prove this — the whole bug lived in what git was actually asked.
  - Subjects: `A throwaway repo with a base commit and later commits: CLEAN tree + base yields every file changed across `base..HEAD` — the test that fails today and is the point of the Story`, `CLEAN tree + NO base yields an EMPTY set, not the last commit's files — pinning the deliberate divergence from the HEAD^ chain so a later 'helpful' fallback cannot slip in`, `A DIRTY tree yields exactly today's result and never consults the base — proving independence from the commit/validate ordering`, `A multi-task Story: the change set GROWS across tasks rather than describing only the latest`, `The record's own json and md are dirty and still excluded — the exact state that produced the observed wrong change set`, `An unresolvable base: the record is still written, the build is not blocked, and no substitute range is used`
  - Fixtures: `A per-test throwaway git repo with a known commit graph`, `A git-unavailable environment, to prove the gated skip and the never-throws invariant`, `A repo whose commits touch only artifact paths, for the docs-only edge case`
- **unit** — Pin the collector's contract and the renderer's section logic without git, via the injectable seam. Fast enough to run per-branch and precise enough to say WHICH rule broke.
  - Subjects: `The exclusion is applied to BOTH derivations — asserted separately, because an exclusion on only one is the bug half-fixed`, ``collectBuildChangeLog` never throws: a seam that throws yields []`, `Existing TWO-ARGUMENT call sites still compile and behave identically`, `A base is consulted ONLY when the tree is clean, asserted via a recording seam rather than inferred from the result`, `The single renderer emits each section only when its content is present — one assertion per section, since eight omit-slots have eight ways to be subtly wrong`, `The title derives from `meta.sizeClass` and NOT `meta.standalone`, asserted against a record whose standalone is false but whose sizeClass is set — the flipped state`, `A record with both `focus` and `tasks` renders both `## Scope` and `## Tasks validated``, `An empty/whitespace/absent summary omits the field rather than storing an empty string`, ``body.commit` is omitted — not empty-stringed — when HEAD cannot be read`
  - Fixtures: `A recording `listChanged` seam capturing the options it was called with`, `A pre-fix Trivial record read from the repo's own artifact tree`
- **contract** — Guard the two invariants whose violation would be silent and whose cost falls on artifacts already written. Both byte-level, because 'looks the same' is exactly what the current split was built to guarantee.
  - Subjects: `BYTE-IDENTITY: an existing Trivial record renders byte-for-byte what it renders today, pinned against a REAL pre-fix record rather than a constructed one — a constructed fixture would be built from the same understanding as the fix and would agree with it by construction`, `An empty or absent changeLog still renders NO `## Changes` section`, `A record written entirely before this change still parses, merges and renders`
  - Fixtures: `At least one real pre-fix BUILD record json committed as a fixture, with its expected markdown captured alongside`
- **integration** — Prove the renderer-flip is actually closed, end to end through the two phases that cause it. s1 confirmed the path is REACHABLE, so this is a regression test for a live defect.
  - Subjects: `A standalone build runs implement then validate: the persisted record still renders `## Scope` and `## Triage rationale``, `The shared validate persist does NOT write `standalone` at all — asserted on the json`, `MUTATION: restoring the unconditional `standalone: false` write turns the Scope-retention test red`
  - Fixtures: `A standalone build fixture drivable through implement then validate against a throwaway repo`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: a clean tree with a base yields the Story's full `base..HEAD` change set — fails before the fix`, `integration: a dirty tree yields today's result and never consults the base`, `integration: a multi-task Story's change set grows across tasks`, `unit: a base is consulted only when the tree is clean, observed via a recording seam` |
| `ac2` | `integration: the record's own uncommitted json and md are excluded from the change set`, `unit: the exclusion applies to the working-tree AND the range derivation, asserted separately`, `unit: only the record's OWN two paths are excluded, not the artifact tree generally` |
| `ac3` | `unit: a supplied summary reaches `body.summary` and renders as `## Summary``, `unit: an empty/whitespace/absent summary omits the field and renders no section`, `unit: `body.commit` is written from HEAD and renders as `**Commit:**`, omitted when HEAD cannot be read`, `contract: a build with no supplied summary produces a record with no summary key — never synthesised` |
| `ac4` | `integration: a trivial-routed build carries a changeLog and renders `## Changes`, which it cannot do today`, `unit: the single renderer emits every section for which content exists, regardless of route`, `unit: a record with both `focus` and `tasks` renders both sections` |
| `ac5` | `integration: implement-then-validate on a standalone build keeps `## Scope` and `## Triage rationale``, `integration MUTATION: restoring the unconditional `standalone: false` write turns that test red`, `unit: the title derives from `meta.sizeClass`, asserted against the flipped state`, `contract: byte-identity for an existing Trivial record, pinned against a real pre-fix artifact` |
| `ac6` | `unit: `collectBuildChangeLog` never throws — a seam that throws yields []`, `integration: with git unavailable the build still succeeds and the record is still written`, `unit: existing two-argument call sites compile and behave identically`, `contract: an empty or absent changeLog renders no `## Changes` section` |

## 6. Migration

**State before:** A BUILD record is written in three places and rendered by one of two functions selected on `meta.standalone`. The change set is derived by `collectBuildChangeLog` from `changedFiles`, which asks git only about the WORKING TREE (c1); `validate.ts:164` drops the key for an empty result (c2) and `changeLogBodyLines` emits nothing for an absent or empty log (c9), so the omission is silent all the way to the markdown. Because the implement prompt mandates commit-before-validate (c3), the tree is clean exactly when the collector runs — so the change set is always empty, and when it is NOT empty it is wrong, because the only dirty paths are the record's own json and md. `body.summary` and `body.commit` are declared and rendered (c4) but set by NONE of the three body writers (c2, c8, c10). `renderStandaloneBuildRecordMd` reads none of changeLog, feedback or summary (c5), so a trivial-routed build cannot show provenance at all. And `runValidateSession` — shared by both branches by design — writes `standalone: false` unconditionally while `mergeWithPrior` spreads `{...rec.meta}` (c14, c7), so a trivial record that reaches validate flips renderers and loses its Scope section while `body.focus` survives in the json, rendered by nothing.

**State after:** The change set derives from the Story's COMMITTED range when the tree is clean and from the working tree when it is not, so it is correct under either ordering rather than dependent on one. The record's own json and md are excluded unconditionally from both derivations. `body.summary` is written from an optional input the implementer supplies; `body.commit` from git HEAD at persist time. One renderer emits every section for which the record holds content, so a trivial-routed build shows the same provenance a plan-driven one does. The `standalone` flag no longer selects a renderer and is no longer asserted by the shared validate path, closing the flip from both directions. A record carrying no new content renders byte-identically to today.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Characterise the flip: drive a standalone build through implement then validate against a throwaway repo and capture the resulting record BEFORE changing anything, as a failing expectation. s1 established the flip by reading code; this makes the wrong behaviour observable so every later step has a baseline to diff against. — ↩ rollbackable
2. Capture byte-identity baselines from REAL pre-fix records in the repo's artifact tree — one Trivial standalone, one plan-driven — recording their current rendered markdown as committed fixtures. These are the k2 guard; a fixture constructed from the new understanding would agree with it by construction rather than by evidence. — ↩ rollbackable
3. Widen the derivation additively: an optional options argument on `changedFiles` carrying a base and an exclusion list, threaded through `collectBuildChangeLog`'s context and its seam. Behaviour unchanged when neither is supplied, so this ships without changing any existing call site's result. — ↩ rollbackable
4. Apply the exclusion to BOTH derivations and have the writers pass the record's own paths. Deliberately separated from the range work: it fixes a defect that exists independently of which range is used, so a rollback of the range change does not reintroduce it. — ↩ rollbackable
5. Have the validate and completion writers resolve the Story's range base and pass it. Until now the parameter is dormant; after it, a clean tree yields the Story's change set. Explicitly do NOT add a HEAD^ fallback — an unresolvable base yields empty, because a populated wrong answer is worse than an honest absence. — ↩ rollbackable
6. Give `body.commit` a producer by reading HEAD at persist time, and `body.summary` a producer by accepting an optional summary on the validate input. Both already render, so this changes what records carry rather than how anything is displayed. — ↩ rollbackable _(needs: `The build-step input gains an optional field; controllers that do not supply it are unaffected.`)_
7. Converge the renderers: the single renderer emits Scope and Triage-rationale alongside the existing sections, each keyed on its own content, with the title derived from `meta.sizeClass`. Keep the standalone entry point as a delegating shim. Verify against the step-2 baselines — if any byte moved, this step is wrong, not the baseline. — ↩ rollbackable
8. Stop the shared validate path asserting `standalone: false`. With the renderer no longer reading the flag this is belt-and-braces, which is the intent: the halves fail independently, and leaving a path that writes a value it cannot know is how this defect returns wearing different clothes. Re-run the step-1 characterisation — it must now pass. — ↩ rollbackable
9. Re-run the build-step and workflow suites, confirm the byte-identity fixtures are untouched, and separately verify a record written before any of this still parses, merges and renders — forward compatibility of the stored shape is the one thing no test of new behaviour would catch. — ↩ rollbackable

**Backward compat:** Every API change is additive and every existing call site keeps working. `changedFiles` and `collectBuildChangeLog` gain an OPTIONAL options argument; their mandated positional parameters are unchanged, so the completion-time writer and existing tests compile and behave identically untouched (c8). `persistBuildRecord`'s signature is unchanged. `renderStandaloneBuildRecordMd` is RETAINED as an exported delegating shim rather than deleted, so any caller beyond the two sites s1 found keeps compiling. `StandaloneBuildRecord` is retained as a type so the code-review subject that consumes `buildRecord` is unaffected. On the DATA side, pre-existing records read unchanged: every field the new renderer reads is already optional, and a record carrying none of them renders exactly what it renders today — pinned by committed byte-identity fixtures rather than asserted. The one outward-facing change is the validate phase's input gaining an optional `summary`; a controller that never supplies it sees no difference.

## 7. Alternatives considered

### 7.1 a1: Story-range derivation, caller-supplied base, with the provenance fields on one record shape

The collector takes an explicit base ref and derives from the committed range; the build step supplies the Story's boundary, and the record carries summary/commit through one widened shape both renderers read.



**Rejected because:** Rank 2. Strong everywhere the ISSUE asked, but scored `partial` on fi5 — the one defect s1 CONFIRMED. Widening the standalone renderer shrinks the damage without removing the flag: a trivial record flipped to standalone:false still renders through the plan renderer, which has no `## Scope`. To fix that, a1 would also have to teach the plan renderer focus-derived sections — at which point it is a4 with two renderers to keep in step instead of one. Its Story-range derivation and unconditional self-path exclusion ARE its real contribution and are carried into the winner unchanged.

### 7.2 a2: Reuse the shipped code-review fallback: working tree, then HEAD^, then root commit

Adopt the derivation the code-review grounding already ships and tests, and leave the record shape alone apart from giving summary and commit a writer.



**Rejected because:** Rank 3, and the most tempting — reusing a shipped, tested path is normally the right instinct, and it handles the single-commit edge a hand-rolled version forgets (c12, c13). But it answers a DIFFERENT question. `HEAD^` recovers the last commit, which for the eight-task Story that exposed this defect would have named whatever the final task touched and silently omitted the other seven. That is not a smaller version of the right answer but a confidently wrong one, worse than an empty set because it looks populated and gives a reader no cue to doubt it. Scored `violates` on fi4 and fi5, leaving two of the three defects untouched.

### 7.3 a3: Fix the ordering instead of the collector — validate before commit

Change the implement prompt so the controller validates while the work is still uncommitted, leaving the working-tree collector correct as written.



**Rejected because:** Rank 4, eliminated on explicit scores. VIOLATES k1: the defect was CAUSED by correctness depending on an instruction, so re-grounding correctness on a different instruction reproduces the failure mode with the arrow reversed. Also violates fi2 rather than merely missing it — committing after the verdict means the gate writes the record's own json/md into an uncommitted tree, the exact condition that produced the self-capture symptom. And it trades fi3 away: under this ordering the commit does not exist when the only step that knows the task passed runs, so `body.commit` becomes unwritable. Cheapest by a wide margin, and that is its only merit.

### 7.4 a4: Converge on one record shape and one renderer, with derivation from the Story range — **CHOSEN**

Collapse the standalone/plan-driven split into a single shape and a single renderer that omit-slots every section, then fix the derivation once for the one path that remains.



**Rejected because:** CHOSEN. The only alternative scoring `satisfies` on fi5, and structurally: with no flag selecting a renderer, the shared validate path cannot mis-write it and mergeWithPrior cannot let a wrong value win. Its stated cons weakened under scrutiny — the byte-identity objection largely dissolves, because an existing Trivial record carrying only focus and producesLld renders exactly as before when every section is an omit-slot, PROVIDED the title stays keyed on meta. What remains genuinely costly is reaching the type the code-review subject consumes, which is real but bounded.

## 8. References

- **[[c1]]** `code` `src/workflow/runners/build/changed-files.ts:41-55` — "Derive the changed-file set from the working-tree diff (unstaged ∪ staged) via the `git_diff` builtin ... for (const staged of [false, true]) { const res = await gitDiffTool.execute({ cwd: repoPath, s"
- **[[c2]]** `code` `src/mcp/build-step/phases/validate.ts:161-164` — "const changeLog = await collectBuildChangeLog(repoPath, { author: 'insrc-build', timestamp: now }); persistBuildRecord(repoPath, { ... body: { tasks: [{ id: taskId, passed }], ...(changeLog.length > 0"
- **[[c3]]** `code` `src/prompts/build/implement-task.md:26` — "4. If green, **commit** referencing the Task and its issue: — the ordering that guarantees a clean working tree by the time the validate phase collects the change set."
- **[[c4]]** `code` `src/workflow/runners/build/standalone-record.ts:139-149` — "if (rec.body.commit !== undefined) { lines.push('', `**Commit:** ${rec.body.commit}`); } ... const summary = rec.body.summary?.trim() ?? ''; if (summary.length > 0) { lines.push('', '## Summary', '', "
- **[[c5]]** `code` `src/workflow/runners/build/standalone-record.ts:114-130` — "renderStandaloneBuildRecordMd returns only the title, the size-class/created line, `## Scope` and an optional `## Triage rationale` — it reads none of changeLog, feedback or summary. Its doc comment s"
- **[[c6]]** `code` `src/workflow/runners/build/standalone-record.ts:186-203` — "const merged = mergeWithPrior(jsonPath, rec); ... const md = merged.meta.standalone ? renderStandaloneBuildRecordMd(...) : renderPlanBuildRecordMd(merged);"
- **[[c7]]** `code` `src/workflow/runners/build/standalone-record.ts:246-266` — "function mergeWithPrior(jsonPath: string, rec: BuildRecord): BuildRecord { ... const meta: BuildRecord['meta'] = { ...rec.meta, createdAt: prior.meta.createdAt, ... } — the new write wins on every met"
- **[[c8]]** `code` `src/workflow/runners/build/completion-record.ts:38-45` — "ensureBuildRecordOnCompletion calls collectBuildChangeLog and writes body: { tasks: [], ...(changeLog.length > 0 ? { changeLog } : {}) } — the second producer, defeated by the same working-tree depend"
- **[[c9]]** `code` `src/workflow/artifacts/format/bindings.ts:91-93` — "export function changeLogBodyLines(changeLog: ChangeLog | undefined): string[] { if (changeLog === undefined || changeLog.length === 0) return []; — the renderer correctly shows nothing for an absent "
- **[[c10]]** `code` `src/mcp/build-step/phases/implement.ts:133-140` — "persistStandaloneBuildRecord(repoPath, { meta: { workflow: 'build', standalone: true, sizeClass, ... }, body: { focus: specFocus, producesLld: false } }); — the third and last BuildRecord body writer;"
- **[[c11]]** `code` `src/daemon/tools/builtins/git/diff.ts:55-70` — "id: 'git_diff' ... 'Supports unstaged (default), staged, arbitrary commit ranges, or a specific path.' with `from` ('Starting ref for a range diff') and `to` ('Ending ref. When omitted with `from`, de"
- **[[c12]]** `code` `src/workflow/code-review/grounding.ts:150-168` — "it derives the changed set from the working-tree diff, falls back to the last commit (`git_diff {from:'HEAD^'}`, then the root commit) when the tree is clean ... EMPTY_TREE_HASH = '4b825dc642cb6eb9a06"
- **[[c13]]** `code` `src/workflow/code-review/__tests__/diff-grounding.test.ts:146-152` — "assembler (integration): a clean-working-tree repo recovers the last commit via the real git_diff HEAD^ fallback — read-only ... try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch "
- **[[c14]]** `code` `src/mcp/build-step/phases/validate.ts:67-97, :121-127, :163` — "if (input.standalone !== undefined) return handleStandaloneValidate(...) ... runValidateSession is shared by 'BOTH the plan-driven and the standalone (S002) branches so the verdict + persist behaviour"
- **[[c15]]** `code` `src/mcp/build-step/__tests__/build-step.test.ts:393-397` — "assert.ok(Array.isArray(rec.body.changeLog), 'a non-empty changed set lands a `changeLog` on the record') — the existing test, whose own precondition explains why it passes today while the feature doe"
- **[[c16]]** `prior-artifact` `ISSUE-93081bff91ae5108` — "The defect record this LLD designs against: three producer-side defects sharing one root, with the reproduction (clean tree -> 0 entries, one dirty file -> 1) and the four decisions deliberately left "

## 9. Open questions

- HOW the validate and completion writers resolve the Story's range base is deliberately unspecified. The design fixes WHAT the base means — the start of the Story's committed range — and that the caller establishes it, but not the lookup. The by-hand repair of Epic bfe98ff7's s4 record used the commit that introduced the approved PLAN, which is the obvious candidate and is also the one the test strategy assumes; a plan task should settle it against the real artifact tree, including what happens when artifacts are gitignored or the PLAN was approved but never committed. Named here rather than decided because the right answer depends on facts about artifact-commit conventions that this design did not establish.
- The converged renderer keeps the name `renderPlanBuildRecordMd`, which will be inaccurate the moment it renders standalone records too. The name was retained deliberately — inventing one would have meant an api name absent from the s1 grounding — but a reader meeting `renderPlanBuildRecordMd` rendering a Trivial record will be misled. Renaming is cheap (two call sites) and should be decided at plan time rather than smuggled in.
- The Story carries NO acceptance criteria — a bugfix routed through `issue` takes its intent from the ISSUE rather than from an Epic's Stories — so ac1-ac6 were DERIVED here from the ISSUE's fixIntent plus the two constraints the judging step used (correctness must not depend on an instruction being followed; no unnecessary churn on already-written artifacts). They are faithful to the source but originate in this document, and the plan stage should treat them as this LLD's proposal rather than as inherited requirements.
- Whether a FAILED change-set collection should remain indistinguishable from a genuinely EMPTY one. Settled NO for this Story — a third state would mean a new field on a persisted artifact and a new section in every renderer, disproportionate to a condition already logged. Recorded because it is a real asymmetry a future reader may reasonably revisit: today a record with no `## Changes` section cannot tell you whether nothing changed or whether git was unavailable.

## Resolved questions

- `q0b544035` — HOW the validate and completion writers resolve the Story's range base is deliberately unspecified. The design fixes WHAT the base means — the start of the Story's committed range — and that the caller establishes it, but not the lookup. The by-hand repair of Epic bfe98ff7's s4 record used the commit that introduced the approved PLAN, which is the obvious candidate and is also the one the test strategy assumes; a plan task should settle it against the real artifact tree, including what happens when artifacts are gitignored or the PLAN was approved but never committed. Named here rather than decided because the right answer depends on facts about artifact-commit conventions that this design did not establish.
  - **resolved**: Recorded base, PLAN-commit fallback — Chosen on evidence gathered at this stage, which is exactly the fact the LLD said it could not establish. Artifacts ARE committed here (648 tracked under .insrc/artifacts, 707 under docs/) and NOT gitignored, so the PLAN-introducing-commit lookup would usually work — but approval and commit are SEPARATE events, and the gap is real rather than hypothetical: bfe98ff7 s4's PLAN was approved at 05:50:05Z and first committed 15 seconds later in 87f3f2f, and this very Story's LLD is approved-and-still-untracked as I write this. A lookup that depends on the artifact already being in history is therefore correct only by the grace of whoever remembered to commit, which is precisely the class of defect this ISSUE exists to remove (correctness must not depend on an instruction being followed). Stamping the base at approval makes it independent of commit discipline; the PLAN-commit fallback keeps every one of the 648 already-written records resolvable, including the method the bfe98ff7 repair used and the test strategy assumes. ONE CORRECTION to the option as worded, and the plan MUST encode the corrected form: its final clause says that when neither source exists it should "fail with an explicit 'unresolvable range base' error". That contradicts the approved LLD, whose ac6 requires collectBuildChangeLog to NEVER throw and whose §4 and migration step 5 both specify that an unresolvable base yields an EMPTY change set with the record still written and the build not blocked — on the stated principle that a populated wrong answer is worse than an honest absence. So: stamped base first, PLAN-commit fallback second, and if neither resolves, log and return empty. Never throw, never substitute a different range. _(2026-10-02T12:58:31.891Z)_
- `q0c5270ce` — The converged renderer keeps the name `renderPlanBuildRecordMd`, which will be inaccurate the moment it renders standalone records too. The name was retained deliberately — inventing one would have meant an api name absent from the s1 grounding — but a reader meeting `renderPlanBuildRecordMd` rendering a Trivial record will be misled. Renaming is cheap (two call sites) and should be decided at plan time rather than smuggled in.
  - **resolved**: Rename in this Story's plan — Rename renderPlanBuildRecordMd to renderBuildRecordMd as an explicit plan task, in the same change as the convergence, so the name never describes less than the function does. A deprecated alias is unnecessary: renderStandaloneBuildRecordMd is already being retained as the compatibility shim, and a second alias would leave three names for one renderer. CORRECTION TO THE SIZING the LLD and this option both carry: it is not "two call sites". There is exactly ONE production call site (standalone-record.ts:200) plus the declaration at :132, and then roughly SEVENTEEN references across two committed test files — build-record-enrichment.test.ts (import at :25 and uses at :44, :50, :51, :55, :59, :65, :124) and provenance-build.test.ts (import at :28 and uses at :76, :85, :93, :94, :95, :105 twice, :150). The work is still mechanical and still belongs in this plan, but the task must be scoped as a rename across two test suites rather than a two-line edit, and those suites must be RUN afterwards rather than assumed green — a rename that compiles is not a rename that passes. Note also the interaction with the byte-identity work: provenance-build.test.ts:105 asserts renderPlanBuildRecordMd(legacy) equals renderPlanBuildRecordMd(baseRec), which is a renderer-against-itself comparison of two different INPUTS (legitimate — it pins legacy-record equivalence) and must not be confused with the vacuous self-comparison being fixed at build-record.test.ts:142. _(2026-10-02T12:59:34.890Z)_

## Citations

- **[[c1]]** `code` `src/workflow/runners/build/changed-files.ts:41-55` — "Derive the changed-file set from the working-tree diff (unstaged ∪ staged) via the `git_diff` builtin ... for (const staged of [false, true]) { const res = await gitDiffTool.execute({ cwd: repoPath, s"
- **[[c2]]** `code` `src/mcp/build-step/phases/validate.ts:161-164` — "const changeLog = await collectBuildChangeLog(repoPath, { author: 'insrc-build', timestamp: now }); persistBuildRecord(repoPath, { ... body: { tasks: [{ id: taskId, passed }], ...(changeLog.length > 0"
- **[[c3]]** `code` `src/prompts/build/implement-task.md:26` — "4. If green, **commit** referencing the Task and its issue: — the ordering that guarantees a clean working tree by the time the validate phase collects the change set."
- **[[c4]]** `code` `src/workflow/runners/build/standalone-record.ts:139-149` — "if (rec.body.commit !== undefined) { lines.push('', `**Commit:** ${rec.body.commit}`); } ... const summary = rec.body.summary?.trim() ?? ''; if (summary.length > 0) { lines.push('', '## Summary', '', "
- **[[c5]]** `code` `src/workflow/runners/build/standalone-record.ts:114-130` — "renderStandaloneBuildRecordMd returns only the title, the size-class/created line, `## Scope` and an optional `## Triage rationale` — it reads none of changeLog, feedback or summary. Its doc comment s"
- **[[c6]]** `code` `src/workflow/runners/build/standalone-record.ts:186-203` — "const merged = mergeWithPrior(jsonPath, rec); ... const md = merged.meta.standalone ? renderStandaloneBuildRecordMd(...) : renderPlanBuildRecordMd(merged);"
- **[[c7]]** `code` `src/workflow/runners/build/standalone-record.ts:246-266` — "function mergeWithPrior(jsonPath: string, rec: BuildRecord): BuildRecord { ... const meta: BuildRecord['meta'] = { ...rec.meta, createdAt: prior.meta.createdAt, ... } — the new write wins on every met"
- **[[c8]]** `code` `src/workflow/runners/build/completion-record.ts:38-45` — "ensureBuildRecordOnCompletion calls collectBuildChangeLog and writes body: { tasks: [], ...(changeLog.length > 0 ? { changeLog } : {}) } — the second producer, defeated by the same working-tree depend"
- **[[c9]]** `code` `src/workflow/artifacts/format/bindings.ts:91-93` — "export function changeLogBodyLines(changeLog: ChangeLog | undefined): string[] { if (changeLog === undefined || changeLog.length === 0) return []; — the renderer correctly shows nothing for an absent "
- **[[c10]]** `code` `src/mcp/build-step/phases/implement.ts:133-140` — "persistStandaloneBuildRecord(repoPath, { meta: { workflow: 'build', standalone: true, sizeClass, ... }, body: { focus: specFocus, producesLld: false } }); — the third and last BuildRecord body writer;"
- **[[c11]]** `code` `src/daemon/tools/builtins/git/diff.ts:55-70` — "id: 'git_diff' ... 'Supports unstaged (default), staged, arbitrary commit ranges, or a specific path.' with `from` ('Starting ref for a range diff') and `to` ('Ending ref. When omitted with `from`, de"
- **[[c12]]** `code` `src/workflow/code-review/grounding.ts:150-168` — "it derives the changed set from the working-tree diff, falls back to the last commit (`git_diff {from:'HEAD^'}`, then the root commit) when the tree is clean ... EMPTY_TREE_HASH = '4b825dc642cb6eb9a06"
- **[[c13]]** `code` `src/workflow/code-review/__tests__/diff-grounding.test.ts:146-152` — "assembler (integration): a clean-working-tree repo recovers the last commit via the real git_diff HEAD^ fallback — read-only ... try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch "
- **[[c14]]** `code` `src/mcp/build-step/phases/validate.ts:67-97, :121-127, :163` — "if (input.standalone !== undefined) return handleStandaloneValidate(...) ... runValidateSession is shared by 'BOTH the plan-driven and the standalone (S002) branches so the verdict + persist behaviour"
- **[[c15]]** `code` `src/mcp/build-step/__tests__/build-step.test.ts:393-397` — "assert.ok(Array.isArray(rec.body.changeLog), 'a non-empty changed set lands a `changeLog` on the record') — the existing test, whose own precondition explains why it passes today while the feature doe"
- **[[c16]]** `prior-artifact` `ISSUE-93081bff91ae5108` — "The defect record this LLD designs against: three producer-side defects sharing one root, with the reproduction (clean tree -> 0 entries, one dirty file -> 1) and the four decisions deliberately left "
