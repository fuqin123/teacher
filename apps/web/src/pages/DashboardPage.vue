<template>
  <div v-if="!context.selectedExamId || !context.selectedClassId" class="empty-state">
    暂无考试或班级数据，请先在基础数据中准备名单并导入成绩。
  </div>

  <div v-else-if="query.isPending.value" class="loading-block">正在计算看板…</div>

  <div v-else-if="query.error.value" class="error-panel">
    {{ query.error.value.message }}
  </div>

  <template v-else-if="data">
    <div v-if="data.mode === 'subject'" class="page-note">
      <AppIcon name="info" />
      当前为任课老师单科视图：仅展示 {{ data.subject?.name }} 数据，不包含总分与其他科目。
    </div>

    <div class="kpi-grid">
      <div v-for="card in kpiCards" :key="card.label" class="card kpi">
        <div class="top">
          <span class="label">{{ card.label }}</span>
          <div class="icon" :class="card.color">
            <AppIcon :name="card.icon" />
          </div>
        </div>
        <div class="value">
          {{ card.value }}<small v-if="card.unit">{{ card.unit }}</small>
        </div>
        <div class="foot">
          <span v-if="card.trend" class="trend" :class="card.trend.kind">
            {{ card.trend.text }}
          </span>
          <span class="hint">{{ card.hint }}</span>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-head">
          <h3>{{ data.mode === 'subject' ? '本科平均分对比' : '各科平均分对比' }}</h3>
          <span class="chip gray">按科目满分</span>
          <div class="right">
            <span v-if="query.isFetching.value" class="chip gray">更新中</span>
          </div>
        </div>
        <div class="chart-box">
          <EChart :option="subjectChart" height="300px" />
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>{{ data.mode === 'subject' ? '本科历次趋势' : '历次考试总分趋势' }}</h3>
          <span class="chip mint">最近 {{ data.trend.length }} 场</span>
        </div>
        <div class="chart-box">
          <EChart :option="trendChart" height="300px" />
        </div>
      </div>
    </div>

    <div class="card mb-18">
      <div class="card-head">
        <h3>学生排名</h3>
        <span class="chip gray">{{ data.mode === 'subject' ? '按本科成绩排序' : '按总分排序' }}</span>
        <div class="right">
          <span class="hint">缺考学生不参与排名</span>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>名次</th>
              <th>学生</th>
              <th class="num">{{ data.mode === 'subject' ? '本科成绩' : '总分' }}</th>
              <th
                v-for="subject in data.mode === 'full' ? subjectColumns : []"
                :key="subject.subjectId"
                class="num"
              >
                {{ subject.subjectName }}
              </th>
              <th>名次变化</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in data.ranking" :key="row.studentId">
              <td>
                <span
                  v-if="row.classRank"
                  class="rank-badge"
                  :class="{ g1: row.classRank === 1, g2: row.classRank === 2, g3: row.classRank === 3 }"
                >{{ row.classRank }}</span>
                <span v-else class="muted">—</span>
              </td>
              <td>
                <span class="stu">
                  <span class="ava">{{ row.name.slice(0, 1) }}</span>{{ row.name }}
                </span>
              </td>
              <td class="num" style="font-weight: 700; color: var(--ink)">
                {{ scoreText(row.totalScore) }}
              </td>
              <td
                v-for="subject in data.mode === 'full' ? subjectColumns : []"
                :key="subject.subjectId"
                class="num"
              >
                <span v-if="findScore(row, subject.subjectId)?.isAbsent" class="muted">缺考</span>
                <span v-else>{{ scoreText(findScore(row, subject.subjectId)?.score ?? null) }}</span>
              </td>
              <td>
                <span v-if="row.rankDelta === null" class="delta flat">—</span>
                <span v-else-if="row.rankDelta > 0" class="delta up">↑ {{ row.rankDelta }}</span>
                <span v-else-if="row.rankDelta < 0" class="delta down">↓ {{ Math.abs(row.rankDelta) }}</span>
                <span v-else class="delta flat">—</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="data.ranking.length === 0" class="table-empty">暂无学生成绩</div>
      </div>
    </div>

    <div class="grid-2-even dashboard-bottom">
      <div class="card chart-card">
        <div class="card-head">
          <h3>{{ data.distribution.subjectName }} 分数段分布</h3>
          <span class="chip blue">10 分一段</span>
          <div class="right">
            <span class="hint">满分 {{ data.distribution.fullScore }} 分</span>
          </div>
        </div>
        <div class="chart-box fill">
          <EChart :option="distributionChart" height="100%" />
        </div>
        <div class="card-foot-note">
          共 {{ distributionTotal }} 人次参与分段 · 缺考不计入 · 区间左闭右开
        </div>
      </div>

      <div class="card chart-card">
        <div class="card-head">
          <h3>临界生提醒</h3>
          <span class="chip amber">±5 分内</span>
          <div class="right">
            <span class="hint">共 {{ data.borderline.length }} 人次</span>
          </div>
        </div>
        <div class="table-wrap borderline-wrap">
          <table>
            <thead>
              <tr>
                <th>学生</th>
                <th>科目</th>
                <th>目标线</th>
                <th class="num">当前分</th>
                <th class="num">差距</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in data.borderline" :key="`${item.studentId}-${item.subjectId}-${item.lineType}`">
                <td><b style="color: var(--ink)">{{ item.studentName }}</b></td>
                <td>{{ item.subjectName }}</td>
                <td>
                  <span class="chip" :class="item.lineType === 'excellent' ? 'mint' : 'amber'">
                    {{ item.lineType === 'excellent' ? '优秀线' : '及格线' }} {{ item.lineValue }}
                  </span>
                </td>
                <td class="num">{{ scoreText(item.score) }}</td>
                <td class="num" :style="{ color: item.gap >= 0 ? '#0A8F66' : '#D9264A', fontWeight: 700 }">
                  {{ item.gap > 0 ? '+' : '' }}{{ item.gap }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="data.borderline.length === 0" class="table-empty">当前没有临界生</div>
        </div>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import type { BorderlineItem, RankingRow, SubjectComparison } from '@scorelens/shared'
import AppIcon from '../components/AppIcon.vue'
import EChart from '../components/EChart.vue'
import { api } from '../api/client'
import { useContextStore } from '../stores/context'

const context = useContextStore()

const query = useQuery({
  queryKey: computed(
    () =>
      [
        'dashboard',
        context.selectedExamId,
        context.selectedClassId,
        context.selectedSubjectId,
      ] as const,
  ),
  queryFn: () =>
    api.getDashboard(
      context.selectedExamId,
      context.selectedClassId,
      context.selectedSubjectId || undefined,
    ),
  enabled: computed(() => Boolean(context.selectedExamId && context.selectedClassId)),
})

const data = computed(() => query.data.value)
const subjectColumns = computed<SubjectComparison[]>(() => data.value?.subjects ?? [])
const totalFull = computed(() =>
  (data.value?.subjects ?? [])
    .filter((subject) => subject.includedInTotal)
    .reduce((sum, subject) => sum + subject.fullScore, 0),
)

const averageDelta = computed(() => {
  const trend = data.value?.trend ?? []
  const currentIndex = trend.findIndex((item) => item.examId === data.value?.exam.id)
  if (currentIndex <= 0) return null
  const current = trend[currentIndex]?.classAverage
  const previous = trend[currentIndex - 1]?.classAverage
  if (current === null || previous === null || current === undefined || previous === undefined) {
    return null
  }
  return Math.round((current - previous) * 10) / 10
})

const kpiCards = computed(() => {
  if (!data.value) return []
  const kpis = data.value.kpis
  const modeSubject = data.value.mode === 'subject'
  const fullScore = modeSubject
    ? data.value.distribution.fullScore
    : totalFull.value
  const delta = averageDelta.value
  return [
    {
      label: modeSubject ? '本科平均分' : '班级总分平均分',
      value: scoreText(kpis.average),
      unit: ` / ${fullScore}`,
      icon: 'chart',
      color: 'blue',
      trend:
        delta === null
          ? null
          : {
              kind: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
              text: `较上场 ${delta > 0 ? '+' : ''}${delta}`,
            },
      hint: `vs 年级 ${scoreText(data.value.gradeAverageTotal)}`,
    },
    {
      label: modeSubject ? '本科及格率' : '总分及格率',
      value: scoreText(kpis.passRate),
      unit: '%',
      icon: 'check',
      color: 'mint',
      trend: null,
      hint: `完整参考 ${kpis.completeCount} 人`,
    },
    {
      label: modeSubject ? '本科优秀率' : '总分优秀率',
      value: scoreText(kpis.excellentRate),
      unit: '%',
      icon: 'award',
      color: 'amber',
      trend: null,
      hint: `优秀线 ${kpis.excellentLine} 分`,
    },
    {
      label: '参考人数',
      value: kpis.participantCount,
      unit: '人',
      icon: 'users',
      color: 'violet',
      trend: null,
      hint: `完整 ${kpis.completeCount} 人 · 缺考 ${kpis.absentCount} 人`,
    },
  ]
})

const chartBase = {
  textStyle: { fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif' },
  color: ['#3B7CFF', '#10B981', '#F59E0B', '#8B5CF6'],
}

const subjectChart = computed(() => {
  const subjects = data.value?.subjects ?? []
  const crowded = subjects.length > 6
  return {
    ...chartBase,
    tooltip: { trigger: 'axis' },
    legend: { top: 4, right: 8, itemWidth: 12, itemHeight: 8, textStyle: { color: '#475569', fontSize: 11 } },
    grid: { left: 42, right: 18, top: 38, bottom: crowded ? 46 : 30 },
    xAxis: {
      type: 'category',
      data: subjects.map((subject) => subject.subjectName),
      axisLabel: {
        color: '#94A3B8',
        fontSize: 11,
        interval: 0,
        rotate: crowded ? 30 : 0,
        margin: 10,
      },
      axisLine: { lineStyle: { color: '#E8EDF4' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#94A3B8', fontSize: 11 },
      splitLine: { lineStyle: { color: '#F1F5F9' } },
    },
    series: [
      {
        name: '本班平均分',
        type: 'bar',
        barWidth: 16,
        itemStyle: { color: '#3B7CFF', borderRadius: [6, 6, 0, 0] },
        data: subjects.map((subject) => subject.classAverage ?? 0),
      },
      {
        name: '年级平均分',
        type: 'bar',
        barWidth: 16,
        itemStyle: { color: '#C7DCFF', borderRadius: [6, 6, 0, 0] },
        data: subjects.map((subject) => subject.gradeAverage ?? 0),
      },
    ],
  }
})

const trendChart = computed(() => {
  const trend = data.value?.trend ?? []
  return {
    ...chartBase,
    tooltip: { trigger: 'axis' },
    legend: { top: 4, right: 8, itemWidth: 12, itemHeight: 8, textStyle: { color: '#475569', fontSize: 11 } },
    grid: { left: 46, right: 18, top: 38, bottom: 28 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trend.map((item) => item.examName),
      axisLabel: {
        color: '#94A3B8',
        fontSize: 11,
        interval: 0,
        rotate: trend.length > 4 ? 20 : 0,
      },
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
        name: '本班平均分',
        type: 'line',
        smooth: true,
        symbolSize: 7,
        lineStyle: { width: 3, color: '#10B981' },
        itemStyle: { color: '#10B981', borderWidth: 2, borderColor: '#fff' },
        areaStyle: { color: 'rgba(16,185,129,.12)' },
        data: trend.map((item) => item.classAverage ?? 0),
      },
      {
        name: '年级平均分',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        lineStyle: { width: 2, type: 'dashed', color: '#94A3B8' },
        itemStyle: { color: '#94A3B8' },
        data: trend.map((item) => item.gradeAverage ?? 0),
      },
    ],
  }
})

const distributionChart = computed(() => {
  const bins = data.value?.distribution.bins ?? []
  const crowded = bins.length > 8
  return {
    ...chartBase,
    tooltip: { trigger: 'axis' },
    grid: { left: 44, right: 20, top: 34, bottom: crowded ? 52 : 36 },
    xAxis: {
      type: 'category',
      data: bins.map((bin) => bin.label),
      axisLabel: {
        color: '#94A3B8',
        fontSize: 10,
        interval: 0,
        // 段数多时斜排，并留足底部空间，避免刻度文字被裁掉
        rotate: crowded ? 30 : 0,
        margin: 10,
      },
      axisLine: { lineStyle: { color: '#E8EDF4' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      name: '人数',
      nameGap: 14,
      nameTextStyle: { color: '#94A3B8', fontSize: 10, align: 'right' },
      minInterval: 1,
      axisLabel: { color: '#94A3B8', fontSize: 11 },
      splitLine: { lineStyle: { color: '#F1F5F9' } },
    },
    series: [
      {
        type: 'bar',
        barWidth: 14,
        barMaxWidth: 22,
        data: bins.map((bin) => bin.count),
        itemStyle: { color: '#3B7CFF', borderRadius: [5, 5, 0, 0] },
        label: {
          show: bins.length <= 14,
          position: 'top',
          color: '#64748B',
          fontSize: 10,
        },
      },
    ],
  }
})

const distributionTotal = computed(() =>
  (data.value?.distribution.bins ?? []).reduce((sum, bin) => sum + bin.count, 0),
)

function scoreText(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(digits)
}

function findScore(row: RankingRow, subjectId: string) {
  return row.scores.find((item) => item.subjectId === subjectId)
}
</script>