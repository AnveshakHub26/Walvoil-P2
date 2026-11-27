"""Pydantic models reflecting the Walvoil DPR structure.

Prepared for future integration; preserves the exact 11-column table
and header structure used by the Walvoil DPR frontend.
"""

from typing import List, Optional, Tuple
from pydantic import BaseModel, ConfigDict, Field


class DPRHeaderSchema(BaseModel):
    """Walvoil Daily Production Report header fields."""

    model_config = ConfigDict(populate_by_name=True)

    date: str = Field(default="", description="Production date (e.g., DD/MM/YYYY)")
    operator_name: str = Field(
        default="", alias="operatorName", description="Operator full name"
    )
    shift: str = Field(default="Shift 1", description="Assigned shift (e.g., Shift 1, Shift 2)")
    bench: str = Field(default="", description="Assembly bench or station number")
    worked_hours: str = Field(
        default="", alias="workedHours", description="Total worked hours"
    )


class DPRRowSchema(BaseModel):
    """Single row within the 11-column Walvoil DPR production table."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(description="Unique row identifier")
    batch_and_order: str = Field(
        default="",
        alias="batchAndOrder",
        description="PWH Batch Number and Order Number",
    )
    family: str = Field(default="", description="Product family / description")
    part_number: str = Field(
        default="", alias="partNumber", description="Part / Component Number"
    )
    time_start: str = Field(
        default="", alias="timeStart", description="Production start time"
    )
    time_end: str = Field(
        default="", alias="timeEnd", description="Production end time"
    )
    qty: str = Field(default="", description="Produced quantity")
    remarks: str = Field(
        default="", description="Production notes or assembly remarks"
    )
    idle_code: str = Field(
        default="", alias="idleCode", description="Idle reason code (e.g., M01, M02)"
    )
    idle_from: str = Field(
        default="", alias="idleFrom", description="Idle period start time"
    )
    idle_to: str = Field(
        default="", alias="idleTo", description="Idle period end time"
    )
    total_time: str = Field(
        default="", alias="totalTime", description="Total idle or operational duration"
    )


class DPRSheetSchema(BaseModel):
    """Full sheet structure corresponding to one scanned DPR page."""

    model_config = ConfigDict(populate_by_name=True)

    sheet_index: int = Field(
        alias="sheetIndex", description="1-based report sequence index (1 to 7)"
    )
    sheet_name: str = Field(
        alias="sheetName", description="Sheet identifier (e.g., Report 1)"
    )
    file_name: str = Field(
        alias="fileName", description="Associated scan image filename"
    )
    file_id: Optional[str] = Field(
        default=None, alias="fileId", description="Internal file identifier"
    )
    headers: DPRHeaderSchema = Field(
        default_factory=DPRHeaderSchema, description="Report metadata headers"
    )
    rows: List[DPRRowSchema] = Field(
        default_factory=list,
        description="The 14 standardized production log rows",
    )
    operator_sign: str = Field(
        default="", alias="operatorSign", description="Operator signature text or flag"
    )
    issued_by: str = Field(
        default="ASLY", alias="issuedBy", description="Issuing department"
    )
    controlled_by: str = Field(
        default="MGT", alias="controlledBy", description="Controlling authority"
    )
    revision: str = Field(
        default="REV 01", description="Form revision specification"
    )
    approved_by: str = Field(
        default="MGT", alias="approvedBy", description="Approving authority"
    )
    is_demo_data: bool = Field(
        default=False,
        alias="isDemoData",
        description="Whether values are mock demonstration data",
    )


class UploadedFileMeta(BaseModel):
    """Metadata response for an uploaded DPR scan image."""

    filename: str
    content_type: str
    size_bytes: int
    size_formatted: str
    is_valid: bool = True
    dimensions: Optional[Tuple[int, int]] = None
    validation_error: Optional[str] = None


class UploadReportsResponse(BaseModel):
    """Response payload for POST /api/v1/reports/upload."""

    success: bool
    message: str
    total_files: int
    valid_files_count: int
    files: List[UploadedFileMeta]


class DPRQualityMetrics(BaseModel):
    """Approximate heuristic metrics for document capture quality."""

    width: int
    height: int
    megapixels: float
    mean_brightness: float = Field(description="Mean grayscale intensity (0-255)")
    contrast_std: float = Field(description="Grayscale standard deviation")
    sharpness_laplacian_var: float = Field(
        description="Laplacian variance sharpness metric"
    )
    estimated_skew_angle: float = Field(description="Detected skew angle in degrees")
    is_blurry: bool = False
    is_low_contrast: bool = False
    is_underexposed: bool = False
    is_overexposed: bool = False
    is_low_resolution: bool = False
    warnings: List[str] = Field(default_factory=list)
    quality_note: str = Field(
        default=(
            "Quality indicators are approximate heuristics and do not guarantee "
            "OCR/HTR accuracy."
        )
    )


class PreprocessImageMeta(BaseModel):
    """Metadata result for a preprocessed DPR report scan."""

    image_id: str = Field(
        description="Temporary in-memory identifier for retrieving the processed scan"
    )
    original_filename: str
    original_size_bytes: int
    original_size_formatted: str
    processed_size_bytes: int
    processed_size_formatted: str
    original_dimensions: Tuple[int, int]
    processed_dimensions: Tuple[int, int]
    processing_applied: bool
    steps_applied: List[str]
    applied_skew_angle: float
    quality_metrics: DPRQualityMetrics
    preview_url: str = Field(
        description="Relative URL to retrieve processed image from memory"
    )


class PreprocessReportsResponse(BaseModel):
    """Response payload for POST /api/v1/reports/preprocess."""

    success: bool
    message: str
    total_files: int
    processed_count: int
    reports: List[PreprocessImageMeta]


