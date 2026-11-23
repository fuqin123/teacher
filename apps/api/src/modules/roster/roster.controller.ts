import { Controller, Get, Param, Query } from '@nestjs/common'
import { CurrentUserId } from '../../common/current-user.decorator'
import { RosterService } from './roster.service'

@Controller('roster')
export class RosterController {
  constructor(private readonly roster: RosterService) {}

  @Get('classes')
  classes(@CurrentUserId() userId: string) {
    return this.roster.listClasses(userId)
  }

  @Get('terms')
  terms() {
    return this.roster.listTerms()
  }

  @Get('subjects')
  subjects(@CurrentUserId() userId: string) {
    return this.roster.listSubjects(userId)
  }

  @Get('grades')
  grades(@CurrentUserId() userId: string) {
    return this.roster.listGrades(userId)
  }

  @Get('students')
  students(
    @CurrentUserId() userId: string,
    @Query('classId') classId?: string,
    @Query('search') search?: string,
  ) {
    return this.roster.listStudents(userId, classId || undefined, search?.trim() || undefined)
  }

  @Get('students/:id')
  student(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.roster.getStudent(userId, id)
  }
}