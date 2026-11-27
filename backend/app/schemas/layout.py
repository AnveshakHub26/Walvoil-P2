"""Pydantic schemas for Walvoil DPR fixed-template layout detection (Phase 11).

Reflects the exact ASLY-DPR-REV01 form structure:
- 5 Header fields
- 14 Production rows × 11 columns = 154 table cells
- Column 0 PWH and Order Number sub-rows (28 sub-cells)
- Footer and operator signature region
"""

from typing import List, Optional, Tuple
from pydantic import BaseModel, ConfigDict, Field


class BoundingBox(BaseModel):
    """Axis-aligned bounding box coordinates."""

    model_config = ConfigDict(populate_by_name=True)

    x: int = Field(description="Top-left X coordinate in pixels")
    y: int = Field(description="Top-left Y coordinate in pixels")
    width: int = Field(description="Box width in pixels")
    height: int = Field(description="Box height in pixels")


class PolygonPoint(BaseModel):
    """2D floating-point coordinate representing a polygon vertex."""

    x: float
    y: float


class OriginalCoordinates(BaseModel):
    """Coordinates mapped back to the raw, un-rotated source image."""

    model_config = ConfigDict(populate_by_name=True)

    bounding_box: BoundingBox = Field(
        alias="boundingBox",
        description="Enclosing bounding rectangle in original image space",
    )
    polygon: List[PolygonPoint] = Field(
        description="Exact 4-point quadrilateral in original image space",
    )


class DetectedRegion(BaseModel):
    """Single detected field, table cell, or sub-cell region."""

    model_config = ConfigDict(populate_by_name=True)

    region_id: str = Field(
        alias="regionId", description="Unique region identifier (e.g., row01_col02_part_number)"
    )
    section: str = Field(
        description="Document section: header, table, table_subrow, or footer"
    )
    row_index: Optional[int] = Field(
        default=None,
        alias="rowIndex",
        description="Table row index (1 to 14) or 0 for header/footer",
    )
    col_index: Optional[int] = Field(
        default=None,
        alias="colIndex",
        description="Table column index (0 to 10)",
    )
    field_name: str = Field(
        alias="fieldName",
        description="Semantic field identifier (e.g. part_number, date, batch_order)",
    )
    sub_field: Optional[str] = Field(
        default=None,
        alias="subField",
        description="Specific sub-row indicator (e.g., pwh or ord_no)",
    )
    deskewed_box: BoundingBox = Field(
        alias="deskewedBox",
        description="Bounding box in normalized/deskewed image coordinates",
    )
    original_coordinates: OriginalCoordinates = Field(
        alias="originalCoordinates",
        description="Precise coordinates mapped back to original raw scan",
    )
    status: str = Field(
        default="detected",
        description="Detection status: detected, interpolated, or uncertain",
    )
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Geometric alignment confidence score",
    )


class TableLayoutSummary(BaseModel):
    """Summary of detected tabular grid geometry."""

    model_config = ConfigDict(populate_by_name=True)

    table_box: BoundingBox = Field(alias="tableBox", description="Enclosing table grid bounding box")
    rows_detected: int = Field(alias="rowsDetected", description="Number of production rows (14)")
    cols_detected: int = Field(alias="colsDetected", description="Number of underlying columns (11)")
    row_pitch: float = Field(alias="rowPitch", description="Average row height in pixels")
    header_height: float = Field(alias="headerHeight", description="Table column header row height")


class DPRLayoutDetectionResponse(BaseModel):
    """Top-level response payload for Phase 11 layout detection API."""

    model_config = ConfigDict(populate_by_name=True)

    success: bool = Field(default=True)
    filename: str = Field(description="Name of the analyzed DPR scan")
    template_name: str = Field(default="ASLY-DPR-REV01", alias="templateName")
    alignment_status: str = Field(
        alias="alignmentStatus",
        description="Alignment status: aligned, fallback_aligned, or failed",
    )
    alignment_confidence: float = Field(
        alias="alignmentConfidence",
        ge=0.0,
        le=1.0,
        description="Overall template alignment confidence",
    )
    skew_angle_deg: float = Field(alias="skewAngleDeg", description="Detected tilt angle in degrees")
    original_dimensions: Tuple[int, int] = Field(
        alias="originalDimensions", description="[Width, Height] of raw scan"
    )
    deskewed_dimensions: Tuple[int, int] = Field(
        alias="deskewedDimensions", description="[Width, Height] of deskewed image"
    )
    total_regions_count: int = Field(
        alias="totalRegionsCount", description="Total number of detected regions"
    )
    table_cells_count: int = Field(
        alias="tableCellsCount", description="Count of primary table cells (154)"
    )
    subrow_cells_count: int = Field(
        alias="subrowCellsCount", description="Count of Col 0 sub-row cells (28)"
    )
    header_fields_count: int = Field(
        alias="headerFieldsCount", description="Count of header fields (5)"
    )
    footer_regions_count: int = Field(
        alias="footerRegionsCount", description="Count of footer regions (2)"
    )
    table_summary: TableLayoutSummary = Field(alias="tableSummary")
    regions: List[DetectedRegion] = Field(description="Array of all detected regions")
    diagnostic_preview_url: Optional[str] = Field(
        default=None,
        alias="diagnosticPreviewUrl",
        description="URL to retrieve visual diagnostic image overlay",
    )
    warnings: List[str] = Field(default_factory=list, description="Non-fatal layout warnings")

