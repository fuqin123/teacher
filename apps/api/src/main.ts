import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { NestExpressApplication } from '@nestjs/platform-express'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import { Pool } from 'pg'
import { AppModule } from './app.module'
import { ApiExceptionFilter } from './common/api-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const config = app.get(ConfigService)

  const pool = new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL') })
  const PgSession = connectPgSimple(session)

  app.set('trust proxy', 1)
  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: 'user_sessions',
        createTableIfMissing: true,
      }),
      name: 'scorelens.sid',
      secret: config.getOrThrow<string>('SESSION_SECRET'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.get<string>('NODE_ENV') === 'production',
        maxAge: 8 * 60 * 60 * 1000,
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