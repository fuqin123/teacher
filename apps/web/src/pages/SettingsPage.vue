<template>
  <div class="grid-2-even">
    <div class="card">
      <div class="card-head"><h3>统计口径</h3></div>
      <div class="setting-row" style="padding: 14px 20px; border-bottom: 1px solid #f1f5f9">
        <div>
          <div style="font-size: 13.5px; font-weight: 600">及格线 / 优秀线</div>
          <div class="hint">单科满分 × 60% / 80%；湖南初中各科满分在考试配置中设置</div>
        </div>
        <span class="chip blue right">60% / 80%</span>
      </div>
      <div class="setting-row" style="padding: 14px 20px; border-bottom: 1px solid #f1f5f9">
        <div>
          <div style="font-size: 13.5px; font-weight: 600">缺考口径</div>
          <div class="hint">单科统计剔除；总分排名剔除并标注</div>
        </div>
        <span class="chip amber right">已启用</span>
      </div>
      <div class="setting-row" style="padding: 14px 20px">
        <div>
          <div style="font-size: 13.5px; font-weight: 600">名次规则</div>
          <div class="hint">同分同名次，下一名跳号；与上一场考试比较</div>
        </div>
        <span class="chip mint right">RANK</span>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>AI 表头识别</h3>
        <span class="chip" :class="aiForm.enabled && ai?.hasApiKey ? 'violet' : 'gray'">
          {{ aiForm.enabled && ai?.hasApiKey ? '已启用' : '未启用' }}
        </span>
      </div>

      <div v-if="!loading" style="padding: 16px 20px 4px">
        <label class="checkbox-row" style="margin-bottom: 14px">
          <input v-model="aiForm.enabled" type="checkbox" />
          启用 AI 识别（关闭时使用规则建议 + 人工映射）
        </label>

        <div class="form-grid two" style="gap: 12px">
          <div class="field" style="grid-column: 1 / -1">
            <label>接口地址（Base URL）</label>
            <input
              v-model.trim="aiForm.baseUrl"
              class="input"
              placeholder="https://api.deepseek.com/v1"
            />
            <span class="hint">OpenAI 兼容接口，需包含版本前缀（如 /v1）</span>
          </div>
          <div class="field">
            <label>模型</label>
            <input v-model.trim="aiForm.model" class="input" placeholder="deepseek-chat" />
          </div>
          <div class="field">
            <label>超时（毫秒）</label>
            <input v-model.number="aiForm.timeoutMs" type="number" min="3000" class="input" />
          </div>
          <div class="field" style="grid-column: 1 / -1">
            <label>API Key</label>
            <input
              v-model.trim="aiForm.apiKey"
              type="password"
              class="input"
              autocomplete="new-password"
              :placeholder="ai?.hasApiKey ? `已保存 ${ai.apiKeyMasked}，留空表示不修改` : 'sk-...'"
            />
            <span class="hint">Key 以 AES-256-GCM 加密保存在本机数据库，接口只返回掩码</span>
          </div>
        </div>

        <div
          v-if="message"
          class="page-note"
          :style="messageError ? 'margin-top: 14px; color: #b91c3c; background: #fef2f4; border-color: #fbd0d9' : 'margin-top: 14px'"
        >
          {{ message }}
        </div>

        <div class="card-foot" style="padding: 16px 0 0">
          <button class="btn ghost" :disabled="busy" @click="resetAi">恢复环境变量配置</button>
          <button class="btn" :disabled="busy" @click="testAi">
            {{ testing ? '正在测试…' : '测试连接' }}
          </button>
          <button class="btn primary" :disabled="busy" @click="saveAi">
            {{ saving ? '正在保存…' : '保存配置' }}
          </button>
        </div>

        <div class="hint" style="margin-top: 10px">
          配置来源：{{ ai?.source === 'database' ? '管理员界面（数据库）' : '环境变量' }}
          <span v-if="ai?.updatedAt"> · 更新于 {{ formatTime(ai.updatedAt) }}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="card mt-16">
    <div class="card-head"><h3>系统信息</h3><span class="chip gray">v0.6.1</span></div>
    <div class="setting-row" style="padding: 14px 20px; border-bottom: 1px solid #f1f5f9">
      <div>
        <div style="font-size: 13.5px; font-weight: 600">当前学期</div>
        <div class="hint">{{ context.currentTerm?.name ?? '未设置' }}</div>
      </div>
      <span class="chip blue right">{{ context.classes.length }} 个班</span>
    </div>
    <div class="setting-row" style="padding: 14px 20px; border-bottom: 1px solid #f1f5f9">
      <div>
        <div style="font-size: 13.5px; font-weight: 600">适用学段</div>
        <div class="hint">湖南初中（七、八、九年级），文化科目按考试单独配置满分</div>
      </div>
      <span class="chip violet right">初中</span>
    </div>
    <div class="setting-row" style="padding: 14px 20px">
      <div>
        <div style="font-size: 13.5px; font-weight: 600">部署基线</div>
        <div class="hint">Windows 本机开发 · 本地 SQLite · Ubuntu 24.04 可用 Docker Compose</div>
      </div>
      <span class="chip violet right">本地优先</span>
    </div>
  </div>

  <div class="card mt-16">
    <div class="card-head"><h3>后续版本</h3><span class="chip gray">Roadmap</span></div>
    <div class="tag-list" style="padding-top: 14px">
      <span class="chip blue">映射模板复用</span>
      <span class="chip amber">导入撤销（24h）</span>
      <span class="chip amber">成绩更正与审计</span>
      <span class="chip violet">汇总表与性能优化</span>
      <span class="chip mint">导出 Excel / 打印</span>
    </div>
    <div class="hint" style="padding: 0 24px 20px">
      当前 0.6.1 已覆盖：管理员可配置 AI 接口、多级表头成绩表导入、标准模板下载、基础数据维护、班级看板与分析。
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { AiSettingsView } from '@scorelens/shared'
import { api } from '../api/client'
import { useContextStore } from '../stores/context'

