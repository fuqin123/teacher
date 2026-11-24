import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { NestExpressApplication } from '@nestjs/platform-express'
import session from 'express-session'
import { AppModule } from './app.module'
import { ApiExceptionFilter } from './common/api-exception.filter'
import { PrismaSessionStore } from './common/prisma-session.store'
import { PrismaService } from './prisma/prisma.service'

const SESSION_TTL_MS = 8 * 60 * 60 * 1000

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const config = app.get(ConfigService)
  const prisma = app.get(PrismaService)
  const logger = new Logger('Bootstrap')
  const cookieSecure = resolveCookieSecure(config, logger)

  app.set('trust proxy', 1)
  app.use(
    session({
      // 会话写入同一个 SQLite 文件，重启后登录态保留，也无需额外部署会话中间件。
      store: new PrismaSessionStore(prisma, SESSION_TTL_MS),
      name: 'scorelens.sid',
      secret: config.getOrThrow<string>('SESSION_SECRET'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: cookieSecure,
        maxAge: SESSION_TTL_MS,
      },
    }),
  )

  const origins = (config.get<string>('APP_ORIGIN') ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  app.enableCors({ origin: origins, credentials: true })
  app.setGlobalPrefix('api/v1')
  app.useGlobalFilters(new ApiExceptionFilter())

  const port = Number(config.get('PORT') ?? 3100)
  await app.listen(port)
  console.log(`ScoreLens API listening on http://localhost:${port}/api/v1`)
}

/**
 * 会话 Cookie 是否加 Secure：
 * - COOKIE_SECURE 显式配置优先（"true" / "false"）；
 * - 未配置时按 APP_ORIGIN 的协议推断（https → true，http → false）；
 * - 配置为 true 但 APP_ORIGIN 是 http 时强制关闭并告警：
 *   否则浏览器会丢弃 Secure Cookie，表现为“登录成功但每个接口都返回请先登录”。
 */
function resolveCookieSecure(config: ConfigService, logger: Logger): boolean {
  const raw = (config.get<string>('COOKIE_SECURE') ?? '').trim().toLowerCase()
  const origin = (config.get<string>('APP_ORIGIN') ?? '').split(',')[0]?.trim() ?? ''
  const httpsOrigin = origin.startsWith('https://')
  const configured = raw === 'true' || raw === 'false' ? raw === 'true' : undefined

  if (configured === undefined) return httpsOrigin

  if (configured && !httpsOrigin) {
    logger.warn(
      `COOKIE_SECURE=true 但 APP_ORIGIN=${origin || '(未设置)'} 不是 https，已强制关闭 Secure。` +
        '否则浏览器不会保存登录 Cookie，登录后会持续提示“请先登录”。',
    )
    return false
  }
  if (!configured && httpsOrigin) {
    logger.warn('APP_ORIGIN 是 https 但 COOKIE_SECURE=false，登录 Cookie 将以明文传输，建议设为 true。')
  }
  return configured
}

void bootstrap()
