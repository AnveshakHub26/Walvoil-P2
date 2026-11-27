"""API routes for Walvoil DPR backend."""

import asyncio
import os
from typing import List
from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile, status

from app.core.config import settings
from app.schemas.layout import DPRLayoutDetectionResponse
from app.schemas.recognition import DPRRecognitionResponse
from app.schemas.report import (
    PreprocessReportsResponse,
    PreprocessImageMeta,
    UploadReportsResponse,
    UploadedFileMeta,
)
from app.services.layout_detection import (
    crop_region_image,
    detect_walvoil_dpr_layout,
)
from app.services.recognition import recognize_walvoil_dpr
from app.services.image_preprocessing import (
    format_bytes_size,
    preprocess_dpr_image,
    processed_image_store,
    validate_and_inspect_image,
)

router = APIRouter(prefix="/reports", tags=["reports"])

# Concurrency semaphore to throttle resource-intensive recognition on multi-core CPU
recognition_semaphore = asyncio.Semaphore(settings.CONCURRENCY_LIMIT)


def format_file_size(size_bytes: int) -> str:
    """Format raw byte count into a readable string (e.g., '1.2 MB')."""
    return format_bytes_size(size_bytes)


@router.get("/status")
def get_reports_service_status():
    """Return the operational status of the DPR reports pipeline."""
    return {
        "status": "active",
        "service": "dpr_reports",
        "pipeline": {
            "upload_intake": "ready",
            "image_preprocessing": "active",
            "layout_detection": "active",
            "handwriting_recognition": "active",
        },
        "supported_formats": list(settings.ALLOWED_EXTENSIONS),
        "max_file_size_mb": settings.MAX_FILE_SIZE_MB,
    }


