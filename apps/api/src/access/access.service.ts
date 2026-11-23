import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ExamType, RoleCode, SessionUser } from '@scorelens/shared'
import { PrismaService } from '../prisma/prisma.service'

const fullViewRoles: RoleCode[] = ['admin', 'grade_director', 'head_teacher']
const importRoles: RoleCode[] = ['admin', 'grade_director', 'head_teacher']

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentTerm() {
    return (
      (await this.prisma.academicTerm.findFirst({
        where: { isCurrent: true },
        orderBy: [{ schoolYear: 'desc' }, { termNo: 'desc' }],
      })) ??
      (await this.prisma.academicTerm.findFirst({
        orderBy: [{ schoolYear: 'desc' }, { termNo: 'desc' }],
      }))
    )
  }

  async getUser(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true, gradeDirectors: true },
    })
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('账号不可用，请重新登录')
    }

    const roles = [...new Set(user.roles.map((item) => item.role as RoleCode))]
    const term = await this.getCurrentTerm()
    const gradeIds = new Set<string>()
    const classIds = new Set<string>()
    const subjectIds = new Set<string>()

    if (roles.includes('admin')) {
      if (term) {
        const classes = await this.prisma.class.findMany({
          where: { grade: { termId: term.id } },
          select: { id: true, gradeId: true },
        })
        classes.forEach((item) => {
          classIds.add(item.id)
          gradeIds.add(item.gradeId)
        })
      }
    } else {
      if (roles.includes('grade_director')) {
        const grades = await this.prisma.grade.findMany({
          where: {
            termId: term?.id,
            directors: { some: { userId } },
          },
          include: { classes: { select: { id: true } } },
        })
        grades.forEach((grade) => {
          gradeIds.add(grade.id)
          grade.classes.forEach((klass) => classIds.add(klass.id))
        })
      }

      if (roles.includes('head_teacher')) {
        const classes = await this.prisma.class.findMany({
          where: {
            headTeacherId: userId,
            ...(term ? { grade: { termId: term.id } } : {}),
          },
          select: { id: true, gradeId: true },
        })
        classes.forEach((klass) => {
          classIds.add(klass.id)
          gradeIds.add(klass.gradeId)
        })
      }

      if (roles.includes('subject_teacher')) {
        const assignments = await this.prisma.teachingAssignment.findMany({
          where: {
            userId,
            ...(term ? { termId: term.id } : {}),
          },
          select: { classId: true, subjectId: true, class: { select: { gradeId: true } } },
        })
        assignments.forEach((item) => {
          classIds.add(item.classId)
          gradeIds.add(item.class.gradeId)
          subjectIds.add(item.subjectId)
        })
      }
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      roles,
      gradeIds: [...gradeIds],
      classIds: [...classIds],
      subjectIds: [...subjectIds],
      fullView: roles.some((role) => fullViewRoles.includes(role)),
    }
  }

  async getAccessibleClasses(userId: string) {
    const user = await this.getUser(userId)
    const term = await this.getCurrentTerm()
    if (!term || user.classIds.length === 0) return []

    const classes = await this.prisma.class.findMany({
      where: { id: { in: user.classIds } },
      include: {
        grade: { include: { term: true } },
        classGroup: true,
        headTeacher: { select: { displayName: true } },
        enrollments: {
          where: { termId: term.id },
          select: { id: true },
        },
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
    }))
  }

  async getClassOrThrow(classId: string) {
    const klass = await this.prisma.class.findUnique({
      where: { id: classId },
      include: { grade: { include: { term: true } } },
    })
    if (!klass) throw new NotFoundException('班级不存在')
    return klass
  }

  async assertClassAccess(userId: string, classId: string) {
    const user = await this.getUser(userId)
    if (!user.classIds.includes(classId)) {
      throw new ForbiddenException('无权访问该班级')
    }
    return this.getClassOrThrow(classId)
  }

  async assertExamAccess(userId: string, examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { term: true, grade: true, examSubjects: { include: { subject: true } } },
    })
    if (!exam) throw new NotFoundException('考试不存在')
    const user = await this.getUser(userId)
    if (!user.roles.includes('admin') && !user.gradeIds.includes(exam.gradeId)) {
      throw new ForbiddenException('无权访问该考试')
    }
    return exam
  }

  async isFullViewerForClass(userId: string, classId: string) {
    const user = await this.getUser(userId)
    if (user.roles.includes('admin')) return true
    if (user.roles.includes('grade_director')) {
      const klass = await this.getClassOrThrow(classId)
      return user.gradeIds.includes(klass.gradeId)
    }
    if (user.roles.includes('head_teacher')) {
      const klass = await this.getClassOrThrow(classId)
      return klass.headTeacherId === userId
    }
    return false
  }

  async getSubjectScope(userId: string, classId: string) {
    const user = await this.getUser(userId)
    if (await this.isFullViewerForClass(userId, classId)) {
      return {
        fullView: true,
        subjectIds: [] as string[],
      }
    }

    const term = await this.getCurrentTerm()
    if (!term) return { fullView: false, subjectIds: [] as string[] }
    const assignments = await this.prisma.teachingAssignment.findMany({
      where: { userId, classId, termId: term.id },
      select: { subjectId: true },
    })
    const subjectIds = [...new Set(assignments.map((item) => item.subjectId))]
    if (subjectIds.length === 0) {
      throw new ForbiddenException('无权访问该班级的科目')
    }
    return { fullView: false, subjectIds }
  }

  async assertCanImport(userId: string) {
    const user = await this.getUser(userId)
    if (!user.roles.some((role) => importRoles.includes(role))) {
      throw new ForbiddenException('当前角色不能导入成绩')
    }
    return user
  }

  async assertGradeView(userId: string) {
    const user = await this.getUser(userId)
    if (!user.roles.includes('admin') && !user.roles.includes('grade_director')) {
      throw new ForbiddenException('只有管理员或年级主任可以查看年级对比')
    }
    return user
  }

  toExamOption(exam: {
    id: string
    name: string
    type: string
    heldAt: Date
    termId: string
    gradeId: string
    status: string
    term: { name: string }
    grade: { name: string }
  }) {
    return {
      id: exam.id,
      name: exam.name,
      type: exam.type as ExamType,
      heldAt: exam.heldAt.toISOString().slice(0, 10),
      termId: exam.termId,
      termName: exam.term.name,
      gradeId: exam.gradeId,
      gradeName: exam.grade.name,
      status: exam.status as 'active' | 'archived',
    }
  }

  isPrismaUniqueError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  }
}