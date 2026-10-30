<!-- insrc:artifact CR-3789fd85d0bbeb22-s1 -->

# Code review: 3789fd85d0bbeb22:s1

⛔ **BLOCK** — HIGH 1 · MED 3 · LOW 0 · model `claude:claude-sonnet-5`

**Changed files:** 14

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/agent/providers/cli-provider.ts:1 | The plan promises an integration-level test 'Affected native and ordinary provider regressions and build pass,' but no test title or reportedTests entry in the grounding corresponds to it. The 5 test files in the record and the 4 build tasks (t1-t4) all show passing/pass, which is consistent with this promise in substance, but there is no discrete test artifact mapped to this name, so it cannot be confirmed as a distinct executed check. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/review-investigation-canaries.ts | createProbeCanaries is a single routine that owns six nested closures (put, command, hook, activate, signals, assertCurrent) each mutating shared local state (digest freezing, private-file writes, shell command construction, hook wiring, phase activation, signal parsing). Mixing these distinct responsibilities as closures inside one function instead of named top-level helpers makes the control flow hard to follow and easy to break when one responsibility changes without the others being re-checked. |
| MED | src/agent/providers/native-investigation-probe.ts | runNativeInvestigationProbe inlines four local closures (check, controlCost, admit, expected) on top of ~14 direct callees spanning budget admission, image/catalog verification, environment setup, and session launch. This orchestrator does too many unrelated things in one scope, which raises the chance that a change to one concern (e.g. budget admission) silently breaks another (e.g. image-pinning checks) without a corresponding test catching it. |
| MED | src/agent/providers/claude-investigation-session.ts | claudeInvestigationArgs/claudeInvestigationControlArgs builds the claude CLI invocation args from (schema, modelArgs, cwd, indexed) independently of claudeReviewSessionArgs in cli-provider.ts, which builds claude CLI args from (schema, modelArgs) for the ordinary review-session path. Two independent arg-building functions for the same claude binary invocation risk drifting apart (e.g. one adding a new required flag the other omits) since neither calls the other. |

## diagram — 0 finding(s)

_No findings._

