"""Shared test configuration for the backend test suite.

The application creates its SQLAlchemy engine at import time from the
``DATABASE_URL`` environment variable. Tests must never point at a real
database (e.g. the deployed Supabase/PostgreSQL instance), and importing the
engine must not require the ``psycopg2`` driver.

This sets ``DATABASE_URL`` to a throwaway file-based SQLite database *before*
any application module is imported, so the whole suite runs against an isolated
database. Individual tests may still override the session dependency to use
their own temporary database.
"""
import os
import tempfile

_test_db_dir = tempfile.mkdtemp(prefix="claimpilot-tests-")
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_test_db_dir, "claimpilot_test.db")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.main import app
from backend.db import database, models


@pytest.fixture
def sqlite_db(tmp_path):
    """A temp file-based SQLite database wired into the app via dependency override."""
    db_path = tmp_path / "claimpilot_fixture.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    models.Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[database.get_db] = override_get_db
    try:
        yield engine, TestingSession
    finally:
        app.dependency_overrides.pop(database.get_db, None)
        engine.dispose()


@pytest.fixture
def client():
    return TestClient(app)
