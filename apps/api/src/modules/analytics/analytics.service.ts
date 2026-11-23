import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import {
  BorderlineItem,
  DashboardResponse,
  DistributionData,
  GradeCompareResponse,
  KpiSummary,
  RankingRow,
  StudentProfileResponse,
  SubjectComparison,
  SubjectOption,
  TrendPoint,
  EXCELLENT_RATIO,
  PASS_RATIO,
  round,
} from '@scorelens/shared'
import { AccessService } from '../../access/access.service'
import { PrismaService } from '../../prisma/prisma.service'
import {
  ExamSubjectInfo,
  ScoreMap,
  ScoreRecord,
  StudentInfo,
  StudentTotal,
  average,
  buildBins,
  buildClassRanks,
  buildGradeRanks,
  buildScoreMap,
  buildSubjectRanks,
  computeStudentTotals,
  rankByScore,
  rate,
  stddev,
  subjectScoresOf,
  totalsOf,
} from './analytics.calculations'

interface ExamData {
  exam: {
    id: string
    name: string
    type: string
    heldAt: Date
    termId: string
    gradeId: string
    status: string
    term: { id: string; name: string }
    grade: { id: string; name: string; level: number }
    examSubjects: Array<{
      subjectId: string
      fullScore: unknown
      includedInTotal: boolean
      sortOrder: number
      subject: {
        id: string
        code: string
        name: string
        category: string
        defaultFullScore: unknown
        sortOrder: number
      }
    }>
  }
  classes: Array<{
    id: string
    name: string
    classGroupId: string
    headTeacher: { displayName: string } | null
    enrollments: Array<{ student: { id: string; studentNo: string; name: string } }>
  }>
  scores: ScoreRecord[]
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async dashboard(
    userId: string,
    examId: string,
    classId: string,
    subjectIdInput?: string,
  ): Promise<DashboardResponse> {
    const classInfo = await this.findClassOption(userId, classId)
    const examAccess = await this.access.assertExamAccess(userId, examId)
    if (examAccess.gradeId !== classInfo.gradeId) {
      throw new BadRequestException('考试与班级不属于同一年级')
    }

    const scope = await this.access.getSubjectScope(userId, classId)
    const mode = scope.fullView ? 'full' : 'subject'
    const data = await this.loadExamData(examId)
    const subjectInfos = this.subjectInfos(data)
    const scopedSubjects = scope.fullView
      ? subjectInfos
      : subjectInfos.filter((subject) => scope.subjectIds.includes(subject.subjectId))

    if (mode === 'subject' && scopedSubjects.length === 0) {
      throw new ForbiddenException('没有可查看的科目')
    }

    const activeSubject =
      mode === 'subject'
        ? scopedSubjects.find((subject) => subject.subjectId === subjectIdInput) ??
          scopedSubjects[0]
        : subjectInfos.find((subject) => subject.subjectId === subjectIdInput) ??
          subjectInfos.find((subject) => subject.includedInTotal) ??
          subjectInfos[0]

    if (!activeSubject) throw new BadRequestException('考试没有配置科目')

    const visibleSubjects = mode === 'subject' ? scopedSubjects : subjectInfos
    const targetClass = data.classes.find((klass) => klass.id === classId)
    if (!targetClass) throw new NotFoundException('该考试中没有该班级的数据')

    const classStudents = this.studentsOfClass(targetClass)
    const allStudents = this.allStudents(data)
    const scoreMap = buildScoreMap(data.scores)
    const totals = computeStudentTotals(subjectInfos, allStudents, scoreMap)

    const classRanks =
      mode === 'full'
        ? buildClassRanks(totals, classStudents)
        : buildSubjectRanks(activeSubject.subjectId, classStudents, scoreMap, 'class')
    const gradeRanks =
      mode === 'full'
        ? buildGradeRanks(totals, allStudents)
        : buildSubjectRanks(activeSubject.subjectId, allStudents, scoreMap, 'grade')

    const exams = await this.listExamsForGrade(data.exam.gradeId, data.exam.termId)
    const previousExam = this.previousExamOf(exams, data.exam.id)
    const previousRanks = previousExam
      ? await this.classRankMapForExam(
          previousExam.id,
          classId,
          mode,
          activeSubject.subjectId,
        )
      : new Map<string, number>()

    const kpis = this.buildKpis(
      mode,
      subjectInfos,
      activeSubject,
      classStudents,
      totals,
      scoreMap,
    )
    const subjectComparisons = this.buildSubjectComparisons(
      mode === 'full' ? visibleSubjects : [activeSubject],
      classStudents,
      allStudents,
      scoreMap,
    )
    const trend = await this.buildTrend(
      exams,
      data,
      classId,
      mode,
      activeSubject.subjectId,
    )

    const ranking = classStudents
      .map<RankingRow>((student) => {
        const total = totals.get(student.id)
        const subjectRecord = scoreMap.get(student.id)?.get(activeSubject.subjectId)
        const complete =
          mode === 'full'
            ? Boolean(total?.complete)
            : Boolean(subjectRecord && !subjectRecord.isAbsent && subjectRecord.score !== null)
        const currentClassRank = classRanks.get(student.id) ?? null
        const previousClassRank = previousRanks.get(student.id) ?? null
        const rankDelta =
          currentClassRank !== null && previousClassRank !== null
            ? previousClassRank - currentClassRank
            : null

        return {
          studentId: student.id,
          studentNo: student.studentNo,
          name: student.name,
          totalScore:
            mode === 'full'
              ? total?.totalScore ?? null
              : subjectRecord?.isAbsent
                ? null
                : subjectRecord?.score ?? null,
          classRank: currentClassRank,
          gradeRank: gradeRanks.get(student.id) ?? null,
          rankDelta,
          complete,
          absentCount: total?.absentCount ?? (subjectRecord?.isAbsent ? 1 : 0),
          scores: visibleSubjects.map((subject) => {
            const record = scoreMap.get(student.id)?.get(subject.subjectId)
            return {
              subjectId: subject.subjectId,
              subjectName: subject.subjectName,
              score: record?.isAbsent ? null : record?.score ?? null,
              isAbsent: record?.isAbsent ?? false,
              fullScore: subject.fullScore,
            }
          }),
        }
      })
      .sort((a, b) => {
        if (a.classRank === null && b.classRank === null) return a.name.localeCompare(b.name)
        if (a.classRank === null) return 1
        if (b.classRank === null) return -1
        return a.classRank - b.classRank
      })

    const distribution = this.buildDistribution(
      data,
      activeSubject,
      classStudents,
      scoreMap,
    )
    const borderline = this.buildBorderline(
      visibleSubjects,
      classStudents,
      scoreMap,
      mode,
    )

    const gradeAverageTotal =
      mode === 'full'
        ? average(totalsOf(totals, allStudents))
        : average(subjectScoresOf(activeSubject.subjectId, scoreMap, allStudents))

    return {
      mode,
      exam: this.access.toExamOption(data.exam),
      classInfo,
      subject: mode === 'subject' ? this.subjectOption(data, activeSubject) : null,
      kpis,
      subjects: subjectComparisons,
      trend,
      ranking,
      distribution,
      borderline,
      previousExamName: previousExam?.name ?? null,
      gradeAverageTotal,
    }
  }

