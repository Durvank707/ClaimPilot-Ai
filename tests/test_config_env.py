"""Regression tests for project ``.env`` loading (Step 4I).

These tests drive ``backend.config.load_project_env`` against temporary ``.env``
files only. They never read or modify the developer's real project ``.env`` and
never open a database connection. Synthetic, non-real values are used
throughout, and no value is ever printed.
"""
import os
import subprocess
import sys
from pathlib import Path

from backend import config as backend_config

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _write_env(directory: Path, **values: str) -> Path:
    """Write a throwaway ``.env`` file into ``directory`` and return its path."""
    env_file = directory / ".env"
    env_file.write_text(
        "".join(f"{key}={value}\n" for key, value in values.items()),
        encoding="utf-8",
    )
    return env_file


def test_env_file_value_is_loaded_when_process_var_absent(tmp_path, monkeypatch):
    """(1) A value in .env is applied when the process variable is not set."""
    key = "CLAIMPILOT_TEST_LOADED"
    monkeypatch.delenv(key, raising=False)
    env_file = _write_env(tmp_path, **{key: "from_env_file"})

    backend_config.load_project_env(env_file)

    assert os.environ.get(key) == "from_env_file"


def test_process_env_takes_precedence_over_env_file(tmp_path, monkeypatch):
    """(2) A real process variable must win over the .env value."""
    key = "CLAIMPILOT_TEST_PRECEDENCE"
    monkeypatch.setenv(key, "from_process")
    env_file = _write_env(tmp_path, **{key: "from_env_file"})

    backend_config.load_project_env(env_file)

    assert os.environ.get(key) == "from_process"


def test_default_env_file_is_anchored_to_project_root():
    """(3a) The default target is <project root>/.env, not a cwd-relative path."""
    assert backend_config.ENV_FILE.name == ".env"
    assert backend_config.ENV_FILE.parent == PROJECT_ROOT
    assert backend_config.ENV_FILE.is_absolute()
    assert backend_config.PROJECT_ROOT == PROJECT_ROOT


def test_load_resolves_path_independent_of_cwd(tmp_path, monkeypatch):
    """(3b) An explicitly supplied .env loads even from a different cwd."""
    key = "CLAIMPILOT_TEST_CWD"
    monkeypatch.delenv(key, raising=False)
    env_file = _write_env(tmp_path, **{key: "loaded"})

    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)

    loaded = backend_config.load_project_env(env_file)

    assert loaded == env_file
    assert os.environ.get(key) == "loaded"


def test_default_load_uses_project_root_env_from_other_cwd(tmp_path, monkeypatch):
    """(3c) The no-argument load targets ENV_FILE regardless of cwd.

    ``ENV_FILE`` is monkeypatched to a temporary file so the real project .env
    is never touched.
    """
    key = "CLAIMPILOT_TEST_DEFAULT"
    monkeypatch.delenv(key, raising=False)
    env_file = _write_env(tmp_path, **{key: "default_loaded"})
    monkeypatch.setattr(backend_config, "ENV_FILE", env_file)
    monkeypatch.setattr(backend_config, "_env_loaded", False)

    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)

    backend_config.load_project_env()

    assert os.environ.get(key) == "default_loaded"


def test_loading_does_not_print_values(tmp_path, monkeypatch, capsys):
    """(5) Loading a .env that holds a value prints nothing to stdout/stderr."""
    key = "CLAIMPILOT_TEST_QUIET"
    value = "synthetic-quiet-value-not-real"
    monkeypatch.delenv(key, raising=False)
    env_file = _write_env(tmp_path, **{key: value})

    backend_config.load_project_env(env_file)

    captured = capsys.readouterr()
    assert value not in captured.out
    assert value not in captured.err


def test_importing_backend_config_does_not_leak_secrets(tmp_path):
    """(5) Importing the backend config module prints no secret values.

    Runs in a subprocess from a scratch cwd so the real project .env is not
    involved; only the synthetic temp .env is loaded.
    """
    key = "CLAIMPILOT_TEST_SUBPROCESS"
    value = "synthetic-subprocess-secret-not-real"
    env_file = _write_env(tmp_path, **{key: value})

    script = (
        "import os\n"
        "import backend.config as c\n"
        f"c.load_project_env(r'{env_file}')\n"
        f"print('LOADED', os.environ.get('{key}') == {value!r})\n"
        "print('PRECEDENCE', os.environ.get('CLAIMPILOT_TEST_SUBPROCESS_PROC') == 'from_process')\n"
    )

    env = dict(os.environ)
    env["PYTHONPATH"] = str(PROJECT_ROOT)
    env["CLAIMPILOT_TEST_SUBPROCESS_PROC"] = "from_process"
    env.pop(key, None)

    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(tmp_path),
        capture_output=True,
        text=True,
        env=env,
    )

    combined = result.stdout + result.stderr
    assert result.returncode == 0, combined
    assert value not in combined
    assert "LOADED True" in result.stdout
    assert "PRECEDENCE True" in result.stdout


def test_database_url_prefers_process_env_over_env_file():
    """(2) The real app engine uses the process DATABASE_URL, not the .env one."""
    from backend.db import database

    assert os.environ["DATABASE_URL"] == database.DATABASE_URL
    assert database.DATABASE_URL.startswith("sqlite:///")