@router.post(
    "/upload",
    response_model=UploadReportsResponse,
    status_code=status.HTTP_200_OK,
    summary="Upload one or multiple handwritten DPR report scans",
)
async def upload_reports(
    files: List[UploadFile] = File(
        ..., description="One or more DPR scan images (JPG, PNG, WEBP, max 10MB each)"
    ),
):
    """Receive and validate scanned Daily Production Report images.

    Validates:
    - Supported extensions (.jpg, .jpeg, .png, .webp)
    - Valid image MIME types
    - File size <= 10 MB per image
    - Decodable non-corrupt image binary content

    Images are processed strictly in memory and are not permanently saved to disk.
    No OCR extraction or fake recognition is performed in this phase.
    """
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files were provided in the upload request.",
        )

    processed_meta: List[UploadedFileMeta] = []
    has_at_least_one_valid = False
    validation_failures: List[str] = []

    for file in files:
        raw_name = file.filename or "unnamed_scan"
        filename = os.path.basename(raw_name.replace("\\", "/")) or "unnamed_scan"
        content_type = file.content_type or "application/octet-stream"

        # 1. Extension validation
        lower_name = filename.lower()
        if not any(lower_name.endswith(ext) for ext in settings.ALLOWED_EXTENSIONS):
            error_msg = (
                f"File '{filename}' has an unsupported extension. "
                f"Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}"
            )
            validation_failures.append(error_msg)
            processed_meta.append(
                UploadedFileMeta(
                    filename=filename,
                    content_type=content_type,
                    size_bytes=0,
                    size_formatted="0 B",
                    is_valid=False,
                    validation_error=error_msg,
                )
            )
            continue

        # 2. MIME type check
        if content_type.lower() not in settings.ALLOWED_MIME_TYPES:
            # Allow fallback if extension is valid but browser sent octet-stream
            if content_type.lower() != "application/octet-stream":
                error_msg = (
                    f"File '{filename}' has an unsupported MIME type '{content_type}'. "
                    f"Allowed: {', '.join(settings.ALLOWED_MIME_TYPES)}"
                )
                validation_failures.append(error_msg)
                processed_meta.append(
                    UploadedFileMeta(
                        filename=filename,
                        content_type=content_type,
                        size_bytes=0,
                        size_formatted="0 B",
                        is_valid=False,
                        validation_error=error_msg,
                    )
                )
                continue

        # 3. Read content in memory (non-persistent)
        try:
            content = await file.read()
        except Exception as exc:
            error_msg = f"Failed to read '{filename}': {str(exc)}"
            validation_failures.append(error_msg)
            processed_meta.append(
                UploadedFileMeta(
                    filename=filename,
                    content_type=content_type,
                    size_bytes=0,
                    size_formatted="0 B",
                    is_valid=False,
                    validation_error=error_msg,
                )
            )
            continue

        size_bytes = len(content)
        size_formatted = format_file_size(size_bytes)

        # 4. Check size limit
        if size_bytes == 0:
            error_msg = f"File '{filename}' is empty (0 bytes)."
            validation_failures.append(error_msg)
            processed_meta.append(
                UploadedFileMeta(
                    filename=filename,
                    content_type=content_type,
                    size_bytes=0,
                    size_formatted=size_formatted,
                    is_valid=False,
                    validation_error=error_msg,
                )
            )
            continue

        if size_bytes > settings.MAX_FILE_SIZE_BYTES:
            error_msg = (
                f"File '{filename}' exceeds maximum allowed size of "
                f"{settings.MAX_FILE_SIZE_MB} MB ({size_formatted})."
            )
            validation_failures.append(error_msg)
            processed_meta.append(
                UploadedFileMeta(
                    filename=filename,
                    content_type=content_type,
                    size_bytes=size_bytes,
                    size_formatted=size_formatted,
                    is_valid=False,
                    validation_error=error_msg,
                )
            )
            continue

        # 5. Image integrity check using Pillow
        is_valid_image, dimensions, image_err = validate_and_inspect_image(
            content, filename
        )
        if not is_valid_image:
            error_msg = image_err or f"File '{filename}' is not a valid decodable image."
            validation_failures.append(error_msg)
            processed_meta.append(
                UploadedFileMeta(
                    filename=filename,
                    content_type=content_type,
                    size_bytes=size_bytes,
                    size_formatted=size_formatted,
                    is_valid=False,
                    validation_error=error_msg,
                )
            )
            continue

        # Valid image accepted
        has_at_least_one_valid = True
        processed_meta.append(
            UploadedFileMeta(
                filename=filename,
                content_type=content_type,
                size_bytes=size_bytes,
                size_formatted=size_formatted,
                is_valid=True,
                dimensions=dimensions,
                validation_error=None,
            )
        )

    valid_count = sum(1 for m in processed_meta if m.is_valid)

    # If all provided files failed validation, reject request with 400
    if not has_at_least_one_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "All uploaded files failed validation.",
                "errors": validation_failures,
            },
        )

    return UploadReportsResponse(
        success=True,
        message=f"Successfully received and validated {valid_count} DPR report image(s).",
        total_files=len(files),
        valid_files_count=valid_count,
        files=processed_meta,
    )


