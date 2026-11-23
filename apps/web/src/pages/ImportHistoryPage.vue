<template>
  <div class="card">
    <div class="card-head">
      <h3>导入记录</h3>
      <span class="chip gray">{{ list.length }} 个批次</span>
      <div class="right">
        <button class="btn ghost sm" :disabled="query.isFetching.value" @click="query.refetch()">
          刷新
        </button>
        <button class="btn primary sm" @click="router.push('/imports/new')">新建导入</button>
      </div>
    </div>

    <div v-if="query.isPending.value" class="loading-block">正在加载导入记录…</div>
    <div v-else-if="query.error.value" class="error-panel">{{ query.error.value.message }}</div>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>文件</th>
            <th>班级</th>
            <th>考试</th>
            <th>操作人</th>
            <th>时间</th>
            <th>结果</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="batch in list" :key="batch.id">
            <td style="font-weight: 600; color: var(--ink); max-width: 280px; overflow: hidden; text-overflow: ellipsis">
              {{ batch.fileName }}
            </td>
            <td>{{ batch.className ?? '—' }}</td>
            <td>{{ batch.examName ?? '—' }}</td>
            <td>{{ batch.createdByName }}</td>
            <td>{{ formatTime(batch.createdAt) }}</td>
            <td>
              <span class="chip" :class="statusClass(batch.status)">{{ statusText(batch.status) }}</span>
              <div v-if="batch.stats" class="hint" style="margin-top: 3px">
                {{ batch.stats.inserted ?? 0 }} 新增 · {{ batch.stats.updated ?? 0 }} 更新
              </div>
            </td>
            <td>
              <button class="btn ghost sm" @click="openDetail(batch.id)">查看映射快照</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="list.length === 0" class="table-empty">还没有导入记录</div>
    </div>
  </div>

  <div v-if="selectedId" class="card mt-16">
    <div class="card-head">
      <h3>批次详情</h3>
      <span class="chip blue">只读快照</span>
      <div class="right">
        <button class="btn ghost sm" @click="selectedId = ''">收起</button>
      </div>
    </div>
    <div v-if="detailQuery.isPending.value" class="loading-block">加载中…</div>
    <div v-else-if="detailQuery.error.value" class="error-panel">{{ detailQuery.error.value.message }}</div>
    <template v-else-if="detail">
      <div class="stat-row" style="padding-top: 14px">
        <div class="item"><b>{{ detail.sheetName ?? '—' }}</b>工作表</div>
        <div class="item"><b>{{ detail.stats?.totalRows ?? '—' }}</b>数据行</div>
        <div class="item"><b>{{ detail.stats?.absentCount ?? 0 }}</b>缺考</div>
        <div class="item"><b>{{ detail.stats?.errorRows ?? 0 }}</b>异常行</div>
      </div>
      <div class="pre-block">{{ mappingText }}</div>
      <div class="hint" style="padding: 0 24px 18px">
        撤销导入将在后续版本开放；当前版本请通过重新导入更正数据。
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'
import type { ImportStatus } from '@scorelens/shared'
import { api } from '../api/client'

const router = useRouter()
const selectedId = ref('')

const query = useQuery({
  queryKey: ['imports'] as const,
  queryFn: () => api.getImports(),
})
const list = computed(() => query.data.value ?? [])

const detailQuery = useQuery({
  queryKey: computed(() => ['import-detail', selectedId.value] as const),
  queryFn: () => api.getImport(selectedId.value),
  enabled: computed(() => Boolean(selectedId.value)),
})
const detail = computed(() => detailQuery.data.value)
const mappingText = computed(() =>
  detail.value?.mapping ? JSON.stringify(detail.value.mapping, null, 2) : '暂无映射快照',
)

function openDetail(id: string) {
  selectedId.value = id
}

function statusText(status: ImportStatus) {
  return (
    {
      uploaded: '已上传',
      parsed: '已解析',
      mapping_confirmed: '已确认映射',
      validated: '校验通过',
      committed: '已入库',
      failed: '失败',
    } as const
  )[status]
}

function statusClass(status: ImportStatus) {
  if (status === 'committed') return 'mint'
  if (status === 'failed') return 'rose'
  if (status === 'validated') return 'blue'
  return 'amber'
}

function formatTime(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
</script>