import { DistributionBin, round } from '@scorelens/shared'

export interface ExamSubjectInfo {
  subjectId: string
  subjectName: string
  subjectCode: string
  fullScore: number
  includedInTotal: boolean
  sortOrder: number
}

export interface ScoreRecord {
  studentId: string
  subjectId: string
  classId: string
  score: number | null
  isAbsent: boolean
}

export interface StudentInfo {
  id: string
  studentNo: string
  name: string
  classId: string
}

export interface StudentTotal {
  studentId: string
  classId: string
  totalScore: number | null
  complete: boolean
  absentCount: number
}

export type ScoreMap = Map<string, Map<string, ScoreRecord>>

export function buildScoreMap(scores: ScoreRecord[]): ScoreMap {
  const map: ScoreMap = new Map()
  for (const score of scores) {
    let studentScores = map.get(score.studentId)
    if (!studentScores) {
      studentScores = new Map()
      map.set(score.studentId, studentScores)
    }
    studentScores.set(score.subjectId, score)
  }
  return map
}

export function computeStudentTotals(
  subjects: ExamSubjectInfo[],
  students: StudentInfo[],
  scoreMap: ScoreMap,
): Map<string, StudentTotal> {
  const included = subjects.filter((subject) => subject.includedInTotal)
  const result = new Map<string, StudentTotal>()

  for (const student of students) {
    const scores = scoreMap.get(student.id)
    let total = 0
    let complete = included.length > 0
    let absentCount = 0

    for (const subject of included) {
      const record = scores?.get(subject.subjectId)
      if (!record || record.isAbsent || record.score === null) {
        complete = false
      } else {
        total += record.score
      }
    }
    for (const subject of subjects) {
      const record = scores?.get(subject.subjectId)
      if (record?.isAbsent) absentCount += 1
    }

    result.set(student.id, {
      studentId: student.id,
      classId: student.classId,
      totalScore: complete ? round(total, 2) : null,
      complete,
      absentCount,
    })
  }

  return result
}

export function rankByScore(
  records: Array<{ studentId: string; score: number | null; include: boolean }>,
): Map<string, number> {
  const ranked = records
    .filter((item) => item.include && item.score !== null)
    .sort((a, b) => (b.score as number) - (a.score as number))

  const result = new Map<string, number>()
  let previousScore: number | null = null
  let previousRank = 0

  ranked.forEach((item, index) => {
    const rank = item.score === previousScore ? previousRank : index + 1
    result.set(item.studentId, rank)
    previousScore = item.score
    previousRank = rank
  })

  return result
}

export function buildClassRanks(
  totals: Map<string, StudentTotal>,
  students: StudentInfo[],
): Map<string, number> {
  const result = new Map<string, number>()
  const byClass = new Map<string, StudentInfo[]>()

  for (const student of students) {
    const list = byClass.get(student.classId) ?? []
    list.push(student)
    byClass.set(student.classId, list)
  }

  for (const list of byClass.values()) {
    const ranks = rankByScore(
      list.map((student) => {
        const total = totals.get(student.id)
        return {
          studentId: student.id,
          score: total?.totalScore ?? null,
          include: Boolean(total?.complete),
        }
      }),
    )
    ranks.forEach((rank, studentId) => result.set(studentId, rank))
  }

  return result
}

export function buildGradeRanks(
  totals: Map<string, StudentTotal>,
  students: StudentInfo[],
): Map<string, number> {
  return rankByScore(
    students.map((student) => {
      const total = totals.get(student.id)
      return {
        studentId: student.id,
        score: total?.totalScore ?? null,
        include: Boolean(total?.complete),
      }
    }),
  )
}

export function buildSubjectRanks(
  subjectId: string,
  students: StudentInfo[],
  scoreMap: ScoreMap,
  scope: 'class' | 'grade',
): Map<string, number> {
  const groups = new Map<string, StudentInfo[]>()
  for (const student of students) {
    const key = scope === 'class' ? student.classId : '__all__'
    const list = groups.get(key) ?? []
    list.push(student)
    groups.set(key, list)
  }

  const result = new Map<string, number>()
  for (const list of groups.values()) {
    const ranks = rankByScore(
      list.map((student) => {
        const record = scoreMap.get(student.id)?.get(subjectId)
        const valid = Boolean(record && !record.isAbsent && record.score !== null)
        return {
          studentId: student.id,
          score: valid ? record!.score : null,
          include: valid,
        }
      }),
    )
    ranks.forEach((rank, studentId) => result.set(studentId, rank))
  }
  return result
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 1)
}

export function stddev(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function rate(count: number, total: number): number | null {
  if (total <= 0) return null
  return round((count / total) * 100, 1)
}

export function buildBins(values: number[], fullScore: number, step = 10): DistributionBin[] {
  const binCount = Math.max(1, Math.ceil(fullScore / step))
  const bins = Array.from({ length: binCount }, (_, index) => {
    const low = index * step
    const high = Math.min(fullScore, low + step)
    return {
      label: `${low}-${high}`,
      count: 0,
      low,
      high,
      last: index === binCount - 1,
    }
  })

  for (const value of values) {
    const index = Math.min(binCount - 1, Math.max(0, Math.floor(value / step)))
    bins[index].count += 1
  }

  return bins.map(({ label, count }) => ({ label, count }))
}

export function totalsOf(
  totals: Map<string, StudentTotal>,
  students: StudentInfo[],
): number[] {
  return students
    .map((student) => totals.get(student.id))
    .filter((item): item is StudentTotal => Boolean(item?.complete && item.totalScore !== null))
    .map((item) => item.totalScore as number)
}

export function subjectScoresOf(
  subjectId: string,
  scoreMap: ScoreMap,
  students: StudentInfo[],
): number[] {
  return students
    .map((student) => scoreMap.get(student.id)?.get(subjectId))
    .filter((record): record is ScoreRecord => Boolean(record && !record.isAbsent && record.score !== null))
    .map((record) => record.score as number)
}