@router.post(
    "/preprocess",
    response_model=PreprocessReportsResponse,
    status_code=status.HTTP_200_OK,
    summary="Preprocess one or multiple handwritten DPR report scans",
)
async def preprocess_reports(
    files: List[UploadFile] = File(
        ..., description="One or more DPR scan images (JPG, PNG, WEBP, max 10MB each)"
    ),
    enhance_contrast: bool = Query(
        True, description="Apply CLAHE adaptive contrast enhancement"
    ),
    apply_noise_reduction: bool = Query(
        True, description="Apply conservative bilateral noise reduction"
    ),
    deskew: bool = Query(
        True, description="Detect and correct document tilt (-15° to +15°)"
    ),
    preserve_color: bool = Query(
        False, description="Preserve full color instead of grayscale output"
    ),
    output_format: str = Query(
        "png", description="Processed output image format: 'png' or 'jpg'"
    ),
):
    """Execute the DPR image preprocessing pipeline on uploaded scan images.

    Processing Steps:
    1. EXIF orientation detection and normalization
    2. Document tilt estimation and small skew angle correction
    3. Conservative bilateral noise reduction (preserves handwriting strokes)
    4. Contrast-limited adaptive histogram equalization (CLAHE)
    5. Approximate heuristic quality metrics computation (brightness, contrast, sharpness)
    6. In-memory temporary caching for safe retrieval via /processed/{image_id}

    Does not perform OCR, does not generate fake text, and does not store files to disk.
    Original uploaded images are never overwritten or altered.
    """
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files were provided in the preprocessing request.",
        )

    processed_reports: List[PreprocessImageMeta] = []
    validation_failures: List[str] = []

    for file in files:
        raw_name = file.filename or "unnamed_scan"
        filename = os.path.basename(raw_name.replace("\\", "/")) or "unnamed_scan"
        content_type = file.content_type or "application/octet-stream"

        # 1. Extension validation
        lower_name = filename.lower()
        if not any(lower_name.endswith(ext) for ext in settings.ALLOWED_EXTENSIONS):
            error_msg = (
                f"File '{filename}' has an unsupported extension. "
                f"Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}"
            )
            validation_failures.append(error_msg)
            continue

        # 2. MIME type check
        if content_type.lower() not in settings.ALLOWED_MIME_TYPES:
            if content_type.lower() != "application/octet-stream":
                error_msg = (
                    f"File '{filename}' has an unsupported MIME type '{content_type}'. "
                    f"Allowed: {', '.join(settings.ALLOWED_MIME_TYPES)}"
                )
                validation_failures.append(error_msg)
                continue

        # 3. Read in memory
        try:
            content = await file.read()
        except Exception as exc:
            error_msg = f"Failed to read '{filename}': {str(exc)}"
            validation_failures.append(error_msg)
            continue

        size_bytes = len(content)

        # 4. Check size limit
        if size_bytes == 0:
            error_msg = f"File '{filename}' is empty (0 bytes)."
            validation_failures.append(error_msg)
            continue

        if size_bytes > settings.MAX_FILE_SIZE_BYTES:
            size_formatted = format_file_size(size_bytes)
            error_msg = (
                f"File '{filename}' exceeds maximum allowed size of "
                f"{settings.MAX_FILE_SIZE_MB} MB ({size_formatted})."
            )
            validation_failures.append(error_msg)
            continue

        # 5. Image integrity check
        is_valid_image, _, image_err = validate_and_inspect_image(content, filename)
        if not is_valid_image:
            error_msg = image_err or f"File '{filename}' is not a valid decodable image."
            validation_failures.append(error_msg)
            continue

        # 6. Execute preprocessing pipeline
        try:
            meta, _ = preprocess_dpr_image(
                image_bytes=content,
                filename=filename,
                enhance_contrast=enhance_contrast,
                apply_noise_reduction=apply_noise_reduction,
                deskew=deskew,
                preserve_color=preserve_color,
                output_format=output_format,
            )
            processed_reports.append(meta)
        except Exception as exc:
            validation_failures.append(
                f"Preprocessing failed for '{filename}': {str(exc)}"
            )

    if not processed_reports:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "All uploaded files failed validation or preprocessing.",
                "errors": validation_failures,
            },
        )

    return PreprocessReportsResponse(
        success=True,
        message=f"Successfully preprocessed {len(processed_reports)} of {len(files)} DPR image(s).",
        total_files=len(files),
        processed_count=len(processed_reports),
        reports=processed_reports,
    )


@router.get(
    "/processed/{image_id}",
    summary="Retrieve in-memory preprocessed DPR image",
)
def get_processed_image(
    image_id: str,
    download: bool = Query(
        False, description="Set Content-Disposition to download file attachment"
    ),
):
    """Retrieve an in-memory preprocessed DPR scan by its temporary identifier.

    The image is retrieved from volatile application memory and was never written to disk.
    If the image has expired or does not exist, returns 404 Not Found.
    """
    entry = processed_image_store.get(image_id)
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Processed image '{image_id}' was not found or has expired from memory.",
        )

    image_bytes, content_type, filename = entry
    headers = {"Cache-Control": "private, max-age=300"}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'

    return Response(content=image_bytes, media_type=content_type, headers=headers)


