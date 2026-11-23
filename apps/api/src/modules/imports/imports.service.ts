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
} from '@scorelens/shared'
import { Request } from 'express'
import { PrismaService } from '../../prisma/prisma.service'
import { AccessService } from '../../access/access.service'
import { AuditService } from '../../audit/audit.service'
import { ExcelParserService } from './excel-parser.service'
import { ImportValidatorService } from './import-validator.service'
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
      parsedResult = this.parser.parse(file.buffer, subjects)
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
      headers: parsed.headers,
      samples: parsed.samples,
      rowCount: parsed.rowCount,
      suggestions,
      status: 'parsed',
    }
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