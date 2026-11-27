# Walvoil DPR Backend (Phases 08–15)

FastAPI local backend supporting the Walvoil Handwritten Daily Production Report (DPR) digitisation system (ASLY-DPR-REV01).

---

## Architecture Overview

```
backend/
    app/
        __init__.py
        main.py                  # FastAPI application entrypoint & CORS
        api/
            __init__.py
            routes.py            # API routes (/health, /reports/upload, /reports/preprocess, /reports/layout/detect, /reports/recognize)
        schemas/
            __init__.py
            layout.py            # Phase 11 layout detection schemas (189 regions, coordinates)
            recognition.py       # Phase 13 recognition schemas (model routing, review flags)
            report.py            # DPR report & preprocessing schemas
        services/
            __init__.py
            image_preprocessing.py # EXIF decoding, deskew, denoise, CLAHE, quality heuristics
            layout_detection.py    # ASLY-DPR-REV01 4-point homography alignment & segmentation
            recognition.py         # Hybrid HTR: TrOCR Small + PP-OCRv5 Mobile routing
        core/
            __init__.py
            config.py            # Settings, model paths & CORS configuration
    samples/                     # Genuine Walvoil DPR sample scans
    evaluation/                  # Evaluation benchmarks, comparison CSVs, and Phase 15 reports
    test_endpoints.py            # Phase 08 endpoint test suite (21 checks)
    test_preprocessing.py        # Phase 09 Preprocessing test suite (30 checks)
    test_layout_detection.py     # Phase 11 Layout detection test suite (31 checks)
    test_recognition.py          # Phase 13 Hybrid recognition test suite (56 checks)
    test_e2e_workflow.py         # Phase 15 End-to-End & Excel validation test suite (73 checks)
    requirements.txt             # Foundation dependencies (OpenCV, Pillow, FastAPI, Uvicorn, openpyxl, torch)
    .env.example                 # Example local environment configuration
    README.md
```

---

## Prerequisites
- **Python**: 3.10+ (Tested with Python 3.12.10 on Windows)
- **Windows PowerShell**
- **Hardware**: Runs on standard local CPU (e.g. Intel Core i3, 16 GB RAM; no NVIDIA GPU required)

---

## Setup & Local Run Instructions (Windows PowerShell)

### 1. Navigate to the backend directory
```powershell
cd D:\Walvoil_New_Project\backend
```

### 2. Activate the Python Virtual Environment
```powershell
.\.venv\Scripts\Activate.ps1
```

### 3. Install Dependencies
```powershell
pip install -r requirements.txt
```

### 4. Launch the Local Development Server
```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Interactive API documentation will be available at:
- **Swagger UI:** `http://127.0.0.1:8000/docs`
- **ReDoc:** `http://127.0.0.1:8000/redoc`
- **Health Check:** `http://127.0.0.1:8000/health`
- **Service Status:** `http://127.0.0.1:8000/api/v1/reports/status`

---

## Automated Test Suites (Programmatic Verification - No DOM Testing)

Run the backend test suites directly via PowerShell:

```powershell
cd D:\Walvoil_New_Project
.\backend\.venv\Scripts\python.exe backend\test_endpoints.py
.\backend\.venv\Scripts\python.exe backend\test_preprocessing.py
.\backend\.venv\Scripts\python.exe backend\test_layout_detection.py
.\backend\.venv\Scripts\python.exe backend\test_recognition.py
.\backend\.venv\Scripts\python.exe backend\test_e2e_workflow.py
```

All 211 backend checks pass with 100% success rate.

---

## Preprocessing Pipeline (Phase 09)

The image preprocessing pipeline optimizes camera photos and flatbed scans of handwritten DPR documents for future OCR/HTR character recognition without corrupting table lines or faint entries:

1. **Decoding & EXIF Orientation**: Reads JPG, PNG, WEBP via Pillow and normalizes rotation using EXIF orientation tags before passing to OpenCV BGR arrays.
2. **Grayscale Conversion**: Converts color scans to single-channel luminance for uniform document processing (color preservation available via `preserve_color=True`).
3. **Document Tilt Estimation**: Employs probabilistic Hough line transform (`cv2.HoughLinesP`) on Canny edges to compute dominant table grid angles. Restricts corrections safely to $[-15.0^\circ, +15.0^\circ]$. Micro-tilts ($<0.2^\circ$) and erratic angles are ignored.
4. **Conservative Deskewing**: Rotates image around center with white paper border fill (`borderValue=255`).
5. **Conservative Bilateral Denoising**: Smooths paper texture noise (`cv2.bilateralFilter`) while preserving sharp high-frequency table grid lines, decimal points, and faint pen/pencil strokes.
6. **Adaptive Contrast Enhancement**: Applies Contrast Limited Adaptive Histogram Equalization (`cv2.createCLAHE`, clip limit 2.0) to enhance faint handwriting without blowing out paper background highlights.
7. **Heuristic Image Quality Indicators**: Computes brightness, contrast, Laplacian sharpness variance, and triggers warnings for underexposure, overexposure, low contrast, blurriness, or low resolution.
8. **Volatile In-Memory Caching**: Encodes processed images to PNG in memory and provides a temporary UUID retrieval URL. Original uploaded files are never overwritten, and no files are written to disk.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Application name, version, and status |
| `GET` | `/health` | Health check verification |
| `GET` | `/docs` | Interactive Swagger API documentation |
| `GET` | `/api/v1/reports/status` | DPR pipeline & supported formats status |
| `POST` | `/api/v1/reports/upload` | Validates & inspects DPR images (JPG/PNG/WEBP, $\le$ 10 MB) |
| `POST` | `/api/v1/reports/preprocess` | Runs preprocessing pipeline on one or multiple DPR images |
| `POST` | `/api/v1/reports/layout/detect` | Fixed-template layout detection & region segmentation (Phase 11) |
| `POST` | `/api/v1/reports/recognize` | Hybrid handwriting recognition with field routing (Phase 13) |
| `GET` | `/api/v1/reports/processed/{image_id}` | Retrieves in-memory processed image bytes (PNG/JPEG) |

---

## Request & Response Examples

### POST `/api/v1/reports/preprocess`

