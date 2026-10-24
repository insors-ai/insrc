# Internal process-capability broker

The build compiles `main.c` and the host backend into `out/bin/insrc-process-broker`.
It uses the local C compiler (`CC`, default `cc`). Runtime never compiles or downloads code.
Build errors are fatal; the Node client must refuse a missing or unavailable broker.

The executable accepts one positive PID. It captures a kernel capability first,
then validates the observed incarnation and command. Commands must end in
`daemon/index.js` or `daemon/index.ts`. Target termination never uses `kill(pid)`.

Linux uses `pidfd_open`, `poll`, and `pidfd_send_signal`. Metadata is rejected if
the captured handle reports exit while the PID metadata is read. Darwin uses a
retained Mach task right and its audit token's PID version, with a second token
check after reading arguments. Task-right permission failures refuse readiness;
there is no privilege escalation or fallback.

Darwin runtime support requires a real Darwin validation run. Linux tests and
injected permission failures do not establish that support.

## Platform evidence matrix

Recorded for the 2026-10-24 build on a Linux host. The test source is
`src/shared/__tests__/process-broker-native.test.ts`; the daemon-run results are
in `docs/standalone/daemon-stop-must-wait-process-end-E20261013fd8d70c3/S001/TESTS.md`.

| Platform or boundary | Evidence performed | Status and limit |
| --- | --- | --- |
| Linux build and packaging | The test hook runs the actual `npm run build`; the produced executable is exercised and its imported symbols inspected. | Passed on this Linux host. Runtime needs neither the compiler nor the source tree. |
| Linux retained capability | Disposable daemon stand-ins exercise capture, state, termination, post-exit requests, close/EOF, malformed framing and non-daemon refusal. | Passed with real pidfds. A later process is kept alive while requests to the original exited handle report EXITED. This does not manufacture numeric PID reuse. |
| Permission and unsupported failures | The real protocol is linked to a test-only backend returning EPERM or ENOTSUP before readiness; missing metadata is also injected. | Passed for the protocol boundary. These adapters do not execute Darwin kernel APIs or prove behavior of an old Linux kernel. |
| Darwin compilation and packaging | A Darwin backend and build selection are present in source. No Darwin compiler/SDK run was available on this host. | **Unverified.** Linux compilation does not compile the Darwin backend. |
| Darwin task-right acquisition, identity, termination and exit | No real Darwin runtime run has been performed. | **Unverified; operational support is not claimed.** Real Darwin evidence is required before that claim. Denied/unavailable capabilities must refuse readiness, with no PID-kill fallback. |
| Other platforms | The build script explicitly rejects platforms outside Linux and Darwin. | Unsupported by policy; no other-platform runtime run is claimed. |

The native Linux feasibility probe performed before this implementation is not
a substitute for the tests above. This matrix does not complete the watchdog,
full restart wiring, historical-cause investigation, or installed-daemon smoke.

## Protocol version 1

All messages are ASCII lines. Marker and command are UTF-8 bytes encoded as hex.

- Ready: `READY 1 <pid> <marker-hex> <command-hex>`.
- Startup failure: `ERROR <category> <errno>` followed by exit.
- Request: `<positive-u32-id> STATE`, `TERM`, or `CLOSE`.
- Response: `<id> ALIVE`, `EXITED`, `SENT`, or `CLOSED`.
- Request failure: `<id> ERROR <category> <errno>`.

Categories include `gone`, `denied`, `unsupported`, `unverifiable`,
`invalid-target`, `wrong-target`, `invalid-operation`, and `malformed-request`.
Malformed framing closes the session. EOF or CLOSE releases the capability
without terminating the target. The Node client enforces readiness/request
deadlines and is responsible for helper cleanup.

The broker opens no store, socket, or network connection. Its stdio channel is
internal to the daemon/CLI and is not registered as a user-facing tool.

The CLI and shutdown watchdog share `src/shared/daemon-process-client.ts`; there is one broker framing, identity-validation and request implementation. The normal build uses esbuild already supplied by tsx to bundle that Node-only client into `out/bin/insrc-shutdown-watchdog.js`, and verifies that every remaining runtime import is a Node built-in. The watchdog source can share modules without introducing a storage dependency into the packaged executable.
