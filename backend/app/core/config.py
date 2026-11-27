"""Core configuration settings for the Walvoil DPR Backend application (Phase 16).

Provides centralized, environment-based configuration for:
- Network binding and CORS access policies
- Secure upload size, dimension, and decompression bomb thresholds
- In-memory cache limits and TTL lifecycle
- Logging levels and log output paths
- Model execution, cache directories, and concurrency controls
"""

import os
from typing import List, Tuple


class Settings:
    """Application settings loaded from environment variables with safe defaults."""

    # Application Info
    APP_NAME: str = os.getenv("APP_NAME", "Walvoil DPR Digitisation API")
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development").lower()

    # Server Network Binding
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))

    # API Routing
    API_V1_PREFIX: str = "/api/v1"

    # CORS Configuration
    # Strictly restricted to configured frontend origins; rejects wildcard * in production
    _cors_env: str = os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    )
    CORS_ORIGINS: List[str] = [
        origin.strip() for origin in _cors_env.split(",") if origin.strip()
    ]

    # File & Image Security Validation Limits
    MAX_FILE_SIZE_MB: int = int(os.getenv("MAX_FILE_SIZE_MB", "10"))
    MAX_FILE_SIZE_BYTES: int = MAX_FILE_SIZE_MB * 1024 * 1024

    MAX_IMAGE_WIDTH: int = int(os.getenv("MAX_IMAGE_WIDTH", "8192"))
    MAX_IMAGE_HEIGHT: int = int(os.getenv("MAX_IMAGE_HEIGHT", "8192"))
    MAX_IMAGE_PIXELS: int = int(os.getenv("MAX_IMAGE_PIXELS", "67108864"))  # 8192 x 8192

    ALLOWED_EXTENSIONS: Tuple[str, ...] = (".jpg", ".jpeg", ".png", ".webp")
    ALLOWED_MIME_TYPES: Tuple[str, ...] = (
        "image/jpeg",
        "image/png",
        "image/webp",
    )

    # In-Memory Cache Security & Resource Management
    CACHE_MAX_ENTRIES: int = int(os.getenv("CACHE_MAX_ENTRIES", "50"))
    CACHE_TTL_SECONDS: int = int(os.getenv("CACHE_TTL_SECONDS", "3600"))

    # Concurrency and Throttling
    CONCURRENCY_LIMIT: int = int(os.getenv("CONCURRENCY_LIMIT", "4"))
    ENABLE_DETAILED_ERRORS: bool = (
        os.getenv("ENABLE_DETAILED_ERRORS", "false").lower() == "true"
    )

    # Logging Configuration
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()

    # Portable Base Paths (Dynamic relative to repository root)
    BACKEND_ROOT: str = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )
    LOG_DIR: str = os.getenv("LOG_DIR", os.path.join(BACKEND_ROOT, "logs"))
    LOG_FILE_PATH: str = os.path.join(LOG_DIR, "walvoil_dpr_api.log")

    MODEL_CACHE_DIR: str = os.getenv(
        "MODEL_CACHE_DIR", os.path.join(BACKEND_ROOT, ".cache")
    )
    _user_hf: str = os.path.expanduser("~/.cache/huggingface")
    HF_HOME: str = os.getenv(
        "HF_HOME", _user_hf if os.path.isdir(_user_hf) else os.path.join(MODEL_CACHE_DIR, "huggingface")
    )

    # Selected Hybrid Pretrained Models (ASLY-DPR-REV01)
    MODEL_TROCR_SMALL: str = "microsoft/trocr-small-handwritten"
    MODEL_PPOCR_REC: str = "en_PP-OCRv5_mobile_rec"

    # Model Execution Settings
    RECOGNITION_DEVICE: str = os.getenv("RECOGNITION_DEVICE", "cpu")
    AUTO_DOWNLOAD_MODELS: bool = (
        os.getenv("AUTO_DOWNLOAD_MODELS", "true").lower() == "true"
    )
    CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.85"))

    # Cell Pre-filter Heuristics
    EMPTY_CELL_VARIANCE_THRESHOLD: float = float(
        os.getenv("EMPTY_CELL_VARIANCE_THRESHOLD", "120.0")
    )
    EMPTY_CELL_DARK_RATIO_THRESHOLD: float = float(
        os.getenv("EMPTY_CELL_DARK_RATIO_THRESHOLD", "0.015")
    )


# Set environment variables for huggingface and model libraries
_root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_user_hf_default = os.path.expanduser("~/.cache/huggingface")
os.environ.setdefault(
    "HF_HOME",
    _user_hf_default if os.path.isdir(_user_hf_default) else os.path.join(_root_dir, ".cache", "huggingface"),
)
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

settings = Settings()
