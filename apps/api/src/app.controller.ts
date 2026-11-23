import { Controller, Get } from '@nestjs/common'
import { Public } from './common/public.decorator'

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'scorelens-api',
      timestamp: new Date().toISOString(),
    }
  }
}