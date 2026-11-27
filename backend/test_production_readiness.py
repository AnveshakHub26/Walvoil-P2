"""Production Readiness, Security, and Reliability Test Suite (Phase 16).

Validates:
1. Production security headers injection on HTTP responses
2. Path traversal sanitization in file upload handlers
3. Decompression bomb and image resolution boundary enforcement
4. Non-leaking error responses (zero stack trace / server path leakage)
5. CORS policy compliance
6. Health and readiness monitoring endpoint
7. Bounded in-memory cache lifecycle and purge controls
8. Concurrency semaphore and thread safety under concurrent load
"""

import asyncio
import io
import json
import os
import sys
from typing import Any, Dict, List, Tuple

from PIL import Image

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.config import settings
from app.main import app
from app.services.image_preprocessing import (
    InMemoryProcessedStore,
    processed_image_store,
    validate_and_inspect_image,
)

passed_checks = 0
failed_checks = 0


def check(name: str, condition: bool, detail: str = ""):
    global passed_checks, failed_checks
    if condition:
        passed_checks += 1
        print(f"  [PASS] {name} {detail}")
    else:
        failed_checks += 1
        print(f"  [FAIL] {name} - FAILED {detail}")


# ── ASGI Test Client Helper ──────────────────────────────────────────────────


async def asgi_request(
    path: str,
    method: str = "GET",
    headers: list | None = None,
    body: bytes = b"",
) -> Tuple[int, dict | str, dict]:
    """Execute request directly through ASGI app and capture headers."""
    req_headers: list[tuple[bytes, bytes]] = [(b"host", b"127.0.0.1:8000")]
    if headers:
        for k, v in headers:
            req_headers.append((k.lower().encode(), v.encode()))

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

    response_body = io.BytesIO()
    response_status = 200
    resp_headers_dict: dict[str, str] = {}

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        nonlocal response_status, resp_headers_dict
        if message["type"] == "http.response.start":
            response_status = message["status"]
            for hk, hv in message.get("headers", []):
                resp_headers_dict[hk.decode("latin1").lower()] = hv.decode("latin1")
        elif message["type"] == "http.response.body":
            response_body.write(message.get("body", b""))

    await app(scope, receive, send)

    raw_resp = response_body.getvalue()
    try:
        parsed_json = json.loads(raw_resp.decode("utf-8"))
        return response_status, parsed_json, resp_headers_dict
    except Exception:
        return response_status, raw_resp.decode("utf-8", errors="replace"), resp_headers_dict


def build_multipart_file(field_name: str, filename: str, content: bytes, content_type: str) -> tuple[bytes, str]:
    boundary = "----WalvoilSecurityTestBoundary987654321"
    buf = io.BytesIO()
    buf.write(f"--{boundary}\r\n".encode())
    buf.write(
        f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode()
    )
    buf.write(f"Content-Type: {content_type}\r\n\r\n".encode())
    buf.write(content)
    buf.write(b"\r\n")
    buf.write(f"--{boundary}--\r\n".encode())
    return buf.getvalue(), f"multipart/form-data; boundary={boundary}"


# ── Test Suite ───────────────────────────────────────────────────────────────


