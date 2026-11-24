import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import {
  ImportBatchDetail,
  ImportBatchListItem,
  ImportCommitResponse,
  ImportMappingInput,
  ImportStatus,
  ImportValidationResponse,
  ParsedImportResponse,
  parseSubjectTarget,
  normalizeHeader,
  AiStatusResponse,
  AiSuggestResponse,
  ExamType,
} from '@scorelens/shared'
import { Request } from 'express'
import * as XLSX from 'xlsx'
import { PrismaService } from '../../prisma/prisma.service'
import { AccessService } from '../../access/access.service'
import { AuditService } from '../../audit/audit.service'
import { ExcelParserService } from './excel-parser.service'
import { ImportValidatorService } from './import-validator.service'
import { AiMappingService } from './ai-mapping.service'
import {
  ImportMappingConfig,
  ParsedWorkbookData,
  ValidationResult,
} from './import.types'

const allowedExtensions = new Set(['.xlsx', '.xls', '.csv'])

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly parser: ExcelParserService,
    private readonly validator: ImportValidatorService,
    private readonly ai: AiMappingService,
    private readonly config: ConfigService,
  ) {}

  async upload(
    userId: string,
    file: Express.Multer.File | undefined,
    classId: string,
    request: Request,
  ): Promise<ParsedImportResponse> {
    if (!file) throw new BadRequestException('请选择要上传的文件')
    if (!classId) throw new BadRequestException('请选择班级')
    const extension = extname(file.originalname).toLowerCase()
    if (!allowedExtensions.has(extension)) {
      throw new BadRequestException('只支持 .xlsx / .xls / .csv 文件')
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('文件不能超过 10MB')
    }

    await this.access.assertCanImport(userId)
    await this.access.assertClassAccess(userId, classId)

    const subjects = await this.prisma.subject.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
    })

    let parsedResult: ReturnType<ExcelParserService['parse']>
    try {
      parsedResult = this.parser.parse(file.buffer, subjects, extension)
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '文件解析失败',
      )
    }

    const { parsed, suggestions } = parsedResult
    const uploadDir = this.config.get<string>('UPLOAD_DIR') ?? './data/uploads'
    await mkdir(uploadDir, { recursive: true })
    const storedName = `${randomUUID()}${extension}`
    const filePath = join(uploadDir, storedName)
    await writeFile(filePath, file.buffer)

    const batch = await this.prisma.importBatch.create({
      data: {
        classId,
        status: 'parsed',
        fileName: file.originalname,
        filePath,
        fileHash: createHash('sha256').update(file.buffer).digest('hex'),
        fileSize: file.size,
        sheetName: parsed.sheetName,
        headerFingerprint: createHash('sha256')
          .update(parsed.headers.map(normalizeHeader).join('|'))
          .digest('hex'),
        parsedDataJson: parsed as unknown as Prisma.InputJsonValue,
        statsJson: { rowCount: parsed.rowCount } as Prisma.InputJsonValue,
        createdById: userId,
      },
    })

    await this.audit.log({
      actorId: userId,
      action: 'import.upload',
      entityType: 'import_batch',
      entityId: batch.id,
      detail: { fileName: file.originalname, classId, rowCount: parsed.rowCount },
      request,
    })

    return {
      batchId: batch.id,
      fileName: batch.fileName,
      sheetName: parsed.sheetName,
      headerRow: parsed.headerRow,
      headerRows: parsed.headerRows ?? 1,
      headers: parsed.headers,
      samples: parsed.samples,
      rowCount: parsed.rowCount,
      suggestions,
      status: 'parsed',
    }
  }

  aiStatus(): Promise<AiStatusResponse> {
    return this.ai.status()
  }

  /**
   * 生成标准成绩导入模板（xlsx）。
   * 列结构参考学校常用导出表：学号/姓名 → 各科分数 → 总分 → 班级排名 → 年级排名，
   * 其中“总分/排名”列仅作参考，导入时由系统按成绩重新计算，不会覆盖。
   */
  async template(
    userId: string,
    classId?: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    await this.access.assertCanImport(userId)

    const subjects = await this.prisma.subject.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { name: true, defaultFullScore: true },
    })
    if (subjects.length === 0) {
      throw new BadRequestException('还没有启用的科目，请先在基础数据中添加科目')
    }

    let title = '成绩导入模板'
    if (classId) {
      const klass = await this.access.assertClassAccess(userId, classId)
      const term = await this.access.getCurrentTerm()
      title = `${klass.name} 成绩导入模板${term ? `（${term.name}）` : ''}`
    }

    const header = [
      '学号',
      '姓名',
      ...subjects.map((subject) => subject.name),
      '总分',
      '班级排名',
      '年级排名',
    ]
    const rows: Array<Array<string | number>> = [header]

    const fullScores = subjects.map((subject) =>
      subject.defaultFullScore === null ? 100 : Number(subject.defaultFullScore),
    )
    const sampleStudents = [
      { no: '202614201', name: '示例学生甲', ratio: 0.92 },
      { no: '202614202', name: '示例学生乙', ratio: 0.78 },
    ]
    for (const student of sampleStudents) {
      const scores = fullScores.map((full) => Math.round(full * student.ratio * 10) / 10)
      const total = Math.round(scores.reduce((sum, value) => sum + value, 0) * 10) / 10
      rows.push([student.no, student.name, ...scores, total, '', ''])
    }
    // 缺考示例：填“缺考”，不要留空
    rows.push([
      '202614203',
      '示例学生丙',
      ...fullScores.map(() => '缺考'),
      '',
      '',
      '',
    ])

    const sheet = XLSX.utils.aoa_to_sheet([[title], ...rows])
    sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }]
    sheet['!cols'] = header.map((_, index) =>
      index === 0 ? { wch: 14 } : index === 1 ? { wch: 12 } : { wch: 10 },
    )

    const guide = XLSX.utils.aoa_to_sheet([
      ['填写说明'],
      ['1. 一行一个学生；学号必须是本班名单中的学号（考号同样可用）。'],
      ['2. 各科填分数；缺考请填“缺考”“免考”或“—”，不要留空，也不要填 0 表示缺考。'],
      ['3. 总分、班级排名、年级排名可留空：系统会按各科成绩自动计算总分与名次。'],
      ['4. 学校导出的成绩表可以直接上传：系统支持“科目 + 分数/校名次/班名次”的多级表头，原始名次列会被忽略。'],
      ['5. 单科满分在导入向导的“科目满分配置”中按实际填写，不假设固定满分。'],
      ['6. 单文件不超过 10MB、5000 行。'],
    ])
    guide['!cols'] = [{ wch: 96 }]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, '成绩表')
    XLSX.utils.book_append_sheet(workbook, guide, '填写说明')

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    return { buffer, fileName: `成绩导入模板_${stamp}.xlsx` }
  }

  /**
   * 调用 OpenAI 兼容接口识别表头结构。
   * 只回传“列含义 + 考试元信息 + 科目满分建议”，分数仍由人工确认后按原单元格读取。
   */
  async aiSuggest(
    userId: string,
    batchId: string,
    request: Request,
  ): Promise<AiSuggestResponse> {
    const status = await this.ai.status()
    const batch = await this.getEditableBatch(userId, batchId)
    const parsed = batch.parsedDataJson as unknown as ParsedWorkbookData
    if (!parsed) throw new BadRequestException('导入批次缺少解析数据')

    if (!status.enabled) {
      return {
        enabled: false,
        applied: false,
        model: status.model,
        notes: null,
        message: 'AI 表头识别未启用，请在环境变量中配置 AI_ENABLED 与 AI_API_KEY',
        columns: [],
        exam: null,
        subjects: [],
      }
    }

    const classInfo = await this.access.assertClassAccess(userId, batch.classId!)
    const subjects = await this.prisma.subject.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, defaultFullScore: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    const outcome = await this.ai.suggest({
      fileName: batch.fileName,
      sheetName: parsed.sheetName,
      headers: parsed.headers,
      samples: this.maskSamples(parsed.samples),
      subjects: subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        code: subject.code,
        defaultFullScore:
          subject.defaultFullScore === null ? null : Number(subject.defaultFullScore),
      })),
      gradeName: classInfo.grade.name,
      className: classInfo.name,
    })

    await this.audit.log({
      actorId: userId,
      action: 'import.ai_suggest',
      entityType: 'import_batch',
      entityId: batch.id,
      detail: {
        model: outcome.model,
        columns: outcome.columns.length,
        applied: Boolean(outcome.mapping),
        usage: outcome.usage,
        message: outcome.message,
      },
      request,
    })

    const examMeta = outcome.mapping?.exam
    const examName = examMeta?.name?.trim()
    const heldAtValid = /^\d{4}-\d{2}-\d{2}$/.test(examMeta?.heldAt ?? '')
    const subjectDefaults = new Map(
      subjects.map((subject) => [
        subject.id,
        subject.defaultFullScore === null ? 100 : Number(subject.defaultFullScore),
      ]),
    )

    return {
      enabled: true,
      applied: Boolean(outcome.mapping && outcome.columns.length > 0),
      model: outcome.model,
      notes: outcome.mapping?.notes ?? null,
      message: outcome.message,
      columns: outcome.columns,
      exam: examName
        ? {
            name: examName,
            type: (examMeta?.type ?? 'other') as ExamType,
            heldAt: heldAtValid
              ? (examMeta!.heldAt as string)
              : new Date().toISOString().slice(0, 10),
          }
        : null,
      subjects: (outcome.mapping?.subjects ?? []).map((item) => ({
        subjectId: item.subjectId,
        fullScore: item.fullScore ?? subjectDefaults.get(item.subjectId) ?? 100,
        includedInTotal: item.includedInTotal ?? true,
      })),
    }
  }

  /**
   * 样例脱敏：姓名替换为“学生”，长数字学号保留前 4 位，分数与缺考标记保持原样，
   * 让模型仍能区分“文本列 / 编号列 / 数值列”，但不发送完整姓名与学号。
   */
  private maskSamples(samples: string[][]): string[][] {
    return samples.slice(0, 3).map((row) =>
      row.map((cell) => {
        const value = String(cell ?? '').trim()
        if (!value) return ''
        if (/^[\u4e00-\u9fa5·]{2,4}$/.test(value)) return '学生'
        if (/^\d{6,}$/.test(value)) return `${value.slice(0, 4)}****`
        return value
      }),
    )
  }

  async saveMapping(
    userId: string,
    batchId: string,
    input: ImportMappingInput,
  ) {
    const batch = await this.getEditableBatch(userId, batchId)
    const parsed = batch.parsedDataJson as unknown as ParsedWorkbookData

    if (!parsed) throw new BadRequestException('导入批次缺少解析数据')
    if (input.headerRow !== parsed.headerRow) {
      throw new BadRequestException(
        `表头行由系统识别为第 ${parsed.headerRow + 1} 行，如需修改请重新上传文件`,
      )
    }

    const studentNoColumns = input.columns.filter((item) => item.target === 'student_no')
    const nameColumns = input.columns.filter((item) => item.target === 'name')
    if (studentNoColumns.length !== 1) {
      throw new BadRequestException('必须且只能映射一列学号')
    }
    if (nameColumns.length !== 1) {
      throw new BadRequestException('必须且只能映射一列姓名')
    }

    const subjectColumns = input.columns
      .map((column) => {
        const subjectId = parseSubjectTarget(column.target)
        return subjectId ? { ...column, subjectId } : null
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))

    if (subjectColumns.length === 0) {
      throw new BadRequestException('至少映射一个科目列')
    }
    const uniqueSubjects = new Set(subjectColumns.map((item) => item.subjectId))
    if (uniqueSubjects.size !== subjectColumns.length) {
      throw new BadRequestException('同一科目不能重复映射多列')
    }
    if (uniqueSubjects.size !== input.subjects.length) {
      throw new BadRequestException('科目列与满分配置数量不一致')
    }

    const subjectIds = [...uniqueSubjects]
    const subjects = await this.prisma.subject.findMany({
      where: { id: { in: subjectIds }, isActive: true },
      select: { id: true },
    })
    if (subjects.length !== subjectIds.length) {
      throw new BadRequestException('存在无效或已停用的科目')
    }

    const maxIndex = parsed.headers.length - 1
    for (const column of input.columns) {
      if (column.index < 0 || column.index > maxIndex) {
        throw new BadRequestException('映射列超出文件范围')
      }
      if (
        column.target !== 'student_no' &&
        column.target !== 'name' &&
        column.target !== 'ignore' &&
        !parseSubjectTarget(column.target)
      ) {
        throw new BadRequestException(`无效的映射目标：${column.target}`)
      }
    }

    const heldAt = new Date(`${input.exam.heldAt}T00:00:00.000Z`)
    if (Number.isNaN(heldAt.getTime())) {
      throw new BadRequestException('考试日期无效')
    }

    await this.prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: 'mapping_confirmed',
        mappingJson: input as unknown as Prisma.InputJsonValue,
        examMetaJson: {
          exam: input.exam,
          subjects: input.subjects,
        } as Prisma.InputJsonValue,
      },
    })

    return { ok: true }
  }

  async validate(userId: string, batchId: string): Promise<ImportValidationResponse> {
    const batch = await this.getEditableBatch(userId, batchId)
    const parsed = batch.parsedDataJson as unknown as ParsedWorkbookData
    const mapping = batch.mappingJson as unknown as ImportMappingConfig
    if (!parsed || !mapping) {
      throw new BadRequestException('请先完成表头映射')
    }

    const classInfo = await this.access.assertClassAccess(userId, batch.classId!)
    const result = await this.validator.validate(
      parsed,
      mapping,
      batch.classId!,
      classInfo.grade.termId,
    )

    const status: ImportStatus = result.errors.length === 0 ? 'validated' : 'mapping_confirmed'
    await this.prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status,
        validationJson: {
          errors: result.errors,
          warnings: result.warnings,
          stats: result.stats,
        } as unknown as Prisma.InputJsonValue,
        statsJson: result.stats as unknown as Prisma.InputJsonValue,
      },
    })

    return {
      batchId,
      status,
      errors: result.errors,
      warnings: result.warnings,
      stats: result.stats,
      preview: result.preview,
    }
  }

  async commit(
    userId: string,
    batchId: string,
    request: Request,
  ): Promise<ImportCommitResponse> {
    const batch = await this.getEditableBatch(userId, batchId)
    const parsed = batch.parsedDataJson as unknown as ParsedWorkbookData
    const mapping = batch.mappingJson as unknown as ImportMappingConfig
    if (!parsed || !mapping) throw new BadRequestException('请先完成表头映射')

    const classInfo = await this.access.assertClassAccess(userId, batch.classId!)
    const validation = await this.validator.validate(
      parsed,
      mapping,
      batch.classId!,
      classInfo.grade.termId,
    )
    if (validation.errors.length > 0) {
      throw new BadRequestException({
        message: '存在校验错误，不能入库',
        details: validation.errors.slice(0, 20),
      })
    }

    const heldAt = new Date(`${mapping.exam.heldAt}T00:00:00.000Z`)
    if (Number.isNaN(heldAt.getTime())) throw new BadRequestException('考试日期无效')

    const result = await this.prisma.$transaction(
      async (tx) => {
        let exam = await tx.exam.findUnique({
          where: {
            termId_gradeId_name: {
              termId: classInfo.grade.termId,
              gradeId: classInfo.gradeId,
              name: mapping.exam.name,
            },
          },
          include: { examSubjects: true },
        })

        if (exam) {
          if (exam.status === 'archived') {
            throw new BadRequestException('该考试已归档，不能继续导入')
          }
          for (const subject of mapping.subjects) {
            const existing = exam.examSubjects.find(
              (item) => item.subjectId === subject.subjectId,
            )
            if (!existing) {
              throw new BadRequestException(
                `该考试已存在，但缺少科目配置：${subject.subjectId}`,
              )
            }
            if (Number(existing.fullScore) !== subject.fullScore) {
              throw new BadRequestException(
                '该考试已存在且科目满分与本次配置不一致，请调整考试名称或满分',
              )
            }
          }
        } else {
          exam = await tx.exam.create({
            data: {
              termId: classInfo.grade.termId,
              gradeId: classInfo.gradeId,
              name: mapping.exam.name,
              type: mapping.exam.type,
              heldAt,
              createdById: userId,
              examSubjects: {
                create: mapping.subjects.map((subject, index) => ({
                  subjectId: subject.subjectId,
                  fullScore: subject.fullScore,
                  includedInTotal: subject.includedInTotal,
                  sortOrder: index,
                })),
              },
            },
            include: { examSubjects: true },
          })
        }

        const studentIds = [...new Set(validation.rows.map((row) => row.studentId))]
        const existingScores = await tx.score.findMany({
          where: { examId: exam.id, studentId: { in: studentIds } },
        })
        const existingMap = new Map(
          existingScores.map((score) => [`${score.studentId}:${score.subjectId}`, score]),
        )

        let inserted = 0
        let updated = 0

        for (const row of validation.rows) {
          for (const subjectScore of row.scores) {
            const existing = existingMap.get(`${row.studentId}:${subjectScore.subjectId}`)
            const newScore =
              subjectScore.score === null ? null : new Prisma.Decimal(subjectScore.score)

            await tx.score.upsert({
              where: {
                examId_studentId_subjectId: {
                  examId: exam.id,
                  studentId: row.studentId,
                  subjectId: subjectScore.subjectId,
                },
              },
              update: {
                score: newScore,
                isAbsent: subjectScore.isAbsent,
                classId: batch.classId!,
                importBatchId: batch.id,
              },
              create: {
                examId: exam.id,
                studentId: row.studentId,
                subjectId: subjectScore.subjectId,
                classId: batch.classId!,
                score: newScore,
                isAbsent: subjectScore.isAbsent,
                importBatchId: batch.id,
              },
            })

            const changed =
              !existing ||
              existing.isAbsent !== subjectScore.isAbsent ||
              (existing.score === null ? null : Number(existing.score)) !== subjectScore.score

            if (!existing) inserted += 1
            else if (changed) updated += 1

            if (changed) {
              await tx.scoreChangeLog.create({
                data: {
                  batchId: batch.id,
                  examId: exam.id,
                  studentId: row.studentId,
                  subjectId: subjectScore.subjectId,
                  oldScore: existing?.score ?? null,
                  oldAbsent: existing?.isAbsent ?? null,
                  newScore,
                  newAbsent: subjectScore.isAbsent,
                  action: existing ? 'overwrite' : 'import',
                  operatedById: userId,
                },
              })
            }
          }
        }

        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: 'committed',
            examId: exam.id,
            committedAt: new Date(),
            validationJson: {
              errors: validation.errors,
              warnings: validation.warnings,
              stats: validation.stats,
            } as unknown as Prisma.InputJsonValue,
            statsJson: {
              ...validation.stats,
              inserted,
              updated,
              absentCount: validation.stats.absentCount,
            } as Prisma.InputJsonValue,
          },
        })

        return {
          examId: exam.id,
          examName: exam.name,
          inserted,
          updated,
          absentCount: validation.stats.absentCount,
        }
      },
      { timeout: 30000 },
    )

    await this.audit.log({
      actorId: userId,
      action: 'import.commit',
      entityType: 'import_batch',
      entityId: batch.id,
      detail: result,
      request,
    })

    return { batchId, ...result }
  }

  async list(userId: string): Promise<ImportBatchListItem[]> {
    await this.access.assertCanImport(userId)
    const user = await this.access.getUser(userId)
    const batches = await this.prisma.importBatch.findMany({
      where: { classId: { in: user.classIds } },
      include: {
        class: true,
        exam: true,
        createdBy: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return batches.map((batch) => this.toListItem(batch))
  }

  async detail(userId: string, batchId: string): Promise<ImportBatchDetail> {
    await this.access.assertCanImport(userId)
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        class: true,
        exam: true,
        createdBy: { select: { displayName: true } },
      },
    })
    if (!batch) throw new NotFoundException('导入记录不存在')
    if (!batch.classId) throw new NotFoundException('导入记录缺少班级')
    await this.access.assertClassAccess(userId, batch.classId)

    return {
      ...this.toListItem(batch),
      sheetName: batch.sheetName,
      mapping: batch.mappingJson,
      examMeta: batch.examMetaJson,
      validation: batch.validationJson,
    }
  }

  private async getEditableBatch(userId: string, batchId: string) {
    await this.access.assertCanImport(userId)
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        class: { include: { grade: true } },
      },
    })
    if (!batch) throw new NotFoundException('导入记录不存在')
    if (!batch.classId) throw new BadRequestException('导入批次缺少班级')
    if (batch.status === 'committed') {
      throw new BadRequestException('该批次已入库，不能重复操作')
    }
    await this.access.assertClassAccess(userId, batch.classId)
    return batch
  }

  private toListItem(batch: {
    id: string
    fileName: string
    status: string
    createdAt: Date
    committedAt: Date | null
    class: { name: string } | null
    exam: { name: string } | null
    createdBy: { displayName: string }
    statsJson: Prisma.JsonValue | null
  }): ImportBatchListItem {
    const stats =
      batch.statsJson && typeof batch.statsJson === 'object' && !Array.isArray(batch.statsJson)
        ? (batch.statsJson as Record<string, number>)
        : null
    return {
      id: batch.id,
      fileName: batch.fileName,
      status: batch.status as ImportStatus,
      examName: batch.exam?.name ?? null,
      className: batch.class?.name ?? null,
      createdAt: batch.createdAt.toISOString(),
      committedAt: batch.committedAt?.toISOString() ?? null,
      createdByName: batch.createdBy.displayName,
      stats: stats
        ? {
            totalRows: stats.totalRows,
            inserted: stats.inserted,
            updated: stats.updated,
            errorRows: stats.errorRows,
            absentCount: stats.absentCount,
          }
        : null,
    }
  }
}