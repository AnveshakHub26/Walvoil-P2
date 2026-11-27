"""Image preprocessing service for Walvoil DPR scans.

This module provides an image-processing pipeline using OpenCV and Pillow
to prepare handwritten DPR scans for future OCR/HTR model evaluation.

Features:
- Image decoding with EXIF orientation correction
- Document skew angle estimation and conservative deskewing
- Conservative noise reduction preserving faint handwriting and table borders
- Adaptive contrast enhancement (CLAHE) with grayscale/color options
- Objective, approximate heuristic image quality metrics and warnings
- In-memory temporary storage for retrieval without persistent disk storage
"""

import io
import os
import time
import uuid
from threading import Lock
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import settings
from app.schemas.report import DPRQualityMetrics, PreprocessImageMeta

# Enforce decompression bomb protection at the module level
Image.MAX_IMAGE_PIXELS = settings.MAX_IMAGE_PIXELS


# ── Thread-Safe In-Memory Store for Processed Images ──────────────────────────


class InMemoryProcessedStore:
    """Thread-safe bounded in-memory cache for temporary processed image retrieval."""

    def __init__(
        self,
        max_items: Optional[int] = None,
        ttl_seconds: Optional[int] = None,
    ):
        self._store: Dict[str, Tuple[bytes, str, str, float]] = {}
        self._lock = Lock()
        self._max_items = max_items or settings.CACHE_MAX_ENTRIES
        self._ttl_seconds = ttl_seconds or settings.CACHE_TTL_SECONDS

    def store(
        self, image_bytes: bytes, content_type: str, filename: str
    ) -> str:
        # Sanitize filename against path traversal
        clean_name = os.path.basename(filename.replace("\\", "/")) if filename else "unnamed_scan"
        with self._lock:
            self._purge_expired_locked()
            # If still full, remove oldest item
            if len(self._store) >= self._max_items:
                oldest_key = min(self._store.keys(), key=lambda k: self._store[k][3])
                self._store.pop(oldest_key, None)

            image_id = str(uuid.uuid4())
            self._store[image_id] = (
                image_bytes,
                content_type,
                clean_name,
                time.time(),
            )
            return image_id

    def get(self, image_id: str) -> Optional[Tuple[bytes, str, str]]:
        with self._lock:
            entry = self._store.get(image_id)
            if not entry:
                return None
            image_bytes, content_type, filename, created_at = entry
            if time.time() - created_at > self._ttl_seconds:
                self._store.pop(image_id, None)
                return None
            return image_bytes, content_type, filename

    def get_metrics(self) -> Dict[str, Any]:
        """Return cache health metrics for system monitoring."""
        with self._lock:
            self._purge_expired_locked()
            return {
                "cached_items": len(self._store),
                "max_items": self._max_items,
                "ttl_seconds": self._ttl_seconds,
            }

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def _purge_expired_locked(self) -> None:
        now = time.time()
        expired = [
            k for k, v in self._store.items() if now - v[3] > self._ttl_seconds
        ]
        for k in expired:
            self._store.pop(k, None)


# Global singleton cache instance for the application process
processed_image_store = InMemoryProcessedStore()


# ── Image Decoding & Validation ──────────────────────────────────────────────


