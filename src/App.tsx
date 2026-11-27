import { useState, useRef, useEffect } from 'react';
import type { WorkflowStep, UploadedReportImage } from './types/workflow';
import type {
  ReportSheetData,
  ReportRowData,
  FieldMetadata,
  HeaderFieldKey,
} from './types/report';
import { createEmptyReportSheet } from './data/mockReportData';
import { recognizeReportScan } from './services/recognitionApi';
import { convertBackendResponseToReportSheet } from './utils/recognitionAdapter';
import { Header } from './components/layout/Header';
import { StepNavigation } from './components/layout/StepNavigation';
import { UploadStage } from './components/stages/UploadStage';
import { ReviewStage } from './components/stages/ReviewStage';
import { DownloadStage } from './components/stages/DownloadStage';

export function App() {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedReportImage[]>([]);
  const [reportsData, setReportsData] = useState<Record<number, ReportSheetData>>({});
  // Data revision counter to detect any edits and invalidate stale compiled workbooks
  const [dataVersion, setDataVersion] = useState<number>(0);

  // Recognition progress states
  const [isRecognizing, setIsRecognizing] = useState<boolean>(false);
  const [recognitionProgressText, setRecognitionProgressText] = useState<string>('');

  // Keep a ref to uploadedFiles to safely revoke object URLs on app unmount
  const uploadedFilesRef = useRef<UploadedReportImage[]>(uploadedFiles);

  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  useEffect(() => {
    return () => {
      // Revoke all remaining object URLs on final unmount
      uploadedFilesRef.current.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  const handleAddFiles = (newFiles: UploadedReportImage[]) => {
    const nextUploadedFiles = [...uploadedFiles, ...newFiles];
    setUploadedFiles(nextUploadedFiles);
    setDataVersion((v) => v + 1);

    setReportsData((prev) => {
      const updated = { ...prev };
      nextUploadedFiles.forEach((file, index) => {
        const sheetIndex = index + 1;
        if (!updated[sheetIndex] || updated[sheetIndex].fileId !== file.id) {
          // New file detected: clean sheet ready for OCR recognition
          updated[sheetIndex] = createEmptyReportSheet(sheetIndex, file.name, file.id);
        } else {
          updated[sheetIndex] = {
            ...updated[sheetIndex],
            fileName: file.name,
            fileId: file.id,
          };
        }
      });
      return updated;
    });
  };

  const handleRemoveFile = (id: string) => {
    const target = uploadedFiles.find((item) => item.id === id);
    if (target) {
      URL.revokeObjectURL(target.previewUrl);
    }

    const nextUploadedFiles = uploadedFiles.filter((item) => item.id !== id);
    setUploadedFiles(nextUploadedFiles);
    setDataVersion((v) => v + 1);

    setReportsData((prev) => {
      const updated = { ...prev };
      const newReports: Record<number, ReportSheetData> = {};

      nextUploadedFiles.forEach((file, index) => {
        const newSheetIndex = index + 1;
        const existingSheet = Object.values(updated).find((s) => s.fileId === file.id);

        if (existingSheet) {
          newReports[newSheetIndex] = {
            ...existingSheet,
            sheetIndex: newSheetIndex,
            sheetName: `Report ${newSheetIndex}`,
            fileName: file.name,
            fileId: file.id,
          };
        } else {
          newReports[newSheetIndex] = createEmptyReportSheet(newSheetIndex, file.name, file.id);
        }
      });

      return newReports;
    });
  };

  const handleClearFiles = () => {
    uploadedFiles.forEach((item) => {
      URL.revokeObjectURL(item.previewUrl);
    });
    setUploadedFiles([]);
    setReportsData({});
    setDataVersion((v) => v + 1);
  };

  const handleResetWorkflow = () => {
    handleClearFiles();
    setCurrentStep('upload');
  };

  // Run recognition for all uploaded files when continuing from Upload to Review
  const handleProceedToReview = async () => {
    if (uploadedFiles.length === 0) return;

    setIsRecognizing(true);
    const updatedReports: Record<number, ReportSheetData> = { ...reportsData };

    for (let i = 0; i < uploadedFiles.length; i++) {
      const fileItem = uploadedFiles[i];
      const sheetIndex = i + 1;
      const currentSheet = updatedReports[sheetIndex];

      // Only skip if already recognized for this EXACT file instance
      if (currentSheet?.recognitionStatus === 'success' && currentSheet?.fileId === fileItem.id) {
        continue;
      }

      setRecognitionProgressText(
        `Analyzing Report ${sheetIndex} of ${uploadedFiles.length}: "${fileItem.name}"...`
      );

      try {
        const recognitionRes = await recognizeReportScan(fileItem.file);
        const convertedSheet = convertBackendResponseToReportSheet(
          recognitionRes,
          sheetIndex,
          fileItem.id
        );
        updatedReports[sheetIndex] = {
          ...convertedSheet,
          recognitionStatus: 'success',
          recognitionError: undefined,
        };
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Could not contact Walvoil backend recognition service.';
        const fallbackSheet = currentSheet || createEmptyReportSheet(sheetIndex, fileItem.name, fileItem.id);
        updatedReports[sheetIndex] = {
          ...fallbackSheet,
          recognitionStatus: 'failed',
          recognitionError: errorMessage,
        };
      }
    }

    setReportsData(updatedReports);
    setIsRecognizing(false);
    setRecognitionProgressText('');
    setDataVersion((v) => v + 1);
    setCurrentStep('review');
  };

  // Re-run recognition for a specific sheet on demand from Review Stage
  const handleReRunRecognition = async (sheetIndex: number) => {
    const fileItem = uploadedFiles[sheetIndex - 1];
    if (!fileItem) return;

    try {
      const res = await recognizeReportScan(fileItem.file);
      const convertedSheet = convertBackendResponseToReportSheet(res, sheetIndex, fileItem.id);
      setReportsData((prev) => ({
        ...prev,
        [sheetIndex]: convertedSheet,
      }));
      setDataVersion((v) => v + 1);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Re-recognition failed';
      setReportsData((prev) => {
        const current = prev[sheetIndex];
        if (!current) return prev;
        return {
          ...prev,
          [sheetIndex]: {
            ...current,
            recognitionError: errMsg,
          },
        };
      });
    }
  };

  // Header field edit handler
  const handleUpdateHeader = (
    sheetIndex: number,
    field: HeaderFieldKey,
    value: string
  ) => {
    setDataVersion((v) => v + 1);
    setReportsData((prev) => {
      const sheet = prev[sheetIndex];
      if (!sheet) return prev;

      const newFlagged = { ...(sheet.headers.flaggedFields || {}) };
      if (field in newFlagged) {
        delete newFlagged[field];
      }

      // Update metadata item
      const meta = sheet.headers.metadata?.[field];
      const isCorrected = meta ? value !== meta.originalValue : true;
      const updatedMeta: FieldMetadata | undefined = meta
        ? {
            ...meta,
            currentValue: value,
            isCorrected,
            status: isCorrected ? 'corrected' : meta.originalValue ? 'needs_review' : 'empty',
          }
        : undefined;

      const updatedMetaObj: Partial<Record<HeaderFieldKey, FieldMetadata>> = {
        ...(sheet.headers.metadata || {}),
        [field]: updatedMeta,
      };

      return {
        ...prev,
        [sheetIndex]: {
          ...sheet,
          headers: {
            ...sheet.headers,
            [field]: value,
            flaggedFields: newFlagged,
            metadata: updatedMetaObj,
          },
          lastEditedAt: Date.now(),
        },
      };
    });
  };

  // Table row cell edit handler
  const handleUpdateRow = (
    sheetIndex: number,
    rowId: string,
    field: keyof Omit<ReportRowData, 'id' | 'flaggedFields' | 'metadata'>,
    value: string
  ) => {
    setDataVersion((v) => v + 1);
    setReportsData((prev) => {
      const sheet = prev[sheetIndex];
      if (!sheet) return prev;

      const updatedRows = sheet.rows.map((row) => {
        if (row.id !== rowId) return row;

        const newFlagged = { ...row.flaggedFields };
        if (newFlagged && field in newFlagged) {
          delete (newFlagged as Record<string, boolean>)[field];
        }

        // Update metadata item
        const meta = row.metadata?.[field as keyof typeof row.metadata];
        const isCorrected = meta ? value !== meta.originalValue : true;
        const updatedMeta: FieldMetadata = meta
          ? {
              ...meta,
              currentValue: value,
              isCorrected,
              status: isCorrected ? 'corrected' : meta.originalValue ? 'needs_review' : 'empty',
            }
          : {
              fieldId: `${row.id}_${String(field)}`,
              fieldName: String(field),
              section: field === 'pwh' || field === 'ordNo' ? 'table_subrow' : 'table',
              originalValue: '',
              currentValue: value,
              status: value ? 'corrected' : 'empty',
              isCorrected: Boolean(value),
              isConfirmed: false,
            };

        const updatedRowMeta = {
          ...(row.metadata || {}),
          [field]: updatedMeta,
        };

        const nextPwh = field === 'pwh' ? value : (row.pwh || '');
        const nextOrd = field === 'ordNo' ? value : (row.ordNo || '');
        const nextBatchAndOrder =
          field === 'pwh' || field === 'ordNo'
            ? [nextPwh ? `PWH: ${nextPwh}` : '', nextOrd ? `Ord No: ${nextOrd}` : '']
                .filter(Boolean)
                .join('\n')
            : field === 'batchAndOrder'
            ? value
            : row.batchAndOrder;

        return {
          ...row,
          [field]: value,
          batchAndOrder: nextBatchAndOrder,
          flaggedFields: newFlagged,
          metadata: updatedRowMeta,
        };
      });

      return {
        ...prev,
        [sheetIndex]: {
          ...sheet,
          rows: updatedRows,
          lastEditedAt: Date.now(),
        },
      };
    });
  };

  // Explicit confirmation of an individual field
  const handleConfirmField = (
    sheetIndex: number,
    rowId: string | 'header',
    fieldKey: string
  ) => {
    setDataVersion((v) => v + 1);
    setReportsData((prev) => {
      const sheet = prev[sheetIndex];
      if (!sheet) return prev;

      if (rowId === 'header') {
        const hKey = fieldKey as HeaderFieldKey;
        const meta = sheet.headers.metadata?.[hKey];
        if (!meta) return prev;

        const newFlagged = { ...(sheet.headers.flaggedFields || {}) };
        delete newFlagged[hKey];

        const newMeta: Partial<Record<HeaderFieldKey, FieldMetadata>> = {
          ...(sheet.headers.metadata || {}),
          [hKey]: { ...meta, status: 'confirmed', isConfirmed: true },
        };

        return {
          ...prev,
          [sheetIndex]: {
            ...sheet,
            headers: {
              ...sheet.headers,
              flaggedFields: newFlagged,
              metadata: newMeta,
            },
            lastEditedAt: Date.now(),
          },
        };
      }

      // Row cell confirm
      const updatedRows = sheet.rows.map((row) => {
        if (row.id !== rowId) return row;

        const meta = row.metadata?.[fieldKey as keyof typeof row.metadata];
        if (!meta) return row;

        const newFlagged = { ...row.flaggedFields };
        delete (newFlagged as Record<string, boolean>)[fieldKey];

        return {
          ...row,
          flaggedFields: newFlagged,
          metadata: {
            ...row.metadata,
            [fieldKey]: { ...meta, status: 'confirmed', isConfirmed: true },
          },
        };
      });

      return {
        ...prev,
        [sheetIndex]: {
          ...sheet,
          rows: updatedRows,
          lastEditedAt: Date.now(),
        },
      };
    });
  };

  // Revert a corrected field back to original OCR prediction
  const handleRevertField = (
    sheetIndex: number,
    rowId: string | 'header',
    fieldKey: string
  ) => {
    setDataVersion((v) => v + 1);
    setReportsData((prev) => {
      const sheet = prev[sheetIndex];
      if (!sheet) return prev;

      if (rowId === 'header') {
        const hKey = fieldKey as HeaderFieldKey;
        const meta = sheet.headers.metadata?.[hKey];
        if (!meta) return prev;

        const newMeta: Partial<Record<HeaderFieldKey, FieldMetadata>> = {
          ...(sheet.headers.metadata || {}),
          [hKey]: {
            ...meta,
            currentValue: meta.originalValue,
            isCorrected: false,
            status: meta.originalValue ? 'needs_review' : 'empty',
          },
        };

        return {
          ...prev,
          [sheetIndex]: {
            ...sheet,
            headers: {
              ...sheet.headers,
              [hKey]: meta.originalValue,
              metadata: newMeta,
            },
            lastEditedAt: Date.now(),
          },
        };
      }

      // Row cell revert
      const updatedRows = sheet.rows.map((row) => {
        if (row.id !== rowId) return row;

        const meta = row.metadata?.[fieldKey as keyof typeof row.metadata];
        if (!meta) return row;

        return {
          ...row,
          [fieldKey]: meta.originalValue,
          metadata: {
            ...row.metadata,
            [fieldKey]: {
              ...meta,
              currentValue: meta.originalValue,
              isCorrected: false,
              status: meta.originalValue ? 'needs_review' : 'empty',
            },
          },
        };
      });

      return {
        ...prev,
        [sheetIndex]: {
          ...sheet,
          rows: updatedRows,
          lastEditedAt: Date.now(),
        },
      };
    });
  };

  // Confirm all fields in an entire row
  const handleConfirmRow = (sheetIndex: number, rowId: string) => {
    setDataVersion((v) => v + 1);
    setReportsData((prev) => {
      const sheet = prev[sheetIndex];
      if (!sheet) return prev;

      const updatedRows = sheet.rows.map((row) => {
        if (row.id !== rowId) return row;

        const updatedRowMeta = { ...row.metadata };
        if (row.metadata) {
          Object.keys(row.metadata).forEach((k) => {
            const m = updatedRowMeta[k as keyof typeof updatedRowMeta];
            if (m && m.status === 'needs_review') {
              updatedRowMeta[k as keyof typeof updatedRowMeta] = {
                ...m,
                status: 'confirmed',
                isConfirmed: true,
              };
            }
          });
        }

        return {
          ...row,
          flaggedFields: {},
          metadata: updatedRowMeta,
        };
      });

      return {
        ...prev,
        [sheetIndex]: {
          ...sheet,
          rows: updatedRows,
          lastEditedAt: Date.now(),
        },
      };
    });
  };

  // Confirm all remaining review fields in the entire sheet
  const handleConfirmAllSheet = (sheetIndex: number) => {
    setDataVersion((v) => v + 1);
    setReportsData((prev) => {
      const sheet = prev[sheetIndex];
      if (!sheet) return prev;

      // Confirm headers
      const updatedHdrMeta: Partial<Record<HeaderFieldKey, FieldMetadata>> = {
        ...(sheet.headers.metadata || {}),
      };
      if (sheet.headers.metadata) {
        (Object.keys(sheet.headers.metadata) as HeaderFieldKey[]).forEach((k) => {
          const m = updatedHdrMeta[k];
          if (m && m.status === 'needs_review') {
            updatedHdrMeta[k] = {
              ...m,
              status: 'confirmed',
              isConfirmed: true,
            };
          }
        });
      }

      // Confirm rows
      const updatedRows = sheet.rows.map((row) => {
        const updatedRowMeta = { ...row.metadata };
        if (row.metadata) {
          Object.keys(row.metadata).forEach((k) => {
            const m = updatedRowMeta[k as keyof typeof updatedRowMeta];
            if (m && m.status === 'needs_review') {
              updatedRowMeta[k as keyof typeof updatedRowMeta] = {
                ...m,
                status: 'confirmed',
                isConfirmed: true,
              };
            }
          });
        }

        return {
          ...row,
          flaggedFields: {},
          metadata: updatedRowMeta,
        };
      });

      return {
        ...prev,
        [sheetIndex]: {
          ...sheet,
          headers: {
            ...sheet.headers,
            flaggedFields: {},
            metadata: updatedHdrMeta,
          },
          rows: updatedRows,
          lastEditedAt: Date.now(),
        },
      };
    });
  };

  // Set the selected active field for image scan coordinate highlighting
  const handleSelectField = (sheetIndex: number, fieldId: string) => {
    setReportsData((prev) => {
      const sheet = prev[sheetIndex];
      if (!sheet) return prev;
      return {
        ...prev,
        [sheetIndex]: {
          ...sheet,
          selectedFieldId: fieldId,
        },
      };
    });
  };

  // Toggle or clear verification flag for a cell
  const handleToggleFieldFlag = (sheetIndex: number, rowId: string, field: string) => {
    setDataVersion((v) => v + 1);
    setReportsData((prev) => {
      const sheet = prev[sheetIndex];
      if (!sheet) return prev;

      const updatedRows = sheet.rows.map((row) => {
        if (row.id !== rowId) return row;

        const currentFlag = Boolean(row.flaggedFields?.[field as keyof typeof row.flaggedFields]);
        const newFlagged = {
          ...row.flaggedFields,
          [field]: !currentFlag,
        };

        return {
          ...row,
          flaggedFields: newFlagged,
        };
      });

      return {
        ...prev,
        [sheetIndex]: {
          ...sheet,
          rows: updatedRows,
          lastEditedAt: Date.now(),
        },
      };
    });
  };

  // Reset a sheet back to empty DPR form
  const handleClearSheet = (sheetIndex: number) => {
    const file = uploadedFiles[sheetIndex - 1];
    setReportsData((prev) => ({
      ...prev,
      [sheetIndex]: createEmptyReportSheet(
        sheetIndex,
        file?.name || `Report_${sheetIndex}.jpg`,
        file?.id
      ),
    }));
    setDataVersion((v) => v + 1);
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb] flex flex-col font-sans text-slate-800">
      {/* Top Application Header */}
      <Header />

      {/* Workflow Navigation */}
      <StepNavigation
        currentStep={currentStep}
        onStepChange={(step) => {
          if (step === 'review' && currentStep === 'upload' && uploadedFiles.length > 0) {
            handleProceedToReview();
          } else {
            setCurrentStep(step);
          }
        }}
        canNavigateToReview={uploadedFiles.length > 0}
      />

      {/* Main Workspace Stage */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentStep === 'upload' && (
          <UploadStage
            uploadedFiles={uploadedFiles}
            onAddFiles={handleAddFiles}
            onRemoveFile={handleRemoveFile}
            onClearFiles={handleClearFiles}
            onContinue={handleProceedToReview}
            isRecognizing={isRecognizing}
            recognitionProgressText={recognitionProgressText}
          />
        )}

        {currentStep === 'review' && (
          <ReviewStage
            uploadedFiles={uploadedFiles}
            reportsData={reportsData}
            onUpdateHeader={handleUpdateHeader}
            onUpdateRow={handleUpdateRow}
            onConfirmField={handleConfirmField}
            onRevertField={handleRevertField}
            onConfirmRow={handleConfirmRow}
            onConfirmAllSheet={handleConfirmAllSheet}
            onSelectField={handleSelectField}
            onReRunRecognition={handleReRunRecognition}
            onToggleFieldFlag={handleToggleFieldFlag}
            onClearSheet={handleClearSheet}
            onBack={() => setCurrentStep('upload')}
            onContinue={() => setCurrentStep('download')}
          />
        )}

        {currentStep === 'download' && (
          <DownloadStage
            reportsData={reportsData}
            uploadedFiles={uploadedFiles}
            dataVersion={dataVersion}
            onBack={() => setCurrentStep('review')}
            onReset={handleResetWorkflow}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/60 py-4 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span>Walvoil Production Planning &amp; Digitisation System • Process Completed</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
