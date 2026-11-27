/**
 * End-to-End Excel Generation Script for Phase 15 Validation
 *
 * Takes live backend recognition responses for Walvoil DPR Sample 1 and Sample 2,
 * simulates human employee corrections and confirmations, and generates
 * the production .xlsx workbook adhering to ASLY-DPR-REV01.
 */

import fs from 'node:fs';
import path from 'node:path';
import { convertBackendResponseToReportSheet } from './src/utils/recognitionAdapter.ts';
import { generateExcelWorkbook } from './src/utils/excelGenerator.ts';
import type { BackendRecognitionResponse } from './src/services/recognitionApi.ts';
import type { ReportSheetData } from './src/types/report.ts';

const rootDir = process.cwd();
const evalDir = path.join(rootDir, 'backend', 'evaluation');
const sample1JsonPath = path.join(evalDir, 'sample1_rec.json');
const sample2JsonPath = path.join(evalDir, 'sample2_rec.json');
const outputExcelPath = path.join(evalDir, 'e2e_validated_report.xlsx');

// 1. Read live recognition outputs
if (!fs.existsSync(sample1JsonPath) || !fs.existsSync(sample2JsonPath)) {
  console.error(JSON.stringify({ error: 'Missing backend recognition JSON files.' }));
  process.exit(1);
}

const sample1Res: BackendRecognitionResponse = JSON.parse(fs.readFileSync(sample1JsonPath, 'utf-8'));
const sample2Res: BackendRecognitionResponse = JSON.parse(fs.readFileSync(sample2JsonPath, 'utf-8'));

// 2. Convert to frontend ReportSheetData
const sheet1: ReportSheetData = convertBackendResponseToReportSheet(sample1Res, 1, 'sample_img_1');
const sheet2: ReportSheetData = convertBackendResponseToReportSheet(sample2Res, 2, 'sample_img_2');

// 3. Simulate Human Verification & Correction (HITL)
// --- Sheet 1 Modifications ---
// Confirm Operator Name
if (sheet1.headers.metadata?.operatorName) {
  sheet1.headers.metadata.operatorName.isConfirmed = true;
  sheet1.headers.metadata.operatorName.status = 'confirmed';
}
// Confirm Date
if (sheet1.headers.metadata?.date) {
  sheet1.headers.metadata.date.isConfirmed = true;
  sheet1.headers.metadata.date.status = 'confirmed';
}

// Simulate Employee Correction on Row 1 Part Number (ensure verified ground truth '512500254')
const s1Row1Part = sheet1.rows[0].metadata?.partNumber;
const originalPart1 = s1Row1Part?.originalValue || sheet1.rows[0].partNumber;
const correctedPart1 = '512500254';
if (s1Row1Part) {
  s1Row1Part.currentValue = correctedPart1;
  s1Row1Part.isCorrected = true;
  s1Row1Part.status = 'corrected';
}
sheet1.rows[0].partNumber = correctedPart1;

// Simulate Employee Correction on Row 1 Remarks to clarify cursive text 'No cloche'
const s1Row1Remarks = sheet1.rows[0].metadata?.remarks;
if (s1Row1Remarks) {
  s1Row1Remarks.currentValue = 'No cloche';
  s1Row1Remarks.isCorrected = true;
  s1Row1Remarks.status = 'corrected';
}
sheet1.rows[0].remarks = 'No cloche';

// Confirm Row 1 PWH and Ord No
if (sheet1.rows[0].metadata?.pwh) {
  sheet1.rows[0].metadata.pwh.isConfirmed = true;
  sheet1.rows[0].metadata.pwh.status = 'confirmed';
}
if (sheet1.rows[0].metadata?.ordNo) {
  sheet1.rows[0].metadata.ordNo.isConfirmed = true;
  sheet1.rows[0].metadata.ordNo.status = 'confirmed';
}
// Resynchronize batchAndOrder
sheet1.rows[0].batchAndOrder = `PWH: ${sheet1.rows[0].pwh}\nOrd No: ${sheet1.rows[0].ordNo}`;

// --- Sheet 2 Modifications ---
// Confirm Operator Name 'Jogannatha G.N.'
if (sheet2.headers.metadata?.operatorName) {
  sheet2.headers.metadata.operatorName.isConfirmed = true;
  sheet2.headers.metadata.operatorName.status = 'confirmed';
}
// Confirm Row 1 Part Number '1021H0001-A'
if (sheet2.rows[0].metadata?.partNumber) {
  sheet2.rows[0].metadata.partNumber.isConfirmed = true;
  sheet2.rows[0].metadata.partNumber.status = 'confirmed';
}
// Confirm Row 1 Qty '34'
if (sheet2.rows[0].metadata?.qty) {
  sheet2.rows[0].metadata.qty.isConfirmed = true;
  sheet2.rows[0].metadata.qty.status = 'confirmed';
}

// 4. Generate Production Excel Workbook
const reportsDataMap: Record<number, ReportSheetData> = {
  1: sheet1,
  2: sheet2,
};

const result = generateExcelWorkbook(reportsDataMap, 'Walvoil_ASLY_DPR_REV01_E2E.xlsx');

// Convert Blob arrayBuffer to Buffer and save to disk
result.blob.arrayBuffer().then((buffer) => {
  const nodeBuf = Buffer.from(buffer);
  fs.writeFileSync(outputExcelPath, nodeBuf);

  const summary = {
    success: true,
    outputPath: outputExcelPath,
    fileName: result.fileName,
    sheetCount: result.sheetCount,
    sheetNames: result.sheetNames,
    totalRows: result.totalRows,
    totalFlaggedCells: result.totalFlaggedCells,
    fileSizeBytes: nodeBuf.length,
    sheet1Operator: sheet1.headers.operatorName,
    sheet1Row1PartOriginal: originalPart1,
    sheet1Row1PartCorrected: sheet1.rows[0].partNumber,
    sheet2Operator: sheet2.headers.operatorName,
    sheet2Row1Part: sheet2.rows[0].partNumber,
  };

  console.log(JSON.stringify(summary, null, 2));
});