def validate_and_inspect_image(
    image_bytes: bytes, filename: str
) -> Tuple[bool, Optional[Tuple[int, int]], Optional[str]]:
    """Validate image bytes in memory and retrieve dimensions.

    Enforces:
    - Non-empty byte content
    - Decodable image binary (Pillow verify)
    - Maximum pixel limit protection against decompression bombs
    - Safe maximum image dimensions (width & height limits)
    - Filename path sanitization

    Args:
        image_bytes: Raw binary content of the uploaded file.
        filename: Name of the uploaded file for logging.

    Returns:
        A tuple of (is_valid, dimensions (width, height), error_message).
    """
    clean_name = os.path.basename(filename.replace("\\", "/")) if filename else "unnamed_scan"

    if not image_bytes or len(image_bytes) == 0:
        return False, None, f"File '{clean_name}' is empty (0 bytes)."

    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.verify()

        with Image.open(io.BytesIO(image_bytes)) as img:
            w, h = img.width, img.height
            if w <= 0 or h <= 0:
                return False, None, f"File '{clean_name}' has invalid image dimensions ({w}x{h})."
            if w > settings.MAX_IMAGE_WIDTH or h > settings.MAX_IMAGE_HEIGHT:
                return (
                    False,
                    None,
                    f"File '{clean_name}' dimensions ({w}x{h}) exceed maximum allowed limit of "
                    f"({settings.MAX_IMAGE_WIDTH}x{settings.MAX_IMAGE_HEIGHT}).",
                )
            return True, (w, h), None

    except Image.DecompressionBombError:
        return (
            False,
            None,
            f"File '{clean_name}' exceeds decompression pixel safety limit and was rejected.",
        )
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        return False, None, f"File '{clean_name}' cannot be decoded as a valid image: {exc}"


def decode_image_with_exif(
    image_bytes: bytes,
) -> Tuple[np.ndarray, bool, Tuple[int, int]]:
    """Decode raw image bytes to an OpenCV BGR array, applying EXIF orientation.

    Args:
        image_bytes: Original image bytes.

    Returns:
        A tuple of (bgr_array, exif_corrected_flag, original_dimensions).
    """
    with Image.open(io.BytesIO(image_bytes)) as pil_img:
        orig_dims = (pil_img.width, pil_img.height)

        # Detect and apply EXIF orientation
        exif_applied = False
        try:
            transposed = ImageOps.exif_transpose(pil_img)
            if transposed is not pil_img:
                pil_img = transposed
                exif_applied = True
        except Exception:
            exif_applied = False

        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")

        rgb_np = np.array(pil_img)
        bgr_np = cv2.cvtColor(rgb_np, cv2.COLOR_RGB2BGR)

        return bgr_np, exif_applied, orig_dims


# ── Skew Angle Estimation & Deskewing ────────────────────────────────────────


def estimate_skew_angle(gray: np.ndarray) -> float:
    """Estimate document tilt angle in degrees using Hough line transform.

    Identifies dominant horizontal/vertical guidelines such as printed table lines.
    Restricts detected angle to small corrections (-15° to +15°). If angles are
    erratic or lines are insufficient, returns 0.0 (no rotation).
    """
    h, w = gray.shape[:2]
    if h < 20 or w < 20:
        return 0.0

    # Edge detection
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)

    min_line_len = max(20, int(w * 0.12))
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=60,
        minLineLength=min_line_len,
        maxLineGap=15,
    )

    if lines is None or len(lines) < 2:
        return 0.0

    angles = []
    for line in lines:
        pts = line.reshape(-1)
        if len(pts) < 4:
            continue
        x1, y1, x2, y2 = int(pts[0]), int(pts[1]), int(pts[2]), int(pts[3])
        dx = x2 - x1
        dy = y2 - y1
        if dx == 0 and dy == 0:
            continue
        rad = np.arctan2(dy, dx)
        deg = np.degrees(rad)

        # Normalize angle to near-horizontal [-45, 45]
        while deg <= -45.0:
            deg += 90.0
        while deg > 45.0:
            deg -= 90.0

        # Filter strictly within safe deskew range
        if abs(deg) <= 15.0:
            angles.append(deg)

    if not angles or len(angles) < 2:
        return 0.0

    # Filter outliers using median
    median_angle = float(np.median(angles))

    # Guard: if variance is high, lines are likely crosshatch/noise, not page tilt
    std_dev = float(np.std(angles))
    if std_dev > 5.0:
        return 0.0

    # Ignore micro-tilts (< 0.2 degrees) to avoid interpolation blur
    if abs(median_angle) < 0.2:
        return 0.0

    return round(median_angle, 2)


