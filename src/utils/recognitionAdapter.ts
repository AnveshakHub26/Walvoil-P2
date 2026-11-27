/**
 * Recognition Adapter & Data Converter (Phase 14)
 *
 * Converts Phase 13 Backend Recognition Response into typed ReportSheetData:
 * - Preserves original OCR values separately from employee corrections
 * - Populates Phase 11 bounding box and polygon coordinates for scan highlighting
 * - Separates Column 0 PWH and Order No subfields while keeping batchAndOrder in sync
 * - Sets initial status to 'needs_review' (never marks verified automatically)
 * - Identifies cancelled and empty rows without running fake transcription
 */

import type {
  ReportSheetData,
  ReportHeaderData,
  ReportRowData,
  FieldMetadata,
  RecognitionStatus,
  SummaryStats,
} from '../types/report';
import type {
  BackendRecognitionResponse,
  BackendRecognizedField,
  BackendProductionTableRow,
} from '../services/recognitionApi';

/**
 * Validates string value against standard Walvoil field patterns without overwriting input.
 */
export function validateFieldValue(fieldName: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null; // Blank fields are allowed (especially in optional or empty rows)
  }

  if (fieldName === 'date') {
    // DD/MM/YYYY or DD-MM-YYYY format
    const dateRegex = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/;
    if (!dateRegex.test(trimmed)) {
      return 'Format recommendation: DD/MM/YYYY';
    }
  } else if (fieldName === 'time_start' || fieldName === 'time_end' || fieldName === 'idle_from' || fieldName === 'idle_to') {
    if (trimmed !== '-' && trimmed !== '—') {
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(trimmed)) {
        return 'Format recommendation: HH:MM (e.g. 06:00)';
      }
    }
  } else if (fieldName === 'pwh' || fieldName === 'pwh_subrow') {
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length < 2) {
      return 'Batch PWH is expected to be numeric (e.g. 2638043)';
    }
  } else if (fieldName === 'ord_no' || fieldName === 'ord_subrow') {
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length < 2) {
      return 'Order No is expected to be numeric (e.g. 1118496)';
    }
  } else if (fieldName === 'worked_hours') {
    if (!/^\d+(\.\d+)?(\s*hrs?)?$/i.test(trimmed)) {
      return 'Worked hours format: number (e.g. 8 or 8.00)';
    }
  }

  return null;
}

/**
 * Constructs a FieldMetadata object from a backend recognized field.
 */
function createFieldMeta(
  backendField?: BackendRecognizedField | any | null,
  fallbackFieldId: string = 'field',
  fallbackFieldName: string = 'field',
  fallbackSection: string = 'table'
): FieldMetadata {
  if (!backendField) {
    return {
      fieldId: fallbackFieldId,
      fieldName: fallbackFieldName,
      section: fallbackSection,
      originalValue: '',
      currentValue: '',
      status: 'empty',
      isCorrected: false,
      isConfirmed: false,
    };
  }

  // Support both camelCase and snake_case from backend JSON
  const rawVal =
    backendField.cleanedText ??
    backendField.cleaned_text ??
    backendField.rawText ??
    backendField.raw_text ??
    '';
  let initialStatus: RecognitionStatus;

  const fieldStatus = backendField.status;
  if (fieldStatus === 'signature_region') {
    initialStatus = 'signature_region';
  } else if (fieldStatus === 'cancelled') {
    initialStatus = 'cancelled';
  } else if (fieldStatus === 'empty' || !rawVal) {
    initialStatus = 'empty';
  } else if (fieldStatus === 'model_offline' || fieldStatus === 'error') {
    initialStatus = 'failed';
  } else {
    // Conservative rule: Never mark fields automatically verified
    initialStatus = 'needs_review';
  }

  const fieldId = backendField.fieldId ?? backendField.field_id ?? fallbackFieldId;
  const fieldName = backendField.fieldName ?? backendField.field_name ?? fallbackFieldName;
  const section = backendField.section ?? fallbackSection;
  const modelUsed = backendField.modelUsed ?? backendField.model_used;
  const confidence = backendField.confidence;
  const deskewedBox = backendField.deskewedBox ?? backendField.deskewed_box;
  const originalCoordinates = backendField.originalCoordinates ?? backendField.original_coordinates;
  const latencyMs = backendField.latencyMs ?? backendField.latency_ms ?? undefined;

  return {
    fieldId,
    fieldName,
    section,
    originalValue: rawVal,
    currentValue: rawVal,
    status: initialStatus,
    isCorrected: false,
    isConfirmed: false,
    modelUsed,
    confidence,
    deskewedBox,
    originalCoordinates,
    validationWarning: validateFieldValue(fieldName, rawVal),
    latencyMs,
  };
}

/**
 * Converts backend recognition response into full ReportSheetData.
 */