**Request:** `multipart/form-data` with one or multiple files in field `files`.
Query options: `enhance_contrast=true&deskew=true&apply_noise_reduction=true&output_format=png`

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Successfully preprocessed 1 of 1 DPR image(s).",
  "total_files": 1,
  "processed_count": 1,
  "reports": [
    {
      "image_id": "4b68e987-a279-4d69-a1b7-98762744821a",
      "original_filename": "dpr_report_page1.jpg",
      "original_size_bytes": 1048576,
      "original_size_formatted": "1.0 MB",
      "processed_size_bytes": 352104,
      "processed_size_formatted": "343.8 KB",
      "original_dimensions": [2480, 3508],
      "processed_dimensions": [2480, 3508],
      "processing_applied": true,
      "steps_applied": [
        "grayscale_conversion",
        "exif_orientation_correction",
        "deskew_corrected_-1.42_deg",
        "conservative_bilateral_denoise",
        "clahe_contrast_enhancement"
      ],
      "applied_skew_angle": -1.42,
      "quality_metrics": {
        "width": 2480,
        "height": 3508,
        "megapixels": 8.7,
        "mean_brightness": 218.4,
        "contrast_std": 52.1,
        "sharpness_laplacian_var": 320.6,
        "estimated_skew_angle": -1.42,
        "is_blurry": false,
        "is_low_contrast": false,
        "is_underexposed": false,
        "is_overexposed": false,
        "is_low_resolution": false,
        "warnings": [],
        "quality_note": "Quality indicators are approximate heuristics and do not guarantee OCR/HTR accuracy."
      },
      "preview_url": "/api/v1/reports/processed/4b68e987-a279-4d69-a1b7-98762744821a"
    }
  ]
}
```

---

## Known Limitations

1. **Approximate Heuristics**: Quality indicators (Laplacian variance, brightness) evaluate image capture clarity and do not guarantee recognition accuracy.
2. **Small Angle Deskewing**: Tilt detection is intentionally restricted to $[-15.0^\circ, +15.0^\circ]$. Severely rotated documents (e.g., $90^\circ$ or upside down) require EXIF orientation tags or manual orientation correction.
3. **In-Memory Cache**: Processed images reside in a volatile bounded in-memory cache (max 100 items, 1-hour TTL) and are cleared on server restart. No persistent storage or database is used.
4. **No OCR/HTR Execution in Foundation**: In accordance with phase boundaries, no handwriting recognition or character transcription is performed in runtime endpoints.

---

## Phase 10: Model Research & Evaluation

Comprehensive scientific evaluation and hardware benchmark reports for candidate HTR/OCR models are documented under `evaluation/`:

- [PHASE_10_MODEL_EVALUATION.md](evaluation/PHASE_10_MODEL_EVALUATION.md): Full research report detailing model architectures, verified pretraining/fine-tuning datasets, published IAM/scene-text benchmarks, Walvoil DPR field suitability, and local CPU deployment constraints.
- [model_comparison.csv](evaluation/model_comparison.csv): Tabular parameter, latency, memory, and license comparison across PaddleOCR PP-OCRv5 Mobile, Microsoft TrOCR (Base & Small), Tesseract 5, and PyLaia.
- [ground_truth_template.csv](evaluation/ground_truth_template.csv): Standardized ground-truth annotation template for Walvoil DPR header and table cell crops.

---

## Phase 11: Fixed-Template Layout Detection (ASLY-DPR-REV01)

Implements geometric alignment and region segmentation for the Walvoil ASLY-DPR-REV01 form:

1. **Pretrained Pipeline Integration**: Reuses Phase 09 EXIF decoding, tilt estimation, and deskewing.
2. **Anchor Detection**: Isolates outer form boundaries and table grid contours.
3. **Canonical Geometric Alignment**:
   - **5 Header Fields**: Date, Operator's Name, Shift, Bench, Worked Hours.
   - **14 Production Rows × 11 Underlying Columns** = 154 primary table cells.
   - **Column 0 Sub-Rows**: Preserves upper PWH batch and lower Order Number sub-cells (28 sub-row crops).
   - **Footer & Signature**: Operator signature box and revision/control metadata.
   - **Total Granular Regions**: **189 segmented regions**.
4. **Inverse Affine Coordinate Mapping**: Every region provides its bounding box in deskewed coordinates AND an exact 4-point polygon mapped back to the raw, un-rotated camera scan.
5. **Visual Inspection Diagnostics**: Generates color-coded diagnostic overlays saved to `evaluation/diagnostics/` and cached in memory with a preview URL.
6. **Test Suite**: Verified via `test_layout_detection.py` (31 assertions, 100% pass) on both genuine Walvoil DPR sample scans.

---

## Phase 12: Pretrained Handwriting Recognition Evaluation

Empirical benchmark evaluation of candidate pretrained HTR/OCR models on genuine Walvoil DPR sample crops:

- [PHASE_12_RECOGNITION_EVALUATION.md](evaluation/PHASE_12_RECOGNITION_EVALUATION.md): Comprehensive evaluation report comparing Microsoft TrOCR Small, TrOCR Base, and PaddleOCR PP-OCRv5 Mobile across 47 manually verified ground-truth fields.
- [phase_12_model_comparison.csv](evaluation/phase_12_model_comparison.csv): Detailed candidate metrics matrix covering parameter counts, CER/WER on factory samples, CPU latency, memory footprints, and documented failure modes.
- [phase_12_ground_truth_template.csv](evaluation/phase_12_ground_truth_template.csv): Standardized human-inspected ground-truth annotations across genuine DPR samples (`walvoil_dpr_sample_1.jpg` and `walvoil_dpr_sample_2.jpg`).
- [evaluate_recognition.py](evaluation/evaluate_recognition.py): Reproducible evaluation script computing Levenshtein Character Error Rate (CER), Word Error Rate (WER), and field-specific breakdown.
- [phase_12_prediction_results.json](evaluation/phase_12_prediction_results.json): Structured benchmark results output.

---

## Phase 13: Hybrid Handwriting Recognition Integration

Integrates the two selected pretrained recognition models into the FastAPI backend with field-based routing for template ASLY-DPR-REV01:

1. **Pretrained Model Routing**:
   - **Microsoft TrOCR Small (`microsoft/trocr-small-handwritten`)**: Freehand cursive penmanship (Operator Name, Remarks).
   - **PaddleOCR PP-OCRv5 Mobile English (`en_PP-OCRv5_mobile_rec`)**: Numeric strings, 7-digit batch/order numbers (PWH and Ord no), alphanumeric part codes, timestamps, and quantities.
   - **Signature Bypass**: Operator signatures are marked as `status="signature_region"` and bypass text OCR.
2. **Deterministic Pre-Filtering**:
   - Skips empty paper cells (pixel variance < 120.0, dark pixel ratio < 1.5%).
   - Skips cancelled rows (Hough transform diagonal strike-through detection across rows 5–14).
   - Bypasses ~85% of unnecessary inferences on CPU, achieving sub-second response times.
3. **Conservative Verification**:
   - Every returned field carries `needs_review: true` to prevent unverified data entry into manufacturing ERP/MES systems.
4. **Endpoint**: `POST /api/v1/reports/recognize` returns complete structured report data with 14 production rows, Col 0 sub-rows, header, and footer.
5. **Test Suite**: Verified via `test_recognition.py` (56 assertions, 100% pass) on both authentic Walvoil DPR sample scans.

