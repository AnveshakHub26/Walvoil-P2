# PHASE 13: HYBRID HANDWRITING RECOGNITION INTEGRATION REPORT

**Project:** Walvoil Daily Production Report (DPR) Handwriting Digitisation System  
**Document Code:** ASLY-DPR-INTEGRATION-PHASE13  
**Template:** ASLY-DPR-REV01  
**Hardware Profile:** Intel Core i3-10110U (2 Cores / 4 Threads @ 2.10 GHz), 16 GB DDR4 RAM, Intel UHD Graphics 620, Windows 11 64-bit, Python 3.12.10, Local D: Partition.

---

## 1. Executive Summary

Phase 13 establishes the operational hybrid handwriting recognition pipeline for Walvoil Daily Production Report Form `ASLY-DPR-REV01`. Building upon Phase 09 (OpenCV Preprocessing & Deskew) and Phase 11 (Fixed-Template Layout Detection & Region Partitioning), this phase integrates the two empirical top-performing pretrained recognition models into the FastAPI backend via a field-specialized routing architecture.

In strict compliance with industrial standards:
- **Zero models were trained from scratch or fine-tuned.** Official pretrained checkpoints are utilized.
- **Zero external cloud OCR APIs are invoked.** All inference and image processing occur strictly locally on the development machine.
- **No synthetic text or fake confidence scores are returned.** Confidence is set to `None` when models do not produce calibrated token probabilities.
- **Conservative Human-in-the-Loop review:** All extracted fields carry `needs_review: true`, ensuring zero unverified data automatically propagates into manufacturing systems.
- **Local D: Drive Storage:** Model caching and working directories reside entirely under `D:\Walvoil_New_Project\backend\.cache`, respecting partition isolation.

---

## 2. Field-Based Model Routing Matrix

In accordance with empirical conclusions from Phase 12, fields are categorized by linguistic prior requirements and routed to specialized recognition engines:

| Document Region | Target Field | Assigned Model | Justification & Expected Data Type |
| :--- | :--- | :--- | :--- |
| **Header** | `operator_name` | `microsoft/trocr-small-handwritten` | Cursive Latin penmanship; benefits from Transformer language decoder. |
| **Header** | `date` | `en_PP-OCRv5_mobile_rec` | Standard `DD/MM/YYYY` numerals and slashes. |
| **Header** | `shift` | `en_PP-OCRv5_mobile_rec` | Alphanumeric shift code (`1st`, `2nd`, `G`). |
| **Header** | `bench` | `en_PP-OCRv5_mobile_rec` | Assembly station digit (`3`, `11`). |
| **Header** | `worked_hours` | `en_PP-OCRv5_mobile_rec` | Duration numerals (`8`, `8hrs`, `08`). |
| **Table (Col 0 Upper)** | `pwh_subrow` | `en_PP-OCRv5_mobile_rec` | 7-digit production work order batch (`2638043`). |
| **Table (Col 0 Lower)** | `ord_subrow` | `en_PP-OCRv5_mobile_rec` | 7-digit customer order number (`1118496`). |
| **Table (Col 1)** | `family` | `en_PP-OCRv5_mobile_rec` | Valve product family code (`SD6/5`, `SD5/1`). |
| **Table (Col 2)** | `part_number` | `en_PP-OCRv5_mobile_rec` | 9-digit component codes or alphanumeric IDs (`512500254`, `1021H0001-A`). |
| **Table (Col 3)** | `time_start` | `en_PP-OCRv5_mobile_rec` | Production start timestamp (`6:00`). |
| **Table (Col 4)** | `time_end` | `en_PP-OCRv5_mobile_rec` | Production end timestamp (`2:00`, `-`). |
| **Table (Col 5)** | `qty` | `en_PP-OCRv5_mobile_rec` | Numeric completed volume (`5 no`, `34`). |
| **Table (Col 6)** | `remarks` | `microsoft/trocr-small-handwritten` | Freehand cursive technician notes (`No cloche`, `with motors`, `yal problem`). |
| **Table (Col 7)** | `idle_code` | `en_PP-OCRv5_mobile_rec` | Downtime reason code (`A0`). |
| **Table (Col 8)** | `idle_from` | `en_PP-OCRv5_mobile_rec` | Downtime start timestamp. |
| **Table (Col 9)** | `idle_to` | `en_PP-OCRv5_mobile_rec` | Downtime resume timestamp. |
| **Table (Col 10)** | `total_time` | `en_PP-OCRv5_mobile_rec` | Cumulative activity duration (`4.0 hrs`). |
| **Footer** | `operator_sign` | *Bypassed* (`status="signature_region"`) | Signatures are legal marks, not machine-encoded text; OCR inference is skipped. |

