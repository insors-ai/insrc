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
`camon register` writes a small addon manifest for operators; it never restarts a
proxy. `camon restart` refuses unless `managed_mitmproxy = true` is set in config.

## Configuration

The default database is `~/.local/share/camon/camon.sqlite3` (or the platform
equivalent). Set `CAMON_DATABASE` or `CAMON_CONFIG` to override it. An example:

```toml
database_path = "/tmp/camon.sqlite3"
managed_mitmproxy = false
mitmproxy_command = ["mitmproxy", "-s", "/path/to/addon.py"]
```

Attribution first attempts a local socket-to-PID match, then process name,
command-line rules, parent process chain, and finally an HTTP User-Agent
fingerprint. Results include a confidence value and source.

## Privacy and safety

CAMON stores URL origin/path, timing, status, provider/model identifiers, token
counts, and attribution metadata. It does not store authentication headers,
prompts, completions, or raw bodies. The addon is observational: it never changes
flow state, headers, body, destination, or response.

