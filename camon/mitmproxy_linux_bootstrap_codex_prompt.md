# Codex Prompt: Build a Standalone Linux mitmproxy Bootstrap

Build a standalone Linux setup package for running a local mitmproxy instance as a background user service.

This project must be completely independent of CAMON or any other monitoring application.

Its only responsibility is to install, configure, start, stop, restart, inspect, and uninstall a local mitmproxy service.

It must not decide which applications use the proxy.

It must not enable a global desktop proxy.

It must not modify Claude Code, Codex, Cursor, VS Code, browser, shell, desktop environment, or system proxy settings.

The user will decide which applications are routed through mitmproxy.

---

# 1. Objective

Create a small, production-quality Linux bootstrap package that:

- Installs mitmproxy if it is not already installed
- Generates the mitmproxy certificate authority files
- Installs the mitmproxy CA into the current user's trust store where supported
- Creates a user-level systemd service
- Runs `mitmdump` as a background user service
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

# 2. Supported Linux Scope

Target modern Linux desktop and developer environments.

Primary supported distributions:

- Ubuntu
- Debian
- Fedora
- RHEL-compatible distributions
- Arch Linux
- openSUSE

Primary service manager:

- systemd user services

Do not require a root system service.

Use a user-level service under:

```text
~/.config/systemd/user/
```

The implementation should detect unsupported environments and fail clearly.

---

# 3. Non-goals

Do not implement any of the following:

- Global Linux desktop proxy configuration
- GNOME proxy configuration
- KDE proxy configuration
- Shell profile proxy variables
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
- Root daemon or system-level systemd service
- Docker support
- macOS or Windows support

This project is Linux-only.

---

# 4. Deliverables

Create this project structure:

```text
mitmproxy-linux-bootstrap/
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
    └── mitmproxy-local.service.template
```

All scripts must be executable.

Use Bash.

---

# 5. Installed Layout

Use XDG-compliant locations.

Application data:

```text
~/.local/share/mitmproxy-local/
├── logs/
│   ├── stdout.log
│   └── stderr.log
├── config.env
└── backups/
```

Configuration:

```text
~/.config/mitmproxy-local/
└── config.env
```

User service:

```text
~/.config/systemd/user/mitmproxy-local.service
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

Use these environment-aware defaults:

```bash
XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
```

---

# 6. Runtime Choice

Use `mitmdump` as the background process.

Do not use `mitmweb` as the managed default.

The systemd user service should run the equivalent of:

```bash
mitmdump \
  --listen-host 127.0.0.1 \
  --listen-port 8080
```

Resolve the executable dynamically:

```bash
MITMDUMP_BIN="$(command -v mitmdump)"
```

Do not assume installation paths such as:

```text
/usr/bin
/usr/local/bin
~/.local/bin
```

Store the resolved absolute executable path in the generated service file.

---

# 7. mitmproxy Installation

The installer must:

1. Check whether `mitmdump` is already available
2. If available, use the existing installation
3. If unavailable, detect the package manager
4. Offer the supported installation path
5. Verify installation afterward

Preferred installation order:

## pipx

If `pipx` is available:

```bash
pipx install mitmproxy
```

Then ensure the current shell can resolve the installed executable.

## apt-based systems

For Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y mitmproxy
```

## dnf-based systems

For Fedora/RHEL-compatible systems:

```bash
sudo dnf install -y mitmproxy
```

## pacman-based systems

For Arch:

```bash
sudo pacman -S --needed mitmproxy
```

## zypper-based systems

For openSUSE:

```bash
sudo zypper install -y mitmproxy
```

Requirements:

- Prefer an existing installation
- Do not reinstall unnecessarily
- Detect the package manager safely
- Explain when `sudo` is required
- Do not install Python package managers automatically
- Stop with a clear message if no supported installation method is available
- Verify with:

```bash
command -v mitmdump
mitmdump --version
```

Allow:

```bash
./install.sh --skip-install
```

for users who want to manage mitmproxy themselves.

---

# 8. Certificate Generation

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
- Do not use final port `8080` during certificate generation

---

# 9. User Certificate Trust

Install the mitmproxy CA into the current user's trust store where supported.

Do not install system-wide by default.

The implementation must detect the desktop/application trust environment and use the most appropriate user-scoped method available.

Supported strategies:

## NSS user database

For Firefox, Chromium variants using NSS, and other NSS consumers, use `certutil` when available.

Typical user NSS database:

```text
$HOME/.pki/nssdb
```

Example:

```bash
certutil \
  -d "sql:$HOME/.pki/nssdb" \
  -A \
  -t "C,," \
  -n "mitmproxy" \
  -i "$HOME/.mitmproxy/mitmproxy-ca-cert.pem"
```

If the database does not exist, create it carefully:

```bash
mkdir -p "$HOME/.pki/nssdb"
certutil -d "sql:$HOME/.pki/nssdb" -N --empty-password
```

## Distribution trust stores

System-wide trust-store installation must not happen by default.

Offer it only through an explicit flag:

```bash
./install.sh --system-cert
```

If `--system-cert` is provided, support:

### Debian/Ubuntu

