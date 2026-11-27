# PHASE 14: DPR HUMAN VERIFICATION & CORRECTION INTERFACE REPORT

**Project:** Walvoil Daily Production Report (DPR) Handwriting Digitisation System  
**Document Code:** ASLY-DPR-VERIFICATION-PHASE14  
**Target Template:** ASLY-DPR-REV01  
**Execution Environment:** Windows 11, Node.js v24.16.0, Python 3.12.10, React 19, TypeScript, Vite  

---

## 1. Executive Summary

Phase 14 connects the Phase 13 hybrid handwriting recognition backend to the React review interface, creating a production-grade Human-in-the-Loop (HITL) verification and correction workspace. Factory personnel can inspect the original scanned report side-by-side with recognized values, click any field to highlight its exact physical bounding box, edit misread handwriting directly, and confirm fields before compiling formatted Microsoft Excel spreadsheets.

In strict accordance with project requirements:
- **Direct Recognition API Integration:** The frontend connects to `POST /api/v1/reports/recognize` via configurable environment variable (`VITE_API_URL`, default `http://localhost:8000`).
- **No Fabricated Data:** Authentic OCR/HTR outputs returned by the backend are displayed. Demo data is never injected into real user scans.
- **Strict Coordinate Mapping:** Preserves Phase 11 bounding box and 4-point polygon coordinates. Clicking any field highlights its precise location on the original scan.
- **Conservative Review Lifecycle:** Every recognized field initializes with status `needs_review`. Fields are never marked verified automatically; human approval requires an explicit confirmation action.
- **Separation of OCR Predictions vs. Employee Corrections:** Original OCR transcriptions (`originalValue`) remain stored separately from human corrections (`currentValue`, `isCorrected: true`).
- **Sub-row Separation:** Column 0 displays Batch Number (`PWH`) and Customer Order Number (`Ord no`) as separate editable subfields while automatically keeping `batchAndOrder` synchronized for Excel.
- **Excel Generation Integrity:** Browser-side Excel compilation uses the latest employee-corrected values while preserving the official Walvoil layout and styling.

---

## 2. System Architecture & Component Design

