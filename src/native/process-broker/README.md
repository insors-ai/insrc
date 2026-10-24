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
