# Multi-Stage / Hardened Dockerfile for Walvoil DPR Backend (Phase 16)
# Standardized on official Python 3.12 slim image

FROM python:3.12-slim AS base

# System dependencies for OpenCV headless and healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged application user
RUN groupadd -g 10001 walvoil && \
    useradd -u 10001 -g walvoil -s /bin/bash -m appuser

WORKDIR /app

# Install Python dependencies first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY app/ ./app/
COPY samples/ ./samples/
COPY evaluation/ ./evaluation/

# Create persistent cache and log directories with proper permissions
RUN mkdir -p /app/.cache/huggingface /app/logs && \
    chown -R appuser:walvoil /app

# Expose model cache and log storage outside the image
VOLUME ["/app/.cache", "/app/logs"]

# Security hardening: Run as non-root user
USER appuser

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    ENVIRONMENT=production \
    MODEL_CACHE_DIR=/app/.cache \
    HF_HOME=/app/.cache/huggingface \
    LOG_DIR=/app/logs

EXPOSE 8000

# Automated healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

