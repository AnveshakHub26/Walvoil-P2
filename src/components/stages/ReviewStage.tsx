import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Columns,
  Maximize2,
  Table as TableIcon,
  Sparkles,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import type { UploadedReportImage } from '../../types/workflow';
import type {
  ReportSheetData,
  ReportRowData,
  FieldMetadata,
  HeaderFieldKey,
} from '../../types/report';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { ScanViewer } from '../review/ScanViewer';
import { ReportTable } from '../review/ReportTable';
import { ReviewPageTabs } from '../review/ReviewPageTabs';

interface ReviewStageProps {
  uploadedFiles?: UploadedReportImage[];
  reportsData: Record<number, ReportSheetData>;
  onUpdateHeader: (sheetIndex: number, field: HeaderFieldKey, value: string) => void;
  onUpdateRow: (
    sheetIndex: number,
    rowId: string,
    field: keyof Omit<ReportRowData, 'id' | 'flaggedFields' | 'metadata'>,
    value: string
  ) => void;
  onConfirmField?: (sheetIndex: number, rowId: string | 'header', fieldKey: string) => void;
  onRevertField?: (sheetIndex: number, rowId: string | 'header', fieldKey: string) => void;
  onConfirmRow?: (sheetIndex: number, rowId: string) => void;
  onConfirmAllSheet?: (sheetIndex: number) => void;
  onSelectField?: (sheetIndex: number, fieldId: string) => void;
  onReRunRecognition?: (sheetIndex: number) => Promise<void>;
  onToggleFieldFlag: (sheetIndex: number, rowId: string, field: string) => void;
  onClearSheet?: (sheetIndex: number) => void;
  onBack: () => void;
  onContinue: () => void;
}

