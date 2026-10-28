<!-- insrc:artifact CR-c32aa60534232f36-s1 -->

# Code review: c32aa60534232f36:s1

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 3 · model `claude:claude-sonnet-5`

**Changed files:** 14

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/design/corpus/sources/git-reader.ts | gitEnvironment is reached only via fixtures.ts#fixture/git (a test helper), and fixtures.ts is not itself listed as a file in the build gate's test record, so this path is present-but-unverified rather than confirmed passing — it is likely exercised indirectly by the passing adversarial.test.ts/source.test.ts/subject.test.ts suites that consume these fixtures, but the gate cannot confirm that directly. |
| LOW | src/workflow/code-review/investigation/work.ts | readApprovedWork is reached only via fixtures.ts#subjectFixture (a test helper), and fixtures.ts is not itself listed as a file in the build gate's test record, so this path is present-but-unverified rather than confirmed passing — it is likely exercised indirectly by the passing subject.test.ts/source.test.ts suites that consume this fixture, but the gate cannot confirm that directly. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/code-review/investigation/git-packets.ts:199 | readCommitPacket (and its helpers assertOid, decodeUtf8, assertRepoPath, rawChanges, span, add, plus ReviewGitReader.command/object/commit) show no reaching tests in the graph, and readCommitPacket itself has no recorded callers. git-packets.test.ts only calls the `fixture` helper — none of the new diff-parsing or commit-digest logic appears to be exercised by an assertion. This may be a grounding gap on a newly-added file rather than a true coverage hole, but it's worth confirming the test file actually invokes readCommitPacket/ReviewGitReader before trusting this module's parsing of untrusted git pack bytes (span offsets, rawChanges tab-splitting, decodeObject header checks). |
| MED | src/design/corpus/sources/git-reader.ts:62 | createGitRunner's abort()/stop()/settle() trio has no reaching tests (onAbort, abort, settle, stop all show empty testsReaching), and readPinnedSources itself has no recorded callers. abort() calls stop() which calls settle(error) to reject the in-flight promise, but settle() is presumably also invoked on normal process exit inside readPinnedSources; if an AbortSignal fires concurrently with process completion there is no visible guard preventing settle from being invoked twice or a completed read being silently discarded. Given this handles cancellation of a native git subprocess, that race path should be covered by a test, not left to the empty-grounding default. |
| LOW | src/design/corpus/sources/git-reader.ts:120 | abortRead() has no recorded callers and no callees — it reads as a leftover/unused exported helper rather than wired-in functionality. If it isn't referenced by anything outside this graph slice, it should be removed rather than kept as dead code. |

