"""Comprehensive unit and endpoint tests for Walvoil DPR Image Preprocessing.

Tests:
1. Valid JPEG processing (decoding, contrast enhancement, noise reduction, quality metrics)
2. PNG image processing
3. Invalid image content (corrupted bytes -> 400 Bad Request)
4. Empty image (0 bytes -> 400 Bad Request)
5. Very small image (50x50 px -> low resolution warning generated, no crash)
6. Skew detection and correction (synthetic 4° tilted grid document)
7. Preservation of original image (input bytes byte-for-byte immutable)
8. Multi-file batch processing (2 images in single request)
9. In-memory retrieval endpoint (/api/v1/reports/processed/{image_id})
10. Non-existent image ID retrieval -> 404 Not Found
"""

import asyncio
import io
import json
import math
import sys
from PIL import Image, ImageDraw

from app.main import app
from app.services.image_preprocessing import (
    decode_image_with_exif,
    estimate_skew_angle,
    preprocess_dpr_image,
)


# ── ASGI test helper ────────────────────────────────────────────────────────


async def asgi_request(
    path: str,
    method: str = "GET",
    headers: list | None = None,
    body: bytes = b"",
) -> tuple[int, dict | str, bytes]:
    """Execute an HTTP request directly through the ASGI app."""
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
    raw_body = b"".join(resp_chunks)

    try:
        parsed_body = json.loads(raw_body.decode("utf-8"))
    except Exception:
        parsed_body = raw_body.decode("utf-8", errors="replace")

    assert status_code is not None
    return status_code, parsed_body, raw_body


def build_multipart_multiple(
    boundary: str, files: list[tuple[str, str, bytes]]
) -> bytes:
    """Build multipart/form-data payload with one or multiple files."""
    body_parts = bytearray()
    for filename, content_type, file_bytes in files:
        header = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="files"; filename="{filename}"\r\n'
            f"Content-Type: {content_type}\r\n"
            f"\r\n"
        ).encode("utf-8")
        body_parts.extend(header)
        body_parts.extend(file_bytes)
        body_parts.extend(b"\r\n")

    body_parts.extend(f"--{boundary}--\r\n".encode("utf-8"))
    return bytes(body_parts)


# ── Synthetic Image Generators ──────────────────────────────────────────────


