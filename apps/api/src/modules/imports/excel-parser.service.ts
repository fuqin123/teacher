import { Injectable } from '@nestjs/common'
import * as XLSX from 'xlsx'
import {
  HEADER_SYNONYMS,
  ImportSuggestion,
  normalizeHeader,
  subjectTarget,
} from '@scorelens/shared'
import { ParsedWorkbookData } from './import.types'

interface SubjectHint {
  id: string
  name: string
  code: string
}

@Injectable()
export class ExcelParserService {
  parse(
    buffer: Buffer,
    subjects: SubjectHint[],
    extension = '',
  ): {
    parsed: ParsedWorkbookData
    suggestions: ImportSuggestion[]
  } {
    const workbook = this.readWorkbook(buffer, extension)
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error('文件中没有可读取的工作表')

    const sheet = workbook.Sheets[sheetName]
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: true,
      blankrows: false,
    })

    const rows = grid
      .map((row) => (Array.isArray(row) ? row.map((cell) => this.cellText(cell)) : []))
      .filter((row) => row.some((cell) => cell !== ''))

    if (rows.length === 0) throw new Error('文件中没有数据')

    const headerRow = this.detectHeaderRow(rows, subjects)
    const maxColumns = Math.min(
      100,
      Math.max(...rows.slice(headerRow).map((row) => row.length), 1),
    )
    const headers = Array.from({ length: maxColumns }, (_, index) => {
      const value = rows[headerRow]?.[index] ?? ''
      return value || `列${index + 1}`
    })

    const dataRows = rows
      .slice(headerRow + 1)
      .filter((row) => !this.isSummaryRow(row))
      .map((row) => Array.from({ length: maxColumns }, (_, index) => row[index] ?? ''))
      .filter((row) => row.some((cell) => cell !== ''))

    if (dataRows.length > 5000) {
      throw new Error('单次导入不能超过 5000 行')
    }

    const samples = dataRows.slice(0, 5)
    const suggestions = this.suggest(headers, samples, subjects)

    return {
      parsed: {
        sheetName,
        headerRow,
        headers,
        rows: dataRows,
        samples,
        rowCount: dataRows.length,
      },
      suggestions,
    }
  }

  private cellText(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (value instanceof Date) return value.toISOString().slice(0, 10)
    return String(value).trim()
  }

  /**
   * CSV 由 SheetJS 直接读 buffer 时会按单字节编码解释，WPS / Excel 导出的中文表头会变成乱码。
   * 这里先自行判断编码（BOM → UTF-8 → GBK），再交给 SheetJS 解析；xlsx/xls 仍走二进制读取。
   */
  private readWorkbook(buffer: Buffer, extension: string) {
    if (extension !== '.csv') {
      return XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: true })
    }
    return XLSX.read(this.decodeText(buffer), {
      type: 'string',
      cellDates: false,
      raw: true,
    })
  }

  private decodeText(buffer: Buffer): string {
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      return new TextDecoder('utf-8').decode(buffer.subarray(3))
    }
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(buffer.subarray(2))
    }
    return (
      this.tryDecode(buffer, 'utf-8') ??
      this.tryDecode(buffer, 'gbk') ??
      new TextDecoder('utf-8').decode(buffer)
    )
  }

  private tryDecode(buffer: Buffer, encoding: string): string | null {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(buffer)
    } catch {
      return null
    }
  }

  private detectHeaderRow(rows: string[][], subjects: SubjectHint[]): number {
    const subjectWords = new Set(
      subjects.flatMap((subject) => [normalizeHeader(subject.name), normalizeHeader(subject.code)]),
    )
    let bestIndex = -1
    let bestScore = 0

    rows.slice(0, Math.min(20, rows.length)).forEach((row, index) => {
      let score = 0
      let hits = 0
      row.forEach((cell) => {
        const normalized = normalizeHeader(cell)
        if (!normalized) return
        if (this.matchesAny(normalized, HEADER_SYNONYMS.student_no)) {
          score += 4
          hits += 1
        } else if (this.matchesAny(normalized, HEADER_SYNONYMS.name)) {
          score += 4
          hits += 1
        } else if (subjectWords.has(normalized)) {
          score += 2
          hits += 1
        } else if (this.matchesAny(normalized, HEADER_SYNONYMS.ignore)) {
          score += 1
        }
      })
      if (hits >= 2 && score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    })

    if (bestIndex >= 0) return bestIndex
    const fallback = rows.findIndex((row) => row.filter(Boolean).length >= 2)
    if (fallback < 0) throw new Error('无法识别表头行')
    return fallback
  }

  private isSummaryRow(row: string[]): boolean {
    const first = (row[0] ?? '').trim()
    return ['合计', '总计', '平均', '班级平均', '年级平均'].some((word) => first.includes(word))
  }

  private suggest(
    headers: string[],
    samples: string[][],
    subjects: SubjectHint[],
  ): ImportSuggestion[] {
    return headers.map((header, index) => {
      const normalized = normalizeHeader(header)
      const sample = samples[0]?.[index] ?? ''

      if (this.matchesAny(normalized, HEADER_SYNONYMS.student_no)) {
        return this.suggestion(index, header, sample, 'student_no', 'high')
      }
      if (this.matchesAny(normalized, HEADER_SYNONYMS.name)) {
        return this.suggestion(index, header, sample, 'name', 'high')
      }
      if (this.matchesAny(normalized, HEADER_SYNONYMS.ignore)) {
        return this.suggestion(index, header, sample, 'ignore', 'high')
      }
      if (this.matchesAny(normalized, HEADER_SYNONYMS.source_total)) {
        return this.suggestion(index, header, sample, 'ignore', 'medium')
      }
      if (this.matchesAny(normalized, HEADER_SYNONYMS.class_name)) {
        return this.suggestion(index, header, sample, 'ignore', 'medium')
      }

      const subject = subjects.find(
        (item) =>
          normalizeHeader(item.name) === normalized ||
          normalizeHeader(item.code) === normalized,
      )
      if (subject) {
        return this.suggestion(index, header, sample, subjectTarget(subject.id), 'high')
      }
      const fuzzySubject = subjects.find((item) => {
        const name = normalizeHeader(item.name)
        return name.includes(normalized) || normalized.includes(name)
      })
      if (fuzzySubject && normalized.length >= 1) {
        return this.suggestion(
          index,
          header,
          sample,
          subjectTarget(fuzzySubject.id),
          'medium',
        )
      }

      return this.suggestion(index, header, sample, 'ignore', 'low')
    })
  }

  private suggestion(
    index: number,
    header: string,
    sample: string,
    target: string,
    confidence: ImportSuggestion['confidence'],
  ): ImportSuggestion {
    return { index, header, sample, target, confidence }
  }

  private matchesAny(normalized: string, words: string[]): boolean {
    return words.some((word) => normalizeHeader(word) === normalized)
  }
}