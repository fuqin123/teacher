import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { AccessService } from '../../access/access.service'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class RosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async listClasses(userId: string) {
    return this.access.getAccessibleClasses(userId)
  }

  async listTerms() {
    return this.prisma.academicTerm.findMany({
      orderBy: [{ schoolYear: 'desc' }, { termNo: 'desc' }],
      select: {
        id: true,
        schoolYear: true,
        termNo: true,
        name: true,
        isCurrent: true,
      },
    })
  }

  async listSubjects(userId: string) {
    const user = await this.access.getUser(userId)
    const isOnlySubjectTeacher =
      user.roles.length === 1 && user.roles[0] === 'subject_teacher'
    return this.prisma.subject.findMany({
      where: {
        isActive: true,
        ...(isOnlySubjectTeacher ? { id: { in: user.subjectIds } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        defaultFullScore: true,
        sortOrder: true,
      },
    }).then((subjects) =>
      subjects.map((subject) => ({
        ...subject,
        defaultFullScore:
          subject.defaultFullScore === null ? null : Number(subject.defaultFullScore),
      })),
    )
  }

  async listStudents(userId: string, classId?: string, search?: string) {
    const user = await this.access.getUser(userId)
    if (classId) {
      await this.access.assertClassAccess(userId, classId)
    }
    const term = await this.access.getCurrentTerm()
    if (!term) return []

    const enrollments = await this.prisma.studentTermEnrollment.findMany({
      where: {
        termId: term.id,
        classId: classId ? classId : { in: user.classIds },
        student: search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { studentNo: { contains: search, mode: 'insensitive' } },
              ],
            }
          : undefined,
      },
      include: {
        student: true,
        class: { include: { grade: true } },
      },
      orderBy: [{ class: { sortOrder: 'asc' } }, { student: { studentNo: 'asc' } }],
      take: 500,
    })

    return enrollments.map((item) => ({
      id: item.student.id,
      studentNo: item.student.studentNo,
      name: item.student.name,
      status: item.student.status,
      classId: item.classId,
      className: item.class.name,
      gradeId: item.class.gradeId,
      gradeName: item.class.grade.name,
    }))
  }

  async getStudent(userId: string, studentId: string) {
    const term = await this.access.getCurrentTerm()
    if (!term) throw new NotFoundException('学生不存在')

    const enrollment = await this.prisma.studentTermEnrollment.findFirst({
      where: { studentId, termId: term.id },
      include: {
        student: true,
        class: { include: { grade: true, headTeacher: true } },
      },
    })
    if (!enrollment) throw new NotFoundException('学生不存在')
    await this.access.assertClassAccess(userId, enrollment.classId)

    return {
      id: enrollment.student.id,
      studentNo: enrollment.student.studentNo,
      name: enrollment.student.name,
      status: enrollment.student.status,
      classId: enrollment.classId,
      className: enrollment.class.name,
      gradeName: enrollment.class.grade.name,
      headTeacherName: enrollment.class.headTeacher?.displayName ?? null,
    }
  }

  async assertStudentInScope(userId: string, studentId: string) {
    const term = await this.access.getCurrentTerm()
    if (!term) throw new NotFoundException('学生不存在')
    const enrollment = await this.prisma.studentTermEnrollment.findFirst({
      where: { studentId, termId: term.id },
      include: { student: true, class: { include: { grade: true } } },
    })
    if (!enrollment) throw new NotFoundException('学生不存在')
    await this.access.assertClassAccess(userId, enrollment.classId)
    return enrollment
  }

  async listGrades(userId: string) {
    const user = await this.access.getUser(userId)
    if (!user.gradeIds.length) return []
    return this.prisma.grade.findMany({
      where: { id: { in: user.gradeIds } },
      orderBy: { level: 'asc' },
      select: { id: true, name: true, level: true, entryYear: true },
    })
  }

  async ensureCanManageRoster(userId: string) {
    const user = await this.access.getUser(userId)
    if (!user.roles.includes('admin')) {
      throw new ForbiddenException('只有管理员可以维护基础数据')
    }
  }
}