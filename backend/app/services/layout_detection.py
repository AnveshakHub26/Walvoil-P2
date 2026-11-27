"""Fixed-Template Layout Detection Service for Walvoil DPR (ASLY-DPR-REV01).

Implements Phase 11 layout detection:
- Uses Phase 09 OpenCV preprocessing (EXIF, deskew, contrast enhancement)
- Detects page boundaries and aligns against fixed ASLY-DPR-REV01 reference template
- Detects all 5 header fields (Date, Operator, Shift, Bench, Worked Hours)
- Detects the 14-row × 11-column table structure (154 cells)
- Preserves Column 0 sub-rows (PWH and Order Number sub-cells)
- Detects footer and operator signature region
- Maps all detected regions bi-directionally to original un-rotated image coordinates
- Saves diagnostic visual overlay images with color-coded region boundaries
- Does not interpret or recognize handwriting
"""

import os
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np

from app.schemas.layout import (
    BoundingBox,
    DetectedRegion,
    DPRLayoutDetectionResponse,
    OriginalCoordinates,
    PolygonPoint,
    TableLayoutSummary,
)
from app.services.image_preprocessing import (
    apply_deskew,
    decode_image_with_exif,
    estimate_skew_angle,
    processed_image_store,
)

# Canonical 11-Column Specifications for Walvoil ASLY-DPR-REV01
# (col_name, relative_start_x, relative_end_x, has_subrows)
COLUMN_DEFINITIONS: List[Tuple[str, float, float, bool]] = [
    ("batch_order", 0.000, 0.185, True),  # PWH and Order Number sub-rows
    ("family", 0.185, 0.254, False),
    ("part_number", 0.254, 0.409, False),
    ("time_start", 0.409, 0.466, False),
    ("time_end", 0.466, 0.525, False),
    ("qty", 0.525, 0.585, False),
    ("remarks", 0.585, 0.733, False),
    ("idle_code", 0.733, 0.808, False),
    ("idle_from", 0.808, 0.871, False),
    ("idle_to", 0.871, 0.935, False),
    ("total_time", 0.935, 1.000, False),
]

DIAGNOSTICS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "evaluation",
    "diagnostics",
)


