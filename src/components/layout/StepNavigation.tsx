import React from 'react';
import { UploadCloud, CheckSquare, Download, ArrowRight, Check } from 'lucide-react';
import type { WorkflowStep } from '../../types/workflow';

interface StepNavigationProps {
  currentStep: WorkflowStep;
  onStepChange: (step: WorkflowStep) => void;
  canNavigateToReview?: boolean;
}

interface StepItem {
  id: WorkflowStep;
  stepNumber: number;
  label: string;
  description: string;
  icon: React.ReactNode;
}

export const StepNavigation: React.FC<StepNavigationProps> = ({
  currentStep,
  onStepChange,
  canNavigateToReview = false,
}) => {
  const steps: StepItem[] = [
    {
      id: 'upload',
      stepNumber: 1,
      label: 'Upload Reports',
      description: 'Select scanned DPR sheets',
      icon: <UploadCloud className="w-4 h-4" />,
    },
    {
      id: 'review',
      stepNumber: 2,
      label: 'Review & Confirm',
      description: 'Verify extracted entries',
      icon: <CheckSquare className="w-4 h-4" />,
    },
    {
      id: 'download',
      stepNumber: 3,
      label: 'Download Excel',
      description: 'Export official workbook',
      icon: <Download className="w-4 h-4" />,
    },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav aria-label="Workflow Stages" className="py-3">
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {steps.map((step, idx) => {
              const isActive = step.id === currentStep;
              const isPassed = idx < currentStepIndex;
              const isStepDisabled = step.id !== 'upload' && !canNavigateToReview && !isPassed;

              return (
                <li key={step.id} className="relative">
                  <button
                    type="button"
                    disabled={isStepDisabled}
                    onClick={() => onStepChange(step.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${
                      isActive
                        ? 'bg-white border-[#ba1c24] ring-1 ring-[#ba1c24] shadow-xs'
                        : isStepDisabled
                        ? 'bg-slate-50/50 border-slate-200 opacity-40 cursor-not-allowed'
                        : isPassed
                        ? 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 cursor-pointer shadow-2xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                          isActive
                            ? 'bg-[#ba1c24] text-white shadow-xs'
                            : isPassed
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {isPassed ? <Check className="w-4 h-4 stroke-[2.5]" /> : step.stepNumber}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-sm font-bold ${
                              isActive ? 'text-slate-900' : 'text-slate-800'
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 hidden sm:block">
                          {step.description}
                        </p>
                      </div>
                    </div>

                    <div className="text-slate-400 pl-2">
                      {idx < steps.length - 1 && (
                        <ArrowRight className="w-4 h-4 hidden md:block text-slate-300" />
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
};
