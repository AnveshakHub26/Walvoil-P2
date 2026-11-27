"""Main FastAPI application entrypoint for Walvoil DPR backend (Phase 16).

Configures:
- Structured application logging without logging confidential handwriting
- Production security headers middleware
- Global sanitized exception handling preventing stack trace leakage
- Thread-safe health and readiness monitoring
- Environment-based CORS access restrictions
"""

import logging
import os
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router as reports_router
from app.core.config import settings
from app.services.image_preprocessing import processed_image_store

# ── Structured Logging Configuration ─────────────────────────────────────────

os.makedirs(settings.LOG_DIR, exist_ok=True)

logging_handlers = [logging.StreamHandler()]
try:
    file_handler = logging.FileHandler(settings.LOG_FILE_PATH, encoding="utf-8")
    logging_handlers.append(file_handler)
except Exception:
    pass

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
    handlers=logging_handlers,
)

logger = logging.getLogger("walvoil.api")
app_start_time = time.time()


# ── Application Lifespan Events ──────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown lifecycle."""
    logger.info("=" * 60)
    logger.info("Walvoil DPR Backend starting up...")
    logger.info("Application: %s (v%s)", settings.APP_NAME, settings.APP_VERSION)
    logger.info("Environment: %s", settings.ENVIRONMENT)
    logger.info("Allowed CORS Origins: %s", settings.CORS_ORIGINS)
    logger.info("Max File Size: %d MB", settings.MAX_FILE_SIZE_MB)
    logger.info("Max Image Resolution: %dx%d px", settings.MAX_IMAGE_WIDTH, settings.MAX_IMAGE_HEIGHT)
    logger.info("Model Device: %s", settings.RECOGNITION_DEVICE)
    logger.info("=" * 60)
    yield
    logger.info("Walvoil DPR Backend shutting down cleanly.")


# ── FastAPI Application Instance ─────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Secure, production-grade backend for Walvoil Daily Production Report digitisation.",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT != "production" or settings.ENABLE_DETAILED_ERRORS else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" or settings.ENABLE_DETAILED_ERRORS else None,
)

# ── CORS Middleware ──────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ── Security Headers & Request Tracing Middleware ────────────────────────────


@app.middleware("http")
async def security_and_tracing_middleware(request: Request, call_next):
    """Inject standard security headers and trace request durations."""
    request_id = str(uuid.uuid4())[:8]
    start_time = time.perf_counter()

    # Pass request_id via state
    request.state.request_id = request_id

    try:
        response: Response = await call_next(request)
    except Exception as exc:
        duration_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
        logger.error(
            "Unhandled exception on %s %s [%s] after %.2f ms: %s",
            request.method,
            request.url.path,
            request_id,
            duration_ms,
            exc,
            exc_info=True,
        )
        if settings.ENABLE_DETAILED_ERRORS:
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "detail": f"Internal server error: {str(exc)}",
                    "request_id": request_id,
                },
            )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "detail": "An internal server error occurred while processing the request.",
                "request_id": request_id,
            },
        )

    duration_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

    # Security Headers
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"

    # Log non-sensitive access log
    logger.info(
        "%s %s -> HTTP %d (%.2f ms) [Req: %s]",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        request_id,
    )

    return response


# ── Global Exception Handlers ────────────────────────────────────────────────


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle explicit HTTPExceptions without altering status or detail."""
    req_id = getattr(request.state, "request_id", "unknown")
    logger.warning(
        "HTTP %d on %s [%s]: %s", exc.status_code, request.url.path, req_id, exc.detail
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "request_id": req_id},
        headers=getattr(exc, "headers", None),
    )


# ── System Endpoints ─────────────────────────────────────────────────────────


@app.get("/", tags=["system"])
def root_endpoint():
    """Root endpoint returning application name, version, and status."""
    return {
        "application": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "online",
        "environment": settings.ENVIRONMENT,
        "api_v1_prefix": settings.API_V1_PREFIX,
    }


@app.get("/health", tags=["system"])
def health_endpoint():
    """Service health and operational readiness check."""
    uptime_seconds = round(time.time() - app_start_time, 2)
    cache_metrics = processed_image_store.get_metrics()

    return {
        "status": "healthy",
        "service": "walvoil-dpr-backend",
        "environment": settings.ENVIRONMENT,
        "uptime_seconds": uptime_seconds,
        "pipeline_ready": True,
        "cache": cache_metrics,
    }


# Mount versioned API routes
app.include_router(reports_router, prefix=settings.API_V1_PREFIX)

# Direct aliases for /api/v1/recognize and /api/v1/status
from app.api.routes import get_reports_service_status, recognize_dpr_endpoint

app.add_api_route(
    f"{settings.API_V1_PREFIX}/recognize",
    recognize_dpr_endpoint,
    methods=["POST"],
    tags=["recognition"],
)
app.add_api_route(
    f"{settings.API_V1_PREFIX}/status",
    get_reports_service_status,
    methods=["GET"],
    tags=["system"],
)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=(settings.ENVIRONMENT == "development"),
    )
