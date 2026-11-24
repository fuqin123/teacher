import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { AUTH_REQUIRED_CODE } from '@scorelens/shared'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { IS_PUBLIC_KEY } from './public.decorator'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<Request>()
    if (!request.session?.userId) {
      throw new UnauthorizedException({ code: AUTH_REQUIRED_CODE, message: '请先登录' })
    }
    return true
  }
}