  async studentProfile(
    userId: string,
    studentId: string,
    examIdInput?: string,
    subjectIdInput?: string,
  ): Promise<StudentProfileResponse> {
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
    const classInfo = await this.findClassOption(userId, enrollment.classId)

    const exam = examIdInput
      ? await this.access.assertExamAccess(userId, examIdInput)
      : await this.prisma.exam.findFirst({
          where: {
            gradeId: enrollment.class.gradeId,
            termId: term.id,
            status: 'active',
          },
          include: { term: true, grade: true, examSubjects: { include: { subject: true } } },
          orderBy: [{ heldAt: 'desc' }],
        })
    if (!exam) throw new NotFoundException('暂无考试数据')
    if (exam.gradeId !== enrollment.class.gradeId) {
      throw new BadRequestException('考试与学生不属于同一年级')
    }

    const scope = await this.access.getSubjectScope(userId, enrollment.classId)
    const mode = scope.fullView ? 'full' : 'subject'
    const data = await this.loadExamData(exam.id)
    const subjectInfos = this.subjectInfos(data)
    const scopedSubjects = scope.fullView
      ? subjectInfos
      : subjectInfos.filter((subject) => scope.subjectIds.includes(subject.subjectId))
    if (mode === 'subject' && scopedSubjects.length === 0) {
      throw new ForbiddenException('没有可查看的科目')
    }
    const activeSubject =
      mode === 'subject'
        ? scopedSubjects.find((subject) => subject.subjectId === subjectIdInput) ??
          scopedSubjects[0]
        : null
    const visibleSubjects = mode === 'subject' ? [activeSubject!] : subjectInfos

    const targetClass = data.classes.find((klass) => klass.id === enrollment.classId)
    if (!targetClass) throw new NotFoundException('该考试中没有该学生的班级数据')
    const classStudents = this.studentsOfClass(targetClass)
    const allStudents = this.allStudents(data)
    const scoreMap = buildScoreMap(data.scores)
    const totals = computeStudentTotals(subjectInfos, allStudents, scoreMap)
    const classRanks =
      mode === 'full'
        ? buildClassRanks(totals, classStudents)
        : buildSubjectRanks(activeSubject!.subjectId, classStudents, scoreMap, 'class')
    const gradeRanks =
      mode === 'full'
        ? buildGradeRanks(totals, allStudents)
        : buildSubjectRanks(activeSubject!.subjectId, allStudents, scoreMap, 'grade')

    const exams = await this.listExamsForGrade(data.exam.gradeId, data.exam.termId)
    const previousExam = this.previousExamOf(exams, data.exam.id)
    const previousRanks = previousExam
      ? await this.classRankMapForExam(
          previousExam.id,
          enrollment.classId,
          mode,
          activeSubject?.subjectId,
        )
      : new Map<string, number>()

    const student = targetClass.enrollments.find(
      (item) => item.student.id === studentId,
    )?.student
    if (!student) throw new NotFoundException('该考试中没有该学生')

    const classAverageMap = new Map<string, number | null>()
    const zScoreMap = new Map<string, number | null>()
    for (const subject of visibleSubjects) {
      const classScores = subjectScoresOf(subject.subjectId, scoreMap, classStudents)
      const mean = average(classScores)
      const deviation = stddev(classScores)
      const record = scoreMap.get(studentId)?.get(subject.subjectId)
      classAverageMap.set(subject.subjectId, mean)
      zScoreMap.set(
        subject.subjectId,
        record && record.score !== null && mean !== null && deviation
          ? round((record.score - mean) / deviation, 2)
          : null,
      )
    }

    const subjectResults = visibleSubjects.map((subject) => {
      const record = scoreMap.get(studentId)?.get(subject.subjectId)
      const zScore = zScoreMap.get(subject.subjectId) ?? null
      const isAbsent = record?.isAbsent ?? true
      return {
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        score: record?.isAbsent ? null : record?.score ?? null,
        isAbsent,
        fullScore: subject.fullScore,
        classAverage: classAverageMap.get(subject.subjectId) ?? null,
        zScore,
        tag: isAbsent
          ? 'absent'
          : zScore !== null && zScore >= 1.5
            ? 'strong'
            : zScore !== null && zScore <= -1.5
              ? 'weak'
              : 'normal',
      } as const
    })

    const total = totals.get(studentId)
    const subjectRecord =
      mode === 'subject' ? scoreMap.get(studentId)?.get(activeSubject!.subjectId) : undefined
    const currentClassRank = classRanks.get(studentId) ?? null
    const previousClassRank = previousRanks.get(studentId) ?? null

    const history: StudentProfileResponse['history'][number][] = []
    const rankTrend: StudentProfileResponse['rankTrend'][number][] = []
    const examCache = new Map<string, ExamData>()
    examCache.set(data.exam.id, data)

    for (const item of exams) {
      const itemData = examCache.get(item.id) ?? (await this.loadExamData(item.id))
      examCache.set(item.id, itemData)
      const itemClass = itemData.classes.find((klass) => klass.id === enrollment.classId)
      if (!itemClass) continue
      const itemStudent = itemClass.enrollments.find(
        (row) => row.student.id === studentId,
      )?.student
      if (!itemStudent) continue
      const itemClassStudents = this.studentsOfClass(itemClass)
      const itemAllStudents = this.allStudents(itemData)
      const itemScoreMap = buildScoreMap(itemData.scores)
      const itemTotals = computeStudentTotals(this.subjectInfos(itemData), itemAllStudents, itemScoreMap)
      const itemClassRanks =
        mode === 'full'
          ? buildClassRanks(itemTotals, itemClassStudents)
          : buildSubjectRanks(activeSubject!.subjectId, itemClassStudents, itemScoreMap, 'class')
      const itemGradeRanks =
        mode === 'full'
          ? buildGradeRanks(itemTotals, itemAllStudents)
          : buildSubjectRanks(activeSubject!.subjectId, itemAllStudents, itemScoreMap, 'grade')
      const itemTotal = itemTotals.get(studentId)
      const itemSubjectRecord =
        mode === 'subject' ? itemScoreMap.get(studentId)?.get(activeSubject!.subjectId) : undefined
      const complete =
        mode === 'full'
          ? Boolean(itemTotal?.complete)
          : Boolean(itemSubjectRecord && !itemSubjectRecord.isAbsent && itemSubjectRecord.score !== null)
      const totalScore =
        mode === 'full'
          ? itemTotal?.totalScore ?? null
          : itemSubjectRecord?.isAbsent
            ? null
            : itemSubjectRecord?.score ?? null
      history.push({
        examId: item.id,
        examName: item.name,
        heldAt: item.heldAt.toISOString().slice(0, 10),
        totalScore,
        classRank: itemClassRanks.get(studentId) ?? null,
        gradeRank: itemGradeRanks.get(studentId) ?? null,
        complete,
      })
      rankTrend.push({
        examId: item.id,
        examName: item.name,
        heldAt: item.heldAt.toISOString().slice(0, 10),
        classRank: itemClassRanks.get(studentId) ?? null,
        gradeRank: itemGradeRanks.get(studentId) ?? null,
        totalScore,
      })
    }

    const modeComplete =
      mode === 'full'
        ? Boolean(total?.complete)
        : Boolean(subjectRecord && !subjectRecord.isAbsent && subjectRecord.score !== null)
    const modeTotalScore =
      mode === 'full'
        ? total?.totalScore ?? null
        : subjectRecord?.isAbsent
          ? null
          : subjectRecord?.score ?? null

    return {
      mode,
      subject: mode === 'subject' ? this.subjectOption(data, activeSubject!) : null,
      student: {
        id: student.id,
        studentNo: student.studentNo,
        name: student.name,
        className: classInfo.name,
        gradeName: classInfo.gradeName,
        headTeacherName: classInfo.headTeacherName,
      },
      exam: this.access.toExamOption(data.exam),
      totalScore: modeTotalScore,
      classRank: currentClassRank,
      gradeRank: gradeRanks.get(studentId) ?? null,
      rankDelta:
        currentClassRank !== null && previousClassRank !== null
          ? previousClassRank - currentClassRank
          : null,
      complete: modeComplete,
      subjects: subjectResults,
      radar: {
        indicators: visibleSubjects.map((subject) => ({
          name: subject.subjectName,
          max: subject.fullScore,
        })),
        student: subjectResults.map((subject) => subject.score ?? 0),
        classAverage: subjectResults.map((subject) => subject.classAverage ?? 0),
      },
      rankTrend,
      history,
    }
  }

