"""Comprehensive verification script for the Walvoil DPR backend.

Tests all endpoints via direct ASGI invocation (no httpx2 / TestClient required).

Test matrix:
  1. GET /                              -> 200, app info
  2. GET /health                        -> 200, healthy
  3. GET /api/v1/reports/status          -> 200, pipeline status
  4. POST /api/v1/reports/upload         -> 200, valid JPEG accepted
  5. POST /api/v1/reports/upload         -> 400, unsupported extension (.txt)
  6. POST /api/v1/reports/upload         -> 400, empty file (0 bytes)
  7. POST /api/v1/reports/upload         -> 400, file exceeding 10 MB
"""

import asyncio
import io
import json
import sys
from PIL import Image

from app.main import app


# ── ASGI test helper ────────────────────────────────────────────────────────

async def asgi_request(
    path: str,
    method: str = "GET",
    headers: list | None = None,
    body: bytes = b"",
) -> tuple[int, str]:
    """Send an HTTP request directly through the ASGI application."""
    req_headers: list[tuple[bytes, bytes]] = [(b"host", b"127.0.0.1:8000")]
    if headers:
        for k, v in headers:
            req_headers.append((k.encode(), v.encode()))

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "path": path,
        "root_path": "",
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": req_headers,
    }

    status_code: int | None = None
    resp_chunks: list[bytes] = []

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        nonlocal status_code
        if message["type"] == "http.response.start":
            status_code = message["status"]
        elif message["type"] == "http.response.body":
            resp_chunks.append(message.get("body", b""))

    await app(scope, receive, send)
    assert status_code is not None, "No HTTP response received from the application"
    return status_code, b"".join(resp_chunks).decode("utf-8")


def build_multipart(
    boundary: str,
    filename: str,
    content_type: str,
    file_bytes: bytes,
) -> bytes:
    """Construct a valid multipart/form-data body for file upload."""
    parts = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="files"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n"
        f"\r\n"
    ).encode("utf-8")
    return parts + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")


async def upload_request(
    boundary: str, filename: str, content_type: str, file_bytes: bytes
) -> tuple[int, dict]:
    """POST a single file to the upload endpoint and return (status, parsed_json)."""
    body = build_multipart(boundary, filename, content_type, file_bytes)
    status, text = await asgi_request(
        "/api/v1/reports/upload",
        method="POST",
        headers=[
            ("content-type", f"multipart/form-data; boundary={boundary}"),
            ("content-length", str(len(body))),
        ],
        body=body,
    )
    return status, json.loads(text)


# ── Helper to create a valid JPEG in memory ─────────────────────────────────

def make_jpeg(width: int = 200, height: int = 150) -> bytes:
    img = Image.new("RGB", (width, height), color="white")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ── Test cases ──────────────────────────────────────────────────────────────

PASS = 0
FAIL = 0
BOUNDARY = "----WalvoilTestBoundary9876"


def report(label: str, passed: bool, detail: str = ""):
    global PASS, FAIL
    tag = "PASS" if passed else "FAIL"
    if passed:
        PASS += 1
    else:
        FAIL += 1
    suffix = f"  ({detail})" if detail else ""
    print(f"  [{tag}] {label}{suffix}")


