/**
 * Recognition API Service (Phase 14)
 *
 * Connects the frontend directly to the Phase 13 FastAPI backend:
 * - POST /api/v1/reports/recognize
 * - GET /api/v1/reports/status
 *
 * Configurable via VITE_API_URL environment variable.
 * Never invents OCR values or uses fabricated text.
 */

export interface BackendBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BackendPolygonPoint {
  x: number;
  y: number;
}

export interface BackendOriginalCoordinates {
  boundingBox: BackendBoundingBox;
  polygon: BackendPolygonPoint[];
}

export interface BackendRecognizedField {
  fieldId: string;
  section: string;
  fieldName: string;
  rowIndex?: number | null;
  colIndex?: number | null;
  subField?: string | null;
  rawText?: string | null;
  cleanedText?: string | null;
  modelUsed?: string | null;
  confidence?: number | null;
  status: string; // 'recognized' | 'empty' | 'cancelled' | 'signature_region' | 'model_offline' | 'error'
  needsReview: boolean;
  deskewedBox: BackendBoundingBox;
  originalCoordinates: BackendOriginalCoordinates;
  latencyMs?: number | null;
}

export interface BackendProductionTableRow {
  rowIndex: number;
  isCancelled: boolean;
  pwhSubrow?: BackendRecognizedField | null;
  ordSubrow?: BackendRecognizedField | null;
  family?: BackendRecognizedField | null;
  partNumber?: BackendRecognizedField | null;
  timeStart?: BackendRecognizedField | null;
  timeEnd?: BackendRecognizedField | null;
  qty?: BackendRecognizedField | null;
  remarks?: BackendRecognizedField | null;
  idleCode?: BackendRecognizedField | null;
  idleFrom?: BackendRecognizedField | null;
  idleTo?: BackendRecognizedField | null;
  totalTime?: BackendRecognizedField | null;
}

export interface BackendRecognitionSummary {
  totalCells: number;
  recognizedCells: number;
  emptyCells: number;
  cancelledCells: number;
  signatureCells: number;
  cellsNeedingReview: number;
  byModel: Record<string, number>;
}

export interface BackendRecognitionResponse {
  success: boolean;
  filename: string;
  templateName: string;
  alignmentConfidence: number;
  processingTimeMs: number;
  header: Record<string, BackendRecognizedField>;
  tableRows: BackendProductionTableRow[];
  footer: Record<string, BackendRecognizedField>;
  summary: BackendRecognitionSummary;
  allFields: BackendRecognizedField[];
  warnings: string[];
}

export function getBackendBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'http://localhost:8000';
}

export async function checkBackendStatus(): Promise<{
  online: boolean;
  handwritingActive: boolean;
  error?: string;
}> {
  const baseUrl = getBackendBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/api/v1/reports/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return { online: false, handwritingActive: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const handwritingActive = data?.pipeline?.handwriting_recognition === 'active';
    return { online: true, handwritingActive };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    return { online: false, handwritingActive: false, error: message };
  }
}

// Sliding window rate limit tracker (15 requests/minute)
const scanTimestamps: number[] = [];

export function recordScanAttempt() {
  scanTimestamps.push(Date.now());
}

export function getScanQuotaStatus(): { remaining: number; resetSeconds: number; currentCount: number } {
  const now = Date.now();
  // Filter out timestamps older than 60 seconds
  const valid = scanTimestamps.filter((t) => now - t < 60000);
  const count = valid.length;
  const remaining = Math.max(0, 15 - count);
  let resetSeconds = 0;
  if (valid.length > 0) {
    const oldest = Math.min(...valid);
    resetSeconds = Math.max(1, Math.ceil((60000 - (now - oldest)) / 1000));
  }
  return { remaining, resetSeconds, currentCount: count };
}

export async function recognizeReportScan(
  file: File
): Promise<BackendRecognitionResponse> {
  recordScanAttempt();
  const baseUrl = getBackendBaseUrl();
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetch(`${baseUrl}/api/v1/reports/recognize`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = `Recognition request failed with HTTP ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson.detail) {
        errorDetail =
          typeof errorJson.detail === 'string'
            ? errorJson.detail
            : JSON.stringify(errorJson.detail);
      }
    } catch {
      // Use fallback errorDetail
    }
    throw new Error(errorDetail);
  }

  const result: BackendRecognitionResponse = await response.json();
  return result;
}

