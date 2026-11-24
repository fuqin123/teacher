import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AiMappingResponse,
  AiStatusResponse,
  ImportSuggestion,
  aiMappingResponseSchema,
} from '@scorelens/shared'

interface SubjectHint {
  id: string
  name: string
  code: string
  defaultFullScore: number | null
}

export interface AiSuggestInput {
  fileName: string
  sheetName: string
  headers: string[]
  samples: string[][]
  subjects: SubjectHint[]
  gradeName: string | null
  className: string | null
}

export interface AiSuggestOutcome {
  mapping: AiMappingResponse | null
  columns: ImportSuggestion[]
  message: string | null
  model: string
  usage: { promptTokens: number | null; completionTokens: number | null } | null
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-chat'
const DEFAULT_TIMEOUT_MS = 25000

const SYSTEM_PROMPT = `你是中国湖南省初中成绩表的结构识别助手。
你的任务：根据表格表头与前几行样例，判断每一列的含义，并给出考试元信息与科目满分建议。

硬性要求：
1. 只输出 JSON 对象，不要输出解释文字、Markdown 代码块或注释。
2. 不计算、不猜测、不改写任何学生分数，分数一律由程序按原始单元格读取。
3. 列目标只能是 "student_no"（学号）、"name"（姓名）、"ignore"（跳过），或 "subject:<科目ID>"（成绩列），科目ID 必须来自给定科目清单。
4. 索引 index 必须来自给定列清单，不要编造列。
5. 无法确定的列一律给 "ignore" 并把 confidence 设为 "low"。

输出格式：
{
  "columns": [{ "index": 0, "target": "student_no", "confidence": "high" }],
  "exam": { "name": "期中考试", "type": "midterm", "heldAt": "2026-11-15" },
  "subjects": [{ "subjectId": "...", "fullScore": 120, "includedInTotal": true }],
  "notes": "可选的一句话说明"
}
exam.type 只能取 monthly / midterm / final / other；heldAt 无法判断时省略该字段。`

@Injectable()
export class AiMappingService {
  private readonly logger = new Logger(AiMappingService.name)

  constructor(private readonly config: ConfigService) {}

  status(): AiStatusResponse {
    const enabled = this.isEnabled()
    const baseUrl = this.baseUrl()
    let endpointHost: string | null = null
    try {
      endpointHost = new URL(baseUrl).host
    } catch {
      endpointHost = null
    }
    return {
      enabled,
      model: enabled ? this.model() : null,
      endpointHost,
    }
  }

  async suggest(input: AiSuggestInput): Promise<AiSuggestOutcome> {
    const model = this.model()
    if (!this.isEnabled()) {
      return {
        mapping: null,
        columns: [],
        message: 'AI 表头识别未启用',
        model,
        usage: null,
      }
    }

    const payload = {
      fileName: input.fileName,
      sheetName: input.sheetName,
      grade: input.gradeName,
      className: input.className,
      columns: input.headers.map((header, index) => ({ index, header })),
      // 只发送前 3 行样例，且已由调用方做脱敏处理（姓名/学号保留结构，值可被替换）
      sampleRows: input.samples.slice(0, 3),
      subjects: input.subjects.map((subject) => ({
        subjectId: subject.id,
        name: subject.name,
        code: subject.code,
        defaultFullScore: subject.defaultFullScore,
      })),
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs())
    try {
      const response = await fetch(`${this.baseUrl().replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey()}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(payload) },
          ],
        }),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        this.logger.warn(`AI 接口返回 ${response.status}：${text.slice(0, 200)}`)
        return {
          mapping: null,
          columns: [],
          message: `AI 接口调用失败（HTTP ${response.status}），已回退到规则建议`,
          model,
          usage: null,
        }
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const content = body.choices?.[0]?.message?.content ?? ''
      const parsed = this.parseJson(content)
      if (!parsed) {
        return {
          mapping: null,
          columns: [],
          message: 'AI 返回内容不是有效 JSON，已回退到规则建议',
          model,
          usage: null,
        }
      }

      const validated = aiMappingResponseSchema.safeParse(parsed)
      if (!validated.success) {
        this.logger.warn(`AI 返回结构不合法：${validated.error.message.slice(0, 200)}`)
        return {
          mapping: null,
          columns: [],
          message: 'AI 返回结构不符合约定，已回退到规则建议',
          model,
          usage: null,
        }
      }

      const mapping = this.sanitize(validated.data, input)
      return {
        mapping,
        columns: this.toSuggestions(mapping, input),
        message: null,
        model,
        usage: {
          promptTokens: body.usage?.prompt_tokens ?? null,
          completionTokens: body.usage?.completion_tokens ?? null,
        },
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError'
      this.logger.warn(`AI 表头识别失败：${(error as Error).message}`)
      return {
        mapping: null,
        columns: [],
        message: aborted
          ? `AI 响应超时（${this.timeoutMs()}ms），已回退到规则建议`
          : 'AI 服务不可用，已回退到规则建议',
        model,
        usage: null,
      }
    } finally {
      clearTimeout(timer)
    }
  }

  /** 丢弃越界列、非法目标与未知科目，避免 AI 输出污染映射。 */
  private sanitize(mapping: AiMappingResponse, input: AiSuggestInput): AiMappingResponse {
    const maxIndex = input.headers.length - 1
    const subjectIds = new Set(input.subjects.map((subject) => subject.id))
    const seen = new Set<number>()
    const columns: AiMappingResponse['columns'] = []

    for (const column of mapping.columns) {
      if (column.index < 0 || column.index > maxIndex || seen.has(column.index)) continue
      seen.add(column.index)
      const target = column.target.trim()
      if (target === 'student_no' || target === 'name' || target === 'ignore') {
        columns.push({ ...column, target })
        continue
      }
      if (target.startsWith('subject:')) {
        const subjectId = target.slice('subject:'.length)
        if (subjectIds.has(subjectId)) {
          columns.push({ ...column, target })
        }
      }
    }

    const subjects = mapping.subjects.filter((item) => subjectIds.has(item.subjectId))
    return { ...mapping, columns, subjects }
  }

  private toSuggestions(
    mapping: AiMappingResponse,
    input: AiSuggestInput,
  ): ImportSuggestion[] {
    return mapping.columns
      .map((column) => ({
        index: column.index,
        header: input.headers[column.index] ?? `列${column.index + 1}`,
        sample: input.samples[0]?.[column.index] ?? '',
        target: column.target,
        confidence: column.confidence ?? 'medium',
      }))
      .sort((a, b) => a.index - b.index)
  }

  private parseJson(content: string): unknown {
    const trimmed = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '')
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      return null
    }
  }

  private isEnabled() {
    const flag = (this.config.get<string>('AI_ENABLED') ?? '').toLowerCase()
    return (flag === 'true' || flag === '1') && Boolean(this.apiKey())
  }

  private apiKey() {
    return this.config.get<string>('AI_API_KEY') ?? ''
  }

  private baseUrl() {
    return this.config.get<string>('AI_BASE_URL')?.trim() || DEFAULT_BASE_URL
  }

  private model() {
    return this.config.get<string>('AI_MODEL')?.trim() || DEFAULT_MODEL
  }

  private timeoutMs() {
    const value = Number(this.config.get<string>('AI_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS)
    return Number.isFinite(value) && value >= 3000 ? value : DEFAULT_TIMEOUT_MS
  }
}
