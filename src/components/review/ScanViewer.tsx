import React, { useState, useRef, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  X,
  FileImage,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Crosshair,
} from 'lucide-react';
import type { FieldMetadata } from '../../types/report';

interface ScanViewerProps {
  imageUrl?: string;
  fileName?: string;
  sheetIndex: number;
  selectedFieldMeta?: FieldMetadata | null;
  onNavigatePrevReview?: () => void;
  onNavigateNextReview?: () => void;
  reviewQueueCount?: number;
  currentReviewIndex?: number;
}

export const ScanViewer: React.FC<ScanViewerProps> = ({
  imageUrl,
  fileName = 'Report Scan',
  sheetIndex,
  selectedFieldMeta,
  onNavigatePrevReview,
  onNavigateNextReview,
  reviewQueueCount = 0,
  currentReviewIndex = 0,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [hasImageError, setHasImageError] = useState<boolean>(false);
  const [naturalDims, setNaturalDims] = useState<{ width: number; height: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 3.0));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    setNaturalDims({
      width: target.naturalWidth,
      height: target.naturalHeight,
    });
  };

  // Center on currently selected field bounding box
  const centerOnSelectedField = useCallback(() => {
    if (!selectedFieldMeta || !naturalDims || !containerRef.current) return;

    const coords =
      selectedFieldMeta.originalCoordinates?.boundingBox ||
      selectedFieldMeta.deskewedBox;

    if (!coords) return;

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // Relative center of the field in image coordinates (0.0 to 1.0)
    const relCenterX = (coords.x + coords.width / 2) / naturalDims.width;
    const relCenterY = (coords.y + coords.height / 2) / naturalDims.height;

    // Calculate pan required to center
    const targetZoom = Math.max(zoomLevel, 1.5);
    setZoomLevel(targetZoom);

    const offsetX = (0.5 - relCenterX) * containerWidth * targetZoom;
    const offsetY = (0.5 - relCenterY) * containerHeight * targetZoom;

    setPanOffset({
      x: Math.round(offsetX),
      y: Math.round(offsetY),
    });
  }, [selectedFieldMeta, naturalDims, zoomLevel]);

  // Pan interaction handling
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1 && e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Compute bounding box styling for overlay
  const renderHighlightBox = () => {
    if (!selectedFieldMeta || !naturalDims) return null;

    const coords =
      selectedFieldMeta.originalCoordinates?.boundingBox ||
      selectedFieldMeta.deskewedBox;

    if (!coords || coords.width <= 0 || coords.height <= 0) return null;

    const leftPct = (coords.x / naturalDims.width) * 100;
    const topPct = (coords.y / naturalDims.height) * 100;
    const widthPct = (coords.width / naturalDims.width) * 100;
    const heightPct = (coords.height / naturalDims.height) * 100;

    let borderColor = 'border-amber-500 shadow-amber-500/50';
    let bgColor = 'bg-amber-400/20';
    let badgeColor = 'bg-amber-600 text-white';
    let label = 'Needs Review';

    if (selectedFieldMeta.status === 'confirmed') {
      borderColor = 'border-emerald-500 shadow-emerald-500/50';
      bgColor = 'bg-emerald-400/20';
      badgeColor = 'bg-emerald-600 text-white';
      label = 'Confirmed';
    } else if (selectedFieldMeta.status === 'corrected') {
      borderColor = 'border-blue-500 shadow-blue-500/50';
      bgColor = 'bg-blue-400/20';
      badgeColor = 'bg-blue-600 text-white';
      label = 'Corrected';
    } else if (selectedFieldMeta.status === 'signature_region') {
      borderColor = 'border-purple-500 shadow-purple-500/50';
      bgColor = 'bg-purple-400/20';
      badgeColor = 'bg-purple-600 text-white';
      label = 'Signature Region';
    }

    return (
      <div
        className={`absolute border-2 pointer-events-none rounded-xs transition-all duration-150 ${borderColor} ${bgColor} shadow-lg z-20`}
        style={{
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
        }}
      >
        {/* Pulsing Highlight Corner */}
        <span className="absolute -top-1 -left-1 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
        </span>

        {/* Floating Tooltip Label */}
        <div
          className={`absolute -top-6 left-0 px-2 py-0.5 rounded text-[11px] font-medium shadow-sm flex items-center gap-1.5 whitespace-nowrap select-none capitalize ${badgeColor}`}
        >
          <span>{selectedFieldMeta.fieldName.replace(/_/g, ' ')}</span>
          <span className="opacity-80">({label})</span>
        </div>
      </div>
    );
  };

  if (!imageUrl) {
    return (
      <div className="bg-white border border-slate-200 rounded h-full flex flex-col items-center justify-center p-8 text-center min-h-[400px]">
        <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
          <FileImage className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-slate-700">No Image Attached</h4>
        <p className="text-xs text-slate-500 max-w-xs mt-1 leading-relaxed">
          No scanned image was uploaded for Report {sheetIndex}. Upload image files in Stage 1 to inspect them side-by-side.
        </p>
      </div>
    );
  }

  if (hasImageError) {
    return (
      <div className="bg-white border border-slate-200 rounded h-full flex flex-col items-center justify-center p-8 text-center min-h-[400px]">
        <div className="w-12 h-12 rounded bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-slate-800">Scan Preview Unavailable</h4>
        <p className="text-xs text-slate-500 max-w-xs mt-1 leading-relaxed">
          Failed to render "{fileName}". The file data may be corrupt or inaccessible.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded flex flex-col h-full overflow-hidden shadow-2xs">
      {/* Viewer Header Toolbar */}
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-[#0f2a4a] shrink-0">
            Original Scan {sheetIndex}
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-xs text-slate-600 truncate font-mono" title={fileName}>
            {fileName}
          </span>
          {naturalDims && (
            <span className="text-[10px] text-slate-400 hidden sm:inline">
              ({naturalDims.width}×{naturalDims.height})
            </span>
          )}
        </div>

        {/* Review Queue Stepper (Image to Field Navigation) */}
        {reviewQueueCount > 0 && (
          <div className="flex items-center gap-1.5 bg-amber-50/80 border border-amber-200 px-2 py-0.5 rounded text-xs text-amber-900">
            <span className="text-[10px] font-medium text-amber-800">
              Review {currentReviewIndex} of {reviewQueueCount}
            </span>
            <button
              type="button"
              onClick={onNavigatePrevReview}
              className="p-0.5 rounded hover:bg-amber-200 text-amber-800 cursor-pointer disabled:opacity-40"
              title="Previous field needing review"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onNavigateNextReview}
              className="p-0.5 rounded hover:bg-amber-200 text-amber-800 cursor-pointer disabled:opacity-40"
              title="Next field needing review"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Zoom & Action Controls */}
        <div className="flex items-center space-x-1 shrink-0">
          {selectedFieldMeta && (
            <button
              type="button"
              onClick={centerOnSelectedField}
              className="p-1 rounded text-slate-600 hover:text-[#0f2a4a] hover:bg-slate-200 transition-colors cursor-pointer mr-1"
              title="Center scan on selected field"
              aria-label="Center on selected field"
            >
              <Crosshair className="w-3.5 h-3.5 text-blue-600" />
            </button>
          )}

          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoomLevel <= 0.5}
            className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-40 transition-colors cursor-pointer"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-slate-500 w-10 text-center select-none">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoomLevel >= 3.0}
            className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-40 transition-colors cursor-pointer"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer ml-1"
            title="Reset zoom & pan"
            aria-label="Reset zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="p-1 rounded text-[#0f2a4a] hover:bg-slate-200 transition-colors cursor-pointer ml-1"
            title="Open enlarged inspection view"
            aria-label="Open enlarged view"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Interactive Scan Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`flex-1 bg-slate-900/5 relative overflow-hidden flex items-center justify-center min-h-[460px] max-h-[700px] select-none ${zoomLevel > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
          }`}
      >
        <div
          className="relative transition-transform duration-75 inline-block max-w-full shadow-md bg-white border border-slate-300"
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
            transformOrigin: 'center center',
          }}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt={`Handwritten scan for Report ${sheetIndex}`}
            onLoad={handleImageLoad}
            onError={() => setHasImageError(true)}
            className="max-h-[640px] w-auto max-w-full block select-none pointer-events-none"
            draggable={false}
          />

          {/* Coordinate Highlight Overlay */}
          {renderHighlightBox()}
        </div>
      </div>

      {/* Inspection Modal for High-Res Inspection */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 backdrop-blur-2xs select-none"
          onClick={() => setIsModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white border border-slate-300 rounded max-w-5xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-800">
                  Detailed Scan Inspection: {fileName}
                </span>
                {selectedFieldMeta && (
                  <span className="text-xs bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-mono">
                    Active: {selectedFieldMeta.fieldName} ({selectedFieldMeta.status})
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-200 transition-colors cursor-pointer"
                aria-label="Close inspection modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-4 bg-slate-100 flex items-center justify-center min-h-[400px]">
              <div className="relative inline-block max-w-full shadow-lg bg-white border border-slate-200">
                <img
                  src={imageUrl}
                  alt={fileName}
                  className="max-h-[76vh] w-auto max-w-full block select-none"
                />
                {renderHighlightBox()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-2.5 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-600">
              <span>Inspect handwriting details against transcribed field values.</span>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-3 py-1 bg-slate-200 hover:bg-slate-300 rounded text-slate-800 text-xs font-medium cursor-pointer"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