---

## 3. High-Performance Pre-Filter Architecture

A DPR sheet contains **189 segmented regions** (5 header fields + 154 primary table cells + 28 Column 0 sub-rows + 2 footer regions). In typical industrial operation, only 2 to 4 rows are filled per shift; the remaining 10 to 12 rows are struck through diagonally or left blank.

Blindly running CPU inference on 189 crops would require **3 to 8 minutes** per page on a dual-core Intel Core i3. To achieve interactive sub-second response times, Phase 13 introduces two deterministic pre-filters:

```
Raw Scan Upload
       │
       ▼
Phase 09 Preprocessing (EXIF, Deskew, Contrast Enhancement)
       │
       ▼
Phase 11 Layout Detection (189 Regions Segmented & Mapped)
       │
       ├───────────────────────────────────────────────────────┐
       ▼                                                       ▼
Is Signature Region?                                     Is Cell Active?
       │                                                       │
  [YES] │                                                 [NO] │
       ▼                                                       ▼
status: "signature_region"                               Fast Pre-Filters:
(OCR Skipped)                                            1. Inset Variance < 120.0 (Blank paper)
                                                         2. Hough Diagonal Strike Detection
                                                               │
                                                               ├────────────► status: "empty"
                                                               ├────────────► status: "cancelled"
                                                               │
                                                               ▼ [YES, Has Ink Strokes]
                                                         Field-Based Model Routing
                                                         ├── Textual ──────► TrOCR Small
                                                         └── Alphanumeric ─► PP-OCRv5 Mobile
                                                               │
                                                               ▼
                                                         Sanitize & Clean
                                                         status: "recognized"
                                                         needs_review: true
```

### Pre-Filter Results on Authentic Walvoil Samples:
- **Sample 1 (`walvoil_dpr_sample_1.jpg`):**
  - Total regions: **189**
  - Active recognized cells: **35**
  - Cancelled rows (Rows 5–14): **130 cells skipped**
  - Signature cells bypassed: **1**
  - Empty cells: **23**
  - **Inference Reduction:** **81.5% of crops bypassed**, reducing page processing time to under **2.5 seconds** on CPU!

- **Sample 2 (`walvoil_dpr_sample_2.jpg`):**
  - Total regions: **189**
  - Active recognized cells: **14**
  - Cancelled rows (Rows 4–14): **143 cells skipped**
  - Signature cells bypassed: **1**
  - Empty cells: **31**
  - **Inference Reduction:** **92.6% of crops bypassed**.

---

## 4. API Specification: `POST /api/v1/reports/recognize`

### Endpoint Overview
- **Path:** `/api/v1/reports/recognize`
- **Method:** `POST`
- **Content-Type:** `multipart/form-data`
- **Request Field:** `file` (Binary DPR scan: JPG, PNG, WEBP, max 10 MB)
- **Response Model:** `DPRRecognitionResponse`

