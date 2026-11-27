/**
 * Walvoil Daily Production Report (DPR) - Excel Workbook Generator
 *
 * Browser-side generator producing formatted Microsoft Excel (.xlsx) workbooks
 * conforming to the Walvoil Final Assembly DPR standard.
 *
 * Utilizes SheetJS (xlsx-js-style) to render column layouts, merged headers,
 * fonts, borders, alignments, and verification highlighting without any backend server.
 */

import XLSX from 'xlsx-js-style';
import type { ReportSheetData, ReportRowData } from '../types/report';

export interface ExcelGenerationResult {
  blob: Blob;
  fileName: string;
  sheetCount: number;
  sheetNames: string[];
  totalRows: number;
  totalFlaggedCells: number;
  generatedAt: Date;
}

// Styling definitions
const STYLES = {
  title: {
    font: { name: 'Calibri', sz: 12, bold: true, color: { rgb: '0F2A4A' } },
    alignment: { vertical: 'center', horizontal: 'left' },
  },
  metaLabel: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '334155' } },
    alignment: { vertical: 'center', horizontal: 'left' },
  },
  metaValue: {
    font: { name: 'Calibri', sz: 10, bold: false, color: { rgb: '0F172A' } },
    alignment: { vertical: 'center', horizontal: 'left' },
  },
  metaValueFlagged: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '92400E' } },
    fill: { fgColor: { rgb: 'FEF3C7' } },
    alignment: { vertical: 'center', horizontal: 'left' },
  },
  tableHeader: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1E293B' } },
    fill: { fgColor: { rgb: 'E2E8F0' } },
    alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: '94A3B8' } },
      bottom: { style: 'thin', color: { rgb: '94A3B8' } },
      left: { style: 'thin', color: { rgb: '94A3B8' } },
      right: { style: 'thin', color: { rgb: '94A3B8' } },
    },
  },
  dataCellLeft: {
    font: { name: 'Calibri', sz: 10, color: { rgb: '0F172A' } },
    alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
      left: { style: 'thin', color: { rgb: 'CBD5E1' } },
      right: { style: 'thin', color: { rgb: 'CBD5E1' } },
    },
  },
  dataCellCenter: {
    font: { name: 'Calibri', sz: 10, color: { rgb: '0F172A' } },
    alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
      left: { style: 'thin', color: { rgb: 'CBD5E1' } },
      right: { style: 'thin', color: { rgb: 'CBD5E1' } },
    },
  },
  dataCellRight: {
    font: { name: 'Calibri', sz: 10, color: { rgb: '0F172A' } },
    alignment: { vertical: 'center', horizontal: 'right', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
      left: { style: 'thin', color: { rgb: 'CBD5E1' } },
      right: { style: 'thin', color: { rgb: 'CBD5E1' } },
    },
  },
  dataCellFlagged: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '92400E' } },
    fill: { fgColor: { rgb: 'FEF3C7' } },
    alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'F59E0B' } },
      bottom: { style: 'thin', color: { rgb: 'F59E0B' } },
      left: { style: 'thin', color: { rgb: 'F59E0B' } },
      right: { style: 'thin', color: { rgb: 'F59E0B' } },
    },
  },
  dataCellFlaggedCenter: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '92400E' } },
    fill: { fgColor: { rgb: 'FEF3C7' } },
    alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'F59E0B' } },
      bottom: { style: 'thin', color: { rgb: 'F59E0B' } },
      left: { style: 'thin', color: { rgb: 'F59E0B' } },
      right: { style: 'thin', color: { rgb: 'F59E0B' } },
    },
  },
  dataCellFlaggedRight: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '92400E' } },
    fill: { fgColor: { rgb: 'FEF3C7' } },
    alignment: { vertical: 'center', horizontal: 'right', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'F59E0B' } },
      bottom: { style: 'thin', color: { rgb: 'F59E0B' } },
      left: { style: 'thin', color: { rgb: 'F59E0B' } },
      right: { style: 'thin', color: { rgb: 'F59E0B' } },
    },
  },
  footerSign: {
    font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: '334155' } },
    alignment: { vertical: 'center', horizontal: 'left' },
  },
  footerGovernance: {
    font: { name: 'Calibri', sz: 9, bold: true, color: { rgb: '475569' } },
    alignment: { vertical: 'center', horizontal: 'left' },
  },
  footerNotice: {
    font: { name: 'Calibri', sz: 8, italic: true, color: { rgb: '94A3B8' } },
    alignment: { vertical: 'center', horizontal: 'left' },
  },
};

