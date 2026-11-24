import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { Request, Response } from 'express'
import { importMappingSchema, ImportMappingInput } from '@scorelens/shared'
import { CurrentUserId } from '../../common/current-user.decorator'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { ImportsService } from './imports.service'

@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.imports.list(userId)
  }

  @Get('ai-status')
  aiStatus() {
    return this.imports.aiStatus()
  }

  @Get('template')
  async template(
    @CurrentUserId() userId: string,
    @Query('classId') classId: string | undefined,
    @Res() response: Response,
  ) {
    const { buffer, fileName } = await this.imports.template(
      userId,
      classId || undefined,
    )
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="template.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    )
    response.send(buffer)
  }

  @Get(':id')
  detail(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.imports.detail(userId, id)
  }

  @Post(':id/ai-suggest')
  @HttpCode(200)
  aiSuggest(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.imports.aiSuggest(userId, id, request)
  }

  @Post()
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUserId() userId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('classId') classId: string,
    @Req() request: Request,
  ) {
    return this.imports.upload(userId, file, classId, request)
  }

  @Patch(':id/mapping')
  @HttpCode(200)
  mapping(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(importMappingSchema)) body: ImportMappingInput,
  ) {
    return this.imports.saveMapping(userId, id, body)
  }

  @Post(':id/validate')
  @HttpCode(200)
  validate(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.imports.validate(userId, id)
  }

  @Post(':id/commit')
  @HttpCode(200)
  commit(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.imports.commit(userId, id, request)
  }
}