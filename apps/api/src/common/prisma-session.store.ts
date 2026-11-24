import { Logger } from '@nestjs/common'
import { Store } from 'express-session'
import type { SessionData } from 'express-session'
import { PrismaService } from '../prisma/prisma.service'

type SessionCallback = (err?: unknown, session?: SessionData | null) => void

/**
 * 基于 Prisma + SQLite 的会话存储。
 *
 * 单班本地部署下不需要引入 Redis 或额外的原生 SQLite 驱动（connect-sqlite3 / better-sqlite3），
 * 直接复用 Prisma 连接把会话写入 user_sessions 表，保证重启后登录态不丢失。
 */
export class PrismaSessionStore extends Store {
  private readonly logger = new Logger(PrismaSessionStore.name)
  private readonly cleanupTimer: NodeJS.Timeout

  constructor(
    private readonly prisma: PrismaService,
    private readonly defaultTtlMs: number,
  ) {
    super()
    this.cleanupTimer = setInterval(() => {
      void this.purgeExpired()
    }, 30 * 60 * 1000)
    this.cleanupTimer.unref()
  }

  get(sid: string, callback: SessionCallback): void {
    void this.prisma.session
      .findUnique({ where: { sid } })
      .then(async (row) => {
        if (!row) {
          callback(null, null)
          return
        }
        if (row.expireAt.getTime() <= Date.now()) {
          await this.prisma.session.deleteMany({ where: { sid } })
          callback(null, null)
          return
        }
        callback(null, JSON.parse(row.data) as SessionData)
      })
      .catch((error) => callback(error))
  }

  set(sid: string, session: SessionData, callback?: (err?: unknown) => void): void {
    const expireAt = this.expiryOf(session)
    const data = JSON.stringify(session)
    void this.prisma.session
      .upsert({
        where: { sid },
        update: { data, expireAt },
        create: { sid, data, expireAt },
      })
      .then(() => callback?.())
      .catch((error) => callback?.(error))
  }

  touch(sid: string, session: SessionData, callback?: () => void): void {
    void this.prisma.session
      .updateMany({ where: { sid }, data: { expireAt: this.expiryOf(session) } })
      .then(() => callback?.())
      .catch(() => callback?.())
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    void this.prisma.session
      .deleteMany({ where: { sid } })
      .then(() => callback?.())
      .catch((error) => callback?.(error))
  }

  clear(callback?: (err?: unknown) => void): void {
    void this.prisma.session
      .deleteMany()
      .then(() => callback?.())
      .catch((error) => callback?.(error))
  }

  length(callback: (err: unknown, length?: number) => void): void {
    void this.prisma.session
      .count()
      .then((count) => callback(null, count))
      .catch((error) => callback(error))
  }

  private expiryOf(session: SessionData): Date {
    const expires = session.cookie?.expires
    if (expires) {
      const value = expires instanceof Date ? expires : new Date(expires)
      if (!Number.isNaN(value.getTime())) return value
    }
    return new Date(Date.now() + this.defaultTtlMs)
  }

  private async purgeExpired(): Promise<void> {
    try {
      const { count } = await this.prisma.session.deleteMany({
        where: { expireAt: { lte: new Date() } },
      })
      if (count > 0) this.logger.debug(`已清理 ${count} 条过期会话`)
    } catch (error) {
      this.logger.warn(`清理过期会话失败：${(error as Error).message}`)
    }
  }

  close(): void {
    clearInterval(this.cleanupTimer)
  }
}
