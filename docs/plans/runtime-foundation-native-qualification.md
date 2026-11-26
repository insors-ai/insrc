# Native runtime foundation qualification

The explicit harness is `scripts/qualify-runtime-foundation.mjs`. It requires
a built, committed checkout, Node 22 for the development orchestrator, Git,
the platform C compiler, and live access to the official Node download site
and npm registry. Use an ordinary user. Windows needs the Visual Studio
developer environment (`cl.exe`) and PowerShell. No elevated commands are used.

```sh
export ONNXRUNTIME_NODE_INSTALL_CUDA="${ONNXRUNTIME_NODE_INSTALL_CUDA-skip}"
export INSRC_BUILD_CONFIRM_CLOSURE=1
npm run build
node scripts/qualify-runtime-foundation.mjs
```

On Windows, set the equivalent environment variables in the developer
PowerShell terminal, then run the same npm and node commands. `--parent PATH`
chooses an existing local directory for a newly allocated `iq-*` evidence root;
`--baseline LABEL` records the qualified baseline. The harness never reuses an
existing home. Keep macOS parent paths short enough for Unix sockets.

The first printed line gives the full `result.json` path. Retain the complete
root, including command journals, private source build proof and cleanup records.
Failures retain their evidence and return nonzero. Do not delete an uncertain
actor's retained state based on PID or age.

The harness downloads the pinned official runtime into a fresh isolated home,
reacquires the native controller lock, and proves offline reuse with a transport
that fails if called. It executes a real resolver binding under the installed
Node, checks matching npm and headers (and Windows node.lib/ACL/named endpoint),
and prepares the actual committed source through `devDelivery.prepare`. It then
verifies the application-only receipt, loads the real native modules, and invokes
the installed manager with the canonical runtime. Running Node and loaded
control-library paths are outside the published runtime tree. Child actors must
close through the owned coordinator before a pass is written.

This client exercises only the preparation boundary. Its controller remains in
`preparing`; it supplies no lifecycle or migration fixtures and never starts the
daemon or Ollama. It does not certify daemon activation, IDE flows, future
Windows bridge work or a complete install/upgrade. Its output has
`releaseEnablement: false` and cannot satisfy the publisher's separate native
release qualification contract.

Run separately inside UTM macOS, OrbStack Linux and a genuine Windows runner.
Record the VM/runner identity and OS observations alongside each result. A host
run checks harness setup only. Foreign archives and fixture tests cannot stand
in for execution on those platforms. Missing native infrastructure remains an
unsatisfied test, and cannot enable a target.

The existing manual CI workflow has a `runtime-foundation` scope for a genuine
Windows2025 x64 runner:

```sh
gh workflow run ci.yml --ref installer -f scope=runtime-foundation
```

It sets up the development SDK/MSVC context without elevation, runs the native
PowerShell bootstrap/runtime/controller tests through the canonical coordinator,
then runs the fresh-home harness. The default `backend` scope is unchanged.
Diagnostics are retained as an Actions artifact; application/runtime binaries are
not uploaded. A queued or failed job is not passing native evidence. This job
does not publish or enable a target. The Visual Studio shell setup follows
[Microsoft's developer-shell procedure](https://learn.microsoft.com/en-us/dotnet/framework/tools/developer-command-prompt-for-vs).

The final ordinary regression is separate: all `src/installer/__tests__/*.test.ts`,
installation-home, build-script, forbidden-spawn-scan and test-harness-coordinator
tests run through the canonical Node 22 coordinator at concurrency two. After
positive cleanup, record its run ID in
`.insrc/tmp/runtime-foundation-final-regression.json` and run the existing
`scripts/__tests__/installer-s2-qualification.test.ts` read-only auditor with
`INSRC_RUNTIME_FOUNDATION_REGRESSION=1`. It checks exact selection, source/output
fingerprints, complete passing coverage and matching actor-close journals.