### Response Payload Structure
```json
{
  "success": true,
  "filename": "walvoil_dpr_sample_1.jpg",
  "templateName": "ASLY-DPR-REV01",
  "alignmentConfidence": 0.98,
  "processingTimeMs": 2340.5,
  "header": {
    "date": {
      "fieldId": "hdr_date",
      "section": "header",
      "fieldName": "date",
      "rawText": "23/09/2026",
      "cleanedText": "23/09/2026",
      "modelUsed": "en_PP-OCRv5_mobile_rec",
      "confidence": 0.95,
      "status": "recognized",
      "needsReview": true,
      "deskewedBox": { "x": 103, "y": 74, "width": 118, "height": 33 },
      "originalCoordinates": { ... },
      "latencyMs": 42.1
    },
    "operator_name": {
      "fieldId": "hdr_operator_name",
      "section": "header",
      "fieldName": "operator_name",
      "rawText": "Kashinatha / Thippanna",
      "cleanedText": "Kashinatha / Thippanna",
      "modelUsed": "microsoft/trocr-small-handwritten",
      "confidence": 0.94,
      "status": "recognized",
      "needsReview": true,
      ...
    }
  },
  "tableRows": [
    {
      "rowIndex": 1,
      "isCancelled": false,
      "pwhSubrow": { "rawText": "2638043", "cleanedText": "2638043", "modelUsed": "en_PP-OCRv5_mobile_rec", ... },
      "ordSubrow": { "rawText": "1118496", "cleanedText": "1118496", "modelUsed": "en_PP-OCRv5_mobile_rec", ... },
      "family": { "rawText": "SD6/5", "cleanedText": "SD6/5", ... },
      "partNumber": { "rawText": "512500254", "cleanedText": "512500254", ... },
      "timeStart": { "rawText": "6:00", ... },
      "timeEnd": { "rawText": "-", ... },
      "qty": { "rawText": "5 no", ... },
      "remarks": { "rawText": "No cloche", "modelUsed": "microsoft/trocr-small-handwritten", ... },
      "idleCode": { "rawText": "A0", ... },
      "idleFrom": null,
      "idleTo": null,
      "totalTime": { "rawText": "4.0 hrs", ... }
    },
    ...
    {
      "rowIndex": 7,
      "isCancelled": true,
      "pwhSubrow": { "status": "cancelled", "rawText": null, "modelUsed": null, "needsReview": true },
      ...
    }
  ],
  "footer": {
    "operator_sign": {
      "fieldId": "ftr_operator_sign",
      "status": "signature_region",
      "rawText": null,
      "modelUsed": null,
      "needsReview": true
    }
  },
  "summary": {
    "totalCells": 189,
    "recognizedCells": 35,
    "emptyCells": 23,
    "cancelledCells": 130,
    "signatureCells": 1,
    "cellsNeedingReview": 189,
    "byModel": {
      "en_PP-OCRv5_mobile_rec": 27,
      "microsoft/trocr-small-handwritten": 8
    }
  },
  "allFields": [ ... ],
  "warnings": [
    "Production rows 5 to 14 detected as cancelled; OCR skipped."
  ]
}
```

---

## 5. Verification Results

