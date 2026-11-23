import { z } from 'zod'

export const roleCodes = ['admin', 'grade_director', 'head_teacher', 'subject_teacher'] as const
export type RoleCode = (typeof roleCodes)[number]

export const examTypes = ['monthly', 'midterm', 'final', 'other'] as const
export type ExamType = (typeof examTypes)[number]

export const importStatuses = [
  'uploaded',
  'parsed',
  'mapping_confirmed',
  'validated',
  'committed',
  'failed',
] as const
export type ImportStatus = (typeof importStatuses)[number]

export const PASS_RATIO = 0.6
export const EXCELLENT_RATIO = 0.8
export const ABSENT_MARKERS = ['缺考', '缺', '免考', '—', '-', '/', '／'] as const

export const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入账号').max(64),
  password: z.string().min(1, '请输入密码').max(128),
})
export type LoginInput = z.infer<typeof loginSchema>

export const importMappingSchema = z.object({
  headerRow: z.number().int().min(0),
  columns: z
    .array(
      z.object({
        index: z.number().int().min(0),
        target: z.string().min(1),
      }),
    )
    .min(1),
  exam: z.object({
    name: z.string().trim().min(1, '请填写考试名称').max(120),
    type: z.enum(examTypes),
    heldAt: z.string().min(8, '请填写考试日期'),
  }),
  subjects: z
    .array(
      z.object({
        subjectId: z.string().min(1),
        fullScore: z.number().positive().max(1000),
        includedInTotal: z.boolean(),
      }),
    )
    .min(1, '至少配置一个科目'),
})
export type ImportMappingInput = z.infer<typeof importMappingSchema>

export const SUBJECT_TARGET_PREFIX = 'subject:'

export function subjectTarget(subjectId: string) {
  return `${SUBJECT_TARGET_PREFIX}${subjectId}`
}

export function parseSubjectTarget(target: string): string | null {
  return target.startsWith(SUBJECT_TARGET_PREFIX)
    ? target.slice(SUBJECT_TARGET_PREFIX.length)
    : null
}

