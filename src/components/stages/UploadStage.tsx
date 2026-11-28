import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileImage,
  AlertCircle,
  X,
  Trash2,
  Eye,
  Plus,
  ArrowRight,
} from 'lucide-react';
import type { UploadedReportImage } from '../../types/workflow';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { extractPagesFromPdf } from '../../utils/pdfProcessor';
import { getScanQuotaStatus } from '../../services/recognitionApi';

interface UploadStageProps {
  uploadedFiles: UploadedReportImage[];
  onAddFiles: (newFiles: UploadedReportImage[]) => void;
  onRemoveFile: (id: string) => void;
  onClearFiles: () => void;
  onContinue: () => void;
  isRecognizing?: boolean;
  recognitionProgressText?: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function isSupportedFile(file: File): boolean {
  if (file.type && ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    return true;
  }
  const name = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export const UploadStage: React.FC<UploadStageProps> = ({
  uploadedFiles,
  onAddFiles,
  onRemoveFile,
  onClearFiles,
  onContinue,
  isRecognizing = false,
  recognitionProgressText = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [previewingImage, setPreviewingImage] = useState<UploadedReportImage | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [pdfStatusText, setPdfStatusText] = useState('');

  // Confirmation modal states
  const [isConfirmClearAllOpen, setIsConfirmClearAllOpen] = useState(false);
  const [filePendingRemoval, setFilePendingRemoval] = useState<UploadedReportImage | null>(null);
  const [quotaStatus, setQuotaStatus] = useState(() => getScanQuotaStatus());

  useEffect(() => {
    const updateQuota = () => setQuotaStatus(getScanQuotaStatus());
    updateQuota();
    const timer = setInterval(updateQuota, 1000);
    window.addEventListener('walvoil_quota_updated', updateQuota);
    return () => {
      clearInterval(timer);
      window.removeEventListener('walvoil_quota_updated', updateQuota);
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const handleImageError = (fileId: string) => {
    setImageErrors((prev) => ({ ...prev, [fileId]: true }));
  };

  const processFiles = async (files: File[]) => {
    if (!files || files.length === 0) {
      setValidationErrors((prev) => [...prev, 'No files were provided for upload.']);
      return;
    }

    const errors: string[] = [];
    const validFilesToAdd: UploadedReportImage[] = [];
    const currentBatchKeys = new Set<string>();

    for (const file of files) {
      // 1. Validate empty file (0 bytes)
      if (file.size === 0) {
        errors.push(`"${file.name}" is an empty file (0 bytes) and cannot be processed.`);
        continue;
      }

      // 2. Validate file type
      if (!isSupportedFile(file)) {
        errors.push(
          `Unsupported file format for "${file.name}". Accepted formats: JPG, JPEG, PNG, WEBP, PDF.`
        );
        continue;
      }

      // 3. Validate file size (50 MB limit)
      if (file.size > MAX_FILE_SIZE) {
        errors.push(
          `"${file.name}" (${formatFileSize(file.size)}) exceeds the 50 MB limit.`
        );
        continue;
      }

      const isPdf =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        try {
          setIsProcessingPdf(true);
          setPdfStatusText(`Reading PDF document "${file.name}"...`);
          const pageFiles = await extractPagesFromPdf(file, (curr, total) => {
            setPdfStatusText(`Extracting page ${curr} of ${total} from "${file.name}"...`);
          });

          if (pageFiles.length === 0) {
            errors.push(`No pages could be extracted from "${file.name}".`);
            continue;
          }

          for (const pageFile of pageFiles) {
            const fileKey = `${pageFile.name}_${pageFile.size}`;
            if (currentBatchKeys.has(fileKey)) continue;
            currentBatchKeys.add(fileKey);

            const previewUrl = URL.createObjectURL(pageFile);
            validFilesToAdd.push({
              id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              file: pageFile,
              previewUrl,
              name: pageFile.name,
              size: pageFile.size,
              formattedSize: formatFileSize(pageFile.size),
              type: 'image/jpeg',
              lastModified: pageFile.lastModified,
            });
          }
        } catch (pdfErr) {
          const msg = pdfErr instanceof Error ? pdfErr.message : 'Unknown PDF error';
          errors.push(`Failed to extract pages from "${file.name}": ${msg}`);
        } finally {
          setIsProcessingPdf(false);
          setPdfStatusText('');
        }
      } else {
        // Standard Image File Handling
        const fileKey = `${file.name}_${file.size}_${file.lastModified}`;
        const isAlreadyUploaded = uploadedFiles.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
        );

        if (isAlreadyUploaded || currentBatchKeys.has(fileKey)) {
          errors.push(`Duplicate file skipped: "${file.name}" is already selected.`);
          continue;
        }

        currentBatchKeys.add(fileKey);

        const previewUrl = URL.createObjectURL(file);
        validFilesToAdd.push({
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          file,
          previewUrl,
          name: file.name,
          size: file.size,
          formattedSize: formatFileSize(file.size),
          type: file.type || 'image',
          lastModified: file.lastModified,
        });
      }
    }

    if (errors.length > 0) {
      setValidationErrors((prev) => [...prev, ...errors]);
    }

    if (validFilesToAdd.length > 0) {
      onAddFiles(validFilesToAdd);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      setIsDragging(false);
      dragCounter.current = 0;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) {
      setValidationErrors((prev) => [...prev, 'No valid files detected in the dropped selection.']);
      return;
    }

    processFiles(Array.from(e.dataTransfer.files));
  };

  const dismissError = (index: number) => {
    setValidationErrors((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAllErrors = () => {
    setValidationErrors([]);
  };

  const handleConfirmClearAll = () => {
    onClearFiles();
    setIsConfirmClearAllOpen(false);
  };

  const handleConfirmRemoveFile = () => {
    if (filePendingRemoval) {
      onRemoveFile(filePendingRemoval.id);
      setFilePendingRemoval(null);
    }
  };

  const totalPages = uploadedFiles.length;

  return (
    <div className="space-y-6">
      {/* Hidden file input for file selection */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleFileInputChange}
        className="hidden"
        aria-label="Upload report files"
      />

      {/* Main Top Banner: Required User Experience Header */}
      <div className="bg-white border border-slate-200 rounded p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
              Upload Production Reports
            </h2>
            <Badge variant="navy">Stage 1</Badge>
            {totalPages > 0 && (
              <Badge variant="success">
                {totalPages} {totalPages === 1 ? 'Page' : 'Pages'} Selected
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Upload clear photos or scanned images of the handwritten Daily Production Report.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
              quotaStatus.remaining <= 2
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                quotaStatus.remaining <= 2 ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'
              }`}
            ></span>
            {quotaStatus.remaining > 0
              ? `${quotaStatus.remaining} of 15 scans available this min`
              : `Limit reached (ready in ${quotaStatus.resetSeconds}s)`}
          </span>
          <Button
            variant="walvoil-red"
            disabled={totalPages === 0 || isRecognizing}
            icon={
              isRecognizing ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )
            }
            onClick={onContinue}
            title={
              isRecognizing
                ? 'Running handwriting recognition...'
                : totalPages === 0
                ? 'Select at least one report image to proceed'
                : 'Proceed to Review & Confirm'
            }
          >
            {isRecognizing ? 'Running Recognition...' : 'Continue to Review'}
          </Button>
        </div>
      </div>

      {/* Recognition Progress Banner */}
      {isRecognizing && (
        <div className="bg-blue-50/90 border border-blue-200 rounded p-4 text-xs text-blue-900 flex items-center gap-3 shadow-2xs animate-pulse">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
          <div>
            <span className="font-semibold text-blue-950">
              Walvoil DPR Recognition Pipeline Active:{' '}
            </span>
            <span className="text-blue-800">
              {recognitionProgressText || 'Analyzing document structure & recognizing handwriting...'}
            </span>
          </div>
        </div>
      )}

      {/* PDF Splitting Progress Banner */}
      {isProcessingPdf && (
        <div className="bg-slate-50 border border-slate-300 rounded p-4 text-xs text-slate-800 flex items-center gap-3 shadow-2xs">
          <div className="w-5 h-5 border-2 border-[#0f2a4a] border-t-transparent rounded-full animate-spin shrink-0" />
          <div>
            <span className="font-semibold text-slate-950">Splitting Multi-Page PDF: </span>
            <span className="text-slate-700">{pdfStatusText}</span>
          </div>
        </div>
      )}

      {/* Validation Errors Alert Banner */}
      {validationErrors.length > 0 && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-200 rounded p-4 text-xs text-amber-900 space-y-2 shadow-2xs"
        >
          <div className="flex items-center justify-between font-semibold border-b border-amber-200/80 pb-2">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Attention: Some files could not be added</span>
            </div>
            <button
              type="button"
              onClick={clearAllErrors}
              className="text-amber-700 hover:text-amber-900 text-[11px] underline font-medium cursor-pointer"
            >
              Dismiss all
            </button>
          </div>
          <ul className="space-y-1.5 pt-1">
            {validationErrors.map((err, idx) => (
              <li key={idx} className="flex items-start justify-between gap-2">
                <span className="leading-snug">• {err}</span>
                <button
                  type="button"
                  onClick={() => dismissError(idx)}
                  className="text-amber-600 hover:text-amber-900 p-0.5 cursor-pointer"
                  aria-label="Dismiss error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Upload Area and Selected Thumbnails */}
        <div className="lg:col-span-2 space-y-6">
          {/* Prominent Drag and Drop Upload Area */}
          <Card
            title="Scan Document Upload"
            subtitle="JPG, JPEG, PNG, WEBP, or multi-page PDF documents up to 50 MB"
            action={
              totalPages > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Add More Files
                </Button>
              ) : null
            }
          >
            <div
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              tabIndex={0}
              role="button"
              aria-label="Drag and drop area. Click to browse files"
              className={`border-2 border-dashed rounded p-8 text-center transition-all cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-[#0f2a4a]/30 ${
                isDragging
                  ? 'border-[#0f2a4a] bg-blue-50/50 scale-[0.99]'
                  : 'border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50'
              }`}
            >
              <div
                className={`mx-auto w-12 h-12 rounded flex items-center justify-center mb-3 transition-colors ${
                  isDragging
                    ? 'bg-[#0f2a4a] text-white'
                    : 'bg-slate-100 border border-slate-200 text-[#0f2a4a]'
                }`}
              >
                <UploadCloud className="w-6 h-6" />
              </div>

              <h4 className="text-sm font-semibold text-slate-800">
                {isDragging
                  ? 'Drop report image files now'
                  : 'Drag and drop handwritten report photos or scans here'}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Select multiple files or a multi-page PDF. Supports JPG, PNG, WEBP and PDF (Max 50 MB).
              </p>

              <div className="mt-4 flex items-center justify-center">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  Browse Files
                </Button>
              </div>

              <div className="mt-3 text-[11px] text-slate-400">
                Files are processed securely in local browser memory without server uploads. Note: refreshing the browser resets the active session.
              </div>
            </div>
          </Card>

          {/* Selected Reports Thumbnails Grid */}
          {totalPages > 0 ? (
            <Card
              title={`Selected Report Pages (${totalPages})`}
              subtitle="Review uploaded sheets or remove any unclear scans before proceeding"
              action={
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={() => setIsConfirmClearAllOpen(true)}
                  title="Remove all uploaded report images"
                >
                  Remove All Images
                </Button>
              }
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {uploadedFiles.map((item, index) => {
                  const hasError = imageErrors[item.id];

                  return (
                    <div
                      key={item.id}
                      className="border border-slate-200 rounded bg-white overflow-hidden shadow-2xs hover:border-slate-300 transition-colors flex flex-col"
                    >
                      {/* Thumbnail Image Box */}
                      <div className="relative h-44 bg-slate-100 flex items-center justify-center overflow-hidden border-b border-slate-200 group">
                        {hasError ? (
                          <div className="flex flex-col items-center justify-center p-4 text-center">
                            <AlertCircle className="w-7 h-7 text-amber-600 mb-1" />
                            <span className="text-[11px] font-medium text-slate-700">
                              Preview Error
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Image data corrupted
                            </span>
                          </div>
                        ) : (
                          <img
                            src={item.previewUrl}
                            alt={`Daily Production Report Page ${index + 1}: ${item.name}`}
                            onError={() => handleImageError(item.id)}
                            className="w-full h-full object-contain p-1"
                            loading="lazy"
                          />
                        )}

                        {/* Top Left Page Badge */}
                        <div className="absolute top-2 left-2 pointer-events-none">
                          <span className="inline-flex items-center text-[10px] font-semibold bg-[#0f2a4a] text-white px-2 py-0.5 rounded shadow-xs">
                            Page {index + 1}
                          </span>
                        </div>

                        {/* Hover Overlay with Inspect Action */}
                        {!hasError && (
                          <div className="absolute inset-0 bg-[#0f2a4a]/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPreviewingImage(item)}
                              className="bg-white text-slate-800 hover:text-slate-900 p-2 rounded shadow-sm text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                              title="Inspect image in full view"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Inspect</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Metadata & Controls Footer */}
                      <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                        <div>
                          <p
                            className="text-xs font-semibold text-slate-800 truncate"
                            title={item.name}
                          >
                            {item.name}
                          </p>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                            <span>{item.formattedSize}</span>
                            <span className="uppercase font-mono text-[10px] text-slate-400">
                              {item.name.split('.').pop()}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                          {!hasError ? (
                            <button
                              type="button"
                              onClick={() => setPreviewingImage(item)}
                              className="text-[11px] text-[#0f2a4a] hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              View
                            </button>
                          ) : (
                            <span className="text-[11px] text-amber-700 italic">Unreadable</span>
                          )}

                          <button
                            type="button"
                            onClick={() => setFilePendingRemoval(item)}
                            className="text-[11px] text-red-600 hover:text-red-800 font-medium inline-flex items-center gap-1 p-1 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title={`Remove ${item.name}`}
                            aria-label={`Remove ${item.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : (
            <Card
              title="Batch Document Queue"
              subtitle="Files queued for processing in this session"
              action={<Badge variant="neutral">0 Files Loaded</Badge>}
            >
              <div className="text-center py-10 text-slate-400">
                <FileImage className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-medium text-slate-600">No scanned files uploaded yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Drag and drop files above or click Browse Files to select photos of the report.
                </p>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Upload Specifications */}
        <div className="space-y-6">
          <Card title="Upload Specifications" subtitle="Image requirements">
            <dl className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500">Allowed Formats:</dt>
                <dd className="font-semibold text-slate-800">JPG, PNG, WEBP, PDF</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500">Maximum File Size:</dt>
                <dd className="font-semibold text-slate-800">50 MB per file</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500">Multi-File Intake:</dt>
                <dd className="font-semibold text-slate-800">Supported (Batch)</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500">Storage Policy:</dt>
                <dd className="font-medium text-slate-700">In-Browser Memory</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500">Duplicates:</dt>
                <dd className="font-medium text-slate-700">Automatically Filtered</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      {/* Confirmation Modal: Remove All Images */}
      <ConfirmationModal
        isOpen={isConfirmClearAllOpen}
        title="Remove All Uploaded Scans?"
        message={`Are you sure you want to remove all ${totalPages} uploaded report images? Any entered report data for these pages will be cleared.`}
        confirmLabel="Remove All"
        cancelLabel="Keep Images"
        variant="danger"
        onConfirm={handleConfirmClearAll}
        onCancel={() => setIsConfirmClearAllOpen(false)}
      />

      {/* Confirmation Modal: Remove Single Image */}
      <ConfirmationModal
        isOpen={Boolean(filePendingRemoval)}
        title="Remove Report Image?"
        message={`Remove "${filePendingRemoval?.name || 'this report'}"? The corresponding report review sheet and its data will also be removed.`}
        confirmLabel="Remove Image"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmRemoveFile}
        onCancel={() => setFilePendingRemoval(null)}
      />

      {/* Light Inspection Modal for Reviewing a Single Scan */}
      {previewingImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4 backdrop-blur-2xs select-none"
          onClick={() => setPreviewingImage(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-modal-title"
        >
          <div
            className="bg-white border border-slate-300 rounded max-w-4xl w-full max-h-[92vh] flex flex-col shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 id="preview-modal-title" className="text-sm font-semibold text-slate-900">
                  {previewingImage.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Size: {previewingImage.formattedSize} • Local In-Memory Preview
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewingImage(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-200 transition-colors cursor-pointer"
                aria-label="Close image inspection"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Scanned Image */}
            <div className="flex-1 overflow-auto p-4 bg-slate-100 flex items-center justify-center min-h-[300px]">
              <img
                src={previewingImage.previewUrl}
                alt={previewingImage.name}
                className="max-h-[70vh] w-auto max-w-full object-contain shadow-xs border border-slate-200 bg-white"
              />
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500">
              <span>Inspect image clarity before continuing to Review.</span>
              <Button variant="secondary" size="sm" onClick={() => setPreviewingImage(null)}>
                Close Preview
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