@router.post(
    "/layout/detect",
    response_model=DPRLayoutDetectionResponse,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
    summary="Detect fixed-template layout and segment DPR regions (Phase 11)",
)
async def detect_layout_endpoint(
    file: UploadFile = File(
        ..., description="Walvoil ASLY-DPR-REV01 scan image (JPG, PNG, WEBP, max 10MB)"
    ),
):
    """Detect the printed structure of a Walvoil DPR scan and segment all regions.

    - Uses Phase 09 OpenCV preprocessing (deskew, bilateral filter, CLAHE)
    - Detects form boundary and aligns against canonical ASLY-DPR-REV01 template
    - Segments all 5 header fields (Date, Operator, Shift, Bench, Worked Hours)
    - Segments all 14 production rows × 11 columns (154 primary table cells)
    - Segments Column 0 sub-rows (PWH and Order Number sub-cells)
    - Segments footer and operator signature region
    - Maps all detected regions to original un-rotated image coordinates
    - Saves visual diagnostic overlay image for inspection and returns preview URL
    - Does not perform OCR or handwriting recognition
    """
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file was provided in the layout detection request.",
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{file.filename}' is empty (0 bytes).",
        )

    if len(file_bytes) > settings.MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"File '{file.filename}' exceeds maximum allowed size of "
                f"{settings.MAX_FILE_SIZE_MB} MB."
            ),
        )

    # Validate image format and integrity
    is_valid, dimensions, error_message = validate_and_inspect_image(file_bytes, file.filename)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_message or f"File '{file.filename}' is not a valid image.",
        )

    try:
        detection_result, _ = detect_walvoil_dpr_layout(
            image_bytes=file_bytes,
            filename=file.filename,
            preserve_color=True,
            save_diagnostic=True,
        )
        return detection_result
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Layout detection failed: {str(exc)}",
        )


@router.post(
    "/recognize",
    response_model=DPRRecognitionResponse,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
    summary="Recognize handwriting and extract structured Walvoil DPR report (Phase 13)",
)
async def recognize_dpr_endpoint(
    file: UploadFile = File(
        ..., description="Walvoil ASLY-DPR-REV01 scan image (JPG, PNG, WEBP, max 10MB)"
    ),
):
    """Execute end-to-end handwriting recognition on an uploaded Walvoil DPR scan.

    Pipeline:
    1. Validates image binary, size, and format.
    2. Runs Phase 09 preprocessing (EXIF, deskew, CLAHE contrast).
    3. Runs Phase 11 layout detection (189 regions, 14 production rows, Col 0 sub-rows).
    4. Applies cell pre-filter heuristics:
       - Skips empty cells to eliminate wasted inferences.
       - Skips cancelled rows (diagonal strike-through strokes).
       - Bypasses operator signatures (marked as signature regions).
    5. Field-based model routing:
       - Freehand cursive text (Operator Name, Remarks) -> TrOCR Small
       - Numeric, alphanumeric, dates, times, part numbers, quantities -> PP-OCRv5 Mobile
    6. Formulates structured 14-row production table, header, and footer.
    7. Sets conservative human review flags (needs_review=True).
    """
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file was provided in the recognition request.",
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{file.filename}' is empty (0 bytes).",
        )

    if len(file_bytes) > settings.MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"File '{file.filename}' exceeds maximum allowed size of "
                f"{settings.MAX_FILE_SIZE_MB} MB."
            ),
        )

    # Validate image format and integrity
    is_valid, dimensions, error_message = validate_and_inspect_image(
        file_bytes, file.filename
    )
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_message or f"File '{file.filename}' is not a valid image.",
        )

    clean_filename = os.path.basename(file.filename.replace("\\", "/"))

    # Throttle concurrent recognition inferences to protect CPU/memory
    async with recognition_semaphore:
        try:
            loop = asyncio.get_running_loop()
            recognition_result = await loop.run_in_executor(
                None, recognize_walvoil_dpr, file_bytes, clean_filename
            )
            return recognition_result
        except Exception as exc:
            from app.services.gemini_service import GeminiRateLimitException
            if isinstance(exc, GeminiRateLimitException):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=str(exc),
                    headers={"Retry-After": str(exc.retry_after_seconds)},
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Recognition failed: {str(exc)}",
            )
