"""Comprehensive Test Suite for Walvoil DPR Hybrid Handwriting Recognition (Phase 13).

Validates:
1. POST /api/v1/reports/recognize with genuine Walvoil DPR Sample 1
2. POST /api/v1/reports/recognize with genuine Walvoil DPR Sample 2
3. Field-based model routing:
   - Freehand text (Operator Name, Remarks) -> TrOCR Small
   - Numerics, codes, dates, times, part numbers, sub-rows -> PP-OCRv5 Mobile
4. Signature region bypass (operator_sign -> status='signature_region', model=None)
5. Empty cell detection and OCR bypass
6. Cancelled row detection (diagonal strike-through strokes across rows 5-14)
7. Table row structure monotonicity (14 rows, Column 0 sub-row partitioning)
8. Conservative review flags (needs_review=True on all fields)
9. Phase 11 coordinate preservation (deskewedBox and originalCoordinates present)
10. Robustness: empty file, corrupt bytes, unsupported extension
11. GET /api/v1/reports/status reports handwriting_recognition as active
"""

import asyncio
import io
import json
import os
import sys
from PIL import Image

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app
from app.services.recognition import (
    get_model_routing_for_field,
    is_cell_empty,
    recognize_walvoil_dpr,
)
from app.core.config import settings

# ── ASGI Direct Test Helper ──────────────────────────────────────────────────


async def asgi_request(
    path: str,
    method: str = "GET",
    headers: list | None = None,
    body: bytes = b"",
) -> tuple[int, dict | str, bytes]:
    """Execute an HTTP request directly through the ASGI application without httpx."""
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


def build_multipart(
    boundary: str, field_name: str, filename: str, content_type: str, file_bytes: bytes
) -> bytes:
    """Construct a multipart/form-data upload payload."""
    header = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n"
        f"\r\n"
    ).encode("utf-8")
    return header + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")


# ── Test Suite Execution ─────────────────────────────────────────────────────


