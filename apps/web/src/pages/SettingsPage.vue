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
        <span class="chip" :class="ai?.enabled ? 'violet' : 'gray'">
          {{ ai?.enabled ? '已启用' : '未启用' }}
        </span>
      </div>
      <div class="setting-row" style="padding: 14px 20px; border-bottom: 1px solid #f1f5f9">
        <div>
          <div style="font-size: 13.5px; font-weight: 600">接入方式</div>
          <div class="hint">
            任意 OpenAI 兼容接口（DeepSeek / 通义 / 智谱等），配置 AI_BASE_URL 与 AI_API_KEY 即可
          </div>
        </div>
        <span class="chip gray right">{{ ai?.endpointHost ?? '未配置' }}</span>
      </div>
      <div class="setting-row" style="padding: 14px 20px; border-bottom: 1px solid #f1f5f9">
        <div>
          <div style="font-size: 13.5px; font-weight: 600">当前模型</div>
          <div class="hint">只发送表头与 3 行脱敏样例，不发送完整名单与成绩</div>
        </div>
        <span class="chip blue right">{{ ai?.model ?? '—' }}</span>
      </div>
      <div class="setting-row" style="padding: 14px 20px">
        <div>
          <div style="font-size: 13.5px; font-weight: 600">失败处理</div>
          <div class="hint">超时、报错或返回不合法时自动回退到规则建议，导入不中断</div>
        </div>
        <span class="chip mint right">自动降级</span>
      </div>
    </div>
  </div>

  <div class="card mt-16">
    <div class="card-head"><h3>系统信息</h3><span class="chip gray">v0.5.0</span></div>
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
      当前 0.5.0 已覆盖：AI 表头识别（可降级）、管理员基础数据维护、班级看板、年级对比、学生档案、成绩导入与导入历史。
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { AiStatusResponse } from '@scorelens/shared'
import { api } from '../api/client'
import { useContextStore } from '../stores/context'

const context = useContextStore()
const ai = ref<AiStatusResponse | null>(null)

onMounted(async () => {
  try {
    ai.value = await api.getAiStatus()
  } catch {
    ai.value = null
  }
})
</script>
