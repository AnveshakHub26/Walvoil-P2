import React, { useState, useCallback } from 'react';
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  RotateCcw,
  AlertCircle,
  Layers,
  Check,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import type { ReportSheetData } from '../../types/report';
import type { UploadedReportImage } from '../../types/workflow';
import {
  generateExcelWorkbook,
  downloadExcelFile,
  type ExcelGenerationResult,
} from '../../utils/excelGenerator';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { ConfirmationModal } from '../common/ConfirmationModal';

interface DownloadStageProps {
  reportsData: Record<number, ReportSheetData>;
  uploadedFiles?: UploadedReportImage[];
  dataVersion: number;
  onBack: () => void;
  onReset: () => void;
}

type GenerationStatus = 'idle' | 'generating' | 'ready' | 'error';

export const DownloadStage: React.FC<DownloadStageProps> = ({
  reportsData,
  dataVersion,
  onBack,
  onReset,
}) => {
  const sheets = Object.values(reportsData).sort((a, b) => a.sheetIndex - b.sheetIndex);
  const hasReports = sheets.length > 0;

  // Compile immediately during initial state setup if reports are available (avoids cascading effect re-renders)
  const [generationResult, setGenerationResult] = useState<ExcelGenerationResult | null>(() => {
    if (hasReports) {
      try {
        return generateExcelWorkbook(reportsData, 'Walvoil_Daily_Production_Report.xlsx');
      } catch {
        return null;
      }
    }
    return null;
  });

  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>(() => {
    return hasReports ? 'ready' : 'idle';
  });

  const [generatedDataVersion, setGeneratedDataVersion] = useState<number | null>(() => {
    return hasReports ? dataVersion : null;
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState<boolean>(false);

  // Stale check: if user returned to Review and modified report data after compilation
  const isWorkbookOutdated =
    generationStatus === 'ready' &&
    generatedDataVersion !== null &&
    generatedDataVersion !== dataVersion;

  const handleGenerate = useCallback(() => {
    try {
      setGenerationStatus('generating');
      setErrorMessage(null);

      // Perform synchronous in-browser compilation
      const result = generateExcelWorkbook(reportsData, 'Walvoil_Daily_Production_Report.xlsx');
      setGenerationResult(result);
      setGeneratedDataVersion(dataVersion);
      setGenerationStatus('ready');
    } catch (err: unknown) {
      setGenerationStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred while compiling the Excel workbook.'
      );
    }
  }, [reportsData, dataVersion]);

  const handleDownload = () => {
    if (!generationResult || isDownloading || isWorkbookOutdated) return;

    setIsDownloading(true);
    try {
      downloadExcelFile(generationResult.blob, generationResult.fileName);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to trigger file download. Please try again.'
      );
    } finally {
      setTimeout(() => {
        setIsDownloading(false);
      }, 1200);
    }
  };

  if (!hasReports) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center max-w-xl mx-auto shadow-2xs">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">No Report Data Available</h3>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            There are currently no reviewed report pages to export. Please return to the Upload stage to upload handwritten daily production reports.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <Button variant="secondary" icon={<ArrowLeft className="w-4 h-4" />} onClick={onBack}>
              Return to Review
            </Button>
            <Button variant="walvoil-red" onClick={onReset}>
              Start New Batch
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Count active rows with data and flagged cells
  let totalDataEntries = 0;
  let totalFlaggedCells = 0;

  sheets.forEach((sheet) => {
    if (sheet.headers.flaggedFields) {
      totalFlaggedCells += Object.values(sheet.headers.flaggedFields).filter(Boolean).length;
    }
    sheet.rows.forEach((r) => {
      if (
        r.batchAndOrder ||
        r.family ||
        r.partNumber ||
        r.timeStart ||
        r.timeEnd ||
        r.qty ||
        r.remarks
      ) {
        totalDataEntries += 1;
      }
      if (r.flaggedFields) {
        totalFlaggedCells += Object.values(r.flaggedFields).filter(Boolean).length;
      }
    });
  });

  const totalCapacityRows = sheets.length * 14;
  const effectiveTotalRows = totalDataEntries > 0 ? totalDataEntries : totalCapacityRows;

  const formattedBlobSize = generationResult
    ? `${(generationResult.blob.size / 1024).toFixed(1)} KB`
    : null;

  return (
    <div className="space-y-6">
      {/* Top Section: ANALYSIS COMPLETED header with Start New Batch button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div className="flex items-start gap-3.5">
          {/* Green circular checkmark icon matching user screenshot */}
          <div className="w-9 h-9 rounded-full border-2 border-emerald-500 bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0 mt-0.5">
            <Check className="w-5 h-5 stroke-[3]" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">
              ANALYSIS COMPLETED
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              The uploaded report files have been successfully processed and compiled into the production workbook.
            </p>
          </div>
        </div>

        {/* Top Right Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Review Sheets</span>
          </button>
          <button
            type="button"
            onClick={() => setIsConfirmResetOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>START NEW BATCH</span>
          </button>
        </div>
      </div>

      {/* Outdated Workbook Warning if user edited in Review stage after generation */}
      {isWorkbookOutdated && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-center justify-between gap-3 shadow-2xs"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-amber-950">
                Notice: Report Data Modified in Review
              </span>
              <p className="mt-0.5 text-amber-800">
                Edits were made to report sheets after the workbook was compiled. Re-generate to include newest edits.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            className="px-4 py-2 bg-[#ba1c24] hover:bg-[#a1141b] text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            Re-generate Workbook
          </button>
        </div>
      )}

      {/* Error alert if compilation failed */}
      {generationStatus === 'error' && errorMessage && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-900 flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold block">Generation Failed</span>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
          <Button variant="danger" size="sm" onClick={handleGenerate}>
            Retry
          </Button>
        </div>
      )}

      {/* Main Output Card: GENERATED PRODUCTION FILE matching the user screenshot */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-2xs space-y-4">
        <div>
          <span className="text-[11px] font-bold text-[#ba1c24] uppercase tracking-widest block">
            GENERATED PRODUCTION FILE
          </span>
          <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mt-1">
            ANALYSIS OUTPUT
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            The compiled Walvoil Daily Production Report workbook is ready for download.
          </p>
        </div>

        {/* Inner Download Box */}
        <div className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* White rounded square with red spreadsheet icon */}
            <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[#ba1c24] shadow-2xs shrink-0">
              <FileSpreadsheet className="w-6 h-6 stroke-[1.75]" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-900 text-sm sm:text-base truncate">
                  Walvoil_Daily_Production_Report.xlsx
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Ready for download
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 truncate">
                Source: IMS-ASLY-DPR-REV01 • Batch: {sheets.length} Sheets • {effectiveTotalRows} Rows
                {formattedBlobSize ? ` • Execution time: Client-side • Size: ${formattedBlobSize}` : ''}
              </p>
            </div>
          </div>

          {/* Right Red Action Button */}
          <div className="shrink-0 flex items-center">
            {isWorkbookOutdated ? (
              <button
                type="button"
                onClick={handleGenerate}
                className="w-full sm:w-auto px-6 py-3.5 bg-[#ba1c24] hover:bg-[#a1141b] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>RE-GENERATE WORKBOOK →</span>
              </button>
            ) : generationStatus === 'ready' ? (
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className="w-full sm:w-auto px-7 py-3.5 bg-[#ba1c24] hover:bg-[#a1141b] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>{isDownloading ? 'Downloading...' : 'DOWNLOAD EXCEL →'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generationStatus === 'generating'}
                className="w-full sm:w-auto px-7 py-3.5 bg-[#ba1c24] hover:bg-[#a1141b] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{generationStatus === 'generating' ? 'Compiling Excel...' : 'GENERATE EXCEL →'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Worksheets Detail Table & Technical Specifications */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Worksheets Breakdown Table */}
        <div className="lg:col-span-2">
          <Card
            title={`Worksheets Included in Workbook (${sheets.length})`}
            subtitle="Breakdown of individual compiled Daily Production Report sheets"
          >
            <div className="border border-slate-200/90 rounded-xl overflow-hidden mt-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Sheet Name</th>
                    <th className="py-2.5 px-3">Source Scan</th>
                    <th className="py-2.5 px-3">Header Info</th>
                    <th className="py-2.5 px-3 text-center">Rows</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {sheets.map((sheet) => {
                    let sheetFlagged = 0;
                    if (sheet.headers.flaggedFields) {
                      sheetFlagged += Object.values(sheet.headers.flaggedFields).filter(Boolean).length;
                    }
                    sheet.rows.forEach((r) => {
                      if (r.flaggedFields) {
                        sheetFlagged += Object.values(r.flaggedFields).filter(Boolean).length;
                      }
                    });

                    const activeRowsCount = sheet.rows.filter(
                      (r) =>
                        r.batchAndOrder ||
                        r.family ||
                        r.partNumber ||
                        r.timeStart ||
                        r.timeEnd ||
                        r.qty
                    ).length;

                    return (
                      <tr key={sheet.sheetIndex} className="hover:bg-slate-50/70">
                        <td className="py-3 px-3 font-semibold text-slate-900 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-slate-400" />
                          {sheet.sheetName}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-600 truncate max-w-[140px]">
                          {sheet.fileName || 'Scanned DPR'}
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-600">
                          {sheet.headers.date || '—'} • {sheet.headers.shift || 'Shift 1'} •{' '}
                          {sheet.headers.operatorName || '—'}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-[11px]">
                          {activeRowsCount || 14} / 14
                        </td>
                        <td className="py-3 px-3 text-right">
                          {sheetFlagged > 0 ? (
                            <span className="inline-flex items-center text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                              {sheetFlagged} flagged
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <Check className="w-3 h-3 mr-0.5 text-emerald-600" /> Confirmed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Technical Summary Specifications */}
        <div className="space-y-6">
          <Card title="Workbook Technical Summary" subtitle="Export specifications">
            <dl className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500">Target Filename:</dt>
                <dd className="font-mono text-[11px] font-bold text-slate-800">
                  Walvoil_Daily_Production_Report.xlsx
                </dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500">Excel Engine:</dt>
                <dd className="font-medium text-slate-800">SheetJS (xlsx-js-style)</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500">Processing Mode:</dt>
                <dd className="font-medium text-emerald-700">Client-Side Memory</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500">Worksheet Structure:</dt>
                <dd className="font-medium text-slate-700">
                  {sheets.length > 0 ? `Report 1 – Report ${sheets.length}` : 'None'}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500">Output Standard:</dt>
                <dd className="font-medium text-slate-700">ISO/IEC 29500 (OpenXML .xlsx)</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      {/* Confirmation Modal: Start New Batch */}
      <ConfirmationModal
        isOpen={isConfirmResetOpen}
        title="Start New Analysis / Batch?"
        message="Starting a new analysis will clear all uploaded report scans and reset reviewed data. Are you sure you want to proceed?"
        confirmLabel="Start New Analysis"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          setIsConfirmResetOpen(false);
          onReset();
        }}
        onCancel={() => setIsConfirmResetOpen(false)}
      />
    </div>
  );
};