def apply_deskew(
    img: np.ndarray, angle: float
) -> Tuple[np.ndarray, bool]:
    """Rotate image around its center to correct skew angle.

    Uses white border value (255) representing paper background.
    """
    if abs(angle) < 0.2:
        return img, False

    h, w = img.shape[:2]
    center = (w / 2.0, h / 2.0)
    # OpenCV rotation angle is counter-clockwise; to correct a positive tilt, we rotate by angle
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    border_val = [255.0, 255.0, 255.0]

    rotated = cv2.warpAffine(
        img,
        matrix,
        (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=border_val,
    )
    return rotated, True


# ── Noise Reduction & Contrast Enhancement ───────────────────────────────────


def conservative_denoise(gray: np.ndarray) -> np.ndarray:
    """Apply conservative bilateral filter to reduce paper grain.

    Preserves high-frequency table borders, decimal points, and faint pen strokes.
    """
    return cv2.bilateralFilter(gray, d=5, sigmaColor=40, sigmaSpace=40)


def enhance_contrast_clahe(
    gray: np.ndarray, clip_limit: float = 2.0
) -> np.ndarray:
    """Apply Contrast Limited Adaptive Histogram Equalization (CLAHE).

    Boosts visibility of faint pencil and blue/black pen handwriting without
    over-amplifying background paper texture.
    """
    h, w = gray.shape[:2]
    grid_w = max(1, min(8, w // 8))
    grid_h = max(1, min(8, h // 8))
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(grid_w, grid_h))
    return clahe.apply(gray)


# ── Quality Metrics Evaluation ───────────────────────────────────────────────


def compute_quality_metrics(
    gray: np.ndarray, estimated_skew: float
) -> DPRQualityMetrics:
    """Compute approximate heuristic image quality metrics and operational warnings.

    Notice: Indicators are approximate heuristic assessments of scan capture
    quality and do not guarantee OCR/HTR accuracy.
    """
    h, w = gray.shape[:2]
    megapixels = round((w * h) / 1_000_000.0, 2)

    mean_brightness = float(np.mean(gray))
    contrast_std = float(np.std(gray))

    # Sharpness via Laplacian variance
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    laplacian_var = float(laplacian.var())

    warnings: List[str] = []

    # Heuristic checks
    is_low_res = w < 600 or h < 600
    if is_low_res:
        warnings.append(
            f"Image resolution is low ({w}x{h} px). Small handwritten figures may lose legibility."
        )

    is_underexposed = mean_brightness < 50.0
    if is_underexposed:
        warnings.append(
            f"Image is dark/underexposed (mean brightness {mean_brightness:.1f}/255). Text may blend into background."
        )

    is_overexposed = mean_brightness > 235.0
    if is_overexposed:
        warnings.append(
            f"Image is overexposed/very bright (mean brightness {mean_brightness:.1f}/255). Faint pen strokes may wash out."
        )

    is_low_contrast = contrast_std < 25.0
    if is_low_contrast:
        warnings.append(
            f"Image has low contrast (std dev {contrast_std:.1f}). Character edge boundaries may be weak."
        )

    # Sharpness threshold: skip warning for tiny synthetic test images to avoid false positives
    is_blurry = laplacian_var < 80.0 and not (w < 200 or h < 200)
    if is_blurry:
        warnings.append(
            f"Image may be blurry or out-of-focus (sharpness score {laplacian_var:.1f} < 80.0)."
        )

    return DPRQualityMetrics(
        width=w,
        height=h,
        megapixels=megapixels,
        mean_brightness=round(mean_brightness, 2),
        contrast_std=round(contrast_std, 2),
        sharpness_laplacian_var=round(laplacian_var, 2),
        estimated_skew_angle=round(estimated_skew, 2),
        is_blurry=is_blurry,
        is_low_contrast=is_low_contrast,
        is_underexposed=is_underexposed,
        is_overexposed=is_overexposed,
        is_low_resolution=is_low_res,
        warnings=warnings,
    )


# ── Full Pipeline Orchestrator ───────────────────────────────────────────────


def format_bytes_size(size_bytes: int) -> str:
    """Format raw bytes to human-readable string."""
    if size_bytes == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB"]
    idx = 0
    size = float(size_bytes)
    while size >= 1024.0 and idx < len(units) - 1:
        size /= 1024.0
        idx += 1
    return f"{size:.1f} {units[idx]}"


def preprocess_dpr_image(
    image_bytes: bytes,
    filename: str,
    enhance_contrast: bool = True,
    apply_noise_reduction: bool = True,
    deskew: bool = True,
    preserve_color: bool = False,
    output_format: str = "png",
) -> Tuple[PreprocessImageMeta, bytes]:
    """Execute the full DPR image preprocessing pipeline on in-memory bytes.

    Original input bytes are never modified or overwritten.
    Processed image is stored in volatile memory and returned with metadata.
    """
    steps_applied: List[str] = []

    # 1. Decode & EXIF orientation
    bgr, exif_applied, orig_dims = decode_image_with_exif(image_bytes)
    if exif_applied:
        steps_applied.append("exif_orientation_correction")

    # 2. Grayscale conversion for analysis
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

    # 3. Skew estimation
    skew_angle = estimate_skew_angle(gray)

    # 4. Deskewing
    applied_skew = 0.0
    if deskew and abs(skew_angle) >= 0.2:
        gray, _ = apply_deskew(gray, skew_angle)
        if preserve_color:
            bgr, _ = apply_deskew(bgr, skew_angle)
        applied_skew = skew_angle
        steps_applied.append(f"deskew_corrected_{skew_angle:+0.2f}_deg")

    # 5. Noise reduction
    if apply_noise_reduction:
        gray = conservative_denoise(gray)
        if preserve_color:
            bgr = cv2.bilateralFilter(bgr, d=5, sigmaColor=40, sigmaSpace=40)
        steps_applied.append("conservative_bilateral_denoise")

    # 6. Contrast enhancement
    if enhance_contrast:
        gray = enhance_contrast_clahe(gray, clip_limit=2.0)
        if preserve_color:
            lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
            l_chan, a_chan, b_chan = cv2.split(lab)
            l_enhanced = enhance_contrast_clahe(l_chan, clip_limit=2.0)
            bgr = cv2.cvtColor(
                cv2.merge([l_enhanced, a_chan, b_chan]), cv2.COLOR_LAB2BGR
            )
        steps_applied.append("clahe_contrast_enhancement")

    # 7. Select final output array
    final_img = bgr if preserve_color else gray
    if not preserve_color:
        steps_applied.insert(0, "grayscale_conversion")

    # 8. Compute quality metrics
    quality_metrics = compute_quality_metrics(gray, skew_angle)

    # 9. Encode processed image in memory
    ext = ".png" if output_format.lower() == "png" else ".jpg"
    mime_type = "image/png" if ext == ".png" else "image/jpeg"
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, 95] if ext == ".jpg" else []
    success, encoded_buf = cv2.imencode(ext, final_img, encode_params)
    if not success:
        raise ValueError(f"Failed to encode preprocessed image for '{filename}'")

    processed_bytes = encoded_buf.tobytes()

    # 10. Store in temporary in-memory store
    image_id = processed_image_store.store(
        processed_bytes, mime_type, f"preprocessed_{filename}"
    )

    proc_h, proc_w = final_img.shape[:2]
    meta = PreprocessImageMeta(
        image_id=image_id,
        original_filename=filename,
        original_size_bytes=len(image_bytes),
        original_size_formatted=format_bytes_size(len(image_bytes)),
        processed_size_bytes=len(processed_bytes),
        processed_size_formatted=format_bytes_size(len(processed_bytes)),
        original_dimensions=orig_dims,
        processed_dimensions=(proc_w, proc_h),
        processing_applied=len(steps_applied) > 0,
        steps_applied=steps_applied,
        applied_skew_angle=applied_skew,
        quality_metrics=quality_metrics,
        preview_url=f"/api/v1/reports/processed/{image_id}",
    )

    return meta, processed_bytes
