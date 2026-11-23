import { ExamType, ImportValidationIssue } from '@scorelens/shared'

export interface ParsedWorkbookData {
  sheetName: string
  headerRow: number
  headers: string[]
  rows: string[][]
  samples: string[][]
  rowCount: number
}

export interface ImportMappingColumn {
  index: number
  target: string
}

export interface ImportMappingConfig {
  headerRow: number
  columns: ImportMappingColumn[]
  exam: {
    name: string
    type: ExamType
    heldAt: string
  }
  subjects: Array<{
    subjectId: string
    fullScore: number
    includedInTotal: boolean
  }>
}

export interface NormalizedScore {
  subjectId: string
  score: number | null
  isAbsent: boolean
}

export interface NormalizedStudentRow {
  rowNumber: number
  studentId: string
  studentNo: string
  name: string
  scores: NormalizedScore[]
}

export interface ValidationStats {
  totalRows: number
  validRows: number
  errorRows: number
  warningRows: number
  absentCount: number
}

export interface ValidationResult {
  errors: ImportValidationIssue[]
  warnings: ImportValidationIssue[]
  stats: ValidationStats
  preview: Array<Record<string, string | number | boolean | null>>
  rows: NormalizedStudentRow[]
}