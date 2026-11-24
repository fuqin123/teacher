import type {
  AdminClassRow,
  AdminGradeRow,
  AdminStudentRow,
  AdminSubjectRow,
  AdminTermRow,
  AiStatusResponse,
  AiSuggestResponse,
  ApiErrorBody,
  ClassInput,
  ClassOption,
  ClassUpdateInput,
  DashboardResponse,
  EnrollmentInput,
  ExamOption,
  GradeCompareResponse,
  GradeInput,
  GradeUpdateInput,
  ImportBatchDetail,
  ImportBatchListItem,
  ImportCommitResponse,
  ImportMappingInput,
  ImportValidationResponse,
  ParsedImportResponse,
  SessionUser,
  StudentInput,
  StudentProfileResponse,
  StudentUpdateInput,
  SubjectInput,
  SubjectOption,
  SubjectUpdateInput,
  TeacherOption,
  TermInput,
  TermOption,
  TermUpdateInput,
} from '@scorelens/shared'

const BASE = '/api/v1'

export class ApiError extends Error {
  status: number
  body: ApiErrorBody | null

  constructor(status: number, body: ApiErrorBody | null, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    let body: ApiErrorBody | null = null
    try {
      body = (await response.json()) as ApiErrorBody
    } catch {
      body = null
    }
    const details = Array.isArray(body?.details)
      ? (body!.details as Array<{ message?: string }>)
          .map((item) => item?.message)
          .filter(Boolean)
          .slice(0, 3)
          .join('；')
      : ''
    const message = body?.message
      ? details
        ? `${body.message}：${details}`
        : body.message
      : `请求失败（${response.status}）`
    throw new ApiError(response.status, body, message)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const api = {
  login(username: string, password: string) {
    return request<SessionUser>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },
  logout() {
    return request<{ ok: boolean }>('/auth/logout', { method: 'POST' })
  },
  me() {
    return request<SessionUser>('/auth/me')
  },

  getTerms() {
    return request<TermOption[]>('/roster/terms')
  },
  getClasses() {
    return request<ClassOption[]>('/roster/classes')
  },
  getSubjects() {
    return request<SubjectOption[]>('/roster/subjects')
  },
  getGrades() {
    return request<Array<{ id: string; name: string; level: number; entryYear: number }>>(
      '/roster/grades',
    )
  },
  getStudents(classId?: string, search?: string) {
    return request<
      Array<{
        id: string
        studentNo: string
        name: string
        status: string
        classId: string
        className: string
        gradeId: string
        gradeName: string
      }>
    >(`/roster/students${query({ classId, search })}`)
  },
  getStudent(id: string) {
    return request<{
      id: string
      studentNo: string
      name: string
      status: string
      classId: string
      className: string
      gradeName: string
      headTeacherName: string | null
    }>(`/roster/students/${id}`)
  },

  getExams() {
    return request<ExamOption[]>('/exams')
  },
  getExam(id: string) {
    return request<
      ExamOption & {
        subjects: Array<{
          subjectId: string
          subjectName: string
          fullScore: number
          includedInTotal: boolean
          sortOrder: number
        }>
        scoreCount: number
      }
    >(`/exams/${id}`)
  },

  getDashboard(examId: string, classId: string, subjectId?: string) {
    return request<DashboardResponse>(
      `/analytics/dashboard${query({ examId, classId, subjectId })}`,
    )
  },
  getStudentProfile(studentId: string, examId?: string, subjectId?: string) {
    return request<StudentProfileResponse>(
      `/analytics/student/${studentId}${query({ examId, subjectId })}`,
    )
  },
  getGradeCompare(examId: string) {
    return request<GradeCompareResponse>(`/analytics/grade${query({ examId })}`)
  },

  uploadImport(file: File, classId: string) {
    const form = new FormData()
    form.append('file', file)
    form.append('classId', classId)
    return request<ParsedImportResponse>('/imports', {
      method: 'POST',
      body: form,
    })
  },
  saveImportMapping(batchId: string, input: ImportMappingInput) {
    return request<{ ok: boolean }>(`/imports/${batchId}/mapping`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  validateImport(batchId: string) {
    return request<ImportValidationResponse>(`/imports/${batchId}/validate`, {
      method: 'POST',
    })
  },
  commitImport(batchId: string) {
    return request<ImportCommitResponse>(`/imports/${batchId}/commit`, {
      method: 'POST',
    })
  },
  getImports() {
    return request<ImportBatchListItem[]>('/imports')
  },
  getImport(id: string) {
    return request<ImportBatchDetail>(`/imports/${id}`)
  },
  getAiStatus() {
    return request<AiStatusResponse>('/imports/ai-status')
  },
  suggestImportMapping(batchId: string) {
    return request<AiSuggestResponse>(`/imports/${batchId}/ai-suggest`, { method: 'POST' })
  },

  getAdminTerms() {
    return request<AdminTermRow[]>('/admin/terms')
  },
  getAdminGrades() {
    return request<AdminGradeRow[]>('/admin/grades')
  },
  getAdminClasses() {
    return request<AdminClassRow[]>('/admin/classes')
  },
  getAdminSubjects() {
    return request<AdminSubjectRow[]>('/admin/subjects')
  },
  getAdminTeachers() {
    return request<TeacherOption[]>('/admin/teachers')
  },
  getAdminStudents(classId?: string) {
    return request<AdminStudentRow[]>(`/admin/students${query({ classId })}`)
  },
  createTerm(input: TermInput) {
    return request<{ id: string }>('/admin/terms', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  updateTerm(id: string, input: TermUpdateInput) {
    return request<{ ok: boolean }>(`/admin/terms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  createGrade(input: GradeInput) {
    return request<{ id: string }>('/admin/grades', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  updateGrade(id: string, input: GradeUpdateInput) {
    return request<{ ok: boolean }>(`/admin/grades/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  createClass(input: ClassInput) {
    return request<{ id: string }>('/admin/classes', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  updateClass(id: string, input: ClassUpdateInput) {
    return request<{ ok: boolean }>(`/admin/classes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  createSubject(input: SubjectInput) {
    return request<{ id: string }>('/admin/subjects', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  updateSubject(id: string, input: SubjectUpdateInput) {
    return request<{ ok: boolean }>(`/admin/subjects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  createStudent(input: StudentInput) {
    return request<{ id: string }>('/admin/students', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  updateStudent(id: string, input: StudentUpdateInput) {
    return request<{ ok: boolean }>(`/admin/students/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  enrollStudent(id: string, input: EnrollmentInput) {
    return request<{ ok: boolean }>(`/admin/students/${id}/enrollment`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
}