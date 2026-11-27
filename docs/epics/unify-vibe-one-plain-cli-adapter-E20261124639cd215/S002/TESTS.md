<!-- insrc:artifact TESTS-639cd2159a87aedb-s2 -->

# Tests: 639cd2159a87aedb s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 11 pass, 0 fail, 0 skipped, 0 not found; 5 reported by the builder and not run by the gate.

## t1

Run at 2026-11-27T15:48:50.509Z on commit `24e76224e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: stableDescriptorHash computation excluding outputDir and its hit/miss decision -- two calls differing only in outputDir still hit the cache**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stableDescriptorHash computation excluding outputDir and its hit/miss decision -- two calls differing only in outputDir still hit the cache | `src/shared/__tests__/vibe-adapter-readonly-capability.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/vibe-adapter-readonly-capability.test.ts` | 0 | 2 | 0.4 s |  |

## t2

Run at 2026-11-27T15:54:19.794Z on commit `d8e838eea`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: stableDescriptorHash computation excluding outputDir and its hit/miss decision -- two calls differing only in outputDir still hit the cache**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stableDescriptorHash computation excluding outputDir and its hit/miss decision -- two calls differing only in outputDir still hit the cache | `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` |

**unit: buildArgv's read-only branch emits exactly the two connector_insrc_* flags and no approval flag**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | buildArgv's read-only branch emits exactly the two connector_insrc_* flags and no approval flag | `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` |

**integration: the recorded argv matching buildArgv's own values exactly except outputDir**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the recorded argv matching buildArgv's own values exactly except outputDir | `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` | 0 | 5 | 0.4 s |  |

## t3

Run at 2026-11-27T16:09:25.450Z on commit `a22553737`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 5 reported by the builder and not run by the gate.

**unit: effectiveConfigFingerprint extraction from a fake export.json at qualification time; a missing/unparsable export.json fails qualification closed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | effectiveConfigFingerprint extraction from a fake export.json at qualification time; a missing/unparsable export.json fails qualification closed | `src/shared/__tests__/vibe-adapter-readonly-qualification.test.ts` |

**unit: concurrent cache misses for the identical stable descriptor coalescing into one in-flight qualification promise**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | concurrent cache misses for the identical stable descriptor coalescing into one in-flight qualification promise | `src/shared/__tests__/vibe-adapter-readonly-qualification.test.ts` |

**unit: the allow-side probe's bounded retry tolerating simulated connector-not-registered attempts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the allow-side probe's bounded retry tolerating simulated connector-not-registered attempts | `src/shared/__tests__/vibe-adapter-readonly-qualification.test.ts` |

**unit: structural catalog evidence: exclusion/denial of a disallowed tool passes qualification; exclusion/denial of a REQUIRED tool fails it -- the reconciled polarity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | structural catalog evidence: exclusion/denial of a disallowed tool passes qualification; exclusion/denial of a REQUIRED tool fails it -- the reconciled polarity | `src/shared/__tests__/vibe-adapter-readonly-qualification.test.ts` |

**unit: a genuine bypass-absence failure (a disallowed tool actually completes) failing qualification immediately, never retried**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a genuine bypass-absence failure (a disallowed tool actually completes) failing qualification immediately, never retried | `src/shared/__tests__/vibe-adapter-readonly-qualification.test.ts` |

**integration: the VibeReadOnlyUnavailableError path when probes exhaust the retry bound or export.json is unusable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the VibeReadOnlyUnavailableError path when probes exhaust the retry bound or export.json is unusable | `src/shared/__tests__/vibe-adapter-readonly-qualification.test.ts` |

**live: the allowed-tool execution proof: a confirmed completed-call effect row for insrc_analyze and insrc_analyze_step under --enabled-tools connector_insrc_insrc_analyze/connector_insrc_insrc_analyze_step, tolerating connector flakiness via bounded retry -- an unresolved result here is accepted as 'stays unavailable', per review r3 finding 4, not a test failure**

Reported by the builder, not run by the gate: **pass**. Evidence: Live run against the installed vibe 3.1.4 binary via qualifyReadOnlyCapability(context, {command:'vibe'}, 2): resolved status:'unavailable', reason 'allow-side probe: insrc_analyze and/or insrc_analyze_step did not show a confirmed completed call (attempt 2/2)' after 112.7s. Separately confirmed by direct interactive probing this session: the model's own live diagnostic reports the insrc MCP connector is not registered in its callable toolset in this environment, even though config.enabled_tools correctly lists the two connector_insrc_* tools as requested. This is the explicit accepted 'stays unavailable' outcome, not a defect in the suite -- it correctly detected genuine non-availability.

**live: the blocked-tool proof via structural catalog enumeration (no actual write attempted)**

Reported by the builder, not run by the gate: **pass**. Evidence: Same live run's export.json config.enabled_tools contained exactly the two requested connector_insrc_* tools and nothing else -- every other (disallowed, including write/bash) tool was absent, proving the block structurally. No write tool call was ever attempted.

**live: the blanket-bypass absence proof via catalog enumeration**

Reported by the builder, not run by the gate: **pass**. Evidence: Same live run: enabledToolsFrom(exportObj) contained no tool outside the two-tool allowlist, so the suite's bypass check (filter for tools not in `required`) found nothing and did not fire the bypass-absence failure path.

**live: the ac4 no-mutation proof via structural catalog evidence that write/bash tools are absent or denied, never via an actual write under the production profile**

Reported by the builder, not run by the gate: **pass**. Evidence: Same live run's export.json confirms write_file/edit/bash-style tools are absent from config.enabled_tools under the pinned read-only descriptor; the qualification suite never attempts a real write -- the proof is structural-only, per the LLD's own design.

**live: the export.json effective-config fingerprint actually present and parsable on a real run**

Reported by the builder, not run by the gate: **pass**. Evidence: Direct verification against a real captured export.json from an earlier live probe this session (vibe_version 3.1.4, 116 config keys): effectiveConfigFingerprintFrom's own logic (JSON.stringify({vibeVersion, config}) then sha256) produced a real, non-trivial 64-char hex fingerprint. The qualify run above did not reach this step itself since the allow-side check failed first, but the fingerprint-extraction logic itself is independently proven against real export.json content.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/vibe-adapter-readonly-qualification.test.ts` | 0 | 7 | 0.6 s |  |

## t4

Run at 2026-11-27T16:21:47.095Z on commit `b6909db9d`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the cache-miss-on-descriptor-change path when the binary content or pinned env changes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the cache-miss-on-descriptor-change path when the binary content or pinned env changes | `src/shared/__tests__/vibe-adapter-readonly-field.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/vibe-adapter-readonly-field.test.ts` | 0 | 2 | 0.4 s |  |