const context = useContextStore()

const ai = ref<AiSettingsView | null>(null)
const loading = ref(true)
const busy = ref(false)
const saving = ref(false)
const testing = ref(false)
const message = ref('')
const messageError = ref(false)
const aiForm = reactive({
  enabled: false,
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  timeoutMs: 25000,
  apiKey: '',
})

onMounted(async () => {
  try {
    applyView(await api.getAiSettings())
  } catch (error) {
    setMessage(error instanceof Error ? error.message : '加载 AI 配置失败', true)
  } finally {
    loading.value = false
  }
})

function applyView(view: AiSettingsView) {
  ai.value = view
  aiForm.enabled = view.enabled
  aiForm.baseUrl = view.baseUrl
  aiForm.model = view.model
  aiForm.timeoutMs = view.timeoutMs
  aiForm.apiKey = ''
}

function setMessage(text: string, isError = false) {
  message.value = text
  messageError.value = isError
}

async function saveAi() {
  if (saving.value) return
  saving.value = true
  busy.value = true
  try {
    const view = await api.saveAiSettings({
      enabled: aiForm.enabled,
      baseUrl: aiForm.baseUrl,
      model: aiForm.model,
      timeoutMs: Number(aiForm.timeoutMs),
      apiKey: aiForm.apiKey || undefined,
    })
    applyView(view)
    setMessage('已保存。后续导入会立即使用新配置，无需重启服务。')
  } catch (error) {
    setMessage(error instanceof Error ? error.message : '保存失败', true)
  } finally {
    saving.value = false
    busy.value = false
  }
}

async function testAi() {
  if (testing.value) return
  testing.value = true
  busy.value = true
  try {
    const result = await api.testAiSettings({
      baseUrl: aiForm.baseUrl,
      model: aiForm.model,
      apiKey: aiForm.apiKey || undefined,
    })
    setMessage(
      `${result.ok ? '✓' : '✗'} ${result.message}（耗时 ${result.latencyMs}ms · 模型 ${result.model}）`,
      !result.ok,
    )
  } catch (error) {
    setMessage(error instanceof Error ? error.message : '测试失败', true)
  } finally {
    testing.value = false
    busy.value = false
  }
}

async function resetAi() {
  if (busy.value) return
  if (!window.confirm('确定清除界面保存的 AI 配置，改用环境变量吗？')) return
  busy.value = true
  try {
    applyView(await api.resetAiSettings())
    setMessage('已恢复为环境变量配置。')
  } catch (error) {
    setMessage(error instanceof Error ? error.message : '操作失败', true)
  } finally {
    busy.value = false
  }
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}
</script>
