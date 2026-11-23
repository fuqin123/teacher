<template>
  <div v-if="!context.selectedExamId" class="empty-state">
    暂无考试数据，请先导入一场考试成绩。
  </div>
  <div v-else-if="query.isPending.value" class="loading-block">正在汇总年级数据…</div>
  <div v-else-if="query.error.value" class="error-panel">{{ query.error.value.message }}</div>

  <template v-else-if="data">
    <div class="page-note">
      <AppIcon name="info" />
      年级主任视图：当前考试为「{{ data.exam.name }}」，年级总分平均分 {{ scoreText(data.gradeAverageTotal) }}。
    </div>

    <div class="card mb-18">
      <div class="card-head">
        <h3>各班总分平均分对比</h3>
        <span class="chip blue">{{ data.classes.length }} 个班</span>
        <div class="right"><span class="hint">{{ data.exam.termName }}</span></div>
      </div>
      <div class="chart-box tall">
        <EChart :option="classChart" height="340px" />
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>学科贡献热力表</h3>
        <span class="sub">班级单科得分率 − 年级单科得分率（百分点） · 绿 = 强科 · 红 = 弱科</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>班级</th>
              <th class="num">总分均分</th>
              <th class="num">及格率</th>
              <th class="num">优秀率</th>
              <th v-for="subject in data.subjects" :key="subject.id" class="num">
                {{ subject.name }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="klass in data.classes" :key="klass.classId">
              <td style="font-weight: 700; color: var(--ink)">{{ klass.className }}</td>
              <td class="num">{{ scoreText(klass.avgTotal) }}</td>
              <td class="num">{{ scoreText(klass.passRate) }}%</td>
              <td class="num">{{ scoreText(klass.excellentRate) }}%</td>
              <td v-for="subject in klass.subjects" :key="subject.subjectId" class="num">
                <span class="heat-cell" :class="heatClass(subject.diffPp)">
                  {{ formatDiff(subject.diffPp) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="data.classes.length === 0" class="table-empty">暂无班级成绩</div>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import AppIcon from '../components/AppIcon.vue'
import EChart from '../components/EChart.vue'
import { api } from '../api/client'
import { useContextStore } from '../stores/context'

const context = useContextStore()

const query = useQuery({
  queryKey: computed(() => ['grade-compare', context.selectedExamId] as const),
  queryFn: () => api.getGradeCompare(context.selectedExamId),
  enabled: computed(() => Boolean(context.selectedExamId)),
})

const data = computed(() => query.data.value)
const classChart = computed(() => {
  const classes = data.value?.classes ?? []
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: classes.map((item) => item.className),
      axisLabel: { color: '#94A3B8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#E8EDF4' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: '#94A3B8', fontSize: 11 },
      splitLine: { lineStyle: { color: '#F1F5F9' } },
    },
    series: [
      {
        name: '总分平均分',
        type: 'bar',
        barWidth: 22,
        data: classes.map((item) => item.avgTotal ?? 0),
        itemStyle: { color: '#3B7CFF', borderRadius: [6, 6, 0, 0] },
      },
    ],
  }
})

function scoreText(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function heatClass(value: number | null | undefined) {
  if (value === null || value === undefined) return 'h-mid'
  if (value >= 1.5) return 'h-good'
  if (value <= -1.5) return 'h-bad'
  return 'h-mid'
}

function formatDiff(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`
}
</script>