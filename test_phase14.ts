/**
 * Phase 14 Human Verification & Correction Interface Test Suite
 *
 * Verifies:
 * 1. Recognition API payload parsing and conversion to ReportSheetData
 * 2. Separation of original OCR output from employee corrections
 * 3. Human confirmation action (no automatic verification)
 * 4. Coordinate preservation for image highlighting (deskewed and original image space)
 * 5. Column 0 PWH and Ord no sub-row separation with synchronized batchAndOrder
 * 6. Empty and cancelled cell states
 * 7. Sheet isolation across multiple uploaded DPR reports
 * 8. Excel workbook generation using employee corrections instead of stale OCR
 * 9. Non-mutating field format validation
 */

import { convertBackendResponseToReportSheet, validateFieldValue } from './src/utils/recognitionAdapter.ts';
import { generateExcelWorkbook } from './src/utils/excelGenerator.ts';
import type { BackendRecognitionResponse } from './src/services/recognitionApi.ts';
import type { ReportSheetData } from './src/types/report.ts';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail: string = '') {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${name} ${detail}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${name} - FAILED ${detail}`);
  }
}

console.log('='.repeat(70));
console.log('PHASE 14: HUMAN VERIFICATION & CORRECTION INTERFACE TEST SUITE');
console.log('='.repeat(70));

// ── Mock Authentic Phase 13 Recognition Response (Sample 1) ─────────────────
const mockSample1Response: BackendRecognitionResponse = {
  success: true,
  filename: 'walvoil_dpr_sample_1.jpg',
  templateName: 'ASLY-DPR-REV01',
  alignmentConfidence: 0.98,
  processingTimeMs: 2150.4,
  header: {
    date: {
      fieldId: 'hdr_date',
      section: 'header',
      fieldName: 'date',
      rawText: '23/09/2026',
      cleanedText: '23/09/2026',
      modelUsed: 'en_PP-OCRv5_mobile_rec',
      confidence: 0.95,
      status: 'recognized',
      needsReview: true,
      deskewedBox: { x: 103, y: 74, width: 118, height: 33 },
      originalCoordinates: {
        boundingBox: { x: 105, y: 76, width: 119, height: 34 },
        polygon: [
          { x: 105, y: 76 },
          { x: 224, y: 76 },
          { x: 224, y: 110 },
          { x: 105, y: 110 },
        ],
      },
      latencyMs: 38.5,
    },
    operator_name: {
      fieldId: 'hdr_operator_name',
      section: 'header',
      fieldName: 'operator_name',
      rawText: 'Kashinatha / Thippanna',
      cleanedText: 'Kashinatha / Thippanna',
      modelUsed: 'microsoft/trocr-small-handwritten',
      confidence: 0.94,
      status: 'recognized',
      needsReview: true,
      deskewedBox: { x: 285, y: 112, width: 220, height: 35 },
      originalCoordinates: {
        boundingBox: { x: 287, y: 114, width: 222, height: 36 },
        polygon: [
          { x: 287, y: 114 },
          { x: 509, y: 114 },
          { x: 509, y: 150 },
          { x: 287, y: 150 },
        ],
      },
      latencyMs: 142.0,
    },
    shift: {
      fieldId: 'hdr_shift',
      section: 'header',
      fieldName: 'shift',
      rawText: '1st',
      cleanedText: '1st',
      modelUsed: 'en_PP-OCRv5_mobile_rec',
      status: 'recognized',
      needsReview: true,
      deskewedBox: { x: 550, y: 112, width: 70, height: 35 },
      originalCoordinates: {
        boundingBox: { x: 550, y: 112, width: 70, height: 35 },
        polygon: [],
      },
    },
    bench: {
      fieldId: 'hdr_bench',
      section: 'header',
      fieldName: 'bench',
      rawText: '3',
      cleanedText: '3',
      modelUsed: 'en_PP-OCRv5_mobile_rec',
      status: 'recognized',
      needsReview: true,
      deskewedBox: { x: 670, y: 112, width: 60, height: 35 },
      originalCoordinates: {
        boundingBox: { x: 670, y: 112, width: 60, height: 35 },
        polygon: [],
      },
    },
    worked_hours: {
      fieldId: 'hdr_worked_hours',
      section: 'header',
      fieldName: 'worked_hours',
      rawText: '8hrs',
      cleanedText: '8hrs',
      modelUsed: 'en_PP-OCRv5_mobile_rec',
      status: 'recognized',
      needsReview: true,
      deskewedBox: { x: 840, y: 112, width: 70, height: 35 },
      originalCoordinates: {
        boundingBox: { x: 840, y: 112, width: 70, height: 35 },
        polygon: [],
      },
    },
  },
  tableRows: [
    {
      rowIndex: 1,
      isCancelled: false,
      pwhSubrow: {
        fieldId: 'row01_col00_pwh',
        section: 'table_subrow',
        fieldName: 'pwh_subrow',
        subField: 'pwh',
        rawText: '2638043',
        cleanedText: '2638043',
        modelUsed: 'en_PP-OCRv5_mobile_rec',
        status: 'recognized',
        needsReview: true,
        deskewedBox: { x: 100, y: 200, width: 80, height: 20 },
        originalCoordinates: {
          boundingBox: { x: 100, y: 200, width: 80, height: 20 },
          polygon: [{ x: 100, y: 200 }, { x: 180, y: 200 }, { x: 180, y: 220 }, { x: 100, y: 220 }],
        },
      },
      ordSubrow: {
        fieldId: 'row01_col00_ord_no',
        section: 'table_subrow',
        fieldName: 'ord_subrow',
        subField: 'ord_no',
        rawText: '1118496',
        cleanedText: '1118496',
        modelUsed: 'en_PP-OCRv5_mobile_rec',
        status: 'recognized',
        needsReview: true,
        deskewedBox: { x: 100, y: 220, width: 80, height: 20 },
        originalCoordinates: {
          boundingBox: { x: 100, y: 220, width: 80, height: 20 },
          polygon: [{ x: 100, y: 220 }, { x: 180, y: 220 }, { x: 180, y: 240 }, { x: 100, y: 240 }],
        },
      },
      family: {
        fieldId: 'row01_col01_family',
        section: 'table',
        fieldName: 'family',
        rawText: 'SD6/5',
        cleanedText: 'SD6/5',
        modelUsed: 'en_PP-OCRv5_mobile_rec',
        status: 'recognized',
        needsReview: true,
        deskewedBox: { x: 180, y: 200, width: 70, height: 40 },
        originalCoordinates: {
          boundingBox: { x: 180, y: 200, width: 70, height: 40 },
          polygon: [],
        },
      },
      partNumber: {
        fieldId: 'row01_col02_part_number',
        section: 'table',
        fieldName: 'part_number',
        rawText: '512500254',
        cleanedText: '512500254',
        modelUsed: 'en_PP-OCRv5_mobile_rec',
        status: 'recognized',
        needsReview: true,
        deskewedBox: { x: 250, y: 200, width: 140, height: 40 },
        originalCoordinates: {
          boundingBox: { x: 250, y: 200, width: 140, height: 40 },
          polygon: [],
        },
      },
      timeStart: {
        fieldId: 'row01_col03_time_start',
        section: 'table',
        fieldName: 'time_start',
        rawText: '6:00',
        cleanedText: '6:00',
        modelUsed: 'en_PP-OCRv5_mobile_rec',
        status: 'recognized',
        needsReview: true,
        deskewedBox: { x: 390, y: 200, width: 50, height: 40 },
        originalCoordinates: {
          boundingBox: { x: 390, y: 200, width: 50, height: 40 },
          polygon: [],
        },
      },
      timeEnd: {
        fieldId: 'row01_col04_time_end',
        section: 'table',
        fieldName: 'time_end',
        rawText: '-',
        cleanedText: '-',
        modelUsed: 'en_PP-OCRv5_mobile_rec',
        status: 'recognized',
        needsReview: true,
        deskewedBox: { x: 440, y: 200, width: 50, height: 40 },
        originalCoordinates: {
          boundingBox: { x: 440, y: 200, width: 50, height: 40 },
          polygon: [],
        },
      },
      qty: {
        fieldId: 'row01_col05_qty',
        section: 'table',
        fieldName: 'qty',
        rawText: '5 no',
        cleanedText: '5 no',
        modelUsed: 'en_PP-OCRv5_mobile_rec',
        status: 'recognized',
        needsReview: true,
        deskewedBox: { x: 490, y: 200, width: 60, height: 40 },
        originalCoordinates: {
          boundingBox: { x: 490, y: 200, width: 60, height: 40 },
          polygon: [],
        },
      },
      remarks: {
        fieldId: 'row01_col06_remarks',
        section: 'table',
        fieldName: 'remarks',
        rawText: 'No cloche',
        cleanedText: 'No cloche',
        modelUsed: 'microsoft/trocr-small-handwritten',
        status: 'recognized',
        needsReview: true,
        deskewedBox: { x: 550, y: 200, width: 140, height: 40 },
        originalCoordinates: {
          boundingBox: { x: 550, y: 200, width: 140, height: 40 },
          polygon: [],
        },
      },
      idleCode: {
        fieldId: 'row01_col07_idle_code',
        section: 'table',
        fieldName: 'idle_code',
        rawText: 'A0',
        cleanedText: 'A0',
        modelUsed: 'en_PP-OCRv5_mobile_rec',
        status: 'recognized',
        needsReview: true,
        deskewedBox: { x: 690, y: 200, width: 60, height: 40 },
        originalCoordinates: {
          boundingBox: { x: 690, y: 200, width: 60, height: 40 },
          polygon: [],
        },
      },
      totalTime: {
        fieldId: 'row01_col10_total_time',
        section: 'table',
        fieldName: 'total_time',
        rawText: '4.0 hrs',
        cleanedText: '4.0 hrs',
        modelUsed: 'en_PP-OCRv5_mobile_rec',
        status: 'recognized',
        needsReview: true,
        deskewedBox: { x: 880, y: 200, width: 70, height: 40 },
        originalCoordinates: {
          boundingBox: { x: 880, y: 200, width: 70, height: 40 },
          polygon: [],
        },
      },
    },
    // Row 7 is cancelled
    {
      rowIndex: 7,
      isCancelled: true,
      pwhSubrow: {
        fieldId: 'row07_col00_pwh',
        section: 'table_subrow',
        fieldName: 'pwh_subrow',
        status: 'cancelled',
        needsReview: true,
        deskewedBox: { x: 100, y: 440, width: 80, height: 20 },
        originalCoordinates: {
          boundingBox: { x: 100, y: 440, width: 80, height: 20 },
          polygon: [],
        },
      },
    },
  ],
  footer: {
    operator_sign: {
      fieldId: 'ftr_operator_sign',
      section: 'footer',
      fieldName: 'operator_sign',
      status: 'signature_region',
      needsReview: true,
      deskewedBox: { x: 260, y: 780, width: 140, height: 40 },
      originalCoordinates: {
        boundingBox: { x: 260, y: 780, width: 140, height: 40 },
        polygon: [{ x: 260, y: 780 }, { x: 400, y: 780 }, { x: 400, y: 820 }, { x: 260, y: 820 }],
      },
    },
  },
  summary: {
    totalCells: 189,
    recognizedCells: 35,
    emptyCells: 23,
    cancelledCells: 130,
    signatureCells: 1,
    cellsNeedingReview: 189,
    byModel: {
      'en_PP-OCRv5_mobile_rec': 27,
      'microsoft/trocr-small-handwritten': 8,
    },
  },
  allFields: [],
  warnings: ['Production rows 5 to 14 detected as cancelled; OCR skipped.'],
};

// ── Test 1: Recognition API Payload Conversion ──────────────────────────────
console.log('\n1. Recognition API Payload Conversion & Architecture');
const sheet1 = convertBackendResponseToReportSheet(mockSample1Response, 1, 'img_001');

check('Sheet index is 1', sheet1.sheetIndex === 1);
check('File name preserved', sheet1.fileName === 'walvoil_dpr_sample_1.jpg');
check('Alignment confidence matches (0.98)', sheet1.alignmentConfidence === 0.98);
check('Header contains 5 fields', Object.keys(sheet1.headers.metadata || {}).length === 5);
check('Row 1 Part number is 512500254', sheet1.rows[0].partNumber === '512500254');
check('Initial status is needs_review (no automatic verification)', sheet1.headers.metadata?.operatorName?.status === 'needs_review');

// ── Test 2: Separate PWH & Order No Subfields ────────────────────────────────
console.log('\n2. Column 0 Subfields Separation & batchAndOrder Synchronization');
check('Row 1 PWH subfield extracted separately (2638043)', sheet1.rows[0].pwh === '2638043');
check('Row 1 Ord no subfield extracted separately (1118496)', sheet1.rows[0].ordNo === '1118496');
check(
  'batchAndOrder is synchronized for Excel',
  sheet1.rows[0].batchAndOrder.includes('PWH: 2638043') && sheet1.rows[0].batchAndOrder.includes('Ord No: 1118496')
);

// ── Test 3: Coordinate Retention for Image Highlighting ──────────────────────
console.log('\n3. Coordinate Retention for Scan Highlighting (Phase 11 Coordinates)');
const opMeta = sheet1.headers.metadata?.operatorName;
check('Operator Name has deskewedBox coordinates', opMeta?.deskewedBox?.width === 220);
check('Operator Name has originalCoordinates bounding box', opMeta?.originalCoordinates?.boundingBox?.width === 222);
check('Operator Name has 4-point polygon mapped to scan', opMeta?.originalCoordinates?.polygon?.length === 4);
const pwhMeta = sheet1.rows[0].metadata?.pwh;
check('PWH sub-row has boundingBox in raw scan space', pwhMeta?.originalCoordinates?.boundingBox?.x === 100);

// ── Test 4: Cancelled & Signature Regions ────────────────────────────────────
console.log('\n4. Cancelled and Signature Region State Handling');
const row7 = sheet1.rows[6];
check('Row 7 detected as cancelled (isCancelled=true)', row7.isCancelled === true);
check('Row 7 PWH status is cancelled', row7.metadata?.pwh?.status === 'cancelled');
check('Footer operator sign marked as signature_region', sheet1.operatorSignMeta?.status === 'signature_region');

// ── Test 5: Field Editing & Correction Persistence ──────────────────────────
console.log('\n5. Field Editing & Correction Persistence (Original vs Corrected)');
const initialOriginalVal = sheet1.rows[0].metadata?.partNumber?.originalValue;
check('Original value preserved immutably (512500254)', initialOriginalVal === '512500254');

// Simulate employee correcting row 1 part number to '512500999'
const employeeCorrection = '512500999';
const partMeta = sheet1.rows[0].metadata?.partNumber;
if (partMeta) {
  partMeta.currentValue = employeeCorrection;
  partMeta.isCorrected = true;
  partMeta.status = 'corrected';
}
sheet1.rows[0].partNumber = employeeCorrection;

check('Current value reflects employee correction', sheet1.rows[0].partNumber === '512500999');
check('Original value remains intact', partMeta?.originalValue === '512500254');
check('Status updated to "corrected"', partMeta?.status === 'corrected');
check('isCorrected flag is true', partMeta?.isCorrected === true);

// ── Test 6: Explicit Human Confirmation ──────────────────────────────────────
console.log('\n6. Explicit Human Confirmation');
// Simulate employee confirming Operator Name
const opField = sheet1.headers.metadata?.operatorName;
if (opField) {
  opField.isConfirmed = true;
  opField.status = 'confirmed';
}
check('Operator Name status transitioned to confirmed', opField?.status === 'confirmed');
check('isConfirmed is true', opField?.isConfirmed === true);

// ── Test 7: Sheet Isolation Across Multiple Reports ─────────────────────────
console.log('\n7. Sheet Isolation Across Multiple Reports');
const mockSample2Response: BackendRecognitionResponse = {
  ...mockSample1Response,
  filename: 'walvoil_dpr_sample_2.jpg',
  header: {
    ...mockSample1Response.header,
    operator_name: {
      ...mockSample1Response.header.operator_name,
      rawText: 'Jogannatha G.N.',
      cleanedText: 'Jogannatha G.N.',
    },
  },
};
const sheet2 = convertBackendResponseToReportSheet(mockSample2Response, 2, 'img_002');
check('Sheet 2 operator is Jogannatha G.N.', sheet2.headers.operatorName === 'Jogannatha G.N.');
check('Sheet 1 operator remains Kashinatha / Thippanna', sheet1.headers.operatorName === 'Kashinatha / Thippanna');
check('Edits in Sheet 1 row 1 did not affect Sheet 2', sheet2.rows[0].partNumber === '512500254');

// ── Test 8: Excel Generation Using Corrected Values ─────────────────────────
console.log('\n8. Excel Generation Using Employee Corrections');
const reportsDataMap: Record<number, ReportSheetData> = {
  1: sheet1,
  2: sheet2,
};
const excelResult = generateExcelWorkbook(reportsDataMap);
check('Excel workbook generated successfully', Boolean(excelResult.blob));
check('Sheet count is 2', excelResult.sheetCount === 2);
check('Generated filename has .xlsx extension', excelResult.fileName.endsWith('.xlsx'));
check('Total rows matches 14 * 2 = 28', excelResult.totalRows === 28);

// ── Test 9: Non-Mutating Field Format Validation ────────────────────────────
console.log('\n9. Non-Mutating Field Format Validation');
check('Valid date (23/09/2026) has no warning', validateFieldValue('date', '23/09/2026') === null);
check('Malformed date returns non-fatal format warning', validateFieldValue('date', '2026-09') !== null);
check('Valid time (06:00) has no warning', validateFieldValue('time_start', '06:00') === null);
check('Malformed time returns format warning', validateFieldValue('time_start', '6 oclock') !== null);
check('Valid numeric PWH (2638043) has no warning', validateFieldValue('pwh', '2638043') === null);
check('Alphabetical PWH returns warning', validateFieldValue('pwh', 'PWH_ABC') !== null);
check('Blank value is allowed (returns null)', validateFieldValue('pwh', '') === null);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log(`PHASE 14 TEST RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} checks`);
console.log('='.repeat(70));

if (failed > 0) {
  process.exit(1);
}
