import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
  AdminClassRow,
  AdminGradeRow,
  AdminStudentRow,
  AdminSubjectRow,
  AdminTermRow,
  ClassInput,
  ClassUpdateInput,
  EnrollmentInput,
  GradeInput,
  GradeUpdateInput,
  StudentInput,
  StudentUpdateInput,
  SubjectInput,
  SubjectUpdateInput,
  TeacherOption,
  TermInput,
  TermUpdateInput,
  RoleCode,
  AiSettingsInput,
} from '@scorelens/shared'
import { Request } from 'express'
import { AccessService } from '../../access/access.service'
import { AiConfigService } from '../../ai/ai-config.service'
import { AuditService } from '../../audit/audit.service'
import { PrismaService } from '../../prisma/prisma.service'

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) throw new BadRequestException('日期格式无效')
  return date
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

/**
 * 基础数据维护（学期 / 年级 / 班级 / 科目 / 学生）。
 * 仅管理员可用；所有写操作都会写审计日志。
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly aiConfig: AiConfigService,
  ) {}

  async assertAdmin(userId: string) {
    const user = await this.access.getUser(userId)
    if (!user.roles.includes('admin')) {
      throw new ForbiddenException('只有管理员可以维护基础数据')
    }
    return user
  }

  /* ---------------- 列表 ---------------- */

  async listTerms(): Promise<AdminTermRow[]> {
    const terms = await this.prisma.academicTerm.findMany({
      orderBy: [{ schoolYear: 'desc' }, { termNo: 'desc' }],
    })
    return terms.map((term) => ({
      id: term.id,
      schoolYear: term.schoolYear,
      termNo: term.termNo,
      name: term.name,
      isCurrent: term.isCurrent,
      startDate: isoDate(term.startDate),
      endDate: isoDate(term.endDate),
    }))
  }

  async listGrades(): Promise<AdminGradeRow[]> {
    const grades = await this.prisma.grade.findMany({
      include: { term: { select: { name: true } }, _count: { select: { classes: true } } },
      orderBy: [{ entryYear: 'desc' }, { level: 'asc' }],
    })
    return grades.map((grade) => ({
      id: grade.id,
      termId: grade.termId,
      termName: grade.term.name,
      entryYear: grade.entryYear,
      level: grade.level,
      name: grade.name,
      classCount: grade._count.classes,
    }))
  }

  async listClasses(): Promise<AdminClassRow[]> {
    const classes = await this.prisma.class.findMany({
      include: {
        grade: { include: { term: true } },
        classGroup: true,
        headTeacher: { select: { displayName: true } },
        enrollments: { select: { id: true } },
      },
      orderBy: [{ grade: { level: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
    })
    return classes.map((klass) => ({
      id: klass.id,
      name: klass.name,
      gradeId: klass.gradeId,
      gradeName: klass.grade.name,
      gradeLevel: klass.grade.level,
      termId: klass.grade.termId,
      termName: klass.grade.term.name,
      classGroupId: klass.classGroupId,
      classGroupName: klass.classGroup.name,
      studentCount: klass.enrollments.length,
      headTeacherName: klass.headTeacher?.displayName ?? null,
      headTeacherId: klass.headTeacherId,
    }))
  }

  async listSubjects(): Promise<AdminSubjectRow[]> {
    const subjects = await this.prisma.subject.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    return subjects.map((subject) => ({
      id: subject.id,
      code: subject.code,
      name: subject.name,
      category: subject.category as 'cultural' | 'other',
      defaultFullScore:
        subject.defaultFullScore === null ? null : Number(subject.defaultFullScore),
      sortOrder: subject.sortOrder,
      isActive: subject.isActive,
    }))
  }

  async listTeachers(): Promise<TeacherOption[]> {
    const users = await this.prisma.user.findMany({
      where: { status: 'active' },
      include: { roles: true },
      orderBy: { displayName: 'asc' },
    })
    return users.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      username: user.username,
      roles: user.roles.map((item) => item.role as RoleCode),
    }))
  }

  async listStudents(classId?: string): Promise<AdminStudentRow[]> {
    const term = await this.access.getCurrentTerm()
    const enrollments = await this.prisma.studentTermEnrollment.findMany({
      where: { termId: term?.id, ...(classId ? { classId } : {}) },
      include: { student: true, class: true },
      orderBy: [{ class: { sortOrder: 'asc' } }, { student: { studentNo: 'asc' } }],
      take: 500,
    })
    return enrollments.map((item) => ({
      id: item.student.id,
      studentNo: item.student.studentNo,
      name: item.student.name,
      status: item.student.status as AdminStudentRow['status'],
      classId: item.classId,
      className: item.class.name,
      termId: item.termId,
    }))
  }

  /* ---------------- 学期 ---------------- */

  async createTerm(userId: string, input: TermInput, request: Request) {
    await this.assertAdmin(userId)
    const duplicate = await this.prisma.academicTerm.findUnique({
      where: { schoolYear_termNo: { schoolYear: input.schoolYear, termNo: input.termNo } },
    })
    if (duplicate) throw new BadRequestException('该学年的该学期已存在')

    const term = await this.prisma.$transaction(async (tx) => {
      if (input.isCurrent) {
        await tx.academicTerm.updateMany({
          where: { isCurrent: true },
          data: { isCurrent: false },
        })
      }
      return tx.academicTerm.create({
        data: {
          schoolYear: input.schoolYear,
          termNo: input.termNo,
          name: input.name,
          startDate: toDate(input.startDate) ?? null,
          endDate: toDate(input.endDate) ?? null,
          isCurrent: input.isCurrent ?? false,
        },
      })
    })

    await this.audit.log({
      actorId: userId,
      action: 'admin.term.create',
      entityType: 'academic_term',
      entityId: term.id,
      detail: input,
      request,
    })
    return { id: term.id }
  }

  async updateTerm(userId: string, termId: string, input: TermUpdateInput, request: Request) {
    await this.assertAdmin(userId)
    const existing = await this.prisma.academicTerm.findUnique({ where: { id: termId } })
    if (!existing) throw new NotFoundException('学期不存在')

    const schoolYear = input.schoolYear ?? existing.schoolYear
    const termNo = input.termNo ?? existing.termNo
    if (schoolYear !== existing.schoolYear || termNo !== existing.termNo) {
      const duplicate = await this.prisma.academicTerm.findUnique({
        where: { schoolYear_termNo: { schoolYear, termNo } },
      })
      if (duplicate) throw new BadRequestException('该学年的该学期已存在')
    }

    await this.prisma.$transaction(async (tx) => {
      if (input.isCurrent) {
        await tx.academicTerm.updateMany({
          where: { isCurrent: true, NOT: { id: termId } },
          data: { isCurrent: false },
        })
      }
      await tx.academicTerm.update({
        where: { id: termId },
        data: {
          schoolYear,
          termNo,
          name: input.name ?? existing.name,
          startDate: input.startDate === undefined ? undefined : toDate(input.startDate),
          endDate: input.endDate === undefined ? undefined : toDate(input.endDate),
          isCurrent: input.isCurrent ?? existing.isCurrent,
        },
      })
    })

    await this.audit.log({
      actorId: userId,
      action: 'admin.term.update',
      entityType: 'academic_term',
      entityId: termId,
      detail: input,
      request,
    })
    return { ok: true }
  }

  /* ---------------- 年级 ---------------- */

  async createGrade(userId: string, input: GradeInput, request: Request) {
    await this.assertAdmin(userId)
    const term = await this.prisma.academicTerm.findUnique({ where: { id: input.termId } })
    if (!term) throw new BadRequestException('学期不存在')
    const duplicate = await this.prisma.grade.findUnique({
      where: { termId_level: { termId: input.termId, level: input.level } },
    })
    if (duplicate) throw new BadRequestException('该学期已存在相同层次的年级')

    const grade = await this.prisma.grade.create({
      data: {
        termId: input.termId,
        entryYear: input.entryYear,
        level: input.level,
        name: input.name,
      },
    })
    await this.audit.log({
      actorId: userId,
      action: 'admin.grade.create',
      entityType: 'grade',
      entityId: grade.id,
      detail: input,
      request,
    })
    return { id: grade.id }
  }

  async updateGrade(userId: string, gradeId: string, input: GradeUpdateInput, request: Request) {
    await this.assertAdmin(userId)
    const existing = await this.prisma.grade.findUnique({ where: { id: gradeId } })
    if (!existing) throw new NotFoundException('年级不存在')

    const termId = input.termId ?? existing.termId
    const level = input.level ?? existing.level
    if (termId !== existing.termId || level !== existing.level) {
      const duplicate = await this.prisma.grade.findUnique({
        where: { termId_level: { termId, level } },
      })
      if (duplicate) throw new BadRequestException('该学期已存在相同层次的年级')
    }

    await this.prisma.grade.update({
      where: { id: gradeId },
      data: {
        termId,
        level,
        entryYear: input.entryYear ?? existing.entryYear,
        name: input.name ?? existing.name,
      },
    })
    await this.audit.log({
      actorId: userId,
      action: 'admin.grade.update',
      entityType: 'grade',
      entityId: gradeId,
      detail: input,
      request,
    })
    return { ok: true }
  }

  /* ---------------- 班级 ---------------- */

  async createClass(userId: string, input: ClassInput, request: Request) {
    await this.assertAdmin(userId)
    const grade = await this.prisma.grade.findUnique({ where: { id: input.gradeId } })
    if (!grade) throw new BadRequestException('年级不存在')
    const duplicate = await this.prisma.class.findUnique({
      where: { gradeId_name: { gradeId: input.gradeId, name: input.name } },
    })
    if (duplicate) throw new BadRequestException('该年级下已存在同名班级')

    if (input.headTeacherId) await this.assertHeadTeacher(input.headTeacherId)

    const classGroup = await this.ensureClassGroup(grade.entryYear, input.classGroupName)
    const klass = await this.prisma.class.create({
      data: {
        gradeId: input.gradeId,
        classGroupId: classGroup.id,
        name: input.name,
        headTeacherId: input.headTeacherId ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    })
    await this.audit.log({
      actorId: userId,
      action: 'admin.class.create',
      entityType: 'class',
      entityId: klass.id,
      detail: input,
      request,
    })
    return { id: klass.id }
  }

  async updateClass(userId: string, classId: string, input: ClassUpdateInput, request: Request) {
    await this.assertAdmin(userId)
    const existing = await this.prisma.class.findUnique({
      where: { id: classId },
      include: { grade: true },
    })
    if (!existing) throw new NotFoundException('班级不存在')

    const name = input.name ?? existing.name
    if (name !== existing.name) {
      const duplicate = await this.prisma.class.findUnique({
        where: { gradeId_name: { gradeId: existing.gradeId, name } },
      })
      if (duplicate) throw new BadRequestException('该年级下已存在同名班级')
    }
    if (input.headTeacherId) await this.assertHeadTeacher(input.headTeacherId)

    const classGroup = input.classGroupName
      ? await this.ensureClassGroup(existing.grade.entryYear, input.classGroupName)
      : null

    await this.prisma.class.update({
      where: { id: classId },
      data: {
        name,
        headTeacherId:
          input.headTeacherId === undefined ? undefined : input.headTeacherId,
        sortOrder: input.sortOrder,
        classGroupId: classGroup?.id,
      },
    })
    await this.audit.log({
      actorId: userId,
      action: 'admin.class.update',
      entityType: 'class',
      entityId: classId,
      detail: input,
      request,
    })
    return { ok: true }
  }

  /* ---------------- 科目 ---------------- */

  async createSubject(userId: string, input: SubjectInput, request: Request) {
    await this.assertAdmin(userId)
    const duplicate = await this.prisma.subject.findUnique({ where: { code: input.code } })
    if (duplicate) throw new BadRequestException('科目代码已存在')

    const subject = await this.prisma.subject.create({
      data: {
        code: input.code,
        name: input.name,
        category: input.category,
        defaultFullScore: input.defaultFullScore ?? null,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
    })
    await this.audit.log({
      actorId: userId,
      action: 'admin.subject.create',
      entityType: 'subject',
      entityId: subject.id,
      detail: input,
      request,
    })
    return { id: subject.id }
  }

  async updateSubject(
    userId: string,
    subjectId: string,
    input: SubjectUpdateInput,
    request: Request,
  ) {
    await this.assertAdmin(userId)
    const existing = await this.prisma.subject.findUnique({ where: { id: subjectId } })
    if (!existing) throw new NotFoundException('科目不存在')

    if (input.code && input.code !== existing.code) {
      const duplicate = await this.prisma.subject.findUnique({ where: { code: input.code } })
      if (duplicate) throw new BadRequestException('科目代码已存在')
    }

    await this.prisma.subject.update({
      where: { id: subjectId },
      data: {
        code: input.code,
        name: input.name,
        category: input.category,
        defaultFullScore:
          input.defaultFullScore === undefined ? undefined : input.defaultFullScore,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    })
    await this.audit.log({
      actorId: userId,
      action: 'admin.subject.update',
      entityType: 'subject',
      entityId: subjectId,
      detail: input,
      request,
    })
    return { ok: true }
  }

  /* ---------------- 学生 ---------------- */

  async createStudent(userId: string, input: StudentInput, request: Request) {
    await this.assertAdmin(userId)
    const duplicate = await this.prisma.student.findUnique({
      where: { studentNo: input.studentNo },
    })
    if (duplicate) throw new BadRequestException(`学号 ${input.studentNo} 已存在`)

    const klass = await this.prisma.class.findUnique({
      where: { id: input.classId },
      include: { grade: true },
    })
    if (!klass) throw new BadRequestException('班级不存在')

    const student = await this.prisma.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: {
          studentNo: input.studentNo,
          name: input.name,
          status: input.status ?? 'active',
        },
      })
      await tx.studentTermEnrollment.create({
        data: {
          termId: klass.grade.termId,
          studentId: created.id,
          classId: klass.id,
        },
      })
      return created
    })

    await this.audit.log({
      actorId: userId,
      action: 'admin.student.create',
      entityType: 'student',
      entityId: student.id,
      detail: { ...input, termId: klass.grade.termId },
      request,
    })
    return { id: student.id }
  }

  async updateStudent(
    userId: string,
    studentId: string,
    input: StudentUpdateInput,
    request: Request,
  ) {
    await this.assertAdmin(userId)
    const existing = await this.prisma.student.findUnique({ where: { id: studentId } })
    if (!existing) throw new NotFoundException('学生不存在')

    if (input.studentNo && input.studentNo !== existing.studentNo) {
      const duplicate = await this.prisma.student.findUnique({
        where: { studentNo: input.studentNo },
      })
      if (duplicate) throw new BadRequestException(`学号 ${input.studentNo} 已存在`)
    }

    await this.prisma.student.update({
      where: { id: studentId },
      data: {
        studentNo: input.studentNo,
        name: input.name,
        status: input.status,
      },
    })
    await this.audit.log({
      actorId: userId,
      action: 'admin.student.update',
      entityType: 'student',
      entityId: studentId,
      detail: input,
      request,
    })
    return { ok: true }
  }

  async enrollStudent(
    userId: string,
    studentId: string,
    input: EnrollmentInput,
    request: Request,
  ) {
    await this.assertAdmin(userId)
    const student = await this.prisma.student.findUnique({ where: { id: studentId } })
    if (!student) throw new NotFoundException('学生不存在')
    const klass = await this.prisma.class.findUnique({
      where: { id: input.classId },
      include: { grade: true },
    })
    if (!klass) throw new BadRequestException('班级不存在')

    const termId = input.termId ?? klass.grade.termId
    await this.prisma.studentTermEnrollment.upsert({
      where: { termId_studentId: { termId, studentId } },
      update: { classId: klass.id },
      create: { termId, studentId, classId: klass.id },
    })
    await this.audit.log({
      actorId: userId,
      action: 'admin.student.enroll',
      entityType: 'student',
      entityId: studentId,
      detail: { termId, classId: klass.id },
      request,
    })
    return { ok: true }
  }

  /* ---------------- AI 表头识别配置 ---------------- */

  async getAiSettings(userId: string) {
    await this.assertAdmin(userId)
    return this.aiConfig.view()
  }

  async saveAiSettings(userId: string, input: AiSettingsInput, request: Request) {
    await this.assertAdmin(userId)
    const view = await this.aiConfig.save(input, userId)
    await this.audit.log({
      actorId: userId,
      action: 'admin.ai_settings.update',
      entityType: 'app_setting',
      entityId: 'ai_config',
      // 只记录非敏感字段，绝不记录 API Key
      detail: {
        enabled: input.enabled,
        baseUrl: input.baseUrl,
        model: input.model,
        timeoutMs: input.timeoutMs,
        apiKeyChanged: Boolean(input.apiKey),
      },
      request,
    })
    return view
  }

  async testAiSettings(
    userId: string,
    overrides: { baseUrl?: string; model?: string; apiKey?: string },
  ) {
    await this.assertAdmin(userId)
    return this.aiConfig.test(overrides)
  }

  async resetAiSettings(userId: string, request: Request) {
    await this.assertAdmin(userId)
    const view = await this.aiConfig.reset()
    await this.audit.log({
      actorId: userId,
      action: 'admin.ai_settings.reset',
      entityType: 'app_setting',
      entityId: 'ai_config',
      request,
    })
    return view
  }

  /* ---------------- 内部工具 ---------------- */

  private async ensureClassGroup(entryYear: number, name: string) {
    const existing = await this.prisma.classGroup.findUnique({
      where: { entryYear_name: { entryYear, name } },
    })
    if (existing) return existing
    return this.prisma.classGroup.create({ data: { entryYear, name, sortOrder: 0 } })
  }

  private async assertHeadTeacher(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true },
    })
    if (!user) throw new BadRequestException('班主任账号不存在')
    const roles = user.roles.map((item) => item.role)
    if (!roles.includes('head_teacher') && !roles.includes('admin')) {
      throw new BadRequestException('所选账号不是班主任或管理员')
    }
  }

  /** Prisma 唯一约束冲突转成可读提示（供控制器兜底使用）。 */
  isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  }
}
