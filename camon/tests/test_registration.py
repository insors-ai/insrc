from pathlib import Path

import pytest

from camon.registration import _update_macos_program_arguments


def test_macos_registration_adds_addon_to_local_service():
    document = {
        "Label": "local.mitmproxy",
        "ProgramArguments": [
            "/opt/homebrew/bin/mitmdump",
            "--listen-host",
            "127.0.0.1",
            "--listen-port",
            "8080",
        ],
    }
    addon = Path("/tmp/camon/addon.py")

    mitmdump = Path("/tmp/camon/mitmdump")
    assert _update_macos_program_arguments(document, addon, mitmdump)
    assert document["ProgramArguments"][0] == str(mitmdump)
    assert document["ProgramArguments"][-2:] == ["-s", str(addon)]
    assert document["EnvironmentVariables"]["CAMON_DATABASE"].endswith(".insrc/camon/camon.sqlite3")
    assert not _update_macos_program_arguments(document, addon, mitmdump)


def test_macos_registration_rejects_non_local_agent():
    document = {"Label": "unrelated", "ProgramArguments": ["mitmdump"]}
    with pytest.raises(ValueError, match="other than local.mitmproxy"):
        _update_macos_program_arguments(document, Path("/tmp/addon.py"), Path("/tmp/mitmdump"))
