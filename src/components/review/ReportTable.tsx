import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Check,
  Shield,
  Edit2,
  Ban,
  CheckCheck,
} from 'lucide-react';
import type {
  ReportSheetData,
  ReportRowData,
  FieldMetadata,
  HeaderFieldKey,
} from '../../types/report';
import { Badge } from '../common/Badge';

interface ReportTableProps {
  sheetData: ReportSheetData;
  selectedFieldId?: string;
  onSelectField?: (fieldId: string) => void;
  onUpdateHeader: (field: HeaderFieldKey, value: string) => void;
  onUpdateRow: (
    rowId: string,
    field: keyof Omit<ReportRowData, 'id' | 'flaggedFields' | 'metadata'>,
    value: string
  ) => void;
  onConfirmField?: (rowId: string | 'header', fieldKey: string) => void;
  onRevertField?: (rowId: string | 'header', fieldKey: string) => void;
  onConfirmRow?: (rowId: string) => void;
  onConfirmAllSheet?: () => void;
  onToggleFieldFlag: (rowId: string, field: string) => void;
}

export const ReportTable: React.FC<ReportTableProps> = ({
  sheetData,
  selectedFieldId,
  onSelectField,
  onUpdateHeader,
  onUpdateRow,
  onConfirmField,
  onRevertField: _onRevertField,
  onConfirmRow,
  onConfirmAllSheet,
}) => {
  const { headers, rows, sheetName } = sheetData;

  // Calculate live review counters
  let liveNeedsReview = 0;
  let liveConfirmed = 0;
  let liveCorrected = 0;

  // Header counters
  if (headers.metadata) {
    Object.values(headers.metadata).forEach((m) => {
      if (m?.status === 'needs_review') liveNeedsReview++;
      if (m?.status === 'confirmed') liveConfirmed++;
      if (m?.status === 'corrected') liveCorrected++;
    });
  }

  // Row counters
  rows.forEach((row) => {
    if (row.metadata) {
      Object.values(row.metadata).forEach((m) => {
        if (m?.status === 'needs_review') liveNeedsReview++;
        if (m?.status === 'confirmed') liveConfirmed++;
        if (m?.status === 'corrected') liveCorrected++;
      });
    }
  });

  // Helper to render field cell status indicator & quick confirm
  const renderFieldBadge = (
    meta?: FieldMetadata,
    rowId: string | 'header' = 'header',
    fieldKey: string = ''
  ) => {
    if (!meta) return null;

    if (meta.status === 'confirmed') {
      return (
        <span
          className="inline-flex items-center text-emerald-600 select-none"
          title="Field confirmed by employee"
        >
          <CheckCircle2 className="w-3 h-3" />
        </span>
      );
    }

    if (meta.status === 'corrected') {
      return (
        <span
          className="inline-flex items-center gap-0.5 text-blue-600 select-none text-[10px] font-medium"
          title={`Corrected by employee (Original OCR: "${meta.originalValue}")`}
        >
          <Edit2 className="w-2.5 h-2.5" />
          <span>Edited</span>
        </span>
      );
    }

    if (meta.status === 'needs_review') {
      if (meta.validationWarning) {
        return (
          <span
            className="inline-flex items-center text-amber-500 select-none"
            title={meta.validationWarning}
          >
            <AlertCircle className="w-3 h-3" />
          </span>
        );
      }
      return (
        <span
          className="inline-flex items-center text-emerald-600 select-none"
          title="Transcribed by AI"
        >
          <CheckCircle2 className="w-3 h-3" />
        </span>
      );
    }

    if (meta.status === 'failed') {
      return (
        <span
          className="inline-flex items-center text-red-600 select-none"
          title="Recognition failed - manual entry required"
        >
          <AlertCircle className="w-3 h-3" />
        </span>
      );
    }

    return null;
  };

  return (
    <div className="bg-white border border-slate-200 rounded overflow-hidden shadow-2xs flex flex-col">
      {/* Table Header & Review Status Toolbar */}
      <div className="px-4 py-3 bg-slate-50/90 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-slate-800 tracking-wide uppercase">
            Walvoil – Daily Production Report (Final Assembly)
          </h3>
          <span className="text-slate-300">•</span>
          <span className="text-xs font-semibold text-[#0f2a4a]">{sheetName}</span>
          <Badge variant="neutral" size="sm">
            REV: 01
          </Badge>
        </div>

        {/* Live Status Indicators & Bulk Confirmation Action */}
        <div className="flex items-center gap-2.5 text-xs">
          {liveNeedsReview > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-300 text-[11px] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {liveNeedsReview} fields transcribed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-300 text-[11px] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              All fields confirmed
            </span>
          )}

          {liveCorrected > 0 && (
            <span className="inline-flex items-center gap-1 text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
              <Edit2 className="w-3 h-3 text-blue-600" />
              {liveCorrected} corrected
            </span>
          )}

          {liveConfirmed > 0 && (
            <span className="inline-flex items-center gap-1 text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
              <Check className="w-3 h-3 text-emerald-600" />
              {liveConfirmed} confirmed
            </span>
          )}

          {onConfirmAllSheet && liveNeedsReview > 0 && (
            <button
              type="button"
              onClick={onConfirmAllSheet}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0f2a4a] hover:bg-[#1a3d66] text-white text-[11px] font-medium transition-colors cursor-pointer shadow-xs"
              title="Confirm all remaining review fields as verified"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Confirm All</span>
            </button>
          )}
        </div>
      </div>

      {/* Editable Report Header Block matching Physical ASLY-DPR-REV01 Form */}
      <div className="p-3 bg-slate-50/60 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
        {/* Date */}
        {(() => {
          const meta = headers.metadata?.date;
          const isSelected = selectedFieldId === meta?.fieldId;
          return (
            <div
              onClick={() => meta && onSelectField?.(meta.fieldId)}
              className={`p-2 border rounded transition-all cursor-pointer ${
                isSelected
                  ? 'border-amber-500 ring-2 ring-amber-400/40 bg-amber-50/50'
                  : meta?.status === 'needs_review'
                  ? 'border-amber-300 bg-amber-50/30'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                  Date
                </label>
                {renderFieldBadge(meta, 'header', 'date')}
              </div>
              <input
                type="text"
                value={headers.date}
                onChange={(e) => onUpdateHeader('date', e.target.value)}
                onFocus={() => meta && onSelectField?.(meta.fieldId)}
                placeholder="DD/MM/YYYY"
                className="w-full text-xs font-mono font-medium text-slate-800 bg-transparent outline-none"
              />
              {meta?.isCorrected && (
                <div className="text-[9px] text-slate-400 mt-0.5 truncate" title={`Original: ${meta.originalValue}`}>
                  Orig: {meta.originalValue}
                </div>
              )}
            </div>
          );
        })()}

        {/* Operator's Name */}
        {(() => {
          const meta = headers.metadata?.operatorName;
          const isSelected = selectedFieldId === meta?.fieldId;
          return (
            <div
              onClick={() => meta && onSelectField?.(meta.fieldId)}
              className={`p-2 border rounded transition-all cursor-pointer ${
                isSelected
                  ? 'border-amber-500 ring-2 ring-amber-400/40 bg-amber-50/50'
                  : meta?.status === 'needs_review'
                  ? 'border-amber-300 bg-amber-50/30'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                  Operator Name
                </label>
                {renderFieldBadge(meta, 'header', 'operatorName')}
              </div>
              <input
                type="text"
                value={headers.operatorName}
                onChange={(e) => onUpdateHeader('operatorName', e.target.value)}
                onFocus={() => meta && onSelectField?.(meta.fieldId)}
                placeholder="Operator name"
                className="w-full text-xs font-medium text-slate-800 bg-transparent outline-none truncate"
              />
              {meta?.isCorrected && (
                <div className="text-[9px] text-slate-400 mt-0.5 truncate" title={`Original: ${meta.originalValue}`}>
                  Orig: {meta.originalValue}
                </div>
              )}
            </div>
          );
        })()}

        {/* Shift */}
        {(() => {
          const meta = headers.metadata?.shift;
          const isSelected = selectedFieldId === meta?.fieldId;
          return (
            <div
              onClick={() => meta && onSelectField?.(meta.fieldId)}
              className={`p-2 border rounded transition-all cursor-pointer ${
                isSelected
                  ? 'border-amber-500 ring-2 ring-amber-400/40 bg-amber-50/50'
                  : meta?.status === 'needs_review'
                  ? 'border-amber-300 bg-amber-50/30'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                  Shift
                </label>
                {renderFieldBadge(meta, 'header', 'shift')}
              </div>
              <input
                type="text"
                value={headers.shift}
                onChange={(e) => onUpdateHeader('shift', e.target.value)}
                onFocus={() => meta && onSelectField?.(meta.fieldId)}
                placeholder="—"
                className="w-full text-xs font-medium text-slate-900 bg-transparent outline-none"
              />
              {meta?.isCorrected && (
                <div className="text-[9px] text-slate-400 mt-0.5 truncate" title={`Original: ${meta.originalValue}`}>
                  Orig: {meta.originalValue}
                </div>
              )}
            </div>
          );
        })()}

        {/* Bench */}
        {(() => {
          const meta = headers.metadata?.bench;
          const isSelected = selectedFieldId === meta?.fieldId;
          return (
            <div
              onClick={() => meta && onSelectField?.(meta.fieldId)}
              className={`p-2 border rounded transition-all cursor-pointer ${
                isSelected
                  ? 'border-amber-500 ring-2 ring-amber-400/40 bg-amber-50/50'
                  : meta?.status === 'needs_review'
                  ? 'border-amber-300 bg-amber-50/30'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                  Bench
                </label>
                {renderFieldBadge(meta, 'header', 'bench')}
              </div>
              <input
                type="text"
                value={headers.bench}
                onChange={(e) => onUpdateHeader('bench', e.target.value)}
                onFocus={() => meta && onSelectField?.(meta.fieldId)}
                placeholder="—"
                className="w-full text-xs font-medium text-slate-900 bg-transparent outline-none"
              />
              {meta?.isCorrected && (
                <div className="text-[9px] text-slate-400 mt-0.5 truncate" title={`Original: ${meta.originalValue}`}>
                  Orig: {meta.originalValue}
                </div>
              )}
            </div>
          );
        })()}

        {/* Worked Hours */}
        {(() => {
          const meta = headers.metadata?.workedHours;
          const isSelected = selectedFieldId === meta?.fieldId;
          return (
            <div
              onClick={() => meta && onSelectField?.(meta.fieldId)}
              className={`p-2 border rounded transition-all cursor-pointer ${
                isSelected
                  ? 'border-amber-500 ring-2 ring-amber-400/40 bg-amber-50/50'
                  : meta?.status === 'needs_review'
                  ? 'border-amber-300 bg-amber-50/30'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                  Worked Hours
                </label>
                {renderFieldBadge(meta, 'header', 'workedHours')}
              </div>
              <input
                type="text"
                value={headers.workedHours}
                onChange={(e) => onUpdateHeader('workedHours', e.target.value)}
                onFocus={() => meta && onSelectField?.(meta.fieldId)}
                placeholder="—"
                className="w-full text-xs font-mono font-medium text-slate-900 bg-transparent outline-none"
              />
              {meta?.isCorrected && (
                <div className="text-[9px] text-slate-400 mt-0.5 truncate" title={`Original: ${meta.originalValue}`}>
                  Orig: {meta.originalValue}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Main 14-Row Production Table Data Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-300 font-semibold select-none">
              <th className="py-2 px-2 border-r border-slate-300 w-10 text-center text-slate-400">#</th>
              {/* Col 0: Batch Number & Order No with distinct subfields */}
              <th className="py-2 px-2.5 border-r border-slate-300 min-w-[170px]">
                <div className="text-[11px] leading-tight">Batch Number &amp; Order No</div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-normal mt-0.5">
                  <span>PWH (Batch)</span>
                  <span>Ord no (Customer)</span>
                </div>
              </th>
              <th className="py-2 px-2 border-r border-slate-300 w-20">Family</th>
              <th className="py-2 px-2 border-r border-slate-300 min-w-[120px]">Part Number</th>
              <th className="py-1 px-1 border-r border-slate-300 w-28 text-center" colSpan={2}>
                Time
                <div className="grid grid-cols-2 text-[10px] text-slate-500 font-normal border-t border-slate-300 mt-1">
                  <span className="border-r border-slate-300 py-0.5">Start</span>
                  <span className="py-0.5">End</span>
                </div>
              </th>
              <th className="py-2 px-2 border-r border-slate-300 w-20 text-right">Qty</th>
              <th className="py-2 px-2.5 border-r border-slate-300 min-w-[140px]">Remarks</th>
              <th className="py-2 px-2 border-r border-slate-300 w-24">Idle Code</th>
              <th className="py-2 px-2 border-r border-slate-300 w-20">Idle From</th>
              <th className="py-2 px-2 border-r border-slate-300 w-20">Idle To</th>
              <th className="py-2 px-2 border-r border-slate-300 w-20 text-right">Total Time</th>
              <th className="py-2 px-1 text-center w-14 text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 font-normal text-slate-800">
            {rows.map((row, index) => {
              const rowNum = index + 1;
              const isRowCancelled = Boolean(row.isCancelled);

              // Row review counter
              let rowReviewCount = 0;
              if (row.metadata) {
                Object.values(row.metadata).forEach((m) => {
                  if (m?.status === 'needs_review') rowReviewCount++;
                });
              }

              return (
                <tr
                  key={row.id}
                  className={`transition-colors ${
                    isRowCancelled
                      ? 'bg-slate-50/70 hover:bg-slate-100/50 text-slate-400'
                      : rowReviewCount > 0
                      ? 'bg-amber-50/20 hover:bg-amber-50/40'
                      : 'bg-white hover:bg-slate-50/80'
                  }`}
                >
                  {/* Row Number */}
                  <td className="py-2 px-2 border-r border-slate-200 text-center font-mono text-[10px] text-slate-400 select-none">
                    {rowNum}
                  </td>

                  {/* Col 0: PWH and Ord No Separate Subfields */}
                  <td className="p-1 border-r border-slate-200 align-top">
                    <div className="space-y-1">
                      {/* PWH Subfield */}
                      {(() => {
                        const meta = row.metadata?.pwh;
                        const isSelected = selectedFieldId === meta?.fieldId;
                        const pwhValue =
                          row.pwh !== undefined && row.pwh !== ''
                            ? row.pwh
                            : row.batchAndOrder?.match(/PWH:\s*([^\n\r]+)/i)?.[1]?.trim() || '';

                        return (
                          <div
                            onClick={() => meta && onSelectField?.(meta.fieldId)}
                            className={`group relative flex items-center justify-between gap-1 px-1.5 py-0.5 rounded border transition-all cursor-pointer ${
                              isSelected
                                ? 'border-amber-500 ring-1 ring-amber-400/50 bg-amber-50 shadow-xs'
                                : meta?.status === 'needs_review'
                                ? 'border-amber-300 bg-amber-50/40 hover:border-amber-400'
                                : meta?.status === 'cancelled'
                                ? 'border-slate-200/60 bg-slate-100/50 opacity-60'
                                : 'border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/20'
                            }`}
                            title={
                              pwhValue
                                ? `PWH Batch: ${pwhValue} (Click or type to edit)`
                                : 'Click to enter PWH batch number'
                            }
                          >
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight shrink-0 select-none">
                                PWH:
                              </span>
                              <input
                                type="text"
                                value={pwhValue}
                                disabled={row.isCancelled}
                                onChange={(e) => {
                                  onUpdateRow(row.id, 'pwh', e.target.value);
                                  // Keep batchAndOrder synchronized for Excel
                                  const newPwh = e.target.value;
                                  const curOrd = row.ordNo || '';
                                  const combined = [
                                    newPwh ? `PWH: ${newPwh}` : '',
                                    curOrd ? `Ord No: ${curOrd}` : '',
                                  ]
                                    .filter(Boolean)
                                    .join('\n');
                                  onUpdateRow(row.id, 'batchAndOrder', combined);
                                }}
                                onFocus={() => meta && onSelectField?.(meta.fieldId)}
                                placeholder="—"
                                className="w-full text-xs font-mono font-semibold text-slate-900 bg-transparent outline-none focus:text-slate-900 placeholder:text-slate-300 placeholder:font-normal"
                              />
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {!row.isCancelled && (
                                <Edit2
                                  className="w-2.5 h-2.5 text-slate-400 group-hover:text-blue-600 transition-colors opacity-40 group-hover:opacity-100"
                                  aria-hidden="true"
                                />
                              )}
                              {renderFieldBadge(meta, row.id, 'pwh')}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Ord No Subfield */}
                      {(() => {
                        const meta = row.metadata?.ordNo;
                        const isSelected = selectedFieldId === meta?.fieldId;
                        const ordValue =
                          row.ordNo !== undefined && row.ordNo !== ''
                            ? row.ordNo
                            : row.batchAndOrder?.match(/Ord(?:\s*No)?:\s*([^\n\r]+)/i)?.[1]?.trim() || '';

                        return (
                          <div
                            onClick={() => meta && onSelectField?.(meta.fieldId)}
                            className={`group relative flex items-center justify-between gap-1 px-1.5 py-0.5 rounded border transition-all cursor-pointer ${
                              isSelected
                                ? 'border-amber-500 ring-1 ring-amber-400/50 bg-amber-50 shadow-xs'
                                : meta?.status === 'needs_review'
                                ? 'border-amber-300 bg-amber-50/40 hover:border-amber-400'
                                : meta?.status === 'cancelled'
                                ? 'border-slate-200/60 bg-slate-100/50 opacity-60'
                                : 'border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/20'
                            }`}
                            title={
                              ordValue
                                ? `Order No: ${ordValue} (Click or type to edit)`
                                : 'Click to enter Customer Order number'
                            }
                          >
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight shrink-0 select-none">
                                Ord:
                              </span>
                              <input
                                type="text"
                                value={ordValue}
                                disabled={row.isCancelled}
                                onChange={(e) => {
                                  onUpdateRow(row.id, 'ordNo', e.target.value);
                                  // Keep batchAndOrder synchronized for Excel
                                  const curPwh = row.pwh || '';
                                  const newOrd = e.target.value;
                                  const combined = [
                                    curPwh ? `PWH: ${curPwh}` : '',
                                    newOrd ? `Ord No: ${newOrd}` : '',
                                  ]
                                    .filter(Boolean)
                                    .join('\n');
                                  onUpdateRow(row.id, 'batchAndOrder', combined);
                                }}
                                onFocus={() => meta && onSelectField?.(meta.fieldId)}
                                placeholder="—"
                                className="w-full text-xs font-mono font-semibold text-slate-900 bg-transparent outline-none focus:text-slate-900 placeholder:text-slate-300 placeholder:font-normal"
                              />
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {!row.isCancelled && (
                                <Edit2
                                  className="w-2.5 h-2.5 text-slate-400 group-hover:text-blue-600 transition-colors opacity-40 group-hover:opacity-100"
                                  aria-hidden="true"
                                />
                              )}
                              {renderFieldBadge(meta, row.id, 'ordNo')}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </td>

                  {/* Col 1: Family */}
                  {(() => {
                    const meta = row.metadata?.family;
                    const isSelected = selectedFieldId === meta?.fieldId;
                    return (
                      <td
                        onClick={() => meta && onSelectField?.(meta.fieldId)}
                        className={`p-1 border-r border-slate-200 align-top ${
                          isSelected ? 'bg-amber-100/60 ring-1 ring-amber-400' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <input
                            type="text"
                            value={row.family}
                            onChange={(e) => onUpdateRow(row.id, 'family', e.target.value)}
                            onFocus={() => meta && onSelectField?.(meta.fieldId)}
                            placeholder="—"
                            className="w-full text-xs font-medium text-slate-800 bg-transparent outline-none py-1 px-1"
                          />
                          {renderFieldBadge(meta, row.id, 'family')}
                        </div>
                      </td>
                    );
                  })()}

                  {/* Col 2: Part Number */}
                  {(() => {
                    const meta = row.metadata?.partNumber;
                    const isSelected = selectedFieldId === meta?.fieldId;
                    return (
                      <td
                        onClick={() => meta && onSelectField?.(meta.fieldId)}
                        className={`p-1 border-r border-slate-200 align-top ${
                          isSelected ? 'bg-amber-100/60 ring-1 ring-amber-400' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <input
                            type="text"
                            value={row.partNumber}
                            onChange={(e) => onUpdateRow(row.id, 'partNumber', e.target.value)}
                            onFocus={() => meta && onSelectField?.(meta.fieldId)}
                            placeholder="—"
                            className="w-full text-xs font-mono font-medium text-slate-800 bg-transparent outline-none py-1 px-1"
                          />
                          {renderFieldBadge(meta, row.id, 'partNumber')}
                        </div>
                      </td>
                    );
                  })()}

                  {/* Col 3: Time Start */}
                  {(() => {
                    const meta = row.metadata?.timeStart;
                    const isSelected = selectedFieldId === meta?.fieldId;
                    return (
                      <td
                        onClick={() => meta && onSelectField?.(meta.fieldId)}
                        className={`p-1 border-r border-slate-200 align-top ${
                          isSelected ? 'bg-amber-100/60 ring-1 ring-amber-400' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <input
                            type="text"
                            value={row.timeStart}
                            onChange={(e) => onUpdateRow(row.id, 'timeStart', e.target.value)}
                            onFocus={() => meta && onSelectField?.(meta.fieldId)}
                            placeholder="—"
                            className="w-full text-xs font-mono text-center text-slate-800 bg-transparent outline-none py-1 px-0.5"
                          />
                          {renderFieldBadge(meta, row.id, 'timeStart')}
                        </div>
                      </td>
                    );
                  })()}

                  {/* Col 4: Time End */}
                  {(() => {
                    const meta = row.metadata?.timeEnd;
                    const isSelected = selectedFieldId === meta?.fieldId;
                    return (
                      <td
                        onClick={() => meta && onSelectField?.(meta.fieldId)}
                        className={`p-1 border-r border-slate-200 align-top ${
                          isSelected ? 'bg-amber-100/60 ring-1 ring-amber-400' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <input
                            type="text"
                            value={row.timeEnd}
                            onChange={(e) => onUpdateRow(row.id, 'timeEnd', e.target.value)}
                            onFocus={() => meta && onSelectField?.(meta.fieldId)}
                            placeholder="—"
                            className="w-full text-xs font-mono text-center text-slate-800 bg-transparent outline-none py-1 px-0.5"
                          />
                          {renderFieldBadge(meta, row.id, 'timeEnd')}
                        </div>
                      </td>
                    );
                  })()}

                  {/* Col 5: Qty */}
                  {(() => {
                    const meta = row.metadata?.qty;
                    const isSelected = selectedFieldId === meta?.fieldId;
                    return (
                      <td
                        onClick={() => meta && onSelectField?.(meta.fieldId)}
                        className={`p-1 border-r border-slate-200 align-top ${
                          isSelected ? 'bg-amber-100/60 ring-1 ring-amber-400' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <input
                            type="text"
                            value={row.qty}
                            onChange={(e) => onUpdateRow(row.id, 'qty', e.target.value)}
                            onFocus={() => meta && onSelectField?.(meta.fieldId)}
                            placeholder="—"
                            className="w-full text-xs font-mono text-right text-slate-800 bg-transparent outline-none py-1 px-1 font-semibold"
                          />
                          {renderFieldBadge(meta, row.id, 'qty')}
                        </div>
                      </td>
                    );
                  })()}

                  {/* Col 6: Remarks */}
                  {(() => {
                    const meta = row.metadata?.remarks;
                    const isSelected = selectedFieldId === meta?.fieldId;
                    return (
                      <td
                        onClick={() => meta && onSelectField?.(meta.fieldId)}
                        className={`p-1 border-r border-slate-200 align-top ${
                          isSelected ? 'bg-amber-100/60 ring-1 ring-amber-400' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <input
                            type="text"
                            value={row.remarks}
                            onChange={(e) => onUpdateRow(row.id, 'remarks', e.target.value)}
                            onFocus={() => meta && onSelectField?.(meta.fieldId)}
                            placeholder="—"
                            className="w-full text-xs text-slate-800 bg-transparent outline-none py-1 px-1"
                          />
                          {renderFieldBadge(meta, row.id, 'remarks')}
                        </div>
                      </td>
                    );
                  })()}

                  {/* Col 7: Idle Code */}
                  {(() => {
                    const meta = row.metadata?.idleCode;
                    const isSelected = selectedFieldId === meta?.fieldId;
                    return (
                      <td
                        onClick={() => meta && onSelectField?.(meta.fieldId)}
                        className={`p-1 border-r border-slate-200 align-top ${
                          isSelected ? 'bg-amber-100/60 ring-1 ring-amber-400' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <input
                            type="text"
                            value={row.idleCode}
                            onChange={(e) => onUpdateRow(row.id, 'idleCode', e.target.value)}
                            onFocus={() => meta && onSelectField?.(meta.fieldId)}
                            placeholder="—"
                            className="w-full text-xs font-mono text-slate-800 bg-transparent outline-none py-1 px-1"
                          />
                          {renderFieldBadge(meta, row.id, 'idleCode')}
                        </div>
                      </td>
                    );
                  })()}

                  {/* Col 8: Idle From */}
                  {(() => {
                    const meta = row.metadata?.idleFrom;
                    const isSelected = selectedFieldId === meta?.fieldId;
                    return (
                      <td
                        onClick={() => meta && onSelectField?.(meta.fieldId)}
                        className={`p-1 border-r border-slate-200 align-top ${
                          isSelected ? 'bg-amber-100/60 ring-1 ring-amber-400' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <input
                            type="text"
                            value={row.idleFrom}
                            onChange={(e) => onUpdateRow(row.id, 'idleFrom', e.target.value)}
                            onFocus={() => meta && onSelectField?.(meta.fieldId)}
                            placeholder="—"
                            className="w-full text-xs font-mono text-slate-800 bg-transparent outline-none py-1 px-1"
                          />
                          {renderFieldBadge(meta, row.id, 'idleFrom')}
                        </div>
                      </td>
                    );
                  })()}

                  {/* Col 9: Idle To */}
                  {(() => {
                    const meta = row.metadata?.idleTo;
                    const isSelected = selectedFieldId === meta?.fieldId;
                    return (
                      <td
                        onClick={() => meta && onSelectField?.(meta.fieldId)}
                        className={`p-1 border-r border-slate-200 align-top ${
                          isSelected ? 'bg-amber-100/60 ring-1 ring-amber-400' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <input
                            type="text"
                            value={row.idleTo}
                            onChange={(e) => onUpdateRow(row.id, 'idleTo', e.target.value)}
                            onFocus={() => meta && onSelectField?.(meta.fieldId)}
                            placeholder="—"
                            className="w-full text-xs font-mono text-slate-800 bg-transparent outline-none py-1 px-1"
                          />
                          {renderFieldBadge(meta, row.id, 'idleTo')}
                        </div>
                      </td>
                    );
                  })()}

                  {/* Col 10: Total Time */}
                  {(() => {
                    const meta = row.metadata?.totalTime;
                    const isSelected = selectedFieldId === meta?.fieldId;
                    return (
                      <td
                        onClick={() => meta && onSelectField?.(meta.fieldId)}
                        className={`p-1 border-r border-slate-200 align-top ${
                          isSelected ? 'bg-amber-100/60 ring-1 ring-amber-400' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <input
                            type="text"
                            value={row.totalTime}
                            onChange={(e) => onUpdateRow(row.id, 'totalTime', e.target.value)}
                            onFocus={() => meta && onSelectField?.(meta.fieldId)}
                            placeholder="—"
                            className="w-full text-xs font-mono text-right text-slate-800 bg-transparent outline-none py-1 px-1 font-medium"
                          />
                          {renderFieldBadge(meta, row.id, 'totalTime')}
                        </div>
                      </td>
                    );
                  })()}

                  {/* Row Actions */}
                  <td className="py-1 px-1 text-center align-middle">
                    {isRowCancelled ? (
                      <span
                        className="inline-flex items-center gap-0.5 text-slate-400 text-[10px] select-none"
                        title="Row cancelled on physical DPR scan"
                      >
                        <Ban className="w-3 h-3" />
                      </span>
                    ) : rowReviewCount > 0 && onConfirmRow ? (
                      <button
                        type="button"
                        onClick={() => onConfirmRow(row.id)}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 hover:bg-emerald-200 text-emerald-800 transition-colors cursor-pointer"
                        title="Confirm all fields in this row as verified"
                      >
                        Confirm
                      </button>
                    ) : (
                      <span className="text-emerald-600 inline-flex items-center" title="Row verified">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Official Form Governance Footer matching Walvoil Paper Form */}
      <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 text-xs text-slate-600 flex flex-col md:flex-row md:items-center justify-between gap-3 select-none">
        <div
          onClick={() =>
            sheetData.operatorSignMeta &&
            onSelectField?.(sheetData.operatorSignMeta.fieldId)
          }
          className={`flex items-center gap-2 p-1.5 rounded transition-all cursor-pointer ${
            selectedFieldId === sheetData.operatorSignMeta?.fieldId
              ? 'bg-purple-100 border border-purple-300 ring-1 ring-purple-400'
              : 'hover:bg-slate-100'
          }`}
        >
          <Shield className="w-4 h-4 text-purple-700" />
          <span className="font-semibold text-slate-800">Operator Sign:</span>
          <span className="bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 rounded text-[11px] font-mono">
            Signature Region (Visual Verification Only)
          </span>
          <span className="text-[10px] text-slate-400">(Click to inspect on scan)</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 text-[11px]">
          <span>
            Issued by: <strong className="text-slate-700">{sheetData.issuedBy}</strong>
          </span>
          <span>•</span>
          <span>
            Controlled by: <strong className="text-slate-700">{sheetData.controlledBy}</strong>
          </span>
          <span>•</span>
          <span>
            Revision: <strong className="text-slate-700">{sheetData.revision}</strong>
          </span>
          <span>•</span>
          <span>
            Approved by: <strong className="text-slate-700">{sheetData.approvedBy}</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
