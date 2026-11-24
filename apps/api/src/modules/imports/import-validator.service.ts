import { Injectable } from '@nestjs/common'
import { ImportValidationIssue, isAbsentMarker, parseSubjectTarget, round } from '@scorelens/shared'
import { PrismaService } from '../../prisma/prisma.service'
import {
  ImportMappingConfig,
  NormalizedStudentRow,
  ParsedWorkbookData,
  ValidationResult,
} from './import.types'

@Injectable()
export class ImportValidatorService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(
    parsed: ParsedWorkbookData,
    mapping: ImportMappingConfig,
    classId: string,
    termId: string,
  ): Promise<ValidationResult> {
    const errors: ImportValidationIssue[] = []
    const warnings: ImportValidationIssue[] = []

    const studentNoColumn = mapping.columns.find((item) => item.target === 'student_no')
    const nameColumn = mapping.columns.find((item) => item.target === 'name')
    if (!studentNoColumn) {
      errors.push({ row: mapping.headerRow + 1, message: '未映射学号列', severity: 'error' })
    }
    if (!nameColumn) {
      errors.push({ row: mapping.headerRow + 1, message: '未映射姓名列', severity: 'error' })
    }
    if (errors.length) {
      return {
        errors,
        warnings,
        stats: {
          totalRows: parsed.rowCount,
          validRows: 0,
          errorRows: parsed.rowCount,
          warningRows: 0,
          absentCount: 0,
        },
        preview: [],
        rows: [],
      }
    }

    const subjectColumns = mapping.columns
      .map((column) => {
        const subjectId = parseSubjectTarget(column.target)
        return subjectId ? { ...column, subjectId } : null
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))

    if (subjectColumns.length === 0) {
      errors.push({
        row: mapping.headerRow + 1,
        message: '至少映射一个科目列',
        severity: 'error',
      })
    }

    const subjectConfigs = new Map(
      mapping.subjects.map((subject) => [subject.subjectId, subject]),
    )
    for (const column of subjectColumns) {
      if (!subjectConfigs.has(column.subjectId)) {
        errors.push({
          row: mapping.headerRow + 1,
          column: parsed.headers[column.index],
          message: '科目列未配置满分',
          severity: 'error',
        })
      }
    }
    if (errors.length) {
      return {
        errors,
        warnings,
        stats: {
          totalRows: parsed.rowCount,
          validRows: 0,
          errorRows: parsed.rowCount,
          warningRows: 0,
          absentCount: 0,
        },
        preview: [],
        rows: [],
      }
    }

    const subjects = await this.prisma.subject.findMany({
      where: { id: { in: [...subjectConfigs.keys()] } },
      select: { id: true, name: true },
    })
    const subjectNames = new Map(subjects.map((subject) => [subject.id, subject.name]))

    const enrollments = await this.prisma.studentTermEnrollment.findMany({
      where: { classId, termId },
      include: { student: true },
    })
    const roster = new Map(
      enrollments.map((enrollment) => [enrollment.student.studentNo.trim(), enrollment.student]),
    )
    if (roster.size === 0) {
      errors.push({
        row: mapping.headerRow + 1,
        message: '该班级本学期没有学生名单，请先导入名单',
        severity: 'error',
      })
      return {
        errors,
        warnings,
        stats: {
          totalRows: parsed.rowCount,
          validRows: 0,
          errorRows: parsed.rowCount,
          warningRows: 0,
          absentCount: 0,
        },
        preview: [],
        rows: [],
      }
    }

    const normalizedRows: NormalizedStudentRow[] = []
    const seenStudentNos = new Set<string>()
    let absentCount = 0
    let errorRows = 0
    let warningRows = 0

    // 多级表头时数据从 dataStartRow 开始；旧批次没有该字段，回退为“表头下一行”
    const dataStartRow = parsed.dataStartRow ?? parsed.headerRow + 1

    parsed.rows.forEach((row, index) => {
      const rowNumber = parsed.rowNumbers?.[index] ?? dataStartRow + index + 1
      let rowHasError = false
      let rowHasWarning = false

      const studentNo = String(row[studentNoColumn!.index] ?? '').trim()
      const name = String(row[nameColumn!.index] ?? '').trim()

      if (!studentNo) {
        errors.push({ row: rowNumber, column: '学号', message: '学号为空', severity: 'error' })
        rowHasError = true
      }
      if (!name) {
        errors.push({ row: rowNumber, column: '姓名', message: '姓名为空', severity: 'error' })
        rowHasError = true
      }

      let student = studentNo ? roster.get(studentNo) : undefined
      if (studentNo && !student) {
        errors.push({
          row: rowNumber,
          column: '学号',
          message: `学号 ${studentNo} 不在本班名单中`,
          severity: 'error',
        })
        rowHasError = true
      }
      if (studentNo && seenStudentNos.has(studentNo)) {
        errors.push({
          row: rowNumber,
          column: '学号',
          message: `学号 ${studentNo} 在文件中重复`,
          severity: 'error',
        })
        rowHasError = true
      }
      if (studentNo) seenStudentNos.add(studentNo)

      if (student && name && student.name !== name) {
        warnings.push({
          row: rowNumber,
          column: '姓名',
          message: `文件姓名"${name}"与系统"${student.name}"不一致`,
          severity: 'warning',
        })
        rowHasWarning = true
      }

      const scores: NormalizedStudentRow['scores'] = []
      for (const column of subjectColumns) {
        const config = subjectConfigs.get(column.subjectId)!
        const subjectName = subjectNames.get(column.subjectId) ?? '科目'
        const raw = String(row[column.index] ?? '').trim()

        if (!raw) {
          errors.push({
            row: rowNumber,
            column: subjectName,
            message: '成绩为空，请补录或标记缺考',
            severity: 'error',
          })
          rowHasError = true
          continue
        }
        if (isAbsentMarker(raw)) {
          scores.push({ subjectId: column.subjectId, score: null, isAbsent: true })
          absentCount += 1
          continue
        }

        const numeric = Number(raw.replace(/,/g, ''))
        if (!Number.isFinite(numeric)) {
          errors.push({
            row: rowNumber,
            column: subjectName,
            message: `成绩"${raw}"不是有效数字`,
            severity: 'error',
          })
          rowHasError = true
          continue
        }
        if (numeric < 0 || numeric > config.fullScore) {
          errors.push({
            row: rowNumber,
            column: subjectName,
            message: `成绩 ${numeric} 超出 0 ~ ${config.fullScore} 范围`,
            severity: 'error',
          })
          rowHasError = true
          continue
        }
        scores.push({ subjectId: column.subjectId, score: round(numeric, 2), isAbsent: false })
      }

      if (rowHasError) errorRows += 1
      if (rowHasWarning) warningRows += 1

      if (!rowHasError && student) {
        normalizedRows.push({
          rowNumber,
          studentId: student.id,
          studentNo,
          name: student.name,
          scores,
        })
      }
    })

    const preview = normalizedRows.slice(0, 10).map((row) => {
      const item: Record<string, string | number | boolean | null> = {
        row: row.rowNumber,
        studentNo: row.studentNo,
        name: row.name,
      }
      for (const score of row.scores) {
        item[subjectNames.get(score.subjectId) ?? score.subjectId] = score.isAbsent
          ? '缺考'
          : score.score
      }
      return item
    })

    return {
      errors,
      warnings,
      stats: {
        totalRows: parsed.rowCount,
        validRows: normalizedRows.length,
        errorRows,
        warningRows,
        absentCount,
      },
      preview,
      rows: normalizedRows,
    }
  }
}