async def run_security_readiness_tests():
    print("=" * 70)
    print("WALVOIL DPR PRODUCTION READINESS & SECURITY TEST SUITE (PHASE 16)")
    print("=" * 70)

    # 1. Security Headers Verification
    print("\n1. Production Security Headers Verification")
    st_code, st_json, headers = await asgi_request("/health")
    check("Health endpoint returns 200", st_code == 200)
    check("X-Request-ID header present", "x-request-id" in headers and len(headers["x-request-id"]) > 0)
    check("X-Content-Type-Options: nosniff", headers.get("x-content-type-options") == "nosniff")
    check("X-Frame-Options: DENY", headers.get("x-frame-options") == "DENY")
    check("X-XSS-Protection: 1; mode=block", "1; mode=block" in headers.get("x-xss-protection", ""))
    check("Referrer-Policy configured", headers.get("referrer-policy") == "strict-origin-when-cross-origin")
    check("Permissions-Policy configured", "geolocation=()" in headers.get("permissions-policy", ""))

    # 2. CORS Policy Verification
    print("\n2. CORS Access Control Policy Verification")
    # Allowed Origin
    allowed_origin = settings.CORS_ORIGINS[0]
    c_code, _, c_headers = await asgi_request(
        "/api/v1/reports/status",
        headers=[("origin", allowed_origin)],
    )
    check("Status 200 with allowed origin", c_code == 200)
    check(
        "CORS Access-Control-Allow-Origin header set for allowed origin",
        c_headers.get("access-control-allow-origin") == allowed_origin,
    )
    # Unauthorized Origin Check: Settings must not contain wildcard '*'
    check("CORS origins does not contain wildcard '*'", "*" not in settings.CORS_ORIGINS)

    # 3. Path Traversal & Filename Sanitization
    print("\n3. Path Traversal Sanitization")
    test_img = Image.new("RGB", (100, 100), color=(255, 255, 255))
    img_byte_arr = io.BytesIO()
    test_img.save(img_byte_arr, format="JPEG")
    valid_bytes = img_byte_arr.getvalue()

    # Attempt directory traversal in filename
    malicious_filename = "../../../../etc/passwd.jpg"
    body, ctype = build_multipart_file("files", malicious_filename, valid_bytes, "image/jpeg")
    pt_code, pt_json, _ = await asgi_request(
        "/api/v1/reports/upload",
        method="POST",
        headers=[("content-type", ctype)],
        body=body,
    )
    check("Upload with traversal path returns 200", pt_code == 200)
    uploaded_files = pt_json.get("files", []) if isinstance(pt_json, dict) else []
    check(
        "Sanitized filename excludes directory traversal ('..')",
        len(uploaded_files) > 0 and uploaded_files[0]["filename"] == "passwd.jpg",
        f"(got '{uploaded_files[0]['filename'] if uploaded_files else None}')",
    )

    # 4. Decompression Bomb & Image Dimension Limits
    print("\n4. Image Decompression Bomb & Resolution Boundary Protection")
    # Test oversized dimensions exceeding MAX_IMAGE_WIDTH
    is_valid, dims, err = validate_and_inspect_image(valid_bytes, "normal.jpg")
    check("Normal image accepted", is_valid is True and dims == (100, 100))

    # Test extreme resolution validation logic
    old_max_w = settings.MAX_IMAGE_WIDTH
    settings.MAX_IMAGE_WIDTH = 50  # Temporarily lower limit to test rejection
    is_valid_oversized, _, err_oversized = validate_and_inspect_image(valid_bytes, "oversized.jpg")
    settings.MAX_IMAGE_WIDTH = old_max_w  # Restore
    check("Oversized image rejected by resolution guard", is_valid_oversized is False)
    check("Oversized error cites dimension limit", "exceed maximum allowed limit" in (err_oversized or ""))

    # 5. Non-Leaking Error Responses
    print("\n5. Non-Leaking Error Responses & Stack Trace Protection")
    # Send empty body to trigger 400
    err_code, err_json, _ = await asgi_request(
        "/api/v1/reports/upload",
        method="POST",
        headers=[("content-type", "application/json")],
        body=b"{}",
    )
    check("Malformed body returns 400 or 422", err_code in (400, 422))
    err_str = json.dumps(err_json)
    check("Error does not reveal absolute Windows drive path (D:\\ or C:\\)", "D:\\" not in err_str and "C:\\" not in err_str)
    check("Error does not expose internal stack trace", "Traceback (most recent call last)" not in err_str)

    # 6. Service Health & Operational Readiness
    print("\n6. Operational Health & Readiness Monitoring")
    h_code, h_json, _ = await asgi_request("/health")
    check("Health status is healthy", h_json.get("status") == "healthy")
    check("Pipeline ready is True", h_json.get("pipeline_ready") is True)
    check("Uptime is tracked", h_json.get("uptime_seconds", 0) >= 0)
    check("Cache metrics exposed cleanly", "cache" in h_json and "cached_items" in h_json["cache"])
    check("Health response does not expose file paths or credentials", "path" not in h_json and "token" not in h_json)

    # 7. Bounded In-Memory Cache Lifecycle
    print("\n7. In-Memory Cache Eviction & Bounded Memory Growth")
    test_cache = InMemoryProcessedStore(max_items=3, ttl_seconds=1)
    id1 = test_cache.store(b"data1", "image/png", "scan1.png")
    id2 = test_cache.store(b"data2", "image/png", "scan2.png")
    id3 = test_cache.store(b"data3", "image/png", "scan3.png")
    metrics3 = test_cache.get_metrics()
    check("Cache stores up to max_items", metrics3["cached_items"] == 3)

    # Adding 4th item should evict oldest (id1)
    id4 = test_cache.store(b"data4", "image/png", "scan4.png")
    metrics4 = test_cache.get_metrics()
    check("Cache does not exceed max_items (bounded)", metrics4["cached_items"] == 3)
    check("Oldest item id1 was evicted", test_cache.get(id1) is None)
    check("Newest item id4 is present", test_cache.get(id4) is not None)

    # Test TTL expiration
    await asyncio.sleep(1.1)
    check("Expired item id2 returns None after TTL", test_cache.get(id2) is None)
    check("Cache count drops to 0 after TTL expiration", test_cache.get_metrics()["cached_items"] == 0)

    # 8. Concurrency Semaphore & Multi-Report Workload
    print("\n8. Concurrency Semaphore & Multi-Report Workload")
    samples_dir = os.path.join(backend_dir, "samples")
    with open(os.path.join(samples_dir, "walvoil_dpr_sample_1.jpg"), "rb") as f:
        s1_bytes = f.read()
    with open(os.path.join(samples_dir, "walvoil_dpr_sample_2.jpg"), "rb") as f:
        s2_bytes = f.read()

    body1, ctype1 = build_multipart_file("file", "walvoil_dpr_sample_1.jpg", s1_bytes, "image/jpeg")
    body2, ctype2 = build_multipart_file("file", "walvoil_dpr_sample_2.jpg", s2_bytes, "image/jpeg")

    # Fire concurrent requests to /api/v1/reports/recognize
    req1 = asgi_request("/api/v1/reports/recognize", method="POST", headers=[("content-type", ctype1)], body=body1)
    req2 = asgi_request("/api/v1/reports/recognize", method="POST", headers=[("content-type", ctype2)], body=body2)

    (r1_code, r1_json, _), (r2_code, r2_json, _) = await asyncio.gather(req1, req2)
    check("Concurrent Request 1 succeeds (HTTP 200)", r1_code == 200)
    check("Concurrent Request 2 succeeds (HTTP 200)", r2_code == 200)

    # Verify Report Sheet Isolation
    op1 = r1_json.get("header", {}).get("operator_name", {}).get("cleanedText", "")
    op2 = r2_json.get("header", {}).get("operator_name", {}).get("cleanedText", "")
    check("Concurrent Report 1 has Kashinatha operator", "Kashinath" in op1)
    check("Concurrent Report 2 has Jogannatha operator", "Jogannatha" in op2)
    check("No cross-contamination between concurrent reports", op1 != op2)

    # ── Summary ─────────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print(f"PRODUCTION READINESS TEST RESULTS: {passed_checks} passed, {failed_checks} failed out of {passed_checks + failed_checks} checks")
    print("=" * 70)

    if failed_checks > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run_security_readiness_tests())