```
┌────────────────────────────────────────────────────────────────────────┐
│                          React Frontend (Phase 14)                     │
│                                                                        │
│  UploadStage ──► POST /api/v1/reports/recognize (FormData)             │
│      │                                                                 │
│      ▼                                                                 │
│  recognitionApi.ts (Configurable VITE_API_URL)                         │
│      │                                                                 │
│      ▼                                                                 │
│  recognitionAdapter.ts                                                 │
│  ├── Maps 5 Header Fields + 14 Table Rows + Signature Footer           │
│  ├── Separates Col 0 PWH and Ord no subfields                          │
│  ├── Preserves Phase 11 deskewedBox & originalCoordinates              │
│  └── Sets initial status: 'needs_review' (HITL conservative policy)    │
│      │                                                                 │
│      ▼                                                                 │
│  ReviewStage.tsx                                                       │
│  ┌───────────────────────────────┬──────────────────────────────────┐  │
│  │ ScanViewer.tsx (Interactive)  │ ReportTable.tsx (Spreadsheet)    │  │
│  │ • Zoom (50% - 300%) & Pan     │ • 5 Header inputs (Date, OP,...) │  │
│  │ • Highlight Overlay with Glow │ • Separate PWH & Ord no inputs   │  │
│  │ • Center-on-Field button      │ • Columns 1-10 editable cells    │  │
│  │ • Stepper: Prev / Next Review │ • Status: Review/Confirmed/Edit  │  │
│  │ • Modal High-Res View         │ • Quick Confirm / Confirm All    │  │
│  └───────────────────────────────┴──────────────────────────────────┘  │
│      │                                                                 │
│      ▼                                                                 │
│  DownloadStage.tsx ──► excelGenerator.ts                               │
│  • Compiles final .xlsx using latest human corrections                 │
│  • Preserves Walvoil merged header layout & verification styling       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Human Verification & Correction Lifecycle

Every cell in the DPR undergoes a deterministic state machine managed by `FieldMetadata`:

| State | Badge / Color | Description | Action Required |
| :--- | :--- | :--- | :--- |
| **`needs_review`** | Amber badge (`!`) | Initial state for all model-recognized fields. | Employee verifies text against scan region. |
| **`confirmed`** | Emerald checkmark (`✓`) | Field approved by employee as accurate without changes. | Ready for Excel export. |
| **`corrected`** | Blue indicator (`✎ Edited`) | Employee modified text. Tooltip reveals `Orig: "<ocr_value>"`. | Ready for Excel export. |
| **`empty`** | Subtle dash (`—`) | Cell verified blank by pre-filter heuristics (variance < 120). | No entry required. |
| **`cancelled`** | Dimmed (`⊘`) | Unused production row crossed out by diagonal cancellation line. | Inferences and edits skipped. |
| **`signature_region`** | Purple badge (`🛡`) | Operator signature box. Click centers viewer for visual sign-off. | Visual verification only; no OCR text generated. |
| **`failed`** | Red alert (`⚠`) | Backend offline or unreadable crop. Allows graceful manual entry. | Employee types value manually. |

---

## 4. Key Implementation Deliverables

1. [**`src/services/recognitionApi.ts`**](file:///d:/Walvoil_New_Project/src/services/recognitionApi.ts):
   - Configurable `VITE_API_URL` environment support.
   - Robust `recognizeReportScan(file)` implementation with HTTP error extraction.
   - Status check endpoint `checkBackendStatus()`.

2. [**`src/utils/recognitionAdapter.ts`**](file:///d:/Walvoil_New_Project/src/utils/recognitionAdapter.ts):
   - Maps backend `DPRRecognitionResponse` to `ReportSheetData`.
   - Populates `originalCoordinates.boundingBox`, 4-point `polygon`, and `deskewedBox`.
   - Partitions Column 0 into separate `pwh` and `ordNo` fields while maintaining synchronized `batchAndOrder`.
   - Validates dates (`DD/MM/YYYY`), timestamps (`HH:MM`), and numeric IDs without modifying raw typed values.

3. [**`src/components/review/ScanViewer.tsx`**](file:///d:/Walvoil_New_Project/src/components/review/ScanViewer.tsx):
   - Interactive zoom ($50\%$ to $300\%$) and smooth mouse drag-to-pan.
   - Floating high-visibility coordinate overlay matching image dimensions with sub-pixel precision.
   - "Center on Selected Field" quick action.
   - "Review Stepper" buttons (`Prev` / `Next`) allowing rapid cycling through all fields needing review.
   - Fullscreen high-resolution inspection modal.

4. [**`src/components/review/ReportTable.tsx`**](file:///d:/Walvoil_New_Project/src/components/review/ReportTable.tsx):
   - Displays all 5 header fields, all 14 production rows, and 11 underlying columns.
   - Column 0 rendered with two dedicated subfield inputs: `PWH:` (Work order batch) and `Ord:` (Customer order).
   - Real-time review counters (`X fields need review`, `Y confirmed`, `Z corrected`).
   - Single-click "Confirm Field", "Confirm Row", and "Confirm All" bulk actions.
   - Focus / click selects the region in `ScanViewer` synchronously.

5. [**`src/App.tsx`**](file:///d:/Walvoil_New_Project/src/App.tsx):
   - Coordinates upload-to-review transition with live progress banner.
   - State handlers for field corrections, confirmation, reverting, row confirmation, and sheet isolation.
   - Guarantees `dataVersion` updates so Excel generation always uses the latest corrections.

---

## 5. Verification & Test Results

A dedicated automated test suite [`test_phase14.ts`](file:///d:/Walvoil_New_Project/test_phase14.ts) was executed via Node.js:

```
======================================================================
PHASE 14: HUMAN VERIFICATION & CORRECTION INTERFACE TEST SUITE
======================================================================

