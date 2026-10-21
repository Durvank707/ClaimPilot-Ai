"""Health, liveness and readiness endpoints.

- ``GET /`` and ``GET /health`` are public liveness probes: they must answer
  without credentials and expose no claim, analysis or review data.
- ``GET /ready`` is public too (a probe cannot authenticate), but it reports the
  *real* state of its dependencies rather than assuming success: whether the ML
  analyzer was actually constructed, whether database tables were initialized,
  and whether the authentication configuration is safe for this environment.
  A failure to construct the analyzer is logged (without secrets) and reported
  as not-ready rather than crashing the import.
"""
import logging

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/")
def root():
    return {"service": "ClaimPilot AI", "status": "running", "version": "1.0.0"}


@router.get("/health")
def health():
    """Liveness: the process is up and serving requests.

    Deliberately does not touch the database or models so a dependency outage
    cannot make a healthy process look dead. The distinct, readonly view of
    dependency health is ``/ready``.
    """
    return {"status": "healthy"}


def _models_loaded() -> bool:
    """Whether the ML analyzer and each of its models were really constructed.

    ``backend.dependencies`` builds the analyzer at import; if that failed the
    import raises and this is never reached. This re-checks the live object so a
    partially-initialized analyzer is reported honestly.
    """
    try:
        from backend.dependencies import analyzer
    except Exception:
        logger.exception("Analyzer could not be imported; reporting not ready.")
        return False

    if analyzer is None:
        return False
    required = ("fraud", "sev", "anom", "scorer", "de", "explainer")
    missing = [name for name in required if getattr(analyzer, name, None) is None]
    if missing:
        logger.error("Analyzer is missing components: %s", ", ".join(missing))
        return False
    return True


def _database_ready() -> bool:
    """Whether the database was initialized *and* is currently reachable.

    A previously-initialized database that has since gone away must not be
    reported ready, so this re-checks connectivity rather than trusting the
    startup flag alone.
    """
    from backend import main as backend_main

    if not backend_main.database_initialized:
        return False
    return backend_main.check_database_connectivity()


@router.get("/ready")
def ready():
    """Report genuine readiness: database, models and required configuration.

    ``models_loaded`` keeps its original meaning (analysis models available) so
    existing clients are unaffected; ``database_initialized`` and
    ``auth_configured`` are additive. ``database_initialized`` additionally
    reflects a live connectivity check, so a database that became unreachable
    after startup is reported not-ready. ``status`` is ``ready`` only when all
    three hold.
    """
    models_loaded = _models_loaded()
    database_initialized = _database_ready()
    try:
        from backend import auth

        auth_configured = auth.enforce_configuration()
    except Exception:
        logger.exception("Auth configuration could not be evaluated.")
        auth_configured = False

    is_ready = models_loaded and database_initialized and auth_configured
    return {
        "status": "ready" if is_ready else "not_ready",
        "models_loaded": models_loaded,
        "database_initialized": database_initialized,
        "auth_configured": auth_configured,
    }
