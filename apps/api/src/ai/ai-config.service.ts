import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AiSettingsInput,
  AiSettingsView,
  AiStatusResponse,
  AiTestResult,
} from '@scorelens/shared'
import { PrismaService } from '../prisma/prisma.service'
import { createSecretBox, maskSecret } from '../common/secret-box'

const SETTING_KEY = 'ai_config'
const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-chat'
const DEFAULT_TIMEOUT_MS = 25000
const TEST_TIMEOUT_MS = 12000

interface StoredAiConfig {
  enabled: boolean
  baseUrl: string
  model: string
  timeoutMs: number
  apiKeyEnc: string | null
  updatedAt: string
  updatedBy: string | null
}

export interface AiRuntimeConfig {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  source: 'database' | 'environment'
}

/**
 * AI 配置解析：管理员在界面保存的配置（app_settings.ai_config）优先，
 * 未保存时回退到环境变量，均未配置则视为未启用。
 * API Key 以 AES-256-GCM 加密落库，任何接口都不返回明文。
 */
@Injectable()
export class AiConfigService {
  private readonly logger = new Logger(AiConfigService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async runtime(): Promise<AiRuntimeConfig> {
    const stored = await this.readStored()
    if (stored) {
      const apiKey = stored.apiKeyEnc ? this.box().decrypt(stored.apiKeyEnc) ?? '' : ''
      return {
        enabled: stored.enabled && Boolean(apiKey),
        baseUrl: stored.baseUrl || DEFAULT_BASE_URL,
        apiKey,
        model: stored.model || DEFAULT_MODEL,
        timeoutMs: stored.timeoutMs || DEFAULT_TIMEOUT_MS,
        source: 'database',
      }
    }
    return this.envConfig()
  }

  async view(): Promise<AiSettingsView> {
    const stored = await this.readStored()
    if (stored) {
      const apiKey = stored.apiKeyEnc ? this.box().decrypt(stored.apiKeyEnc) ?? '' : ''
      return {
        enabled: stored.enabled,
        baseUrl: stored.baseUrl,
        model: stored.model,
        timeoutMs: stored.timeoutMs,
        hasApiKey: Boolean(apiKey),
        apiKeyMasked: apiKey ? maskSecret(apiKey) : null,
        source: 'database',
        updatedAt: stored.updatedAt,
      }
    }
    const env = this.envConfig()
    return {
      enabled: env.enabled,
      baseUrl: env.baseUrl,
      model: env.model,
      timeoutMs: env.timeoutMs,
      hasApiKey: Boolean(env.apiKey),
      apiKeyMasked: env.apiKey ? maskSecret(env.apiKey) : null,
      source: 'environment',
      updatedAt: null,
    }
  }

  async status(): Promise<AiStatusResponse> {
    const runtime = await this.runtime()
    let endpointHost: string | null = null
    try {
      endpointHost = new URL(runtime.baseUrl).host
    } catch {
      endpointHost = null
    }
    return {
      enabled: runtime.enabled,
      model: runtime.enabled ? runtime.model : null,
      endpointHost,
      source: runtime.source,
    }
  }

  async save(input: AiSettingsInput, userId: string): Promise<AiSettingsView> {
    const existing = await this.readStored()
    // 留空表示沿用已保存的 Key；显式传空字符串也按“不修改”处理
    const apiKeyEnc = input.apiKey
      ? this.box().encrypt(input.apiKey)
      : (existing?.apiKeyEnc ?? null)

    const payload: StoredAiConfig = {
      enabled: input.enabled,
      baseUrl: input.baseUrl.replace(/\/+$/, ''),
      model: input.model,
      timeoutMs: input.timeoutMs,
      apiKeyEnc,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    }

    await this.prisma.appSetting.upsert({
      where: { key: SETTING_KEY },
      update: { valueJson: payload as unknown as object },
      create: { key: SETTING_KEY, valueJson: payload as unknown as object },
    })
    return this.view()
  }

  /** 清除界面配置，回退到环境变量。 */
  async reset(): Promise<AiSettingsView> {
    await this.prisma.appSetting.deleteMany({ where: { key: SETTING_KEY } })
    return this.view()
  }

  /**
   * 连通性测试：先用 GET /models（OpenAI 兼容接口普遍支持），
   * 不支持时退回一次最小的 chat/completions 调用。
   */
  async test(overrides?: {
    baseUrl?: string
    model?: string
    apiKey?: string
  }): Promise<AiTestResult> {
    const runtime = await this.runtime()
    const baseUrl = (overrides?.baseUrl || runtime.baseUrl).replace(/\/+$/, '')
    const model = overrides?.model || runtime.model
    const apiKey = overrides?.apiKey || runtime.apiKey

    if (!apiKey) {
      return { ok: false, latencyMs: 0, message: '请先填写 API Key', model }
    }

    const started = Date.now()
    try {
      const modelsResponse = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      })
      if (modelsResponse.ok) {
        const count = await this.countModels(modelsResponse)
        return {
          ok: true,
          latencyMs: Date.now() - started,
          message: count ? `连接成功，可用模型 ${count} 个` : '连接成功',
          model,
        }
      }
      if (modelsResponse.status !== 404 && modelsResponse.status !== 405) {
        return {
          ok: false,
          latencyMs: Date.now() - started,
          message: this.describeStatus(modelsResponse.status),
          model,
        }
      }
      // 部分兼容服务没有 /models，退回一次最小补全
      const chatResponse = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          max_tokens: 1,
          temperature: 0,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      })
      if (chatResponse.ok) {
        return {
          ok: true,
          latencyMs: Date.now() - started,
          message: '连接成功（已通过一次最小补全验证）',
          model,
        }
      }
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: this.describeStatus(chatResponse.status),
        model,
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error)
      const cause = (error as { cause?: { code?: string } })?.cause?.code
      const timeout = error instanceof Error && error.name === 'TimeoutError'
      const message = timeout
        ? `连接超时（>${TEST_TIMEOUT_MS}ms），请检查接口地址与网络`
        : raw.includes('fetch failed') || cause === 'ECONNREFUSED' || cause === 'ENOTFOUND'
          ? '无法连接到接口地址，请检查 Base URL 是否正确、服务器能否访问外网'
          : `连接失败：${raw}`
      this.logger.warn(`AI 连通性测试失败：${message}`)
      return { ok: false, latencyMs: Date.now() - started, message, model }
    }
  }

  private async countModels(response: Response): Promise<number | null> {
    try {
      const body = (await response.json()) as { data?: unknown[] }
      return Array.isArray(body.data) ? body.data.length : null
    } catch {
      return null
    }
  }

  private describeStatus(status: number): string {
    if (status === 401) return '认证失败（401），请检查 API Key 是否正确'
    if (status === 403) return '无访问权限（403），请检查 Key 的权限或额度'
    if (status === 404) return '接口地址不存在（404），请检查 Base URL 是否包含 /v1'
    if (status === 429) return '请求过于频繁（429），请稍后重试'
    if (status >= 500) return `服务端错误（${status}），请稍后重试或更换服务商`
    return `接口返回异常状态 ${status}`
  }

  private async readStored(): Promise<StoredAiConfig | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SETTING_KEY } })
    if (!row) return null
    const value = row.valueJson as unknown
    if (!value || typeof value !== 'object') return null
    const record = value as Partial<StoredAiConfig>
    return {
      enabled: Boolean(record.enabled),
      baseUrl: typeof record.baseUrl === 'string' ? record.baseUrl : DEFAULT_BASE_URL,
      model: typeof record.model === 'string' ? record.model : DEFAULT_MODEL,
      timeoutMs:
        typeof record.timeoutMs === 'number' && record.timeoutMs >= 3000
          ? record.timeoutMs
          : DEFAULT_TIMEOUT_MS,
      apiKeyEnc: typeof record.apiKeyEnc === 'string' ? record.apiKeyEnc : null,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
      updatedBy: typeof record.updatedBy === 'string' ? record.updatedBy : null,
    }
  }

  private envConfig(): AiRuntimeConfig {
    const flag = (this.config.get<string>('AI_ENABLED') ?? '').toLowerCase()
    const apiKey = this.config.get<string>('AI_API_KEY') ?? ''
    return {
      enabled: (flag === 'true' || flag === '1') && Boolean(apiKey),
      baseUrl: this.config.get<string>('AI_BASE_URL')?.trim() || DEFAULT_BASE_URL,
      apiKey,
      model: this.config.get<string>('AI_MODEL')?.trim() || DEFAULT_MODEL,
      timeoutMs: this.readTimeout(),
      source: 'environment',
    }
  }

  private readTimeout() {
    const value = Number(this.config.get<string>('AI_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS)
    return Number.isFinite(value) && value >= 3000 ? value : DEFAULT_TIMEOUT_MS
  }

  private box() {
    return createSecretBox(this.config.get<string>('SESSION_SECRET') ?? '')
  }
}