A dedicated test suite [`backend/test_recognition.py`](file:///d:/Walvoil_New_Project/backend/test_recognition.py) was implemented using the direct ASGI in-process test framework:

```
====================================================================
WALVOIL DPR HYBRID HANDWRITING RECOGNITION TEST SUITE (PHASE 13)
====================================================================

1. Field-Based Model Routing Verification
  [PASS] Field 'operator_name' routes to TrOCR Small (microsoft/trocr-small-handwritten)
  [PASS] Field 'remarks' routes to TrOCR Small (microsoft/trocr-small-handwritten)
  [PASS] Field 'date' routes to PP-OCRv5 Mobile (en_PP-OCRv5_mobile_rec)
  [PASS] Field 'shift' routes to PP-OCRv5 Mobile (en_PP-OCRv5_mobile_rec)
  [PASS] Field 'bench' routes to PP-OCRv5 Mobile (en_PP-OCRv5_mobile_rec)
  [PASS] Field 'worked_hours' routes to PP-OCRv5 Mobile (en_PP-OCRv5_mobile_rec)
  [PASS] Field 'family' routes to PP-OCRv5 Mobile (en_PP-OCRv5_mobile_rec)
  [PASS] Field 'part_number' routes to PP-OCRv5 Mobile (en_PP-OCRv5_mobile_rec)
  [PASS] Field 'time_start' routes to PP-OCRv5 Mobile (en_PP-OCRv5_mobile_rec)
  [PASS] Field 'time_end' routes to PP-OCRv5 Mobile (en_PP-OCRv5_mobile_rec)
  [PASS] Field 'qty' routes to PP-OCRv5 Mobile (en_PP-OCRv5_mobile_rec)
  [PASS] Field 'idle_code' routes to PP-OCRv5 Mobile (en_PP-OCRv5_mobile_rec)
  [PASS] Field 'total_time' routes to PP-OCRv5 Mobile (en_PP-OCRv5_mobile_rec)
  [PASS] Sub-row 'pwh' routes to PP-OCRv5
  [PASS] Sub-row 'ord_no' routes to PP-OCRv5
  [PASS] Signature field bypasses OCR (returns None)

2. POST /api/v1/reports/recognize — Genuine Sample 1
  [PASS] Status 200 OK (got 200)
  [PASS] Response success is True
  [PASS] Template name is ASLY-DPR-REV01
  [PASS] Alignment confidence >= 0.90
  [PASS] Total cells evaluated is 189 (got 189)
  [PASS] Active recognized cells count > 0 (got 35)
  [PASS] Cancelled cells detected without OCR (got 130)
  [PASS] Signature cells detected without OCR (got 1)
  [PASS] All cells flagged for review (conservative)
  [PASS] Header contains date
  [PASS] Header date model is PP-OCRv5
  [PASS] Header contains operator_name
  [PASS] Operator name model is TrOCR Small
  [PASS] Operator name text matches genuine sample
  [PASS] Table has exactly 14 rows
  [PASS] Row 1 is active (isCancelled=False)
  [PASS] Row 1 PWH sub-row present
  [PASS] Row 1 Ord no sub-row present
  [PASS] Row 1 PWH text matches ground truth (2638043)
  [PASS] Row 1 Ord no text matches ground truth (1118496)
  [PASS] Row 1 Family matches SD6/5
  [PASS] Row 1 Part number matches 512500254
  [PASS] Row 7 detected as cancelled (isCancelled=True)
  [PASS] Row 7 part number status is 'cancelled'
  [PASS] Row 7 model_used is None (OCR skipped)
  [PASS] Footer contains operator_sign
  [PASS] operator_sign status is 'signature_region'
  [PASS] operator_sign model_used is None
  [PASS] Field retains deskewedBox coordinates
  [PASS] Field retains originalCoordinates

3. POST /api/v1/reports/recognize — Genuine Sample 2
  [PASS] Sample 2 status 200 OK (got 200)
  [PASS] Sample 2 total cells is 189
  [PASS] Sample 2 operator name matches Jogannatha
  [PASS] Sample 2 operator name routed to TrOCR Small
  [PASS] Sample 2 Row 1 Part number matches 1021H0001-A

4. GET /api/v1/reports/status Verification
  [PASS] Status endpoint 200 OK
  [PASS] Handwriting recognition is active

5. Robustness & Error Handling
  [PASS] Empty file returns 400 Bad Request (got 400)
  [PASS] Corrupted image returns 400 Bad Request (got 400)
  [PASS] Unsupported extension returns 400 Bad Request (got 400)

RESULTS: 56 passed, 0 failed out of 56 checks
```

### Full System Regression Summary
- **Phase 08.1 Core Endpoints:** `test_endpoints.py` — **21/21 passed**
- **Phase 09 Image Preprocessing:** `test_preprocessing.py` — **30/30 passed**
- **Phase 11 Layout Detection:** `test_layout_detection.py` — **31/31 passed**
- **Phase 13 Hybrid Recognition:** `test_recognition.py` — **56/56 passed**
- **Frontend Linter (`oxlint`):** **0 errors, 0 warnings**
- **Frontend Production Build (`vite build`):** **Completed successfully in 2.42s**

