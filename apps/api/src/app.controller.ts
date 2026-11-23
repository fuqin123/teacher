import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { Public } from './common/public.decorator'
import { PrismaService } from './prisma/prisma.service'

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return {
        status: 'ok',
        service: 'scorelens-api',
        db: 'up',
        timestamp: new Date().toISOString(),
      }
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'scorelens-api',
        db: 'down',
        timestamp: new Date().toISOString(),
      })
    }
  }
}