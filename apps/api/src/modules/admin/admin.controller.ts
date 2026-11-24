import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import { Request } from 'express'
import {
  classInputSchema,
  classUpdateSchema,
  ClassInput,
  ClassUpdateInput,
  enrollmentInputSchema,
  EnrollmentInput,
  gradeInputSchema,
  gradeUpdateSchema,
  GradeInput,
  GradeUpdateInput,
  studentInputSchema,
  studentUpdateSchema,
  StudentInput,
  StudentUpdateInput,
  subjectInputSchema,
  subjectUpdateSchema,
  SubjectInput,
  SubjectUpdateInput,
  aiSettingsInputSchema,
  AiSettingsInput,
  termInputSchema,
  termUpdateSchema,
  TermInput,
  TermUpdateInput,
} from '@scorelens/shared'
import { CurrentUserId } from '../../common/current-user.decorator'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { AdminService } from './admin.service'

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('terms')
  terms(@CurrentUserId() userId: string) {
    return this.wrap(() => this.admin.assertAdmin(userId).then(() => this.admin.listTerms()))
  }

  @Get('grades')
  grades(@CurrentUserId() userId: string) {
    return this.wrap(() => this.admin.assertAdmin(userId).then(() => this.admin.listGrades()))
  }

  @Get('classes')
  classes(@CurrentUserId() userId: string) {
    return this.wrap(() => this.admin.assertAdmin(userId).then(() => this.admin.listClasses()))
  }

  @Get('subjects')
  subjects(@CurrentUserId() userId: string) {
    return this.wrap(() => this.admin.assertAdmin(userId).then(() => this.admin.listSubjects()))
  }

  @Get('teachers')
  teachers(@CurrentUserId() userId: string) {
    return this.wrap(() => this.admin.assertAdmin(userId).then(() => this.admin.listTeachers()))
  }

  @Get('students')
  students(@CurrentUserId() userId: string, @Query('classId') classId?: string) {
    return this.wrap(() =>
      this.admin.assertAdmin(userId).then(() => this.admin.listStudents(classId || undefined)),
    )
  }

  @Get('ai-settings')
  aiSettings(@CurrentUserId() userId: string) {
    return this.wrap(() => this.admin.getAiSettings(userId))
  }

  @Put('ai-settings')
  @HttpCode(200)
  saveAiSettings(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(aiSettingsInputSchema)) body: AiSettingsInput,
    @Req() request: Request,
  ) {
    return this.wrap(() => this.admin.saveAiSettings(userId, body, request))
  }

  @Post('ai-settings/test')
  @HttpCode(200)
  testAiSettings(
    @CurrentUserId() userId: string,
    @Body() body: { baseUrl?: string; model?: string; apiKey?: string },
  ) {
    return this.wrap(() => this.admin.testAiSettings(userId, body ?? {}))
  }

  @Delete('ai-settings')
  resetAiSettings(@CurrentUserId() userId: string, @Req() request: Request) {
    return this.wrap(() => this.admin.resetAiSettings(userId, request))
  }

  @Post('terms')
  @HttpCode(200)
  createTerm(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(termInputSchema)) body: TermInput,
    @Req() request: Request,
  ) {
    return this.wrap(() => this.admin.createTerm(userId, body, request))
  }

  @Patch('terms/:id')
  @HttpCode(200)
  updateTerm(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(termUpdateSchema)) body: TermUpdateInput,
    @Req() request: Request,
  ) {
    return this.wrap(() => this.admin.updateTerm(userId, id, body, request))
  }

  @Post('grades')
  @HttpCode(200)
  createGrade(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(gradeInputSchema)) body: GradeInput,
    @Req() request: Request,
  ) {
    return this.wrap(() => this.admin.createGrade(userId, body, request))
  }

  @Patch('grades/:id')
  @HttpCode(200)
  updateGrade(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(gradeUpdateSchema)) body: GradeUpdateInput,
    @Req() request: Request,
  ) {
    return this.wrap(() => this.admin.updateGrade(userId, id, body, request))
  }

  @Post('classes')
  @HttpCode(200)
  createClass(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(classInputSchema)) body: ClassInput,
    @Req() request: Request,
  ) {
    return this.wrap(() => this.admin.createClass(userId, body, request))
  }

  @Patch('classes/:id')
  @HttpCode(200)
  updateClass(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(classUpdateSchema)) body: ClassUpdateInput,
    @Req() request: Request,
  ) {
    return this.wrap(() => this.admin.updateClass(userId, id, body, request))
  }

  @Post('subjects')
  @HttpCode(200)
  createSubject(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(subjectInputSchema)) body: SubjectInput,
    @Req() request: Request,
  ) {
    return this.wrap(() => this.admin.createSubject(userId, body, request))
  }

  @Patch('subjects/:id')
  @HttpCode(200)
  updateSubject(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(subjectUpdateSchema)) body: SubjectUpdateInput,
    @Req() request: Request,
  ) {
    return this.wrap(() => this.admin.updateSubject(userId, id, body, request))
  }

  @Post('students')
  @HttpCode(200)
  createStudent(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(studentInputSchema)) body: StudentInput,
    @Req() request: Request,
  ) {
    return this.wrap(() => this.admin.createStudent(userId, body, request))
  }

  @Patch('students/:id')
  @HttpCode(200)
  updateStudent(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(studentUpdateSchema)) body: StudentUpdateInput,
    @Req() request: Request,
  ) {
    return this.wrap(() => this.admin.updateStudent(userId, id, body, request))
  }

  @Post('students/:id/enrollment')
  @HttpCode(200)
  enrollStudent(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(enrollmentInputSchema)) body: EnrollmentInput,
    @Req() request: Request,
  ) {
    return this.wrap(() => this.admin.enrollStudent(userId, id, body, request))
  }

  /** 把 Prisma 唯一约束冲突统一转成 409，避免暴露底层错误。 */
  private async wrap<T>(handler: () => Promise<T>): Promise<T> {
    try {
      return await handler()
    } catch (error) {
      if (this.looksLikeUniqueViolation(error)) {
        throw new ConflictException('数据已存在，请检查学号、科目代码或名称是否重复')
      }
      throw error
    }
  }

  private looksLikeUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    )
  }
}
