<!-- insrc:artifact ISSUE-3275fb2e9a542cd6 -->

# Make the test harness hermetic and bounded

## Reproduction

On macOS arm64, run the backend test sweep while multiple fixture suites rebuild the checkout's out/ directory. The audit observed ENOTEMPTY during cleanup, missing compiled helpers, nested npm using Node 26 despite a Node 22 parent, and cascading EADDRINUSE failures. Loading src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts creates MessageChannel ports without registering a test; the sweep does not complete. Interrupting repeated VS Code type probes leaves a deliberately invalid source file in the compiler's include tree. Expected: owned resources and generated output remain isolated and are reclaimed on success, failure and interruption. Audit evidence and limits are recorded in docs/plans/failing-tests-2026-11-20.md.

## Root cause

The profiled existing test file allocates ports at module scope but relies on a test hook despite having no test declarations. The shared build cleanup entrypoint removes one checkout-wide output directory; independent fixture rebuilds can race. Child runtime resolution and temporary probe ownership are not uniformly isolated. These are harness defects; broker permission denials and audit time limits do not establish production defects.

## Fix intent

Establish a single documented test-output ownership and Node-22 runtime policy; ensure every test-owned port/process/probe has cleanup on all exit paths, including empty-file and interrupted runs; make build-dependent suites safe to run without corrupting each other's prerequisites. Acceptance: the known empty-file hang terminates, focused rebuild suites do not race or lose helpers, probes leave no source files, and a bounded focused run reports meaningful failures without weakening assertions or production security. Production lifecycle diagnosis is a separate batch.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md#execution-and-limits`
- **[[c2]]** `code` `src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts`
- **[[c3]]** `code` `scripts/clean-output.mjs`