1. Recognition API Payload Conversion & Architecture
  [PASS] Sheet index is 1 
  [PASS] File name preserved 
  [PASS] Alignment confidence matches (0.98) 
  [PASS] Header contains 5 fields 
  [PASS] Row 1 Part number is 512500254 
  [PASS] Initial status is needs_review (no automatic verification) 

2. Column 0 Subfields Separation & batchAndOrder Synchronization
  [PASS] Row 1 PWH subfield extracted separately (2638043) 
  [PASS] Row 1 Ord no subfield extracted separately (1118496) 
  [PASS] batchAndOrder is synchronized for Excel 

3. Coordinate Retention for Scan Highlighting (Phase 11 Coordinates)
  [PASS] Operator Name has deskewedBox coordinates 
  [PASS] Operator Name has originalCoordinates bounding box 
  [PASS] Operator Name has 4-point polygon mapped to scan 
  [PASS] PWH sub-row has boundingBox in raw scan space 

4. Cancelled and Signature Region State Handling
  [PASS] Row 7 detected as cancelled (isCancelled=true) 
  [PASS] Row 7 PWH status is cancelled 
  [PASS] Footer operator sign marked as signature_region 

5. Field Editing & Correction Persistence (Original vs Corrected)
  [PASS] Original value preserved immutably (512500254) 
  [PASS] Current value reflects employee correction 
  [PASS] Original value remains intact 
  [PASS] Status updated to "corrected" 
  [PASS] isCorrected flag is true 

6. Explicit Human Confirmation
  [PASS] Operator Name status transitioned to confirmed 
  [PASS] isConfirmed is true 

7. Sheet Isolation Across Multiple Reports
  [PASS] Sheet 2 operator is Jogannatha G.N. 
  [PASS] Sheet 1 operator remains Kashinatha / Thippanna 
  [PASS] Edits in Sheet 1 row 1 did not affect Sheet 2 

8. Excel Generation Using Employee Corrections
  [PASS] Excel workbook generated successfully 
  [PASS] Sheet count is 2 
  [PASS] Generated filename has .xlsx extension 
  [PASS] Total rows matches 14 * 2 = 28 

9. Non-Mutating Field Format Validation
  [PASS] Valid date (23/09/2026) has no warning 
  [PASS] Malformed date returns non-fatal format warning 
  [PASS] Valid time (06:00) has no warning 
  [PASS] Malformed time returns format warning 
  [PASS] Valid numeric PWH (2638043) has no warning 
  [PASS] Alphabetical PWH returns warning 
  [PASS] Blank value is allowed (returns null) 

======================================================================
PHASE 14 TEST RESULTS: 37 passed, 0 failed out of 37 checks
======================================================================
```

### Full Regression Suite Results
- **Phase 14 Interface Test Suite (`npm test`):** **37/37 passed**
- **Frontend Linter (`npm run lint` / `oxlint`):** **0 errors, 0 warnings** (21 files checked)
- **Frontend Production Build (`npm run build` / `vite build`):** **Completed successfully in 1.75s**
- **Backend Regression Suites:**
  - `test_endpoints.py`: **21/21 passed**
  - `test_preprocessing.py`: **30/30 passed**
  - `test_layout_detection.py`: **31/31 passed**
  - `test_recognition.py`: **56/56 passed**
  - Total backend assertions: **138 passed, 0 failed**

---

## 6. Known Limitations & Operational Guidelines

1. **Local Network Connectivity:** If the backend server (`uvicorn`) is not running or unreachable on port 8000, the frontend displays an informative banner and automatically falls back to manual entry mode without breaking the workflow.
2. **Extreme Camera Perspective Tilts:** Fixed-template layout alignment operates with high precision for tilts up to $\pm 15^\circ$. Photos taken at steep oblique angles ($> 20^\circ$) may exhibit coordinate displacement; operators should take scans as flat and parallel to the paper as possible.
3. **Cursive Ambiguity:** As established in Phase 12, cursive handwritten notes with non-dictionary technical shorthand (e.g., `yal problem`, `No cloche`) may require human verification. The review interface specifically highlights these cells for operator confirmation.

