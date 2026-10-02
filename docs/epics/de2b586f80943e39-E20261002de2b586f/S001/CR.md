<!-- insrc:artifact CR-de2b586f80943e39-S001 -->

# Code review: de2b586f80943e39:S001

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 7 · model `client`

**Changed files:** 2

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/tracker/resolve.ts:134 | The delivered change is BROADER than the approved fixIntent's own count, and the record should be reconciled rather than left to a reader to notice. The ISSUE says the correction 'covers both DEF-only gates'. There were THREE: listEpicHashes (:134), buildRef's identity read (now readEpicIdentity, :169), and resolveByHier's date match which read DEF-<hash>.json directly (:324). Two further changes were also needed to reach the stated outcome — LABEL_RE, because the correct target form 'S001/t1' would not even parse, and storyArtifactPath, because a hierarchical id yields the lowercase label while bugfix artifacts are named '-S001.json'. All five serve the single stated outcome (an approved PLAN's tasks become addressable through the normal task-level target forms) and none strays into the three explicit non-goals, so this is the ISSUE under-counting rather than the build over-reaching. The commit message enumerates all five. |
| LOW | src/workflow/tracker/resolve.ts:110 | EpicIdentity carries `tracker`, but an ISSUE-anchored epic has no tracker block, so epicRef for a bugfix epic resolves to undefined after also missing HLD-<hash>.json. The ISSUE meta does carry a `parentRef` field which is NOT consulted. This is consistent with the fixIntent, which scopes the change to the IDENTITY anchor and not to tracker refs, and a bugfix story's storyRef/taskRef still resolve from its own LLD/PLAN tracker blocks (verified by the issue-number test). Recorded because it is the nearest adjacent thing a reader might expect to work and does not. |

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/tracker/resolve.ts:76 | The doc comment introducing ISSUE_RE describes the SYSTEM behaviour ('Consulted only where a DEF is absent, so DEF-bearing epics are unaffected') rather than the pattern itself. The claim is true in effect — listEpicHashes dedupes with DEF hashes first, and readEpicIdentity reads the DEF first — but it is enforced by those two call sites, not by the constant it sits above. A reader changing either call site would not see the invariant stated where it is actually maintained. |

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/__tests__/id-resolve.test.ts:360 | EPIC-LEVEL resolution for a DEF-less epic is not directly asserted. The new tests cover the task level (label, hierarchical and slug forms), the story level via issue number, DEF-wins precedence, single-enumeration of a dual-anchored hash, the never-guess multi-epic case, and the delete-the-ISSUE mutation — but not buildRef(dir, hash) with storyId undefined, which the ISSUE anchor also now enables. It is exercised indirectly, since resolveByHier and resolveByLabel share the same enumeration and identity read, so the gap is narrow. |
| LOW | src/workflow/tracker/resolve.ts:150 | COVERAGE NOTE, recorded to prevent a false reading of this review's own grounding rather than as a defect: the graph handed this review `testsReaching: 0` for both changed files. That is the known hollow-graph artifact for files changed in the commit under review, NOT an absence of tests. Coverage was judged by RUNNING the suites: src/workflow/__tests__/id-resolve.test.ts is 26/26 green with 8 tests added, and each of the five code changes was reverted in turn with at least one test going red every time (3, 4, 1, 1 and 4 failures respectively), so no added check is vacuous. Full sweep: 4130 tests, 4001 pass, 125 skipped, 1 fail — sqlite-driver.test.ts, confirmed pre-existing by stashing these changes and re-running, where it fails identically. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/tracker/resolve.ts:150 | storyArtifactPath falls back to a directory scan on every exact-name MISS, and that miss path can run inside a loop. resolveByIssue iterates all artifact files and calls buildRef per candidate; buildRef calls storyArtifactPath up to twice (LLD then PLAN). So a single issue-number resolution in a large artifacts dir — 648 files here — can trigger several readdir calls where it previously made two stat calls. Bounded and only on the miss path (the exact name is tried first, so every DEF-route lookup keeps its single-stat behaviour), but the scan result is not memoised across the two calls within one buildRef, which would be the cheap improvement if this ever matters. |
| LOW | src/workflow/tracker/resolve.ts:160 | storyArtifactPath returns the non-existent `exact` path on a miss rather than null, relying on every caller treating an unreadable path as 'absent' (readArtifact and readTrackerBlock both swallow and return null/undefined). That holds for both current callers and the behaviour is documented in the function's comment, but it is an implicit contract: a future caller that stats the returned path, or logs it, would be handling a path that was never claimed to exist. Returning `string \| null` would make the miss explicit at the cost of two null checks. |

