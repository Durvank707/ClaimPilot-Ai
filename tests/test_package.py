import sys
from pathlib import Path

import pytest


def test_package_importable():
    """Test that the claimpilot package can be imported."""
    project_root = Path(__file__).resolve().parents[1]
    src_path = project_root / "src"
    if str(src_path) not in sys.path:
        sys.path.insert(0, str(src_path))

    import claimpilot

    assert claimpilot is not None


def test_config_module_importable():
    """Test that config module is importable."""
    project_root = Path(__file__).resolve().parents[1]
    src_path = project_root / "src"
    if str(src_path) not in sys.path:
        sys.path.insert(0, str(src_path))

    from claimpilot.config import settings, get_settings

    assert settings is not None
    assert get_settings() is not None


def test_utils_logger_importable():
    """Test that logger utility is importable."""
    project_root = Path(__file__).resolve().parents[1]
    src_path = project_root / "src"
    if str(src_path) not in sys.path:
        sys.path.insert(0, str(src_path))

    from claimpilot.utils.logger import setup_logger

    logger = setup_logger(name="test_logger", log_to_file=False)
    assert logger is not None
    assert logger.name == "test_logger"