export const ReviewStage: React.FC<ReviewStageProps> = ({
  uploadedFiles = [],
  reportsData,
  onUpdateHeader,
  onUpdateRow,
  onConfirmField,
  onRevertField,
  onConfirmRow,
  onConfirmAllSheet,
  onSelectField,
  onReRunRecognition,
  onToggleFieldFlag,
  onClearSheet,
  onBack,
  onContinue,
}) => {
  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'split' | 'table' | 'scan'>('split');
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState<boolean>(false);
  const [isReRecognizing, setIsReRecognizing] = useState<boolean>(false);

  // Convert reportsData dictionary to ordered array
  const sheetsList = Object.values(reportsData).sort((a, b) => a.sheetIndex - b.sheetIndex);

  // Derive bounded active sheet index during render
  const safeActiveIndex =
    sheetsList.length > 0
      ? Math.min(Math.max(1, activeSheetIndex), sheetsList.length)
      : 1;

  // Active sheet
  const activeSheet = reportsData[safeActiveIndex] || sheetsList[0];

  // Associated uploaded file for the active sheet
  const activeFile = uploadedFiles[safeActiveIndex - 1];

  // Compute review queue: all fields currently requiring employee verification
  const reviewQueue: FieldMetadata[] = useMemo(() => {
    if (!activeSheet) return [];
    const list: FieldMetadata[] = [];

    // Header fields
    if (activeSheet.headers?.metadata) {
      Object.values(activeSheet.headers.metadata).forEach((m) => {
        if (m?.status === 'needs_review') list.push(m);
      });
    }

    // Row fields
    if (activeSheet.rows) {
      activeSheet.rows.forEach((r) => {
        if (r.metadata) {
          Object.values(r.metadata).forEach((m) => {
            if (m?.status === 'needs_review') list.push(m);
          });
        }
      });
    }

    return list;
  }, [activeSheet]);

  // Find metadata for currently selected field
  const selectedFieldMeta: FieldMetadata | null = useMemo(() => {
    if (!activeSheet) return null;
    const targetId = activeSheet.selectedFieldId;

    if (targetId) {
      // Check headers
      if (activeSheet.headers?.metadata) {
        for (const m of Object.values(activeSheet.headers.metadata)) {
          if (m?.fieldId === targetId) return m;
        }
      }

      // Check rows
      for (const r of activeSheet.rows) {
        if (r.metadata) {
          for (const m of Object.values(r.metadata)) {
            if (m?.fieldId === targetId) return m;
          }
        }
      }

      // Check footer signature
      if (activeSheet.operatorSignMeta?.fieldId === targetId) {
        return activeSheet.operatorSignMeta;
      }
    }

    // Default to first field needing review if none explicitly selected
    return reviewQueue[0] || null;
  }, [activeSheet, reviewQueue]);

  // Stepper navigation among fields needing review
  const currentReviewIdx = selectedFieldMeta
    ? reviewQueue.findIndex((m) => m.fieldId === selectedFieldMeta.fieldId)
    : -1;

  const handleNavigateNextReview = () => {
    if (reviewQueue.length === 0 || !activeSheet || !onSelectField) return;
    const nextIdx = (currentReviewIdx + 1) % reviewQueue.length;
    onSelectField(activeSheet.sheetIndex, reviewQueue[nextIdx].fieldId);
  };

  const handleNavigatePrevReview = () => {
    if (reviewQueue.length === 0 || !activeSheet || !onSelectField) return;
    const prevIdx = (currentReviewIdx - 1 + reviewQueue.length) % reviewQueue.length;
    onSelectField(activeSheet.sheetIndex, reviewQueue[prevIdx].fieldId);
  };

  const handleReRun = async () => {
    if (!onReRunRecognition || !activeSheet) return;
    setIsReRecognizing(true);
    try {
      await onReRunRecognition(activeSheet.sheetIndex);
    } finally {
      setIsReRecognizing(false);
    }
  };

  const canContinueToExcel = sheetsList.length > 0 && Boolean(activeSheet);

  const isSheetEmpty = useMemo(() => {
    if (!activeSheet) return false;
    const hasHeader = Boolean(activeSheet.headers?.date || activeSheet.headers?.operatorName);
    const hasRowData = activeSheet.rows?.some(
      (r) => Boolean(r.pwh) || Boolean(r.partNumber) || Boolean(r.family)
    );
    return !hasHeader && !hasRowData;
  }, [activeSheet]);

  const handleConfirmReset = () => {
    if (onClearSheet && activeSheet) {
      onClearSheet(activeSheet.sheetIndex);
    }
    setIsConfirmResetOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Primary Navigation */}
      <div className="bg-white border border-slate-200 rounded p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
              Human Verification &amp; Correction Interface
            </h2>
            <Badge variant="navy">Phase 14</Badge>
            <Badge variant="neutral">
              {sheetsList.length} {sheetsList.length === 1 ? 'Report' : 'Reports'}
            </Badge>
          </div>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Verify AI-transcribed data against the original handwritten record. Click any field to inspect its scan region.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="secondary"
            icon={<ArrowLeft className="w-4 h-4" />}
            onClick={onBack}
            title="Return to upload stage (uploaded images and edits are preserved)"
          >
            Back to Upload
          </Button>
          <Button
            variant="walvoil-red"
            disabled={!canContinueToExcel}
            icon={<ArrowRight className="w-4 h-4" />}
            onClick={onContinue}
            title={!canContinueToExcel ? 'No report data available to continue' : 'Proceed to Excel generation'}
          >
            Continue to Excel
          </Button>
        </div>
      </div>

      {/* Empty Sheet Banner with Instant OCR Auto-Fill Action */}
      {isSheetEmpty && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-blue-900">Live OCR Model Ready: </span>
              <span className="text-blue-800">
                This sheet is currently blank. Click "Run Live OCR" to transcribe all handwritten entries directly from your scan.
              </span>
            </div>
          </div>
          {onReRunRecognition && (
            <Button
              variant="walvoil-red"
              size="sm"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${isReRecognizing ? 'animate-spin' : ''}`} />}
              onClick={handleReRun}
              disabled={isReRecognizing}
              className="shrink-0 shadow-xs"
            >
              Run Live OCR
            </Button>
          )}
        </div>
      )}

      {/* Recognition Status & Governance Banner */}
      {activeSheet?.recognitionStatus === 'success' ? (
        <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-[#0f2a4a] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900">
                Gemini Vision AI Active ({activeSheet.fileName}):{' '}
              </span>
              <span className="text-slate-600">
                {activeSheet.summaryStats?.recognizedCells ?? 0} active cells transcribed,{' '}
                {activeSheet.summaryStats?.cancelledCells ?? 0} cancelled cells bypassed,{' '}
                {activeSheet.summaryStats?.needsReviewCount ?? reviewQueue.length} pending human verification.
              </span>
              {activeSheet.processingTimeMs && (
                <span className="text-[11px] text-slate-400 ml-1">
                  (Latency: {Math.round(activeSheet.processingTimeMs)} ms)
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Quota: 15 Scans / Min (Active)
            </span>
            {onReRunRecognition && (
              <Button
                variant="outline"
                size="sm"
                icon={<RefreshCw className={`w-3.5 h-3.5 ${isReRecognizing ? 'animate-spin' : ''}`} />}
                onClick={handleReRun}
                disabled={isReRecognizing}
                title="Re-run Gemini Vision model on this scan"
              >
                Re-run Scan
              </Button>
            )}
          </div>
        </div>
      ) : activeSheet?.recognitionError ? (
        <div className={`p-3 text-xs rounded border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs ${
          activeSheet.recognitionError.toLowerCase().includes('limit')
            ? 'bg-amber-50 border-amber-300 text-amber-950'
            : 'bg-amber-50/80 border-amber-300 text-amber-900'
        }`}>
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-950">
                {activeSheet.recognitionError.toLowerCase().includes('limit')
                  ? 'Model Rate Limit (15 Scans / Min): '
                  : 'Backend Recognition Notice: '}
              </span>
              <span className="text-amber-800">
                {activeSheet.recognitionError}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onReRunRecognition && (
              <Button
                variant="walvoil-red"
                size="sm"
                icon={<RefreshCw className={`w-3.5 h-3.5 ${isReRecognizing ? 'animate-spin' : ''}`} />}
                onClick={handleReRun}
                disabled={isReRecognizing}
                className="shrink-0 shadow-xs"
              >
                Retry Scan
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {/* Tab Strip for Page Selection & View Mode Toggles */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <ReviewPageTabs
            sheets={sheetsList}
            activeSheetIndex={activeSheetIndex}
            onSelectSheet={(index) => setActiveSheetIndex(index)}
          />
        </div>

        {/* View Layout Controls (Split, Table Only, Scan Only) */}
        <div className="hidden lg:flex items-center space-x-1 bg-white border border-slate-200 rounded p-1 shrink-0 shadow-2xs">
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'split'
                ? 'bg-[#0f2a4a] text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Side-by-side view (scan on left, table on right)"
          >
            <Columns className="w-3.5 h-3.5" />
            <span>Split View</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'table'
                ? 'bg-[#0f2a4a] text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Maximize editable report table"
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Table Only</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('scan')}
            className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'scan'
                ? 'bg-[#0f2a4a] text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Maximize scanned image view"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Scan Only</span>
          </button>
        </div>
      </div>

      {/* Main Review Workspace Layout */}
      {activeSheet ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Left Panel: Original Scan Viewer with Coordinate Highlighting */}
          {(viewMode === 'split' || viewMode === 'scan') && (
            <div
              className={`${
                viewMode === 'scan' ? 'xl:col-span-12' : 'xl:col-span-5'
              } sticky top-4`}
            >
              <ScanViewer
                key={activeFile?.id || safeActiveIndex}
                imageUrl={activeFile?.previewUrl}
                fileName={activeFile?.name || activeSheet.fileName}
                sheetIndex={activeSheet.sheetIndex}
                selectedFieldMeta={selectedFieldMeta}
                onNavigatePrevReview={handleNavigatePrevReview}
                onNavigateNextReview={handleNavigateNextReview}
                reviewQueueCount={reviewQueue.length}
                currentReviewIndex={currentReviewIdx >= 0 ? currentReviewIdx + 1 : 0}
              />
            </div>
          )}

          {/* Right Panel: Excel-like Editable Report Table */}
          {(viewMode === 'split' || viewMode === 'table') && (
            <div className={`${viewMode === 'table' ? 'xl:col-span-12' : 'xl:col-span-7'}`}>
              <ReportTable
                sheetData={activeSheet}
                selectedFieldId={selectedFieldMeta?.fieldId}
                onSelectField={(fieldId) =>
                  onSelectField?.(activeSheet.sheetIndex, fieldId)
                }
                onUpdateHeader={(field, value) =>
                  onUpdateHeader(activeSheet.sheetIndex, field, value)
                }
                onUpdateRow={(rowId, field, value) =>
                  onUpdateRow(activeSheet.sheetIndex, rowId, field, value)
                }
                onConfirmField={(rowId, fieldKey) =>
                  onConfirmField?.(activeSheet.sheetIndex, rowId, fieldKey)
                }
                onRevertField={(rowId, fieldKey) =>
                  onRevertField?.(activeSheet.sheetIndex, rowId, fieldKey)
                }
                onConfirmRow={(rowId) =>
                  onConfirmRow?.(activeSheet.sheetIndex, rowId)
                }
                onConfirmAllSheet={() =>
                  onConfirmAllSheet?.(activeSheet.sheetIndex)
                }
                onToggleFieldFlag={(rowId, field) =>
                  onToggleFieldFlag(activeSheet.sheetIndex, rowId, field)
                }
              />
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded p-12 text-center text-slate-500 shadow-2xs">
          <p className="text-sm font-semibold">No report sheet available</p>
          <p className="text-xs text-slate-400 mt-1">
            Please return to the Upload stage to add daily production report scans.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={onBack}>
              Return to Upload Stage
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Reset Sheet */}
      <ConfirmationModal
        isOpen={isConfirmResetOpen}
        title="Reset Sheet to Blank?"
        message={`Are you sure you want to reset "${activeSheet?.sheetName || 'this report'}" to an empty template? Any entries currently in this sheet will be discarded.`}
        confirmLabel="Reset Sheet"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmReset}
        onCancel={() => setIsConfirmResetOpen(false)}
      />
    </div>
  );
};
