import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common'
import { Request } from 'express'
import { loginSchema, LoginInput } from '@scorelens/shared'
import { Public } from '../../common/public.decorator'
import { CurrentUserId } from '../../common/current-user.decorator'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { AuthService } from './auth.service'
import { AuditService } from '../../audit/audit.service'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: Request,
  ) {
    const user = await this.auth.login(body.username, body.password)
    request.session.userId = user.id
    await new Promise<void>((resolve, reject) => {
      request.session.save((error) => (error ? reject(error) : resolve()))
    })
    await this.audit.log({
      actorId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      request,
    })
    return this.auth.me(user.id)
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() request: Request) {
    const userId = request.session.userId
    await new Promise<void>((resolve, reject) => {
      request.session.destroy((error) => (error ? reject(error) : resolve()))
    })
    if (userId) {
      await this.audit.log({
        actorId: userId,
        action: 'auth.logout',
        entityType: 'user',
        entityId: userId,
        request,
      })
    }
    return { ok: true }
  }

  @Get('me')
  me(@CurrentUserId() userId: string) {
    return this.auth.me(userId)
  }
}