export function convertBackendResponseToReportSheet(
  response: BackendRecognitionResponse,
  sheetIndex: number,
  fileId?: string
): ReportSheetData {
  // 1. Process Header Fields (supporting both snake_case and camelCase)
  const hdr = response.header || {};
  const dateMeta = createFieldMeta(hdr.date, 'hdr_date', 'date', 'header');
  const opMeta = createFieldMeta(
    hdr.operator_name || (hdr as any).operatorName,
    'hdr_operator_name',
    'operator_name',
    'header'
  );
  const shiftMeta = createFieldMeta(hdr.shift, 'hdr_shift', 'shift', 'header');
  const benchMeta = createFieldMeta(hdr.bench, 'hdr_bench', 'bench', 'header');
  const hoursMeta = createFieldMeta(
    hdr.worked_hours || (hdr as any).workedHours,
    'hdr_worked_hours',
    'worked_hours',
    'header'
  );

  const headers: ReportHeaderData = {
    date: dateMeta.currentValue,
    operatorName: opMeta.currentValue,
    shift: shiftMeta.currentValue,
    bench: benchMeta.currentValue,
    workedHours: hoursMeta.currentValue,
    flaggedFields: {
      date: dateMeta.status === 'needs_review',
      operatorName: opMeta.status === 'needs_review',
      shift: shiftMeta.status === 'needs_review',
      bench: benchMeta.status === 'needs_review',
      workedHours: hoursMeta.status === 'needs_review',
    },
    metadata: {
      date: dateMeta,
      operatorName: opMeta,
      shift: shiftMeta,
      bench: benchMeta,
      workedHours: hoursMeta,
    },
  };

  // 2. Process 14 Table Rows (supporting both snake_case and camelCase)
  const backendRows: (BackendProductionTableRow | any)[] = response.tableRows || (response as any).table_rows || [];
  const rows: ReportRowData[] = [];

  for (let i = 0; i < 14; i++) {
    const rowNum = i + 1;
    const bRow = backendRows.find((r: any) => (r.rowIndex ?? r.row_index) === rowNum) || {
      rowIndex: rowNum,
      isCancelled: false,
    };

    const isCancelled = Boolean(bRow.isCancelled ?? bRow.is_cancelled);

    const pwhMeta = createFieldMeta(
      bRow.pwhSubrow ?? bRow.pwh_subrow,
      `row${String(rowNum).padStart(2, '0')}_col00_pwh`,
      'pwh',
      'table_subrow'
    );
    const ordMeta = createFieldMeta(
      bRow.ordSubrow ?? bRow.ord_subrow,
      `row${String(rowNum).padStart(2, '0')}_col00_ord_no`,
      'ord_no',
      'table_subrow'
    );
    const familyMeta = createFieldMeta(
      bRow.family,
      `row${String(rowNum).padStart(2, '0')}_col01_family`,
      'family',
      'table'
    );
    const partMeta = createFieldMeta(
      bRow.partNumber ?? bRow.part_number,
      `row${String(rowNum).padStart(2, '0')}_col02_part_number`,
      'part_number',
      'table'
    );
    const tStartMeta = createFieldMeta(
      bRow.timeStart ?? bRow.time_start,
      `row${String(rowNum).padStart(2, '0')}_col03_time_start`,
      'time_start',
      'table'
    );
    const tEndMeta = createFieldMeta(
      bRow.timeEnd ?? bRow.time_end,
      `row${String(rowNum).padStart(2, '0')}_col04_time_end`,
      'time_end',
      'table'
    );
    const qtyMeta = createFieldMeta(
      bRow.qty,
      `row${String(rowNum).padStart(2, '0')}_col05_qty`,
      'qty',
      'table'
    );
    const remarksMeta = createFieldMeta(
      bRow.remarks,
      `row${String(rowNum).padStart(2, '0')}_col06_remarks`,
      'remarks',
      'table'
    );
    const idleCodeMeta = createFieldMeta(
      bRow.idleCode ?? bRow.idle_code,
      `row${String(rowNum).padStart(2, '0')}_col07_idle_code`,
      'idle_code',
      'table'
    );
    const idleFromMeta = createFieldMeta(
      bRow.idleFrom ?? bRow.idle_from,
      `row${String(rowNum).padStart(2, '0')}_col08_idle_from`,
      'idle_from',
      'table'
    );
    const idleToMeta = createFieldMeta(
      bRow.idleTo ?? bRow.idle_to,
      `row${String(rowNum).padStart(2, '0')}_col09_idle_to`,
      'idle_to',
      'table'
    );
    const totalTimeMeta = createFieldMeta(
      bRow.totalTime ?? bRow.total_time,
      `row${String(rowNum).padStart(2, '0')}_col10_total_time`,
      'total_time',
      'table'
    );

    // If whole row is cancelled, override statuses
    if (isCancelled) {
      [
        pwhMeta,
        ordMeta,
        familyMeta,
        partMeta,
        tStartMeta,
        tEndMeta,
        qtyMeta,
        remarksMeta,
        idleCodeMeta,
        idleFromMeta,
        idleToMeta,
        totalTimeMeta,
      ].forEach((m) => {
        m.status = 'cancelled';
      });
    }

    // Build combined batchAndOrder string for Excel compatibility
    let batchAndOrder = '';
    if (pwhMeta.currentValue || ordMeta.currentValue) {
      const pwhLine = pwhMeta.currentValue ? `PWH: ${pwhMeta.currentValue}` : '';
      const ordLine = ordMeta.currentValue ? `Ord No: ${ordMeta.currentValue}` : '';
      batchAndOrder = [pwhLine, ordLine].filter(Boolean).join('\n');
    }

    rows.push({
      id: `row-${rowNum}`,
      rowIndex: rowNum,
      isCancelled,
      pwh: pwhMeta.currentValue,
      ordNo: ordMeta.currentValue,
      batchAndOrder,
      family: familyMeta.currentValue,
      partNumber: partMeta.currentValue,
      timeStart: tStartMeta.currentValue,
      timeEnd: tEndMeta.currentValue,
      qty: qtyMeta.currentValue,
      remarks: remarksMeta.currentValue,
      idleCode: idleCodeMeta.currentValue,
      idleFrom: idleFromMeta.currentValue,
      idleTo: idleToMeta.currentValue,
      totalTime: totalTimeMeta.currentValue,
      flaggedFields: {
        batchAndOrder: pwhMeta.status === 'needs_review' || ordMeta.status === 'needs_review',
        pwh: pwhMeta.status === 'needs_review',
        ordNo: ordMeta.status === 'needs_review',
        family: familyMeta.status === 'needs_review',
        partNumber: partMeta.status === 'needs_review',
        timeStart: tStartMeta.status === 'needs_review',
        timeEnd: tEndMeta.status === 'needs_review',
        qty: qtyMeta.status === 'needs_review',
        remarks: remarksMeta.status === 'needs_review',
        idleCode: idleCodeMeta.status === 'needs_review',
        idleFrom: idleFromMeta.status === 'needs_review',
        idleTo: idleToMeta.status === 'needs_review',
        totalTime: totalTimeMeta.status === 'needs_review',
      },
      metadata: {
        pwh: pwhMeta,
        ordNo: ordMeta,
        family: familyMeta,
        partNumber: partMeta,
        timeStart: tStartMeta,
        timeEnd: tEndMeta,
        qty: qtyMeta,
        remarks: remarksMeta,
        idleCode: idleCodeMeta,
        idleFrom: idleFromMeta,
        idleTo: idleToMeta,
        totalTime: totalTimeMeta,
      },
    });
  }

  // 3. Process Footer & Signature
  const ftr = response.footer || {};
  const signMeta = createFieldMeta(ftr.operator_sign, 'ftr_operator_sign', 'operator_sign', 'footer');
  signMeta.status = 'signature_region';

  // 4. Compute Summary Statistics
  let needsReviewCount = 0;
  let confirmedCount = 0;
  let correctedCount = 0;
  let emptyCells = 0;
  let cancelledCells = 0;
  let recognizedCells = 0;

  // Header count
  [dateMeta, opMeta, shiftMeta, benchMeta, hoursMeta].forEach((m) => {
    if (m.status === 'needs_review') needsReviewCount++;
    if (m.status === 'empty') emptyCells++;
    if (m.status === 'confirmed') confirmedCount++;
    if (m.status === 'corrected') correctedCount++;
    if (m.status !== 'empty' && m.status !== 'cancelled' && m.status !== 'failed') recognizedCells++;
  });

  // Table rows count
  rows.forEach((r) => {
    if (r.metadata) {
      Object.values(r.metadata).forEach((m) => {
        if (!m) return;
        if (m.status === 'needs_review') needsReviewCount++;
        if (m.status === 'confirmed') confirmedCount++;
        if (m.status === 'corrected') correctedCount++;
        if (m.status === 'empty') emptyCells++;
        if (m.status === 'cancelled') cancelledCells++;
        if (m.status !== 'empty' && m.status !== 'cancelled' && m.status !== 'failed') recognizedCells++;
      });
    }
  });

  const sum = response.summary as any;
  const summaryStats: SummaryStats = {
    totalCells: sum?.totalCells ?? sum?.total_cells ?? 189,
    recognizedCells: sum?.recognizedCells ?? sum?.recognized_cells ?? recognizedCells,
    emptyCells: sum?.emptyCells ?? sum?.empty_cells ?? emptyCells,
    cancelledCells: sum?.cancelledCells ?? sum?.cancelled_cells ?? cancelledCells,
    signatureCells: sum?.signatureCells ?? sum?.signature_cells ?? 1,
    needsReviewCount,
    confirmedCount,
    correctedCount,
  };

  return {
    sheetIndex,
    sheetName: `Report ${sheetIndex}`,
    fileName: response.filename,
    fileId,
    headers,
    rows,
    operatorSign: 'Digital transcription logged',
    operatorSignMeta: signMeta,
    issuedBy: 'ASLY',
    controlledBy: 'IMS',
    revision: '01',
    approvedBy: 'MGT',
    isDemoData: false,
    selectedFieldId: 'hdr_operator_name', // Default focus for immediate scan inspection
    recognitionStatus: 'success',
    alignmentConfidence: response.alignmentConfidence,
    processingTimeMs: response.processingTimeMs,
    summaryStats,
  };
}
