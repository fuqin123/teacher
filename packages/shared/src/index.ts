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

/**
 * 未登录/会话失效的错误码。前端据此跳转登录页，
 * 避免把“请先登录”当作普通业务错误弹在页面里。
 */
export const AUTH_REQUIRED_CODE = 'AUTH_REQUIRED'

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

/* ------------------------------------------------------------------ */
/* AI 表头识别                                                         */
/* ------------------------------------------------------------------ */

export const AI_MAPPING_TARGETS = ['student_no', 'name', 'ignore'] as const

/**
 * AI 返回的结构，服务端必须先用该 schema 校验，再合并到映射中。
 * AI 只负责结构识别（列含义、考试元信息、科目满分），不参与任何分数计算。
 */
export const aiMappingResponseSchema = z.object({
  columns: z
    .array(
      z.object({
        index: z.number().int().min(0),
        target: z.string().min(1),
        confidence: z.enum(['high', 'medium', 'low']).optional(),
      }),
    )
    .default([]),
  exam: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      type: z.enum(examTypes).optional(),
      heldAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .optional(),
  subjects: z
    .array(
      z.object({
        subjectId: z.string().min(1),
        fullScore: z.number().positive().max(1000).optional(),
        includedInTotal: z.boolean().optional(),
      }),
    )
    .default([]),
  notes: z.string().max(500).optional(),
})
export type AiMappingResponse = z.infer<typeof aiMappingResponseSchema>

export interface AiStatusResponse {
  enabled: boolean
  model: string | null
  endpointHost: string | null
  /** 配置来源：管理员界面保存到数据库，或环境变量 */
  source: 'database' | 'environment'
}

export const aiSettingsInputSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z
    .string()
    .trim()
    .url('请填写以 http:// 或 https:// 开头的接口地址')
    .max(300),
  model: z.string().trim().min(1, '请填写模型名称').max(100),
  timeoutMs: z.number().int().min(3000, '超时至少 3000ms').max(120000, '超时最大 120000ms'),
  /** 留空表示保持已保存的 Key 不变 */
  apiKey: z.string().trim().max(400).optional(),
})
export type AiSettingsInput = z.infer<typeof aiSettingsInputSchema>

export interface AiSettingsView {
  enabled: boolean
  baseUrl: string
  model: string
  timeoutMs: number
  hasApiKey: boolean
  apiKeyMasked: string | null
  source: 'database' | 'environment'
  updatedAt: string | null
}

export interface AiTestResult {
  ok: boolean
  latencyMs: number
  message: string
  model: string
}

export interface AiSuggestResponse {
  enabled: boolean
  applied: boolean
  model: string | null
  notes: string | null
  message: string | null
  columns: ImportSuggestion[]
  exam: {
    name: string
    type: ExamType
    heldAt: string
  } | null
  subjects: Array<{
    subjectId: string
    fullScore: number
    includedInTotal: boolean
  }>
}

/* ------------------------------------------------------------------ */
/* 基础数据维护（仅管理员）                                             */
/* ------------------------------------------------------------------ */

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
  .optional()
  .nullable()

export const termInputSchema = z.object({
  schoolYear: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{4}$/, '学年格式应为 2026-2027')
    .refine((value) => {
      const [start, end] = value.split('-').map(Number)
      return end === start + 1
    }, '学年结束年份需比开始年份大 1'),
  termNo: z.number().int().min(1, '学期序号至少为 1').max(3, '学期序号最多为 3'),
  name: z.string().trim().min(1, '请填写学期名称').max(60),
  startDate: optionalDate,
  endDate: optionalDate,
  isCurrent: z.boolean().optional(),
})
export type TermInput = z.infer<typeof termInputSchema>

export const termUpdateSchema = termInputSchema.partial()
export type TermUpdateInput = z.infer<typeof termUpdateSchema>

export const gradeInputSchema = z.object({
  termId: z.string().min(1, '请选择学期'),
  level: z.number().int().min(1, '年级层次最小为 1').max(9, '年级层次最大为 9'),
  entryYear: z.number().int().min(1990).max(2100),
  name: z.string().trim().min(1, '请填写年级名称').max(20),
})
export type GradeInput = z.infer<typeof gradeInputSchema>

