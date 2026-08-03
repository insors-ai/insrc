import pytest
from pydantic import ValidationError

from camon.config import AppConfig


def test_background_color_defaults_to_dark_navy(tmp_path):
    config = AppConfig(database_path=tmp_path / "camon.sqlite3")

    assert config.background_color == "#071a33"


def test_background_color_accepts_hex_and_rejects_invalid_values(tmp_path):
    config = AppConfig(database_path=tmp_path / "camon.sqlite3", background_color="#123")

    assert config.background_color == "#123"
    with pytest.raises(ValidationError):
        AppConfig(database_path=tmp_path / "camon.sqlite3", background_color="navy")
