# CAMON getting started

CAMON is a local, opt-in monitor for coding-agent API usage. It runs a
localhost-only mitmproxy service with a CAMON addon, then displays metadata and
usage estimates in a terminal dashboard. It does not store prompts,
completions, authentication headers, or raw request/response bodies.

This guide installs the complete local setup on macOS or Linux, verifies it,
and routes Claude Code through it. The same proxy can be enabled for other
detected agents from CAMON's **Setup** tab.

## What is installed

The standard installation creates these user-owned components:

```text
~/.insrc/camon/
  bin/camon                 # command placed on PATH for Bash/Zsh
  venv/                     # CAMON and a compatible mitmproxy runtime
  camon.sqlite3             # local monitoring database

~/.mitmproxy/
  mitmproxy-ca-cert.pem     # local CA used to inspect opted-in HTTPS traffic
```

The proxy listens only on `127.0.0.1:8080`. CAMON never enables the system or
desktop proxy, so browser and other device traffic remains direct unless you
explicitly configure it.

On macOS, the companion bootstrap manages a `local.mitmproxy` LaunchAgent. On
Linux, it manages a `mitmproxy-local.service` systemd user service. CAMON
registers its addon with that known local service and restarts only that service.

## Before you begin

- macOS or Linux.
- Python 3.12 or newer for CAMON.
- A logged-in desktop user session.
- `mitmdump` available on `PATH`, or permission to let the Linux bootstrap
  install it using an available supported package method.

On macOS, the bootstrap intentionally does not install mitmproxy. Install it
first, for example:

```bash
brew install mitmproxy
mitmdump --version
```

On Linux, the bootstrap prefers an existing `mitmdump`; otherwise it can use
`pipx` or the detected distribution package manager. Use its `--skip-install`
option when you want it to fail instead of trying an installation.

## Install CAMON

From the `camon` module directory, run:

```bash
./install.sh
```

The installer detects macOS or Linux and asks whether to run the matching local
mitmproxy bootstrap. Answer `y` on a first installation. It then:

1. Ensures a local `mitmdump` is available.
2. Creates the local proxy CA if required and configures user certificate trust.
3. Registers and starts the user-level local proxy service.
4. Installs CAMON and its compatible proxy runtime in `~/.insrc/camon/venv`.
5. Registers the CAMON addon with the known local service.
6. Adds `~/.insrc/camon/bin` to `~/.zshrc` or `~/.bashrc`, unless you opt out.

Useful installer options:

```bash
./install.sh --setup-proxy  # run the platform bootstrap without prompting
./install.sh --no-path      # do not change your shell startup file
./install.sh --help
```

Open a new terminal after installation, or make the command available in the
current shell:

```bash
export PATH="$HOME/.insrc/camon/bin:$PATH"
```

## Verify the local service

Run:

```bash
camon status
```

Expected output includes:

```text
mitmproxy: running
addon heartbeat: healthy
```

`running` confirms CAMON found the localhost proxy. `healthy` confirms the
addon can write its heartbeat to CAMON's local SQLite database. A healthy addon
does not mean any agent is configured yet.

Platform-specific service checks:

```bash
# macOS
./mitmproxy-macos-bootstrap/status.sh
./mitmproxy-macos-bootstrap/logs.sh --both

# Linux
./mitmproxy-linux-bootstrap/status.sh
./mitmproxy-linux-bootstrap/logs.sh --both
```

If port `8080` is already occupied, the bootstrap refuses to replace the other
process. Choose another port while installing the bootstrap, then configure
CAMON and any routed agent to use that same port.

## Start the dashboard

Run:

```bash
camon
```

The dashboard refreshes automatically. Use these keys to switch tabs:

| Key | Tab | What it shows |
| --- | --- | --- |
| `1` | Overview | proxy and addon health |
| `2` | Setup | detected agents and their routing state |
| `3` | Agents | usage by detected coding agent |
| `4` | Sessions | observed session activity |
| `5` | Requests | recent proxied API requests |
| `6` | Providers | usage by provider and model |
| `7` | Runtime | proxy process IDs and addon state |

In **Setup**, use Up/Down to select an agent and press `e` to enable its
opt-in routing. Press `q` to exit the dashboard.

## Route Claude Code

Select `claude-code` in the **Setup** tab and press `e`. CAMON safely merges
the following into `~/.claude/settings.json`, retaining unrelated Claude Code
settings:

