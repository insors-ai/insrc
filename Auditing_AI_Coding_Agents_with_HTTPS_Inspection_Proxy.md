# Auditing AI Coding Agents with an HTTPS Inspection Proxy

## A Practical Guide to Observing What Your AI Coding Agent Sends

> **Update:** This version includes a configuration matrix and preferred
> proxy configuration methods for common AI coding agents.

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

## Linux

``` bash
sudo apt install python3-pip
pip install mitmproxy
# or
pipx install mitmproxy

mitmproxy --version
```

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
