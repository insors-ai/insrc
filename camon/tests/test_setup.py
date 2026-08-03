import json
from pathlib import Path

import camon.setup as setup
from camon.setup import launcher_path, setup_agent


def test_setup_agent_creates_opt_in_proxy_launcher(tmp_path):
    launcher = setup_agent("codex-cli", "http://127.0.0.1:8080", "/bin/echo", tmp_path)

    assert launcher == launcher_path("codex-cli", tmp_path)
    assert launcher.stat().st_mode & 0o111
    content = launcher.read_text()
    assert "HTTP_PROXY=http://127.0.0.1:8080" in content
    assert "exec /bin/echo \"$@\"" in content


def test_detects_cursor_installed_as_macos_application(tmp_path, monkeypatch):
    executable = tmp_path / "Cursor.app" / "Contents" / "MacOS" / "Cursor"
    executable.parent.mkdir(parents=True)
    executable.touch()
    monkeypatch.setattr(setup.sys, "platform", "darwin")

    assert setup._macos_application_executable("cursor", (Path(tmp_path),)) == str(executable)


def test_process_executable_does_not_use_intermediary_shell():
    assert setup._process_executable("claude-code", ["/bin/zsh", "-c", "claude -r"]) is None
    assert setup._process_executable("claude-code", ["/somewhere/claude", "-r"]) == "/somewhere/claude"


def test_claude_settings_are_merged_with_proxy_environment(tmp_path, monkeypatch):
    settings_path = tmp_path / ".claude" / "settings.json"
    certificate_path = tmp_path / "mitmproxy-ca-cert.pem"
    settings_path.parent.mkdir()
    settings_path.write_text('{"permissions": {"allow": ["Bash(git status)"]}, "env": {"KEEP": "yes"}}')
    certificate_path.touch()
    monkeypatch.setattr(setup, "claude_settings_path", lambda: settings_path)
    monkeypatch.setattr(setup, "mitmproxy_ca_cert_path", lambda: certificate_path)

    target = setup_agent("claude-code", "http://127.0.0.1:8080")

    assert target == settings_path
    values = json.loads(settings_path.read_text())
    assert values["permissions"]["allow"] == ["Bash(git status)"]
    assert values["env"]["KEEP"] == "yes"
    assert values["env"]["HTTP_PROXY"] == "http://127.0.0.1:8080"
    assert values["env"]["HTTPS_PROXY"] == "http://127.0.0.1:8080"
    assert values["env"]["NODE_EXTRA_CA_CERTS"] == str(certificate_path)