def order_corner_points(pts: np.ndarray) -> np.ndarray:
    """Order 4 corner points in clockwise order: top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]

    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def _map_point_to_original(
    x: float, y: float, inv_rot_matrix: Optional[np.ndarray]
) -> Tuple[float, float]:
    """Map a point from deskewed image coordinates to original raw image space."""
    if inv_rot_matrix is None:
        return x, y
    orig_x = (
        inv_rot_matrix[0, 0] * x
        + inv_rot_matrix[0, 1] * y
        + inv_rot_matrix[0, 2]
    )
    orig_y = (
        inv_rot_matrix[1, 0] * x
        + inv_rot_matrix[1, 1] * y
        + inv_rot_matrix[1, 2]
    )
    return float(orig_x), float(orig_y)


def _map_perspective_point_to_original(
    x: float, y: float, inv_M: np.ndarray, inv_rot_matrix: Optional[np.ndarray] = None
) -> Tuple[float, float]:
    """Map a point from warped rectangular table space back to raw scan space."""
    pt = np.array([[[x, y]]], dtype=np.float32)
    mapped = cv2.perspectiveTransform(pt, inv_M)
    mx, my = float(mapped[0, 0, 0]), float(mapped[0, 0, 1])
    if inv_rot_matrix is not None:
        return _map_point_to_original(mx, my, inv_rot_matrix)
    return mx, my


def _create_original_coordinates(
    x: int, y: int, w: int, h: int, inv_rot_matrix: Optional[np.ndarray], orig_w: int, orig_h: int
) -> OriginalCoordinates:
    """Create OriginalCoordinates containing the 4-point polygon and bounding box."""
    corners = [
        (float(x), float(y)),
        (float(x + w), float(y)),
        (float(x + w), float(y + h)),
        (float(x), float(y + h)),
    ]
    transformed = [_map_point_to_original(px, py, inv_rot_matrix) for px, py in corners]

    min_x = max(0, int(min(pt[0] for pt in transformed)))
    max_x = min(orig_w, int(max(pt[0] for pt in transformed)))
    min_y = max(0, int(min(pt[1] for pt in transformed)))
    max_y = min(orig_h, int(max(pt[1] for pt in transformed)))

    bbox = BoundingBox(
        x=min_x,
        y=min_y,
        width=max(1, max_x - min_x),
        height=max(1, max_y - min_y),
    )
    poly = [PolygonPoint(x=pt[0], y=pt[1]) for pt in transformed]
    return OriginalCoordinates(boundingBox=bbox, polygon=poly)


def _create_perspective_original_coordinates(
    x: int,
    y: int,
    w: int,
    h: int,
    inv_M: np.ndarray,
    inv_rot_matrix: Optional[np.ndarray],
    orig_w: int,
    orig_h: int,
) -> OriginalCoordinates:
    """Create OriginalCoordinates using inverse 4-point perspective transform."""
    corners = [
        (float(x), float(y)),
        (float(x + w), float(y)),
        (float(x + w), float(y + h)),
        (float(x), float(y + h)),
    ]
    transformed = [
        _map_perspective_point_to_original(px, py, inv_M, inv_rot_matrix)
        for px, py in corners
    ]

    min_x = max(0, int(min(pt[0] for pt in transformed)))
    max_x = min(orig_w, int(max(pt[0] for pt in transformed)))
    min_y = max(0, int(min(pt[1] for pt in transformed)))
    max_y = min(orig_h, int(max(pt[1] for pt in transformed)))

    bbox = BoundingBox(
        x=min_x,
        y=min_y,
        width=max(1, max_x - min_x),
        height=max(1, max_y - min_y),
    )
    poly = [PolygonPoint(x=pt[0], y=pt[1]) for pt in transformed]
    return OriginalCoordinates(boundingBox=bbox, polygon=poly)


def detect_table_perspective(
    gray: np.ndarray,
) -> Tuple[Optional[np.ndarray], Optional[np.ndarray], Optional[np.ndarray], int, int, float, List[str]]:
    """Detect the printed table grid quadrilateral using adaptive line contours.

    Returns:
        (src_pts, M, inv_M, max_w, max_h, confidence, warnings)
    """
    h, w = gray.shape[:2]
    warnings: List[str] = []

    # Adaptive threshold to isolate lines even with uneven lighting or shadows
    thresh = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 9
    )

    # Line kernels adapted to document resolution
    h_len = max(20, w // 25)
    v_len = max(15, h // 25)
    h_lines = cv2.morphologyEx(
        thresh, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (h_len, 1))
    )
    v_lines = cv2.morphologyEx(
        thresh, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, v_len))
    )
    grid = cv2.bitwise_or(h_lines, v_lines)

    # Bridge small gaps in lines using morphological close
    grid_closed = cv2.morphologyEx(
        grid, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    )

    cnts, _ = cv2.findContours(grid_closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = [
        c
        for c in cnts
        if cv2.boundingRect(c)[2] > (w * 0.35)
        and cv2.boundingRect(c)[3] > (h * 0.35)
        and cv2.contourArea(c) > (w * h * 0.05)
    ]
    candidates = sorted(candidates, key=cv2.contourArea, reverse=True)

    if candidates:
        best = candidates[0]
        rect = cv2.minAreaRect(best)
        box = cv2.boxPoints(rect)
        src_pts = order_corner_points(np.array(box, dtype=np.float32))

        width_a = float(np.linalg.norm(src_pts[2] - src_pts[3]))
        width_b = float(np.linalg.norm(src_pts[1] - src_pts[0]))
        max_w = max(100, int(max(width_a, width_b)))

        height_a = float(np.linalg.norm(src_pts[1] - src_pts[2]))
        height_b = float(np.linalg.norm(src_pts[0] - src_pts[3]))
        max_h = max(100, int(max(height_a, height_b)))

        dst_pts = np.array(
            [[0, 0], [max_w - 1, 0], [max_w - 1, max_h - 1], [0, max_h - 1]],
            dtype=np.float32,
        )
        M = cv2.getPerspectiveTransform(src_pts, dst_pts)
        inv_M = cv2.getPerspectiveTransform(dst_pts, src_pts)
        return src_pts, M, inv_M, max_w, max_h, 0.98, warnings

    warnings.append(
        "Table grid contour could not be fully isolated. Using canonical ASLY-DPR-REV01 template boundaries."
    )
    return None, None, None, w, h, 0.80, warnings


def detect_form_grid_anchor(
    gray: np.ndarray,
) -> Tuple[int, int, int, int, float, List[str]]:
    """Legacy bounding box detector fallback."""
    src_pts, M, inv_M, max_w, max_h, conf, warnings = detect_table_perspective(gray)
    h, w = gray.shape[:2]
    if src_pts is not None:
        min_x = max(0, int(np.min(src_pts[:, 0])))
        max_x = min(w, int(np.max(src_pts[:, 0])))
        min_y = max(0, int(np.min(src_pts[:, 1])))
        max_y = min(h, int(np.max(src_pts[:, 1])))
        return min_x, min_y, max(1, max_x - min_x), max(1, max_y - min_y), conf, warnings

    fx = int(w * 0.15)
    fy = int(h * 0.11)
    fw = int(w * 0.78)
    fh = int(h * 0.85)
    return fx, fy, fw, fh, 0.80, warnings


def detect_walvoil_dpr_layout(
    image_bytes: bytes,
    filename: str = "walvoil_dpr_scan.jpg",
    preserve_color: bool = True,
    save_diagnostic: bool = True,
    return_warped: bool = False,
) -> Any:
    """Detect and segment all regions of a Walvoil ASLY-DPR-REV01 report.

    Supports 4-point perspective dewarping for tilted/mobile phone photos
    and maps all cell boundaries back to original image space.

    Args:
        image_bytes: Raw uploaded image file bytes.
        filename: Original file name.
        preserve_color: Whether to retain color in diagnostic rendering.
        save_diagnostic: Whether to save visual inspection images to disk and cache.
        return_warped: If True, returns a 3-tuple (response, diagnostic_bytes, warped_table_bgr).

    Returns:
        (DPRLayoutDetectionResponse, diagnostic_image_bytes) or
        (DPRLayoutDetectionResponse, diagnostic_image_bytes, warped_table_bgr)
    """
    # Step 1: Decode and orientation normalization (Phase 09)
    img_bgr, orientation_applied, orig_dims = decode_image_with_exif(image_bytes)
    orig_h, orig_w = img_bgr.shape[:2]

    # Step 2: Grayscale and Deskewing (Phase 09)
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    skew_angle = estimate_skew_angle(gray)

    inv_rot_matrix: Optional[np.ndarray] = None
    if abs(skew_angle) >= 0.2:
        gray_deskewed, _ = apply_deskew(gray, skew_angle)
        img_deskewed, _ = apply_deskew(img_bgr, skew_angle)
        # Compute inverse rotation matrix to map back to original un-deskewed coordinates
        center = (orig_w / 2.0, orig_h / 2.0)
        rot_matrix = cv2.getRotationMatrix2D(center, -skew_angle, 1.0)
        inv_rot_matrix = cv2.invertAffineTransform(rot_matrix)
    else:
        gray_deskewed = gray
        img_deskewed = img_bgr
        skew_angle = 0.0

    deskew_h, deskew_w = gray_deskewed.shape[:2]

    # Step 3: Detect Table Quadrilateral & 4-Point Perspective Transform
    src_pts, M, inv_M, max_w, max_h, anchor_conf, warnings = detect_table_perspective(gray_deskewed)

    regions: List[DetectedRegion] = []
    warped_table: Optional[np.ndarray] = None
    table_cells_count = 0
    subrow_cells_count = 0
    fx: int = 0
    fy: int = 0
    fw: int = 0
    fh: int = 0

    if M is not None and src_pts is not None and inv_M is not None:
        # ── Branch A: Perspective Dewarped Pipeline ──────────────────────────
        warped_table = cv2.warpPerspective(img_deskewed, M, (max_w, max_h))

        # A. Header Fields (sit directly ABOVE the table top edge in deskewed space)
        top_edge_y = int(min(src_pts[0][1], src_pts[1][1]))
        left_edge_x = int(min(src_pts[0][0], src_pts[3][0]))
        right_edge_x = int(max(src_pts[1][0], src_pts[2][0]))
        t_width = max(100, right_edge_x - left_edge_x)
        hdr_h = int(max_h * 0.160)

        header_bottom = top_edge_y
        row1_y1 = top_edge_y + 16
        row1_y2 = top_edge_y + 44
        row2_y1 = top_edge_y + 40
        row2_y2 = top_edge_y + 70

        header_defs = [
            ("date", 0.000, 0.400, row1_y1, row1_y2),
            ("operator_name", 0.000, 0.450, row2_y1, row2_y2),
            ("shift", 0.450, 0.600, row2_y1, row2_y2),
            ("bench", 0.600, 0.750, row2_y1, row2_y2),
            ("worked_hours", 0.750, 1.000, row2_y1, row2_y2),
        ]

        for fname, x1_f, x2_f, hy1, hy2 in header_defs:
            hx = int(left_edge_x + t_width * x1_f)
            hw = int(t_width * (x2_f - x1_f))
            hy = hy1
            hh = max(1, hy2 - hy1)

            deskewed_box = BoundingBox(x=hx, y=hy, width=hw, height=hh)
            orig_coords = _create_original_coordinates(
                hx, hy, hw, hh, inv_rot_matrix, orig_w, orig_h
            )
            regions.append(
                DetectedRegion(
                    regionId=f"hdr_{fname}",
                    section="header",
                    rowIndex=0,
                    colIndex=None,
                    fieldName=fname,
                    subField=None,
                    deskewedBox=deskewed_box,
                    originalCoordinates=orig_coords,
                    status="detected",
                    confidence=anchor_conf,
                )
            )

        # B. 14 Table Rows × 11 Columns in Warped Table Space
        col_hdr_bottom = int(max_h * 0.190)
        table_data_bottom = int(max_h * 0.945)
        row_pitch = (table_data_bottom - col_hdr_bottom) / 14.0

        for r_idx in range(14):
            row_num = r_idx + 1
            ry1 = int(col_hdr_bottom + r_idx * row_pitch)
            ry2 = int(col_hdr_bottom + (r_idx + 1) * row_pitch)
            rh = max(1, ry2 - ry1)

            for c_idx, (col_name, c_start, c_end, has_subrows) in enumerate(COLUMN_DEFINITIONS):
                cx = int(max_w * c_start)
                cw = max(1, int(max_w * (c_end - c_start)))
                cell_box = BoundingBox(x=cx, y=ry1, width=cw, height=rh)
                orig_coords = _create_perspective_original_coordinates(
                    cx, ry1, cw, rh, inv_M, inv_rot_matrix, orig_w, orig_h
                )

                # Primary table cell
                regions.append(
                    DetectedRegion(
                        regionId=f"row{row_num:02d}_col{c_idx:02d}_{col_name}",
                        section="table",
                        rowIndex=row_num,
                        colIndex=c_idx,
                        fieldName=col_name,
                        subField=None,
                        deskewedBox=cell_box,
                        originalCoordinates=orig_coords,
                        status="detected",
                        confidence=anchor_conf,
                    )
                )
                table_cells_count += 1

                # Sub-rows for Column 0 (Batch / Order no)
                if has_subrows:
                    half_h = max(1, rh // 2)
                    pwh_box = BoundingBox(x=cx, y=ry1, width=cw, height=half_h)
                    pwh_orig = _create_perspective_original_coordinates(
                        cx, ry1, cw, half_h, inv_M, inv_rot_matrix, orig_w, orig_h
                    )
                    regions.append(
                        DetectedRegion(
                            regionId=f"row{row_num:02d}_col{c_idx:02d}_pwh",
                            section="table_subrow",
                            rowIndex=row_num,
                            colIndex=c_idx,
                            fieldName="pwh_subrow",
                            subField="pwh",
                            deskewedBox=pwh_box,
                            originalCoordinates=pwh_orig,
                            status="detected",
                            confidence=anchor_conf,
                        )
                    )

                    ord_h = max(1, rh - half_h)
                    ord_box = BoundingBox(x=cx, y=ry1 + half_h, width=cw, height=ord_h)
                    ord_orig = _create_perspective_original_coordinates(
                        cx, ry1 + half_h, cw, ord_h, inv_M, inv_rot_matrix, orig_w, orig_h
                    )
                    regions.append(
                        DetectedRegion(
                            regionId=f"row{row_num:02d}_col{c_idx:02d}_ord_no",
                            section="table_subrow",
                            rowIndex=row_num,
                            colIndex=c_idx,
                            fieldName="ord_subrow",
                            subField="ord_no",
                            deskewedBox=ord_box,
                            originalCoordinates=ord_orig,
                            status="detected",
                            confidence=anchor_conf,
                        )
                    )
                    subrow_cells_count += 2

        # C. Footer Regions in Warped Space
        foot_y = table_data_bottom
        foot_h = max(1, max_h - table_data_bottom)
        sign_w = int(max_w * 0.38)
        sign_box = BoundingBox(x=0, y=foot_y, width=sign_w, height=foot_h)
        sign_orig = _create_perspective_original_coordinates(
            0, foot_y, sign_w, foot_h, inv_M, inv_rot_matrix, orig_w, orig_h
        )
        regions.append(
            DetectedRegion(
                regionId="footer_operator_sign",
                section="footer",
                rowIndex=15,
                colIndex=0,
                fieldName="operator_sign",
                subField=None,
                deskewedBox=sign_box,
                originalCoordinates=sign_orig,
                status="detected",
                confidence=anchor_conf,
            )
        )

        ctrl_x = sign_w
        ctrl_w = max(1, max_w - sign_w)
        ctrl_box = BoundingBox(x=ctrl_x, y=foot_y, width=ctrl_w, height=foot_h)
        ctrl_orig = _create_perspective_original_coordinates(
            ctrl_x, foot_y, ctrl_w, foot_h, inv_M, inv_rot_matrix, orig_w, orig_h
        )
        regions.append(
            DetectedRegion(
                regionId="footer_form_control",
                section="footer",
                rowIndex=15,
                colIndex=1,
                fieldName="metadata_footer",
                subField=None,
                deskewedBox=ctrl_box,
                originalCoordinates=ctrl_orig,
                status="detected",
                confidence=anchor_conf,
            )
        )

        table_summary = TableLayoutSummary(
            tableBox=BoundingBox(
                x=left_edge_x,
                y=top_edge_y,
                width=t_width,
                height=max(1, int(np.max(src_pts[:, 1])) - top_edge_y),
            ),
            rowsDetected=14,
            colsDetected=11,
            rowPitch=float(row_pitch),
            headerHeight=float(col_hdr_bottom),
        )

    else:
        # ── Branch B: Legacy Rectangular Fallback Pipeline ───────────────────
        fx, fy, fw, fh = int(deskew_w * 0.15), int(deskew_h * 0.11), int(deskew_w * 0.78), int(deskew_h * 0.85)
        header_top = fy
        header_bottom = int(fy + fh * 0.130)
        table_header_bottom = int(fy + fh * 0.185)
        table_bottom = int(fy + fh * 0.960)
        footer_bottom = fy + fh

        table_data_height = table_bottom - table_header_bottom
        row_pitch = table_data_height / 14.0

        hdr_mid_y = int(header_top + (header_bottom - header_top) * 0.50)
        header_defs = [
            ("date", 0.000, 0.320, header_top, hdr_mid_y),
            ("operator_name", 0.000, 0.400, hdr_mid_y, header_bottom),
            ("shift", 0.400, 0.580, hdr_mid_y, header_bottom),
            ("bench", 0.580, 0.730, hdr_mid_y, header_bottom),
            ("worked_hours", 0.730, 1.000, hdr_mid_y, header_bottom),
        ]

        for fname, x1_f, x2_f, hy1, hy2 in header_defs:
            hx = int(fx + fw * x1_f)
            hw = int(fw * (x2_f - x1_f))
            hy = hy1
            hh = max(1, hy2 - hy1)

            deskewed_box = BoundingBox(x=hx, y=hy, width=hw, height=hh)
            orig_coords = _create_original_coordinates(
                hx, hy, hw, hh, inv_rot_matrix, orig_w, orig_h
            )
            regions.append(
                DetectedRegion(
                    regionId=f"hdr_{fname}",
                    section="header",
                    rowIndex=0,
                    colIndex=None,
                    fieldName=fname,
                    subField=None,
                    deskewedBox=deskewed_box,
                    originalCoordinates=orig_coords,
                    status="detected",
                    confidence=anchor_conf,
                )
            )

        for r_idx in range(14):
            row_num = r_idx + 1
            ry1 = int(table_header_bottom + r_idx * row_pitch)
            ry2 = int(table_header_bottom + (r_idx + 1) * row_pitch)
            rh = max(1, ry2 - ry1)

            for c_idx, (col_name, c_start, c_end, has_subrows) in enumerate(COLUMN_DEFINITIONS):
                cx = int(fx + fw * c_start)
                cw = max(1, int(fw * (c_end - c_start)))
                cell_box = BoundingBox(x=cx, y=ry1, width=cw, height=rh)
                orig_coords = _create_original_coordinates(
                    cx, ry1, cw, rh, inv_rot_matrix, orig_w, orig_h
                )

                regions.append(
                    DetectedRegion(
                        regionId=f"row{row_num:02d}_col{c_idx:02d}_{col_name}",
                        section="table",
                        rowIndex=row_num,
                        colIndex=c_idx,
                        fieldName=col_name,
                        subField=None,
                        deskewedBox=cell_box,
                        originalCoordinates=orig_coords,
                        status="detected",
                        confidence=anchor_conf,
                    )
                )
                table_cells_count += 1

                if has_subrows:
                    half_h = max(1, rh // 2)
                    pwh_box = BoundingBox(x=cx, y=ry1, width=cw, height=half_h)
                    pwh_orig = _create_original_coordinates(
                        cx, ry1, cw, half_h, inv_rot_matrix, orig_w, orig_h
                    )
                    regions.append(
                        DetectedRegion(
                            regionId=f"row{row_num:02d}_col{c_idx:02d}_pwh",
                            section="table_subrow",
                            rowIndex=row_num,
                            colIndex=c_idx,
                            fieldName="pwh_subrow",
                            subField="pwh",
                            deskewedBox=pwh_box,
                            originalCoordinates=pwh_orig,
                            status="detected",
                            confidence=anchor_conf,
                        )
                    )

                    ord_box = BoundingBox(x=cx, y=ry1 + half_h, width=cw, height=rh - half_h)
                    ord_orig = _create_original_coordinates(
                        cx, ry1 + half_h, cw, rh - half_h, inv_rot_matrix, orig_w, orig_h
                    )
                    regions.append(
                        DetectedRegion(
                            regionId=f"row{row_num:02d}_col{c_idx:02d}_ord_no",
                            section="table_subrow",
                            rowIndex=row_num,
                            colIndex=c_idx,
                            fieldName="ord_subrow",
                            subField="ord_no",
                            deskewedBox=ord_box,
                            originalCoordinates=ord_orig,
                            status="detected",
                            confidence=anchor_conf,
                        )
                    )
                    subrow_cells_count += 2

        foot_h = max(1, footer_bottom - table_bottom)
        sign_w = int(fw * 0.38)
        sign_box = BoundingBox(x=fx, y=table_bottom, width=sign_w, height=foot_h)
        sign_orig = _create_original_coordinates(
            fx, table_bottom, sign_w, foot_h, inv_rot_matrix, orig_w, orig_h
        )
        regions.append(
            DetectedRegion(
                regionId="footer_operator_sign",
                section="footer",
                rowIndex=15,
                colIndex=0,
                fieldName="operator_sign",
                subField=None,
                deskewedBox=sign_box,
                originalCoordinates=sign_orig,
                status="detected",
                confidence=anchor_conf,
            )
        )

        ctrl_x = fx + sign_w
        ctrl_w = max(1, fw - sign_w)
        ctrl_box = BoundingBox(x=ctrl_x, y=table_bottom, width=ctrl_w, height=foot_h)
        ctrl_orig = _create_original_coordinates(
            ctrl_x, table_bottom, ctrl_w, foot_h, inv_rot_matrix, orig_w, orig_h
        )
        regions.append(
            DetectedRegion(
                regionId="footer_form_control",
                section="footer",
                rowIndex=15,
                colIndex=1,
                fieldName="metadata_footer",
                subField=None,
                deskewedBox=ctrl_box,
                originalCoordinates=ctrl_orig,
                status="detected",
                confidence=anchor_conf,
            )
        )

        table_summary = TableLayoutSummary(
            tableBox=BoundingBox(
                x=fx,
                y=table_header_bottom,
                width=fw,
                height=table_bottom - table_header_bottom,
            ),
            rowsDetected=14,
            colsDetected=11,
            rowPitch=float(row_pitch),
            headerHeight=float(table_header_bottom - header_bottom),
        )

    footer_regions_count = 2
    header_fields_count = 5

    # Step 5: Render Diagnostic Visual Inspection Overlay
    diag_bytes: Optional[bytes] = None
    diag_url: Optional[str] = None

    if save_diagnostic:
        diag_img = img_deskewed.copy()

        # Draw outer contour quadrilateral or box
        if src_pts is not None:
            cv2.polylines(
                diag_img, [src_pts.astype(np.int32)], True, (0, 0, 255), 2
            )
        elif fw > 0 and fh > 0:
            cv2.rectangle(diag_img, (fx, fy), (fx + fw, fy + fh), (0, 0, 255), 2)

        # Draw cell boundaries
        for r in regions:
            color = (255, 120, 0) if r.section == "header" else ((0, 200, 0) if r.section == "table" else (200, 0, 200))
            if r.original_coordinates and r.original_coordinates.polygon:
                poly = np.array(
                    [[int(p.x), int(p.y)] for p in r.original_coordinates.polygon],
                    dtype=np.int32,
                )
                cv2.polylines(diag_img, [poly], True, color, 1)

        success, enc_buf = cv2.imencode(".png", diag_img)
        if success:
            diag_bytes = enc_buf.tobytes()
            os.makedirs(DIAGNOSTICS_DIR, exist_ok=True)
            base_name = os.path.splitext(filename)[0]
            disk_path = os.path.join(DIAGNOSTICS_DIR, f"{base_name}_detected_layout.png")
            with open(disk_path, "wb") as f_out:
                f_out.write(diag_bytes)

            cache_id = processed_image_store.store(diag_bytes, "image/png", f"{base_name}_layout.png")
            diag_url = f"/api/v1/reports/processed/{cache_id}"

    alignment_status = "aligned" if anchor_conf >= 0.90 else "fallback_aligned"

    response = DPRLayoutDetectionResponse(
        success=True,
        filename=filename,
        templateName="ASLY-DPR-REV01",
        alignmentStatus=alignment_status,
        alignmentConfidence=anchor_conf,
        skewAngleDeg=round(float(skew_angle), 2),
        originalDimensions=(orig_w, orig_h),
        deskewedDimensions=(deskew_w, deskew_h),
        totalRegionsCount=len(regions),
        tableCellsCount=table_cells_count,
        subrowCellsCount=subrow_cells_count,
        headerFieldsCount=header_fields_count,
        footerRegionsCount=footer_regions_count,
        tableSummary=table_summary,
        regions=regions,
        diagnosticPreviewUrl=diag_url,
        warnings=warnings,
    )

    if return_warped:
        return response, diag_bytes, warped_table
    return response, diag_bytes


def crop_region_image(
    image_bytes: bytes, region: DetectedRegion, from_original: bool = False
) -> Tuple[np.ndarray, bytes]:
    """Extract a single cropped image patch for downstream OCR/HTR inference.

    Args:
        image_bytes: Raw DPR scan bytes.
        region: DetectedRegion model containing coordinates.
        from_original: If True, crops from raw un-rotated scan using original bounding box;
                       if False (default), crops from deskewed image.

    Returns:
        (crop_bgr_array, crop_png_bytes)
    """
    img_bgr, _, _ = decode_image_with_exif(image_bytes)
    if not from_original:
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        skew_angle = estimate_skew_angle(gray)
        if abs(skew_angle) >= 0.2:
            img_bgr, _ = apply_deskew(img_bgr, skew_angle)
        box = region.deskewed_box
    else:
        box = region.original_coordinates.bounding_box

    x1 = max(0, box.x)
    y1 = max(0, box.y)
    x2 = min(img_bgr.shape[1], box.x + box.width)
    y2 = min(img_bgr.shape[0], box.y + box.height)

    crop = img_bgr[y1:y2, x1:x2]
    _, enc = cv2.imencode(".png", crop)
    return crop, enc.tobytes()
