import { Injectable, UnauthorizedException } from '@nestjs/common'
import { verify } from '@node-rs/argon2'
import { PrismaService } from '../../prisma/prisma.service'
import { AccessService } from '../../access/access.service'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } })
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('账号或密码错误')
    }
    const valid = await verify(user.passwordHash, password)
    if (!valid) {
      throw new UnauthorizedException('账号或密码错误')
    }
    return user
  }

  async me(userId: string) {
    return this.access.getUser(userId)
  }
}