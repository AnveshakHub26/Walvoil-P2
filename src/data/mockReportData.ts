/**
 * Walvoil ASLY-DPR-REV01 (Final Assembly) Report Data Templates
 *
 * Provides factory initializers for empty Daily Production Report sheets.
 * Zero hardcoded or synthetic production data is injected.
 */

import type {
  ReportSheetData,
  ReportRowData,
} from '../types/report';

const TOTAL_FORM_ROWS = 14;

export function createEmptyRow(rowIndex: number): ReportRowData {
  const rowNum = rowIndex + 1;
  return {
    id: `row-${rowNum}`,
    rowIndex: rowNum,
    isCancelled: false,
    pwh: '',
    ordNo: '',
    batchAndOrder: '',
    family: '',
    partNumber: '',
    timeStart: '',
    timeEnd: '',
    qty: '',
    remarks: '',
    idleCode: '',
    idleFrom: '',
    idleTo: '',
    totalTime: '',
    flaggedFields: {},
    metadata: {
      pwh: {
        fieldId: `row${String(rowNum).padStart(2, '0')}_col00_pwh`,
        fieldName: 'pwh',
        section: 'table_subrow',
        originalValue: '',
        currentValue: '',
        status: 'empty',
        isCorrected: false,
        isConfirmed: false,
      },
      ordNo: {
        fieldId: `row${String(rowNum).padStart(2, '0')}_col00_ord_no`,
        fieldName: 'ord_no',
        section: 'table_subrow',
        originalValue: '',
        currentValue: '',
        status: 'empty',
        isCorrected: false,
        isConfirmed: false,
      },
    },
  };
}

export function createEmptyReportSheet(
  sheetIndex: number,
  fileName: string = `Report_${sheetIndex}.jpg`,
  fileId?: string
): ReportSheetData {
  const rows: ReportRowData[] = Array.from({ length: TOTAL_FORM_ROWS }, (_, i) =>
    createEmptyRow(i)
  );

  return {
    sheetIndex,
    sheetName: `Report ${sheetIndex}`,
    fileName,
    fileId,
    headers: {
      date: '',
      operatorName: '',
      shift: '',
      bench: '',
      workedHours: '',
      flaggedFields: {},
      metadata: {
        date: {
          fieldId: 'hdr_date',
          fieldName: 'date',
          section: 'header',
          originalValue: '',
          currentValue: '',
          status: 'empty',
          isCorrected: false,
          isConfirmed: false,
        },
        operatorName: {
          fieldId: 'hdr_operator_name',
          fieldName: 'operator_name',
          section: 'header',
          originalValue: '',
          currentValue: '',
          status: 'empty',
          isCorrected: false,
          isConfirmed: false,
        },
        shift: {
          fieldId: 'hdr_shift',
          fieldName: 'shift',
          section: 'header',
          originalValue: '',
          currentValue: '',
          status: 'empty',
          isCorrected: false,
          isConfirmed: false,
        },
        bench: {
          fieldId: 'hdr_bench',
          fieldName: 'bench',
          section: 'header',
          originalValue: '',
          currentValue: '',
          status: 'empty',
          isCorrected: false,
          isConfirmed: false,
        },
        workedHours: {
          fieldId: 'hdr_worked_hours',
          fieldName: 'worked_hours',
          section: 'header',
          originalValue: '',
          currentValue: '',
          status: 'empty',
          isCorrected: false,
          isConfirmed: false,
        },
      },
    },
    rows,
    operatorSign: '',
    issuedBy: 'ASLY',
    controlledBy: 'IMS',
    revision: '01',
    approvedBy: 'MGT',
    isDemoData: false,
  };
}