```json
{
  "env": {
    "HTTP_PROXY": "http://127.0.0.1:8080",
    "HTTPS_PROXY": "http://127.0.0.1:8080",
    "ALL_PROXY": "http://127.0.0.1:8080",
    "NO_PROXY": "localhost,127.0.0.1,::1",
    "NODE_EXTRA_CA_CERTS": "/absolute/path/to/home/.mitmproxy/mitmproxy-ca-cert.pem"
  }
}
```

The `NODE_EXTRA_CA_CERTS` setting is an absolute path to the local mitmproxy CA.
It is required because mitmproxy presents a certificate signed by that CA. It
preserves TLS verification; do not set `NODE_TLS_REJECT_UNAUTHORIZED=0`.

Completely quit and reopen Claude Code, VS Code, or Cursor after enabling it.
Make a Claude request, then press `5` in CAMON. A new row should appear within
the dashboard refresh interval.

If the Claude process reports an SSL verification error, confirm that
`~/.mitmproxy/mitmproxy-ca-cert.pem` exists. Re-run the platform bootstrap if
it does not, then enable Claude Code again from CAMON's Setup tab.

## Route other agents

For agents other than Claude Code, pressing `e` creates an explicit launcher:

```text
~/.insrc/camon/bin/camon-<agent>
```

For example, when Codex CLI is detected:

```bash
camon-codex-cli
```

The launcher sets proxy variables only for the program it starts. Existing
agent processes must be quit and relaunched through that launcher. GUI apps
started from the Dock/Finder or an already running VS Code instance do not
inherit a terminal launcher's environment.

CAMON currently detects Claude Code, Codex CLI, Cursor, Continue, Cline, Roo
Code, and Aider when it can find a running process, a command on `PATH`, or a
supported installed macOS app bundle. Detection does not alter an agent's
configuration.

## Read usage and export reports

The dashboard is best for live inspection. For aggregate data:

```bash
camon report --days 7
camon export ~/Desktop/camon-usage.json --format json --days 30
camon export ~/Desktop/camon-usage.csv --format csv --days 30
```

CAMON records the request origin/path, time, response status, provider/model,
token counts when available, and local attribution metadata. It does not retain
request prompts or model responses.

## Retention and configuration

The default retention window is seven days. CAMON automatically purges expired
requests, sessions, aggregates, process records, and stale addon heartbeats.

To change it, create or edit the platform configuration file:

```text
# macOS
~/Library/Application Support/camon/config.toml

# Linux (or $XDG_DATA_HOME when set)
~/.local/share/camon/config.toml
```

For example:

```toml
retention_days = 14
refresh_seconds = 2.0
proxy_host = "127.0.0.1"
proxy_port = 8080
```

After changing `retention_days`, run this so the addon service receives the
same setting and restarts:

```bash
camon register
```

The installed `camon` launcher uses
`~/.insrc/camon/camon.sqlite3`. For a different database, set `CAMON_DATABASE`
before invoking CAMON. Use `CAMON_CONFIG` to load a configuration file from a
different location.

## Troubleshooting

### `mitmproxy: not detected`

Run the platform bootstrap status command above. Confirm that the service is
listening on the configured localhost port and that CAMON's `proxy_port` matches
it. Do not point CAMON at a network-accessible proxy; the supported bootstraps
bind to `127.0.0.1` only.

### `addon: not reporting`

Re-register the addon:

```bash
camon register
camon status
```

If registration fails, the expected local bootstrap service has not been
installed or is not healthy. Run the platform bootstrap `status.sh` and inspect
its logs before retrying.

### Agent is detected but no requests appear

Detection only means CAMON can identify the agent executable or process. It does
not mean traffic is routed. In the **Setup** tab, enable the agent, fully restart
it, perform an action that calls its provider API, and inspect the **Requests**
tab. For launcher-based agents, ensure you started the new process through the
`camon-<agent>` launcher.

### Claude Code fails certificate verification

Use the Setup tab to enable Claude Code again after the proxy bootstrap has run.
This adds the `NODE_EXTRA_CA_CERTS` entry for the local mitmproxy CA. Do not
disable TLS verification as a workaround.

### No `camon` command after installation

Open a new terminal, or invoke it by absolute path:

```bash
~/.insrc/camon/bin/camon
```

If you used `--no-path`, add `~/.insrc/camon/bin` to your shell `PATH` yourself.

## Development installation

For development rather than the user installer:

```bash
python -m pip install -e '.[proxy,dev]'
python -m pytest -q
ruff check .
```

An existing mitmproxy can load the addon directly:

```bash
mitmdump -s /path/to/camon/src/camon/addon.py
```

Automatic `camon register` support is deliberately limited to the known macOS
and Linux bootstrap services. It refuses to rewrite an arbitrary proxy service.
