# Local mitmproxy service for macOS

This standalone package installs and manages a local, user-level `mitmdump`
LaunchAgent. Its default endpoint is `http://127.0.0.1:8080`.

> This project prepares a local mitmproxy service. It does not enable the macOS
> system proxy and does not configure any application to use the proxy.

It is independent of CAMON and all monitoring/addon software.

## Scope and non-goals

The package generates and trusts the mitmproxy CA in the current user's login
keychain, and manages one `local.mitmproxy` LaunchAgent. It binds only to
`127.0.0.1`. mitmproxy must already be installed.

It never changes macOS proxy settings, application settings, browser settings,
shell profiles, `/etc/hosts`, or routing. It does not install addons, filter,
block, or modify traffic. It does not use `sudo`, a LaunchDaemon, or the system
keychain.

## Requirements

- A modern macOS release and a logged-in GUI user
- Bash, `launchctl`, `lsof`, `plutil`, `security`, and `openssl` (provided by macOS)
- mitmproxy already on `PATH`

The bootstrap never installs Homebrew or mitmproxy. If `mitmdump` is missing,
the installer exits with these user-run instructions:

```bash
brew install mitmproxy
command -v mitmdump
mitmdump --version
```

## Install

```bash
cd mitmproxy-macos-bootstrap
./install.sh
```

Choose a different localhost port if needed:

```bash
./install.sh --port 8181
```

The installer checks whether the port is owned by this LaunchAgent before
continuing. It refuses to stop or replace an unrelated listener. It is safe to
rerun: unchanged configuration is retained and changed plist/config files are
timestamped under `backups/` before replacement.

The first install may prompt for permission to trust the CA in your login
keychain. Trust detection is best effort: it compares the local CA certificate
fingerprint with the first `mitmproxy` certificate found in that keychain.

## Lifecycle

```bash
./status.sh
./start.sh
./stop.sh
./restart.sh
./logs.sh            # stderr, follows output
./logs.sh --stdout
./logs.sh --both
```

`start.sh` is idempotent. `stop.sh` succeeds if the service is already stopped.
`restart.sh` uses `launchctl kickstart -k`; none of the scripts kill unrelated
processes.

## Installed files

```text
~/Library/Application Support/mitmproxy-local/
  config.env
  logs/stdout.log
  logs/stderr.log
  backups/
~/Library/LaunchAgents/local.mitmproxy.plist
~/.mitmproxy/mitmproxy-ca-cert.pem
~/.mitmproxy/mitmproxy-ca.pem
~/.mitmproxy/mitmproxy-ca-cert.cer
```

The generated LaunchAgent runs the resolved absolute path to `mitmdump` with
`--listen-host 127.0.0.1` and the selected port. The certificate files remain
owned by mitmproxy in `~/.mitmproxy/`.

## Optional, user-controlled routing

Only configure a client when you personally intend to send that client through
the local proxy. For example, this affects one command invocation only:

```bash
HTTPS_PROXY=http://127.0.0.1:8080 command
```

This project never performs that configuration itself.

## Uninstall

```bash
./uninstall.sh
./uninstall.sh --remove-data
./uninstall.sh --remove-cert
./uninstall.sh --remove-data --remove-cert
```

Default uninstall unloads and removes only the LaunchAgent plist. It preserves
mitmproxy, its CA files, login-keychain trust, and service data/logs. The optional
flags remove the data directory and the exact matching login-keychain certificate;
they never remove Homebrew, mitmproxy, or `~/.mitmproxy/`.

## Troubleshooting

- If the installer reports that `mitmdump` is missing, install mitmproxy yourself
  (for example, `brew install mitmproxy`) and ensure it is available on `PATH`.
- If port 8080 is busy, use `./install.sh --port 8181` or inspect the reported
  PID; the bootstrap will not terminate it.
- If the service does not listen, run `./status.sh` then inspect
  `~/Library/Application Support/mitmproxy-local/logs/stderr.log`.
- If keychain trust fails, unlock the login keychain and rerun `./install.sh`.

## Validation

Run the offline checks on macOS:

```bash
./tests/validate.sh
```

It performs `bash -n`, verifies accepted/rejected port values, renders an
isolated plist, and runs `plutil -lint`. It does not install software, modify
keychains, or register a service.