  async gradeCompare(userId: string, examId: string): Promise<GradeCompareResponse> {
    await this.access.assertGradeView(userId)
    await this.access.assertExamAccess(userId, examId)
    const data = await this.loadExamData(examId)
    const subjects = this.subjectInfos(data)
    const allStudents = this.allStudents(data)
    const scoreMap = buildScoreMap(data.scores)
    const totals = computeStudentTotals(subjects, allStudents, scoreMap)
    const gradeAverageTotal = average(totalsOf(totals, allStudents))

    const classResults = data.classes.map((klass) => {
      const students = this.studentsOfClass(klass)
      const classTotals = this.classTotals(totals, students)
      const totalFull = this.totalFull(subjects)
      const completeCount = classTotals.filter((item) => item.complete).length
      const scores = classTotals
        .filter((item) => item.complete && item.totalScore !== null)
        .map((item) => item.totalScore as number)
      const avgTotal = average(scores)
      const passLine = totalFull * PASS_RATIO
      const excellentLine = totalFull * EXCELLENT_RATIO
      const subjectComparisons = subjects.map((subject) => {
        const classScores = subjectScoresOf(subject.subjectId, scoreMap, students)
        const gradeScores = subjectScoresOf(subject.subjectId, scoreMap, allStudents)
        const classAvg = average(classScores)
        const gradeAvg = average(gradeScores)
        const classRate = classAvg === null ? null : (classAvg / subject.fullScore) * 100
        const gradeRate = gradeAvg === null ? null : (gradeAvg / subject.fullScore) * 100
        return {
          subjectId: subject.subjectId,
          average: classAvg,
          scoreRate: classRate === null ? null : round(classRate, 1),
          diffPp:
            classRate === null || gradeRate === null
              ? null
              : round(classRate - gradeRate, 1),
        }
      })

      return {
        classId: klass.id,
        className: klass.name,
        avgTotal,
        passRate: rate(
          scores.filter((score) => score >= passLine).length,
          completeCount,
        ),
        excellentRate: rate(
          scores.filter((score) => score >= excellentLine).length,
          completeCount,
        ),
        completeCount,
        rank: null as number | null,
        subjects: subjectComparisons,
      }
    })

    const classRanks = rankByScore(
      classResults.map((item) => ({
        studentId: item.classId,
        score: item.avgTotal,
        include: item.avgTotal !== null,
      })),
    )
    classResults.forEach((item) => {
      item.rank = classRanks.get(item.classId) ?? null
    })
    classResults.sort((a, b) => {
      if (a.rank === null && b.rank === null) return a.className.localeCompare(b.className)
      if (a.rank === null) return 1
      if (b.rank === null) return -1
      return a.rank - b.rank
    })

    return {
      exam: this.access.toExamOption(data.exam),
      subjects: subjects.map((subject) => this.subjectOption(data, subject)),
      gradeAverageTotal,
      classes: classResults,
    }
  }

