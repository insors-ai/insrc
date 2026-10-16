# Auditing AI Coding Agents with an HTTPS Inspection Proxy

## A Practical Guide to Observing What Your AI Coding Agent Sends

> **Update:** This version includes a configuration matrix and preferred
> proxy configuration methods for common AI coding agents.

> **Local implementation:** The adjacent [`camon`](./camon/) module provides a
> passive mitmproxy usage monitor, plus standalone macOS and Linux helpers for
> running a localhost-only mitmproxy service. None of these helpers configure a
> system proxy or route applications automatically.

## Configuration Matrix

  -----------------------------------------------------------------------------------
  Tool       Preferred Proxy Configuration           Alternative     Notes
  ---------- --------------------------------------- --------------- ----------------
  Claude     `~/.claude/settings.json` or project    `HTTP_PROXY` /  Preferred
  Code       `.claude/settings.json`                 `HTTPS_PROXY`   because it is
                                                                     project/user
                                                                     scoped.

  Codex CLI  `HTTP_PROXY` / `HTTPS_PROXY`            Wrapper launch  No documented
             environment variables                   script          native proxy
                                                                     setting in the
                                                                     config file.

  Cursor     Operating system HTTP/HTTPS proxy       Environment     Verify behavior
                                                     variables       after
                                                     (where          configuration.
                                                     applicable)     

  Continue   VS Code proxy settings                  Environment     Inherits VS Code
                                                     variables       networking.

  Cline      VS Code proxy settings                  Environment     Inherits VS Code
                                                     variables       networking.

  Roo Code   VS Code proxy settings                  Environment     Inherits VS Code
                                                     variables       networking.
  -----------------------------------------------------------------------------------

------------------------------------------------------------------------

## Why use an HTTPS inspection proxy?

Modern AI coding agents routinely access source code, documentation,
build systems and shell tools. An HTTPS inspection proxy provides an
independent way to observe what is transmitted to cloud services.

It does **not** imply a vendor is untrustworthy. It provides visibility.

------------------------------------------------------------------------

# Installing mitmproxy

## macOS

``` bash
brew install mitmproxy
mitmproxy --version
```

For a persistent, user-level `mitmdump` service instead of a manually started
proxy, use the standalone [macOS bootstrap](./camon/mitmproxy-macos-bootstrap/).
It manages a localhost LaunchAgent and its CA trust, but deliberately leaves
application proxy configuration to you.

## Linux

``` bash
sudo apt install python3-pip
pip install mitmproxy
# or
pipx install mitmproxy

mitmproxy --version
```

For a persistent systemd user service, use the standalone [Linux
bootstrap](./camon/mitmproxy-linux-bootstrap/). It supports the listed Linux
package-manager paths and keeps the listener restricted to `127.0.0.1`.

## Windows

``` powershell
winget install mitmproxy.mitmproxy
```

Or download from https://mitmproxy.org

------------------------------------------------------------------------

# Starting mitmproxy

``` bash
mitmweb
```

Web UI:

    http://127.0.0.1:8081

Proxy:

    127.0.0.1:8080