export const gradeUpdateSchema = gradeInputSchema.partial()
export type GradeUpdateInput = z.infer<typeof gradeUpdateSchema>

export const subjectInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, '请填写科目代码')
    .max(30)
    .regex(/^[a-z0-9_]+$/, '科目代码只能包含小写字母、数字和下划线'),
  name: z.string().trim().min(1, '请填写科目名称').max(20),
  category: z.enum(['cultural', 'other']).default('cultural'),
  defaultFullScore: z.number().positive().max(1000).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(99).optional(),
})
export type SubjectInput = z.infer<typeof subjectInputSchema>

export const subjectUpdateSchema = subjectInputSchema.partial()
export type SubjectUpdateInput = z.infer<typeof subjectUpdateSchema>

export const classInputSchema = z.object({
  gradeId: z.string().min(1, '请选择所属年级'),
  name: z.string().trim().min(1, '请填写班级名称').max(30),
  classGroupName: z.string().trim().min(1, '请填写班级组名称').max(40),
  headTeacherId: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).max(99).optional(),
})
export type ClassInput = z.infer<typeof classInputSchema>

export const classUpdateSchema = classInputSchema.partial()
export type ClassUpdateInput = z.infer<typeof classUpdateSchema>

export const studentInputSchema = z.object({
  studentNo: z.string().trim().min(1, '请填写学号').max(30),
  name: z.string().trim().min(1, '请填写姓名').max(30),
  classId: z.string().min(1, '请选择班级'),
  status: z.enum(['active', 'graduated', 'left']).optional(),
})
export type StudentInput = z.infer<typeof studentInputSchema>

export const studentUpdateSchema = studentInputSchema.partial().omit({ classId: true })
export type StudentUpdateInput = z.infer<typeof studentUpdateSchema>

export const enrollmentInputSchema = z.object({
  classId: z.string().min(1, '请选择班级'),
  termId: z.string().optional(),
})
export type EnrollmentInput = z.infer<typeof enrollmentInputSchema>

export interface AdminTermRow extends TermOption {
  startDate: string | null
  endDate: string | null
}

export interface AdminGradeRow {
  id: string
  termId: string
  termName: string
  entryYear: number
  level: number
  name: string
  classCount: number
}

export interface AdminClassRow extends ClassOption {
  headTeacherId: string | null
}

export interface AdminSubjectRow extends SubjectOption {
  isActive: boolean
}

export interface AdminStudentRow {
  id: string
  studentNo: string
  name: string
  status: 'active' | 'graduated' | 'left'
  classId: string | null
  className: string | null
  termId: string | null
}

export interface TeacherOption {
  id: string
  displayName: string
  username: string
  roles: RoleCode[]
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
  headerRows: number
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

export const HEADER_SYNONYMS = {
  student_no: ['学号', '学籍号', '考号', '准考证号', '编号', '学生编号', '学生学号'],
  name: ['姓名', '学生姓名', '名字'],
  class_name: ['班级', '班别', '行政班'],
  source_total: ['总分', '合计', '总成绩'],
  ignore: [
    '排名',
    '名次',
    '班名次',
    '年级名次',
    '校名次',
    '班级名次',
    '总名次',
    '班级排名',
    '年级排名',
    '班排名',
    '校排名',
    '学校',
    '学校名称',
    '序号',
    '备注',
    '性别',
  ],
} as const satisfies Record<string, readonly string[]>

/**
 * 科目别名：学校成绩表里常用简称（如“道法”“政治”），
 * 映射时先按别名精确匹配，再做模糊匹配，避免误判。
 */
export const SUBJECT_CODE_ALIASES: Record<string, string[]> = {
  chinese: ['语文', '语'],
  math: ['数学', '数'],
  english: ['英语', '外语', '英'],
  physics: ['物理', '物'],
  chemistry: ['化学', '化'],
  biology: ['生物', '生'],
  politics: ['道德与法治', '道法', '政治', '思想品德'],
  history: ['历史', '史'],
  geography: ['地理', '地'],
  pe: ['体育'],
  music: ['音乐'],
  art: ['美术'],
  it: ['信息技术', '信息'],
}

export function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, '').replace(/[（）()]/g, '').trim().toLowerCase()
}