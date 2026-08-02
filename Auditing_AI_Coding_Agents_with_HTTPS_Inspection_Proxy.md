# Auditing AI Coding Agents with an HTTPS Inspection Proxy

## A Practical Guide to Observing What Your AI Coding Agent Sends

------------------------------------------------------------------------

## Introduction

Modern AI coding agents have become one of the most privileged
applications running on a developer workstation.

Depending on the tool, they may have access to:

-   Entire source repositories
-   Git history
-   Build systems
-   Shell commands
-   Architecture documentation
-   Infrastructure configuration
-   Secrets (if not properly excluded)

Most developers assume that only the files directly related to their
prompt are transmitted to the cloud.

In reality, every coding agent implements its own context selection
algorithm. Some use dependency graphs. Others rely on semantic search.
Others simply upload entire files or multiple related files.

The only reliable way to know what is actually being transmitted is to
inspect the network traffic before it leaves your machine.

The objective is **transparency**, not distrust.

------------------------------------------------------------------------

# How HTTPS Inspection Works

Normally the communication path looks like this:

``` text
Coding Agent
      │
      ▼
TLS Encryption
      │
      ▼
Internet
      │
      ▼
Provider Server
```

An HTTPS inspection proxy inserts itself between the agent and the
provider.

``` text
Coding Agent
      │
      ▼
HTTPS Proxy
      │
      ▼
Provider Server
```

The proxy terminates the first TLS session, decrypts the request,
records it, then establishes a second encrypted connection to the
provider.

The provider receives exactly the same request.

The coding agent behaves normally.

The only difference is that you now have complete visibility into the
request.

# Choosing a Proxy

  Tool                   OS                    License       Recommended
  ---------------------- --------------------- ------------- -------------
  mitmproxy              macOS/Linux/Windows   Open Source   ⭐⭐⭐⭐⭐
  Burp Suite Community   All                   Free          ⭐⭐⭐⭐
  Charles Proxy          All                   Commercial    ⭐⭐⭐⭐
  Proxyman               macOS                 Commercial    ⭐⭐⭐⭐⭐

For this guide we will use **mitmproxy** because it is open source,
cross-platform, well documented, and easy to automate.

# Installing mitmproxy

## macOS

``` bash
brew install mitmproxy
mitmproxy --version
```

## Linux (Ubuntu/Debian)

``` bash
sudo apt install python3-pip
pip install mitmproxy
# or
pipx install mitmproxy

mitmproxy --version
```

## Windows

Using winget:

``` powershell
winget install mitmproxy.mitmproxy
```

Or download directly from https://mitmproxy.org

# Starting the Proxy

``` bash
mitmweb
```

Default Web UI:

    http://127.0.0.1:8081

Default Proxy:

    127.0.0.1:8080

# Installing the Proxy Certificate

Open:

    http://mitm.it

Download the certificate for your operating system and install it into
the trusted certificate store.

## macOS

-   Open Keychain Access
-   Import the certificate
-   Open the certificate
-   Set **Always Trust**

## Linux

``` bash
sudo cp mitmproxy-ca-cert.pem /usr/local/share/ca-certificates/
sudo update-ca-certificates
```

## Windows

Run:

``` powershell
certmgr.msc
```

Import into **Trusted Root Certification Authorities**.

# Testing the Proxy

Configure your browser to use:

    127.0.0.1:8080

Visit:

    https://example.com

If the request appears in mitmproxy, the setup is working.

# Configuring Claude Code

``` bash
export HTTP_PROXY=http://127.0.0.1:8080
export HTTPS_PROXY=http://127.0.0.1:8080

claude
```

# Configuring Codex CLI

``` bash
export HTTP_PROXY=http://127.0.0.1:8080
export HTTPS_PROXY=http://127.0.0.1:8080

codex
```

Verify that your version routes all outbound requests through the proxy.

# Configuring Cursor

Configure your operating system HTTP/HTTPS proxy:

-   Host: `127.0.0.1`
-   Port: `8080`

Restart Cursor and verify requests appear in mitmproxy.

# Configuring VS Code Extensions

Many extensions respect:

    HTTP_PROXY
    HTTPS_PROXY

Others use:

``` json
{
  "http.proxy": "http://127.0.0.1:8080"
}
```

# Verifying Traffic

Issue a simple prompt such as:

> Explain this function.

Look for POST requests and inspect:

-   Headers
-   Request body
-   Response body
-   Timing
-   Size

# What to Look For

-   Was only one file uploaded?
-   Were multiple files included?
-   Was `.env` excluded?
-   Was `.git` ignored?
-   Was Git history included?
-   Does the upload size match expectations?

# Saving Requests

Export flows or save a HAR file for later analysis.

# Useful Filters

    ~m POST
    ~u openai
    ~u anthropic
    ~u cursor
    ~u xai
    ~u google

# Detecting Excessive Context

If the prompt is:

> Rename one variable

but the upload is 40+ MB, investigate why. The behavior may be
legitimate, but visibility allows you to validate assumptions.

# Limitations

HTTPS inspection cannot observe:

-   Files accessed locally but never transmitted
-   Certificate-pinned applications
-   Application-level encryption on top of HTTPS
-   Local preprocessing before transmission

It answers one question exceptionally well:

> **What actually left my machine?**

# Best Practices

-   Use a dedicated proxy for AI tooling.
-   Test after agent updates.
-   Exclude highly sensitive repositories until governance policies are
    established.
-   Periodically review transmitted context.

# Conclusion

An HTTPS inspection proxy does not imply that a vendor is untrustworthy.
It provides independent visibility into what information leaves a
developer's machine. As AI coding agents become increasingly central to
software development, this level of transparency should become a routine
part of engineering governance.