const COLUMN_WIDTHS = [
  { wch: 22 }, // Col 0 (A): Batch Number and Order No
  { wch: 12 }, // Col 1 (B): Family
  { wch: 18 }, // Col 2 (C): Part Number
  { wch: 10 }, // Col 3 (D): Time Start
  { wch: 10 }, // Col 4 (E): Time End
  { wch: 12 }, // Col 5 (F): Qty in no's
  { wch: 24 }, // Col 6 (G): Remarks
  { wch: 15 }, // Col 7 (H): Idle time code
  { wch: 14 }, // Col 8 (I): Idle Time From
  { wch: 14 }, // Col 9 (J): Idle Time To
  { wch: 14 }, // Col 10 (K): Total time
];

const TOTAL_FORM_ROWS = 14;

/**
 * Creates an individual Walvoil DPR Worksheet conforming to physical sheet layout
 */
function createWorksheetForReport(report: ReportSheetData): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];

  // Helper to place styled cells
  const setCell = (
    r: number,
    c: number,
    val: string | number | undefined | null,
    style: object
  ) => {
    const cellRef = XLSX.utils.encode_cell({ r, c });
    if (val !== undefined && val !== null && val !== '') {
      ws[cellRef] = {
        v: val,
        t: typeof val === 'number' ? 'n' : 's',
        s: style,
      };
    } else {
      // Keep empty cells genuinely blank with required cell borders
      ws[cellRef] = {
        v: '',
        t: 's',
        s: style,
      };
    }
  };

  // --- Row 0: Sheet Title Banner ---
  setCell(0, 0, 'WALVOIL – DAILY PRODUCTION REPORT (FINAL ASSEMBLY)', STYLES.title);
  for (let c = 1; c <= 10; c++) {
    setCell(0, c, '', STYLES.title);
  }
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } });

  // --- Row 1: Spacer ---

  // --- Row 2: Metadata 1 (Date, Operator, Shift, Bench) ---
  setCell(2, 0, 'Date:', STYLES.metaLabel);
  setCell(
    2,
    1,
    report.headers.date,
    report.headers.flaggedFields?.date ? STYLES.metaValueFlagged : STYLES.metaValue
  );

  setCell(2, 3, "Operator's Name:", STYLES.metaLabel);
  setCell(
    2,
    4,
    report.headers.operatorName,
    report.headers.flaggedFields?.operatorName ? STYLES.metaValueFlagged : STYLES.metaValue
  );

  setCell(2, 7, 'Shift:', STYLES.metaLabel);
  setCell(
    2,
    8,
    report.headers.shift,
    report.headers.flaggedFields?.shift ? STYLES.metaValueFlagged : STYLES.metaValue
  );

  setCell(2, 9, 'Bench:', STYLES.metaLabel);
  setCell(
    2,
    10,
    report.headers.bench,
    report.headers.flaggedFields?.bench ? STYLES.metaValueFlagged : STYLES.metaValue
  );

  // --- Row 3: Metadata 2 (Worked Hours) ---
  setCell(3, 0, 'Worked Hours:', STYLES.metaLabel);
  setCell(
    3,
    1,
    report.headers.workedHours,
    report.headers.flaggedFields?.workedHours ? STYLES.metaValueFlagged : STYLES.metaValue
  );

  // --- Row 4: Spacer ---

  // --- Rows 5 & 6: Table Headers (Grouped Columns) ---
  // Col 0 (A): Batch Number and Order No
  setCell(5, 0, 'Batch Number and\nOrder No', STYLES.tableHeader);
  setCell(6, 0, '', STYLES.tableHeader);
  merges.push({ s: { r: 5, c: 0 }, e: { r: 6, c: 0 } });

  // Col 1 (B): Family
  setCell(5, 1, 'Family', STYLES.tableHeader);
  setCell(6, 1, '', STYLES.tableHeader);
  merges.push({ s: { r: 5, c: 1 }, e: { r: 6, c: 1 } });

  // Col 2 (C): Part Number
  setCell(5, 2, 'Part Number', STYLES.tableHeader);
  setCell(6, 2, '', STYLES.tableHeader);
  merges.push({ s: { r: 5, c: 2 }, e: { r: 6, c: 2 } });

  // Col 3 & 4 (D & E): Time Header spanning Start and End
  setCell(5, 3, 'Time', STYLES.tableHeader);
  setCell(5, 4, '', STYLES.tableHeader);
  merges.push({ s: { r: 5, c: 3 }, e: { r: 5, c: 4 } });
  setCell(6, 3, 'Start', STYLES.tableHeader);
  setCell(6, 4, 'End', STYLES.tableHeader);

  // Col 5 (F): Qty in no's
  setCell(5, 5, "Qty in\nno's", STYLES.tableHeader);
  setCell(6, 5, '', STYLES.tableHeader);
  merges.push({ s: { r: 5, c: 5 }, e: { r: 6, c: 5 } });

  // Col 6 (G): Remarks
  setCell(5, 6, 'Remarks', STYLES.tableHeader);
  setCell(6, 6, '', STYLES.tableHeader);
  merges.push({ s: { r: 5, c: 6 }, e: { r: 6, c: 6 } });

  // Col 7 (H): Idle time code
  setCell(5, 7, 'Idle time\ncode', STYLES.tableHeader);
  setCell(6, 7, '', STYLES.tableHeader);
  merges.push({ s: { r: 5, c: 7 }, e: { r: 6, c: 7 } });

  // Col 8 (I): Idle Time From
  setCell(5, 8, 'Idle Time\nFrom', STYLES.tableHeader);
  setCell(6, 8, '', STYLES.tableHeader);
  merges.push({ s: { r: 5, c: 8 }, e: { r: 6, c: 8 } });

  // Col 9 (J): Idle Time To
  setCell(5, 9, 'Idle Time\nTo', STYLES.tableHeader);
  setCell(6, 9, '', STYLES.tableHeader);
  merges.push({ s: { r: 5, c: 9 }, e: { r: 6, c: 9 } });

  // Col 10 (K): Total time
  setCell(5, 10, 'Total\ntime', STYLES.tableHeader);
  setCell(6, 10, '', STYLES.tableHeader);
  merges.push({ s: { r: 5, c: 10 }, e: { r: 6, c: 10 } });

  // --- Rows 7 to 20: 14 Data Rows ---
  const rows = report.rows || [];
  for (let i = 0; i < TOTAL_FORM_ROWS; i++) {
    const rowIndex = 7 + i;
    const rowData: Partial<ReportRowData> = rows[i] || {};
    const flags = rowData.flaggedFields || {};

    // Col 0: Batch Number & Order No (preserves separate PWH and Ord No subfields)
    const batchAndOrderValue =
      rowData.batchAndOrder ||
      (rowData.pwh || rowData.ordNo
        ? `PWH: ${rowData.pwh || ''}\nOrd No: ${rowData.ordNo || ''}`
        : '');
    setCell(
      rowIndex,
      0,
      batchAndOrderValue,
      flags.batchAndOrder ? STYLES.dataCellFlagged : STYLES.dataCellLeft
    );

    // Col 1: Family
    setCell(
      rowIndex,
      1,
      rowData.family,
      flags.family ? STYLES.dataCellFlaggedCenter : STYLES.dataCellCenter
    );

    // Col 2: Part Number
    setCell(
      rowIndex,
      2,
      rowData.partNumber,
      flags.partNumber ? STYLES.dataCellFlaggedCenter : STYLES.dataCellCenter
    );

    // Col 3: Time Start
    setCell(
      rowIndex,
      3,
      rowData.timeStart,
      flags.timeStart ? STYLES.dataCellFlaggedCenter : STYLES.dataCellCenter
    );

    // Col 4: Time End
    setCell(
      rowIndex,
      4,
      rowData.timeEnd,
      flags.timeEnd ? STYLES.dataCellFlaggedCenter : STYLES.dataCellCenter
    );

    // Col 5: Qty in no's
    setCell(
      rowIndex,
      5,
      rowData.qty,
      flags.qty ? STYLES.dataCellFlaggedRight : STYLES.dataCellRight
    );

    // Col 6: Remarks
    setCell(
      rowIndex,
      6,
      rowData.remarks,
      flags.remarks ? STYLES.dataCellFlagged : STYLES.dataCellLeft
    );

    // Col 7: Idle time code
    setCell(
      rowIndex,
      7,
      rowData.idleCode,
      flags.idleCode ? STYLES.dataCellFlaggedCenter : STYLES.dataCellCenter
    );

    // Col 8: Idle Time From
    setCell(
      rowIndex,
      8,
      rowData.idleFrom,
      flags.idleFrom ? STYLES.dataCellFlaggedCenter : STYLES.dataCellCenter
    );

    // Col 9: Idle Time To
    setCell(
      rowIndex,
      9,
      rowData.idleTo,
      flags.idleTo ? STYLES.dataCellFlaggedCenter : STYLES.dataCellCenter
    );

    // Col 10: Total time
    setCell(
      rowIndex,
      10,
      rowData.totalTime,
      flags.totalTime ? STYLES.dataCellFlaggedRight : STYLES.dataCellRight
    );
  }

  // --- Row 21: Spacer ---

  // --- Row 22: Operator sign ---
  setCell(22, 0, 'Operator sign:', STYLES.metaLabel);
  setCell(22, 1, report.operatorSign || '', STYLES.footerSign);

  // --- Row 23: Spacer ---

  // --- Row 24: Governance Footer ---
  setCell(24, 0, `Issued by: ${report.issuedBy || 'ASLY'}`, STYLES.footerGovernance);
  setCell(24, 3, `Controlled by: ${report.controlledBy || 'IMS'}`, STYLES.footerGovernance);
  setCell(24, 6, `Revision: ${report.revision || '01'}`, STYLES.footerGovernance);
  setCell(24, 9, `Approved by: ${report.approvedBy || 'MGT'}`, STYLES.footerGovernance);

  // --- Row 25: Prototype & Audit Notice ---
  const noticeText = report.isDemoData
    ? '[NOTE: Demonstration Sample Dataset — Production OCR pipeline will populate extracted figures]'
    : `[Walvoil Fluid Power — Digital Log Export: ${report.fileName || 'Scanned DPR'}]`;
  setCell(25, 0, noticeText, STYLES.footerNotice);
  merges.push({ s: { r: 25, c: 0 }, e: { r: 25, c: 10 } });

  // Apply column widths, merges, and overall range
  ws['!cols'] = COLUMN_WIDTHS;
  ws['!merges'] = merges;
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 25, c: 10 } });

  // Explicit row heights for professional factory office view
  ws['!rows'] = [
    { hpt: 26 }, // Row 0: Title
    { hpt: 8 },  // Row 1: Spacer
    { hpt: 20 }, // Row 2: Metadata 1
    { hpt: 20 }, // Row 3: Metadata 2
    { hpt: 8 },  // Row 4: Spacer
    { hpt: 22 }, // Row 5: Table Header 1
    { hpt: 18 }, // Row 6: Table Header 2
    // Rows 7-20: 14 Data Rows
    ...Array(TOTAL_FORM_ROWS).fill({ hpt: 24 }),
    { hpt: 8 },  // Row 21: Spacer
    { hpt: 20 }, // Row 22: Operator Sign
    { hpt: 8 },  // Row 23: Spacer
    { hpt: 20 }, // Row 24: Governance Footer
    { hpt: 16 }, // Row 25: Audit Notice
  ];

  return ws;
}

