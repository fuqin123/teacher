import { Injectable, Logger } from '@nestjs/common'
import { Request } from 'express'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    actorId?: string | null
    action: string
    entityType: string
    entityId?: string | null
    detail?: unknown
    request?: Request
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          detailJson: input.detail === undefined ? undefined : (input.detail as object),
          ip: input.request?.ip,
          userAgent: input.request?.headers['user-agent'],
          requestId: input.request?.headers['x-request-id'] as string | undefined,
        },
      })
    } catch (error) {
      this.logger.warn(
        `审计日志写入失败（${input.action}）：${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
}