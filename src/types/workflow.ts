export type WorkflowStep = 'upload' | 'review' | 'download';

export interface WorkflowStepConfig {
  id: WorkflowStep;
  stepNumber: number;
  label: string;
  description: string;
}

export interface UploadedReportImage {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  size: number;
  formattedSize: string;
  type: string;
  lastModified: number;
}

export interface ReportSummaryInfo {
  docRevision: string;
  department: string;
  assemblyLine: string;
  activeBatch?: string;
  totalPages: number;
}
