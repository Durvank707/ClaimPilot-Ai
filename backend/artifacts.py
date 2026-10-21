"""Actionable validation for required, non-committed runtime artifacts.

The trained model binaries and the processed reference dataset are intentionally
**not** tracked in Git (they are large, and the raw data is third-party). A fresh
checkout therefore has to obtain them out of band. When one is missing the
default failure is an opaque ``FileNotFoundError`` deep inside ``joblib.load``
with no hint of what to do.

:func:`require_files` replaces that with a clear, secret-free error that names
each missing artifact and points at the setup documentation, so a first run fails
loudly and usefully instead of confusingly. Nothing here reads file contents or
ever includes credentials.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, Mapping

# Short, non-secret pointer included in errors. Kept in one place so the message
# stays consistent with the documentation.
SETUP_HINT = (
    "See the 'Model and data artifacts' section of README.md for how to obtain "
    "these artifacts: the raw dataset comes from the documented third-party "
    "source and the trained models are provisioned separately (they are not "
    "committed)."
)


class MissingArtifactsError(RuntimeError):
    """Raised when one or more required runtime artifacts do not exist.

    The message lists every missing path and a setup hint. It never contains
    secrets or file contents.
    """


def missing_files(paths: Iterable[Path]) -> list[Path]:
    """Return the subset of ``paths`` that are not existing files, in order."""
    return [Path(p) for p in paths if not Path(p).is_file()]


def require_files(paths: Mapping[str, Path]) -> None:
    """Validate that every named artifact exists, else raise one clear error.

    ``paths`` maps a human-readable label (e.g. ``"fraud model"``) to its
    resolved location. All missing artifacts are reported together so the user
    can fix them in one pass.
    """
    missing = [(label, Path(path)) for label, path in paths.items() if not Path(path).is_file()]
    if not missing:
        return
    details = "; ".join(f"{label} -> {path}" for label, path in missing)
    raise MissingArtifactsError(
        "Required runtime artifact(s) are missing and are not committed to Git: "
        f"{details}. {SETUP_HINT}"
    )