```bash
sudo cp "$HOME/.mitmproxy/mitmproxy-ca-cert.pem" \
  /usr/local/share/ca-certificates/mitmproxy-local.crt

sudo update-ca-certificates
```

### Fedora/RHEL-compatible

```bash
sudo cp "$HOME/.mitmproxy/mitmproxy-ca-cert.pem" \
  /etc/pki/ca-trust/source/anchors/mitmproxy-local.crt

sudo update-ca-trust
```

### Arch Linux

Use the system trust mechanism appropriate for the installed setup and document it clearly.

### openSUSE

Use the distribution trust update mechanism and document it clearly.

Requirements:

- Default to user-scoped trust only
- Never install system-wide without an explicit flag
- Detect whether the CA is already present
- Avoid duplicate trust entries
- Print which trust store was updated
- Explain that some applications use their own trust stores
- Document that certificate trust on Linux is fragmented across applications and distributions

If user-scoped trust cannot be configured reliably, generate the CA and print manual instructions rather than failing the whole installation.

---

# 10. systemd User Service

Create:

```text
~/.config/systemd/user/mitmproxy-local.service
```

The service must include:

- Description
- `ExecStart` using the resolved absolute path to `mitmdump`
- `--listen-host`
- `127.0.0.1`
- `--listen-port`
- configurable port, default `8080`
- Restart policy
- working directory where appropriate
- stdout append log
- stderr append log
- environment file reference where appropriate

Example shape:

```ini
[Unit]
Description=Local mitmproxy service
After=network-online.target

[Service]
Type=simple
ExecStart=/absolute/path/to/mitmdump --listen-host 127.0.0.1 --listen-port 8080
Restart=on-failure
RestartSec=2
StandardOutput=append:%h/.local/share/mitmproxy-local/logs/stdout.log
StandardError=append:%h/.local/share/mitmproxy-local/logs/stderr.log

[Install]
WantedBy=default.target
```

Requirements:

- Generate the final service file from a template
- Do not hardcode the user home directory
- Use `%h` where appropriate
- Validate the generated service with:

```bash
systemd-analyze --user verify \
  "$HOME/.config/systemd/user/mitmproxy-local.service"
```

where supported

- Run:

```bash
systemctl --user daemon-reload
```

after installation or updates

---

# 11. systemd Lifecycle

Enable and start:

```bash
systemctl --user enable --now mitmproxy-local.service
```

Restart:

```bash
systemctl --user restart mitmproxy-local.service
```

Stop:

```bash
systemctl --user stop mitmproxy-local.service
```

Disable:

```bash
systemctl --user disable mitmproxy-local.service
```

Status:

```bash
systemctl --user status mitmproxy-local.service
```

Requirements:

- Handle already-enabled services
- Handle already-running services
- Handle inactive services
- Avoid duplicate service registrations
- Print useful diagnostics
- Keep lifecycle logic in reusable functions in `lib/common.sh`

Optionally support lingering only when explicitly requested:

```bash
./install.sh --enable-linger
```

This may use:

```bash
loginctl enable-linger "$USER"
```

Do not enable lingering by default.

---

# 12. Port Handling

Default port:

```text
8080
```

Allow:

```bash
./install.sh --port 8080
```

Store configuration in:

```text
~/.config/mitmproxy-local/config.env
```

Example:

```bash
MITMPROXY_HOST=127.0.0.1
MITMPROXY_PORT=8080
SYSTEMD_SERVICE=mitmproxy-local.service
```

Before installation or restart, check whether the chosen port is already in use.

Use available Linux tools in this order:

```bash
ss -ltnp
```

then fallback to:

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

or:

```bash
netstat -ltnp
```

Behavior:

- If the port is free, continue
- If the port is already used by the managed service, continue safely
- If the port is used by another process, stop and show process details
- Do not kill unrelated processes

---

# 13. Idempotency

All scripts must be safe to rerun.

The installer should detect and report:

```text
✓ mitmproxy already installed
✓ CA already generated
✓ CA already trusted where configured
✓ systemd user service already installed
✓ service configuration unchanged
✓ mitmdump already running
```

When replacing the existing service or config file:

- Create a timestamped backup
- Store backups under:

```text
~/.local/share/mitmproxy-local/backups/
```

Example:

```text
mitmproxy-local.service.backup-20260803-110200
```

Do not create a backup when generated content is byte-for-byte identical.

---

# 14. Helper Scripts

## start.sh

Must:

- Load configuration
- Ensure the service file exists
- Run `systemctl --user daemon-reload`
- Start the service
- Confirm the listener is active

## stop.sh

Must:

- Stop the systemd user service
- Not delete files
- Exit successfully if already stopped

## restart.sh

Must:

- Validate port availability
- Restart through systemd
- Confirm the listener is active afterward

## status.sh

Must display:

- mitmproxy installation status
- mitmdump executable path
- mitmproxy version
- CA generation status
- user trust status, best effort
- system trust status if configured
- service installation status
- service enabled status
- service running status
- process PID
- host and port
- listener status
- stdout log path
- stderr log path

Example output:

