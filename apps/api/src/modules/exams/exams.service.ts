import { Injectable } from '@nestjs/common'
import { AccessService } from '../../access/access.service'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async list(userId: string) {
    const user = await this.access.getUser(userId)
    const exams = await this.prisma.exam.findMany({
      where: {
        status: 'active',
        ...(user.roles.includes('admin') ? {} : { gradeId: { in: user.gradeIds } }),
      },
      include: { term: true, grade: true },
      orderBy: [{ heldAt: 'desc' }, { name: 'asc' }],
      take: 100,
    })
    return exams.map((exam) => this.access.toExamOption(exam))
  }

  async detail(userId: string, examId: string) {
    const exam = await this.access.assertExamAccess(userId, examId)
    return {
      ...this.access.toExamOption(exam),
      subjects: exam.examSubjects
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          subjectId: item.subjectId,
          subjectName: item.subject.name,
          fullScore: Number(item.fullScore),
          includedInTotal: item.includedInTotal,
          sortOrder: item.sortOrder,
        })),
      scoreCount: await this.prisma.score.count({ where: { examId } }),
    }
  }
}