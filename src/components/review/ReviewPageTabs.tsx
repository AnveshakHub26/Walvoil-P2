import React from 'react';
import { AlertCircle, Check, FileText } from 'lucide-react';
import type { ReportSheetData } from '../../types/report';

interface ReviewPageTabsProps {
  sheets: ReportSheetData[];
  activeSheetIndex: number;
  onSelectSheet: (sheetIndex: number) => void;
}

export const ReviewPageTabs: React.FC<ReviewPageTabsProps> = ({
  sheets,
  activeSheetIndex,
  onSelectSheet,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded px-4 py-2.5 flex items-center justify-between overflow-x-auto shadow-2xs">
      <div className="flex items-center space-x-1.5 min-w-0">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-2 shrink-0 flex items-center gap-1.5 select-none">
          <FileText className="w-3.5 h-3.5 text-slate-400" />
          <span>Report Pages:</span>
        </span>

        {sheets.map((sheet) => {
          const isActive = sheet.sheetIndex === activeSheetIndex;

          // Check if any fields in headers or rows are flagged
          let checkCount = 0;
          if (sheet.headers.flaggedFields) {
            checkCount += Object.values(sheet.headers.flaggedFields).filter(Boolean).length;
          }
          sheet.rows.forEach((row) => {
            if (row.flaggedFields) {
              checkCount += Object.values(row.flaggedFields).filter(Boolean).length;
            }
          });

          return (
            <button
              key={sheet.sheetIndex}
              type="button"
              onClick={() => onSelectSheet(sheet.sheetIndex)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-all whitespace-nowrap flex items-center gap-2 border cursor-pointer ${
                isActive
                  ? 'bg-[#0f2a4a] text-white border-[#0f2a4a] shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span>{sheet.sheetName}</span>

              {/* Status Indicator */}
              {checkCount > 0 ? (
                <span
                  className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                    isActive
                      ? 'bg-amber-400 text-slate-900'
                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}
                  title={`${checkCount} cells need verification`}
                >
                  <AlertCircle className="w-2.5 h-2.5 mr-0.5 inline" />
                  {checkCount}
                </span>
              ) : (
                <Check
                  className={`w-3 h-3 ${isActive ? 'text-emerald-300' : 'text-emerald-600'}`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="hidden lg:flex items-center gap-3 text-xs text-slate-500 pl-4 border-l border-slate-200 select-none">
        <span className="text-[11px] text-slate-400">
          Total Pages: <strong className="text-slate-700">{sheets.length}</strong>
        </span>
      </div>
    </div>
  );
};

