# CAMON

CAMON is a passive, local usage monitor for coding agents.  It is a mitmproxy addon
plus a Textual dashboard and CLI.  It records normalized metadata and usage only;
request and response payloads are never persisted by default and flows are never
modified or blocked.

## Install

```bash
python -m pip install -e '.[proxy,dev]'
```

Point an existing mitmproxy instance at the addon:

```bash
mitmproxy -s /path/to/camon/src/camon/addon.py
```

Then use `camon status`, `camon` (dashboard), `camon report`, or `camon export`.
`camon register` adds the addon to CAMON's known local bootstrap service and
restarts that service. `camon restart` refuses unless `managed_mitmproxy = true`
is set in config.

For an end-to-end install and use walkthrough, see
[Getting Started](GETTING_STARTED.md).

## Configuration

The default database is `~/.local/share/camon/camon.sqlite3` (or the platform
equivalent). Set `CAMON_DATABASE` or `CAMON_CONFIG` to override it. An example:

```toml
database_path = "/tmp/camon.sqlite3"
managed_mitmproxy = false
mitmproxy_command = ["mitmproxy", "-s", "/path/to/addon.py"]
background_color = "#071a33"
```

The dashboard defaults to dark navy. Set `background_color` to any `#RGB` or
`#RRGGBB` colour, or override it for one launch with
`camon --background-color "#102a43"`.

Attribution first attempts a local socket-to-PID match, then process name,
command-line rules, parent process chain, and finally an HTTP User-Agent
fingerprint. Results include a confidence value and source.

## Privacy and safety

CAMON stores URL origin/path, timing, status, provider/model identifiers, token
counts, and attribution metadata. It does not store authentication headers,
prompts, completions, or raw bodies. The addon is observational: it never changes
flow state, headers, body, destination, or response.

## Retention

CAMON automatically purges requests, sessions, daily aggregates, stale addon
heartbeats, and process records older than seven days. Set a different window in
your CAMON TOML configuration (default location:
`~/Library/Application Support/camon/config.toml` on macOS):

```toml
retention_days = 14
```

After changing the setting, run `camon register` to apply it to the addon and
restart the local service. The retention window must be at least one day.

## Agent setup

The TUI's **Setup** tab detects supported agent processes and commands. Select
an agent and press `e` to configure opt-in proxy routing. For Claude Code this
merges `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, and the local
mitmproxy certificate path (`NODE_EXTRA_CA_CERTS`) into
`~/.claude/settings.json`, preserving unrelated settings; restart Claude Code
afterward. Other agents receive an opt-in `camon-<agent>` launcher in
`~/.insrc/camon/bin`. CAMON never changes the system proxy or shell profiles.

The **Agents** tab can independently enable metadata traffic logs for a selected
agent. Set the destination (default: `/tmp/.insrc/camon`) and toggle logging.
CAMON writes JSON Lines access records to `<logdir>/<agent>.YYYYmmdd.log`;
files rotate at 10 MiB and retain five rotated copies. These logs omit request
and response bodies, prompts, credentials, headers, and query strings.

## Install the TUI

On macOS or Linux, run the top-level installer:

```bash
./install.sh
```

It detects the platform and asks whether to run the matching local mitmproxy
bootstrap. It only installs CAMON after confirming that `mitmdump` is available.
CAMON is installed in `~/.insrc/camon/venv`; its `camon` launcher is written to
`~/.insrc/camon/bin` and added idempotently to Bash or Zsh's `PATH`. Use
`./install.sh --no-path` to skip the shell-startup-file change. When the known
platform bootstrap service exists, the installer also registers CAMON's addon and
restarts that local service with the compatible `mitmdump` installed in CAMON's
virtual environment. This avoids the dependency restrictions of bundled
mitmproxy packages. Run `camon register` to repeat that explicit action.
