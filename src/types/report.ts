export type ReviewCellFlag = 'normal' | 'needs_check' | 'confirmed';

export type RecognitionStatus =
  | 'needs_review'
  | 'confirmed'
  | 'corrected'
  | 'empty'
  | 'cancelled'
  | 'signature_region'
  | 'failed';

export interface BoundingBoxCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PolygonPoint {
  x: number;
  y: number;
}

export interface FieldMetadata {
  fieldId: string;
  fieldName: string;
  section: string;
  originalValue: string;
  currentValue: string;
  status: RecognitionStatus;
  isCorrected: boolean;
  isConfirmed: boolean;
  modelUsed?: string | null;
  confidence?: number | null;
  deskewedBox?: BoundingBoxCoordinates;
  originalCoordinates?: {
    boundingBox: BoundingBoxCoordinates;
    polygon?: PolygonPoint[];
  };
  validationWarning?: string | null;
  latencyMs?: number;
}

export type HeaderFieldKey = 'date' | 'operatorName' | 'shift' | 'bench' | 'workedHours';

export type RowFieldKey =
  | 'pwh'
  | 'ordNo'
  | 'batchAndOrder'
  | 'family'
  | 'partNumber'
  | 'timeStart'
  | 'timeEnd'
  | 'qty'
  | 'remarks'
  | 'idleCode'
  | 'idleFrom'
  | 'idleTo'
  | 'totalTime';

export interface ReportHeaderData {
  date: string;
  operatorName: string;
  shift: string;
  bench: string;
  workedHours: string;
  flaggedFields?: Partial<Record<HeaderFieldKey, boolean>>;
  metadata?: Partial<Record<HeaderFieldKey, FieldMetadata>>;
}

export interface ReportRowData {
  id: string;
  rowIndex?: number;
  isCancelled?: boolean;
  pwh?: string;
  ordNo?: string;
  batchAndOrder: string;
  family: string;
  partNumber: string;
  timeStart: string;
  timeEnd: string;
  qty: string;
  remarks: string;
  idleCode: string;
  idleFrom: string;
  idleTo: string;
  totalTime: string;
  flaggedFields?: Partial<Record<RowFieldKey, boolean>>;
  metadata?: Partial<Record<RowFieldKey, FieldMetadata>>;
}

export interface SummaryStats {
  totalCells: number;
  recognizedCells: number;
  emptyCells: number;
  cancelledCells: number;
  signatureCells: number;
  needsReviewCount: number;
  confirmedCount: number;
  correctedCount: number;
}

export interface ReportSheetData {
  sheetIndex: number; // 1-based index (Report 1, Report 2, ...)
  sheetName: string; // e.g. "Report 1"
  fileName: string; // Name of the uploaded scan associated with this report
  fileId?: string; // ID of the uploaded scan image
  headers: ReportHeaderData;
  rows: ReportRowData[];
  operatorSign: string;
  operatorSignMeta?: FieldMetadata;
  issuedBy: string;
  controlledBy: string;
  revision: string;
  approvedBy: string;
  isDemoData: boolean;
  lastEditedAt?: number;

  // Phase 14 extensions:
  selectedFieldId?: string;
  recognitionStatus?: 'idle' | 'recognizing' | 'success' | 'failed';
  recognitionError?: string | null;
  alignmentConfidence?: number;
  processingTimeMs?: number;
  summaryStats?: SummaryStats;
  scanDimensions?: {
    original: [number, number];
    deskewed: [number, number];
  };
}