```text
mitmproxy installed: yes
mitmdump: /home/user/.local/bin/mitmdump
version: 12.x
CA generated: yes
User trust configured: yes
System trust configured: no
Service installed: yes
Service enabled: yes
Service running: yes
PID: 48102
Proxy: http://127.0.0.1:8080
Listener active: yes
```

## logs.sh

Default:

```bash
journalctl --user -u mitmproxy-local.service -f
```

Also support:

```bash
./logs.sh --journal
./logs.sh --stdout
./logs.sh --stderr
./logs.sh --both
```

Use file tailing for stdout/stderr files.

---

# 15. Uninstall

The uninstall script must:

1. Stop the systemd user service
2. Disable the service
3. Remove:

```text
~/.config/systemd/user/mitmproxy-local.service
```

4. Run:

```bash
systemctl --user daemon-reload
```

5. Optionally remove application data
6. Optionally remove user-scoped CA trust
7. Optionally remove system-wide CA trust only if it was installed by this project
8. Never uninstall mitmproxy automatically
9. Never remove Python or package managers
10. Never delete `~/.mitmproxy` unless the user explicitly confirms

Support flags:

```bash
./uninstall.sh
./uninstall.sh --remove-data
./uninstall.sh --remove-user-cert
./uninstall.sh --remove-system-cert
./uninstall.sh --remove-data --remove-user-cert
```

Default uninstall should preserve:

- mitmproxy installation
- mitmproxy CA files
- local logs and config

Print exactly what was removed and preserved.

---

# 16. Safety Requirements

- Use:

```bash
set -euo pipefail
```

- Quote all variable expansions
- Handle spaces in paths
- Never use `eval`
- Never use untrusted input in shell execution
- Validate port values
- Validate generated systemd unit
- Use traps for temporary processes and files
- Never kill processes unless started by the script or owned by the known systemd user service
- Do not run the main service as root
- Bind only to `127.0.0.1`
- Do not bind to `0.0.0.0`
- Do not enable remote access
- Do not configure global proxy routing
- Do not change GNOME or KDE settings
- Do not modify shell profiles
- Do not modify `/etc/environment`
- Do not modify `/etc/hosts`
- Do not enable system-wide certificate trust without an explicit flag

---

# 17. User Experience

The installer should provide concise progress messages.

Example:

```text
[1/8] Checking mitmproxy installation
      Found: /home/user/.local/bin/mitmdump

[2/8] Checking mitmproxy CA
      Existing CA found

[3/8] Checking certificate trust
      User NSS trust already configured

[4/8] Creating local service directories
      Done

[5/8] Installing systemd user service
      Done

[6/8] Reloading systemd user manager
      Done

[7/8] Starting mitmdump
      Running with PID 48102

[8/8] Verifying proxy listener
      Listening on 127.0.0.1:8080
```

At completion, print:

```text
mitmproxy is ready.

Proxy endpoint:
  http://127.0.0.1:8080

No applications have been configured to use this proxy.

Configure only the applications you explicitly want to route through it.

Service:
  systemctl --user status mitmproxy-local.service

Logs:
  journalctl --user -u mitmproxy-local.service -f
```

---

# 18. README

The README must cover:

- Purpose
- Scope
- Non-goals
- Supported distributions
- Requirements
- Installation
- Package-manager behavior
- Lifecycle commands
- Custom port setup
- Certificate generation
- Linux certificate trust fragmentation
- User trust vs system trust
- Installed file locations
- systemd user service behavior
- Optional lingering
- Log access
- Uninstall behavior
- Troubleshooting
- Security considerations

Explicitly state:

> This project prepares a local mitmproxy service. It does not enable a global Linux proxy and does not configure any application to use the proxy.

Include optional per-command routing examples such as:

```bash
HTTPS_PROXY=http://127.0.0.1:8080 command
```

These examples must be clearly labeled as optional and user-controlled.

---

# 19. Tests and Validation

Create a lightweight test script or validation checklist.

Validate:

- Shell syntax with:

```bash
bash -n
```

- ShellCheck compatibility where possible
- systemd unit validation
- Port validation
- Repeated installer runs
- Existing mitmproxy installation
- Missing package manager
- Existing CA
- Existing user trust
- Port collision
- Existing service
- Start/stop/restart idempotency
- Uninstall preserving data by default
- Explicit system certificate installation
- Explicit lingering behavior

Do not require external internet access for every test.

Mock or isolate installation-dependent tests where practical.

---

# 20. Implementation Approach

Work in phases.

## Phase 1

- Project scaffold
- `lib/common.sh`
- XDG path handling
- configuration handling
- argument parsing
- README skeleton

## Phase 2

- mitmproxy detection and installation
- CA generation
- user certificate trust
- optional system trust

## Phase 3

- systemd unit generation
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
- Run systemd unit validation
- Fix all errors before continuing

---

# 21. Initial Deliverable

Start by producing:

1. The project tree
2. `lib/common.sh`
3. `install.sh`
4. the systemd user-service template
5. `status.sh`
6. README skeleton

Then continue until all lifecycle scripts are implemented and internally consistent.

Do not stop after writing an outline. Create the full working project.
