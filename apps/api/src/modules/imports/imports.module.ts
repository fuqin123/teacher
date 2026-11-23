import { Module } from '@nestjs/common'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'
import { ExcelParserService } from './excel-parser.service'
import { ImportValidatorService } from './import-validator.service'

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, ExcelParserService, ImportValidatorService],
})
export class ImportsModule {}