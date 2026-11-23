import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from './prisma/prisma.module'
import { AccessModule } from './access/access.module'
import { AuditModule } from './audit/audit.module'
import { AuthModule } from './modules/auth/auth.module'
import { RosterModule } from './modules/roster/roster.module'
import { ExamsModule } from './modules/exams/exams.module'
import { ImportsModule } from './modules/imports/imports.module'
import { AnalyticsModule } from './modules/analytics/analytics.module'
import { AuthGuard } from './common/auth.guard'
import { AppController } from './app.controller'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AccessModule,
    AuditModule,
    AuthModule,
    RosterModule,
    ExamsModule,
    ImportsModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}