export function isAbsentMarker(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return ABSENT_MARKERS.includes(value.trim() as (typeof ABSENT_MARKERS)[number])
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function safeRate(value: number | null | undefined, fullScore: number): number | null {
  if (value === null || value === undefined || fullScore <= 0) return null
  return round((value / fullScore) * 100, 1)
}

export interface SessionUser {
  id: string
  username: string
  displayName: string
  roles: RoleCode[]
  gradeIds: string[]
  classIds: string[]
  subjectIds: string[]
  fullView: boolean
}

export interface TermOption {
  id: string
  schoolYear: string
  termNo: number
  name: string
  isCurrent: boolean
}

export interface ClassOption {
  id: string
  name: string
  gradeId: string
  gradeName: string
  gradeLevel: number
  termId: string
  termName: string
  classGroupId: string
  classGroupName: string
  studentCount: number
  headTeacherName: string | null
}

export interface ExamOption {
  id: string
  name: string
  type: ExamType
  heldAt: string
  termId: string
  termName: string
  gradeId: string
  gradeName: string
  status: 'active' | 'archived'
}

export interface SubjectOption {
  id: string
  code: string
  name: string
  category: 'cultural' | 'other'
  defaultFullScore: number | null
  sortOrder: number
}

export interface KpiSummary {
  average: number | null
  passRate: number | null
  excellentRate: number | null
  participantCount: number
  completeCount: number
  absentCount: number
  passLine: number
  excellentLine: number
}

export interface SubjectComparison {
  subjectId: string
  subjectName: string
  fullScore: number
  includedInTotal: boolean
  classAverage: number | null
  gradeAverage: number | null
  classScoreRate: number | null
  gradeScoreRate: number | null
  passLine: number
  excellentLine: number
}

export interface TrendPoint {
  examId: string
  examName: string
  heldAt: string
  classAverage: number | null
  gradeAverage: number | null
}

export interface RankingScore {
  subjectId: string
  subjectName: string
  score: number | null
  isAbsent: boolean
  fullScore: number
}

export interface RankingRow {
  studentId: string
  studentNo: string
  name: string
  totalScore: number | null
  classRank: number | null
  gradeRank: number | null
  rankDelta: number | null
  complete: boolean
  absentCount: number
  scores: RankingScore[]
}

export interface DistributionBin {
  label: string
  count: number
}

export interface DistributionData {
  subjectId: string | null
  subjectName: string
  fullScore: number
  bins: DistributionBin[]
}

export interface BorderlineItem {
  studentId: string
  studentName: string
  subjectId: string
  subjectName: string
  score: number
  lineType: 'pass' | 'excellent'
  lineValue: number
  gap: number
}

export interface DashboardResponse {
  mode: 'full' | 'subject'
  exam: ExamOption
  classInfo: ClassOption
  subject: SubjectOption | null
  kpis: KpiSummary
  subjects: SubjectComparison[]
  trend: TrendPoint[]
  ranking: RankingRow[]
  distribution: DistributionData
  borderline: BorderlineItem[]
  previousExamName: string | null
  gradeAverageTotal: number | null
}

export interface StudentSubjectResult {
  subjectId: string
  subjectName: string
  score: number | null
  isAbsent: boolean
  fullScore: number
  classAverage: number | null
  zScore: number | null
  tag: 'strong' | 'weak' | 'normal' | 'absent'
}

export interface StudentProfileResponse {
  mode: 'full' | 'subject'
  subject: SubjectOption | null
  student: {
    id: string
    studentNo: string
    name: string
    className: string
    gradeName: string
    headTeacherName: string | null
  }
  exam: ExamOption
  totalScore: number | null
  classRank: number | null
  gradeRank: number | null
  rankDelta: number | null
  complete: boolean
  subjects: StudentSubjectResult[]
  radar: {
    indicators: { name: string; max: number }[]
    student: number[]
    classAverage: number[]
  }
  rankTrend: {
    examId: string
    examName: string
    heldAt: string
    classRank: number | null
    gradeRank: number | null
    totalScore: number | null
  }[]
  history: {
    examId: string
    examName: string
    heldAt: string
    totalScore: number | null
    classRank: number | null
    gradeRank: number | null
    complete: boolean
  }[]
}

export interface GradeClassSubjectComparison {
  subjectId: string
  average: number | null
  scoreRate: number | null
  diffPp: number | null
}

export interface GradeClassComparison {
  classId: string
  className: string
  avgTotal: number | null
  passRate: number | null
  excellentRate: number | null
  completeCount: number
  rank: number | null
  subjects: GradeClassSubjectComparison[]
}

export interface GradeCompareResponse {
  exam: ExamOption
  subjects: SubjectOption[]
  gradeAverageTotal: number | null
  classes: GradeClassComparison[]
}

export interface ImportSuggestion {
  index: number
  header: string
  sample: string
  target: string
  confidence: 'high' | 'medium' | 'low'
}

export interface ParsedImportResponse {
  batchId: string
  fileName: string
  sheetName: string
  headerRow: number
  headers: string[]
  samples: string[][]
  rowCount: number
  suggestions: ImportSuggestion[]
  status: ImportStatus
}

export interface ImportValidationIssue {
  row: number
  column?: string
  message: string
  severity: 'error' | 'warning'
}

export interface ImportValidationResponse {
  batchId: string
  status: ImportStatus
  errors: ImportValidationIssue[]
  warnings: ImportValidationIssue[]
  stats: {
    totalRows: number
    validRows: number
    errorRows: number
    warningRows: number
    absentCount: number
  }
  preview: Array<Record<string, string | number | boolean | null>>
}

export interface ImportCommitResponse {
  batchId: string
  examId: string
  examName: string
  inserted: number
  updated: number
  absentCount: number
}

export interface ImportBatchListItem {
  id: string
  fileName: string
  status: ImportStatus
  examName: string | null
  className: string | null
  createdAt: string
  committedAt: string | null
  createdByName: string
  stats: {
    totalRows?: number
    inserted?: number
    updated?: number
    errorRows?: number
    absentCount?: number
  } | null
}

export interface ImportBatchDetail extends ImportBatchListItem {
  sheetName: string | null
  mapping: unknown
  examMeta: unknown
  validation: unknown
}

export interface ApiErrorBody {
  code?: string
  message: string
  details?: unknown
  requestId?: string
}

export const examTypeLabels: Record<ExamType, string> = {
  monthly: '月考',
  midterm: '期中',
  final: '期末',
  other: '其他',
}

export const roleLabels: Record<RoleCode, string> = {
  admin: '系统管理员',
  grade_director: '年级主任',
  head_teacher: '班主任',
  subject_teacher: '任课老师',
}

export const importStatusLabels: Record<ImportStatus, string> = {
  uploaded: '已上传',
  parsed: '已解析',
  mapping_confirmed: '已确认映射',
  validated: '校验通过',
  committed: '已入库',
  failed: '失败',
}

export const HEADER_SYNONYMS: Record<string, string[]> = {
  student_no: ['学号', '学籍号', '考号', '编号', '学生编号', '学生学号'],
  name: ['姓名', '学生姓名', '名字'],
  class_name: ['班级', '班别', '行政班'],
  source_total: ['总分', '合计', '总成绩'],
  ignore: ['排名', '班名次', '年级名次', '校名次', '备注', '性别'],
}

export function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, '').replace(/[（）()]/g, '').trim().toLowerCase()
}