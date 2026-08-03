import pytest

from camon.config import AppConfig
from camon.runtime import restart_managed


def test_restart_rejects_unmanaged_proxy(tmp_path):
    config = AppConfig(database_path=tmp_path / "camon.sqlite3")
    with pytest.raises(PermissionError):
        restart_managed(config)
