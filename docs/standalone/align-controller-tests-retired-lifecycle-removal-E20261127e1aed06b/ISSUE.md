<!-- insrc:artifact ISSUE-e1aed06b860a76cb -->

# Align controller tests with retired lifecycle removal

## Reproduction

Under Node 22.22.1, run the two controller files directly, one file at a time, as prescribed in docs/testing.md. The independent pre-budget ae1b93f79 reproduction retained in .insrc/tmp/budget-t2-controller-baseline-ae1b93f79.tap fails three selected cases: Build stages and specialized launcher gate policies survive wrapper integration; Native refusal and saved-mode controls remain enforced; Five prepared consumers reuse helpers and raw invocations refuse missing context. The first expects retired builder commands; the other two select deleted test files. Expected: controller checks exercise current behavior and succeed without references to intentionally removed lifecycle implementation. This blocks the required final controller checks for the installer budget correction. [[c1]] [[c2]] [[c4]] [[c5]]

## Root cause

The lifecycle removal was intentional, but scripts/__tests__/test-harness-commands.test.ts:44 and scripts/__tests__/test-harness-commands.test.ts:79 retain an obsolete builder list and deleted daemon-process-client selector, while scripts/__tests__/test-harness-consumers.test.ts:12 retains five deleted lifecycle consumers. Current buildStages no longer contains those retired builders. The analyzer located the current helpers and all three literal sites; its caller graph was incomplete, so direct rg supplemented requirePreparedBuild uses and found only its helper plus coordinator fixtures. These are pre-existing test drift, separate from the budget implementation. [[c1]] [[c2]] [[c3]]

## Fix intent

Correct this as one bounded test-maintenance batch in the two controller test files. Align the build-stage expectation with the accepted current build pipeline. Replace the deleted native-refusal selector with relevant existing current refusal/control coverage while retaining the saved-mode check. Retire or replace the test devoted exclusively to removed consumers after checking actual current consumers; preserve applicable prepared admission refusal, immutable output, writer/drift protection, retirement mutation regression and positive cleanup. Run both controller files and surrounding controller checks directly under Node 22, serially, following the existing documented ownership model. Require actual selected test success and complete closure; no skip, failure waiver, acceptance of nonzero consumer outcomes, production helper/runtime/budget change or native release enablement. Do not alter or overlap the active UTM native run. [[c1]] [[c2]] [[c3]] [[c4]]

## Citations

- **[[c1]]** `code` `scripts/__tests__/test-harness-commands.test.ts:44` — "'build-process-broker.mjs', 'build-shutdown-watchdog.mjs'"
- **[[c2]]** `code` `scripts/__tests__/test-harness-consumers.test.ts:12` — "const consumers = ['src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts'"
- **[[c3]]** `code` `scripts/test-harness/build.mjs:39` — "buildStages(run, { npmCli } = {})"
- **[[c4]]** `doc` `docs/testing.md#testing-the-coordinator-itself` — "Controller integration tests create and test ownership themselves, so run them directly with Node 22 and one file at a time:"
- **[[c5]]** `doc` `.insrc/tmp/budget-t2-controller-baseline-ae1b93f79.tap` — "# tests 3
# pass 0
# fail 3"
