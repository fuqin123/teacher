import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common'
import { CurrentUserId } from '../../common/current-user.decorator'
import { AnalyticsService } from './analytics.service'

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  dashboard(
    @CurrentUserId() userId: string,
    @Query('examId') examId?: string,
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    if (!examId || !classId) throw new BadRequestException('缺少 examId 或 classId')
    return this.analytics.dashboard(
      userId,
      examId,
      classId,
      subjectId || undefined,
    )
  }

  @Get('student/:id')
  student(
    @CurrentUserId() userId: string,
    @Param('id') studentId: string,
    @Query('examId') examId?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.analytics.studentProfile(
      userId,
      studentId,
      examId || undefined,
      subjectId || undefined,
    )
  }

  @Get('grade')
  grade(@CurrentUserId() userId: string, @Query('examId') examId?: string) {
    if (!examId) throw new BadRequestException('缺少 examId')
    return this.analytics.gradeCompare(userId, examId)
  }
}