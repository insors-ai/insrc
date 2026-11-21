# Current client and bootstrap packaging evidence

Story 175ab0d1d56838a9/s1, task t5, 2026-11-21.

The standalone source installer embeds the fixed shared bootstrap asset set and
its digest. `--print-runtime` delegates to that same provisioner and does not
clone, build or activate an installation. `--runtime-archive FILE` supplies a
local archive to the same pinned digest/extraction checks. Both IDE packages use
the same installer producer; externally supplied release installers must contain
byte-matching canonical runtime assets. The release verifier/key embedding stays
in the existing release packager. Existing published or signed bytes were not
modified. Newly staged candidates and bootstrap archives carry the additional
assets before existing fingerprint/signing/publication steps.

JetBrains no longer probes system Node or downloads/extracts its own pinned
version. Its injectable adapter invokes the bundled shell owner, validates the
returned owned path, and propagates provisioning failures. Current lifecycle
commands continue through daemon-ctl and preserve managed controller ownership.
VS Code likewise delegates through the fixed shell. Both strip Node injection
variables at child boundaries; no IPC name or payload changed.

Canonical coordinator run `aedc63b6-c15c-449b-bbf5-e8bca5389d20` passed all seven
selected files: focused JetBrains JUnit bridge, runtime packaging, actual shell
runtime matrix, macOS candidate layout, Linux candidate layout, VS Code
controller and subprocess boundary. Cleanup recorded `confirmedClosed: true`.
The focused JUnit bridge reads the run's isolated XML before cleanup rather than
stale reports in the shared build directory. Earlier runs exposed and corrected
a duplicated Gradle resource and test fixture/report-location errors.

The packaged installer native case starts with an empty HOME and no Node/npm on
PATH, using the retained official archive, and records actual Node 22.22.1. It
also exercises stdin (`bash -s`) and verified offline reuse, with extracted
bootstrap assets cleaned afterward. This is actual macOS arm64 execution;
Linux candidate layout tests are structural fixtures, not native qualification.

Run `22f4f927-7931-4382-9855-fa34889045c1` separately passed existing signed
staging/fingerprint and bundle-metadata tests. The CLI/VS Code/JetBrains macOS
upgrade routing matrix passed in run `3a66a7cb-539f-44e2-a779-e325f41505cc`.

All public target enablement remains gated by task t7's actual install/build and
native compatibility qualification. No Windows source runtime is advertised.

The build validator requested explicit VS Code command coverage. The extended
command test now drives the real command/controller composition through all five
commands, checks fixed-shell delegation and surfaces owned-runtime failures.
Both clients' MCP registrations were also moved from global `node` plus a JS
path to `/bin/bash` plus the owned-runtime wrapper; project scoping is retained.
Run `52a0c6b2-b68c-4ee2-8837-28a9bcc2a1e9` passed JetBrains registration/JUnit,
actual IDE-composed MCP execution, packaging, VS Code controller, subprocess and
JSON/TOML adapter/writer tests. Its new command test initially used an overly
broad wording assertion; after correction the command file passed in run
`8b92bd7f-46a9-48be-a4eb-745a6bd3e118`.
