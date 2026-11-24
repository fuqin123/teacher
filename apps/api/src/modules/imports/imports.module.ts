import { Module } from '@nestjs/common'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'
import { ExcelParserService } from './excel-parser.service'
import { ImportValidatorService } from './import-validator.service'
import { AiMappingService } from './ai-mapping.service'

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, ExcelParserService, ImportValidatorService, AiMappingService],
})
export class ImportsModule {}