def make_test_jpeg(width: int = 800, height: int = 600) -> bytes:
    """Create a test image simulating a DPR page."""
    img = Image.new("RGB", (width, height), color=(248, 248, 248))
    draw = ImageDraw.Draw(img)
    # Draw table border lines
    draw.rectangle([40, 40, width - 40, height - 40], outline=(40, 40, 40), width=2)
    for y in range(80, height - 40, 40):
        draw.line([(40, y), (width - 40, y)], fill=(80, 80, 80), width=1)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def make_test_png(width: int = 640, height: int = 480) -> bytes:
    """Create a PNG test image."""
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.rectangle([20, 20, width - 20, height - 20], outline=(20, 20, 20), width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def make_tilted_grid(angle_degrees: float = 4.0) -> bytes:
    """Create an image with horizontal/vertical lines rotated by a known angle."""
    size = (800, 800)
    img = Image.new("L", size, color=255)
    draw = ImageDraw.Draw(img)

    # Draw dense parallel horizontal and vertical lines simulating a production sheet
    for y in range(100, 700, 30):
        draw.line([(100, y), (700, y)], fill=0, width=2)
    for x in range(100, 700, 100):
        draw.line([(x, 100), (x, 700)], fill=0, width=2)

    # Rotate by the specified angle
    rotated = img.rotate(angle_degrees, expand=False, fillcolor=255)
    buf = io.BytesIO()
    rotated.save(buf, format="PNG")
    return buf.getvalue()


# ── Test Runner ─────────────────────────────────────────────────────────────

PASS = 0
FAIL = 0
BOUNDARY = "----PreprocessingTestBoundary999"


def report(label: str, passed: bool, detail: str = ""):
    global PASS, FAIL
    tag = "PASS" if passed else "FAIL"
    if passed:
        PASS += 1
    else:
        FAIL += 1
    suffix = f"  ({detail})" if detail else ""
    print(f"  [{tag}] {label}{suffix}")


async def run_preprocessing_tests():
    global PASS, FAIL
    boundary = BOUNDARY
    print("=" * 65)
    print("WALVOIL DPR IMAGE PREPROCESSING TEST SUITE (PHASE 09)")
    print("=" * 65)

    # ── Test 1: Valid JPEG Processing via Endpoint ──────────────────────────
    print("\n1. POST /api/v1/reports/preprocess — Valid JPEG")
    jpeg_bytes = make_test_jpeg(800, 600)
    body = build_multipart_multiple(
        BOUNDARY, [("test_dpr_sheet.jpg", "image/jpeg", jpeg_bytes)]
    )
    status, data, _ = await asgi_request(
        "/api/v1/reports/preprocess",
        method="POST",
        headers=[
            ("content-type", f"multipart/form-data; boundary={boundary}"),
            ("content-length", str(len(body))),
        ],
        body=body,
    )
    report("Status 200", status == 200, f"got {status}")
    report("Response success=True", data.get("success") is True)
    report("Processed count is 1", data.get("processed_count") == 1)

    r0 = data["reports"][0]
    report("image_id is generated", bool(r0.get("image_id")))
    report("Original dimensions preserved", r0.get("original_dimensions") == [800, 600])
    report("Quality metrics present", "quality_metrics" in r0)
    qm = r0["quality_metrics"]
    report("Brightness computed", 0 <= qm.get("mean_brightness", -1) <= 255)
    report("Sharpness variance computed", qm.get("sharpness_laplacian_var", -1) >= 0)
    report(
        "Quality note is approximate heuristic",
        "heuristic" in qm.get("quality_note", "").lower(),
    )
    saved_image_id = r0["image_id"]

    # ── Test 2: Valid PNG Processing ────────────────────────────────────────
    print("\n2. POST /api/v1/reports/preprocess — Valid PNG")
    png_bytes = make_test_png(640, 480)
    body = build_multipart_multiple(
        BOUNDARY, [("scan_sample.png", "image/png", png_bytes)]
    )
    status, data, _ = await asgi_request(
        "/api/v1/reports/preprocess",
        method="POST",
        headers=[
            ("content-type", f"multipart/form-data; boundary={boundary}"),
            ("content-length", str(len(body))),
        ],
        body=body,
    )
    report("Status 200", status == 200, f"got {status}")
    report("Processed PNG dimensions", data["reports"][0]["processed_dimensions"] == [640, 480])

    # ── Test 3: Invalid Image Content (Corrupt Bytes) ────────────────────────
    print("\n3. POST /api/v1/reports/preprocess — Corrupt image bytes")
    corrupt_bytes = b"NOT_AN_IMAGE_RANDOM_CORRUPT_BYTES_XYZ"
    body = build_multipart_multiple(
        BOUNDARY, [("corrupt.jpg", "image/jpeg", corrupt_bytes)]
    )
    status, data, _ = await asgi_request(
        "/api/v1/reports/preprocess",
        method="POST",
        headers=[
            ("content-type", f"multipart/form-data; boundary={boundary}"),
            ("content-length", str(len(body))),
        ],
        body=body,
    )
    report("Status 400 for corrupt bytes", status == 400, f"got {status}")
    report("Error detail indicates invalid image", "cannot be decoded" in str(data))

    # ── 4. Empty Image (0 bytes) ─────────────────────────────────────────────
    print("\n4. POST /api/v1/reports/preprocess — Empty file (0 bytes)")
    body = build_multipart_multiple(
        BOUNDARY, [("empty.png", "image/png", b"")]
    )
    status, data, _ = await asgi_request(
        "/api/v1/reports/preprocess",
        method="POST",
        headers=[
            ("content-type", f"multipart/form-data; boundary={boundary}"),
            ("content-length", str(len(body))),
        ],
        body=body,
    )
    report("Status 400 for 0-byte file", status == 400, f"got {status}")

    # ── 5. Very Small Image (50x50 px) — Resolution Warning ──────────────────
    print("\n5. POST /api/v1/reports/preprocess — Very small image (50x50 px)")
    tiny_bytes = make_test_png(50, 50)
    body = build_multipart_multiple(
        BOUNDARY, [("tiny_page.png", "image/png", tiny_bytes)]
    )
    status, data, _ = await asgi_request(
        "/api/v1/reports/preprocess",
        method="POST",
        headers=[
            ("content-type", f"multipart/form-data; boundary={boundary}"),
            ("content-length", str(len(body))),
        ],
        body=body,
    )
    report("Status 200 (processed without crashing)", status == 200, f"got {status}")
    tiny_qm = data["reports"][0]["quality_metrics"]
    report("is_low_resolution=True", tiny_qm.get("is_low_resolution") is True)
    report(
        "Low resolution warning present",
        any("resolution is low" in w.lower() for w in tiny_qm.get("warnings", [])),
    )

    # ── 6. Skew Detection and Correction ─────────────────────────────────────
    print("\n6. Skew Estimation & Deskewing — Synthetic Tilted Grid")
    tilted_bytes = make_tilted_grid(angle_degrees=4.0)
    meta, processed_bytes = preprocess_dpr_image(
        tilted_bytes,
        "tilted_grid.png",
        enhance_contrast=True,
        deskew=True,
    )
    detected_skew = meta.quality_metrics.estimated_skew_angle
    report(
        "Estimated skew angle near 4.0°",
        abs(abs(detected_skew) - 4.0) < 1.5,
        f"detected: {detected_skew}°",
    )
    report(
        "Deskew step recorded",
        any("deskew_corrected" in s for s in meta.steps_applied),
        f"steps: {meta.steps_applied}",
    )
    report("Applied skew angle recorded", meta.applied_skew_angle != 0.0)

    # ── 7. Original Image Byte Preservation ──────────────────────────────────
    print("\n7. Original Image Immutability Check")
    original_copy = bytes(jpeg_bytes)
    meta_im, proc_bytes = preprocess_dpr_image(
        jpeg_bytes,
        "check_immutable.jpg",
    )
    report(
        "Original input bytes untouched",
        jpeg_bytes == original_copy,
        "byte-for-byte identical",
    )
    report(
        "Processed bytes distinct from original",
        proc_bytes != original_copy,
        f"processed {len(proc_bytes)} B vs original {len(original_copy)} B",
    )

    # ── 8. Multi-File Batch Processing ───────────────────────────────────────
    print("\n8. POST /api/v1/reports/preprocess — Multi-File Batch (2 files)")
    multi_body = build_multipart_multiple(
        BOUNDARY,
        [
            ("dpr_sheet_1.jpg", "image/jpeg", jpeg_bytes),
            ("dpr_sheet_2.png", "image/png", png_bytes),
        ],
    )
    status, data, _ = await asgi_request(
        "/api/v1/reports/preprocess",
        method="POST",
        headers=[
            ("content-type", f"multipart/form-data; boundary={boundary}"),
            ("content-length", str(len(multi_body))),
        ],
        body=multi_body,
    )
    report("Status 200", status == 200, f"got {status}")
    report("total_files is 2", data.get("total_files") == 2)
    report("processed_count is 2", data.get("processed_count") == 2)
    report("Reports array length is 2", len(data.get("reports", [])) == 2)

    # ── 9. In-Memory Processed Image Retrieval ───────────────────────────────
    print("\n9. GET /api/v1/reports/processed/{image_id} — Valid Retrieval")
    status, _, raw_img = await asgi_request(
        f"/api/v1/reports/processed/{saved_image_id}"
    )
    report("Status 200", status == 200, f"got {status}")
    report("Image bytes retrieved", len(raw_img) > 0, f"{len(raw_img)} bytes")
    # Verify retrieved bytes can be decoded as valid image
    try:
        with Image.open(io.BytesIO(raw_img)) as retrieved_img:
            report(
                "Retrieved image decodable via PIL",
                retrieved_img.size == (800, 600),
                f"{retrieved_img.size}",
            )
    except Exception as exc:
        report("Retrieved image decodable via PIL", False, str(exc))

    # ── 10. Non-Existent Image Retrieval (404) ────────────────────────────────
    print("\n10. GET /api/v1/reports/processed/{image_id} — Non-Existent ID")
    status, err_data, _ = await asgi_request(
        "/api/v1/reports/processed/non-existent-fake-id-12345"
    )
    report("Status 404 for unknown image ID", status == 404, f"got {status}")

    # ── Summary ──────────────────────────────────────────────────────────────
    print("\n" + "=" * 65)
    print(f"RESULTS: {PASS} passed, {FAIL} failed out of {PASS + FAIL} checks")
    print("=" * 65)
    return FAIL == 0


if __name__ == "__main__":
    success = asyncio.run(run_preprocessing_tests())
    sys.exit(0 if success else 1)