/**
 * Sanitizes worksheet name to comply with Microsoft Excel constraints:
 * - Max 31 characters
 * - Excludes forbidden characters: \ / ? * : [ ]
 * - Guarantees uniqueness across sheets in the same workbook
 */
function getUniqueSheetName(
  proposedName: string,
  fallbackIndex: number,
  usedNames: Set<string>
): string {
  // Strip Excel forbidden characters
  let clean = proposedName.replace(/[\\/?*:[\]]/g, ' ').trim();
  // Ensure non-empty
  if (!clean) {
    clean = `Report ${fallbackIndex}`;
  }
  // Truncate to 31 chars
  clean = clean.substring(0, 31);

  let uniqueName = clean;
  let counter = 1;
  while (usedNames.has(uniqueName.toLowerCase())) {
    const suffix = `_${counter}`;
    const maxBaseLen = 31 - suffix.length;
    uniqueName = `${clean.substring(0, maxBaseLen)}${suffix}`;
    counter++;
  }

  usedNames.add(uniqueName.toLowerCase());
  return uniqueName;
}

/**
 * Generates an Excel workbook (.xlsx) from the latest reviewed reportsData dictionary
 */
export function generateExcelWorkbook(
  reportsData: Record<number, ReportSheetData>,
  customFileName?: string
): ExcelGenerationResult {
  const sheets = Object.values(reportsData).sort((a, b) => a.sheetIndex - b.sheetIndex);

  if (sheets.length === 0) {
    throw new Error('No report sheet data available to generate Excel workbook.');
  }

  const wb = XLSX.utils.book_new();
  const sheetNames: string[] = [];
  const usedSheetNames = new Set<string>();
  let totalFlaggedCells = 0;
  let totalRows = 0;

  sheets.forEach((sheet) => {
    const rawName = sheet.sheetName || `Report ${sheet.sheetIndex}`;
    const wsName = getUniqueSheetName(rawName, sheet.sheetIndex, usedSheetNames);
    sheetNames.push(wsName);

    // Count flagged cells
    if (sheet.headers.flaggedFields) {
      totalFlaggedCells += Object.values(sheet.headers.flaggedFields).filter(Boolean).length;
    }
    sheet.rows.forEach((row) => {
      totalRows += 1;
      if (row.flaggedFields) {
        totalFlaggedCells += Object.values(row.flaggedFields).filter(Boolean).length;
      }
    });

    const ws = createWorksheetForReport(sheet);
    XLSX.utils.book_append_sheet(wb, ws, wsName);
  });

  // Write workbook to raw binary array
  const wbout = XLSX.write(wb, {
    bookType: 'xlsx',
    type: 'array',
  });

  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const fileName = customFileName || 'Walvoil_Daily_Production_Report.xlsx';

  return {
    blob,
    fileName,
    sheetCount: sheets.length,
    sheetNames,
    totalRows,
    totalFlaggedCells,
    generatedAt: new Date(),
  };
}

/**
 * Triggers native browser download and safely cleans up temporary object URL
 */
export function downloadExcelFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Clean up object URL after download trigger
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