  private async loadExamData(examId: string): Promise<ExamData> {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        term: true,
        grade: true,
        examSubjects: {
          include: { subject: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    })
    if (!exam) throw new NotFoundException('考试不存在')

    const classes = await this.prisma.class.findMany({
      where: { gradeId: exam.gradeId },
      include: {
        enrollments: {
          where: { termId: exam.termId },
          include: { student: true },
        },
        headTeacher: { select: { displayName: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    const scores = await this.prisma.score.findMany({
      where: { examId },
      select: {
        studentId: true,
        subjectId: true,
        classId: true,
        score: true,
        isAbsent: true,
      },
    })

    return {
      exam,
      classes,
      scores: scores.map((score) => ({
        studentId: score.studentId,
        subjectId: score.subjectId,
        classId: score.classId,
        score: score.score === null ? null : Number(score.score),
        isAbsent: score.isAbsent,
      })),
    }
  }

  private subjectInfos(data: ExamData): ExamSubjectInfo[] {
    return data.exam.examSubjects.map((item) => ({
      subjectId: item.subjectId,
      subjectName: item.subject.name,
      subjectCode: item.subject.code,
      fullScore: Number(item.fullScore),
      includedInTotal: item.includedInTotal,
      sortOrder: item.sortOrder,
    }))
  }

  private subjectOption(data: ExamData, subject: ExamSubjectInfo): SubjectOption {
    const raw = data.exam.examSubjects.find((item) => item.subjectId === subject.subjectId)!
    return {
      id: raw.subject.id,
      code: raw.subject.code,
      name: raw.subject.name,
      category: raw.subject.category as 'cultural' | 'other',
      defaultFullScore:
        raw.subject.defaultFullScore === null ? null : Number(raw.subject.defaultFullScore),
      sortOrder: raw.subject.sortOrder,
    }
  }

  private studentsOfClass(klass: ExamData['classes'][number]): StudentInfo[] {
    return klass.enrollments.map((item) => ({
      id: item.student.id,
      studentNo: item.student.studentNo,
      name: item.student.name,
      classId: klass.id,
    }))
  }

  private allStudents(data: ExamData): StudentInfo[] {
    return data.classes.flatMap((klass) => this.studentsOfClass(klass))
  }

  private classTotals(
    totals: Map<string, StudentTotal>,
    students: StudentInfo[],
  ): StudentTotal[] {
    return students
      .map((student) => totals.get(student.id))
      .filter((item): item is StudentTotal => Boolean(item))
  }

  private totalFull(subjects: ExamSubjectInfo[]): number {
    return subjects
      .filter((subject) => subject.includedInTotal)
      .reduce((sum, subject) => sum + subject.fullScore, 0)
  }

  private buildKpis(
    mode: 'full' | 'subject',
    subjects: ExamSubjectInfo[],
    activeSubject: ExamSubjectInfo,
    classStudents: StudentInfo[],
    totals: Map<string, StudentTotal>,
    scoreMap: ScoreMap,
  ): KpiSummary {
    if (mode === 'full') {
      const totalFull = this.totalFull(subjects)
      const passLine = round(totalFull * PASS_RATIO, 1)
      const excellentLine = round(totalFull * EXCELLENT_RATIO, 1)
      const classTotals = this.classTotals(totals, classStudents)
      const scores = classTotals
        .filter((item) => item.complete && item.totalScore !== null)
        .map((item) => item.totalScore as number)
      const participantCount = classStudents.filter((student) => {
        const records = scoreMap.get(student.id)
        return Boolean(
          records &&
            [...records.values()].some(
              (record) => !record.isAbsent && record.score !== null,
            ),
        )
      }).length
      const absentCount = classTotals.filter((item) => item.absentCount > 0).length
      return {
        average: average(scores),
        passRate: rate(scores.filter((score) => score >= passLine).length, scores.length),
        excellentRate: rate(
          scores.filter((score) => score >= excellentLine).length,
          scores.length,
        ),
        participantCount,
        completeCount: scores.length,
        absentCount,
        passLine,
        excellentLine,
      }
    }

    const passLine = round(activeSubject.fullScore * PASS_RATIO, 1)
    const excellentLine = round(activeSubject.fullScore * EXCELLENT_RATIO, 1)
    const values = subjectScoresOf(activeSubject.subjectId, scoreMap, classStudents)
    const absentCount = classStudents.filter(
      (student) => scoreMap.get(student.id)?.get(activeSubject.subjectId)?.isAbsent,
    ).length
    return {
      average: average(values),
      passRate: rate(values.filter((score) => score >= passLine).length, values.length),
      excellentRate: rate(
        values.filter((score) => score >= excellentLine).length,
        values.length,
      ),
      participantCount: values.length,
      completeCount: values.length,
      absentCount,
      passLine,
      excellentLine,
    }
  }

  private buildSubjectComparisons(
    subjects: ExamSubjectInfo[],
    classStudents: StudentInfo[],
    allStudents: StudentInfo[],
    scoreMap: ScoreMap,
  ): SubjectComparison[] {
    return subjects.map((subject) => {
      const classScores = subjectScoresOf(subject.subjectId, scoreMap, classStudents)
      const gradeScores = subjectScoresOf(subject.subjectId, scoreMap, allStudents)
      const classAverage = average(classScores)
      const gradeAverage = average(gradeScores)
      return {
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        fullScore: subject.fullScore,
        includedInTotal: subject.includedInTotal,
        classAverage,
        gradeAverage,
        classScoreRate:
          classAverage === null ? null : round((classAverage / subject.fullScore) * 100, 1),
        gradeScoreRate:
          gradeAverage === null ? null : round((gradeAverage / subject.fullScore) * 100, 1),
        passLine: round(subject.fullScore * PASS_RATIO, 1),
        excellentLine: round(subject.fullScore * EXCELLENT_RATIO, 1),
      }
    })
  }

  private buildDistribution(
    data: ExamData,
    subject: ExamSubjectInfo,
    classStudents: StudentInfo[],
    scoreMap: ScoreMap,
  ): DistributionData {
    const scores = subjectScoresOf(subject.subjectId, scoreMap, classStudents)
    return {
      subjectId: subject.subjectId,
      subjectName: subject.subjectName,
      fullScore: subject.fullScore,
      bins: buildBins(scores, subject.fullScore),
    }
  }

  private buildBorderline(
    subjects: ExamSubjectInfo[],
    classStudents: StudentInfo[],
    scoreMap: ScoreMap,
    mode: 'full' | 'subject',
  ): BorderlineItem[] {
    const items: BorderlineItem[] = []
    for (const subject of subjects) {
      const passLine = subject.fullScore * PASS_RATIO
      const excellentLine = subject.fullScore * EXCELLENT_RATIO
      for (const student of classStudents) {
        const record = scoreMap.get(student.id)?.get(subject.subjectId)
        if (!record || record.isAbsent || record.score === null) continue
        for (const [lineType, lineValue] of [
          ['pass', passLine],
          ['excellent', excellentLine],
        ] as const) {
          const gap = round(record.score - lineValue, 1)
          if (Math.abs(gap) <= 5) {
            items.push({
              studentId: student.id,
              studentName: student.name,
              subjectId: subject.subjectId,
              subjectName: subject.subjectName,
              score: record.score,
              lineType,
              lineValue: round(lineValue, 1),
              gap,
            })
          }
        }
      }
    }
    return items
      .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))
      .slice(0, mode === 'subject' ? 8 : 12)
  }

  private async listExamsForGrade(gradeId: string, termId: string) {
    return this.prisma.exam.findMany({
      where: { gradeId, termId, status: 'active' },
      select: { id: true, name: true, heldAt: true },
      orderBy: [{ heldAt: 'asc' }, { name: 'asc' }],
    })
  }

  private previousExamOf<T extends { id: string; heldAt: Date }>(
    exams: T[],
    currentExamId: string,
  ): T | null {
    const index = exams.findIndex((exam) => exam.id === currentExamId)
    if (index <= 0) return null
    return exams[index - 1] ?? null
  }

  private async classRankMapForExam(
    examId: string,
    classId: string,
    mode: 'full' | 'subject',
    subjectId?: string,
  ): Promise<Map<string, number>> {
    const data = await this.loadExamData(examId)
    const klass = data.classes.find((item) => item.id === classId)
    if (!klass) return new Map()
    const students = this.studentsOfClass(klass)
    if (mode === 'full') {
      const allStudents = this.allStudents(data)
      const scoreMap = buildScoreMap(data.scores)
      const totals = computeStudentTotals(this.subjectInfos(data), allStudents, scoreMap)
      return buildClassRanks(totals, students)
    }
    if (!subjectId) return new Map()
    return buildSubjectRanks(subjectId, students, buildScoreMap(data.scores), 'class')
  }

  private async buildTrend(
    exams: Array<{ id: string; name: string; heldAt: Date }>,
    currentData: ExamData,
    classId: string,
    mode: 'full' | 'subject',
    subjectId: string,
  ): Promise<TrendPoint[]> {
    const cache = new Map<string, ExamData>()
    cache.set(currentData.exam.id, currentData)
    const points: TrendPoint[] = []

    for (const exam of exams) {
      const data = cache.get(exam.id) ?? (await this.loadExamData(exam.id))
      cache.set(exam.id, data)
      const klass = data.classes.find((item) => item.id === classId)
      if (!klass) continue
      const classStudents = this.studentsOfClass(klass)
      const allStudents = this.allStudents(data)
      const scoreMap = buildScoreMap(data.scores)
      if (mode === 'full') {
        const totalFull = this.totalFull(this.subjectInfos(data))
        if (totalFull <= 0) continue
        const totals = computeStudentTotals(this.subjectInfos(data), allStudents, scoreMap)
        points.push({
          examId: exam.id,
          examName: exam.name,
          heldAt: exam.heldAt.toISOString().slice(0, 10),
          classAverage: average(totalsOf(totals, classStudents)),
          gradeAverage: average(totalsOf(totals, allStudents)),
        })
      } else {
        const subject = this.subjectInfos(data).find(
          (item) => item.subjectId === subjectId,
        )
        if (!subject) continue
        points.push({
          examId: exam.id,
          examName: exam.name,
          heldAt: exam.heldAt.toISOString().slice(0, 10),
          classAverage: average(subjectScoresOf(subjectId, scoreMap, classStudents)),
          gradeAverage: average(subjectScoresOf(subjectId, scoreMap, allStudents)),
        })
      }
    }

    return points.slice(-8)
  }

  private async findClassOption(userId: string, classId: string) {
    const classes = await this.access.getAccessibleClasses(userId)
    const found = classes.find((item) => item.id === classId)
    if (!found) throw new NotFoundException('班级不存在或无权访问')
    return found
  }
}