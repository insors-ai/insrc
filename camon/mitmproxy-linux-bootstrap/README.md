# Local mitmproxy service for Linux

This standalone package manages a localhost-only `mitmdump` process as a
systemd user service. Its default endpoint is `http://127.0.0.1:8080`.

> This project prepares a local mitmproxy service. It does not enable a global
> Linux proxy and does not configure any application to use the proxy.

It is independent of CAMON and all monitoring or addon software.

## Scope

Supported desktop/developer distributions are Ubuntu, Debian, Fedora,
RHEL-compatible distributions, Arch Linux, and openSUSE with a running systemd
user manager. The service is created only under `~/.config/systemd/user/`; it is
not a root service and always binds to `127.0.0.1`.

The bootstrap never changes GNOME, KDE, browser, application, shell, or global
proxy settings. It does not configure traffic interception, filtering, blocking,
or modification, and it never installs addons.

## Requirements and package installation

- Bash, systemd user services, and a logged-in user session
- `mitmdump`, installed already or installable through `pipx`, `apt`, `dnf`,
  `pacman`, or `zypper`

The installer uses an existing `mitmdump` first. If absent, it prefers `pipx`
and otherwise invokes the detected distribution package manager. Package-manager
paths may ask for `sudo`; no Python package manager is installed automatically.
Use `--skip-install` to prevent any installation attempt and receive a clear
error if `mitmdump` is unavailable.

## Installation

```bash
cd mitmproxy-linux-bootstrap
./install.sh
```

Use a custom port or manage the mitmproxy installation yourself:

```bash
./install.sh --port 8181
./install.sh --skip-install
```

`--system-cert` is the only way to request system-wide CA trust. It may prompt
for `sudo`. The default is user-scoped NSS trust when `certutil` is available.
Linux certificate trust is fragmented: Firefox, Chromium variants, Java, and
other clients may each use a different trust store. If `certutil` is absent, the
installer creates the CA and prints manual NSS instructions rather than failing.

`--enable-linger` explicitly runs `loginctl enable-linger "$USER"`; it is never
enabled by default.

## Lifecycle

```bash
./status.sh
./start.sh
./stop.sh
./restart.sh
./logs.sh             # systemd journal
./logs.sh --stdout
./logs.sh --stderr
./logs.sh --both
```

All lifecycle commands use `systemctl --user`. They are idempotent and reject a
port owned by an unrelated process rather than stopping it.

## Installed files

The package honors `XDG_CONFIG_HOME` and `XDG_DATA_HOME`:

```text
~/.config/mitmproxy-local/config.env
~/.config/systemd/user/mitmproxy-local.service
~/.local/share/mitmproxy-local/config.env
~/.local/share/mitmproxy-local/logs/{stdout,stderr}.log
~/.local/share/mitmproxy-local/backups/
~/.mitmproxy/mitmproxy-ca.pem
~/.mitmproxy/mitmproxy-ca-cert.pem
~/.mitmproxy/mitmproxy-ca-cert.cer
```

The generated service stores the resolved absolute `mitmdump` executable and
uses persistent append-only stdout/stderr log files.

## Optional user-controlled routing

This project does not route applications. If you choose to proxy one command,
do so explicitly and only for that invocation:

```bash
HTTPS_PROXY=http://127.0.0.1:8080 command
```

## Uninstall

```bash
./uninstall.sh
./uninstall.sh --remove-data
./uninstall.sh --remove-user-cert
./uninstall.sh --remove-system-cert
```

Default uninstall stops/disables and removes the user service but preserves
mitmproxy, `~/.mitmproxy/`, logs, configuration, and certificate trust.
`--remove-system-cert` removes trust only when the project recorded that it
installed it. No package manager or Python tooling is removed.

## Troubleshooting and security

- Run `systemctl --user status mitmproxy-local.service` and `./logs.sh` when the
  listener fails to start.
- If the user manager is unavailable (common over some SSH sessions), log into a
  systemd desktop session or configure a user manager before installing.
- If a port is busy, choose another one with `--port`; this package never kills
  the existing process.
- Only trust this CA for traffic you intentionally route through the localhost
  proxy. Do not expose the listener beyond `127.0.0.1`.

## Validation

```bash
./tests/validate.sh
```

The offline validator runs `bash -n`, ShellCheck when present, checks port and
idempotent configuration handling, and renders a user-service unit. It does not
install software, change trust stores, or start a service.