async def run_tests():
    global PASS, FAIL

    # ── 1. GET / ────────────────────────────────────────────────────────────
    print("\n1. GET /")
    status, text = await asgi_request("/")
    data = json.loads(text)
    report(
        "Status 200",
        status == 200,
        f"got {status}",
    )
    report(
        "Contains application name",
        "application" in data and "Walvoil" in data["application"],
        data.get("application", "MISSING"),
    )
    report(
        "Contains status=online",
        data.get("status") == "online",
        data.get("status", "MISSING"),
    )

    # ── 2. GET /health ──────────────────────────────────────────────────────
    print("\n2. GET /health")
    status, text = await asgi_request("/health")
    data = json.loads(text)
    report("Status 200", status == 200, f"got {status}")
    report(
        "Contains status=healthy",
        data.get("status") == "healthy",
        data.get("status", "MISSING"),
    )

    # ── 3. GET /api/v1/reports/status ────────────────────────────────────────
    print("\n3. GET /api/v1/reports/status")
    status, text = await asgi_request("/api/v1/reports/status")
    data = json.loads(text)
    report("Status 200", status == 200, f"got {status}")
    report(
        "Pipeline contains upload_intake",
        "pipeline" in data and data["pipeline"].get("upload_intake") == "ready",
    )
    report(
        "Reports supported formats",
        "supported_formats" in data and ".jpg" in data["supported_formats"],
    )
    report(
        "Max file size is 10 MB",
        data.get("max_file_size_mb") == 10,
        f"got {data.get('max_file_size_mb')}",
    )

    # ── 4. POST /upload — valid JPEG ────────────────────────────────────────
    print("\n4. POST /api/v1/reports/upload — valid JPEG")
    jpeg_bytes = make_jpeg(800, 600)
    status, data = await upload_request(
        BOUNDARY, "dpr_page1.jpg", "image/jpeg", jpeg_bytes
    )
    report("Status 200", status == 200, f"got {status}")
    report("success=True", data.get("success") is True)
    report("valid_files_count=1", data.get("valid_files_count") == 1)
    if data.get("files"):
        f0 = data["files"][0]
        report("File is_valid=True", f0.get("is_valid") is True)
        report(
            "Dimensions returned",
            f0.get("dimensions") is not None and len(f0["dimensions"]) == 2,
            str(f0.get("dimensions")),
        )
        report(
            "Size > 0",
            f0.get("size_bytes", 0) > 0,
            f'{f0.get("size_bytes")} bytes',
        )
    else:
        report("Files array present", False, "empty or missing")

    # ── 5. POST /upload — unsupported extension (.txt) ───────────────────────
    print("\n5. POST /api/v1/reports/upload — unsupported extension (.txt)")
    status, data = await upload_request(
        BOUNDARY, "notes.txt", "text/plain", b"This is not an image"
    )
    report("Status 400", status == 400, f"got {status}")
    report(
        "Error detail present",
        "detail" in data,
        str(data.get("detail", "MISSING"))[:120],
    )

    # ── 6. POST /upload — empty file (0 bytes) ──────────────────────────────
    print("\n6. POST /api/v1/reports/upload — empty file (0 bytes)")
    status, data = await upload_request(
        BOUNDARY, "empty_scan.jpg", "image/jpeg", b""
    )
    report("Status 400", status == 400, f"got {status}")
    report(
        "Error references empty",
        "detail" in data,
        str(data.get("detail", "MISSING"))[:120],
    )

    # ── 7. POST /upload — file exceeding 10 MB ──────────────────────────────
    print("\n7. POST /api/v1/reports/upload — file exceeding 10 MB")
    # Create a valid JPEG header, then pad to >10 MB.
    # We'll create a large real JPEG (a big flat image)
    oversized_img = Image.new("RGB", (4000, 3000), color="blue")
    oversized_buf = io.BytesIO()
    # Save as BMP-in-JPEG-wrapper won't easily exceed 10MB, so use raw RGB padding
    oversized_img.save(oversized_buf, format="JPEG", quality=100)
    oversized_base = oversized_buf.getvalue()
    # If JPEG compression keeps it under 10MB, pad with trailing garbage
    if len(oversized_base) < 10 * 1024 * 1024 + 1:
        # JPEG decoders ignore trailing bytes after EOI marker (FF D9),
        # but this will make len(content) > 10 MB for our size check
        padding_needed = (10 * 1024 * 1024 + 1024) - len(oversized_base)
        oversized_bytes = oversized_base + b"\x00" * padding_needed
    else:
        oversized_bytes = oversized_base

    status, data = await upload_request(
        BOUNDARY, "huge_scan.jpg", "image/jpeg", oversized_bytes
    )
    report("Status 400", status == 400, f"got {status}")
    report(
        "Error references size limit",
        "detail" in data
        and (
            "exceeds" in str(data["detail"]).lower()
            or "10" in str(data["detail"])
        ),
        str(data.get("detail", "MISSING"))[:120],
    )

    # ── Summary ──────────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"RESULTS: {PASS} passed, {FAIL} failed out of {PASS + FAIL} checks")
    print(f"{'='*60}")
    return FAIL == 0


if __name__ == "__main__":
    success = asyncio.run(run_tests())
    sys.exit(0 if success else 1)
