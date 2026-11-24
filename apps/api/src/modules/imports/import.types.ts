import { ExamType, ImportValidationIssue } from '@scorelens/shared'

export interface ParsedWorkbookData {
  sheetName: string
  /** 表头起始行（0 基） */
  headerRow: number
  /** 表头占用的行数：学校导出的成绩表常见“科目 + 分数/名次”二级表头 */
  headerRows: number
  /** 数据起始行（0 基），等于 headerRow + headerRows */
  dataStartRow: number
  headers: string[]
  rows: string[][]
  /** 与 rows 一一对应的真实 Excel 行号（1 基），用于校验提示定位 */
  rowNumbers: number[]
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