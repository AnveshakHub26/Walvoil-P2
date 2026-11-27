"""Pydantic schemas for Walvoil DPR Hybrid Handwriting Recognition (Phase 13).

Defines structured recognition responses for:
- Field-level OCR/HTR predictions with model attribution
- Preserved Phase 11 coordinate mapping (deskewed and raw image coordinates)
- Header fields, 14 production table rows, sub-rows, and footer signature
- Conservative human review flags (needs_review=True)
- Processing performance and model routing summaries
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.layout import BoundingBox, OriginalCoordinates


class RecognizedField(BaseModel):
    """Structured recognition result for a single DPR field or table cell."""

    model_config = ConfigDict(populate_by_name=True)

    field_id: str = Field(
        alias="fieldId",
        description="Unique region identifier matching Phase 11 layout",
    )
    section: str = Field(
        description="Document section: header, table, table_subrow, or footer",
    )
    field_name: str = Field(
        alias="fieldName",
        description="Semantic field identifier (e.g. part_number, operator_name, date)",
    )
    row_index: Optional[int] = Field(
        default=None,
        alias="rowIndex",
        description="Table row index (1 to 14) or None for header/footer",
    )
    col_index: Optional[int] = Field(
        default=None,
        alias="colIndex",
        description="Table column index (0 to 10)",
    )
    sub_field: Optional[str] = Field(
        default=None,
        alias="subField",
        description="Column 0 sub-row type ('pwh' or 'ord_no') or None",
    )
    raw_text: Optional[str] = Field(
        default=None,
        alias="rawText",
        description="Direct transcription from the assigned model",
    )
    cleaned_text: Optional[str] = Field(
        default=None,
        alias="cleanedText",
        description="Post-processed and sanitized text value",
    )
    model_used: Optional[str] = Field(
        default=None,
        alias="modelUsed",
        description="Assigned model: 'en_PP-OCRv5_mobile_rec', 'microsoft/trocr-small-handwritten', or None",
    )
    confidence: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Model confidence score (None if model does not output token confidence)",
    )
    status: str = Field(
        description="Cell status: 'recognized', 'empty', 'cancelled', 'signature_region', 'error', 'model_offline'",
    )
    needs_review: bool = Field(
        default=True,
        alias="needsReview",
        description="Conservative review flag; True indicates human verification is recommended",
    )
    deskewed_box: BoundingBox = Field(
        alias="deskewedBox",
        description="Bounding rectangle in deskewed template space",
    )
    original_coordinates: OriginalCoordinates = Field(
        alias="originalCoordinates",
        description="Inverse affine coordinates in raw original scan space",
    )
    latency_ms: Optional[float] = Field(
        default=None,
        alias="latencyMs",
        description="Inference time in milliseconds for this individual crop",
    )


class ProductionTableRow(BaseModel):
    """Structured representation of a single production row (1 to 14)."""

    model_config = ConfigDict(populate_by_name=True)

    row_index: int = Field(alias="rowIndex", description="Production row number (1-14)")
    is_cancelled: bool = Field(
        default=False,
        alias="isCancelled",
        description="True if row has diagonal cancellation stroke or all cells empty",
    )
    pwh_subrow: Optional[RecognizedField] = Field(
        default=None,
        alias="pwhSubrow",
        description="Batch Number (PWH sub-row)",
    )
    ord_subrow: Optional[RecognizedField] = Field(
        default=None,
        alias="ordSubrow",
        description="Order Number (Ord no sub-row)",
    )
    family: Optional[RecognizedField] = Field(default=None, description="Valve Family (col 1)")
    part_number: Optional[RecognizedField] = Field(
        default=None, alias="partNumber", description="Part Number (col 2)"
    )
    time_start: Optional[RecognizedField] = Field(
        default=None, alias="timeStart", description="Start Time (col 3)"
    )
    time_end: Optional[RecognizedField] = Field(
        default=None, alias="timeEnd", description="End Time (col 4)"
    )
    qty: Optional[RecognizedField] = Field(
        default=None, description="Quantity in no's (col 5)"
    )
    remarks: Optional[RecognizedField] = Field(
        default=None, description="Remarks / Freehand text (col 6)"
    )
    idle_code: Optional[RecognizedField] = Field(
        default=None, alias="idleCode", description="Idle Time Code (col 7)"
    )
    idle_from: Optional[RecognizedField] = Field(
        default=None, alias="idleFrom", description="Idle Time From (col 8)"
    )
    idle_to: Optional[RecognizedField] = Field(
        default=None, alias="idleTo", description="Idle Time To (col 9)"
    )
    total_time: Optional[RecognizedField] = Field(
        default=None, alias="totalTime", description="Total Time (col 10)"
    )


class RecognitionSummary(BaseModel):
    """Summary statistics for document recognition."""

    model_config = ConfigDict(populate_by_name=True)

    total_cells: int = Field(alias="totalCells", description="Total number of evaluated regions")
    recognized_cells: int = Field(
        alias="recognizedCells", description="Number of actively transcribed cells"
    )
    empty_cells: int = Field(
        alias="emptyCells", description="Number of empty cells detected without OCR"
    )
    cancelled_cells: int = Field(
        alias="cancelledCells", description="Number of cancelled cells detected without OCR"
    )
    signature_cells: int = Field(
        alias="signatureCells", description="Number of signature regions bypassed"
    )
    cells_needing_review: int = Field(
        alias="cellsNeedingReview", description="Total fields flagged for human review"
    )
    by_model: Dict[str, int] = Field(
        alias="byModel", description="Count of inferences executed per model"
    )


class DPRRecognitionResponse(BaseModel):
    """Top-level response payload for POST /api/v1/reports/recognize."""

    model_config = ConfigDict(populate_by_name=True)

    success: bool = Field(default=True)
    filename: str = Field(description="Name of the evaluated DPR scan")
    template_name: str = Field(default="ASLY-DPR-REV01", alias="templateName")
    alignment_confidence: float = Field(
        alias="alignmentConfidence",
        description="Phase 11 template alignment confidence score",
    )
    processing_time_ms: float = Field(
        alias="processingTimeMs", description="Total end-to-end processing latency in ms"
    )
    header: Dict[str, RecognizedField] = Field(
        description="Header fields: date, operator_name, shift, bench, worked_hours"
    )
    table_rows: List[ProductionTableRow] = Field(
        alias="tableRows", description="14 production rows with columns and sub-rows"
    )
    footer: Dict[str, RecognizedField] = Field(
        description="Footer regions including operator signature"
    )
    summary: RecognitionSummary = Field(description="Recognition statistics and counts")
    all_fields: List[RecognizedField] = Field(
        alias="allFields", description="Flat array of all evaluated cell regions"
    )
    warnings: List[str] = Field(
        default_factory=list, description="Non-fatal execution notices or warnings"
    )

