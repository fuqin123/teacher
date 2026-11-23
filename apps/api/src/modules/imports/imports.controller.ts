import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { Request } from 'express'
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

  @Get(':id')
  detail(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.imports.detail(userId, id)
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