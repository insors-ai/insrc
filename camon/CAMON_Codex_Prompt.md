# CAMON — Coding Agent Monitor

## Codex Prompt

Build **CAMON (Coding Agent Monitor)**, a Python application that provides passive observability and reporting for AI coding agents (Claude Code, Codex CLI, Cursor, Continue, Cline, Roo Code, Aider, etc.) by integrating with an existing mitmproxy installation.

## Goals

- Integrate with an already running mitmproxy process.
- Ensure the CAMON mitmproxy addon is registered.
- Restart mitmproxy only when explicitly configured to manage it.
- Never block or modify traffic.
- Attribute requests to the originating coding agent.
- Store normalized usage in SQLite.
- Present a live Textual TUI.
- Export usage reports.

## Runtime

- Python 3.12+
- mitmproxy
- Textual
- Typer
- Pydantic
- sqlite3
- psutil
- pytest
- Ruff
- mypy

## Architecture

```text
Coding Agents
      │
      ▼
 Existing mitmproxy
      │
      ▼
 CAMON mitmproxy addon
      │
      ▼
 SQLite
      │
      ▼
 Textual TUI
```

## Core Features

- Passive monitoring only
- No request modification
- No blocking
- No payload persistence by default
- Process attribution (macOS/Linux)
- Agent classification using configurable regex rules
- Provider/model detection
- Token usage extraction or estimation
- Session grouping
- Live dashboard
- CSV/JSON export

## Mitmproxy

Assume mitmproxy is already installed and running.

The TUI should:

- Detect mitmproxy
- Verify addon heartbeat
- Register addon if missing
- Restart only when explicitly configured as a managed process
- Never restart unmanaged instances automatically

## Agent Attribution

Determine the originating coding agent using:

1. Socket → PID correlation
2. Process name
3. Command-line regex
4. Parent process chain
5. HTTP fingerprint
6. Unknown

Never rely on fixed installation paths.

## Database

SQLite with:

- addon_status
- requests
- sessions
- daily_usage
- process_instances
- agent_rules

Enable WAL mode.

## TUI

Screens:

- Overview
- Agents
- Sessions
- Requests
- Providers
- Runtime

Refresh every 2 seconds.

## CLI

```text
camon
camon status
camon register
camon restart
camon report
camon export
```

## Deliverables

1. Complete project scaffold
2. Database schema
3. Core models
4. mitmproxy addon
5. Runtime management
6. Agent attribution
7. Textual UI
8. Tests
9. Documentation

Implement incrementally:

- Phase 1: scaffold, config, storage
- Phase 2: addon + persistence
- Phase 3: attribution
- Phase 4: TUI
- Phase 5: reporting + packaging

After each phase:

- Run tests
- Run Ruff
- Run mypy
- Fix issues before continuing.
