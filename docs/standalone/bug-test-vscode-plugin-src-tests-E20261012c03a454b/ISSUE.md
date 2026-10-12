<!-- insrc:artifact ISSUE-c03a454b11fd5933 -->

# Make the activation tests run to completion

## Reproduction

1. On main (a66eae5a), run the activation test file alone: `cd vscode-plugin && npx tsx --test src/__tests__/activation.test.ts` (Node 22, macOS).
2. Observed: 6 tests, 1 pass, 0 fail, 5 cancelled. 'runReachabilityProbe degrades a hung probe to errored within the bounded deadline' is cancelled with 'Promise resolution is still pending but the event loop has already resolved', and the four tests after it are cancelled too ('never throws even if reachability() rejects', 'activateExtension returns synchronously ...', 'the extension package is scaffolded ...', 'only extension.ts imports vscode ...'). The same 5 are cancelled in the full plugin suite.

Expected: all six tests run and report pass or fail.

## Root cause

runReachabilityProbe (vscode-plugin/src/activation.ts:34-58) races the daemon probe against a deadline promise. The deadline's setTimeout is deliberately unref()'d, with the comment 'Do not keep the process alive for the probe (Node hosts / tests)'. The hung-probe test passes a probe that never settles and a 20 ms deadline. While it awaits, the only pending work is that unref'd timer, which does not keep the event loop alive. The loop drains before the timer fires, and node:test reports the test as still pending and cancels it together with the tests that have not run yet. (This is diagnosed from the code and the error message; it has not yet been confirmed by a change.) In the VS Code extension host the event loop is kept alive by the host, so the product behaviour is not affected. Neither the test file nor activation.ts has changed since 2026-09-24 (9bb8c6f3); when the file started failing is not determined.

## Fix intent

The hung-probe test must keep the process alive long enough for the probe's deadline to fire, or otherwise stop depending on the unref'd timer, without changing the product's choice not to keep a host alive. All six tests in the file then run and report, so the five activation-shell checks they cover (deadline, never-throws, synchronous activation, package scaffold, the vscode-import boundary) are actually exercised again.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/activation.ts:34-58` — "timer = setTimeout(() => resolve('errored'), timeoutMs); // Do not keep the process alive for the probe (Node hosts / tests). ... (timer as { unref(): unknown }).unref(); ... reachability = await Prom"
- **[[c2]]** `code` `vscode-plugin/src/__tests__/activation.test.ts:46-52` — "test('runReachabilityProbe degrades a hung probe to errored within the bounded deadline', ...) ... await runReachabilityProbe({ client: hung, status, probeTimeoutMs: 20 }); assert.equal(status.current"
- **[[c3]]** `step-output` `npx tsx --test src/__tests__/activation.test.ts, 2026-10-12` — "# tests 6 / # pass 1 / # fail 0 / # cancelled 5; not ok 2 ... failureType: 'cancelledByParent' error: 'Promise resolution is still pending but the event loop has already resolved'"
- **[[c4]]** `step-output` `git log -2 -- vscode-plugin/src/__tests__/activation.test.ts vscode-plugin/src/activation.ts` — "9bb8c6f3 2026-09-24 feat(daemon): S001 daemon.update+updateOutcome IPC ...; 93c6f909 2026-09-22 feat(vscode): S006 Marketplace publish scaffolding ..."
