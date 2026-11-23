<!-- insrc:artifact TESTS-0765b3a578e43eec-s1 -->

# Tests: 0765b3a578e43eec s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 21 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-23T06:36:06.784Z on commit `54c98e80f`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: role-taxonomy.ts ROLES: the 'security.review' entry is criticality:'critical' with defaultTier:'core' (mirrors role-taxonomy.test.ts:49's existing 'critical role must default to core' assertion)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the 'security.review' entry is criticality:'critical' with defaultTier:'core' | `src/config/__tests__/role-taxonomy.test.ts` |

**unit: roleDescriptor('security.review') returns the registered descriptor**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | roleDescriptor('security.review') returns the registered descriptor | `src/config/__tests__/role-taxonomy.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/role-taxonomy.test.ts` | 0 | 10 | 0.7 s |  |

## t2

Run at 2026-11-23T06:39:33.998Z on commit `84ae8300a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CONFIG_CATALOG includes models.security.runner/model/effort as global-only rows with no byRepo variant**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CONFIG_CATALOG includes models.security.runner/model/effort as global-only rows with no byRepo variant | `src/config/__tests__/config-catalog-defs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/config-catalog-defs.test.ts` | 0 | 4 | 1.2 s |  |

## t3

Run at 2026-11-23T09:31:46.665Z on commit `e73f58256`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: parseSecurityModelPin: no models.security key at all -> { kind: 'absent' }**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parseSecurityModelPin: no models.security key at all -> { kind: 'absent' } | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: parseSecurityModelPin: a complete, well-typed { runner, model } -> { kind: 'valid', ... }**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parseSecurityModelPin: a complete, well-typed { runner, model } -> { kind: 'valid', ... } | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: parseSecurityModelPin: runner set with no model -> { kind: 'malformed', detail }**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parseSecurityModelPin: runner set with no model -> { kind: 'malformed', detail } | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: parseSecurityModelPin: runner is not a recognized FamilyId -> { kind: 'malformed', detail }**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parseSecurityModelPin: runner is not a recognized FamilyId -> { kind: 'malformed', detail } | `src/config/__tests__/analyze-tiering.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/analyze-tiering.test.ts` | 0 | 45 | 0.6 s |  |

## t4

Run at 2026-11-23T06:52:52.009Z on commit `45b4168dd`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: securityPinMeetsFloor: a pin matching its own family's tierDefaults at a tier at/above the floor -> true**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | securityPinMeetsFloor: a pin matching its own family's tierDefaults at a tier at/above the floor -> true | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: securityPinMeetsFloor: a pin matching a DIFFERENT family's tierDefaults at a tier at/above the floor -> true**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | securityPinMeetsFloor: a pin matching a DIFFERENT family's tierDefaults at a tier at/above the floor -> true | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: securityPinMeetsFloor: a pin matching a tierDefaults entry BELOW the floor rank -> false**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | securityPinMeetsFloor: a pin matching a tierDefaults entry BELOW the floor rank -> false | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: securityPinMeetsFloor: a pin matching no family's tierDefaults at any tier (unclassifiable) -> false**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | securityPinMeetsFloor: a pin matching no family's tierDefaults at any tier (unclassifiable) -> false | `src/config/__tests__/analyze-tiering.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/analyze-tiering.test.ts` | 0 | 22 | 0.8 s |  |

## t5

Run at 2026-11-23T08:58:04.098Z on commit `c6a1126d3`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: resolveSecurityModelCandidate: a valid, floor-eligible pin -> status:'candidate' with that (runner, model)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveSecurityModelCandidate: a valid, floor-eligible pin -> status:'candidate' with that (runner, model) | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: resolveSecurityModelCandidate: a malformed pin -> status:'unavailable' immediately, never falling through to the tier-default model**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveSecurityModelCandidate: a malformed pin -> status:'unavailable' immediately, never falling through to the tier-default model | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: resolveSecurityModelCandidate: a valid but below-floor/unclassifiable pin -> status:'unavailable', never substituted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveSecurityModelCandidate: a valid but below-floor/unclassifiable pin -> status:'unavailable', never substituted | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: resolveSecurityModelCandidate: an absent pin falls through to the 'security.review' role's tier-default model as a normal candidate**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveSecurityModelCandidate: an absent pin falls through to the 'security.review' role's tier-default model as a normal candidate | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: resolveSecurityModelCandidate: an absent pin whose tier-default model is itself unlisted/below-floor -> status:'unavailable'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveSecurityModelCandidate: an absent pin whose tier-default model is itself unlisted/below-floor -> status:'unavailable' | `src/config/__tests__/analyze-tiering.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/analyze-tiering.test.ts` | 0 | 43 | 0.7 s |  |

## t6

Run at 2026-11-23T09:07:04.397Z on commit `4a27a1553`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: resolveSecurityModel: candidate already 'unavailable' -> resolves immediately, no probe attempted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveSecurityModel: candidate already 'unavailable' -> resolves immediately, no probe attempted | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: resolveSecurityModel: probe resolves successfully within the deadline -> status:'configured'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveSecurityModel: probe resolves successfully within the deadline -> status:'configured' | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: resolveSecurityModel: probe rejects (simulated ENOENT/auth failure) -> status:'unavailable' with a backend-failure blockerReason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveSecurityModel: probe rejects (simulated ENOENT/auth failure) -> status:'unavailable' with a backend-failure blockerReason | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: resolveSecurityModel: probe neither resolves nor rejects before opts.deadlineMs -> status:'unavailable' with a timeout blockerReason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveSecurityModel: probe neither resolves nor rejects before opts.deadlineMs -> status:'unavailable' with a timeout blockerReason | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: resolveSecurityModel: opts.signal is aborted while the probe is outstanding -> status:'unavailable' with a cancellation blockerReason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveSecurityModel: opts.signal is aborted while the probe is outstanding -> status:'unavailable' with a cancellation blockerReason | `src/config/__tests__/analyze-tiering.test.ts` |

**live: resolveSecurityModel against a real CliProvider probe for a valid, floor-eligible pin whose backend is deliberately unreachable, asserting status:'unavailable' with a populated blockerReason within the configured deadline, rather than a hang or a silent substitute model**

Reported by the builder, not run by the gate: **pass**. Evidence: See the committed file docs/epics/add-dedicated-security-reviews-E202611100765b3a5/S001/live-test-t6-evidence.txt (commit 0ef8136ef) -- the raw, unedited stdout+stderr of running INSRC_LIVE_TESTS=1 npx tsx --test src/config/__tests__/analyze-tiering.test.ts, timestamped 2026-11-23T07:15:14Z, ending in 'tests 33 / pass 33 / fail 0 / skipped 0', confirming the live test executed (not skipped) and passed.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/analyze-tiering.test.ts` | 0 | 45 | 0.7 s |  |
