import { Controller, Get, Param } from '@nestjs/common'
import { CurrentUserId } from '../../common/current-user.decorator'
import { ExamsService } from './exams.service'

@Controller('exams')
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.exams.list(userId)
  }

  @Get(':id')
  detail(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.exams.detail(userId, id)
  }
}