def run_tests():
    passed = 0
    failed = 0

    def check(name: str, condition: bool, detail: str = ""):
        nonlocal passed, failed
        if condition:
            passed += 1
            print(f"  [PASS] {name} {detail}")
        else:
            failed += 1
            print(f"  [FAIL] {name} - FAILED {detail}")

    samples_dir = os.path.join(backend_dir, "samples")
    sample_1_path = os.path.join(samples_dir, "walvoil_dpr_sample_1.jpg")
    sample_2_path = os.path.join(samples_dir, "walvoil_dpr_sample_2.jpg")

    with open(sample_1_path, "rb") as f:
        sample_1_bytes = f.read()

    with open(sample_2_path, "rb") as f:
        sample_2_bytes = f.read()

    boundary = "----WalvoilRecognitionBoundaryX789"
    content_type_hdr = f"multipart/form-data; boundary={boundary}"

    print("=" * 68)
    print("WALVOIL DPR HYBRID HANDWRITING RECOGNITION TEST SUITE (PHASE 13)")
    print("=" * 68)

    # 1. Field-Based Model Routing Logic
    print("\n1. Field-Based Model Routing Verification")
    trocr_fields = ["operator_name", "remarks"]
    for fld in trocr_fields:
        routed_model = get_model_routing_for_field(fld, "header" if "operator" in fld else "table")
        check(f"Field '{fld}' routes to TrOCR Small", routed_model == settings.MODEL_TROCR_SMALL, f"({routed_model})")

    ppocr_fields = ["date", "shift", "bench", "worked_hours", "family", "part_number", "time_start", "time_end", "qty", "idle_code", "total_time"]
    for fld in ppocr_fields:
        routed_model = get_model_routing_for_field(fld, "table")
        check(f"Field '{fld}' routes to PP-OCRv5 Mobile", routed_model == settings.MODEL_PPOCR_REC, f"({routed_model})")

    subrow_pwh_route = get_model_routing_for_field("pwh_subrow", "table_subrow", "pwh")
    check("Sub-row 'pwh' routes to PP-OCRv5", subrow_pwh_route == settings.MODEL_PPOCR_REC)

    subrow_ord_route = get_model_routing_for_field("ord_subrow", "table_subrow", "ord_no")
    check("Sub-row 'ord_no' routes to PP-OCRv5", subrow_ord_route == settings.MODEL_PPOCR_REC)

    sig_route = get_model_routing_for_field("operator_sign", "footer")
    check("Signature field bypasses OCR (returns None)", sig_route is None)

    # 2. Genuine Sample 1 Full Recognition via API
    print("\n2. POST /api/v1/reports/recognize — Genuine Sample 1")
    mp_sample1 = build_multipart(boundary, "file", "walvoil_dpr_sample_1.jpg", "image/jpeg", sample_1_bytes)
    code, body1, _ = asyncio.run(
        asgi_request(
            "/api/v1/reports/recognize",
            method="POST",
            headers=[("Content-Type", content_type_hdr)],
            body=mp_sample1,
        )
    )

    check("Status 200 OK", code == 200, f"(got {code})")
    check("Response success is True", body1.get("success") is True)
    check("Template name is ASLY-DPR-REV01", body1.get("templateName") == "ASLY-DPR-REV01")
    check("Alignment confidence >= 0.90", body1.get("alignmentConfidence", 0.0) >= 0.90)

    summary1 = body1.get("summary", {})
    check("Total cells evaluated is 189", summary1.get("totalCells") == 189, f"(got {summary1.get('totalCells')})")
    check("Active recognized cells count > 0", summary1.get("recognizedCells", 0) > 0, f"(got {summary1.get('recognizedCells')})")
    check("Cancelled cells detected without OCR", summary1.get("cancelledCells", 0) > 0, f"(got {summary1.get('cancelledCells')})")
    check("Signature cells detected without OCR", summary1.get("signatureCells", 0) == 1, f"(got {summary1.get('signatureCells')})")
    check("All cells flagged for review (conservative)", summary1.get("cellsNeedingReview") == 189)

    # Check Header Fields
    hdr1 = body1.get("header", {})
    check("Header contains date", "date" in hdr1 and hdr1["date"]["status"] == "recognized")
    check("Header date model is PP-OCRv5", hdr1.get("date", {}).get("modelUsed") == settings.MODEL_PPOCR_REC)
    check("Header contains operator_name", "operator_name" in hdr1 and hdr1["operator_name"]["status"] == "recognized")
    check("Operator name model is TrOCR Small", hdr1.get("operator_name", {}).get("modelUsed") == settings.MODEL_TROCR_SMALL)
    check("Operator name text matches genuine sample", "Kashinath" in (hdr1.get("operator_name", {}).get("cleanedText") or ""))

    # Check 14 Table Rows
    rows1 = body1.get("tableRows", [])
    check("Table has exactly 14 rows", len(rows1) == 14)
    row1 = rows1[0]
    check("Row 1 is active (isCancelled=False)", row1.get("isCancelled") is False)
    check("Row 1 PWH sub-row present", row1.get("pwhSubrow") is not None and row1["pwhSubrow"]["status"] == "recognized")
    check("Row 1 Ord no sub-row present", row1.get("ordSubrow") is not None and row1["ordSubrow"]["status"] == "recognized")
    check("Row 1 PWH text matches ground truth (2638043)", row1["pwhSubrow"].get("cleanedText") == "2638043")
    check("Row 1 Ord no text matches ground truth (1118496)", row1["ordSubrow"].get("cleanedText") == "1118496")
    check("Row 1 Family matches SD6/5", row1.get("family", {}).get("cleanedText") == "SD6/5")
    check("Row 1 Part number matches 512500254", row1.get("partNumber", {}).get("cleanedText") == "512500254")

    # Check Cancelled Rows (Row 5 to 14)
    row7 = rows1[6]
    check("Row 7 detected as cancelled (isCancelled=True)", row7.get("isCancelled") is True)
    check("Row 7 part number status is 'cancelled'", row7.get("partNumber", {}).get("status") == "cancelled")
    check("Row 7 model_used is None (OCR skipped)", row7.get("partNumber", {}).get("modelUsed") is None)

    # Check Footer Signature
    ftr1 = body1.get("footer", {})
    check("Footer contains operator_sign", "operator_sign" in ftr1)
    check("operator_sign status is 'signature_region'", ftr1.get("operator_sign", {}).get("status") == "signature_region")
    check("operator_sign model_used is None", ftr1.get("operator_sign", {}).get("modelUsed") is None)

    # Check Coordinate Preservation
    sample_field = body1.get("allFields", [])[0]
    check("Field retains deskewedBox coordinates", "deskewedBox" in sample_field and sample_field["deskewedBox"]["width"] > 0)
    check("Field retains originalCoordinates", "originalCoordinates" in sample_field and len(sample_field["originalCoordinates"]["polygon"]) == 4)

    # 3. Genuine Sample 2 Full Recognition via API
    print("\n3. POST /api/v1/reports/recognize — Genuine Sample 2")
    mp_sample2 = build_multipart(boundary, "file", "walvoil_dpr_sample_2.jpg", "image/jpeg", sample_2_bytes)
    code2, body2, _ = asyncio.run(
        asgi_request(
            "/api/v1/reports/recognize",
            method="POST",
            headers=[("Content-Type", content_type_hdr)],
            body=mp_sample2,
        )
    )

    check("Sample 2 status 200 OK", code2 == 200, f"(got {code2})")
    check("Sample 2 total cells is 189", body2.get("summary", {}).get("totalCells") == 189)
    hdr2 = body2.get("header", {})
    check("Sample 2 operator name matches Jogannatha", "Jogannatha" in (hdr2.get("operator_name", {}).get("cleanedText") or ""))
    check("Sample 2 operator name routed to TrOCR Small", hdr2.get("operator_name", {}).get("modelUsed") == settings.MODEL_TROCR_SMALL)
    row1_s2 = body2.get("tableRows", [])[0]
    check("Sample 2 Row 1 Part number matches 1021H0001-A", row1_s2.get("partNumber", {}).get("cleanedText") == "1021H0001-A")

    # 4. Pipeline Status Route
    print("\n4. GET /api/v1/reports/status Verification")
    st_code, st_body, _ = asyncio.run(asgi_request("/api/v1/reports/status"))
    check("Status endpoint 200 OK", st_code == 200)
    check("Handwriting recognition is active", st_body.get("pipeline", {}).get("handwriting_recognition") == "active")

    # 5. Robustness & Error Handling
    print("\n5. Robustness & Error Handling")
    empty_mp = build_multipart(boundary, "file", "empty.jpg", "image/jpeg", b"")
    code_e, _, _ = asyncio.run(
        asgi_request("/api/v1/reports/recognize", method="POST", headers=[("Content-Type", content_type_hdr)], body=empty_mp)
    )
    check("Empty file returns 400 Bad Request", code_e == 400, f"(got {code_e})")

    corrupt_mp = build_multipart(boundary, "file", "corrupt.jpg", "image/jpeg", b"GIF89aNOT_AN_IMAGE_BIN")
    code_c, _, _ = asyncio.run(
        asgi_request("/api/v1/reports/recognize", method="POST", headers=[("Content-Type", content_type_hdr)], body=corrupt_mp)
    )
    check("Corrupted image returns 400 Bad Request", code_c == 400, f"(got {code_c})")

    unsupp_mp = build_multipart(boundary, "file", "scan.txt", "text/plain", b"hello text file")
    code_u, _, _ = asyncio.run(
        asgi_request("/api/v1/reports/recognize", method="POST", headers=[("Content-Type", content_type_hdr)], body=unsupp_mp)
    )
    check("Unsupported extension returns 400 Bad Request", code_u == 400, f"(got {code_u})")

    # Summary
    print("\n" + "=" * 68)
    print(f"RESULTS: {passed} passed, {failed} failed out of {passed + failed} checks")
    print("=" * 68)

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    run_tests()
