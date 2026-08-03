# Codex Prompt: Build a Standalone macOS mitmproxy Bootstrap

Build a standalone macOS setup package for running a local mitmproxy instance as a background user service.

This project must be completely independent of CAMON or any other monitoring application.

Its only responsibility is to install, configure, start, stop, restart, inspect, and uninstall a local mitmproxy service.

It must not decide which applications use the proxy.

It must not enable the macOS system proxy.

It must not modify Claude Code, Codex, Cursor, VS Code, browser, shell, or operating-system proxy settings.

The user will decide which applications are routed through mitmproxy.

---

# 1. Objective

Create a small, production-quality macOS bootstrap package that:

- Installs mitmproxy if it is not already installed
- Generates the mitmproxy certificate authority files
- Trusts the mitmproxy CA in the current user's login keychain
- Creates a user-level LaunchAgent
- Runs `mitmdump` as a background service
- Listens only on localhost
- Creates persistent stdout and stderr logs
- Provides helper scripts for lifecycle management
- Is safe to rerun
- Can be cleanly uninstalled

The default proxy endpoint should be:

```text
http://127.0.0.1:8080
```

No application should be configured automatically to use that endpoint.

---

# 2. Non-goals

Do not implement any of the following:

- Global macOS proxy configuration
- Per-application proxy configuration
- Claude Code proxy configuration
- Codex proxy configuration
- Cursor proxy configuration
- Browser proxy configuration
- CAMON integration
- mitmproxy addon installation
- Traffic filtering
- Traffic blocking
- Traffic modification
- Certificate pinning bypass
- System-wide CA installation by default
- Root daemon or LaunchDaemon setup
- Docker support
- Linux or Windows support

This project is macOS-only.

---

# 3. Deliverables

Create this project structure:

```text
mitmproxy-macos-bootstrap/
├── README.md
├── install.sh
├── uninstall.sh
├── start.sh
├── stop.sh
├── restart.sh
├── status.sh
├── logs.sh
├── lib/
│   └── common.sh
└── templates/
    └── local.mitmproxy.plist.template
```

All scripts must be executable.

Use Bash.

Target modern macOS versions.

---

# 4. Installed Layout

Use these locations:

```text
~/Library/Application Support/mitmproxy-local/
├── logs/
│   ├── stdout.log
│   └── stderr.log
├── config.env
└── backups/

~/Library/LaunchAgents/
└── local.mitmproxy.plist
```

Mitmproxy's own certificate and configuration files remain in:

```text
~/.mitmproxy/
```

Expected CA files include:

```text
~/.mitmproxy/mitmproxy-ca.pem
~/.mitmproxy/mitmproxy-ca-cert.pem
~/.mitmproxy/mitmproxy-ca-cert.cer
```

---

# 5. Runtime Choice

Use `mitmdump` as the background process.

Do not use `mitmweb` as the managed default.

The LaunchAgent should run the equivalent of:

```bash
mitmdump \
  --listen-host 127.0.0.1 \
  --listen-port 8080
```

Resolve the executable dynamically:

```bash
MITMDUMP_BIN="$(command -v mitmdump)"
```

Do not assume:

```text
/opt/homebrew/bin
```

or:

```text
/usr/local/bin
```

The setup must work for both Apple Silicon and Intel Homebrew installations.

---

# 6. Homebrew and mitmproxy Installation

The installer must:

1. Check whether `mitmdump` is already available
2. If available, use the existing installation
3. If unavailable, check whether Homebrew is installed
4. If Homebrew is installed, run:

```bash
brew install mitmproxy
```

5. If Homebrew is not installed, stop and print a clear message explaining that Homebrew must be installed first

Do not automatically install Homebrew.

After installation, verify:

```bash
command -v mitmdump
mitmdump --version
```

---

# 7. Certificate Generation

Mitmproxy generates its CA files when it starts for the first time.

If the CA certificate does not exist, start a temporary mitmdump instance on a temporary local port, for example:

```text
127.0.0.1:18080
```

Wait until:

```text
~/.mitmproxy/mitmproxy-ca-cert.pem
```

exists.

Then stop the temporary process cleanly.

Requirements:

- Use a timeout
- Clean up the temporary process on failure
- Use `trap` for cleanup
- Do not leave an orphaned mitmdump process
- Do not use the final port `8080` during certificate generation

---

# 8. Certificate Trust

Trust the mitmproxy CA in the current user's login keychain.

Use:

```bash
security add-trusted-cert \
  -r trustRoot \
  -k "$HOME/Library/Keychains/login.keychain-db" \
  "$HOME/.mitmproxy/mitmproxy-ca-cert.pem"
```

Requirements:

- Install into the current user's login keychain
- Do not install into the system keychain
- Do not require `sudo` for the default installation
- Detect whether the certificate is already trusted
- Avoid adding duplicate trust entries
- Print a clear success or failure message
- Explain that macOS may prompt the user for keychain authorization

If trust detection cannot be made completely reliable, implement a best-effort check and document the limitation.

---

# 9. LaunchAgent

Create:

```text
~/Library/LaunchAgents/local.mitmproxy.plist
```

The LaunchAgent must include:

- Label: `local.mitmproxy`
- ProgramArguments using the resolved absolute path to `mitmdump`
- `--listen-host`
- `127.0.0.1`
- `--listen-port`
- configurable port, default `8080`
- `RunAtLoad`
- `KeepAlive`
- stdout log path
- stderr log path
- working directory where appropriate

Use a generated plist rather than hardcoding the user's home directory.

Use XML-safe values.

Validate the generated plist with:

```bash
plutil -lint
```

The plist template should remain in:

```text
templates/local.mitmproxy.plist.template
```

The installer may render it using shell substitution or generate the final plist directly.

---

# 10. launchctl Lifecycle

Use modern `launchctl` commands.

Load:

```bash
launchctl bootstrap \
  "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/local.mitmproxy.plist"
```

Restart:

```bash
launchctl kickstart \
  -k \
  "gui/$(id -u)/local.mitmproxy"
```

Unload:

```bash
launchctl bootout \
  "gui/$(id -u)/local.mitmproxy"
```

Requirements:

- Handle the case where the service is already loaded
- Handle the case where it is not loaded
- Avoid duplicate LaunchAgent registrations
- Print useful diagnostics on failure
- Keep lifecycle logic in reusable functions in `lib/common.sh`

---

# 11. Port Handling

Default port:

```text
8080
```

Allow the installer to accept:

```bash
./install.sh --port 8080
```

Store the selected port in:

```text
~/Library/Application Support/mitmproxy-local/config.env
```

Example:

```bash
MITMPROXY_HOST=127.0.0.1
MITMPROXY_PORT=8080
LAUNCH_AGENT_LABEL=local.mitmproxy
```

Before installation or restart, check whether the chosen port is already in use.

Use tools available on macOS, such as:

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

Behavior:

- If the port is free, continue
- If the port is already used by the CAMON-managed LaunchAgent equivalent, continue safely
- If the port is used by another process, stop and show the PID/process details
- Do not kill unrelated processes

This project is standalone, so refer to the managed service as the local mitmproxy service, not CAMON.

---

# 12. Idempotency

All scripts must be safe to rerun.

The installer should detect and report:

```text
✓ mitmproxy already installed
✓ CA already generated
✓ CA already trusted
✓ LaunchAgent already installed
✓ LaunchAgent configuration unchanged
✓ mitmdump already running
```

When replacing the existing plist or config file:

- Create a timestamped backup
- Store backups under:

```text
~/Library/Application Support/mitmproxy-local/backups/
```

Example:

```text
local.mitmproxy.plist.backup-20260803-110200
```

Do not create a backup when the generated content is byte-for-byte identical.

---

# 13. Helper Scripts

## start.sh

Must:

- Load configuration
- Ensure the LaunchAgent plist exists
- Bootstrap the service if not loaded
- Kickstart it if loaded but not running
- Confirm the listener is active

## stop.sh

Must:

- Stop or boot out the LaunchAgent
- Not delete files
- Exit successfully if already stopped

## restart.sh

Must:

- Validate port availability
- Restart through `launchctl`
- Confirm the listener is active afterward

## status.sh

Must display:

- mitmproxy installation status
- mitmdump executable path
- mitmproxy version
- CA generation status
- CA trust status, best effort
- LaunchAgent installation status
- LaunchAgent loaded status
- Process PID
- Host and port
- Port listener status
- stdout log path
- stderr log path

Example output:

```text
mitmproxy installed: yes
mitmdump: /opt/homebrew/bin/mitmdump
version: 12.x
CA generated: yes
CA trusted: yes
LaunchAgent installed: yes
LaunchAgent loaded: yes
PID: 48102
Proxy: http://127.0.0.1:8080
Listener active: yes
```

## logs.sh

Default behavior:

```bash
tail -f "$LOG_DIR/stderr.log"
```

Support:

```bash
./logs.sh --stdout
./logs.sh --stderr
./logs.sh --both
```

---

# 14. Uninstall

The uninstall script must:

1. Stop and unload the LaunchAgent
2. Remove:

```text
~/Library/LaunchAgents/local.mitmproxy.plist
```

3. Optionally remove the application support directory
4. Optionally remove the trusted CA from the login keychain
5. Never remove Homebrew
6. Never uninstall mitmproxy automatically
7. Never delete `~/.mitmproxy` unless the user explicitly confirms

Support flags:

```bash
./uninstall.sh
./uninstall.sh --remove-data
./uninstall.sh --remove-cert
./uninstall.sh --remove-data --remove-cert
```

Default uninstall should preserve:

- mitmproxy installation
- mitmproxy CA files
- local logs and config

Print exactly what was removed and preserved.

---

# 15. Safety Requirements

- Use:

```bash
set -euo pipefail
```

- Quote all variable expansions
- Handle spaces in paths
- Never use `eval`
- Never use untrusted input in shell execution
- Validate port values
- Validate generated plist
- Use traps for temporary processes and files
- Never kill processes unless they were started by the script or belong to the known LaunchAgent
- Do not run the main service as root
- Bind only to `127.0.0.1`
- Do not bind to `0.0.0.0`
- Do not enable remote access
- Do not configure global proxy routing
- Do not change network settings
- Do not modify `/etc/hosts`
- Do not modify shell profiles

---

# 16. User Experience

The installer should provide concise progress messages.

Example:

```text
[1/7] Checking mitmproxy installation
      Found: /opt/homebrew/bin/mitmdump

[2/7] Checking mitmproxy CA
      Existing CA found

[3/7] Checking certificate trust
      Certificate already trusted

[4/7] Creating local service directories
      Done

[5/7] Installing LaunchAgent
      Done

[6/7] Starting mitmdump
      Running with PID 48102

[7/7] Verifying proxy listener
      Listening on 127.0.0.1:8080
```

At completion, print:

```text
mitmproxy is ready.

Proxy endpoint:
  http://127.0.0.1:8080

No applications have been configured to use this proxy.

Configure only the applications you explicitly want to route through it.

Logs:
  ~/Library/Application Support/mitmproxy-local/logs/
```

---

# 17. README

The README must cover:

- Purpose
- Scope
- Non-goals
- Requirements
- Installation
- Lifecycle commands
- Custom port setup
- Certificate trust
- Installed file locations
- Log access
- Uninstall behavior
- Troubleshooting
- Security considerations

Explicitly state:

> This project prepares a local mitmproxy service. It does not enable the macOS system proxy and does not configure any application to use the proxy.

Include examples for routing individual applications only as documentation, but do not automate them.

Examples may include:

```bash
HTTPS_PROXY=http://127.0.0.1:8080 command
```

These examples must be clearly labeled as optional and user-controlled.

---

# 18. Tests and Validation

Create a lightweight test script or validation checklist.

Validate:

- Shell syntax with:

```bash
bash -n
```

- ShellCheck compatibility where possible
- Plist generation with:

```bash
plutil -lint
```

- Port validation
- Repeated installer runs
- Existing mitmproxy installation
- Missing Homebrew
- Existing CA
- Existing trusted certificate
- Port collision
- Existing LaunchAgent
- Start/stop/restart idempotency
- Uninstall preserving data by default

Do not require external internet access for every test.

Mock or isolate installation-dependent tests where practical.

---

# 19. Implementation Approach

Work in phases.

## Phase 1

- Project scaffold
- `lib/common.sh`
- Path and configuration handling
- Argument parsing
- README skeleton

## Phase 2

- mitmproxy detection and installation
- CA generation
- certificate trust

## Phase 3

- LaunchAgent template generation
- lifecycle helpers
- port checks

## Phase 4

- idempotency
- backups
- uninstall

## Phase 5

- validation
- troubleshooting
- documentation polish

After each phase:

- Run `bash -n`
- Run ShellCheck if available
- Run `plutil -lint` on generated plists
- Fix all errors before continuing

---

# 20. Initial Deliverable

Start by producing:

1. The project tree
2. `lib/common.sh`
3. `install.sh`
4. the LaunchAgent plist template
5. `status.sh`
6. README skeleton

Then continue until all lifecycle scripts are implemented and internally consistent.

Do not stop after writing an outline. Create the full working project.
