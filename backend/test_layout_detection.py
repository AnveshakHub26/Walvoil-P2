"""Focused Test Suite for Walvoil DPR Fixed-Template Layout Detection (Phase 11).

Tests:
1. Sample 1 (walvoil_dpr_sample_1.jpg) full layout detection & 189 regions
2. Sample 2 (walvoil_dpr_sample_2.jpg) full layout detection & 189 regions
3. Grid Geometry Monotonicity (14 rows, 11 columns, non-overlapping pitch)
4. Column 0 PWH and Order Number sub-row partitioning
5. Original-image coordinate inverse affine mapping
6. Region cropping service (header, table, subrow, footer)
7. Diagnostic image URL generation and retrieval
8. Error handling: empty file, unsupported extension, corrupt bytes
9. Service status pipeline update verification
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
from app.services.layout_detection import (
    crop_region_image,
    detect_walvoil_dpr_layout,
)

# ── ASGI Test Helper ────────────────────────────────────────────────────────


async def asgi_request(
    path: str,
    method: str = "GET",
    headers: list | None = None,
    body: bytes = b"",
) -> tuple[int, dict | str, bytes]:
    """Execute an HTTP request directly through the ASGI app without httpx."""
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


def build_multipart_single(
    boundary: str, field_name: str, filename: str, content_type: str, file_bytes: bytes
) -> bytes:
    """Build a single-file multipart payload."""
    header = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n"
        f"\r\n"
    ).encode("utf-8")
    return header + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")


# ── Test Runner ─────────────────────────────────────────────────────────────


def run_tests():
    samples_dir = os.path.join(backend_dir, "samples")
    sample1_path = os.path.join(samples_dir, "walvoil_dpr_sample_1.jpg")
    sample2_path = os.path.join(samples_dir, "walvoil_dpr_sample_2.jpg")

    assert os.path.exists(sample1_path), f"Missing {sample1_path}"
    assert os.path.exists(sample2_path), f"Missing {sample2_path}"

    with open(sample1_path, "rb") as f:
        sample1_bytes = f.read()

    with open(sample2_path, "rb") as f:
        sample2_bytes = f.read()

    passed = 0
    total = 0

    def check(name: str, condition: bool, info: str = ""):
        nonlocal passed, total
        total += 1
        if condition:
            passed += 1
            print(f"  [PASS] {name} {f'({info})' if info else ''}")
        else:
            print(f"  [FAIL] {name} - FAILED {f'({info})' if info else ''}")
            sys.exit(1)

    print("=" * 65)
    print("WALVOIL DPR FIXED-TEMPLATE LAYOUT DETECTION TEST SUITE (PHASE 11)")
    print("=" * 65)

    # 1. Sample 1 via API
    print("\n1. POST /api/v1/reports/layout/detect — Genuine Sample 1")
    boundary = "boundary123"
    body = build_multipart_single(boundary, "file", "walvoil_dpr_sample_1.jpg", "image/jpeg", sample1_bytes)
    code, data, _ = asyncio.run(
        asgi_request(
            "/api/v1/reports/layout/detect",
            method="POST",
            headers=[("content-type", f"multipart/form-data; boundary={boundary}")],
            body=body,
        )
    )
    check("Status 200", code == 200, f"got {code}")
    check("Success flag is True", data.get("success") is True)
    check("Template is ASLY-DPR-REV01", data.get("templateName") == "ASLY-DPR-REV01")
    check("Alignment status is aligned", data.get("alignmentStatus") == "aligned")
    check("Confidence >= 0.90", data.get("alignmentConfidence", 0) >= 0.90, f"got {data.get('alignmentConfidence')}")
    check("Total regions is exactly 189", data.get("totalRegionsCount") == 189, f"got {data.get('totalRegionsCount')}")
    check("Header fields count is 5", data.get("headerFieldsCount") == 5)
    check("Table cells count is 154", data.get("tableCellsCount") == 154)
    check("Subrow cells count is 28", data.get("subrowCellsCount") == 28)
    check("Footer regions count is 2", data.get("footerRegionsCount") == 2)
    check("Diagnostic preview URL present", bool(data.get("diagnosticPreviewUrl")))

    # 2. Sample 2 via API
    print("\n2. POST /api/v1/reports/layout/detect — Genuine Sample 2")
    body2 = build_multipart_single(boundary, "file", "walvoil_dpr_sample_2.jpg", "image/jpeg", sample2_bytes)
    code2, data2, _ = asyncio.run(
        asgi_request(
            "/api/v1/reports/layout/detect",
            method="POST",
            headers=[("content-type", f"multipart/form-data; boundary={boundary}")],
            body=body2,
        )
    )
    check("Status 200 for Sample 2", code2 == 200, f"got {code2}")
    check("Success flag is True", data2.get("success") is True)
    check("Sample 2 total regions is 189", data2.get("totalRegionsCount") == 189)
    check("Sample 2 154 table cells", data2.get("tableCellsCount") == 154)
    check("Sample 2 28 subrow cells", data2.get("subrowCellsCount") == 28)

    # 3. Grid Geometry & Monotonicity
    print("\n3. Geometry & Row/Column Monotonicity Checks")
    res1, _ = detect_walvoil_dpr_layout(sample1_bytes, "sample1.jpg")
    table_cells = [r for r in res1.regions if r.section == "table"]
    check("154 table cells segmented", len(table_cells) == 154)

    all_monotonic_cols = True
    for r_idx in range(1, 15):
        row_c = [c for c in table_cells if c.row_index == r_idx]
        if len(row_c) != 11:
            all_monotonic_cols = False
        for c in range(10):
            if row_c[c].deskewed_box.x >= row_c[c + 1].deskewed_box.x:
                all_monotonic_cols = False
    check("All 14 rows have 11 strictly monotonic columns", all_monotonic_cols)

    row1_ys = [r.deskewed_box.y for r in table_cells if r.col_index == 0]
    all_monotonic_rows = all(row1_ys[i] < row1_ys[i + 1] for i in range(13))
    check("All 14 rows are strictly monotonic top-to-bottom", all_monotonic_rows)

    # 4. Column 0 Sub-Row Partitioning
    print("\n4. Column 0 Sub-Row (PWH & Ord no) Partitioning")
    subrows = [r for r in res1.regions if r.section == "table_subrow"]
    check("28 sub-row regions present", len(subrows) == 28)
    subrow_partition_valid = True
    for r_idx in range(1, 15):
        pwh = next((r for r in subrows if r.row_index == r_idx and r.sub_field == "pwh"), None)
        ord_no = next((r for r in subrows if r.row_index == r_idx and r.sub_field == "ord_no"), None)
        parent = next((r for r in table_cells if r.row_index == r_idx and r.col_index == 0), None)
        if not (pwh and ord_no and parent):
            subrow_partition_valid = False
            break
        if pwh.deskewed_box.y != parent.deskewed_box.y:
            subrow_partition_valid = False
        if abs((pwh.deskewed_box.height + ord_no.deskewed_box.height) - parent.deskewed_box.height) > 2:
            subrow_partition_valid = False
    check("Column 0 sub-rows accurately partition all 14 parent cells", subrow_partition_valid)

    # 5. Original Coordinates Mapping
    print("\n5. Original Raw Coordinates Inverse Affine Mapping")
    all_coords_valid = True
    for r in res1.regions:
        poly = r.original_coordinates.polygon
        bbox = r.original_coordinates.bounding_box
        if len(poly) != 4 or bbox.width <= 0 or bbox.height <= 0 or bbox.x < 0 or bbox.y < 0:
            all_coords_valid = False
            break
    check("All 189 regions map to valid 4-point polygons in raw image space", all_coords_valid)

    # 6. Region Image Cropping
    print("\n6. Region Cropping Service Verification")
    sample_targets = [
        "hdr_date",
        "hdr_operator_name",
        "row01_col00_pwh",
        "row01_col00_ord_no",
        "row01_col02_part_number",
        "footer_operator_sign",
    ]
    all_crops_valid = True
    for tid in sample_targets:
        reg = next(r for r in res1.regions if r.region_id == tid)
        arr, crop_bytes = crop_region_image(sample1_bytes, reg)
        if arr.shape[0] < 5 or arr.shape[1] < 10 or len(crop_bytes) < 100:
            all_crops_valid = False
        with Image.open(io.BytesIO(crop_bytes)) as pil_img:
            if pil_img.width != arr.shape[1] or pil_img.height != arr.shape[0]:
                all_crops_valid = False
    check("Individual cell crops generate valid decodable PNG bytes", all_crops_valid)

    # 7. Diagnostic Preview Retrieval
    print("\n7. Diagnostic Overlay Retrieval via API")
    diag_url = data["diagnosticPreviewUrl"]
    d_code, _, d_bytes = asyncio.run(asgi_request(diag_url, method="GET"))
    check("Diagnostic image HTTP 200", d_code == 200, f"got {d_code}")
    check("Diagnostic image is non-empty PNG", len(d_bytes) > 20000, f"size {len(d_bytes)} B")
    with Image.open(io.BytesIO(d_bytes)) as pil_diag:
        check("Diagnostic image decodable via PIL", pil_diag.width > 500 and pil_diag.height > 300)

    # 8. Error Handling Cases
    print("\n8. Robustness & Error Handling")
    # Empty file
    empty_body = build_multipart_single(boundary, "file", "empty.jpg", "image/jpeg", b"")
    e_code, _, _ = asyncio.run(
        asgi_request(
            "/api/v1/reports/layout/detect",
            method="POST",
            headers=[("content-type", f"multipart/form-data; boundary={boundary}")],
            body=empty_body,
        )
    )
    check("0-byte file returns 400 Bad Request", e_code == 400, f"got {e_code}")

    # Unsupported extension
    txt_body = build_multipart_single(boundary, "file", "report.txt", "text/plain", b"fake text")
    t_code, _, _ = asyncio.run(
        asgi_request(
            "/api/v1/reports/layout/detect",
            method="POST",
            headers=[("content-type", f"multipart/form-data; boundary={boundary}")],
            body=txt_body,
        )
    )
    check("Unsupported extension (.txt) returns 400", t_code == 400, f"got {t_code}")

    # Corrupt image bytes
    corrupt_body = build_multipart_single(boundary, "file", "bad.jpg", "image/jpeg", b"CORRUPTED_BYTES")
    c_code, _, _ = asyncio.run(
        asgi_request(
            "/api/v1/reports/layout/detect",
            method="POST",
            headers=[("content-type", f"multipart/form-data; boundary={boundary}")],
            body=corrupt_body,
        )
    )
    check("Corrupted image content returns 400", c_code == 400, f"got {c_code}")

    # 9. Pipeline Status Check
    print("\n9. GET /api/v1/reports/status")
    s_code, s_data, _ = asyncio.run(asgi_request("/api/v1/reports/status", method="GET"))
    check("Status 200", s_code == 200)
    check("Layout detection is active in pipeline", s_data.get("pipeline", {}).get("layout_detection") == "active")

    print("\n" + "=" * 65)
    print(f"RESULTS: {passed} passed, {total - passed} failed out of {total} checks")
    print("=" * 65)


if __name__ == "__main__":
    run_tests()
