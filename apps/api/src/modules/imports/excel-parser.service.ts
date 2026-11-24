import { Injectable } from '@nestjs/common'
import * as XLSX from 'xlsx'
import {
  HEADER_SYNONYMS,
  ImportSuggestion,
  SUBJECT_CODE_ALIASES,
  normalizeHeader,
  subjectTarget,
} from '@scorelens/shared'
import { ParsedWorkbookData } from './import.types'

interface SubjectHint {
  id: string
  name: string
  code: string
}

/** 二级表头常见标签：这些词本身不含科目语义，需要与父级表头组合理解。 */
const SUB_HEADER_LABELS = new Set([
  '分数',
  '得分',
  '成绩',
  '分值',
  '等级',
  '名次',
  '校名次',
  '班名次',
  '年级名次',
  '班级名次',
  '总名次',
  '排名',
  '备注',
])

/** 这些列不参与入库：原始排名、学校、序号等由系统重算或无需导入。 */
const SKIP_SEGMENTS = new Set([
  '名次',
  '校名次',
  '班名次',
  '年级名次',
  '班级名次',
  '总名次',
  '排名',
  '学校',
  '学校名称',
  '序号',
  '备注',
  '性别',
  '签字',
])

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
    // blankrows 必须为 true：保留空行才能让数组下标与真实 Excel 行号一致（合并表头常带空行）
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: true,
      blankrows: true,
    })

    const rows = grid.map((row) =>
      Array.isArray(row) ? row.map((cell) => this.cellText(cell)) : [],
    )

    if (rows.every((row) => !row.some((cell) => cell !== ''))) {
      throw new Error('文件中没有数据')
    }

    const headerRow = this.detectHeaderRow(rows, subjects)
    const headerRows = this.detectHeaderSpan(rows, headerRow)
    const dataStartRow = headerRow + headerRows

    const maxColumns = Math.min(
      100,
      Math.max(...rows.slice(headerRow).map((row) => row.length), 1),
    )
    const headers = this.composeHeaders(rows, headerRow, headerRows, maxColumns)

    // 逐行记录真实行号，避免合并表头里的空行导致校验提示行号偏移
    const dataRows: Array<{ rowNumber: number; cells: string[] }> = []
    for (let index = dataStartRow; index < rows.length; index += 1) {
      const source = rows[index] ?? []
      const cells = Array.from({ length: maxColumns }, (_, column) => source[column] ?? '')
      if (!cells.some((cell) => cell !== '')) continue
      if (this.isSummaryRow(cells)) continue
      if (this.isSubHeaderRow(cells)) continue
      dataRows.push({ rowNumber: index + 1, cells })
    }

    if (dataRows.length > 5000) {
      throw new Error('单次导入不能超过 5000 行')
    }

    const samples = dataRows.slice(0, 5).map((row) => row.cells)
    const suggestions = this.suggest(headers, samples, subjects)

    return {
      parsed: {
        sheetName,
        headerRow,
        headerRows,
        dataStartRow,
        headers,
        rows: dataRows.map((row) => row.cells),
        rowNumbers: dataRows.map((row) => row.rowNumber),
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
    const subjectWords = this.subjectWords(subjects)
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

  /**
   * 识别表头占几行。学校导出的成绩表常见“科目 + 分数/校名次/班名次”的二级表头，
   * 合并单元格只在首列保留科目名，因此需要把后续子表头行纳入表头，再拼接列名。
   */
  private detectHeaderSpan(rows: string[][], headerRow: number): number {
    let span = 1
    for (let offset = 1; offset <= 2; offset += 1) {
      const row = rows[headerRow + offset]
      if (!row) break
      const labels = row.map((cell) => normalizeHeader(cell)).filter((cell) => cell !== '')
      if (labels.length === 0) break
      if (!labels.every((label) => SUB_HEADER_LABELS.has(label))) break
      span = offset + 1
    }
    return span
  }

  private composeHeaders(
    rows: string[][],
    headerRow: number,
    headerRows: number,
    maxColumns: number,
  ): string[] {
    const parents = rows[headerRow] ?? []
    const children = headerRows > 1 ? (rows[headerRow + 1] ?? []) : []
    let lastParent = ''

    return Array.from({ length: maxColumns }, (_, index) => {
      const parent = (parents[index] ?? '').trim()
      const child = (children[index] ?? '').trim()
      if (parent) lastParent = parent
      // 合并单元格只在首列保留父级名称，其余列沿用上一个父级
      const effectiveParent = parent || (child ? lastParent : '')
      if (effectiveParent && child && effectiveParent !== child) {
        return `${effectiveParent}-${child}`
      }
      return effectiveParent || child || lastParent || `列${index + 1}`
    })
  }

  private isSummaryRow(row: string[]): boolean {
    const first = (row[0] ?? '').trim()
    return ['合计', '总计', '平均', '班级平均', '年级平均'].some((word) => first.includes(word))
  }

  /** 表头识别失败时的兜底：整行都是“分数/校名次”这类子表头标签，应跳过。 */
  private isSubHeaderRow(row: string[]): boolean {
    const labels = row.map((cell) => normalizeHeader(cell)).filter(Boolean)
    return labels.length > 0 && labels.every((label) => SUB_HEADER_LABELS.has(label))
  }

  private suggest(
    headers: string[],
    samples: string[][],
    subjects: SubjectHint[],
  ): ImportSuggestion[] {
    return headers.map((header, index) => {
      const normalized = normalizeHeader(header)
      const segments = header
        .split(/[-—_/／\s]+/)
        .map((part) => normalizeHeader(part))
        .filter(Boolean)
      const sample = samples[0]?.[index] ?? ''

      if (this.matchesAny(normalized, HEADER_SYNONYMS.student_no)) {
        return this.suggestion(index, header, sample, 'student_no', 'high')
      }
      if (this.matchesAny(normalized, HEADER_SYNONYMS.name)) {
        return this.suggestion(index, header, sample, 'name', 'high')
      }
      // 原始名次、学校、序号等列不参与入库
      if (segments.some((segment) => SKIP_SEGMENTS.has(segment))) {
        return this.suggestion(index, header, sample, 'ignore', 'high')
      }
      if (this.matchesAny(normalized, HEADER_SYNONYMS.ignore)) {
        return this.suggestion(index, header, sample, 'ignore', 'high')
      }

      const head = segments[0] ?? normalized
      if (this.matchesAny(head, HEADER_SYNONYMS.source_total)) {
        return this.suggestion(index, header, sample, 'ignore', 'medium')
      }
      if (this.matchesAny(head, HEADER_SYNONYMS.class_name)) {
        return this.suggestion(index, header, sample, 'ignore', 'medium')
      }

      const subject = this.findSubject(head, normalized, subjects)
      if (subject) {
        return this.suggestion(index, header, sample, subjectTarget(subject.id), 'high')
      }
      return this.suggestion(index, header, sample, 'ignore', 'low')
    })
  }

  private findSubject(
    head: string,
    normalized: string,
    subjects: SubjectHint[],
  ): SubjectHint | undefined {
    const exact = subjects.find(
      (item) =>
        normalizeHeader(item.name) === head ||
        normalizeHeader(item.code) === head ||
        normalizeHeader(item.name) === normalized ||
        normalizeHeader(item.code) === normalized,
    )
    if (exact) return exact

    for (const item of subjects) {
      const aliases = SUBJECT_CODE_ALIASES[item.code] ?? []
      if (aliases.some((alias) => normalizeHeader(alias) === head)) return item
    }

    return subjects.find((item) => {
      const name = normalizeHeader(item.name)
      return name.includes(head) || head.includes(name)
    })
  }

  private subjectWords(subjects: SubjectHint[]) {
    return new Set(
      subjects.flatMap((subject) => [normalizeHeader(subject.name), normalizeHeader(subject.code)]),
    )
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

  private matchesAny(normalized: string, words: readonly string[]): boolean {
    return words.some((word) => normalizeHeader(word) === normalized)
  }
}
