import 'reflect-metadata'
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
  const cookieSecure = config.get<string>('COOKIE_SECURE')

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
        secure:
          cookieSecure === undefined
            ? config.get<string>('NODE_ENV') === 'production'
            : cookieSecure === 'true',
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

void bootstrap()