If you installed one of the platform bootstraps above, use its lifecycle scripts
instead: [macOS lifecycle commands](./camon/mitmproxy-macos-bootstrap/README.md#lifecycle)
or [Linux lifecycle commands](./camon/mitmproxy-linux-bootstrap/README.md#lifecycle).
Both run `mitmdump` on `127.0.0.1:8080` by default, without changing proxy
settings for any application.

------------------------------------------------------------------------

# Installing the CA Certificate

Open:

    http://mitm.it

Install the certificate into your operating system's trusted root
certificate store.

### macOS

-   Open **Keychain Access**
-   Import the certificate
-   Set **Always Trust**

### Linux

``` bash
sudo cp mitmproxy-ca-cert.pem /usr/local/share/ca-certificates/
sudo update-ca-certificates
```

The Linux bootstrap defaults to user-scoped NSS trust when `certutil` is
available. System-wide trust is opt-in via `--system-cert`; see its
[certificate-trust notes](./camon/mitmproxy-linux-bootstrap/README.md#installation).

### Windows

Run:

``` powershell
certmgr.msc
```

Import into **Trusted Root Certification Authorities**.

------------------------------------------------------------------------

# Configuring Claude Code

Claude Code supports proxy configuration in `settings.json`, which is
generally preferable to environment variables.

User configuration:

    ~/.claude/settings.json

Project configuration:

    <project>/.claude/settings.json

Example:

``` json
{
  "network": {
    "httpProxyPort": 8080
  }
}
```

Alternatively, configure:

``` bash
export HTTP_PROXY=http://127.0.0.1:8080
export HTTPS_PROXY=http://127.0.0.1:8080

claude
```

------------------------------------------------------------------------

# Configuring Codex CLI

At present, Codex CLI is typically configured using environment
variables:

``` bash
export HTTP_PROXY=http://127.0.0.1:8080
export HTTPS_PROXY=http://127.0.0.1:8080

codex
```

If you do not want to export these globally, use a wrapper script:

``` bash
#!/bin/bash

export HTTP_PROXY=http://127.0.0.1:8080
export HTTPS_PROXY=http://127.0.0.1:8080

codex "$@"
```

After configuration, verify that outbound traffic actually passes
through the proxy.

------------------------------------------------------------------------

# Configuring Cursor

Configure your operating system HTTP/HTTPS proxy:

-   Host: `127.0.0.1`
-   Port: `8080`

Restart Cursor and verify traffic appears in mitmproxy.

------------------------------------------------------------------------

# Configuring VS Code Extensions (Continue, Cline, Roo Code)

Many extensions inherit VS Code's networking configuration or the
standard proxy environment variables.

Example `settings.json`:

``` json
{
  "http.proxy": "http://127.0.0.1:8080"
}
```

------------------------------------------------------------------------

# Verifying Traffic

Issue a simple prompt such as:

> Explain this function.

Inspect the resulting POST request and review:

-   Headers
-   Request body
-   Response body
-   Timing
-   Payload size

## Optional: CAMON passive monitoring

The [`CAMON`](./camon/README.md) module can observe a mitmproxy instance and
store normalized request metadata, provider/model information, token usage, and
best-effort coding-agent attribution in SQLite. It provides a Textual dashboard
and CSV/JSON reports. Its addon never blocks or modifies proxy traffic, and it
does not persist prompts, completions, authentication headers, or raw request/
response payloads by default.

After installing CAMON's Python dependencies, run `camon register` to attach its
addon to the known local bootstrap service and restart that user service. The
command refuses to modify unmanaged or non-local services. Then inspect its state
with `camon status` or open the live dashboard with `camon`.

------------------------------------------------------------------------

# Useful mitmproxy Filters

    ~m POST
    ~u openai
    ~u anthropic
    ~u cursor
    ~u xai
    ~u google

------------------------------------------------------------------------

# What to Check

-   Which files were transmitted?
-   Were secrets excluded?
-   Was Git metadata transmitted?
-   Does the payload size match the prompt?
-   Is repository context reasonable?

------------------------------------------------------------------------

# Limitations

HTTPS inspection cannot show:

-   Files read but never transmitted
-   Applications using certificate pinning
-   Additional application-layer encryption
-   Local preprocessing

It answers one critical question:

> **What actually left my machine?**

------------------------------------------------------------------------

## Module summary

[`camon`](./camon/) is a self-contained companion module for this guide. It
contains the passive CAMON monitor and two independently usable bootstrap
packages: [macOS](./camon/mitmproxy-macos-bootstrap/) LaunchAgent management and
[Linux](./camon/mitmproxy-linux-bootstrap/) systemd-user-service management.
The bootstraps only install/manage a local `mitmdump` listener and CA setup;
they never configure global or per-application proxy routing. Routing a coding
agent through `http://127.0.0.1:8080` remains an explicit user decision.
